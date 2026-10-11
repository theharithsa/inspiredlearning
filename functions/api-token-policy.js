import { HttpsError } from "firebase-functions/v2/https";
export const API_PERMISSIONS = [
  { scope: "students:read", label: "Learner profiles" },
  { scope: "students:lookup", label: "Exact learner email lookup" },
  { scope: "history:read", label: "Workshop history" },
  { scope: "scores:read", label: "Published scores" },
  { scope: "participation:read", label: "Participation summaries" },
  { scope: "submissions:read", label: "Published quiz answers" },
  { scope: "certificates:read", label: "Certificate metadata" },
  { scope: "workshops:read", label: "Workshop details" },
  { scope: "colleges:read", label: "College records" },
  { scope: "memberships:read", label: "College memberships" },
  { scope: "colleges:write", label: "Create and update colleges" },
  { scope: "workshops:college:write", label: "Assign workshop colleges" },
  { scope: "memberships:write", label: "Correct learner college memberships" },
  { scope: "students:profile:write", label: "Correct learner names" },
];
const unavailable = () => {
  throw new HttpsError("not-found", "Resource unavailable.");
};
export function checkTokenAccess(actor, path, query) {
  if (!actor.apiTokenId) return;
  path = path
    .replace(/^\/api\/v1/, "")
    .replace(/^\/me(?=\/|$)/, `/students/${actor.uid}`);
  const parts = path.split("/").filter(Boolean);
  let scope;
  if (parts[0] === "students")
    scope =
      parts.length === 1
        ? query.email
          ? "students:lookup"
          : "students:read"
        : parts.length === 2
          ? "students:read"
          : {
              "college-memberships": "memberships:read",
              workshops: "history:read",
              scores: "scores:read",
              "credit-transactions": "scores:read",
              participation: "participation:read",
              submissions: "submissions:read",
              certificates: "certificates:read",
            }[parts[2]];
  if (path === "/students/scores" || path === "/scores") scope = "scores:read";
  const globalScores =
    (path === "/students/scores" ||
      path === "/scores" ||
      (parts[0] === "students" &&
        ["scores", "credit-transactions"].includes(parts[2]))) &&
    !query.workshopId;
  if (actor.apiWorkshopIds.length && globalScores)
    throw new HttpsError(
      "permission-denied",
      "Workshop-restricted tokens require a workshopId filter for scores.",
    );
  if (parts[0] === "colleges") scope = "colleges:read";
  if (parts[0] === "workshops") {
    scope =
      parts.length <= 2
        ? "workshops:read"
        : parts[2] === "scores"
          ? "scores:read"
          : parts[2] === "participants"
            ? parts[4] === "scores"
              ? "scores:read"
              : parts[4] === "submissions"
                ? "submissions:read"
                : "students:read"
            : undefined;
    if (
      parts[3] &&
      actor.apiStudentIds.length &&
      !actor.apiStudentIds.includes(parts[3])
    )
      unavailable();
  }
  if (parts[0] === "certificates" && parts.length === 2)
    scope = "certificates:read";
  if (!scope || !actor.apiScopes.includes(scope))
    throw new HttpsError(
      "permission-denied",
      "This API token does not have the required permission.",
    );
  if (
    parts[0] === "students" &&
    parts[1] &&
    path !== "/students/scores" &&
    actor.apiStudentIds.length &&
    !actor.apiStudentIds.includes(parts[1])
  )
    unavailable();
  const workshopId = parts[0] === "workshops" ? parts[1] : query.workshopId;
  if (
    workshopId &&
    actor.apiWorkshopIds.length &&
    !actor.apiWorkshopIds.includes(workshopId)
  )
    unavailable();
}
export function filterTokenResult(actor, result) {
  if (!actor.apiTokenId) return result;
  const permitted = (r) =>
    (!r.studentId ||
      !actor.apiStudentIds.length ||
      actor.apiStudentIds.includes(r.studentId)) &&
    (!r.workshopId ||
      !actor.apiWorkshopIds.length ||
      actor.apiWorkshopIds.includes(r.workshopId));
  if (Array.isArray(result.items))
    return { ...result, items: result.items.filter(permitted) };
  if (!permitted(result)) unavailable();
  return result;
}
