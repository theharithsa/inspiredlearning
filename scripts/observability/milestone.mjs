import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { eventRecord } from "./events.mjs";
import { enqueue } from "./spool.mjs";
export function milestone({
  action,
  issue,
  id,
  occurredAt,
  revision,
  observedAt,
}) {
  if (
    !["started", "blocked", "resumed", "triaged"].includes(action) ||
    !Number.isSafeInteger(issue) ||
    issue < 1 ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      id || "",
    ) ||
    !/^[a-f0-9]{40}$/.test(revision || "") ||
    !occurredAt
  )
    throw Error("Invalid explicit milestone");
  return eventRecord({
    kind: "sdlc.development." + action,
    source: "developer",
    identity: [id],
    occurredAt,
    observedAt,
    authority: "developer-reported",
    status: action,
    data: {
      "github.repository": "theharithsa/inspiredlearning",
      "github.issue.number": issue,
      "vcs.revision": revision,
    },
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [action, issue, id, occurredAt] = process.argv.slice(2);
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const event = milestone({
    action,
    issue: Number(issue),
    id,
    occurredAt,
    revision,
  });
  await enqueue(process.env.TELEMETRY_SPOOL || ".observability/spool", event);
  console.log(
    JSON.stringify({
      queued: true,
      id: event.id,
      authority: "developer-reported",
      tenantVisibility: "not-verified",
    }),
  );
}
