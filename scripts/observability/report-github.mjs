import { recordedDeploymentEvents } from "./recorded-deployments.mjs";
import { boundedJson, telemetryOrigin } from "./transport.mjs";
import { eventRecord } from "./events.mjs";
import { enqueue, drain } from "./spool.mjs";
import { testEvents } from "./report-tests.mjs";
import { parseArchive, selectArtifact } from "./test-artifact.mjs";
import { verifiedRelease } from "./release-verification.mjs";
import { createHash } from "node:crypto";
import { deliveryPipeline } from "./pipeline.mjs";
import { readFileSync } from "node:fs";
import {
  runIdentity,
  workflowFacts,
  lifecycleFact,
  relationshipFacts,
} from "./contract.mjs";
const repository = process.env.GITHUB_REPOSITORY;
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || ""))
  throw Error("Invalid repository");
let event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
const credential = process.env.DYNATRACE_CI_TOKEN;
if (!credential) throw Error("CI telemetry secret not configured");
const endpoint = {
  origin: telemetryOrigin(
    process.env.DYNATRACE_ENDPOINT || "https://indiacs.live.dynatrace.com",
  ),
};
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
  return boundedJson(r, 5_000_000);
}
let eventName = process.env.GITHUB_EVENT_NAME;
const replayHosting =
  eventName === "workflow_dispatch" &&
  ["true", true].includes(event.inputs?.replay_hosting_observation);
if (eventName === "workflow_dispatch") {
  const { run_id, attempt } = event.inputs || {};
  if (
    !/^[1-9][0-9]{0,14}$/.test(run_id || "") ||
    !/^[1-9][0-9]{0,5}$/.test(attempt || "")
  )
    throw Error("Invalid replay run/attempt");
  const source = await github(
    `/repos/${repository}/actions/runs/${run_id}/attempts/${attempt}`,
  );
  event = { workflow_run: source };
  eventName = "workflow_run";
}
let identity, rows, pipeline, sourceRun;
const folder = process.env.TELEMETRY_SPOOL || ".observability/spool";
const observedAt = new Date().toISOString();
if (eventName === "workflow_run") {
  const source = await github(
    `/repos/${repository}/actions/runs/${Number(event.workflow_run?.id)}/attempts/${Number(event.workflow_run?.run_attempt)}`,
  );
  identity = runIdentity(source, repository);
  sourceRun = source;
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
  rows = [lifecycleFact(eventName, event, repository)];
  identity = { repository, sha: rows[0].revision };
  if (eventName === "release") {
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
}
// Allowlisted source metadata only. Observation time is explicit when the source
// does not expose an authoritative transition timestamp.
try {
  for (const row of rows) {
    const payload = eventRecord({
      kind: "github." + row.kind + "." + (row.action || row.outcome),
      source: "github",
      identity: [repository, row.eventId],
      occurredAt: row.occurredAt,
      observedAt,
      authority: "source-confirmed-automation",
      status: row.action || row.outcome,
      data: {
        "github.repository": repository,
        "github.run.id": identity.runId || null,
        "github.run.attempt": identity.attempt || null,
        "vcs.revision": identity.sha || null,
        "github.source.id": String(row.id || row.sourceId),
        "github.outcome": row.outcome || null,
        "github.number": row.number || null,
        "github.review.state": row.reviewState || null,
        "github.head.revision": row.headRevision || null,
        "github.base.revision": row.baseRevision || null,
        "github.merge.revision": row.mergeRevision || null,
        "release.notes.sha256": row.notesDigest || null,
      },
    });
    await enqueue(folder, payload);
  }
  if (event.pull_request && Number.isSafeInteger(event.pull_request.number)) {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.GITHUB_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query:
          "query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){closingIssuesReferences(first:100){pageInfo{hasNextPage} nodes{number repository{nameWithOwner}}}}}}",
        variables: {
          owner: repository.split("/")[0],
          repo: repository.split("/")[1],
          number: event.pull_request.number,
        },
      }),
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw Error("Relationship source read failed");
    const result = await boundedJson(response, 1000000),
      refs = result.data?.repository?.pullRequest?.closingIssuesReferences;
    if (result.errors || !refs || refs.pageInfo.hasNextPage)
      throw Error("Relationship source incomplete");
    for (const link of relationshipFacts(
      event.pull_request,
      refs.nodes,
      repository,
    ))
      await enqueue(
        folder,
        eventRecord({
          kind: "github.relationship.observed",
          source: "github",
          identity: [link.eventId],
          observedAt,
          authority: "source-confirmed-automation",
          status: "linked",
          data: {
            "github.repository": repository,
            "github.issue.number": link.issue,
            "github.pull_request.number": link.pr,
            "vcs.revision": link.revision,
          },
        }),
      );
  }
  // Only main-push summaries from this exact source run/attempt are consumed.
  if (sourceRun?.event === "push" && sourceRun.head_branch === "main") {
    const listing = await github(
      `/repos/${repository}/actions/runs/${identity.runId}/artifacts?per_page=100`,
    );
    const artifact = selectArtifact(listing, identity, sourceRun);
    let reports = {};
    if (artifact) {
      const response = await fetch(
        `https://api.github.com/repos/${repository}/actions/artifacts/${artifact.id}/zip`,
        {
          headers: { Authorization: "Bearer " + process.env.GITHUB_TOKEN },
          redirect: "manual",
          signal: AbortSignal.timeout(20000),
        },
      );
      if (response.status !== 302) throw Error("Artifact redirect missing");
      const location = new URL(response.headers.get("location"));
      if (
        location.protocol !== "https:" ||
        location.username ||
        location.password ||
        !(
          location.hostname.endsWith(".blob.core.windows.net") ||
          location.hostname.endsWith(".actions.githubusercontent.com")
        )
      )
        throw Error("Untrusted artifact location");
      // Signed storage URL receives no GitHub or ingest credential.
      const download = await fetch(location, {
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
      if (!download.ok) throw Error("Artifact download failed");
      const parts = [];
      let size = 0;
      for await (const chunk of download.body) {
        size += chunk.length;
        if (size > 1000000) throw Error("Artifact download too large");
        parts.push(chunk);
      }
      reports = parseArchive(Buffer.concat(parts));
    }
    for (const payload of testEvents(identity, reports, observedAt))
      await enqueue(folder, payload);
  }
  if (replayHosting) {
    // Reviewed default-branch provider receipts only. Never PR/user-supplied paths,
    // never restamp the historical deployment or its original probe time.
    const raw = readFileSync(
      new URL(
        "../../docs/evidence/observability-2.2.1/provider-observation.json",
        import.meta.url,
      ),
      "utf8",
    );
    if (raw.length > 100000) throw Error("Recorded observation too large");
    for (const payload of recordedDeploymentEvents(JSON.parse(raw).receipts))
      await enqueue(folder, payload);
  }
  const summary = await drain(folder, endpoint.origin, credential);
  console.log(
    JSON.stringify({
      ...summary,
      source: "github",
      tenantVisibility: "not-verified",
      otlp: "SDK shutdown is not per-record acceptance",
    }),
  );
  if (summary.failed || summary.pending) process.exitCode = 1;
} finally {
  if (pipeline) {
    const result = await pipeline.close();
    console.log(JSON.stringify({ otlp: result }));
    if (Object.values(result.signals).some((signal) => signal.sdkFailure > 0))
      process.exitCode = 1;
  }
}
