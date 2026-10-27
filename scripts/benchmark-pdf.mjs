import { performance } from "node:perf_hooks";
import { certificatePdf } from "../functions/pdf.js";
// Pure synthetic rendering only: no database, network, production records or telemetry initialization.
const samples = [];
for (let i = 0; i < 20; i++) {
  const start = performance.now();
  await certificatePdf({
    id: "SYNTHETIC",
    name: "Synthetic Learner",
    title: "Synthetic workshop",
    date: "2026-10-27",
    revision: 1,
  });
  samples.push(performance.now() - start);
}
const warm = samples.slice(1).sort((a, b) => a - b);
console.log(
  JSON.stringify({
    kind: "local-sequential-pdf-only",
    samples: samples.length,
    coldMs: Math.round(samples[0]),
    warmP50Ms: Math.round(warm[Math.ceil(warm.length * 0.5) - 1]),
    warmP95Ms: Math.round(warm[Math.ceil(warm.length * 0.95) - 1]),
    node: process.version,
    warning:
      "Not a deployed capacity, end-to-end latency or concurrent load result.",
  }),
);
