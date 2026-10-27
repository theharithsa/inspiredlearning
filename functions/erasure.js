import { FieldValue, FieldPath } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";
import { requireAdmin, reviewReason } from "./admin.js";
import { validUid } from "./model.js";
import { queue } from "./events.js";
export const privacyBlocked = (privacy, sid) =>
  ["erasing", "erased"].includes(privacy?.state) ||
  (sid && privacy?.blockedSessions?.includes(sid));
export async function eraseLearner(db, actor, d, c) {
  reviewReason(d);
  if (
    !validUid(d.requestId) ||
    !validUid(d.uid) ||
    d.confirm !== d.uid ||
    d.scope !== "learning-records"
  )
    throw new HttpsError(
      "invalid-argument",
      "Confirm the learner account reference and InspiredLearning-only removal scope.",
    );
  const marker = db.doc(`learningPrivacy/${d.uid}`),
    request = db.doc(`learningRequests/${d.requestId}`);
  const started = await db.runTransaction(async (tx) => {
    await requireAdmin(tx, db, actor);
    const [r, p] = await Promise.all([tx.get(request), tx.get(marker)]);
    if (!r.exists || r.data().uid !== d.uid || r.data().kind !== "erasure")
      throw new HttpsError(
        "failed-precondition",
        "Choose this learner’s removal request.",
      );
    if (r.data().resolutionAction === "erased") return false;
    if (!["open", "processing"].includes(r.data().status))
      throw new HttpsError(
        "failed-precondition",
        "Reopen the removal request before approving it.",
      );
    if (p.data()?.state === "erasing" && p.data().requestId !== d.requestId)
      throw new HttpsError(
        "failed-precondition",
        "Another removal is already in progress.",
      );
    if (p.data()?.state === "erasing") return true;
    tx.set(
      marker,
      {
        state: "erasing",
        reactivationScan: { done: true, after: null },
        scope: "learning-records",
        requestId: d.requestId,
        blockedSessions: [...new Set(p.data()?.blockedSessions || [])],
        discovery: {
          historyAfter: null,
          historyDone: false,
          sessionAfter: null,
          sessionDone: false,
        },
        startedBy: actor.uid,
        startedAt: FieldValue.serverTimestamp(),
        leaseUntil: 0,
      },
      { merge: true },
    );
    tx.update(request, {
      status: "processing",
      resolution: "InspiredLearning removal in progress.",
      reviewedBy: actor.uid,
    });
    if (p.data()?.state !== "erasing")
      queue(tx, db, "account.removal.started", actor, c, {
        "learner.id": d.uid,
        "request.id": d.requestId,
        "removal.scope": "learning-records",
      });
    return true;
  });
  if (!started) return { message: "This removal is already complete." };
  const finished = await completeErasure(db, d.uid, actor, c);
  return {
    message: finished
      ? "InspiredLearning history and certificates removed. Shared sign-in and Live workshop data are retained."
      : "Removal is in progress; automatic recovery will complete it.",
  };
}
export async function completeErasure(
  db,
  uid,
  actor,
  c,
  { discoveryBudgetMs = 30000 } = {},
) {
  const marker = db.doc(`learningPrivacy/${uid}`),
    lease = randomUUID();
  const p = await db.runTransaction(async (tx) => {
    const s = await tx.get(marker);
    if (s.data()?.state !== "erasing" || s.data().leaseUntil > Date.now())
      return null;
    tx.update(marker, { lease, leaseUntil: Date.now() + 600000 });
    return s.data();
  });
  if (!p) return false;
  try {
    const deadline = Date.now() + discoveryBudgetMs;
    if (!(await discoverBlockedSessions(db, uid, marker, lease, deadline))) {
      await db.runTransaction(async (tx) => {
        const current = await tx.get(marker);
        if (current.data()?.lease === lease)
          tx.update(marker, { leaseUntil: 0 });
      });
      return false;
    }
    const certificates = await db
      .collection("learningCertificates")
      .where("uid", "==", uid)
      .get();
    for (const doc of certificates.docs) await doc.ref.delete();
    await db.recursiveDelete(db.doc(`learningLearners/${uid}`));
    const rosters = await db
      .collection("learningCollegeRoster")
      .where("uid", "==", uid)
      .get();
    for (const doc of rosters.docs) await doc.ref.delete();
    const guards = await db
      .collection("learningCreditEventGuards")
      .where("uid", "==", uid)
      .get();
    for (const guard of guards.docs) await guard.ref.set({ uid, erased: true });
    // Keep minimal replay tombstones so a delayed webhook cannot recreate erased data after reactivation.
    let cursor, operations;
    do {
      let query = db
        .collection("learningApiOperations")
        .where("uid", "==", uid)
        .orderBy(FieldPath.documentId());
      if (cursor) query = query.startAfter(cursor);
      operations = await query.limit(100).get();
      if (!operations.empty) {
        const batch = db.batch();
        for (const doc of operations.docs)
          batch.set(doc.ref, {
            uid,
            requestHash: doc.data().requestHash,
            erased: true,
            result: null,
          });
        await batch.commit();
        cursor = operations.docs.at(-1).id;
      }
    } while (operations.size === 100);
    const indexes = await db
      .collection("learningEnrollments")
      .where("uids", "array-contains", uid)
      .get();
    for (const doc of indexes.docs)
      await doc.ref.update({ uids: FieldValue.arrayRemove(uid) });
    const requests = await db
      .collection("learningRequests")
      .where("uid", "==", uid)
      .get();
    for (const r of requests.docs) {
      if (r.id === p.requestId) continue;
      await r.ref.set({
        uid,
        kind: r.data().kind,
        status: "superseded",
        resolution: "Learning records removed; this earlier request is closed.",
        resolvedAt: FieldValue.serverTimestamp(),
      });
    }
    const completed = await db.runTransaction(async (tx) => {
      const s = await tx.get(marker);
      if (s.data()?.lease !== lease || s.data().state !== "erasing")
        return false;
      tx.update(marker, {
        state: "erased",
        erasedAt: FieldValue.serverTimestamp(),
        leaseUntil: 0,
      });
      tx.set(db.doc(`learningRequests/${p.requestId}`), {
        uid,
        kind: "erasure",
        status: "resolved",
        resolutionAction: "erased",
        resolution:
          "InspiredLearning history and certificates removed. Shared sign-in, Live workshop records and separately retained monitoring data are outside this removal.",
        resolvedBy: actor.uid,
        resolvedAt: FieldValue.serverTimestamp(),
      });
      queue(tx, db, "account.removal.completed", actor, c, {
        "learner.id": uid,
        "request.id": p.requestId,
        "removal.scope": "learning-records",
      });
      return true;
    });
    return completed;
  } catch (error) {
    await db.runTransaction(async (tx) => {
      const s = await tx.get(marker);
      if (s.data()?.lease === lease)
        tx.update(marker, { leaseUntil: 0, lastFailure: "removal-incomplete" });
    });
    throw error;
  }
}

// Legacy Live participants may have no portal index. Page this compatibility discovery
// outside the transaction; a durable cursor and global erasing marker preserve recovery.
async function discoverBlockedSessions(db, uid, marker, lease, deadline) {
  for (const phase of ["history", "session"]) {
    while (true) {
      const privacy = (await marker.get()).data();
      if (privacy?.lease !== lease || privacy.state !== "erasing") return false;
      const state = privacy.discovery || {};
      if (state[phase + "Done"]) break;
      let query = (
        phase === "history"
          ? db.collection(`learningLearners/${uid}/workshops`)
          : db.collection("sessions")
      ).orderBy(FieldPath.documentId());
      if (state[phase + "After"])
        query = query.startAfter(state[phase + "After"]);
      const page = await query.limit(50).get();
      const ids =
        phase === "history"
          ? page.docs.map((d) => d.id)
          : (
              await Promise.all(
                page.docs.map(async (session) =>
                  (await session.ref.collection("students").doc(uid).get())
                    .exists
                    ? session.id
                    : null,
                ),
              )
            ).filter(Boolean);
      const advanced = await db.runTransaction(async (tx) => {
        const current = await tx.get(marker);
        if (
          current.data()?.lease !== lease ||
          current.data().state !== "erasing"
        )
          return false;
        tx.update(marker, {
          ...(ids.length
            ? { blockedSessions: FieldValue.arrayUnion(...ids) }
            : {}),
          [`discovery.${phase}After`]:
            page.docs.at(-1)?.id || state[phase + "After"] || null,
          [`discovery.${phase}Done`]: page.size < 50,
        });
        return true;
      });
      if (!advanced) return false;
      if (page.size < 50) break;
      if (Date.now() > deadline) return false;
    }
  }
  return true;
}
