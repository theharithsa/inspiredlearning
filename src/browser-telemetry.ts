// No Firebase initialization: public verification/privacy pages can import API helpers.
const apiRoutes = [
  "/me/credit-transactions",
  "/admin/telemetry/health",
  "/admin/telemetry/events",
  "/admin/api-tokens",
  "/me/certificates",
  "/students/scores",
  "/me/workshops",
  "/certificates",
  "/admin/access",
  "/workshops",
  "/me/scores",
  "/students",
  "/colleges",
  "/scores",
  "/me",
  "/public/certificates/{certificateId}/verification",
  "/workshops/{workshopId}/certificates/reconcile",
  "/admin/telemetry/events/{recordId}/redrive",
  "/students/{studentId}/college-memberships",
  "/students/{studentId}/credit-transactions",
  "/students/{studentId}/college-membership",
  "/workshops/{workshopId}/participants",
  "/students/{studentId}/participation",
  "/students/{studentId}/certificates",
  "/students/{studentId}/submissions",
  "/students/{studentId}/workshops",
  "/workshops/{workshopId}/college",
  "/workshops/{workshopId}/scores",
  "/certificates/{certificateId}",
  "/students/{studentId}/profile",
  "/students/{studentId}/credits",
  "/students/{studentId}/scores",
  "/admin/api-tokens/{tokenId}",
  "/workshops/{workshopId}",
  "/students/{studentId}",
  "/colleges/{collegeId}",
  "/workshops/{workshopId}/participants/{studentId}/college-membership",
  "/workshops/{workshopId}/participants/{studentId}/submissions",
  "/students/{studentId}/credit-contributions/{contributionId}",
  "/workshops/{workshopId}/participants/{studentId}/scores",
];
export function routeTemplate(path: string, api = false): string {
  const clean = path.split(/[?#]/, 1)[0];
  if (api) {
    const relative = clean.replace(/^\/api\/v1/, "");
    return (
      apiRoutes.find((route) =>
        new RegExp("^" + route.replace(/\{[^}]+\}/g, "[^/]+") + "$").test(
          relative,
        ),
      ) || "unknown"
    );
  }
  if (/^\/workshops\/[^/]+$/.test(clean)) return "/workshops/:workshopId";
  return [
    "/",
    "/workshops",
    "/certificates",
    "/community",
    "/profile",
    "/staff",
    "/admin",
    "/settings",
    "/learners",
    "/requests",
    "/integrations",
    "/delivery",
    "/privacy",
    "/verify",
  ].includes(clean)
    ? clean
    : "unknown";
}
export function browserRoute(): string {
  return routeTemplate(
    location.hash.startsWith("#/") ? location.hash.slice(1) : location.pathname,
  );
}
const expected = new Set([
  "unauthenticated",
  "permission-denied",
  "invalid-argument",
  "not-found",
  "already-exists",
  "failed-precondition",
  "resource-exhausted",
  "cancelled",
]);
export function outcome(
  error?: unknown,
  status?: number,
): { outcome: string; errorKind: string } {
  if (
    error === undefined &&
    (status === undefined || (status >= 200 && status < 300))
  )
    return { outcome: "success", errorKind: "none" };
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code).replace(/^functions\//, "")
      : "";
  if (expected.has(code))
    return {
      outcome: code === "cancelled" ? "cancelled" : "rejected",
      errorKind: code,
    };
  if (status && [400, 401, 403, 404, 409, 412, 422, 429].includes(status))
    return { outcome: "rejected", errorKind: "http-" + status };
  return { outcome: "failure", errorKind: status ? "http-error" : "technical" };
}
type Sink = (name: string, fields: Record<string, unknown>) => void;
let sink: Sink | undefined;
export function registerTelemetry(value: Sink) {
  sink = value;
}
export function observeRequest(fields: Record<string, unknown>) {
  try {
    sink?.("api.request.completed", fields);
  } catch {
    /* Telemetry cannot affect a request. */
  }
}
