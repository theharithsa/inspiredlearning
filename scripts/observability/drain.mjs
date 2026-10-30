import { drain } from "./spool.mjs";
const summary = await drain(
  process.env.TELEMETRY_SPOOL || ".observability/spool",
  process.env.DYNATRACE_ENDPOINT || "https://indiacs.live.dynatrace.com",
  process.env.DYNATRACE_CI_TOKEN,
  { retryFailed: process.argv.includes("--retry-failed") },
);
console.log(JSON.stringify({ ...summary, tenantVisibility: "not-verified" }));
if (summary.failed || summary.pending) process.exitCode = 1;
