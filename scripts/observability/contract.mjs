import { createHash } from "node:crypto";
const sha = /^[0-9a-f]{40}$/;
const conclusions = new Set([
  "success",
  "failure",
  "cancelled",
  "skipped",
  "timed_out",
  "action_required",
  "neutral",
  "stale",
  "startup_failure",
]);
export const stableId = (parts) => {
  const h = createHash("sha256").update(JSON.stringify(parts)).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
function executionIdentity(run, repository, workflow) {
  if (
    run.repository?.full_name !== repository ||
    run.head_repository?.full_name !== repository ||
    !Number.isSafeInteger(run.id) ||
    !Number.isSafeInteger(run.run_attempt) ||
    run.run_attempt < 1 ||
    !sha.test(run.head_sha) ||
    run.status !== "completed" ||
    !conclusions.has(run.conclusion) ||
    String(run.path).split("@")[0] !== workflow
  )
    throw Error("Untrusted or incomplete source workflow");
  return {
    repository,
    runId: run.id,
    attempt: run.run_attempt,
    sha: run.head_sha,
    outcome: run.conclusion,
    workflow,
  };
}
export function runIdentity(run, repository) {
  return executionIdentity(run, repository, ".github/workflows/check.yml");
}
export function reviewRunIdentity(run, repository) {
  if (run.event !== "pull_request_review")
    throw Error("Invalid review signal source");
  return executionIdentity(
    run,
    repository,
    ".github/workflows/review-signal.yml",
  );
}
export function reviewFacts(number, reviews, repository) {
  if (
    !Number.isSafeInteger(number) ||
    number < 1 ||
    !Array.isArray(reviews) ||
    reviews.length > 100
  )
    throw Error("Invalid review snapshot");
  return reviews
    .filter((r) => r.state !== "PENDING")
    .map((r) => {
      if (
        !Number.isSafeInteger(r.id) ||
        !["APPROVED", "CHANGES_REQUESTED", "COMMENTED", "DISMISSED"].includes(
          r.state,
        ) ||
        !sha.test(r.commit_id || "") ||
        !r.submitted_at
      )
        throw Error("Invalid source review");
      return {
        kind: "review",
        action: "observed",
        reviewState: r.state.toLowerCase(),
        sourceId: r.id,
        number,
        revision: r.commit_id,
        occurredAt: r.state === "DISMISSED" ? null : r.submitted_at,
        eventId: stableId([
          repository,
          "review",
          r.id,
          r.state,
          r.submitted_at,
        ]),
      };
    });
}
export function workflowFacts(identity, jobs) {
  if (!Array.isArray(jobs) || jobs.length > 100)
    throw Error("Invalid job count");
  const rows = [
    {
      kind: "workflow",
      id: identity.runId,
      outcome: identity.outcome,
      occurredAt: null,
    },
  ];
  for (const job of jobs) {
    if (
      !Number.isSafeInteger(job.id) ||
      job.run_id !== identity.runId ||
      job.run_attempt !== identity.attempt ||
      job.head_sha !== identity.sha ||
      job.status !== "completed" ||
      !conclusions.has(job.conclusion)
    )
      throw Error("Job/source mismatch");
    rows.push({
      kind: "job",
      id: job.id,
      outcome: job.conclusion,
      occurredAt: job.completed_at || null,
    });
    if (!Array.isArray(job.steps) || job.steps.length > 100)
      throw Error("Invalid steps");
    for (const step of job.steps) {
      if (
        !Number.isSafeInteger(step.number) ||
        step.status !== "completed" ||
        !conclusions.has(step.conclusion)
      )
        throw Error("Incomplete step");
      rows.push({
        kind: "step",
        id: job.id + ":" + step.number,
        outcome: step.conclusion,
        occurredAt: step.completed_at || null,
      });
    }
  }
  return rows.map((row) => ({
    ...row,
    eventId: stableId([
      identity.repository,
      identity.runId,
      identity.attempt,
      row.kind,
      row.id,
    ]),
  }));
}
export function testSummary(value) {
  if (
    value?.schema !== 1 ||
    value.runner !== "node" ||
    typeof value.complete !== "boolean"
  )
    throw Error("Invalid test report");
  if (!value.complete) return { complete: false };
  const fields = ["tests", "passed", "failed", "cancelled", "skipped", "todo"];
  if (
    !value.counts ||
    fields.some(
      (k) =>
        !Number.isSafeInteger(value.counts[k]) ||
        value.counts[k] < 0 ||
        value.counts[k] > 100000,
    ) ||
    !Number.isFinite(value.durationMs) ||
    value.durationMs < 0 ||
    typeof value.success !== "boolean"
  )
    throw Error("Invalid test counts");
  const c = value.counts;
  if (c.passed + c.failed + c.cancelled + c.skipped + c.todo !== c.tests)
    throw Error("Inconsistent test counts");
  return {
    complete: true,
    success: value.success && c.failed === 0 && c.cancelled === 0,
    counts: Object.fromEntries(fields.map((k) => [k, c[k]])),
    durationMs: value.durationMs,
  };
}
export function lifecycleFact(type, event, repository) {
  if (event.repository?.full_name !== repository)
    throw Error("Repository mismatch");
  const allowed = {
    issues: ["opened", "closed", "reopened"],
    pull_request_target: [
      "opened",
      "closed",
      "reopened",
      "ready_for_review",
      "synchronize",
    ],
    pull_request_review: ["submitted", "dismissed"],
    release: ["published"],
  };
  if (!allowed[type]?.includes(event.action))
    throw Error("Unsupported lifecycle transition");
  const entity = event.issue || event.pull_request || event.release;
  if (!Number.isSafeInteger(entity?.id)) throw Error("Invalid source entity");
  const merged =
    type === "pull_request_target" &&
    event.action === "closed" &&
    entity.merged === true;
  const revision =
    type === "pull_request_review"
      ? event.review?.commit_id
      : merged
        ? entity.merge_commit_sha
        : entity.head?.sha;
  if (revision && !sha.test(revision)) throw Error("Invalid revision");
  let occurredAt;
  if (type === "pull_request_review")
    occurredAt =
      event.action === "submitted" ? event.review?.submitted_at : null;
  else if (event.action === "opened") occurredAt = entity.created_at;
  else if (merged) occurredAt = entity.merged_at;
  else if (event.action === "closed") occurredAt = entity.closed_at;
  else if (type === "release") occurredAt = entity.published_at;
  // updated_at is a snapshot time, not proof of a specific reopen/synchronize time.
  if (
    type === "pull_request_review" &&
    (!Number.isSafeInteger(event.review?.id) ||
      !["approved", "changes_requested", "commented", "dismissed"].includes(
        String(event.review?.state).toLowerCase(),
      ))
  )
    throw Error("Invalid review state");
  return {
    reviewState:
      type === "pull_request_review" ? event.review.state.toLowerCase() : null,
    occurredAt: occurredAt || null,
    headRevision: sha.test(entity.head?.sha || "") ? entity.head.sha : null,
    baseRevision: sha.test(entity.base?.sha || "") ? entity.base.sha : null,
    mergeRevision: merged ? revision : null,
    kind: type === "pull_request_target" ? "pull_request" : type,
    action: merged ? "merged" : event.action,
    sourceId: event.review?.id || entity.id,
    number: entity.number || null,
    revision: revision || null,
    eventId: stableId([
      repository,
      type,
      entity.id,
      event.action,
      event.review?.id || entity.updated_at || entity.published_at,
    ]),
  };
}

export function relationshipFacts(pr, issues, repository) {
  if (
    !Number.isSafeInteger(pr?.number) ||
    !sha.test(pr.head?.sha || "") ||
    !Array.isArray(issues) ||
    issues.length > 100
  )
    throw Error("Invalid relationship snapshot");
  return issues.map((issue) => {
    if (
      issue.repository?.nameWithOwner !== repository ||
      !Number.isSafeInteger(issue.number)
    )
      throw Error("Cross-repository relationship");
    return {
      pr: pr.number,
      issue: issue.number,
      revision: pr.head.sha,
      eventId: stableId([
        repository,
        "closing-reference",
        pr.number,
        pr.head.sha,
        issue.number,
      ]),
    };
  });
}
