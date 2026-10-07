import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore } from "firebase-admin/firestore";
import { measured, token, log } from "./monitor.js";
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
        "event.authority": "server-confirmed",
        "event.source": "backend",
        "transaction.id": c.transactionId,
        trace_id: c.traceId,
        span_id: c.spanId,
        "actor.id": actor.uid,
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
  const db = getFirestore(),
    lease = randomUUID(),
    now = Date.now();
  const row = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data();
    if (
      !d ||
      d.status === "delivered" ||
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
        const local = process.env.FUNCTIONS_EMULATOR === "true";
        const credential = local ? "" : token.value();
        const r = await fetch(
          local
            ? "http://127.0.0.1:8799/api/v2/bizevents/ingest"
            : "https://indiacs.live.dynatrace.com/api/v2/bizevents/ingest",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/cloudevents+json",
              ...(credential
                ? {
                    Authorization:
                      (credential.startsWith("dt0c01.")
                        ? "Api-Token "
                        : "Bearer ") + credential,
                  }
                : {}),
            },
            body: JSON.stringify(row.payload),
            signal: AbortSignal.timeout(7000),
          },
        );
        status = r.status;
      } catch {}
      await db.runTransaction(async (tx) => {
        const current = await tx.get(ref);
        if (current.data()?.lease !== lease) return;
        tx.update(ref, {
          status: status === 202 ? "delivered" : "pending",
          lastStatus: status,
          leaseUntil: 0,
          nextAttemptAt:
            status === 202
              ? 0
              : Date.now() +
                Math.min(3600000, 30000 * 2 ** Math.min(row.attempts || 0, 7)),
          ...(status === 202
            ? { deliveredAt: FieldValue.serverTimestamp() }
            : {}),
        });
      });
      log(status === 202 ? "INFO" : "ERROR", "Business event delivery", {
        "event.id": row.payload.id,
        "transaction.id": row.payload.data["transaction.id"],
        outcome: status === 202 ? "delivered" : "retry",
        status,
      });
    },
  );
}
const options = {
  region: "asia-south1",
  secrets: [token],
  maxInstances: 2,
  timeoutSeconds: 120,
};
export const deliverLearningEvent = onDocumentCreated(
  { ...options, document: "learningTelemetry/{id}", retry: true },
  (e) => deliver(e.data.ref),
);
export const retryLearningEvents = onSchedule(
  { ...options, schedule: "every 5 minutes" },
  async () => {
    const db = getFirestore();
    const rows = await db
      .collection("learningTelemetry")
      .where("status", "==", "pending")
      .where("nextAttemptAt", "<=", Date.now())
      .limit(50)
      .get();
    for (const row of rows.docs) await deliver(row.ref);
  },
);
