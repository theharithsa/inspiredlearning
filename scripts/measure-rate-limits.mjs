import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { writeFileSync } from "node:fs";
import { createSharedRateLimiter, rateId } from "../functions/rate-limit.js";
if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || ""))
  throw Error("Measurement requires a loopback demo emulator");
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const app = initializeApp(
  { projectId: "demo-chaicart" },
  "counter-measure-" + randomUUID(),
);
const db = getFirestore(app);
const keys = new Set();
const makeKey = () => {
  const k = "measure:" + randomUUID();
  keys.add(k);
  return k;
};
const reports = [];
try {
  for (const scenario of [
    "callable-sequential",
    "rest-three-counters",
    "two-instance-burst",
  ]) {
    const observations = [],
      latencies = [];
    const rateA = createSharedRateLimiter(db, {
        observe: (x) => observations.push(x),
      }),
      rateB = createSharedRateLimiter(db, {
        observe: (x) => observations.push(x),
      });
    const ids = [makeKey(), makeKey(), makeKey()];
    let accepted = 0,
      rejected = 0,
      failed = 0;
    const run = async (i) => {
      const start = performance.now();
      try {
        const rate = i % 2 ? rateA : rateB;
        await rate(ids[0], 120);
        if (scenario === "rest-three-counters") {
          await rate(ids[1], 120);
          await rate(ids[2], 60);
        }
        accepted++;
      } catch (e) {
        if (e.code === "resource-exhausted") rejected++;
        else failed++;
      }
      latencies.push(performance.now() - start);
    };
    if (scenario === "two-instance-burst")
      await Promise.all(Array.from({ length: 16 }, (_, i) => run(i)));
    else for (let i = 0; i < 20; i++) await run(i);
    latencies.sort((a, b) => a - b);
    reports.push({
      scenario,
      requests: latencies.length,
      accepted,
      rejected,
      failed,
      logicalTransactionReads: observations.reduce((n, o) => n + o.reads, 0),
      committedDocumentWrites: observations.reduce(
        (n, o) => n + o.committedWrites,
        0,
      ),
      transactionAttempts: observations.reduce((n, o) => n + o.attempts, 0),
      p50Ms: Math.round(latencies[Math.floor(latencies.length * 0.5)]),
      p95Ms: Math.round(
        latencies[
          Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))
        ],
      ),
    });
  }
  const result = {
    environment: "loopback Firestore emulator / demo-chaicart",
    measuredAt: new Date().toISOString(),
    productionActivated: false,
    limitations:
      "Document-operation observations are not billed-usage receipts or production latency/load evidence. IP provenance remains a rollout gate. Cleanup uses bounded query plus transactional rereads/deletes and is separate from these request counts.",
    reports,
  };
  const path = process.env.RATE_MEASUREMENT_OUTPUT;
  if (path) writeFileSync(path, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  for (const k of keys)
    await db.doc("learningRateLimits/" + rateId(k)).delete();
  await deleteApp(app);
}
