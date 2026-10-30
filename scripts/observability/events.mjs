import { stableId } from "./contract.mjs";
export const SCHEMA = 2;
const fields = new Set(
  `github.repository github.run.id github.run.attempt github.source.id github.outcome github.number github.review.state github.issue.number github.pull_request.number github.head.revision github.base.revision github.merge.revision vcs.revision release.notes.sha256 app.version app.surface deployment.environment deployment.id deployment.version.id deployment.type deployment.provider deployment.origin artifact.expected.revision artifact.expected.version artifact.manifest.sha256 artifact.correlation verification.manifest verification.api verification.anonymous_admin_denied test.suite test.report.complete test.report.status test.duration_ms test.count.tests test.count.passed test.count.failed test.count.cancelled test.count.skipped test.count.todo test.count.flaky test.count.missing`.split(
    " ",
  ),
);
const metadata = new Set(
  `event.id sdlc.event.id event.provider event.authority sdlc.schema.version sdlc.source sdlc.status sdlc.observed_at sdlc.occurred_at sdlc.time.kind`.split(
    " ",
  ),
);
export function validateData(data, envelope = false) {
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw Error("Invalid event data");
  for (const [key, value] of Object.entries(data)) {
    if (
      !(fields.has(key) || (envelope && metadata.has(key))) ||
      !(
        value === null ||
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value)) ||
        (typeof value === "string" &&
          value.length <= 500 &&
          !/[\r\n]/.test(value))
      )
    )
      throw Error("Unsupported telemetry field");
  }
}
export function validateEvent(event, native = false) {
  if (native) {
    if (
      event?.eventType !== "CUSTOM_DEPLOYMENT" ||
      !Number.isSafeInteger(event.startTime) ||
      event.endTime !== event.startTime ||
      typeof event.title !== "string" ||
      event.title.length > 100
    )
      throw Error("Invalid native marker");
    const keys = new Set([
      "sdlc.event.id",
      "deployment.id",
      "deployment.surface",
      "deployment.environment",
      "version",
      "vcs.revision",
      "deployment.authority",
    ]);
    if (
      Object.keys(event).some(
        (k) =>
          ![
            "eventType",
            "title",
            "startTime",
            "endTime",
            "entitySelector",
            "properties",
          ].includes(k),
      ) ||
      !event.properties ||
      Object.entries(event.properties).some(
        ([k, v]) => !keys.has(k) || typeof v !== "string" || v.length > 500,
      ) ||
      (event.entitySelector !== undefined &&
        (typeof event.entitySelector !== "string" ||
          event.entitySelector.length > 1000 ||
          /[\r\n]/.test(event.entitySelector)))
    )
      throw Error("Invalid native properties");
  } else {
    if (
      event?.specversion !== "1.0" ||
      !/^com\.inspiredlearning\.[a-z._-]+$/.test(event.type || "") ||
      !/^inspiredlearning:(github|firebase-hosting|runtime-probe|developer)$/.test(
        event.source || "",
      ) ||
      Object.keys(event).some(
        (k) =>
          !["specversion", "id", "source", "type", "time", "data"].includes(k),
      )
    )
      throw Error("Invalid event envelope");
    sourceTime(event.time);
    validateData(event.data, true);
    if (
      event.id !== event.data["event.id"] ||
      event.id !== event.data["sdlc.event.id"]
    )
      throw Error("Event identity mismatch");
  }
  const id = event.id || event.properties?.["sdlc.event.id"];
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      id || "",
    )
  )
    throw Error("Invalid event ID");
  return id;
}
export function sourceTime(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d\d-\d\dT/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw Error("Invalid source timestamp");
  return new Date(value).toISOString();
}
export function eventRecord({
  kind,
  source,
  identity,
  occurredAt,
  observedAt = new Date().toISOString(),
  authority,
  status,
  data = {},
}) {
  if (
    !/^[a-z]+(?:\.[a-z_-]+)+$/.test(kind) ||
    !["github", "firebase-hosting", "runtime-probe", "developer"].includes(
      source,
    ) ||
    ![
      "source-confirmed-automation",
      "provider-confirmed",
      "verification-observed",
      "developer-reported",
      "ci-reported",
    ].includes(authority)
  )
    throw Error("Invalid event authority");
  validateData(data);
  if (
    !Array.isArray(identity) ||
    !identity.length ||
    identity.some((v) => !["string", "number"].includes(typeof v))
  )
    throw Error("Invalid source identity");
  if (!/^[a-z_-]{1,50}$/.test(status || "")) throw Error("Invalid status");
  const observed = sourceTime(observedAt),
    occurred = occurredAt ? sourceTime(occurredAt) : null;
  const id = stableId([
    "inspiredlearning.sdlc",
    SCHEMA,
    source,
    kind,
    ...identity,
  ]);
  return {
    specversion: "1.0",
    id,
    source: `inspiredlearning:${source}`,
    type: `com.inspiredlearning.${kind}`,
    time: occurred || observed,
    data: {
      ...data,
      "event.id": id,
      "sdlc.event.id": id,
      "event.provider": "inspiredlearning-delivery",
      "event.authority": authority,
      "sdlc.schema.version": SCHEMA,
      "sdlc.source": source,
      "sdlc.status": status,
      "sdlc.observed_at": observed,
      "sdlc.occurred_at": occurred,
      "sdlc.time.kind": occurred ? "source" : "observation",
    },
  };
}
