import { creditAccount } from "./credits.js";
import { FieldPath } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { pageOptions, scores, iso } from "./api.js";
import { validUid, validSid } from "./model.js";
import { validCollege, collegeFor, rosterId } from "./college-model.js";
import { privacyBlocked } from "./erasure.js";
const fail = (code, message) => {
  throw new HttpsError(code, message);
};
const envelope = (items, nextCursor = null) => ({
  items,
  nextCursor,
  asOf: new Date().toISOString(),
});
const collegeDto = (id, r) => ({
  collegeId: id,
  name: r.name,
  status: r.status,
  revision: r.revision,
  updatedAt: iso(r.updatedAt),
});
const binding = (actor, path) =>
  `${actor.uid}:${actor.apiTokenId || "interactive"}:catalog:${path}`;
async function admin(db, actor) {
  const r = await db.doc(`admins/${actor.email}`).get();
  if (!r.exists || (r.data().role || "facilitator") !== "facilitator")
    fail("permission-denied", "Facilitator required.");
}
function options(query, actor, path, allowed) {
  const p = pageOptions(query, binding(actor, path), allowed);
  if (
    (query.collegeId && !validCollege(query.collegeId)) ||
    (query.workshopId && !validSid(query.workshopId))
  )
    fail("invalid-argument", "Invalid college or workshop filter.");
  if (query.include && query.include !== "credits")
    fail("invalid-argument", "Only include=credits is supported.");
  return p;
}
async function queryPage(collection, p) {
  let q = collection.orderBy(FieldPath.documentId());
  if (p.after) q = q.startAfter(p.after);
  const result = await q.limit(p.limit + 1).get();
  return {
    docs: result.docs.slice(0, p.limit),
    nextCursor:
      result.size > p.limit ? p.cursor(result.docs[p.limit - 1].id) : null,
  };
}
export async function catalogRead(db, actor, path, query, audit) {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "colleges") {
    await admin(db, actor);
    if (parts.length === 2 && validCollege(parts[1])) {
      pageOptions(query, binding(actor, path));
      if (Object.keys(query).length)
        fail("invalid-argument", "College detail has no filters.");
      const r = (await db.doc(`learningColleges/${parts[1]}`).get()).data();
      if (!r) fail("not-found", "College unavailable.");
      return collegeDto(parts[1], r);
    }
    if (parts.length !== 1) return;
    const p = options(query, actor, path, ["status"]);
    if (query.status && !["active", "inactive"].includes(query.status))
      fail("invalid-argument", "Invalid college status.");
    const rows = await queryPage(db.collection("learningColleges"), p);
    return envelope(
      rows.docs
        .filter((d) => !query.status || d.data().status === query.status)
        .map((d) => collegeDto(d.id, d.data())),
      rows.nextCursor,
    );
  }
  if (
    parts[0] === "students" &&
    validUid(parts[1]) &&
    parts[2] === "college-memberships" &&
    parts.length === 3
  ) {
    if (parts[1] !== actor.uid) {
      await admin(db, actor);
      await audit("student.read", { studentId: parts[1] });
    }
    const privacy = (await db.doc(`learningPrivacy/${parts[1]}`).get()).data();
    if (privacyBlocked(privacy)) fail("not-found", "Resource unavailable.");
    const p = options(query, actor, path, ["workshopId", "collegeId"]);
    const rows = await queryPage(
        db.collection(`learningLearners/${parts[1]}/collegeMemberships`),
        p,
      ),
      items = [];
    for (const d of rows.docs) {
      const r = d.data();
      if (
        privacyBlocked(privacy, r.workshopId) ||
        (query.collegeId && r.collegeId !== query.collegeId) ||
        (query.workshopId && r.workshopId !== query.workshopId)
      )
        continue;
      items.push({
        studentId: parts[1],
        collegeId: r.collegeId,
        workshopId: r.workshopId,
        status: r.status,
        revision: r.revision,
        updatedAt: iso(r.updatedAt),
      });
    }
    return envelope(items, rows.nextCursor);
  }
  if (parts[0] === "workshops" && parts.length === 1) {
    await admin(db, actor);
    const p = options(query, actor, path, ["collegeId", "status"]);
    if (query.status && !["open", "closed"].includes(query.status))
      fail("invalid-argument", "Invalid workshop status.");
    const rows = await queryPage(db.collection("sessions"), p),
      items = [];
    for (const d of rows.docs) {
      const r = d.data();
      if (r.deleting) continue;
      const meta = (
        await db.doc(`learningWorkshopMetadata/${d.id}`).get()
      ).data();
      const status = r.completedAt ? "closed" : "open";
      if (
        (query.status && status !== query.status) ||
        (query.collegeId && meta?.collegeId !== query.collegeId)
      )
        continue;
      items.push({
        workshopId: d.id,
        workshopName: r.title || null,
        workshopStartDate: r.workshopDate || null,
        workshopEndDate: null,
        workshopTimezone: null,
        status,
        collegeId: meta?.collegeId || null,
        collegeRevision: meta?.collegeRevision || 0,
      });
    }
    return envelope(items, rows.nextCursor);
  }
  const studentScores = path === "/students/scores" || path === "/scores";
  const students =
    (parts[0] === "students" && parts.length === 1) || studentScores;
  const participants =
    parts[0] === "workshops" &&
    validSid(parts[1]) &&
    parts[2] === "participants" &&
    parts.length === 3;
  const scoreList =
    parts[0] === "workshops" &&
    validSid(parts[1]) &&
    parts[2] === "scores" &&
    parts.length === 3;
  if (!students && !participants && !scoreList) return;
  await admin(db, actor);
  const wid = students ? query.workshopId : parts[1];
  const p = options(
    query,
    actor,
    path,
    studentScores
      ? ["collegeId", "workshopId"]
      : students
        ? ["email", "collegeId", "workshopId", "include"]
        : scoreList
          ? ["collegeId"]
          : ["collegeId", "include"],
  );
  if (query.include === "credits" && !wid)
    fail("invalid-argument", "include=credits requires workshopId.");
  if (
    actor.apiTokenId &&
    (scoreList || query.include === "credits") &&
    !actor.apiScopes.includes("scores:read")
  )
    fail("permission-denied", "Scores permission required.");
  if (
    query.email &&
    (query.email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(query.email))
  )
    fail("invalid-argument", "Use an exact email.");
  await audit(
    query.email
      ? "student.lookup"
      : scoreList
        ? "scores.list"
        : "students.list",
    { workshopId: wid || null },
  );
  let exactUid;
  if (query.email) {
    const matches = await db
      .collection("learningLearners")
      .where("email", "==", query.email.trim().toLowerCase())
      .limit(2)
      .get();
    if (matches.size > 1) fail("failed-precondition", "Email is not unique.");
    exactUid = matches.docs[0]?.id;
    if (!exactUid) return envelope([]);
  }
  let candidates, nextCursor;
  if (exactUid) {
    candidates = !p.after || exactUid > p.after ? [{ uid: exactUid }] : [];
    nextCursor = null;
  } else if (query.collegeId) {
    const rows = await queryPage(
      db
        .collection("learningCollegeRoster")
        .where("collegeId", "==", query.collegeId),
      p,
    );
    candidates = rows.docs
      .filter(
        (d) =>
          d.data().status === "active" &&
          (!wid || d.data().workshopIds?.includes(wid)),
      )
      .map((d) => ({ uid: d.data().uid }));
    nextCursor = rows.nextCursor;
  } else if (wid) {
    const index = (await db.doc(`learningEnrollments/${wid}`).get()).data();
    const uids = [...new Set(index?.uids || [])]
      .filter(validUid)
      .sort()
      .filter((uid) => !p.after || uid > p.after)
      .slice(0, p.limit + 1);
    candidates = uids.slice(0, p.limit).map((uid) => ({ uid }));
    nextCursor = uids.length > p.limit ? p.cursor(uids[p.limit - 1]) : null;
  } else {
    const rows = await queryPage(db.collection("learningLearners"), p);
    candidates = rows.docs.map((d) => ({ uid: d.id, profile: d.data() }));
    nextCursor = rows.nextCursor;
  }
  const items = [];
  for (const candidate of candidates) {
    const uid = candidate.uid;
    if (
      (exactUid && exactUid !== uid) ||
      (actor.apiTokenId &&
        actor.apiStudentIds.length &&
        !actor.apiStudentIds.includes(uid))
    )
      continue;
    const privacy = (await db.doc(`learningPrivacy/${uid}`).get()).data();
    if (privacyBlocked(privacy, wid)) continue;
    const profile =
      candidate.profile ||
      (await db.doc(`learningLearners/${uid}`).get()).data();
    if (!profile) continue;
    const result = wid
      ? (await db.doc(`learningLearners/${uid}/workshops/${wid}`).get()).data()
      : null;
    if (wid && !result) continue;
    const collegeId = await collegeFor(db, uid, wid || "institutional");
    if (query.collegeId) {
      if (wid && collegeId !== query.collegeId) continue;
      if (!wid) {
        const pointer = (
          await db
            .doc(`learningCollegeRoster/${rosterId(query.collegeId, uid)}`)
            .get()
        ).data();
        if (pointer?.status !== "active") continue;
      }
    }
    const measures = wid ? scores(uid, wid, result) : null;
    if (studentScores)
      items.push({
        ...(await creditAccount(db, uid, privacy, wid)),
        collegeId,
      });
    else if (scoreList)
      items.push({
        studentId: uid,
        workshopId: wid,
        collegeId,
        scores: measures,
      });
    else
      items.push({
        studentId: uid,
        name: profile.name || null,
        email: profile.email || null,
        collegeId,
        profileRevision: profile.profileRevision || 0,
        learningPoints: Number.isFinite(profile.learningPoints)
          ? profile.learningPoints
          : null,
        ...(wid
          ? { workshopId: wid, completionStatus: result.status || null }
          : {}),
        ...(query.include === "credits" ? { credits: measures } : {}),
      });
  }
  return envelope(items, nextCursor);
}
