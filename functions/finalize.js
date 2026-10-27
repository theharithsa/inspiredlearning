import {
  issueAwardFamily,
  readAwardFamily,
  revokeAwardFamily,
} from "./certificate-policy.js";
import { recordCreditTransition } from "./credits.js";
import { privacyBlocked } from "./erasure.js";
import { FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";
import {
  resultSnapshot,
  fingerprint,
  pointsTransition,
  LEARNING_POINTS,
} from "./model.js";
import { queue } from "./events.js";
const fail = (code, message) => {
  throw new HttpsError(code, message);
};
const learner = (db, uid) => db.doc(`learningLearners/${uid}`);
const record = (db, uid, sid) =>
  learner(db, uid).collection("workshops").doc(sid);
export async function finalize(db, actor, c, sid, uid, reason) {
  return db.runTransaction(async (tx) => {
    const root = db.doc(`sessions/${sid}`),
      ref = record(db, uid, sid),
      profileRef = learner(db, uid);
    const [
      session,
      student,
      attendance,
      current,
      profile,
      board,
      quiz,
      admin,
      privacy,
    ] = await Promise.all([
      tx.get(root),
      tx.get(root.collection("students").doc(uid)),
      tx.get(root.collection("learningAttendance").doc(uid)),
      tx.get(ref),
      tx.get(profileRef),
      tx.get(root.collection("public").doc("leaderboard")),
      tx.get(root.collection("quizResults").doc(uid)),
      tx.get(db.doc(`admins/${actor.email}`)),
      tx.get(db.doc(`learningPrivacy/${uid}`)),
    ]);
    if (!admin.exists || (admin.data().role || "facilitator") !== "facilitator")
      fail("permission-denied", "Facilitator access changed.");
    if (privacyBlocked(privacy.data(), sid))
      fail(
        "failed-precondition",
        "This learner requested removal. Historical results cannot be republished.",
      );
    // Read submissions by actual team after reading the student; never trust a supplied team.
    if (!session.exists || !student.exists)
      fail("not-found", "Workshop participant not found.");
    if (session.data().deleting)
      fail("failed-precondition", "Session deletion is in progress.");
    if (!session.data().completedAt)
      fail(
        "failed-precondition",
        "Mark the workshop complete before publishing results.",
      );
    if (attendance.data()?.status !== "attended")
      fail("failed-precondition", "Confirm this learner’s attendance first.");
    const [teamSubs, networkSnap, workshopSnap] = await Promise.all([
      tx.get(
        root
          .collection("submissions")
          .where("teamId", "==", student.data().teamId),
      ),
      tx.get(root.collection("networking").doc(uid)),
      tx.get(root.collection("public").doc("workshop")),
    ]);
    const result = resultSnapshot(
      sid,
      uid,
      session.data(),
      student.data(),
      board.data() || {},
      quiz.data(),
      teamSubs.docs.map((d) => d.data()),
      networkSnap.data(),
      workshopSnap.data()?.awards,
    );
    const old = current.data();
    if (old?.certificateNameOverride) result.name = old.certificateNameOverride;
    if (old?.certificateTitleOverride)
      result.title = old.certificateTitleOverride;
    if (old && Object.hasOwn(old, "certificateDateOverride"))
      result.date = old.certificateDateOverride;
    const hash = fingerprint(result);
    if (old?.status === "completed" && old.fingerprint === hash)
      return { uid, status: "unchanged" };
    const revision = (old?.revision || 0) + 1,
      certificateId = randomUUID(),
      delta = pointsTransition(old, "completed");
    const previousCertificate = old?.certificateId
      ? await tx.get(db.doc(`learningCertificates/${old.certificateId}`))
      : null;
    const priorAwards = await readAwardFamily(tx, db, old);
    const updated = {
      ...result,
      ...(old?.certificateNameOverride
        ? { certificateNameOverride: old.certificateNameOverride }
        : {}),
      ...(old?.certificateTitleOverride
        ? { certificateTitleOverride: old.certificateTitleOverride }
        : {}),
      ...(old && Object.hasOwn(old, "certificateDateOverride")
        ? { certificateDateOverride: old.certificateDateOverride }
        : {}),
      status: "completed",
      revision,
      fingerprint: hash,
      certificateId,
      learningPoints: LEARNING_POINTS,
      finalizedAt: FieldValue.serverTimestamp(),
      finalizedBy: actor.uid,
    };
    tx.set(
      db.doc(`learningEnrollments/${sid}`),
      { uids: FieldValue.arrayUnion(uid) },
      { merge: true },
    );
    recordCreditTransition(tx, db, actor, c, uid, sid, old, updated, reason);
    tx.set(ref, updated);
    tx.create(ref.collection("versions").doc(String(revision)), {
      ...updated,
      reason,
    });
    tx.set(
      profileRef,
      {
        learningPoints: Math.max(
          0,
          (profile.data()?.learningPoints || 0) + delta,
        ),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    if (delta) {
      tx.create(profileRef.collection("points").doc(`${sid}__${revision}`), {
        sid,
        delta,
        reason: "Verified workshop completion",
        revision,
        at: FieldValue.serverTimestamp(),
      });
      queue(tx, db, "learning.points.awarded", actor, c, {
        "learner.id": uid,
        "workshop.session.id": sid,
        "learning.points.delta": delta,
      });
    }
    revokeAwardFamily(
      tx,
      priorAwards,
      FieldValue.serverTimestamp(),
      "Superseded by corrected results",
      db,
      actor,
      c,
    );
    if (previousCertificate?.exists)
      tx.update(previousCertificate.ref, {
        status: "revoked",
        reason: "Superseded by corrected results",
        revokedAt: FieldValue.serverTimestamp(),
      });
    if (previousCertificate?.data()?.status === "issued")
      queue(tx, db, "certificate.revoked", actor, c, {
        "certificate.id": previousCertificate.id,
        "certificate.kind": "participation",
        "workshop.session.id": sid,
        "learner.id": uid,
        "revocation.reason": "superseded",
      });
    const certificateRecord = {
      id: certificateId,
      uid,
      sid,
      name: result.name,
      title: result.title,
      date: result.date,
      revision,
      status: "issued",
      public: false,
      awards: result.awards,
      issuedAt: FieldValue.serverTimestamp(),
    };
    certificateRecord.kind = "participation";
    tx.create(
      db.doc(`learningCertificates/${certificateId}`),
      certificateRecord,
    );
    issueAwardFamily(tx, db, certificateRecord, actor, c);
    queue(
      tx,
      db,
      old?.status === "completed"
        ? "workshop.completion.corrected"
        : "workshop.completion.finalized",
      actor,
      c,
      {
        "learner.id": uid,
        "workshop.session.id": sid,
        "result.revision": revision,
        "credits.known":
          result.personalCredits != null && result.teamCredits != null,
        ...(result.personalCredits != null
          ? { "credits.personal": result.personalCredits }
          : {}),
        ...(result.teamCredits != null
          ? { "credits.team": result.teamCredits }
          : {}),
      },
    );
    queue(tx, db, "certificate.issued", actor, c, {
      "certificate.kind": "participation",
      "learner.id": uid,
      "workshop.session.id": sid,
      "certificate.id": certificateId,
    });
    return { uid, status: "completed", revision };
  });
}
