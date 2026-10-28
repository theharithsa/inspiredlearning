import { HttpsError } from "firebase-functions/v2/https";
import { requireAdmin } from "./admin.js";
// Existing token-creation recency policy, reused by v2 administrative step-up.
export const RECENT_AUTH_SECONDS = 300;
export function requireRecentAuth(authTime, now = Date.now() / 1000) {
  const age = now - authTime;
  if (
    typeof authTime !== "number" ||
    !Number.isFinite(age) ||
    age < -60 ||
    age > RECENT_AUTH_SECONDS
  )
    throw new HttpsError(
      "failed-precondition",
      "Verify your identity with Google again before this administrator action.",
      { reauthenticationRequired: true },
    );
}
export const sensitiveAdminActions = new Set([
  "sync",
  "attendance",
  "attendanceBatch",
  "close",
  "finalize",
  "revoke",
  "correctCertificate",
  "eraseLearner",
  "updateLearner",
  "restoreCompletion",
  "reviewRequest",
]);
export async function requireAdminStepUp(db, actor) {
  if (actor.apiTokenId)
    throw new HttpsError(
      "permission-denied",
      "Google administrator sign-in required.",
    );
  await requireAdmin({ get: (ref) => ref.get() }, db, actor);
  requireRecentAuth(actor.authTime);
}
export async function checkCallableStepUp(db, actor, action) {
  if (!sensitiveAdminActions.has(action)) return;
  const role = (await db.doc(`admins/${actor.email}`).get()).data();
  if (role && (role.role || "facilitator") === "facilitator")
    requireRecentAuth(actor.authTime);
}
export async function adminAccess(db, actor, query, audit) {
  if (actor.apiTokenId)
    throw new HttpsError(
      "permission-denied",
      "Google administrator sign-in required.",
    );
  await requireAdmin({ get: (ref) => ref.get() }, db, actor);
  if (Object.keys(query).length)
    throw new HttpsError(
      "invalid-argument",
      "Administrator access accepts no filters.",
    );
  await audit("admin.access", {});
  return {
    administrator: true,
    capabilities: [
      "workshops",
      "learners",
      "certificates",
      "requests",
      "integrations",
      "delivery",
    ],
    recentAuthMaxAgeSeconds: RECENT_AUTH_SECONDS,
  };
}
