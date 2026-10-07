import { FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";
import { validUid, validSid } from "./model.js";
import { queue } from "./events.js";
const fail = (code, message) => {
  throw new HttpsError(code, message);
};
export const reviewReason = (d) => {
  if (typeof d.reason !== "string" || !d.reason.trim() || d.reason.length > 500)
    fail("invalid-argument", "Add a review reason up to 500 characters.");
  return d.reason.trim();
};
export async function requireAdmin(tx, db, actor) {
  const a = await tx.get(db.doc(`admins/${actor.email}`));
  if (!a.exists || (a.data().role || "facilitator") !== "facilitator")
    fail("permission-denied", "Administrator access required.");
}
export async function adminAction(db, actor, d, c) {
  const reason = reviewReason(d);
  if (!validUid(d.uid)) fail("invalid-argument", "Select a valid learner.");
  if (d.action === "updateLearner") {
    if (typeof d.name !== "string" || !d.name.trim() || d.name.length > 80)
      fail(
        "invalid-argument",
        "Provide a verified display name up to 80 characters.",
      );
    return db.runTransaction(async (tx) => {
      await requireAdmin(tx, db, actor);
      const privacy = await tx.get(db.doc(`learningPrivacy/${d.uid}`));
      if (
        ["erasing", "erased"].includes(privacy.data()?.state) ||
        privacy.data()?.blockedSessions?.includes(d.sid)
      )
        fail("failed-precondition", "This learner requested removal.");
      const ref = db.doc(`learningLearners/${d.uid}`),
        p = await tx.get(ref),
        history = await tx.get(ref.collection("workshops").limit(1));
      if (!p.exists && history.empty) fail("not-found", "Learner not found.");
      tx.set(
        ref,
        { name: d.name.trim(), updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      tx.create(ref.collection("reviews").doc(), {
        kind: "profile-correction",
        reason,
        by: actor.uid,
        at: FieldValue.serverTimestamp(),
      });
      queue(tx, db, "learner.profile.corrected", actor, c, {
        "learner.id": d.uid,
      });
      return {
        message:
          "Display name corrected. Google identity and issued certificates are unchanged.",
      };
    });
  }
  if (d.action === "restoreCompletion") {
    if (!validSid(d.sid)) fail("invalid-argument", "Select a valid workshop.");
    return db.runTransaction(async (tx) => {
      await requireAdmin(tx, db, actor);
      const privacy = await tx.get(db.doc(`learningPrivacy/${d.uid}`));
      if (
        ["erasing", "erased"].includes(privacy.data()?.state) ||
        privacy.data()?.blockedSessions?.includes(d.sid)
      )
        fail("failed-precondition", "This learner requested removal.");
      const ref = db.doc(`learningLearners/${d.uid}/workshops/${d.sid}`),
        p = db.doc(`learningLearners/${d.uid}`);
      const [s, profile] = await Promise.all([tx.get(ref), tx.get(p)]);
      const old = s.data();
      if (old?.status === "completed")
        return {
          message:
            "Completion is already active; no additional points or certificate issued.",
        };
      if (old?.status !== "revoked" || !old.certificateId)
        fail(
          "failed-precondition",
          "Only previously verified, revoked completion can be reinstated. Use attendance verification and publication for new participants.",
        );
      const prior = await tx.get(
        db.doc(`learningCertificates/${old.certificateId}`),
      );
      if (
        !prior.exists ||
        prior.data().uid !== d.uid ||
        prior.data().status !== "revoked"
      )
        fail(
          "failed-precondition",
          "The prior revoked certificate is unavailable.",
        );
      const revision = old.revision + 1,
        id = randomUUID(),
        updated = {
          ...old,
          status: "completed",
          revision,
          certificateId: id,
          learningPoints: 100,
          reinstatedAt: FieldValue.serverTimestamp(),
          reinstatedBy: actor.uid,
        };
      tx.set(ref, updated);
      tx.create(ref.collection("versions").doc(String(revision)), {
        ...updated,
        reason,
      });
      tx.set(
        p,
        {
          learningPoints: (profile.data()?.learningPoints || 0) + 100,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      tx.create(p.collection("points").doc(`${d.sid}__${revision}`), {
        sid: d.sid,
        delta: 100,
        reason: "Verified completion reinstated",
        revision,
        at: FieldValue.serverTimestamp(),
      });
      tx.create(db.doc(`learningCertificates/${id}`), {
        id,
        uid: d.uid,
        sid: d.sid,
        name: old.name,
        title: old.title,
        date: old.date,
        revision,
        status: "issued",
        public: false,
        awards: old.awards || [],
        issuedAt: FieldValue.serverTimestamp(),
      });
      queue(tx, db, "workshop.completion.reinstated", actor, c, {
        "learner.id": d.uid,
        "workshop.session.id": d.sid,
        "result.revision": revision,
      });
      queue(tx, db, "learning.points.awarded", actor, c, {
        "learner.id": d.uid,
        "workshop.session.id": d.sid,
        "learning.points.delta": 100,
      });
      queue(tx, db, "certificate.issued", actor, c, {
        "learner.id": d.uid,
        "certificate.id": id,
        "workshop.session.id": d.sid,
      });
      return {
        message:
          "Verified completion reinstated. A new private certificate replaces the revoked copy; the original 100 points are restored once.",
      };
    });
  }
  fail("invalid-argument", "Unknown administrator action.");
}
