import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { eventRecord } from "../scripts/observability/events.mjs";
import {
  hostingFacts,
  nativeDeployment,
  deploymentCoverage,
} from "../scripts/observability/deployment.mjs";
import { enqueue, drain } from "../scripts/observability/spool.mjs";
import { sendRecord } from "../scripts/observability/transport.mjs";
import { parseArchive } from "../scripts/observability/test-artifact.mjs";
import { testEvents } from "../scripts/observability/report-tests.mjs";
import { lifecycleFact } from "../scripts/observability/contract.mjs";
const time = "2026-10-30T06:00:00.000Z",
  observed = "2026-10-30T07:00:00.000Z",
  sha = "a".repeat(40);
function event() {
  return eventRecord({
    kind: "github.issues.closed",
    source: "github",
    identity: ["repo", 123],
    occurredAt: time,
    observedAt: observed,
    authority: "source-confirmed-automation",
    status: "closed",
    data: { "github.repository": "fixture/app" },
  });
}
function receipt(surface = "learner") {
  const site =
    surface === "learner" ? "inspiredlearning-vh" : "inspiredlearning-admin-vh";
  const source = {
    name: `sites/${site}/releases/123`,
    version: { name: `sites/${site}/versions/abc`, status: "FINALIZED" },
    releaseTime: time,
    type: "DEPLOY",
    releaseUser: { email: "PRIVATE" },
  };
  const manifest = {
    version: "2.2.0",
    revision: sha,
    sourceState: "clean",
    environment: "production",
    surface,
    apiContract: "1.5.0",
  };
  return {
    surface,
    manifest,
    before: source,
    after: source,
    live: manifest,
    checks: { api: true, anonymousAdminDenied: true },
    observedAt: observed,
  };
}
test("source time, authority and stable IDs survive reporting retries without accepting arbitrary data", () => {
  const first = event(),
    again = eventRecord({
      kind: "github.issues.closed",
      source: "github",
      identity: ["repo", 123],
      occurredAt: time,
      observedAt: "2026-10-31T00:00:00Z",
      authority: "source-confirmed-automation",
      status: "closed",
    });
  assert.equal(first.id, again.id);
  assert.equal(first.time, time);
  assert.equal(first.data["sdlc.time.kind"], "source");
  assert.throws(() =>
    eventRecord({
      kind: "github.test.report",
      source: "github",
      identity: [1],
      authority: "ci-reported",
      status: "passed",
      data: { body: "PRIVATE" },
    }),
  );
  const row = lifecycleFact(
    "pull_request_review",
    {
      repository: { full_name: "fixture/app" },
      action: "submitted",
      pull_request: { id: 1, number: 2, head: { sha } },
      review: { id: 99, state: "approved", submitted_at: time },
    },
    "fixture/app",
  );
  assert.equal(row.sourceId, 99);
  assert.equal(row.occurredAt, time);
  assert.equal(
    lifecycleFact(
      "pull_request_review",
      {
        repository: { full_name: "fixture/app" },
        action: "dismissed",
        pull_request: { id: 1 },
        review: { id: 99, state: "dismissed", submitted_at: time },
      },
      "fixture/app",
    ).occurredAt,
    null,
  );
});
test("provider deployment and later runtime verification are distinct, sanitized and race checked", () => {
  const input = receipt(),
    r = hostingFacts(input);
  assert.equal(r.events[0].time, time);
  assert.equal(r.events[1].time, observed);
  assert.equal(r.events[0].data["event.authority"], "provider-confirmed");
  assert.ok(!JSON.stringify(r).includes("PRIVATE"));
  assert.equal(deploymentCoverage([r]), "partial");
  assert.equal(
    deploymentCoverage([r, hostingFacts(receipt("admin"))]),
    "verified",
  );
  const failed = hostingFacts({
    ...input,
    live: { ...input.live, revision: "b".repeat(40) },
  });
  assert.equal(failed.events[0].data["sdlc.status"], "deployed");
  assert.equal(failed.verification, "failed");
  assert.throws(() => nativeDeployment(failed));
  assert.throws(() =>
    hostingFacts({
      ...input,
      after: { ...input.after, name: input.after.name + "4" },
    }),
  );
  const marker = nativeDeployment(r, { now: Date.parse(observed) });
  assert.equal(marker.startTime, Date.parse(time));
  assert.equal(marker.entitySelector, undefined);
  assert.throws(() =>
    nativeDeployment(r, { now: Date.parse(time) + 31 * 86400000 }),
  );
});
test("native partial acceptance and permanent errors never become successful exports", async () => {
  const f = async () =>
    new Response(
      JSON.stringify({
        reportCount: 2,
        eventIngestResults: [{ status: "OK" }],
      }),
      { status: 201 },
    );
  assert.equal(
    (
      await sendRecord(
        "http://127.0.0.1:1",
        "",
        {},
        { local: true, native: true, fetcher: f },
      )
    ).accepted,
    false,
  );
  let calls = 0;
  const denied = await sendRecord(
    "http://127.0.0.1:1",
    "",
    {},
    {
      local: true,
      fetcher: async () => {
        calls++;
        return new Response("", { status: 403 });
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(denied.reason, "permanent");
  let retries = 0;
  const result = await sendRecord(
    "http://127.0.0.1:1",
    "",
    {},
    {
      local: true,
      sleep: async () => {},
      fetcher: async () =>
        new Response("", { status: ++retries === 3 ? 202 : 429 }),
    },
  );
  assert.equal(result.accepted, true);
  assert.equal(result.attempts, 3);
});
test("durable retry keeps stable payloads, refuses symlinks/collisions, and needs explicit permanent-failure replay", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "inspi-spool-"));
  try {
    const e = event(),
      file = await enqueue(folder, e);
    await enqueue(folder, {
      ...e,
      data: { ...e.data, "sdlc.observed_at": "2026-10-31T00:00:00Z" },
    });
    await assert.rejects(() =>
      enqueue(folder, {
        ...e,
        data: { ...e.data, "github.repository": "other/app" },
      }),
    );
    const options = {
      local: true,
      sleep: async () => {},
      fetcher: async () => new Response("", { status: 503 }),
    };
    assert.equal(
      (await drain(folder, "http://127.0.0.1:1", "", options)).pending,
      1,
    );
    assert.equal(JSON.parse(await readFile(file)).attempts, 3);
    assert.equal(
      (
        await drain(folder, "http://127.0.0.1:1", "", {
          ...options,
          fetcher: async () => new Response("", { status: 400 }),
        })
      ).failed,
      1,
    );
    let sent = 0;
    const accepted = {
      local: true,
      fetcher: async () => {
        sent++;
        return new Response("", { status: 202 });
      },
    };
    assert.equal(
      (await drain(folder, "http://127.0.0.1:1", "", accepted)).failed,
      1,
    );
    assert.equal(sent, 0);
    assert.equal(
      (
        await drain(folder, "http://127.0.0.1:1", "", {
          ...accepted,
          retryFailed: true,
        })
      ).accepted,
      1,
    );
    await drain(folder, "http://127.0.0.1:1", "", accepted);
    assert.equal(sent, 1);
    await rm(file);
    const target = path.join(folder, "target");
    await writeFile(target, "{}");
    await symlink(target, file);
    await assert.rejects(() => enqueue(folder, e));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
function archive(name, value) {
  return spawnSync("python3", [
    "-c",
    'import io,zipfile,sys; b=io.BytesIO(); z=zipfile.ZipFile(b,"w"); z.writestr(sys.argv[1],sys.argv[2]); z.close(); sys.stdout.buffer.write(b.getvalue())',
    name,
    JSON.stringify(value),
  ]).stdout;
}
test("data-only archive parser refuses traversal/unexpected entries; missing tests never go green", () => {
  assert.throws(() => parseArchive(archive("../unit.json", {})));
  assert.throws(() => parseArchive(archive("run.sh", "secret")));
  const reports = parseArchive(
    archive("unit.json", {
      schema: 1,
      runner: "node",
      complete: false,
      assertion: "PRIVATE",
    }),
  );
  assert.ok(!JSON.stringify(reports).includes("PRIVATE"));
  const rows = testEvents(
    { repository: "fixture/app", runId: 1, attempt: 2, sha },
    reports,
    observed,
  );
  assert.equal(rows.length, 10);
  assert.ok(
    rows.every((r) => r.data["test.report.status"] === "missing-or-partial"),
  );
  assert.throws(() =>
    testEvents(
      { repository: "fixture/app", runId: 1, attempt: 2, sha },
      {
        unit: {
          schema: 1,
          runner: "node",
          complete: true,
          success: true,
          counts: { tests: 1, passed: 99 },
        },
      },
      observed,
    ),
  );
});

test("closing references keep many-to-many source identities and refuse cross-repository claims", async () => {
  const { relationshipFacts } = await import(
    "../scripts/observability/contract.mjs"
  );
  const pr = { number: 3, head: { sha } };
  const rows = relationshipFacts(
    pr,
    [
      { number: 1, repository: { nameWithOwner: "fixture/app" } },
      { number: 2, repository: { nameWithOwner: "fixture/app" } },
    ],
    "fixture/app",
  );
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].eventId, rows[1].eventId);
  assert.throws(() =>
    relationshipFacts(
      pr,
      [{ number: 1, repository: { nameWithOwner: "fork/app" } }],
      "fixture/app",
    ),
  );
});

test("explicit milestones retain declared authority and require replay identity/source time", async () => {
  const { milestone } = await import("../scripts/observability/milestone.mjs");
  const value = {
    action: "started",
    issue: 77,
    id: "11111111-1111-4111-a111-111111111111",
    occurredAt: time,
    observedAt: observed,
    revision: sha,
  };
  const record = milestone(value);
  assert.equal(record.data["event.authority"], "developer-reported");
  assert.equal(record.time, time);
  assert.equal(
    record.id,
    milestone({ ...value, observedAt: "2026-10-31T00:00:00Z" }).id,
  );
  assert.throws(() => milestone({ ...value, id: undefined }));
  assert.throws(() => milestone({ ...value, action: "guess" }));
});

test("artifact selection binds main push, revision, run and originating attempt", async () => {
  const { selectArtifact } = await import(
    "../scripts/observability/test-artifact.mjs"
  );
  const identity = { runId: 1, attempt: 2, sha };
  const source = {
    id: 1,
    run_attempt: 2,
    head_sha: sha,
    event: "push",
    head_branch: "main",
  };
  const artifact = {
    id: 9,
    name: "structured-tests-2",
    expired: false,
    size_in_bytes: 100,
    workflow_run: { id: 1, head_sha: sha },
  };
  assert.equal(
    selectArtifact({ total_count: 1, artifacts: [artifact] }, identity, source)
      .id,
    9,
  );
  assert.equal(
    selectArtifact(
      {
        total_count: 1,
        artifacts: [{ ...artifact, name: "structured-tests-1" }],
      },
      identity,
      source,
    ),
    null,
  );
  assert.throws(() =>
    selectArtifact({ total_count: 1, artifacts: [artifact] }, identity, {
      ...source,
      event: "pull_request",
    }),
  );
  assert.throws(() =>
    selectArtifact(
      {
        total_count: 1,
        artifacts: [
          { ...artifact, workflow_run: { id: 1, head_sha: "b".repeat(40) } },
        ],
      },
      identity,
      source,
    ),
  );
  assert.throws(() =>
    selectArtifact(
      { total_count: 2, artifacts: [artifact, artifact] },
      identity,
      source,
    ),
  );
});
test("real HTTP receiver sees identical event IDs on retry and accepted records are not resent", async () => {
  const { createServer } = await import("node:http");
  const records = [];
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    records.push({ url: req.url, payload: JSON.parse(raw) });
    res.writeHead(records.length === 1 ? 503 : 202);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const folder = await mkdtemp(path.join(tmpdir(), "inspi-spool-http-"));
  try {
    await enqueue(folder, event());
    const origin = `http://127.0.0.1:${server.address().port}`;
    const summary = await drain(folder, origin, "", {
      local: true,
      sleep: async () => {},
    });
    assert.equal(summary.accepted, 1);
    assert.equal(records.length, 2);
    assert.deepEqual(records[0].payload, records[1].payload);
    assert.equal(records[0].url, "/api/v2/bizevents/ingest");
    await drain(folder, origin, "", { local: true });
    assert.equal(records.length, 2);
  } finally {
    await rm(folder, { recursive: true, force: true });
    await new Promise((resolve) => server.close(resolve));
  }
});
test("privileged reporting keeps production credentials out of source Checks and untrusted checkout", async () => {
  const { readFileSync } = await import("node:fs");
  const checks = readFileSync(
    new URL("../.github/workflows/check.yml", import.meta.url),
    "utf8",
  );
  const observer = readFileSync(
    new URL("../.github/workflows/observability.yml", import.meta.url),
    "utf8",
  );
  assert.ok(!checks.includes("DYNATRACE_CI_TOKEN"));
  assert.ok(checks.includes("structured-tests-${{ github.run_attempt }}"));
  assert.ok(
    observer.includes("ref: ${{ github.event.repository.default_branch }}"),
  );
  assert.ok(!observer.includes("pull_request.head.sha"));
  assert.ok(observer.includes("--ignore-scripts"));
  assert.ok(observer.includes("retention-days: 14"));
  assert.ok(!observer.includes("id-token: write"));
});
