import { WebTracerProvider } from "@opentelemetry/sdk-trace-web";
import { httpsCallable } from "firebase/functions";
import type { User } from "firebase/auth";
import { auth, functions, emulators } from "./firebase";
const provider = new WebTracerProvider(),
  tracer = provider.getTracer("inspiredlearning-browser");
declare global {
  interface Window {
    dtrum?: {
      identifyUser: (value: string) => void;
      reportError?: (error: Error) => void;
    };
    dynatrace?: {
      sendBizEvent: (type: string, data: Record<string, unknown>) => void;
    };
  }
}
let device = "visitor";
try {
  device =
    localStorage.getItem("inspiredlearning-device") ||
    "device-" + crypto.randomUUID();
  localStorage.setItem("inspiredlearning-device", device);
} catch {}
export function identity(user: User | null) {
  try {
    window.dtrum?.identifyUser(user?.email || device);
  } catch {}
}
const safeNames = new Set([
  "ui.click",
  "page.view",
  "auth.signed-in",
  "auth.signed-out",
  "certificate.download",
  "discord.opened",
  "workshop.viewed",
  "profile.saved",
]);
export function rum(name: string, fields: Record<string, unknown> = {}) {
  try {
    window.dynatrace?.sendBizEvent("com.inspiredlearning.rum." + name, {
      "event.provider": "inspiredlearning-rum",
      "event.authority": "client-observed",
      "event.source": "browser",
      "event.id": crypto.randomUUID(),
      "transaction.id": crypto.randomUUID(),
      ...(auth.currentUser?.email
        ? {
            "user.email": auth.currentUser.email,
            "user.id": auth.currentUser.uid,
          }
        : { "device.id": device }),
      ...fields,
    });
  } catch {}
}
export function interaction(name: string, sid?: string) {
  if (!safeNames.has(name)) return;
  const span = tracer.startSpan("browser." + name);
  const sc = span.spanContext(),
    transactionId = crypto.randomUUID();
  rum(name, {
    "transaction.id": transactionId,
    trace_id: sc.traceId,
    span_id: sc.spanId,
    ...(sid ? { "workshop.session.id": sid } : {}),
  });
  if (emulators || !auth.currentUser || auth.currentUser.isAnonymous) {
    span.end();
    return;
  }
  void httpsCallable(
    functions,
    "learningTelemetry",
  )({
    name,
    sid,
    transactionId,
    traceparent: `00-${sc.traceId}-${sc.spanId}-01`,
  })
    .catch(() => {})
    .finally(() => span.end());
}
export async function call<T>(
  endpoint: string,
  payload: Record<string, unknown>,
) {
  const span = tracer.startSpan(
    endpoint + "." + String(payload.action || "request"),
  );
  const sc = span.spanContext(),
    transactionId = crypto.randomUUID();
  const traceparent = `00-${sc.traceId}-${sc.spanId}-01`;
  try {
    const response = await httpsCallable<Record<string, unknown>, T>(
      functions,
      endpoint,
      { timeout: 540000 },
    )({ ...payload, traceparent, transactionId });
    rum("operation.completed", {
      "transaction.id": transactionId,
      trace_id: sc.traceId,
      span_id: sc.spanId,
      operation: endpoint,
      outcome: "success",
    });
    return response.data;
  } catch (error) {
    span.setStatus({ code: 2 });
    rum("operation.completed", {
      "transaction.id": transactionId,
      trace_id: sc.traceId,
      span_id: sc.spanId,
      operation: endpoint,
      outcome: "failure",
    });
    throw error;
  } finally {
    span.end();
  }
}
export const action = <T = { message?: string }>(
  action: string,
  data: Record<string, unknown> = {},
) => call<T>("learningAction", { action, ...data });
export function installClicks() {
  document.addEventListener("click", (event) => {
    const target = (event.target as Element)?.closest?.(
      'button,a,input[type="checkbox"]',
    ) as HTMLElement | null;
    if (!target || target.hasAttribute("disabled")) return;
    const name = target.dataset.event || "ui.click";
    interaction(safeNames.has(name) ? name : "ui.click");
  });
  window.addEventListener("error", (e) => {
    try {
      if (e.error) window.dtrum?.reportError?.(e.error);
    } catch {}
  });
}
export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
        .replace(/^Firebase: /, "")
        .replace(/\s*\(functions\/[^)]+\)\.?$/, "")
    : "Could not complete that action. Please try again.";
