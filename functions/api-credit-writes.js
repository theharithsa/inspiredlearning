import { createHash } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";
import { queue } from "./events.js";
const fail = (code, message) => {
  throw new HttpsError(code, message);
};
const hash = (v) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const validSource = (v) =>
  typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v);
export function validateCreditWrite(route, d) {
  if (!Number.isSafeInteger(d.credits) || Math.abs(d.credits) > 1e9)
    fail(
      "invalid-argument",
      "credits must be a signed integer between -1000000000 and 1000000000.",
    );
  if (
    route.kind === "credit-create" &&
    (!validSource(d.sourceId) ||
      !validSource(d.eventId) ||
      (d.activityId !== undefined && !validSource(d.activityId)))
  )
    fail(
      "invalid-argument",
      "Use stable sourceId/eventId and optional activityId (letters, numbers, underscores or hyphens).",
    );
  if (
    route.kind === "credit-update" &&
    !/^[a-f0-9]{64}$/.test(route.contributionId)
  )
    fail("invalid-argument", "Invalid contributionId.");
}
export async function creditWrite(
  tx,
  db,
  actor,
  c,
  route,
  d,
  now,
  operationId,
) {
  const uid = route.uid,
    root = db.doc(`learningLearners/${uid}`),
    profile = await tx.get(root);
  if (!profile.exists) fail("not-found", "Learner unavailable.");
  const id = route.contributionId || hash([d.sourceId, d.eventId]),
    ref = root.collection("creditContributions").doc(id),
    current = await tx.get(ref);
  const old = current.data(),
    guard = db.doc(`learningCreditEventGuards/${hash([uid, id])}`),
    marker = await tx.get(guard);
  if (marker.data()?.erased)
    fail(
      "failed-precondition",
      "This source event belongs to removed learning data; use a new event for new activity.",
    );
  const creationHash =
    route.kind === "credit-create" ? hash(Object.entries(d).sort()) : null;
  if (route.kind === "credit-create" && old) {
    if (old.creationHash !== creationHash)
      fail(
        "already-exists",
        "Source event already exists with different settings. Correct its contribution with PUT.",
      );
    return old.initialResult;
  }
  if (route.kind === "credit-update" && !old)
    fail("not-found", "Credit contribution unavailable.");
  if (old && d.expectedVersion !== old.revision)
    fail(
      "failed-precondition",
      "Credit contribution changed; reload its revision.",
    );
  const entries = await tx.get(root.collection("creditEntries").limit(501));
  if (entries.size >= 500)
    fail(
      "resource-exhausted",
      "Credit account requires archival before another adjustment.",
    );
  // The account remains the sum of immutable deltas, never an overwritten student balance.
  const revision = (old?.revision || 0) + 1,
    before = old?.credits || 0,
    delta = d.credits - before;
  const provenance = old
    ? {
        sourceId: old.sourceId,
        eventId: old.eventId,
        activityId: old.activityId,
      }
    : {
        sourceId: d.sourceId,
        eventId: d.eventId,
        activityId: d.activityId || null,
      };
  const result = {
    studentId: uid,
    contributionId: id,
    revision,
    credits: d.credits,
    delta,
  };
  const entryId = `activity_${operationId}`;
  tx.create(root.collection("creditEntries").doc(entryId), {
    sourceType: "activity",
    ...provenance,
    contributionId: id,
    delta,
    revision,
    at: now,
  });
  tx.create(root.collection("creditTransactions").doc(entryId), {
    sourceType: "activity",
    ...provenance,
    contributionId: id,
    workshopId: null,
    revision,
    policy: "external-activity-contribution-v1",
    before,
    after: d.credits,
    delta,
    reason: d.reason,
    at: now,
  });
  tx.create(ref.collection("versions").doc(String(revision)), {
    credits: d.credits,
    delta,
    revision,
    reason: d.reason,
    by: actor.uid,
    at: now,
  });
  tx.set(ref, {
    ...provenance,
    credits: d.credits,
    revision,
    updatedAt: now,
    ...(!old
      ? { creationHash, initialResult: result }
      : { creationHash: old.creationHash, initialResult: old.initialResult }),
  });
  tx.set(guard, { uid, erased: false });
  queue(tx, db, "student.credits.external-adjusted", actor, c, {
    "learner.id": uid,
    "credits.contribution.id": id,
    "credits.source.id": provenance.sourceId,
    "credits.event.id": provenance.eventId,
    "credits.delta": delta,
    "resource.revision": revision,
  });
  return result;
}
