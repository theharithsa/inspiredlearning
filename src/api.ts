import {
  observeRequest,
  routeTemplate,
  outcome,
  browserRoute,
} from "./browser-telemetry";
export async function apiJson<T>(
  response: Response,
  fallback: string,
): Promise<T> {
  let result: { error?: { message?: unknown } } | null = null;
  if (response.headers.get("content-type")?.includes("application/json")) {
    try {
      result = await response.json();
    } catch {
      /* bounded fallback below */
    }
  }
  if (!response.ok || !result) {
    const message = result?.error?.message;
    throw new Error(typeof message === "string" ? message : fallback);
  }
  return result as T;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  fallback = "Could not complete the request.",
): Promise<T> {
  if (!path.startsWith("/api/v1/") || path.includes("://"))
    throw new Error("Unsupported API path.");
  const target = new URL(path, location.origin);
  if (
    target.origin !== location.origin ||
    !target.pathname.startsWith("/api/v1/") ||
    target.hash
  )
    throw new Error("Unsupported API path.");
  const { auth } = await import("./firebase");
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in with Google.");
  const { isAdminApp } = await import("./surface");
  if (
    isAdminApp &&
    options.method &&
    !["GET", "HEAD"].includes(options.method.toUpperCase())
  )
    await (await import("./reauth")).ensureRecentAdminAuth();
  if (auth.currentUser?.uid !== user.uid)
    throw new Error("Your signed-in account changed. Review the action again.");
  const token = await user.getIdToken();
  if (auth.currentUser?.uid !== user.uid)
    throw new Error("Your signed-in account changed.");
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (options.body) headers.set("Content-Type", "application/json");
  const started = performance.now();
  const uiRoute = browserRoute();
  let response: Response | undefined;
  let failure: unknown;
  try {
    response = await fetch(path, {
      ...options,
      headers,
      cache: "no-store",
      redirect: "error",
    });
    const result = await apiJson<T>(response, fallback);
    if (auth.currentUser?.uid !== user.uid)
      throw new Error("Your signed-in account changed.");
    return result;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    if (auth.currentUser?.uid === user.uid) {
      const result = outcome(failure, response?.status);
      const requestId = response?.headers.get("X-Request-Id");
      observeRequest({
        "http.route": routeTemplate(target.pathname, true),
        "ui.route": uiRoute,
        "http.request.method": [
          "GET",
          "POST",
          "PUT",
          "PATCH",
          "DELETE",
          "HEAD",
        ].includes((options.method || "GET").toUpperCase())
          ? (options.method || "GET").toUpperCase()
          : "OTHER",
        "http.response.status_code": response?.status || 0,
        "duration.ms": Math.round(performance.now() - started),
        outcome: result.outcome,
        "error.kind": result.errorKind,
        ...(requestId && /^[a-f0-9-]{36}$/.test(requestId)
          ? { "request.id": requestId }
          : {}),
      });
    }
  }
}
export interface PdfResponse {
  base64: string;
  filename: string;
}
export function downloadPdf(result: PdfResponse) {
  const url = URL.createObjectURL(
    new Blob([Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0))], {
      type: "application/pdf",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = result.filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
