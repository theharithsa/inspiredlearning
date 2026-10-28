import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { stableId, testSummary } from "./contract.mjs";
if (
  process.env.GITHUB_EVENT_NAME !== "push" ||
  process.env.GITHUB_REF !== "refs/heads/main"
)
  throw Error("Only trusted main execution reports may be ingested");
const repository = process.env.GITHUB_REPOSITORY,
  sha = process.env.GITHUB_SHA,
  run = process.env.GITHUB_RUN_ID,
  attempt = process.env.GITHUB_RUN_ATTEMPT;
if (
  !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || "") ||
  !/^[0-9a-f]{40}$/.test(sha || "") ||
  !/^\d+$/.test(run || "") ||
  !/^\d+$/.test(attempt || "")
)
  throw Error("Invalid report identity");
const origin = new URL(
  process.env.DYNATRACE_ENDPOINT || "https://indiacs.live.dynatrace.com",
);
if (
  origin.protocol !== "https:" ||
  !origin.hostname.endsWith(".live.dynatrace.com")
)
  throw Error("Invalid telemetry origin");
const token = process.env.DYNATRACE_CI_TOKEN;
if (!token) throw Error("CI telemetry secret not configured");
for (const suite of [
  "unit",
  "integration",
  "auth",
  "swagger",
  "mcp",
  "browser",
]) {
  const file = path.join(
    process.env.TEST_REPORT_DIR || "ci-results/structured",
    suite + ".json",
  );
  let report = { complete: false, status: "missing" };
  if (existsSync(file)) {
    const text = readFileSync(file, "utf8");
    if (text.length > 1_000_000) throw Error("Report too large");
    const data = JSON.parse(text);
    report = data.runner === "node" ? testSummary(data) : browser(data);
  }
  const id = stableId([repository, run, attempt, suite]);
  const data = {
    "event.id": id,
    "event.name": "github.test.report",
    "event.provider": "inspiredlearning-github",
    "event.authority": "ci-reported",
    "github.repository": repository,
    "github.run.id": run,
    "github.run.attempt": attempt,
    "vcs.revision": sha,
    "test.suite": suite,
    "test.report.complete": report.complete,
    "test.report.status": report.complete
      ? report.success
        ? "passed"
        : "failed"
      : "missing-or-partial",
    ...(report.counts
      ? Object.fromEntries(
          Object.entries(report.counts).map(([k, v]) => ["test.count." + k, v]),
        )
      : {}),
  };
  const response = await fetch(origin.origin + "/api/v2/bizevents/ingest", {
    method: "POST",
    headers: {
      "Content-Type": "application/cloudevents+json",
      Authorization:
        (token.startsWith("dt0c01.") ? "Api-Token " : "Bearer ") + token,
    },
    body: JSON.stringify({
      specversion: "1.0",
      id,
      source: "github:" + repository,
      type: "com.inspiredlearning.github.test.report",
      time: new Date().toISOString(),
      data,
    }),
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (response.status !== 202)
    throw Error("Test report ingestion not accepted");
}
function browser(data) {
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
    data.schema !== 1 ||
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
console.log(
  JSON.stringify({
    source: "trusted-main-tests",
    accepted: true,
    tenantVisibility: "not-verified",
  }),
);
