import { FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";
import { requireAdmin, reviewReason } from "./admin.js";
import { validSid, validUid, fingerprint } from "./model.js";
import { privacyBlocked } from "./erasure.js";
import {
  recipientAwards,
  awardCertificateId,
  certificateKind,
} from "./certificate-policy.js";
import { queue } from "./events.js";
const fail = (code, message) => {
  throw new HttpsError(code, message);
};
export async function reconcileCertificates(db, actor, sid, body, c) {
  if (actor.apiTokenId)
    fail(
      "permission-denied",
      "Use your Google-authenticated administrator account.",
    );
  await requireAdmin({ get: (ref) => ref.get() }, db, actor);
  if (!validSid(sid)) fail("invalid-argument", "Invalid workshop.");
  if (
    !body ||
    Object.keys(body).some((k) => !["reason", "additionalAwards"].includes(k))
  )
    fail("invalid-argument", "Unsupported repair field.");
  const reason = reviewReason(body),
    extra = body.additionalAwards || [];
  if (
    !Array.isArray(extra) ||
    extra.length > 30 ||
    extra.some(
      (a) =>
        !a ||
        Object.keys(a).some((k) => !["uid", "title"].includes(k)) ||
        !validUid(a.uid) ||
        typeof a.title !== "string" ||
        !a.title.trim() ||
        a.title.length > 100,
    )
  )
    fail("invalid-argument", "Use explicit student IDs and award titles.");
  const sessionRef = db.doc(`sessions/${sid}`),
    sourceRef = sessionRef.collection("public").doc("workshop");
  await db.runTransaction(async (tx) => {
    const [session, source] = await Promise.all([
      tx.get(sessionRef),
      tx.get(sourceRef),
    ]);
    await requireAdmin(tx, db, actor);
    if (
      !session.exists ||
      !session.data().completedAt ||
      session.data().deleting
    )
      fail(
        "failed-precondition",
        "Use a completed workshop that is not being deleted.",
      );
    const students = await Promise.all(
      extra.map((a) => tx.get(sessionRef.collection("students").doc(a.uid))),
    );
    if (students.some((s) => !s.exists))
      fail(
        "invalid-argument",
        "An award recipient is not registered in this workshop.",
      );
    const awards = [...(source.data()?.awards || [])];
    for (const a of extra)
      if (!awards.some((x) => x.uid === a.uid && x.title === a.title.trim()))
        awards.push({
          uid: a.uid,
          name: students[extra.indexOf(a)].data().name,
          title: a.title.trim(),
          scope: "individual",
        });
    if (awards.length !== (source.data()?.awards || []).length) {
      tx.set(sourceRef, { awards }, { merge: true });
      queue(tx, db, "certificate.award-definitions.updated", actor, c, {
        "workshop.session.id": sid,
        "award.count": awards.length,
      });
    }
  });
  const enrollment = await db.doc(`learningEnrollments/${sid}`).get();
  const uids = enrollment.data()?.uids;
  if (!Array.isArray(uids) || uids.length > 500)
    fail(
      "resource-exhausted",
      "A bounded workshop enrollment list is required.",
    );
  const results = [];
  for (const uid of [...new Set(uids)]) {
    if (!validUid(uid)) continue;
    try {
      results.push(await reconcileLearner(db, actor, sid, uid, reason, c));
    } catch (e) {
      results.push({
        uid,
        status: "failed",
        message:
          e instanceof HttpsError
            ? e.message
            : "Certificate repair failed; retry safely.",
      });
    }
  }
  return {
    results,
    message: `Reviewed ${results.length} learner certificate sets.`,
    failed: results.filter((r) => r.status === "failed").length,
  };
}
export async function reconcileLearner(db, actor, sid, uid, reason, c) {
  return db.runTransaction(async (tx) => {
    await requireAdmin(tx, db, actor);
    const resultRef = db.doc(`learningLearners/${uid}/workshops/${sid}`);
    const [result, privacy, source, session, student, certificates] =
      await Promise.all([
        tx.get(resultRef),
        tx.get(db.doc(`learningPrivacy/${uid}`)),
        tx.get(db.doc(`sessions/${sid}/public/workshop`)),
        tx.get(db.doc(`sessions/${sid}`)),
        tx.get(db.doc(`sessions/${sid}/students/${uid}`)),
        tx.get(
          db
            .collection("learningCertificates")
            .where("uid", "==", uid)
            .limit(501),
        ),
      ]);
    if (certificates.size > 500)
      fail(
        "resource-exhausted",
        "Too many certificate versions; review individually.",
      );
    if (
      privacyBlocked(privacy.data(), sid) ||
      !result.exists ||
      result.data().status !== "completed"
    )
      return { uid, status: "skipped" };
    if (!session.data()?.completedAt || session.data()?.deleting)
      fail("failed-precondition", "Workshop is no longer ready for repair.");
    const old = result.data(),
      own = certificates.docs.filter((d) => d.data().sid === sid),
      current = own.find((d) => d.id === old.certificateId);
    if (!current || current.data().status !== "issued")
      fail(
        "failed-precondition",
        "No issued current participation certificate; review before repair.",
      );
    const desired = [
      ...new Set([
        ...(old.awards || []),
        ...recipientAwards(source.data()?.awards, uid, student.data() || old),
      ]),
    ].sort();
    const changed =
      JSON.stringify([...(old.awards || [])].sort()) !==
      JSON.stringify(desired);
    const revision = changed ? (old.revision || 0) + 1 : old.revision;
    const parentId = changed ? randomUUID() : old.certificateId;
    const parent = {
      id: parentId,
      uid,
      sid,
      name: current.data().name,
      title: current.data().title,
      date: current.data().date ?? null,
      revision,
      status: "issued",
      public: current.data().public || false,
      awards: desired,
      kind: "participation",
    };
    let issued = 0,
      revoked = 0;
    if (changed) {
      const updated = {
        ...old,
        awards: desired,
        revision,
        certificateId: parentId,
        finalizedAt: FieldValue.serverTimestamp(),
        finalizedBy: actor.uid,
      };
      updated.fingerprint = fingerprint(updated);
      tx.set(resultRef, updated);
      tx.create(resultRef.collection("versions").doc(String(revision)), {
        ...updated,
        reason,
      });
      tx.create(db.doc(`learningCertificates/${parentId}`), {
        ...parent,
        issuedAt: FieldValue.serverTimestamp(),
      });
      issued++;
    }
    const expected = new Set(
      desired.map((title) => awardCertificateId(parentId, title)),
    );
    for (const d of own) {
      const keep =
        certificateKind(d.data()) === "award"
          ? expected.has(d.id)
          : d.id === parentId;
      if (!keep && d.data().status === "issued") {
        tx.update(d.ref, {
          status: "revoked",
          reason: "Superseded certificate version",
          revokedAt: FieldValue.serverTimestamp(),
          supersededBy: parentId,
        });
        revoked++;
      }
    }
    for (const title of desired) {
      const id = awardCertificateId(parentId, title),
        existing = own.find((d) => d.id === id);
      if (existing) continue; // A revoked recognition is not silently reinstated.
      tx.create(db.doc(`learningCertificates/${id}`), {
        ...parent,
        id,
        kind: "award",
        awardTitle: title,
        parentCertificateId: parentId,
        public: false,
        issuedAt: FieldValue.serverTimestamp(),
      });
      issued++;
    }
    if (issued || revoked)
      queue(tx, db, "certificate.recognition.reconciled", actor, c, {
        "learner.id": uid,
        "workshop.session.id": sid,
        "certificate.issued.count": issued,
        "certificate.revoked.count": revoked,
        "result.revision": revision,
      });
    return {
      uid,
      status: issued || revoked ? "updated" : "unchanged",
      issued,
      revoked,
    };
  });
}
