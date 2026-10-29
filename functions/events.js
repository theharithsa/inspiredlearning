import { cleanRateCounters } from "./rate-limit.js";
import { observeBacklog } from "./outbox-health.js";
import { functionProfiles } from "./config.js";
import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore } from "firebase-admin/firestore";
import { SpanKind } from "@opentelemetry/api";
import {
  measured,
  dependency,
  recordOutboxHealth,
  recordDeliveryLag,
  token,
  log,
  dynatraceUrl,
  dynatraceHeaders,
} from "./monitor.js";
// Dynatrace rejects these payloads permanently; retrying only burns quota and hides the defect.
const PERMANENT_FAILURES = new Set([400, 404, 413, 415]);
export const MAX_DELIVERY_ATTEMPTS = 20;
export function eventRecord(name, actor, c, fields = {}) {
  const id = randomUUID();
  return {
    status: "pending",
    attempts: 0,
    nextAttemptAt: 0,
    leaseUntil: 0,
    payload: {
      specversion: "1.0",
      id,
      source: "inspiredlearning",
      type: "com.inspiredlearning." + name,
      time: new Date().toISOString(),
      data: {
        "event.id": id,
        "event.name": name,
        "event.provider": "inspiredlearning",
        "event.schema.version": "1.1",
        "event.authority": "server-confirmed",
        "event.source": "backend",
        "transaction.id": c.transactionId,
        trace_id: c.traceId,
        span_id: c.spanId,
        "actor.id": actor.uid,
        ...(actor.apiTokenId ? { "api.token.id": actor.apiTokenId } : {}),
        ...(actor.email ? { "actor.email": actor.email } : {}),
        ...fields,
      },
    },
    createdAt: FieldValue.serverTimestamp(),
  };
}
export function queue(tx, db, name, actor, c, fields) {
  const ref = db.collection("learningTelemetry").doc();
  tx.create(ref, eventRecord(name, actor, c, fields));
}
export async function deliver(ref) {
  const db = ref.firestore,
    lease = randomUUID(),
    now = Date.now();
  const row = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data();
    if (
      !d ||
      d.status === "delivered" ||
      d.status === "failed" ||
      d.leaseUntil > now ||
      d.nextAttemptAt > now
    )
      return null;
    tx.update(ref, {
      lease,
      leaseUntil: now + 60000,
      attempts: FieldValue.increment(1),
    });
    return d;
  });
  if (!row) return;
  await measured(
    "business.event.deliver",
    { uid: row.payload.data["actor.id"] },
    async () => {
      let status = 0;
      try {
        const r = await dependency(
          "http.client.bizevents",
          { "http.request.method": "POST" },
          async (span) => {
            const response = await fetch(
              dynatraceUrl("/api/v2/bizevents/ingest"),
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/cloudevents+json",
                  ...dynatraceHeaders(),
                },
                body: JSON.stringify(row.payload),
                signal: AbortSignal.timeout(7000),
              },
            );
            span.setAttribute("http.response.status_code", response.status);
            if (response.status >= 400) span.setStatus({ code: 2 });
            return response;
          },
        );
        status = r.status;
      } catch {}
      const delivered = status === 202;
      const deadLetter =
        !delivered &&
        (PERMANENT_FAILURES.has(status) ||
          (row.attempts || 0) + 1 >= MAX_DELIVERY_ATTEMPTS);
      const outcome = delivered ? "delivered" : deadLetter ? "failed" : "retry";
      const committed = await db.runTransaction(async (tx) => {
        const current = await tx.get(ref);
        if (current.data()?.lease !== lease) return false;
        tx.update(ref, {
          status: delivered ? "delivered" : deadLetter ? "failed" : "pending",
          lastStatus: status,
          leaseUntil: 0,
          nextAttemptAt:
            delivered || deadLetter
              ? 0
              : Date.now() +
                Math.min(3600000, 30000 * 2 ** Math.min(row.attempts || 0, 7)),
          ...(delivered ? { deliveredAt: FieldValue.serverTimestamp() } : {}),
          ...(deadLetter ? { failedAt: FieldValue.serverTimestamp() } : {}),
        });
        return true;
      });
      if (committed && delivered && row.createdAt?.toMillis)
        recordDeliveryLag(
          Math.max(0, (Date.now() - row.createdAt.toMillis()) / 1000),
        );
      log(
        delivered ? "INFO" : deadLetter ? "ERROR" : "WARN",
        "Business event delivery",
        {
          "event.id": row.payload.id,
          "event.type": row.payload.type,
          "transaction.id": row.payload.data["transaction.id"],
          "delivery.attempts": (row.attempts || 0) + 1,
          outcome,
          status,
        },
      );
    },
    undefined,
    undefined,
    { kind: SpanKind.CONSUMER, attributes: { "event.type": row.payload.type } },
  );
}
const options = { ...functionProfiles.delivery, secrets: [token] };
export const deliverLearningEvent = onDocumentCreated(
  { ...options, document: "learningTelemetry/{id}", retry: true },
  (e) => deliver(e.data.ref),
);
export const retryLearningEvents = onSchedule(
  {
    ...functionProfiles.recovery,
    secrets: [token],
    schedule: "every 5 minutes",
  },
  async () => {
    const db = getFirestore(),
      started = Date.now();
    // Leave time for erasure recovery: 50 slow deliveries (7s timeout each) exceed timeoutSeconds.
    const budgetMs = (options.timeoutSeconds * 1000) / 2;
    const pending = await db
      .collection("learningPrivacy")
      .where("state", "==", "erasing")
      .limit(10)
      .get();
    const { completeErasure } = await import("./erasure.js");
    for (const row of pending.docs) {
      if (Date.now() - started > budgetMs) break;
      try {
        await measured(
          "account.removal.retry",
          { uid: "system" },
          (c) => completeErasure(db, row.id, { uid: "system" }, c),
          undefined,
          undefined,
          { kind: SpanKind.CONSUMER },
        );
      } catch {
        log("ERROR", "Erasure recovery failed", {
          "learner.id": row.id,
          "error.type": "internal",
        });
      }
    }
    const reactivations = await db
      .collection("learningPrivacy")
      .where("reactivationScan.done", "==", false)
      .limit(10)
      .get();
    const { recoverReactivation } = await import("./actions.js");
    for (const row of reactivations.docs) {
      if (Date.now() - started > budgetMs) break;
      try {
        await measured(
          "account.reactivation.retry",
          { uid: "system" },
          (c) => recoverReactivation(db, row.id, c),
          undefined,
          undefined,
          { kind: SpanKind.CONSUMER },
        );
      } catch {
        log("ERROR", "Reactivation recovery failed", {
          "learner.id": row.id,
          "error.type": "internal",
        });
      }
    }
    const { outboxHealth } = await import("./telemetry-admin.js");
    await measured(
      "outbox.health",
      { uid: "system" },
      async () =>
        recordOutboxHealth(await observeBacklog(db, await outboxHealth(db))),
      undefined,
      undefined,
      { kind: SpanKind.INTERNAL },
    );
    const rows = await db
      .collection("learningTelemetry")
      .where("status", "==", "pending")
      .where("nextAttemptAt", "<=", Date.now())
      .limit(50)
      .get();
    for (const row of rows.docs) {
      if (Date.now() - started > budgetMs) break;
      try {
        await deliver(row.ref);
      } catch {
        log("ERROR", "Outbox delivery attempt failed", {
          "event.id": row.id,
          "error.type": "internal",
        });
      }
    }
    // Counter housekeeping must not prevent privacy recovery or canonical delivery.
    if (process.env.SHARED_RATE_LIMITS === "true" && Date.now() - started < budgetMs)
      try {
        await cleanRateCounters(db);
      } catch {
        log("WARN", "Rate counter cleanup deferred", {
          operation: "rate.cleanup",
          outcome: "failure",
        });
      }
  },
);
