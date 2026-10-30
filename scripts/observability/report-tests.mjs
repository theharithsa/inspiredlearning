import { testSummary } from "./contract.mjs";
import { eventRecord } from "./events.mjs";
export const suites = [
  "unit",
  "integration",
  "auth",
  "swagger",
  "mcp",
  "browser",
  "security-browser",
  "hosting-cache",
  "tooling",
  "tooling-pubsub",
];
export function browserSummary(data) {
  const fields = [
    "tests",
    "passed",
    "failed",
    "skipped",
    "flaky",
    "cancelled",
    "missing",
  ];
  if (
    data?.schema !== 1 ||
    data.runner !== "playwright" ||
    typeof data.complete !== "boolean" ||
    typeof data.success !== "boolean" ||
    !data.counts ||
    fields.some(
      (k) =>
        !Number.isSafeInteger(data.counts[k]) ||
        data.counts[k] < 0 ||
        data.counts[k] > 100000,
    )
  )
    throw Error("Invalid browser summary");
  const c = data.counts;
  if (
    c.passed + c.failed + c.skipped + c.flaky + c.cancelled + c.missing !==
    c.tests
  )
    throw Error("Inconsistent browser counts");
  return {
    complete: data.complete,
    success:
      data.success && c.failed === 0 && c.cancelled === 0 && c.missing === 0,
    counts: Object.fromEntries(fields.map((k) => [k, c[k]])),
  };
}
export function testEvents(identity, reports, observedAt) {
  return suites.map((suite) => {
    const value = reports[suite];
    const report = value
      ? value.runner === "node"
        ? testSummary(value)
        : browserSummary(value)
      : { complete: false };
    const status = report.complete
      ? report.success
        ? "passed"
        : "failed"
      : "missing-or-partial";
    return eventRecord({
      kind: "github.test.report",
      source: "github",
      identity: [identity.repository, identity.runId, identity.attempt, suite],
      observedAt,
      authority: "ci-reported",
      status,
      data: {
        "github.repository": identity.repository,
        "github.run.id": identity.runId,
        "github.run.attempt": identity.attempt,
        "vcs.revision": identity.sha,
        "test.suite": suite,
        "test.report.complete": report.complete,
        "test.report.status": status,
        ...(report.counts
          ? Object.fromEntries(
              Object.entries(report.counts).map(([k, v]) => [
                "test.count." + k,
                v,
              ]),
            )
          : {}),
        ...(Number.isFinite(report.durationMs)
          ? { "test.duration_ms": report.durationMs }
          : {}),
      },
    });
  });
}
