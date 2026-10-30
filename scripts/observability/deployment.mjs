import { createHash } from "node:crypto";
import { eventRecord, sourceTime } from "./events.mjs";
import { verifiedDeployment } from "./release-verification.mjs";
export const HOSTING = Object.freeze([
  {
    surface: "learner",
    site: "inspiredlearning-vh",
    origin: "https://inspi.in",
  },
  {
    surface: "admin",
    site: "inspiredlearning-admin-vh",
    origin: "https://admin.inspi.in",
  },
]);
export function validManifest(manifest, surface) {
  if (
    !manifest ||
    !/^\d+\.\d+\.\d+$/.test(manifest.version || "") ||
    !/^\d+\.\d+\.\d+$/.test(manifest.apiContract || "")
  )
    throw Error("Invalid artifact manifest");
  return verifiedDeployment(manifest, manifest, surface);
}
export function hostingFacts({
  surface,
  manifest,
  before,
  after,
  live,
  checks,
  observedAt,
  repository = "theharithsa/inspiredlearning",
}) {
  const config = HOSTING.find((x) => x.surface === surface);
  if (!config) throw Error("Unknown Hosting surface");
  validManifest(manifest, surface);
  const shape = (r) =>
    r &&
    new RegExp(`^sites/${config.site}/releases/[A-Za-z0-9_-]+$`).test(
      r.name || "",
    ) &&
    new RegExp(`^sites/${config.site}/versions/[A-Za-z0-9_-]+$`).test(
      r.version?.name || "",
    ) &&
    r.version.status === "FINALIZED" &&
    ["DEPLOY", "ROLLBACK"].includes(r.type);
  if (
    !shape(before) ||
    !shape(after) ||
    before.name !== after.name ||
    before.version.name !== after.version.name
  )
    throw Error(
      "Provider release missing, invalid or changed during observation",
    );
  const occurredAt = sourceTime(after.releaseTime);
  if (
    sourceTime(before.releaseTime) !== occurredAt ||
    before.type !== after.type
  )
    throw Error("Inconsistent provider release");
  const digest = createHash("sha256")
    .update(JSON.stringify(Object.fromEntries(Object.entries(manifest).sort())))
    .digest("hex");
  const data = {
    "github.repository": repository,
    "vcs.revision": manifest.revision,
    "app.version": manifest.version,
    "app.surface": surface,
    "deployment.environment": "production",
    "deployment.id": after.name,
    "deployment.version.id": after.version.name,
    "deployment.type": after.type,
    "deployment.provider": "firebase-hosting",
    "deployment.origin": config.origin,
    "artifact.manifest.sha256": digest,
  };
  let match = false;
  try {
    verifiedDeployment(manifest, live, surface);
    match = true;
  } catch {}
  const passed =
    match && checks?.api === true && checks?.anonymousAdminDenied === true;
  const deployment = eventRecord({
    kind:
      after.type === "ROLLBACK"
        ? "sdlc.rollback.completed"
        : "sdlc.deployment.completed",
    source: "firebase-hosting",
    identity: [after.name],
    occurredAt,
    observedAt,
    authority: "provider-confirmed",
    status: "deployed",
    data: {
      ...data,
      "artifact.correlation": match ? "verified" : "unverified",
    },
  });
  const runtime = eventRecord({
    kind: "sdlc.runtime.verified",
    source: "runtime-probe",
    identity: [after.name, observedAt],
    occurredAt: observedAt,
    observedAt,
    authority: "verification-observed",
    status: passed ? "passed" : "failed",
    data: {
      ...data,
      "verification.manifest": match,
      "verification.api": checks?.api === true,
      "verification.anonymous_admin_denied":
        checks?.anonymousAdminDenied === true,
    },
  });
  return {
    schema: 1,
    provider: "firebase-hosting",
    surface,
    releaseId: after.name,
    observedAt: sourceTime(observedAt),
    manifest,
    source: {
      name: after.name,
      type: after.type,
      releaseTime: occurredAt,
      version: { name: after.version.name, status: after.version.status },
    },
    verification: passed ? "passed" : "failed",
    events: [deployment, runtime],
  };
}
export function deploymentCoverage(receipts) {
  const by = new Map(receipts.map((r) => [r.surface, r]));
  if (
    by.size !== receipts.length ||
    receipts.some((r) => !HOSTING.some((h) => h.surface === r.surface))
  )
    throw Error("Duplicate or unknown release surface");
  if (by.size < HOSTING.length) return "partial";
  return [...by.values()].every((r) => r.verification === "passed")
    ? "verified"
    : "deployed-unverified";
}
/** Native markers are optional and never inferred from GitHub releases or builds. */
export function nativeDeployment(
  receipt,
  { now = Date.now(), entitySelector } = {},
) {
  if (receipt?.schema !== 1 || receipt.verification !== "passed")
    throw Error("Native marker requires provider and artifact verification");
  const replay = hostingFacts({
    surface: receipt.surface,
    manifest: receipt.manifest,
    before: receipt.source,
    after: receipt.source,
    live: receipt.manifest,
    checks: { api: true, anonymousAdminDenied: true },
    observedAt: receipt.observedAt,
  });
  if (replay.events[0].id !== receipt.events?.[0]?.id)
    throw Error("Deployment receipt identity mismatch");
  const startTime = Date.parse(sourceTime(receipt.source.releaseTime));
  if (startTime < now - 30 * 86400000 || startTime > now + 300000)
    throw Error("Native deployment timestamp outside supported window");
  if (
    entitySelector !== undefined &&
    (typeof entitySelector !== "string" ||
      entitySelector.length > 1000 ||
      /[\r\n]/.test(entitySelector))
  )
    throw Error("Invalid entity selector");
  return {
    eventType: "CUSTOM_DEPLOYMENT",
    title: `InspiredLearning ${receipt.manifest.version} · ${receipt.surface}`,
    startTime,
    endTime: startTime,
    ...(entitySelector ? { entitySelector } : {}),
    properties: {
      "sdlc.event.id": receipt.events[0].id,
      "deployment.id": receipt.releaseId,
      "deployment.surface": receipt.surface,
      "deployment.environment": "production",
      version: receipt.manifest.version,
      "vcs.revision": receipt.manifest.revision,
      "deployment.authority": "provider-confirmed",
    },
  };
}
