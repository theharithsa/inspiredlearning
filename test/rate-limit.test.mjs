import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import {
  createSharedRateLimiter,
  chooseRateLimiter,
  cleanRateCounters,
  rateId,
} from "../functions/rate-limit.js";
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || ""))
  throw Error("Use an isolated loopback Firestore emulator");
const app = initializeApp(
  { projectId: "demo-chaicart" },
  "rate-tests-" + randomUUID(),
);
const db = getFirestore(app);

const owned = [];
const key = () => {
  const k = "synthetic:" + randomUUID();
  owned.push(k);
  return k;
};
after(async () => {
  for (const k of owned)
    await db.doc("learningRateLimits/" + rateId(k)).delete();
  await deleteApp(app);
});
test("separate limiter instances enforce one shared quota under concurrent requests", async () => {
  const events = [];
  const options = { now: () => 100000, observe: (e) => events.push(e) };
  const a = createSharedRateLimiter(db, options),
    b = createSharedRateLimiter(db, options),
    id = key();
  const results = await Promise.allSettled(
    Array.from({ length: 16 }, (_, i) => (i % 2 ? a : b)(id, 5)),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 5);
  for (const r of results.filter((r) => r.status === "rejected"))
    assert.equal(r.reason.code, "resource-exhausted");
  const row = await db.doc("learningRateLimits/" + rateId(id)).get();
  assert.equal(row.data().count, 5);
  assert.deepEqual(Object.keys(row.data()).sort(), [
    "count",
    "expiresAt",
    "start",
  ]);
  assert.equal(
    events.reduce((n, e) => n + e.committedWrites, 0),
    5,
  );
});
test("expiry resets, clock rollback cannot reopen quota, and observers cannot affect decisions", async () => {
  let time = 200000;
  const rate = createSharedRateLimiter(db, {
      now: () => time,
      observe() {
        throw Error("isolated exporter");
      },
    }),
    id = key();
  await rate(id, 1);
  time -= 1000;
  await assert.rejects(rate(id, 1), { code: "resource-exhausted" });
  time += 61000;
  await rate(id, 1);
});
test("denied batch writes no partial counters and malformed state fails closed", async () => {
  const rate = createSharedRateLimiter(db, { now: () => 300000 }),
    a = key(),
    b = key();
  await rate(a, 1);
  await assert.rejects(
    rate([
      { key: a, limit: 1 },
      { key: b, limit: 5 },
    ]),
    { code: "resource-exhausted" },
  );
  assert.equal(
    (await db.doc("learningRateLimits/" + rateId(b)).get()).exists,
    false,
  );
  await db
    .doc("learningRateLimits/" + rateId(b))
    .set({ start: "broken", count: 0 });
  await assert.rejects(rate(b, 5), { code: "unavailable" });
});
test("cleanup rechecks expired rows transactionally and preserves a concurrently refreshed bucket", async () => {
  const id = key(),
    ref = db.doc("learningRateLimits/" + rateId(id));
  await ref.set({ count: 1, start: 0, expiresAt: Timestamp.fromMillis(10) });
  let injected = false;
  const wrapper = {
    collection: (...x) => db.collection(...x),
    runTransaction: async (fn) => {
      injected = true;
      await ref.set({
        count: 1,
        start: 1000000,
        expiresAt: Timestamp.fromMillis(1120000),
      });
      return db.runTransaction(fn);
    },
  };
  await cleanRateCounters(wrapper, { now: () => 1000000 });
  assert.equal(injected, true);
  assert.equal((await ref.get()).data().start, 1000000);
});
test("database outage fails closed instead of reverting to an independent local counter", async () => {
  const rate = createSharedRateLimiter({
    runTransaction: async () => {
      throw Error("database unavailable");
    },
  });
  await assert.rejects(rate(key()), { code: "unavailable" });
});

test("rollout gate uses shared counters only for backend-verified actor/token keys", async () => {
  const seen = [];
  const local = (key) => seen.push(["local", key]),
    shared = (key) => seen.push(["shared", key]);
  const on = chooseRateLimiter(local, shared, true),
    off = chooseRateLimiter(local, shared, false);
  await on("api-ip:untrusted", 120);
  await on("verify:untrusted", 60);
  await on("api:verified-uid", 120);
  await on("api-token:verified-token", 60);
  await off("api:verified-uid", 120);
  assert.deepEqual(
    seen.map((x) => x[0]),
    ["local", "local", "shared", "shared", "local"],
  );
});
