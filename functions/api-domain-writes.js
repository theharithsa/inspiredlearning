import { createHash } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { requireAdmin, correctProfile, reviewReason } from "./admin.js";
import { validUid, validSid } from "./model.js";
import { validCollege, rosterId } from "./college-model.js";
import { privacyBlocked } from "./erasure.js";
import { queue } from "./events.js";
const fail = (code, message) => {
  throw new HttpsError(code, message);
};
export function domainWriteRoute(method, path) {
  path = path.replace(/^\/api\/v1/, "");
  if (method === "POST" && path === "/colleges")
    return { kind: "college-create", scope: "colleges:write" };
  let m;
  if (method === "PUT" && (m = /^\/colleges\/([^/]+)$/.exec(path)))
    return { kind: "college", collegeId: m[1], scope: "colleges:write" };
  if (method === "PUT" && (m = /^\/workshops\/([^/]+)\/college$/.exec(path)))
    return {
      kind: "workshop-college",
      workshopId: m[1],
      scope: "workshops:college:write",
    };
  if (
    method === "PUT" &&
    (m = /^\/students\/([^/]+)\/(profile|college-membership)$/.exec(path))
  )
    return {
      kind: m[2] === "profile" ? "profile" : "membership",
      uid: m[1],
      scope:
        m[2] === "profile" ? "students:profile:write" : "memberships:write",
    };
  if (
    method === "PUT" &&
    (m =
      /^\/workshops\/([^/]+)\/participants\/([^/]+)\/college-membership$/.exec(
        path,
      ))
  )
    return {
      kind: "membership",
      workshopId: m[1],
      uid: m[2],
      scope: "memberships:write",
    };
  return null;
}
function inputFor(route, body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    fail("invalid-argument", "Use a JSON object.");
  const fields = {
    "college-create": ["collegeId", "name", "status", "reason"],
    college: ["name", "status", "reason", "expectedVersion"],
    "workshop-college": ["collegeId", "reason", "expectedVersion"],
    membership: ["collegeId", "status", "reason", "expectedVersion"],
    profile: ["name", "reason", "expectedVersion"],
  }[route.kind];
  if (Object.keys(body).some((k) => !fields.includes(k)))
    fail("invalid-argument", "Unsupported write field.");
  const reason = reviewReason(body),
    d = { ...body, reason };
  if (
    route.kind !== "college-create" &&
    (!Number.isInteger(d.expectedVersion) || d.expectedVersion < 0)
  )
    fail("invalid-argument", "Provide the current expectedVersion.");
  if (
    "name" in d &&
    (typeof d.name !== "string" ||
      !d.name.trim() ||
      d.name.length > (route.kind === "profile" ? 80 : 140))
  )
    fail("invalid-argument", "Invalid display name.");
  if (["college-create", "college", "profile"].includes(route.kind) && !d.name)
    fail("invalid-argument", "Name is required.");
  if (
    ["college-create", "college", "membership"].includes(route.kind) &&
    !["active", "inactive"].includes(d.status)
  )
    fail("invalid-argument", "Choose active or inactive status.");
  if (
    (route.collegeId && !validCollege(route.collegeId)) ||
    (["college-create", "workshop-college", "membership"].includes(
      route.kind,
    ) &&
      !validCollege(d.collegeId)) ||
    (route.uid && !validUid(route.uid)) ||
    (route.workshopId && !validSid(route.workshopId))
  )
    fail("invalid-argument", "Invalid resource ID.");
  if (d.name) d.name = d.name.trim();
  return d;
}
export async function writeDomain(
  db,
  actor,
  method,
  path,
  body,
  query,
  c,
  key,
) {
  const route = domainWriteRoute(method, path);
  if (!route) fail("not-found", "Write route unavailable.");
  if (Object.keys(query).length)
    fail("invalid-argument", "Writes have no query parameters.");
  if (actor.apiTokenId) {
    if (!actor.apiScopes.includes(route.scope))
      fail(
        "permission-denied",
        "The token lacks the required write permission.",
      );
    if (
      (route.uid &&
        actor.apiStudentIds.length &&
        !actor.apiStudentIds.includes(route.uid)) ||
      (route.workshopId &&
        actor.apiWorkshopIds.length &&
        !actor.apiWorkshopIds.includes(route.workshopId))
    )
      fail("not-found", "Resource unavailable.");
    if (route.uid && !route.workshopId && actor.apiWorkshopIds.length)
      fail(
        "permission-denied",
        "Workshop-restricted tokens cannot change global learner fields.",
      );
  }
  const d = inputFor(route, body);
  if (
    typeof key !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(key)
  )
    fail("invalid-argument", "A UUID Idempotency-Key is required.");
  const digest = (value) =>
    createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const requestHash = digest([method, path, Object.entries(d).sort()]),
    ref = db.doc(
      `learningApiOperations/${digest([actor.uid, actor.apiTokenId || null, key])}`,
    );
  return db.runTransaction(async (tx) => {
    await requireAdmin(tx, db, actor);
    const op = await tx.get(ref);
    if (route.uid) {
      const privacy = await tx.get(db.doc(`learningPrivacy/${route.uid}`));
      if (privacyBlocked(privacy.data(), route.workshopId))
        fail("failed-precondition", "Learner removal blocks this change.");
    }
    if (op.exists) {
      if (op.data().erased)
        fail(
          "failed-precondition",
          "The original request belongs to removed learning data.",
        );
      if (op.data().requestHash !== requestHash)
        fail(
          "already-exists",
          "Idempotency key was used for a different request.",
        );
      return op.data().result;
    }
    const now = Timestamp.now();
    let result;
    if (route.kind === "profile") {
      const changed = await correctProfile(
        tx,
        db,
        actor,
        { uid: route.uid, ...d },
        c,
      );
      result = { studentId: route.uid, revision: changed.profileRevision };
    } else if (["college", "college-create"].includes(route.kind)) {
      const id = route.collegeId || d.collegeId,
        collegeRef = db.doc(`learningColleges/${id}`),
        college = await tx.get(collegeRef),
        version = college.data()?.revision || 0;
      if (route.kind === "college-create" && college.exists)
        fail("already-exists", "College already exists.");
      if (route.kind === "college" && !college.exists)
        fail("not-found", "College unavailable.");
      if (route.kind === "college" && d.expectedVersion !== version)
        fail("failed-precondition", "College changed; reload its revision.");
      tx.set(collegeRef, {
        name: d.name,
        status: d.status,
        revision: version + 1,
        updatedAt: now,
      });
      tx.create(collegeRef.collection("versions").doc(String(version + 1)), {
        name: d.name,
        status: d.status,
        revision: version + 1,
        reason: d.reason,
        by: actor.uid,
        at: now,
      });
      queue(tx, db, "college.updated", actor, c, {
        "college.id": id,
        "resource.revision": version + 1,
      });
      result = { collegeId: id, revision: version + 1 };
    } else {
      const college = await tx.get(db.doc(`learningColleges/${d.collegeId}`));
      if (
        !college.exists ||
        (college.data().status !== "active" &&
          !(route.kind === "membership" && d.status === "inactive"))
      )
        fail("failed-precondition", "Select an active college.");
      if (route.kind === "workshop-college") {
        const [session, meta] = await Promise.all([
          tx.get(db.doc(`sessions/${route.workshopId}`)),
          tx.get(db.doc(`learningWorkshopMetadata/${route.workshopId}`)),
        ]);
        if (!session.exists || session.data().deleting)
          fail("not-found", "Workshop unavailable.");
        const version = meta.data()?.collegeRevision || 0;
        if (d.expectedVersion !== version)
          fail("failed-precondition", "Workshop college assignment changed.");
        tx.set(
          meta.ref,
          {
            collegeId: d.collegeId,
            collegeRevision: version + 1,
            updatedAt: now,
          },
          { merge: true },
        );
        tx.create(
          meta.ref.collection("collegeVersions").doc(String(version + 1)),
          {
            collegeId: d.collegeId,
            revision: version + 1,
            reason: d.reason,
            by: actor.uid,
            at: now,
          },
        );
        queue(tx, db, "workshop.college.assigned", actor, c, {
          "workshop.session.id": route.workshopId,
          "college.id": d.collegeId,
          "resource.revision": version + 1,
        });
        result = {
          workshopId: route.workshopId,
          collegeId: d.collegeId,
          revision: version + 1,
        };
      } else {
        const learner = await tx.get(db.doc(`learningLearners/${route.uid}`));
        if (!learner.exists) fail("not-found", "Learner unavailable.");
        if (route.workshopId) {
          const history = await tx.get(
            db.doc(
              `learningLearners/${route.uid}/workshops/${route.workshopId}`,
            ),
          );
          if (!history.exists)
            fail("not-found", "Permanent workshop participant unavailable.");
        }
        const membershipRef = db.doc(
            `learningLearners/${route.uid}/collegeMemberships/${route.workshopId || "institutional"}`,
          ),
          old = await tx.get(membershipRef),
          version = old.data()?.revision || 0;
        if (d.expectedVersion !== version)
          fail("failed-precondition", "College membership changed.");
        const collegeIds = [
          ...new Set([d.collegeId, old.data()?.collegeId].filter(Boolean)),
        ];
        const rosters = await Promise.all(
          collegeIds.map((id) =>
            tx.get(db.doc(`learningCollegeRoster/${rosterId(id, route.uid)}`)),
          ),
        );
        const updates = rosters.map((r) => {
          const id = collegeIds[rosters.indexOf(r)],
            row = r.data() || {
              uid: route.uid,
              collegeId: id,
              institutional: false,
              workshopIds: [],
            };
          const active = id === d.collegeId && d.status === "active";
          const workshopIds = new Set(row.workshopIds || []);
          if (route.workshopId) {
            workshopIds.delete(route.workshopId);
            if (active) workshopIds.add(route.workshopId);
          }
          const institutional = route.workshopId ? row.institutional : active;
          if (workshopIds.size > 1000)
            fail(
              "resource-exhausted",
              "College roster pointer has reached its supported bound.",
            );
          return {
            ref: r.ref,
            data: {
              uid: route.uid,
              collegeId: id,
              institutional,
              workshopIds: [...workshopIds].sort(),
              status: institutional || workshopIds.size ? "active" : "inactive",
              updatedAt: now,
            },
          };
        });
        const member = {
          collegeId: d.collegeId,
          workshopId: route.workshopId || null,
          status: d.status,
          revision: version + 1,
          updatedAt: now,
        };
        tx.set(membershipRef, member);
        tx.create(
          membershipRef.collection("versions").doc(String(version + 1)),
          { ...member, reason: d.reason, by: actor.uid },
        );
        for (const u of updates) tx.set(u.ref, u.data);
        queue(tx, db, "learner.college.membership.updated", actor, c, {
          "learner.id": route.uid,
          "college.id": d.collegeId,
          ...(route.workshopId
            ? { "workshop.session.id": route.workshopId }
            : {}),
          "resource.revision": version + 1,
        });
        result = {
          studentId: route.uid,
          collegeId: d.collegeId,
          ...(route.workshopId ? { workshopId: route.workshopId } : {}),
          revision: version + 1,
        };
      }
    }
    tx.create(ref, {
      requestHash,
      result,
      actorUid: actor.uid,
      ...(route.uid ? { uid: route.uid } : {}),
      createdAt: now,
    });
    return result;
  });
}
