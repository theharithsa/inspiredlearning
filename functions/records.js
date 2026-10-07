import { FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";
import { validCertificate, validUid, validSid, fingerprint } from "./model.js";
import { queue } from "./events.js";
const fail = (code, message) => {
  throw new HttpsError(code, message);
};
export async function recordsAction(db, actor, d, c) {
  const admin = await db.doc(`admins/${actor.email}`).get();
  if (!admin.exists || (admin.data().role || "facilitator") !== "facilitator")
    fail("permission-denied", "Facilitator access required.");
  if (d.action === "requests") {
    const rows = await db
      .collection("learningRequests")
      .where("status", "==", "open")
      .limit(50)
      .get();
    return {
      requests: rows.docs.map((r) => ({
        id: r.id,
        uid: r.data().uid,
        email: r.data().email,
        reason: r.data().reason,
        kind: r.data().kind,
      })),
    };
  }
  if (d.action === "reviewRequest") {
    if (
      !validUid(d.requestId) ||
      typeof d.reason !== "string" ||
      !d.reason.trim() ||
      d.reason.length > 500
    )
      fail(
        "invalid-argument",
        "Choose a request and add your resolution note.",
      );
    return db.runTransaction(async (tx) => {
      const ref = db.doc(`learningRequests/${d.requestId}`),
        snap = await tx.get(ref);
      if (!snap.exists) fail("not-found", "Request not found.");
      tx.update(ref, {
        status: "resolved",
        resolution: d.reason,
        resolvedBy: actor.uid,
        resolvedAt: FieldValue.serverTimestamp(),
      });
      queue(tx, db, "request.reviewed", actor, c, {
        "learner.id": snap.data().uid,
        "request.id": d.requestId,
      });
      return {
        message: "Request marked reviewed. The resolution note is retained.",
      };
    });
  }
  if (d.action === "lookup") {
    let uid = d.reference;
    if (validCertificate(uid)) {
      const cert = await db.doc(`learningCertificates/${uid}`).get();
      if (cert.exists) uid = cert.data().uid;
    }
    if (!validUid(uid))
      fail(
        "invalid-argument",
        "Use a learner account reference or certificate ID.",
      );
    const profile = await db.doc(`learningLearners/${uid}`).get();
    const records = await db
      .collection(`learningLearners/${uid}/workshops`)
      .limit(200)
      .get();
    if (!profile.exists && records.empty)
      fail("not-found", "Learner record not found.");
    return {
      uid,
      name: profile.data()?.name || "Learner",
      email: profile.data()?.email || null,
      workshops: records.docs.map((r) => ({
        sid: r.id,
        title: r.data().title,
        name: r.data().name,
        date: r.data().date,
        status: r.data().status,
        revision: r.data().revision,
        certificateId: r.data().certificateId || null,
      })),
    };
  }
  if (d.action === "correctCertificate") {
    if (
      !validUid(d.uid) ||
      !validSid(d.sid) ||
      typeof d.name !== "string" ||
      !d.name.trim() ||
      d.name.length > 80 ||
      typeof d.reason !== "string" ||
      !d.reason.trim() ||
      d.reason.length > 500
    )
      fail(
        "invalid-argument",
        "Choose a record and provide the verified name and correction reason.",
      );
    return db.runTransaction(async (tx) => {
      const ref = db.doc(`learningLearners/${d.uid}/workshops/${d.sid}`),
        snap = await tx.get(ref),
        old = snap.data();
      if (old?.status !== "completed")
        fail(
          "failed-precondition",
          "Only active completed records can be corrected.",
        );
      const prior = await tx.get(
        db.doc(`learningCertificates/${old.certificateId}`),
      );
      const revision = old.revision + 1,
        id = randomUUID(),
        updated = {
          ...old,
          name: d.name.trim(),
          certificateNameOverride: d.name.trim(),
          revision,
          certificateId: id,
          correctedAt: FieldValue.serverTimestamp(),
          correctedBy: actor.uid,
        };
      updated.fingerprint = fingerprint(updated);
      tx.set(ref, updated);
      tx.create(ref.collection("versions").doc(String(revision)), {
        ...updated,
        reason: d.reason,
      });
      if (prior.exists)
        tx.update(prior.ref, {
          status: "revoked",
          reason: "Replaced by name correction",
          revokedAt: FieldValue.serverTimestamp(),
        });
      tx.create(db.doc(`learningCertificates/${id}`), {
        id,
        uid: d.uid,
        sid: d.sid,
        name: updated.name,
        title: old.title,
        date: old.date,
        revision,
        status: "issued",
        public: false,
        awards: old.awards || [],
        issuedAt: FieldValue.serverTimestamp(),
      });
      queue(tx, db, "workshop.completion.corrected", actor, c, {
        "learner.id": d.uid,
        "workshop.session.id": d.sid,
        "result.revision": revision,
      });
      queue(tx, db, "certificate.issued", actor, c, {
        "learner.id": d.uid,
        "certificate.id": id,
      });
      return {
        message:
          "Name corrected. A replacement certificate is available; learning points are unchanged.",
      };
    });
  }
  fail("invalid-argument", "Unknown records action.");
}
