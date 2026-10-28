import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runIdentity,
  workflowFacts,
  testSummary,
  lifecycleFact,
} from "../scripts/observability/contract.mjs";
import reporter from "../scripts/observability/node-reporter.mjs";
const repository = "fixture/app",
  sha = "a".repeat(40),
  run = {
    repository: { full_name: repository },
    head_repository: { full_name: repository },
    id: 1,
    run_attempt: 2,
    head_sha: sha,
    status: "completed",
    conclusion: "failure",
    path: ".github/workflows/check.yml",
  };
test("delivery execution facts preserve source failure, skips, cancellation and attempt identity", () => {
  const id = runIdentity(run, repository);
  const jobs = [
    {
      id: 2,
      run_id: 1,
      run_attempt: 2,
      head_sha: sha,
      status: "completed",
      conclusion: "failure",
      steps: [
        { number: 1, status: "completed", conclusion: "success" },
        { number: 2, status: "completed", conclusion: "skipped" },
        { number: 3, status: "completed", conclusion: "cancelled" },
      ],
    },
  ];
  const rows = workflowFacts(id, jobs);
  assert.deepEqual(
    rows.map((r) => r.outcome),
    ["failure", "failure", "success", "skipped", "cancelled"],
  );
  assert.equal(rows[0].eventId, workflowFacts(id, jobs)[0].eventId);
  assert.notEqual(
    rows[0].eventId,
    workflowFacts(
      { ...id, attempt: 3 },
      jobs.map((j) => ({ ...j, run_attempt: 3 })),
    )[0].eventId,
  );
  assert.throws(() =>
    runIdentity(
      { ...run, head_repository: { full_name: "fork/app" } },
      repository,
    ),
  );
  assert.throws(() =>
    workflowFacts(id, [{ ...jobs[0], head_sha: "b".repeat(40) }]),
  );
});
test("structured Node summary ignores file summaries and does not turn missing or partial output green", async () => {
  async function* source() {
    yield {
      type: "test:summary",
      data: { file: "fixture", counts: { tests: 99 } },
    };
    yield {
      type: "test:summary",
      data: {
        success: false,
        counts: {
          tests: 3,
          passed: 1,
          failed: 1,
          cancelled: 0,
          skipped: 1,
          todo: 0,
        },
        duration_ms: 10,
      },
    };
  }
  let output = "";
  for await (const item of reporter(source())) output += item;
  const parsed = testSummary(JSON.parse(output));
  assert.equal(parsed.counts.tests, 3);
  assert.equal(parsed.success, false);
  assert.deepEqual(
    testSummary({ schema: 1, runner: "node", complete: false }),
    { complete: false },
  );
  assert.throws(() =>
    testSummary({ ...JSON.parse(output), counts: { tests: 1, passed: 10 } }),
  );
  async function* empty() {}
  let missing = "";
  for await (const item of reporter(empty())) missing += item;
  assert.equal(JSON.parse(missing).complete, false);
});
test("lifecycle facts expose verified identity only and distinguish closed from merged", () => {
  const event = {
    repository: { full_name: repository },
    action: "closed",
    pull_request: {
      id: 9,
      number: 3,
      updated_at: "2026-10-28T00:00:00Z",
      merged: true,
      merge_commit_sha: sha,
      title: "private title",
      body: "private body",
    },
  };
  const row = lifecycleFact("pull_request_target", event, repository);
  assert.equal(row.action, "merged");
  assert.equal(row.revision, sha);
  assert.ok(!JSON.stringify(row).includes("private"));
  assert.equal(
    lifecycleFact(
      "pull_request_target",
      { ...event, pull_request: { ...event.pull_request, merged: false } },
      repository,
    ).action,
    "closed",
  );
  assert.throws(() =>
    lifecycleFact(
      "issues",
      { ...event, repository: { full_name: "wrong/app" } },
      repository,
    ),
  );
});
test("published release and deployed artifact cannot be certified from an unrelated revision", async () => {
  const { verifiedRelease, verifiedDeployment } =
    await import("../scripts/observability/release-verification.mjs");
  const release = {
    id: 1,
    tag_name: "v2.0.0",
    published_at: "2026-10-28T00:00:00Z",
    draft: false,
  };
  assert.equal(verifiedRelease(release, sha, "2.0.0").revision, sha);
  assert.throws(() => verifiedRelease(release, sha, "1.0.0"));
  const manifest = {
    version: "2.0.0",
    revision: sha,
    sourceState: "clean",
    environment: "production",
    surface: "admin",
    apiContract: "1.5.0",
  };
  assert.equal(verifiedDeployment(manifest, manifest, "admin").revision, sha);
  assert.throws(() =>
    verifiedDeployment(
      manifest,
      { ...manifest, revision: "b".repeat(40) },
      "admin",
    ),
  );
  assert.throws(() =>
    verifiedDeployment(
      { ...manifest, sourceState: "working-tree" },
      manifest,
      "admin",
    ),
  );
});

test("real Node runner reports failed and skipped tests without leaking assertions", async () => {
  const { mkdtempSync, writeFileSync, readFileSync, rmSync } =
    await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const dir = mkdtempSync(join(tmpdir(), "inspi-reporter-"));
  try {
    const fixture = join(dir, "fixture.mjs"),
      output = join(dir, "summary.json");
    writeFileSync(
      fixture,
      'import {test} from "node:test"; test("pass",()=>{}); test.skip("skip",()=>{}); test("fail",()=>{throw Error("PRIVATE_ASSERTION")});',
    );
    const runnerEnv = { ...process.env };
    delete runnerEnv.NODE_TEST_CONTEXT; // A fresh runner, not an inherited child of this test.
    const result = spawnSync(
      process.execPath,
      [
        "--test",
        "--test-reporter=" +
          fileURLToPath(
            new URL(
              "../scripts/observability/node-reporter.mjs",
              import.meta.url,
            ),
          ),
        "--test-reporter-destination=" + output,
        fixture,
      ],
      { encoding: "utf8", timeout: 20000, env: runnerEnv },
    );
    assert.equal(result.status, 1);
    const raw = readFileSync(output, "utf8"),
      summary = testSummary(JSON.parse(raw));
    assert.equal(summary.complete, true);
    assert.equal(summary.success, false);
    assert.equal(summary.counts.passed, 1);
    assert.equal(summary.counts.failed, 1);
    assert.equal(summary.counts.skipped, 1);
    assert.ok(!raw.includes("PRIVATE_ASSERTION"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
