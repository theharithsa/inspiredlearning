import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createRequire } from "node:module";
import { deliver, eventRecord } from "../functions/events.js";
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
let app,
  db,
  server,
  responseStatus = 202,
  attempts = 0;
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST)
    throw Error("Firestore emulator required");
  process.env.FUNCTIONS_EMULATOR = "true";
  app = initializeApp({ projectId: "demo-chaicart" }, "outbox-test");
  db = getFirestore(app);
  server = http.createServer((req, res) => {
    req.resume();
    if (req.url.includes("bizevents")) {
      attempts++;
      res.writeHead(responseStatus);
    } else res.writeHead(200, { "Content-Type": "application/x-protobuf" });
    res.end();
  });
  await new Promise((resolve) => server.listen(8799, "127.0.0.1", resolve));
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await deleteApp(app);
});
const c = {
  transactionId: "outbox-test",
  traceId: "a".repeat(32),
  spanId: "b".repeat(16),
};
async function pending(extra = {}) {
  const ref = db.collection("outboxTestFixtures").doc();
  await ref.set({
    ...eventRecord("test.fixture", { uid: "synthetic" }, c),
    ...extra,
  });
  return ref;
}
test("outbox acceptance, permanent rejection and lease deduplication", async () => {
  responseStatus = 202;
  const ref = await pending();
  const start = attempts;
  await Promise.all([deliver(ref), deliver(ref)]);
  const data = (await ref.get()).data();
  assert.equal(data.status, "delivered");
  assert.equal(data.attempts, 1);
  assert.equal(attempts - start, 1);
  await deliver(ref);
  assert.equal(attempts - start, 1);
  responseStatus = 400;
  const invalid = await pending();
  await deliver(invalid);
  assert.equal((await invalid.get()).data().status, "failed");
  const count = attempts;
  await deliver(invalid);
  assert.equal(attempts, count);
});
test("outbox transient retry, cap and strict documented acceptance", async () => {
  responseStatus = 503;
  const retry = await pending();
  await deliver(retry);
  const row = (await retry.get()).data();
  assert.equal(row.status, "pending");
  assert.ok(row.nextAttemptAt > Date.now());
  const capped = await pending({ attempts: 19 });
  await deliver(capped);
  assert.equal((await capped.get()).data().status, "failed");
  responseStatus = 200;
  const wrongSuccess = await pending();
  await deliver(wrongSuccess);
  assert.equal((await wrongSuccess.get()).data().status, "pending");
  responseStatus = 202;
  await retry.update({ nextAttemptAt: 0 });
  await deliver(retry);
  assert.equal((await retry.get()).data().status, "delivered");
});
