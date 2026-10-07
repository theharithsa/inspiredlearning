import { privacyBlocked } from "./erasure.js";
import { requireAdmin } from "./admin.js";
import { FieldValue, FieldPath } from "firebase-admin/firestore";
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
    if (d.cursor && !validUid(d.cursor))
      fail("invalid-argument", "Invalid request page.");
    let query = db
      .collection("learningRequests")
      .where(
        "status",
        "in",
        d.status === "history"
          ? ["resolved", "rejected", "reviewed", "superseded"]
          : ["open", "processing"],
      )
      .orderBy(FieldPath.documentId());
    if (d.cursor) query = query.startAfter(d.cursor);
    const rows = await query.limit(50).get();
    return {
      nextCursor: rows.size === 50 ? rows.docs.at(-1).id : null,
      requests: rows.docs.map((r) => ({
        id: r.id,
        uid: r.data().uid,
        email: r.data().email,
        reason: r.data().reason,
        kind: r.data().kind,
        status: r.data().status,
        resolutionAction: r.data().resolutionAction || null,
        resolution: r.data().resolution || null,
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
    if (!["resolved", "rejected", "reopen"].includes(d.decision || "resolved"))
      fail("invalid-argument", "Choose a valid review decision.");
    return db.runTransaction(async (tx) => {
      await requireAdmin(tx, db, actor);
      const ref = db.doc(`learningRequests/${d.requestId}`),
        snap = await tx.get(ref);
      if (!snap.exists) fail("not-found", "Request not found.");
      const decision = d.decision || "resolved";
      if (decision === "reopen" && snap.data().resolutionAction === "erased")
        fail(
          "failed-precondition",
          "Completed removal cannot be reopened. The learner must submit a new request for new records.",
        );
      if (snap.data().kind === "erasure" && decision === "resolved")
        fail(
          "failed-precondition",
          "Use the removal action to erase records; a review cannot claim erasure.",
        );
      if (decision !== "reopen" && snap.data().status !== "open")
        return { message: "This request has already been reviewed." };
      tx.update(ref, {
        status: decision === "reopen" ? "open" : decision,
        resolution: d.reason,
        resolvedBy: actor.uid,
        resolvedAt: FieldValue.serverTimestamp(),
      });
      queue(tx, db, "request.reviewed", actor, c, {
        "learner.id": snap.data().uid,
        "request.id": d.requestId,
        "request.decision": decision,
        "request.kind": snap.data().kind,
      });
      return {
        message:
          decision === "reopen"
            ? "Request reopened."
            : decision === "rejected"
              ? "Request declined. Your reason is visible to the learner."
              : "Request marked reviewed. The resolution note is retained.",
      };
    });
  }
  if (d.action === "lookup") {
    let uid = d.reference;
    if (typeof uid === "string" && uid.includes("@")) {
      const rows = await db
        .collection("learningLearners")
        .where("email", "==", uid.trim().toLowerCase())
        .limit(2)
        .get();
      if (rows.size !== 1)
        fail(
          "not-found",
          "No unique learner account found. Use the account reference from the workshop roster.",
        );
      uid = rows.docs[0].id;
    }
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
    const privacy = await db.doc(`learningPrivacy/${uid}`).get();
    const records = await db
      .collection(`learningLearners/${uid}/workshops`)
      .limit(200)
      .get();
    if (!profile.exists && records.empty && !privacy.exists)
      fail("not-found", "Learner record not found.");
    return {
      uid,
      removed: privacyBlocked(privacy.data()),
      name:
        profile.data()?.name ||
        (privacyBlocked(privacy.data()) ? "Removed learner" : "Learner"),
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
    if (
      d.title !== undefined &&
      (typeof d.title !== "string" || !d.title.trim() || d.title.length > 140)
    )
      fail("invalid-argument", "Use a workshop title up to 140 characters.");
    if (
      d.date !== undefined &&
      d.date !== null &&
      (typeof d.date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(d.date) ||
        !Number.isFinite(Date.parse(d.date)) ||
        new Date(d.date).toISOString().slice(0, 10) !== d.date)
    )
      fail(
        "invalid-argument",
        "Use a real calendar date in YYYY-MM-DD format.",
      );
    return db.runTransaction(async (tx) => {
      await requireAdmin(tx, db, actor);
      const privacy = await tx.get(db.doc(`learningPrivacy/${d.uid}`));
      if (privacyBlocked(privacy.data(), d.sid))
        fail("failed-precondition", "This learner requested removal.");
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
          ...(d.title !== undefined && d.title.trim() !== old.title
            ? {
                title: d.title.trim(),
                certificateTitleOverride: d.title.trim(),
              }
            : {}),
          ...(d.date !== undefined && d.date !== old.date
            ? { date: d.date, certificateDateOverride: d.date }
            : {}),
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
        title: updated.title,
        date: updated.date,
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
          "Certificate details corrected. A replacement certificate is available; learning points are unchanged.",
      };
    });
  }
  fail("invalid-argument", "Unknown records action.");
}
