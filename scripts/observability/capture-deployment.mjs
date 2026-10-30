import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import {
  HOSTING,
  hostingFacts,
  deploymentCoverage,
  nativeDeployment,
} from "./deployment.mjs";
import { enqueue } from "./spool.mjs";
import { verifiedRelease } from "./release-verification.mjs";
// Read-only provider capture. No deployment or ingestion credential is accessed.
const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || ""))
  throw Error(
    "Usage: node scripts/observability/capture-deployment.mjs VERSION [--native]",
  );
const repository = "theharithsa/inspiredlearning";
function gh(path) {
  return JSON.parse(
    execFileSync("gh", ["api", path], {
      encoding: "utf8",
      maxBuffer: 1000000,
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
}
const release = gh(`/repos/${repository}/releases/tags/v${version}`);
let ref = gh(`/repos/${repository}/git/ref/tags/v${version}`).object;
for (let i = 0; ref.type === "tag" && i < 3; i++)
  ref = gh(`/repos/${repository}/git/tags/${ref.sha}`).object;
if (ref.type !== "commit" || !/^(?:[a-f0-9]{40})$/.test(ref.sha))
  throw Error("Invalid release revision");
const content = gh(`/repos/${repository}/contents/package.json?ref=${ref.sha}`);
if (content.encoding !== "base64" || content.size > 100000)
  throw Error("Invalid package metadata");
verifiedRelease(
  release,
  ref.sha,
  JSON.parse(Buffer.from(content.content, "base64").toString()).version,
);
const require = createRequire(import.meta.url),
  { requireAuth } = require("firebase-tools/lib/requireAuth"),
  { getGlobalDefaultAccount } = require("firebase-tools/lib/auth"),
  { Client } = require("firebase-tools/lib/apiv2");
const account = getGlobalDefaultAccount();
await requireAuth(
  account
    ? { user: account.user, tokens: account.tokens, nonInteractive: true }
    : { nonInteractive: true },
);
const api = new Client({
  urlPrefix: "https://firebasehosting.googleapis.com",
  apiVersion: "v1beta1",
  auth: true,
});
async function current(site) {
  const result = await api.get(`/sites/${site}/releases`, {
    queryParams: { pageSize: 1 },
  });
  const r = result.body.releases?.[0];
  if (!r?.version?.name) throw Error("No live provider release");
  const v = await api.get("/" + r.version.name);
  return {
    name: r.name,
    type: r.type,
    releaseTime: r.releaseTime,
    version: { name: r.version.name, status: v.body.status },
  };
}
async function get(origin, path) {
  return fetch(origin + path, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
}
const folder = process.env.TELEMETRY_SPOOL || ".observability/spool",
  receipts = [];
for (const h of HOSTING) {
  const before = await current(h.site);
  let live = null,
    apiMatches = false,
    denied = false;
  try {
    const r = await get(h.origin, "/version.json");
    if (r.ok) live = await r.json();
  } catch {}
  const manifest = {
    version,
    revision: ref.sha,
    sourceState: "clean",
    environment: "production",
    surface: h.surface,
    apiContract: "1.5.0",
  };
  // Source-owned API contract at the release revision, never inferred from a live mismatch.
  const schema = gh(
    `/repos/${repository}/contents/functions/openapi.json?ref=${ref.sha}`,
  );
  manifest.apiContract = JSON.parse(
    Buffer.from(schema.content, "base64").toString(),
  ).info.version;
  try {
    const r = await get(h.origin, "/api/openapi.json");
    apiMatches = r.ok && (await r.json()).info.version === manifest.apiContract;
  } catch {}
  try {
    denied = (await get(h.origin, "/api/v1/admin/access")).status === 401;
  } catch {}
  const after = await current(h.site),
    observedAt = new Date().toISOString();
  const receipt = hostingFacts({
    surface: h.surface,
    manifest,
    before,
    after,
    live,
    checks: { api: apiMatches, anonymousAdminDenied: denied },
    observedAt,
    repository,
  });
  await mkdir(".observability/receipts", { recursive: true, mode: 0o700 });
  await writeFile(
    `.observability/receipts/${h.surface}-${observedAt.replaceAll(":", "-")}.json`,
    JSON.stringify(receipt, null, 2),
    { mode: 0o600, flag: "wx" },
  );
  for (const event of receipt.events) await enqueue(folder, event);
  if (process.argv.includes("--native"))
    await enqueue(folder, nativeDeployment(receipt), { native: true });
  receipts.push(receipt);
  console.log(
    JSON.stringify({
      surface: h.surface,
      releaseId: receipt.releaseId,
      verification: receipt.verification,
      queued: true,
      tenantVisibility: "not-verified",
    }),
  );
}
console.log(
  JSON.stringify({
    coverage: deploymentCoverage(receipts),
    deployment: "read-only observation; no deployment performed",
  }),
);
