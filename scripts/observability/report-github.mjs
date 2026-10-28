import { verifiedRelease } from "./release-verification.mjs";
import { createHash } from "node:crypto";
import { deliveryPipeline } from "./pipeline.mjs";
import { readFileSync } from "node:fs";
import {
  runIdentity,
  workflowFacts,
  lifecycleFact,
  stableId,
} from "./contract.mjs";
const repository = process.env.GITHUB_REPOSITORY;
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || ""))
  throw Error("Invalid repository");
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const credential = process.env.DYNATRACE_CI_TOKEN;
if (!credential) throw Error("CI telemetry secret not configured");
const endpoint = new URL(
  process.env.DYNATRACE_ENDPOINT || "https://indiacs.live.dynatrace.com",
);
if (
  endpoint.protocol !== "https:" ||
  !endpoint.hostname.endsWith(".live.dynatrace.com") ||
  endpoint.pathname !== "/" ||
  endpoint.username ||
  endpoint.password
)
  throw Error("Invalid telemetry origin");
async function github(path) {
  const r = await fetch("https://api.github.com" + path, {
    headers: {
      Authorization: "Bearer " + process.env.GITHUB_TOKEN,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
    },
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw Error("GitHub source read failed: " + r.status);
  const text = await r.text();
  if (text.length > 5_000_000) throw Error("GitHub response too large");
  return JSON.parse(text);
}
let identity, rows, pipeline;
if (process.env.GITHUB_EVENT_NAME === "workflow_run") {
  const source = await github(
    `/repos/${repository}/actions/runs/${Number(event.workflow_run?.id)}`,
  );
  identity = runIdentity(source, repository);
  if (
    source.id !== event.workflow_run.id ||
    source.head_sha !== event.workflow_run.head_sha ||
    source.run_attempt !== event.workflow_run.run_attempt
  )
    throw Error("Source event/run mismatch");
  const jobs = [];
  for (let page = 1; page <= 10; page++) {
    const r = await github(
      `/repos/${repository}/actions/runs/${identity.runId}/attempts/${identity.attempt}/jobs?per_page=100&page=${page}`,
    );
    jobs.push(...r.jobs);
    if (r.jobs.length < 100) break;
    if (page === 10) throw Error("Job pagination bound exceeded");
  }
  rows = workflowFacts(identity, jobs);
  pipeline = deliveryPipeline(endpoint.origin, credential);
  await pipeline.workflow(source, jobs, identity);
} else {
  rows = [lifecycleFact(process.env.GITHUB_EVENT_NAME, event, repository)];
  identity = { repository, sha: rows[0].revision };
  if (process.env.GITHUB_EVENT_NAME === "release") {
    const tag = event.release.tag_name;
    if (!/^v?\d+\.\d+\.\d+$/.test(tag || ""))
      throw Error("Unsupported release tag");
    let ref = (
      await github(
        `/repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`,
      )
    ).object;
    for (let n = 0; ref.type === "tag" && n < 3; n++)
      ref = (await github(`/repos/${repository}/git/tags/${ref.sha}`)).object;
    if (ref.type !== "commit")
      throw Error("Release tag must resolve to a commit");
    const content = await github(
      `/repos/${repository}/contents/package.json?ref=${ref.sha}`,
    );
    if (content.encoding !== "base64" || content.size > 100000)
      throw Error("Invalid package metadata");
    const pkg = JSON.parse(Buffer.from(content.content, "base64").toString());
    const verified = verifiedRelease(event.release, ref.sha, pkg.version);
    identity.sha = verified.revision;
    rows[0].notesDigest = createHash("sha256")
      .update(event.release.body || "")
      .digest("hex");
  }
  const pr = event.pull_request;
  if (pr && Number.isSafeInteger(pr.number)) {
    const reviews = await github(
      `/repos/${repository}/pulls/${pr.number}/reviews?per_page=100`,
    );
    for (const review of reviews) {
      if (
        !Number.isSafeInteger(review.id) ||
        !["APPROVED", "CHANGES_REQUESTED", "COMMENTED", "DISMISSED"].includes(
          review.state,
        )
      )
        continue;
      rows.push({
        kind: "review",
        action: review.state.toLowerCase(),
        sourceId: review.id,
        eventId: stableId([
          repository,
          "review",
          review.id,
          review.state,
          review.submitted_at,
        ]),
      });
    }
  }
}
const headers = {
  "Content-Type": "application/cloudevents+json",
  Authorization:
    (credential.startsWith("dt0c01.") ? "Api-Token " : "Bearer ") + credential,
};
// No logs, titles, bodies, command text, assertion messages, artifacts or user email.
for (const row of rows) {
  const data = {
    "event.id": row.eventId,
    "event.name": "github." + row.kind + "." + (row.action || row.outcome),
    "event.provider": "inspiredlearning-github",
    "event.authority": "source-confirmed-automation",
    "github.repository": repository,
    "github.run.id": identity.runId || null,
    "github.run.attempt": identity.attempt || null,
    "vcs.revision": identity.sha || null,
    "github.source.id": String(row.id || row.sourceId),
    "github.outcome": row.outcome || null,
    "release.notes.sha256": row.notesDigest || null,
  };
  const payload = {
    specversion: "1.0",
    id: row.eventId,
    source: "github:" + repository,
    type: "com.inspiredlearning.github." + row.kind,
    time: new Date().toISOString(),
    data,
  };
  let accepted = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(endpoint.origin + "/api/v2/bizevents/ingest", {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    if (r.status === 202) {
      accepted = true;
      break;
    }
    if (r.status < 500 && r.status !== 429) break;
  }
  if (!accepted) throw Error("CI business-event ingestion not accepted");
}
await pipeline?.close();
console.log(
  JSON.stringify({
    reported: rows.length,
    source: "github",
    accepted: true,
    tenantVisibility: "not-verified",
  }),
);
