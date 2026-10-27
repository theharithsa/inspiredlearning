import { createHash } from "node:crypto";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { requireAdmin, reviewReason } from "./admin.js";
import { queue } from "./events.js";
import { pageOptions } from "./api.js";
const envelope = (items, nextCursor) => ({
  items,
  nextCursor,
  asOf: new Date().toISOString(),
});
const fail = (code, message) => {
  throw new HttpsError(code, message);
};
const iso = (value) => value?.toDate?.().toISOString() || null;
export async function outboxHealth(db, now = Date.now()) {
  const root = db.collection("learningTelemetry");
  const [pending, failed, delivered, sample] = await Promise.all([
    ...["pending", "failed", "delivered"].map((status) =>
      root.where("status", "==", status).count().get(),
    ),
    root.where("status", "==", "pending").limit(501).get(),
  ]);
  const count = pending.data().count;
  const complete =
    count <= 500 &&
    sample.size === count &&
    sample.docs.every((d) => d.data().createdAt?.toMillis);
  const oldest =
    complete && count
      ? Math.min(...sample.docs.map((d) => d.data().createdAt.toMillis()))
      : now;
  return {
    pending: count,
    failed: failed.data().count,
    delivered: delivered.data().count,
    oldestPendingAgeSeconds: complete
      ? Math.max(0, (now - oldest) / 1000)
      : null,
    oldestPendingAgeComplete: complete,
    sampledPending: sample.size,
    asOf: new Date(now).toISOString(),
  };
}
export async function telemetryAdmin(
  db,
  actor,
  method,
  path,
  body,
  query,
  c,
  key,
  audit,
) {
  if (actor.apiTokenId)
    fail("permission-denied", "Google administrator sign-in required.");
  await requireAdmin({ get: (ref) => ref.get() }, db, actor);
  const base = "/api/v1/admin/telemetry";
  if (method === "GET" && path === base + "/health") {
    if (Object.keys(query).length)
      fail("invalid-argument", "Health accepts no filters.");
    const result = await outboxHealth(db);
    await audit(actor, c, "telemetry.health.read", {});
    return result;
  }
  if (method === "GET" && path === base + "/events") {
    if (
      typeof query.status !== "string" ||
      !["pending", "failed", "delivered"].includes(query.status)
    )
      fail("invalid-argument", "Choose pending, failed or delivered status.");
    const p = pageOptions(query, `${actor.uid}:telemetry:${query.status}`, [
      "status",
    ]);
    let q = db
      .collection("learningTelemetry")
      .where("status", "==", query.status)
      .orderBy(FieldPath.documentId());
    if (p.after) q = q.startAfter(p.after);
    const snapshot = await q.limit(p.limit + 1).get(),
      docs = snapshot.docs.slice(0, p.limit);
    await audit(actor, c, "telemetry.events.read", { status: query.status });
    return envelope(
      docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          status: d.status,
          eventId: d.payload?.id || null,
          eventName: d.payload?.data?.["event.name"] || null,
          attempts: d.attempts || 0,
          lastStatus: d.lastStatus ?? null,
          createdAt: iso(d.createdAt),
          failedAt: iso(d.failedAt),
          deliveredAt: iso(d.deliveredAt),
          nextAttemptAt: d.nextAttemptAt || 0,
        };
      }),
      snapshot.size > p.limit ? p.cursor(docs.at(-1).id) : null,
    );
  }
  const match =
    /^\/api\/v1\/admin\/telemetry\/events\/([A-Za-z0-9_-]{1,128})\/redrive$/.exec(
      path,
    );
  if (method !== "POST" || !match)
    fail("not-found", "Telemetry operation unavailable.");
  if (
    Object.keys(query).length ||
    !body ||
    Object.keys(body).some(
      (k) => !["reason", "expectedAttempts"].includes(k),
    ) ||
    !Number.isSafeInteger(body.expectedAttempts) ||
    body.expectedAttempts < 1
  )
    fail("invalid-argument", "Supply reason and expectedAttempts only.");
  reviewReason(body);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      key || "",
    )
  )
    fail("invalid-argument", "A UUID Idempotency-Key is required.");
  const digest = (value) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const operation = db.doc(
      `learningTelemetryOperations/${digest([actor.uid, key])}`,
    ),
    hash = digest([path, body]);
  return db.runTransaction(async (tx) => {
    await requireAdmin(tx, db, actor);
    const ref = db.doc(`learningTelemetry/${match[1]}`),
      [receipt, event] = await Promise.all([tx.get(operation), tx.get(ref)]);
    if (receipt.exists) {
      if (receipt.data().requestHash !== hash)
        fail(
          "already-exists",
          "Idempotency key already used for different settings.",
        );
      return receipt.data().result;
    }
    if (!event.exists) fail("not-found", "Event unavailable.");
    const d = event.data();
    if (
      d.status !== "failed" ||
      d.attempts !== body.expectedAttempts ||
      d.leaseUntil > Date.now()
    )
      fail(
        "failed-precondition",
        "Event changed or is not eligible for redrive. Refresh the list.",
      );
    const result = {
      id: ref.id,
      eventId: d.payload.id,
      status: "pending",
      queued: true,
    };
    tx.update(ref, {
      status: "pending",
      attempts: 0,
      nextAttemptAt: 0,
      leaseUntil: 0,
      redriveCount: FieldValue.increment(1),
      redrivenAt: FieldValue.serverTimestamp(),
      redrivenBy: actor.uid,
    });
    tx.create(operation, {
      actorId: actor.uid,
      requestHash: hash,
      result,
      reason: body.reason.trim(),
      at: FieldValue.serverTimestamp(),
    });
    queue(tx, db, "telemetry.event.redriven", actor, c, {
      "telemetry.event.id": d.payload.id,
      "telemetry.record.id": ref.id,
    });
    return result;
  });
}
