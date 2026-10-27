import { defaults } from "./config.js";
import { FieldPath } from "firebase-admin/firestore";
import { trace } from "@opentelemetry/api";
import { log, dependency } from "./monitor.js";
import { readAwardFamily, revokeAwardFamily } from "./certificate-policy.js";
import { recordCreditTransition } from "./credits.js";
import { eraseLearner, privacyBlocked } from "./erasure.js";
import { adminAction } from "./admin.js";
import { recordsAction } from "./records.js";
import { finalize } from "./finalize.js";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import {
  validSid,
  validUid,
  validCertificate,
  regionFor,
  LEARNING_POINTS,
  publicCertificate,
} from "./model.js";
import { queue } from "./events.js";
const fail = (code, message) => {
  throw new HttpsError(code, message);
};
const reasonOf = (d) => {
  if (typeof d.reason !== "string" || !d.reason.trim() || d.reason.length > 500)
    fail("invalid-argument", "Add a reason (up to 500 characters).");
  return d.reason.trim();
};
const learner = (db, uid) => db.doc(`learningLearners/${uid}`);
const record = (db, uid, sid) =>
  learner(db, uid).collection("workshops").doc(sid);
export async function staffRole(db, actor, sid) {
  const [admin, staff] = await Promise.all([
    db.doc(`admins/${actor.email}`).get(),
    sid
      ? db.doc(`sessions/${sid}/staff/${actor.email}`).get()
      : Promise.resolve(null),
  ]);
  const facilitator =
    admin.exists && (admin.data().role || "facilitator") === "facilitator";
  const region = staff?.data()?.role === "captain" ? staff.data().region : null;
  if (!facilitator && !region)
    fail(
      "permission-denied",
      "Use your authorized facilitator or captain account.",
    );
  return { facilitator, region };
}
const permitted = (role, team) =>
  role.facilitator || role.region === regionFor(team);
export async function enroll(db, sid, uid, student, session, c, actor) {
  return db.runTransaction(async (tx) => {
    const ref = record(db, uid, sid);
    const [existing, liveSession, privacy] = await Promise.all([
      tx.get(ref),
      tx.get(db.doc(`sessions/${sid}`)),
      tx.get(db.doc(`learningPrivacy/${uid}`)),
    ]);
    if (
      existing.exists ||
      !liveSession.exists ||
      liveSession.data().deleting ||
      privacyBlocked(privacy.data(), sid)
    )
      return false;
    tx.set(
      db.doc(`learningEnrollments/${sid}`),
      { uids: FieldValue.arrayUnion(uid) },
      { merge: true },
    );
    tx.create(ref, {
      sid,
      uid,
      name: student.name,
      teamId: student.teamId,
      role: student.role,
      title: session.title || defaults.defaultWorkshopTitle,
      date: session.workshopDate || null,
      status: "registered",
      registeredAt: student.joinedAt || FieldValue.serverTimestamp(),
      revision: 0,
      learningPoints: 0,
    });
    queue(tx, db, "enrollment.recorded", actor, c, {
      "learner.id": uid,
      "workshop.session.id": sid,
    });
    return true;
  });
}
export async function execute(db, actor, data, c) {
  const d = data || {},
    action = d.action;
  if (action === "eraseLearner") return eraseLearner(db, actor, d, c);
  if (action === "reactivate") {
    await db.runTransaction(async (tx) => {
      const ref = db.doc(`learningPrivacy/${actor.uid}`),
        p = await tx.get(ref);
      if (
        p.data()?.state === "active" &&
        p.data()?.reactivationScan?.done === false
      )
        return;
      if (p.data()?.state !== "erased")
        fail(
          "failed-precondition",
          "Removal must be complete before starting a new learning profile.",
        );
      tx.set(
        ref,
        { state: "active", reactivationScan: { after: null, done: false } },
        { merge: true },
      );
      tx.set(
        learner(db, actor.uid),
        {
          name: actor.name || actor.email.split("@")[0],
          email: actor.email,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      queue(tx, db, "account.reactivated", actor, c, {
        "learner.id": actor.uid,
      });
    });
    const complete = await recoverReactivation(db, actor.uid, c, actor);
    return { saved: true, backfillComplete: complete };
  }
  if (["updateLearner", "restoreCompletion"].includes(action))
    return adminAction(db, actor, d, c);
  if (action === "profile") {
    return db.runTransaction(async (tx) => {
      const ref = learner(db, actor.uid),
        [existing, privacy] = await Promise.all([
          tx.get(ref),
          tx.get(db.doc(`learningPrivacy/${actor.uid}`)),
        ]);
      if (privacyBlocked(privacy.data())) {
        if (typeof d.name === "string")
          fail(
            "failed-precondition",
            "Your records have been removed. Start a new learning profile before saving.",
          );
        return { removed: true };
      }
      const explicit = typeof d.name === "string";
      const name = explicit
        ? d.name.trim()
        : existing.data()?.name || actor.name || actor.email.split("@")[0];
      if (!name || name.length > 80)
        fail("invalid-argument", "Use a display name up to 80 characters.");
      tx.set(
        ref,
        {
          ...(!existing.data()?.name || explicit ? { name } : {}),
          email: actor.email,
          ...(explicit
            ? { profileRevision: (existing.data()?.profileRevision || 0) + 1 }
            : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return { saved: true };
    });
  }
  if (action === "requestCorrection") {
    const reason = reasonOf(d);
    const ref = db.collection("learningRequests").doc();
    const kind = d.kind === "erasure" ? "erasure" : "correction";
    await db.runTransaction(async (tx) => {
      const privacy = await tx.get(db.doc(`learningPrivacy/${actor.uid}`));
      if (privacyBlocked(privacy.data()))
        fail(
          "failed-precondition",
          "A removal is in progress or complete; your existing request shows its status.",
        );
      tx.create(ref, {
        uid: actor.uid,
        email: actor.email,
        kind,
        reason,
        status: "open",
        createdAt: FieldValue.serverTimestamp(),
      });
      queue(tx, db, "account.request.submitted", actor, c, {
        "request.id": ref.id,
        "request.kind": kind,
      });
    });
    return { saved: true };
  }
  if (action === "certificateVisibility") {
    if (!validCertificate(d.certificateId) || typeof d.public !== "boolean")
      fail("invalid-argument", "Choose a certificate and visibility.");
    return db.runTransaction(async (tx) => {
      const ref = db.doc(`learningCertificates/${d.certificateId}`),
        snap = await tx.get(ref);
      if (!snap.exists || snap.data().uid !== actor.uid)
        fail(
          "permission-denied",
          "This certificate belongs to another account.",
        );
      tx.update(ref, { public: d.public });
      queue(tx, db, "certificate.visibility.changed", actor, c, {
        "certificate.id": d.certificateId,
        "certificate.kind":
          snap.data().kind === "award" ? "award" : "participation",
        "workshop.session.id": snap.data().sid,
        public: d.public,
      });
      return { saved: true };
    });
  }
  if (
    ["requests", "reviewRequest", "lookup", "correctCertificate"].includes(
      action,
    )
  )
    return recordsAction(db, actor, d, c);
  if (action === "revoke") {
    if (!validSid(d.sid)) fail("invalid-argument", "Use a valid session code.");
    const sid = d.sid,
      role = await staffRole(db, actor);

    if (!role.facilitator || !validUid(d.uid))
      fail("permission-denied", "Facilitator access required.");
    const reason = reasonOf(d);
    return db.runTransaction(async (tx) => {
      const ref = record(db, d.uid, sid),
        p = learner(db, d.uid);
      const [snap, profile, privacy] = await Promise.all([
        tx.get(ref),
        tx.get(p),
        tx.get(db.doc(`learningPrivacy/${d.uid}`)),
      ]);
      if (privacyBlocked(privacy.data(), sid))
        fail("failed-precondition", "This learner requested removal.");
      const old = snap.data();
      if (old?.status !== "completed")
        fail(
          "failed-precondition",
          "This learner has no active completion to revoke.",
        );
      const cert = await tx.get(
        db.doc(`learningCertificates/${old.certificateId}`),
      );
      const priorAwards = await readAwardFamily(tx, db, old);
      const revision = old.revision + 1;
      const awardedPoints = Number.isFinite(old.learningPoints)
        ? old.learningPoints
        : LEARNING_POINTS;
      const updated = {
        ...old,
        status: "revoked",
        revision,
        learningPoints: 0,
        revokedAt: FieldValue.serverTimestamp(),
        revokedBy: actor.uid,
        reason,
      };
      recordCreditTransition(
        tx,
        db,
        actor,
        c,
        d.uid,
        sid,
        old,
        updated,
        reason,
      );
      tx.set(ref, updated);
      tx.create(ref.collection("versions").doc(String(revision)), updated);
      tx.set(
        p,
        {
          learningPoints: Math.max(
            0,
            (profile.data()?.learningPoints || 0) - awardedPoints,
          ),
        },
        { merge: true },
      );
      tx.create(p.collection("points").doc(`${sid}__${revision}`), {
        sid,
        delta: -awardedPoints,
        reason: "Completion revoked",
        revision,
        at: FieldValue.serverTimestamp(),
      });
      revokeAwardFamily(
        tx,
        priorAwards,
        FieldValue.serverTimestamp(),
        reason,
        db,
        actor,
        c,
      );
      if (cert.exists)
        tx.update(cert.ref, {
          status: "revoked",
          reason,
          revokedAt: FieldValue.serverTimestamp(),
        });
      queue(tx, db, "learning.points.reversed", actor, c, {
        "learner.id": d.uid,
        "workshop.session.id": sid,
        "learning.points.delta": -awardedPoints,
      });
      queue(tx, db, "certificate.revoked", actor, c, {
        "certificate.kind": "participation",
        "workshop.session.id": d.sid,
        "learner.id": d.uid,
        "certificate.id": old.certificateId,
      });
      return { message: "Completion revoked and learning points reversed." };
    });
  }
  if (action === "access") {
    if (d.sid && !validSid(d.sid))
      fail("invalid-argument", "Use a valid session code.");
    const [admin, staff] = await Promise.all([
      db.doc(`admins/${actor.email}`).get(),
      d.sid
        ? db.doc(`sessions/${d.sid}/staff/${actor.email}`).get()
        : Promise.resolve(null),
    ]);
    return {
      facilitator:
        admin.exists && (admin.data().role || "facilitator") === "facilitator",
      region: staff?.data()?.role === "captain" ? staff.data().region : null,
    };
  }
  if (!validSid(d.sid))
    fail("invalid-argument", "Use a valid workshop session code.");
  const sid = d.sid,
    root = db.doc(`sessions/${sid}`),
    role = await staffRole(db, actor, sid);
  const session = await root.get();
  if (!session.exists) fail("not-found", "Workshop session not found.");
  if (session.data().deleting)
    fail("failed-precondition", "Session deletion is in progress.");
  if (action === "roster") {
    const [students, attendance] = await Promise.all([
      root.collection("students").get(),
      root.collection("learningAttendance").get(),
    ]);
    const statuses = new Map(attendance.docs.map((d) => [d.id, d.data()]));
    const rows = await Promise.all(
      students.docs
        .filter((s) => permitted(role, s.data().teamId))
        .map(async (s) => {
          const [r, privacy] = await Promise.all([
            record(db, s.id, sid).get(),
            db.doc(`learningPrivacy/${s.id}`).get(),
          ]);
          return {
            ...s.data(),
            uid: s.id,
            joinedAt: undefined,
            attendance: statuses.get(s.id)?.status || "unreviewed",
            resultStatus: privacyBlocked(privacy.data(), sid)
              ? "removed"
              : r.data()?.status || "registered",
            revision: r.data()?.revision || 0,
          };
        }),
    );
    return {
      sid,
      title: session.data().title,
      date: session.data().workshopDate || null,
      complete: !!session.data().completedAt,
      ...role,
      students: rows.map((r) => JSON.parse(JSON.stringify(r))),
    };
  }
  if (action === "sync") {
    if (!role.facilitator)
      fail("permission-denied", "Facilitator access required.");
    const students = await root.collection("students").get();
    for (const st of students.docs)
      await enroll(db, sid, st.id, st.data(), session.data(), c, actor);
    return { message: `${students.size} participant accounts checked.` };
  }
  if (action === "close") {
    if (!role.facilitator)
      fail("permission-denied", "Only facilitators can close workshops.");
    await db.runTransaction(async (tx) => {
      const [current, admin] = await Promise.all([
        tx.get(root),
        tx.get(db.doc(`admins/${actor.email}`)),
      ]);
      if (
        !admin.exists ||
        (admin.data().role || "facilitator") !== "facilitator"
      )
        fail("permission-denied", "Facilitator access required.");
      if (!current.exists || current.data().deleting)
        fail("failed-precondition", "Workshop unavailable.");
      if (current.data().completedAt) return;
      tx.update(root, {
        completedAt: FieldValue.serverTimestamp(),
        learningArchiveRequired: true,
        currentActivity: null,
        networkingOpen: false,
        "state.phase": "locked",
      });
      queue(tx, db, "workshop.closed", actor, c, {
        "workshop.session.id": sid,
      });
    });
    return {
      message: "Workshop closed. Review attendance, then publish results.",
    };
  }
  if (action === "attendance") {
    if (!validUid(d.uid) || !["attended", "not-attended"].includes(d.status))
      fail("invalid-argument", "Choose a participant and attendance status.");
    const reason = reasonOf(d);
    return db.runTransaction(async (tx) => {
      const [st, currentSession, privacy] = await Promise.all([
        tx.get(root.collection("students").doc(d.uid)),
        tx.get(root),
        tx.get(db.doc(`learningPrivacy/${d.uid}`)),
      ]);
      if (privacyBlocked(privacy.data(), sid))
        fail(
          "failed-precondition",
          "This learner requested removal; attendance cannot recreate deleted records.",
        );
      if (!currentSession.exists || currentSession.data().deleting)
        fail("failed-precondition", "Session is unavailable or deleting.");
      const ref = record(db, d.uid, sid);
      const old = await tx.get(ref);
      if (!st.exists || !permitted(role, st.data().teamId))
        fail(
          "permission-denied",
          "This learner is outside your assigned region.",
        );
      if (old.data()?.status === "completed" && d.status === "not-attended")
        fail(
          "failed-precondition",
          "Revoke the issued completion before changing attendance.",
        );
      tx.set(
        db.doc(`learningEnrollments/${sid}`),
        { uids: FieldValue.arrayUnion(d.uid) },
        { merge: true },
      );
      tx.set(root.collection("learningAttendance").doc(d.uid), {
        status: d.status,
        reason,
        actor: actor.uid,
        at: FieldValue.serverTimestamp(),
      });
      if (old.data()?.status !== "completed")
        tx.set(
          ref,
          {
            sid,
            uid: d.uid,
            name: st.data().name,
            title: session.data().title || defaults.defaultWorkshopTitle,
            date: session.data().workshopDate || null,
            teamId: st.data().teamId,
            role: st.data().role,
            status:
              d.status === "attended" ? "completion-pending" : "not-attended",
            revision: old.data()?.revision || 0,
            learningPoints: 0,
          },
          { merge: true },
        );
      queue(tx, db, "attendance.confirmed", actor, c, {
        "learner.id": d.uid,
        "workshop.session.id": sid,
        status: d.status,
      });
      return { message: "Attendance recorded." };
    });
  }
  if (action === "attendanceBatch") {
    if (
      !Array.isArray(d.uids) ||
      !d.uids.length ||
      d.uids.length > 120 ||
      !d.uids.every(validUid) ||
      new Set(d.uids).size !== d.uids.length
    )
      fail("invalid-argument", "Select up to 120 distinct learners.");
    reasonOf(d);
    const results = [];
    for (let i = 0; i < d.uids.length; i += 4)
      results.push(
        ...(await Promise.all(
          d.uids.slice(i, i + 4).map(async (uid) => {
            try {
              await dependency(
                "attendance.learner",
                { "learner.id": uid },
                () =>
                  execute(
                    db,
                    actor,
                    {
                      action: "attendance",
                      sid,
                      uid,
                      status: d.status,
                      reason: d.reason,
                    },
                    c,
                  ),
                0,
              );
              return { uid, status: "recorded" };
            } catch (e) {
              const expected = e instanceof HttpsError;
              log(expected ? "WARN" : "ERROR", "Learner batch item failed", {
                "learner.id": uid,
                "transaction.id": c.transactionId,
                operation: action,
                "error.type": expected ? e.code : "internal",
              });
              return {
                uid,
                status: "failed",
                message: expected
                  ? e.message
                  : "Could not update this learner. Retry.",
              };
            }
          }),
        )),
      );
    trace
      .getActiveSpan()
      ?.setAttribute(
        "batch.failed",
        results.filter((r) => r.status === "failed").length,
      );
    return {
      results,
      message: `${results.filter((r) => r.status !== "failed").length} attendance records saved; ${results.filter((r) => r.status === "failed").length} need review.`,
    };
  }
  if (action === "finalize") {
    if (!role.facilitator)
      fail("permission-denied", "Only facilitators can finalize completion.");
    const reason = reasonOf(d);
    if (
      !Array.isArray(d.uids) ||
      !d.uids.length ||
      d.uids.length > 120 ||
      !d.uids.every(validUid) ||
      new Set(d.uids).size !== d.uids.length
    )
      fail("invalid-argument", "Select 1–120 distinct registered learners.");
    const results = [];
    for (let i = 0; i < d.uids.length; i += 4) {
      results.push(
        ...(await Promise.all(
          d.uids.slice(i, i + 4).map(async (uid) => {
            try {
              return await dependency(
                "completion.learner",
                { "learner.id": uid },
                () => finalize(db, actor, c, sid, uid, reason),
                0,
              );
            } catch (e) {
              const expected = e instanceof HttpsError;
              log(expected ? "WARN" : "ERROR", "Learner batch item failed", {
                "learner.id": uid,
                "transaction.id": c.transactionId,
                operation: action,
                "error.type": expected ? e.code : "internal",
              });
              return {
                uid,
                status: "failed",
                message: expected
                  ? e.message
                  : "Could not update this learner. Retry.",
              };
            }
          }),
        )),
      );
    }
    trace
      .getActiveSpan()
      ?.setAttribute(
        "batch.failed",
        results.filter((r) => r.status === "failed").length,
      );
    return {
      results,
      message: `${results.filter((r) => r.status !== "failed").length} records published or already current; ${results.filter((r) => r.status === "failed").length} need review.`,
    };
  }
  fail("invalid-argument", "Unknown learning action.");
}
export async function verification(db, id) {
  if (!validCertificate(id)) return { status: "private-or-unavailable" };
  const c = await db.doc(`learningCertificates/${id}`).get();
  const cert = c.data();
  if (!cert?.public) return { status: "private-or-unavailable" };
  const [result, privacy] = await Promise.all([
    db.doc(`learningLearners/${cert.uid}/workshops/${cert.sid}`).get(),
    db.doc(`learningPrivacy/${cert.uid}`).get(),
  ]);
  if (privacyBlocked(privacy.data(), cert.sid))
    return { status: "private-or-unavailable" };
  const current =
    result.data()?.status === "completed" &&
    (cert.kind === "award" ? cert.parentCertificateId : cert.id) ===
      result.data()?.certificateId;
  return publicCertificate(current ? cert : { ...cert, status: "revoked" });
}

// Legacy Live-only memberships need compatibility discovery until an authoritative
// complete membership index has been migrated. Keep this bounded and restartable.
export async function recoverReactivation(
  db,
  uid,
  c,
  actor = { uid: "system" },
  budgetMs = 10000,
) {
  const marker = db.doc(`learningPrivacy/${uid}`),
    deadline = Date.now() + budgetMs;
  do {
    const privacy = (await marker.get()).data();
    if (privacy?.state !== "active" || privacy.reactivationScan?.done !== false)
      return true;
    const after = privacy.reactivationScan.after;
    let query = db.collection("sessions").orderBy(FieldPath.documentId());
    if (after) query = query.startAfter(after);
    const page = await query.limit(50).get();
    for (const session of page.docs) {
      const student = await session.ref.collection("students").doc(uid).get();
      if (student.exists)
        await enroll(
          db,
          session.id,
          uid,
          student.data(),
          session.data(),
          c,
          actor,
        );
    }
    await db.runTransaction(async (tx) => {
      const current = (await tx.get(marker)).data();
      if (
        current?.state !== "active" ||
        current.reactivationScan?.after !== after
      )
        return;
      tx.update(marker, {
        "reactivationScan.after": page.docs.at(-1)?.id || after,
        "reactivationScan.done": page.size < 50,
      });
    });
    if (page.size < 50) return true;
  } while (Date.now() < deadline);
  return false;
}
