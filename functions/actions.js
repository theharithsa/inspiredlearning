import { recordsAction } from "./records.js";
import { finalize } from "./finalize.js";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import {
  validSid,
  validUid,
  validCertificate,
  regionFor,
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
    const [existing, liveSession] = await Promise.all([
      tx.get(ref),
      tx.get(db.doc(`sessions/${sid}`)),
    ]);
    if (existing.exists || !liveSession.exists || liveSession.data().deleting)
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
      title: session.title || "ChaiCart Cloud Workshop",
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
  if (action === "profile") {
    const existing = await learner(db, actor.uid).get();
    const name =
      typeof d.name === "string"
        ? d.name.trim()
        : existing.data()?.name || actor.name || actor.email.split("@")[0];
    if (!name || name.length > 80)
      fail("invalid-argument", "Use a display name up to 80 characters.");
    await learner(db, actor.uid).set(
      { name, email: actor.email, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    return { saved: true };
  }
  if (action === "requestCorrection") {
    const reason = reasonOf(d);
    const ref = db.collection("learningRequests").doc();
    const kind = d.kind === "erasure" ? "erasure" : "correction";
    await db.runTransaction(async (tx) => {
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
      const [snap, profile] = await Promise.all([tx.get(ref), tx.get(p)]);
      const old = snap.data();
      if (old?.status !== "completed")
        fail(
          "failed-precondition",
          "This learner has no active completion to revoke.",
        );
      const cert = await tx.get(
        db.doc(`learningCertificates/${old.certificateId}`),
      );
      const revision = old.revision + 1;
      const updated = {
        ...old,
        status: "revoked",
        revision,
        learningPoints: 0,
        revokedAt: FieldValue.serverTimestamp(),
        revokedBy: actor.uid,
        reason,
      };
      tx.set(ref, updated);
      tx.create(ref.collection("versions").doc(String(revision)), updated);
      tx.set(
        p,
        {
          learningPoints: Math.max(
            0,
            (profile.data()?.learningPoints || 0) - 100,
          ),
        },
        { merge: true },
      );
      tx.create(p.collection("points").doc(`${sid}__${revision}`), {
        sid,
        delta: -100,
        reason: "Completion revoked",
        revision,
        at: FieldValue.serverTimestamp(),
      });
      if (cert.exists)
        tx.update(cert.ref, {
          status: "revoked",
          reason,
          revokedAt: FieldValue.serverTimestamp(),
        });
      queue(tx, db, "learning.points.reversed", actor, c, {
        "learner.id": d.uid,
        "workshop.session.id": sid,
        "learning.points.delta": -100,
      });
      queue(tx, db, "certificate.revoked", actor, c, {
        "learner.id": d.uid,
        "certificate.id": old.certificateId,
      });
      return { message: "Completion revoked and learning points reversed." };
    });
  }
  if (action === "access") {
    if (d.sid && !validSid(d.sid))
      fail("invalid-argument", "Use a valid session code.");
    const role = await staffRole(db, actor, d.sid);
    return role;
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
          const r = await record(db, s.id, sid).get();
          return {
            uid: s.id,
            ...s.data(),
            joinedAt: undefined,
            attendance: statuses.get(s.id)?.status || "unreviewed",
            resultStatus: r.data()?.status || "registered",
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
    await root.update({
      completedAt: FieldValue.serverTimestamp(),
      learningArchiveRequired: true,
      currentActivity: null,
      networkingOpen: false,
      "state.phase": "locked",
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
      const [st, currentSession] = await Promise.all([
        tx.get(root.collection("students").doc(d.uid)),
        tx.get(root),
      ]);
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
            title: session.data().title || "ChaiCart Cloud Workshop",
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
              await execute(
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
              );
              return { uid, status: "recorded" };
            } catch (e) {
              return { uid, status: "failed", message: e.message };
            }
          }),
        )),
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
              return await finalize(db, actor, c, sid, uid, reason);
            } catch (e) {
              return { uid, status: "failed", message: e.message };
            }
          }),
        )),
      );
    }
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
  return publicCertificate(c.data());
}
