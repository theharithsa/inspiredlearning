import { certificateRendering } from "./pdf.js";
import { creditAccount } from "./credits.js";
import { catalogRead } from "./api-catalog.js";
import { collegeFor } from "./college-model.js";
import { checkTokenAccess, filterTokenResult } from "./api-token-policy.js";
import { createHash } from "node:crypto";
import { FieldPath } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { validUid, validSid } from "./model.js";
import { privacyBlocked } from "./erasure.js";
import { staffRole } from "./actions.js";
const fail = (code, message) => {
  throw new HttpsError(code, message);
};
export const iso = (v) =>
  v?.toDate?.().toISOString() || (typeof v === "string" ? v : null);
export function googleActor(uid, t) {
  if (
    !validUid(uid) ||
    !t?.email ||
    !t.email_verified ||
    t.firebase?.sign_in_provider !== "google.com"
  )
    fail("unauthenticated", "Sign in with Google.");
  return { uid, email: t.email, name: t.name };
}
export function pageOptions(query, scope, allowed = []) {
  if (
    Object.keys(query).some(
      (k) => !["limit", "cursor", ...allowed].includes(k),
    ) ||
    Object.values(query).some((v) => typeof v !== "string" || v.length > 2048)
  )
    fail("invalid-argument", "Unknown or repeated query parameter.");
  const limit = query.limit === undefined ? 25 : Number(query.limit);
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    (query.limit && !/^\d+$/.test(query.limit))
  )
    fail("invalid-argument", "limit must be 1–100.");
  const binding = createHash("sha256")
    .update(
      JSON.stringify([
        scope,
        Object.entries(query)
          .filter(([k]) => k !== "cursor" && k !== "limit")
          .sort(),
      ]),
    )
    .digest("hex");
  let after;
  if (query.cursor) {
    try {
      const c = JSON.parse(Buffer.from(query.cursor, "base64url"));
      if (
        c.binding !== binding ||
        typeof c.id !== "string" ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(c.id)
      )
        throw Error();
      after = c.id;
    } catch {
      fail("invalid-argument", "Invalid cursor for this request.");
    }
  }
  return {
    limit,
    after,
    cursor: (id) =>
      Buffer.from(JSON.stringify({ binding, id })).toString("base64url"),
  };
}
const envelope = (items, nextCursor = null) => ({
  items,
  nextCursor,
  asOf: new Date().toISOString(),
});
const dimensions = (uid, sid, r) => ({
  studentId: uid,
  workshopId: sid,
  workshopName: r.title || null,
  workshopStartDate: r.date || null,
  workshopEndDate: null,
  workshopTimezone: null,
});
export function scores(uid, sid, r) {
  return [
    ["individualCredits", r.personalCredits, "credits"],
    ["teamCredits", r.teamCredits, "credits"],
    ["learningPoints", r.learningPoints, "points"],
  ].map(([metric, value, unit]) => ({
    ...dimensions(uid, sid, r),
    metric,
    value:
      ["completed", "revoked"].includes(r.status) && Number.isFinite(value)
        ? value
        : null,
    unit,
    scoringVersion: metric === "learningPoints" ? r.pointsPolicy || null : null,
    source: "InspiredLearning.published-result",
    publicationStatus:
      r.status === "completed"
        ? "published"
        : r.status === "revoked"
          ? "revoked"
          : "unpublished",
    revision: r.revision ?? null,
    asOf: iso(r.finalizedAt),
  }));
}
const workshop = (uid, sid, r) => ({
  ...dimensions(uid, sid, r),
  status: r.status || null,
  teamId: r.teamId || null,
  role: r.role || null,
  revision: r.revision ?? null,
  certificateId: r.certificateId || null,
});
const certificate = (id, r) => ({
  certificateId: id,
  studentId: r.uid,
  workshopId: r.sid,
  name: r.name || null,
  title: r.title || null,
  date: r.date || null,
  status: r.status,
  revision: r.revision ?? null,
  issuedAt: iso(r.issuedAt),
  kind: r.kind === "award" ? "award" : "participation",
  awardTitle: r.awardTitle || null,
  awards: r.awards || [],
  parentCertificateId: r.parentCertificateId || null,
  verificationPath: `/#/verify/${id}`,
});
async function readResources(
  db,
  actor,
  path,
  query = {},
  audit = async () => {},
) {
  path = path.replace(/^\/api\/v1/, "");
  if (path === "/me" || path.startsWith("/me/"))
    path = path.replace("/me", `/students/${actor.uid}`);
  const nested =
    /^\/workshops\/([^/]+)\/participants\/([^/]+)\/(scores|submissions)$/.exec(
      path,
    );
  if (nested) {
    if (Object.keys(query).length)
      fail("invalid-argument", "Nested result reads have no query parameters.");
    return readResources(
      db,
      actor,
      `/students/${nested[2]}/${nested[3]}`,
      { workshopId: nested[1] },
      audit,
    );
  }
  const catalog = await catalogRead(db, actor, path, query, audit);
  if (catalog !== undefined) return catalog;
  const parts = path.split("/").filter(Boolean);
  const admin = async () => {
    const a = await db.doc(`admins/${actor.email}`).get();
    return a.exists && (a.data().role || "facilitator") === "facilitator";
  };
  const privacy = async (uid, sid) => {
    const p = await db.doc(`learningPrivacy/${uid}`).get();
    if (privacyBlocked(p.data(), sid))
      fail("not-found", "Resource unavailable.");
    return p.data();
  };
  const authorize = async (uid) => {
    if (uid !== actor.uid) {
      if (!(await admin()))
        fail("permission-denied", "Owner or facilitator required.");
      await audit("student.read", { studentId: uid });
    }
  };
  async function page(
    collection,
    scope,
    map,
    filter = () => true,
    allowed = [],
  ) {
    const p = pageOptions(
      query,
      `${actor.uid}:${actor.apiTokenId || "interactive"}:${scope}`,
      allowed,
    );
    let q = collection.orderBy(FieldPath.documentId());
    if (p.after) q = q.startAfter(p.after);
    const s = await q.limit(p.limit + 1).get();
    const docs = s.docs.slice(0, p.limit);
    const items = [];
    for (const d of docs)
      if (await filter(d.data(), d.id)) items.push(map(d.id, d.data()));
    return envelope(items, s.size > p.limit ? p.cursor(docs.at(-1).id) : null);
  }
  if (
    parts[0] === "students" &&
    validUid(parts[1]) &&
    (parts.length <= 3 ||
      (parts.length === 4 && parts[2] === "credit-contributions"))
  ) {
    const uid = parts[1];
    await authorize(uid);
    const p = await privacy(uid);
    if (parts.length === 2) {
      pageOptions(query, path);
      if (Object.keys(query).length)
        fail("invalid-argument", "Detail has no query parameters.");
      const r = (await db.doc(`learningLearners/${uid}`).get()).data();
      if (!r) fail("not-found", "Resource unavailable.");
      return {
        studentId: uid,
        name: r.name || null,
        email: r.email || null,
        collegeId: await collegeFor(db, uid),
        profileRevision: r.profileRevision || 0,
        learningPoints: Number.isFinite(r.learningPoints)
          ? r.learningPoints
          : null,
      };
    }
    if (parts[2] === "credit-contributions") {
      if (
        Object.keys(query).length ||
        parts.length !== 4 ||
        !/^[a-f0-9]{64}$/.test(parts[3])
      )
        fail("invalid-argument", "Use one contributionId with no filters.");
      const r = (
        await db
          .doc(`learningLearners/${uid}/creditContributions/${parts[3]}`)
          .get()
      ).data();
      if (!r) fail("not-found", "Contribution unavailable.");
      return {
        studentId: uid,
        contributionId: parts[3],
        credits: r.credits,
        revision: r.revision,
        sourceId: r.sourceId,
        eventId: r.eventId,
        activityId: r.activityId,
        updatedAt: iso(r.updatedAt),
      };
    }
    if (parts[2] === "credit-transactions") {
      if (query.workshopId && !validSid(query.workshopId))
        fail("invalid-argument", "Invalid workshopId.");
      return page(
        db.collection(`learningLearners/${uid}/creditTransactions`),
        path,
        (id, r) => ({
          transactionId: id,
          studentId: uid,
          workshopId: r.workshopId || null,
          sourceType: r.sourceType,
          ...(r.sourceType === "activity"
            ? {
                sourceId: r.sourceId,
                eventId: r.eventId,
                activityId: r.activityId,
                contributionId: r.contributionId,
              }
            : {}),
          revision: r.revision,
          policy: r.policy,
          before: r.before,
          after: r.after,
          delta: r.delta,
          at: iso(r.at),
        }),
        (r) =>
          !privacyBlocked(p, r.workshopId) &&
          (!query.workshopId || r.workshopId === query.workshopId),
        ["workshopId"],
      );
    }
    if (parts[2] === "workshops")
      return page(
        db.collection(`learningLearners/${uid}/workshops`),
        path,
        (id, r) => workshop(uid, id, r),
        (r, id) => !privacyBlocked(p, id),
      );
    if (parts[2] === "certificates")
      return page(
        db.collection("learningCertificates").where("uid", "==", uid),
        path,
        certificate,
        (r) => !privacyBlocked(p, r.sid),
      );
    if (parts[2] === "scores" && !query.workshopId) {
      pageOptions(query, `${actor.uid}:${path}`);
      if (Object.keys(query).length)
        fail("invalid-argument", "Global score has no pagination parameters.");
      const profile = await db.doc(`learningLearners/${uid}`).get();
      if (!profile.exists) fail("not-found", "Resource unavailable.");
      return creditAccount(db, uid, p);
    }
    if (["scores", "participation", "submissions"].includes(parts[2])) {
      pageOptions(query, `${actor.uid}:${path}`, ["workshopId"]);
      if (!validSid(query.workshopId))
        fail("invalid-argument", "workshopId required for bounded reads.");
      if (query.cursor || query.limit)
        fail(
          "invalid-argument",
          "Single-workshop reads do not accept pagination.",
        );
      await privacy(uid, query.workshopId);
      const r = (
        await db
          .doc(`learningLearners/${uid}/workshops/${query.workshopId}`)
          .get()
      ).data();
      if (!r) fail("not-found", "Resource unavailable.");
      if (parts[2] === "submissions") {
        const answers = ["completed", "revoked"].includes(r.status)
          ? Object.entries(r.personalQuiz || {}).filter(([key]) =>
              /^\d{1,3}$/.test(key),
            )
          : [];
        if (answers.length > 100)
          fail(
            "resource-exhausted",
            "Submission summary exceeds the supported bound.",
          );
        return envelope(
          answers.map(([questionId, answer]) => ({
            ...dimensions(uid, query.workshopId, r),
            activityId: "cloud-or-not",
            questionId,
            answer: Number.isInteger(answer?.answer) ? answer.answer : null,
            correct:
              typeof answer?.correct === "boolean" ? answer.correct : null,
            awardedCredits: Number.isFinite(answer?.credits)
              ? answer.credits
              : null,
            submittedAt: null,
            source: "InspiredLearning.published-result",
            publicationStatus:
              r.status === "completed" ? "published" : "revoked",
          })),
        );
      }
      if (
        parts[2] === "participation" &&
        (r.personalActivities?.length || 0) + (r.teamActivities?.length || 0) >
          100
      )
        fail(
          "resource-exhausted",
          "Participation summary exceeds the supported bound.",
        );
      if (parts[2] === "scores")
        return envelope(scores(uid, query.workshopId, r));
      if (!["completed", "revoked"].includes(r.status)) return envelope([]);
      return envelope(
        ["personalActivities", "teamActivities"].flatMap((k) =>
          (r[k] || []).map((activityId) => ({
            ...dimensions(uid, query.workshopId, r),
            activityId,
            scope: k === "personalActivities" ? "individual" : "team",
            status: "recorded-in-result",
            reviewStatus: null,
            submittedAt: null,
            awardedCredits: null,
            source: "InspiredLearning.published-result",
          })),
        ),
      );
    }
  }
  if (parts[0] === "workshops" && validSid(parts[1]) && parts.length === 2) {
    pageOptions(query, path);
    if (Object.keys(query).length)
      fail("invalid-argument", "Detail has no query parameters.");
    const sid = parts[1];
    await privacy(actor.uid, sid);
    if (!(await admin())) {
      const r = await db
        .doc(`learningLearners/${actor.uid}/workshops/${sid}`)
        .get();
      if (!r.exists) await staffRole(db, actor, sid);
    }
    const r = (await db.doc(`sessions/${sid}`).get()).data();
    if (!r || r.deleting) fail("not-found", "Resource unavailable.");
    const meta = (await db.doc(`learningWorkshopMetadata/${sid}`).get()).data();
    return {
      workshopId: sid,
      workshopName: r.title || null,
      workshopStartDate: r.workshopDate || null,
      workshopEndDate: null,
      workshopTimezone: null,
      status: r.completedAt ? "closed" : "open",
      collegeId: meta?.collegeId || null,
      collegeRevision: meta?.collegeRevision || 0,
    };
  }
  if (path === "/certificates") {
    if (actor.apiTokenId || !(await admin()))
      fail(
        "permission-denied",
        "Google-authenticated facilitator access required.",
      );
    const opts = pageOptions(query, actor.uid + path, [
      "workshopId",
      "studentId",
      "status",
      "kind",
    ]);
    if (
      (query.workshopId && !validSid(query.workshopId)) ||
      (query.studentId && !validUid(query.studentId)) ||
      (query.status && !["issued", "revoked"].includes(query.status)) ||
      (query.kind && !["participation", "award"].includes(query.kind))
    )
      fail("invalid-argument", "Invalid certificate filter.");
    let q = db
      .collection("learningCertificates")
      .orderBy(FieldPath.documentId());
    if (opts.after) q = q.startAfter(opts.after);
    const found = await q.limit(opts.limit).get(),
      items = [];
    for (const d of found.docs) {
      const r = d.data();
      if (
        (query.workshopId && r.sid !== query.workshopId) ||
        (query.studentId && r.uid !== query.studentId) ||
        (query.status && r.status !== query.status) ||
        (query.kind && (r.kind || "participation") !== query.kind)
      )
        continue;
      const p = (await db.doc(`learningPrivacy/${r.uid}`).get()).data();
      if (!privacyBlocked(p, r.sid)) items.push(certificate(d.id, r));
    }
    await audit("certificates.list", {
      count: items.length,
      workshopId: query.workshopId || null,
    });
    return {
      ...envelope(
        items,
        found.size === opts.limit ? opts.cursor(found.docs.at(-1).id) : null,
      ),
      rendering: certificateRendering(),
    };
  }
  if (
    parts[0] === "certificates" &&
    /^[0-9a-f-]{36}$/.test(parts[1]) &&
    parts.length === 2
  ) {
    pageOptions(query, path);
    if (Object.keys(query).length)
      fail("invalid-argument", "Detail has no query parameters.");
    const r = (await db.doc(`learningCertificates/${parts[1]}`).get()).data();
    if (!r || (r.uid !== actor.uid && !(await admin())))
      fail("not-found", "Resource unavailable.");
    await authorize(r.uid);
    await privacy(r.uid, r.sid);
    return certificate(parts[1], r);
  }
  fail("not-found", "Route unavailable.");
}

export async function readApi(
  db,
  actor,
  path,
  query = {},
  audit = async () => {},
) {
  checkTokenAccess(actor, path, query);
  return filterTokenResult(
    actor,
    await readResources(db, actor, path, query, audit),
  );
}
