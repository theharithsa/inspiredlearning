import { browserRoute, outcome, registerTelemetry } from "./browser-telemetry";
import { createRumReadiness } from "./rum-readiness";
import packageJson from "../package.json" with { type: "json" };
import { cancelConfirmations } from "./ui/Confirm";
import { isAdminApp } from "./surface";
import { httpsCallable } from "firebase/functions";
import type { User } from "firebase/auth";
import { auth, functions } from "./firebase";
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
const browserObserver = createRumReadiness({
  identify(value) {
    if (!window.dtrum?.identifyUser) return false;
    try {
      window.dtrum.identifyUser(value);
      return true;
    } catch {
      return false;
    }
  },
  send(name, data) {
    if (!window.dynatrace?.sendBizEvent) return false;
    try {
      window.dynatrace.sendBizEvent(name, data);
    } catch {}
    return true;
  },
  canRetry: () => !!document.querySelector('script[data-app-rum="async"]'),
});
window.addEventListener("pagehide", () => browserObserver.clear());
let previousIdentity: string | null | undefined;
export function identity(user: User | null) {
  if (previousIdentity !== user?.uid) {
    cancelConfirmations();
    browserObserver.clear();
    previousIdentity = user?.uid;
  }
  try {
    browserObserver.identity(user?.email || device);
  } catch {}
}
const safeNames = new Set([
  "ui.click",
  "page.view",
  "auth.signed-in",
  "auth.signed-out",
  "certificate.download",
  "certificate.link.copied",
  "discord.opened",
  "workshop.viewed",
  "profile.saved",
]);
export function rum(name: string, fields: Record<string, unknown> = {}) {
  try {
    browserObserver.event("com.inspiredlearning.rum." + name, {
      "event.provider": "inspiredlearning-rum",
      "event.authority": "client-observed",
      "event.source": "browser",
      "app.surface": isAdminApp ? "admin" : "learner",
      "app.version": packageJson.version,
      "ui.route": browserRoute(),
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
registerTelemetry((name, fields) => rum(name, fields));
export function interaction(name: string, sid?: string) {
  if (!safeNames.has(name)) return;
  rum(name, { ...(sid ? { "workshop.session.id": sid } : {}) });
}
export async function call<T>(
  endpoint: string,
  payload: Record<string, unknown>,
) {
  const transactionId = crypto.randomUUID();
  const actor = auth.currentUser?.uid;
  const uiRoute = browserRoute();
  const started = performance.now();
  const complete = (error?: unknown) => {
    if (auth.currentUser?.uid !== actor) return;
    const result = outcome(error);
    rum("operation.completed", {
      "transaction.id": transactionId,
      operation: endpoint,
      "ui.route": uiRoute,
      outcome: result.outcome,
      "error.kind": result.errorKind,
      "duration.ms": Math.round(performance.now() - started),
    });
  };
  try {
    if (
      isAdminApp &&
      (endpoint === "learningCertificate" ||
        (endpoint === "learningAction" &&
          [
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
          ].includes(String(payload.action))))
    )
      await (await import("./reauth")).ensureRecentAdminAuth();
    const response = await httpsCallable<Record<string, unknown>, T>(
      functions,
      endpoint,
      { timeout: 540000 },
    )({ ...payload, transactionId });
    complete();
    return response.data;
  } catch (error) {
    complete(error);
    throw error;
  }
}
export const action = <T = { message?: string }>(
  action: string,
  data: Record<string, unknown> = {},
) => call<T>("learningAction", { action, ...data });
export function installClicks() {
  document.addEventListener("click", (event) => {
    const path = event
      .composedPath()
      .filter((node): node is HTMLElement => node instanceof HTMLElement);
    const candidates = path.filter((node) =>
      node.matches(
        "a,md-filled-button,md-filled-tonal-button,md-outlined-button,md-text-button,md-icon-button,md-checkbox,md-radio,md-list-item,md-menu-item,md-select-option",
      ),
    );
    // A Material link renders an inner anchor. Retain the allowlisted action
    // on its adapter host instead of replacing it with a generic UI click.
    const target =
      candidates.find((node) => safeNames.has(node.dataset.event || "")) ||
      candidates[0] ||
      path.find((node) => node.matches('button,input[type="checkbox"]'));
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
