import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { privacyBlocked } from "./erasure.js";
import { queue } from "./events.js";
export const CREDIT_POLICY = "team-plus-individual-attendance-bonus-v1";
// Individual credits intentionally count again even when already included in the team score.
export function workshopCredits(r) {
  if (r?.status !== "completed") return 0;
  if (!Number.isFinite(r.teamCredits) || !Number.isFinite(r.personalCredits))
    return null;
  const value = r.teamCredits + r.personalCredits;
  return Number.isFinite(value) ? value : null;
}
export function recordCreditTransition(
  tx,
  db,
  actor,
  c,
  uid,
  sid,
  previous,
  next,
  reason,
) {
  const before = workshopCredits(previous),
    after = workshopCredits(next);
  tx.create(
    db.doc(
      `learningLearners/${uid}/creditTransactions/${sid}__${next.revision}`,
    ),
    {
      sourceType: "workshop",
      workshopId: sid,
      revision: next.revision,
      policy: CREDIT_POLICY,
      before,
      after,
      delta: before === null || after === null ? null : after - before,
      reason,
      at: FieldValue.serverTimestamp(),
    },
  );
  queue(tx, db, "student.credits.adjusted", actor, c, {
    "learner.id": uid,
    "workshop.session.id": sid,
    "result.revision": next.revision,
    "credits.before": before,
    "credits.after": after,
    "credits.policy": CREDIT_POLICY,
  });
}
// Latest source records are authoritative: historical snapshots need no mutation or republishing.
// Non-workshop entries are signed, immutable contributions for future community producers.
export async function creditAccount(db, uid, privacy, workshopId) {
  const [history, entries, marker] = await db.runTransaction((tx) =>
    Promise.all([
      tx.get(db.collection(`learningLearners/${uid}/workshops`).limit(501)),
      tx.get(db.collection(`learningLearners/${uid}/creditEntries`).limit(501)),
      tx.get(db.doc(`learningPrivacy/${uid}`)),
    ]),
  );
  privacy = marker.data() || privacy;
  if (privacyBlocked(privacy, workshopId))
    throw new HttpsError("not-found", "Resource unavailable.");
  if (history.size > 500 || entries.size > 500)
    throw new HttpsError(
      "resource-exhausted",
      "Credit account exceeds the supported 500 records per source; no partial total is returned.",
    );
  let knownCredits = 0,
    unknownAwards = 0,
    contributionCount = 0;
  for (const row of history.docs) {
    const r = row.data();
    if (
      r.status !== "completed" ||
      privacyBlocked(privacy, row.id) ||
      (workshopId && row.id !== workshopId)
    )
      continue;
    const credits = workshopCredits(r);
    contributionCount++;
    if (credits === null) unknownAwards++;
    else knownCredits += credits;
  }
  for (const row of entries.docs) {
    const r = row.data();
    if (
      r.sourceType === "workshop" ||
      privacyBlocked(privacy, r.workshopId) ||
      (workshopId && r.workshopId !== workshopId)
    )
      continue;
    contributionCount++;
    if (!Number.isFinite(r.delta)) unknownAwards++;
    else knownCredits += r.delta;
  }
  if (!Number.isFinite(knownCredits))
    throw new HttpsError(
      "resource-exhausted",
      "Credit total exceeds the supported numeric range.",
    );
  return {
    studentId: uid,
    totalCredits: unknownAwards ? null : knownCredits,
    knownCredits,
    unknownAwards,
    contributionCount,
    unit: "credits",
    policy: CREDIT_POLICY,
    ...(workshopId ? { workshopId } : {}),
    asOf: new Date().toISOString(),
  };
}
