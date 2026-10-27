import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import http from "node:http";
import { gunzipSync } from "node:zlib";
import protobuf from "protobufjs";
import { telemetryAdmin, outboxHealth } from "../functions/telemetry-admin.js";
import {
  measured,
  instrumentAuth,
  flushTelemetry,
  log,
} from "../functions/monitor.js";
import { deliver, eventRecord } from "../functions/events.js";
import { certificatePdf } from "../functions/pdf.js";
import { completeErasure } from "../functions/erasure.js";
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
let app, db, server;
const spans = [],
  exportedLogs = [];
const logWire = protobuf
  .parse(
    `syntax="proto3";message Request {repeated Resource resources=1;} message Resource {repeated Scope scopes=2;} message Scope {repeated Log records=2;} message Log {Value body=5;} message Value {string text=1;}`,
  )
  .root.lookupType("Request");
// An independent wire decoder deliberately understands only the fields asserted below.
const wire = protobuf
  .parse(
    `syntax="proto3";
message Request { repeated Resource resources=1; }
message Resource { repeated Scope scopes=2; }
message Scope { repeated Span spans=2; }
message Span { bytes traceId=1; bytes spanId=2; bytes parentSpanId=4; string name=5; int32 kind=6; repeated KeyValue attributes=9; }
message KeyValue {string key=1; Value value=2;}
message Value {string stringValue=1;}
`,
  )
  .root.lookupType("Request");
const actor = {
  uid: "maintenance-admin",
  email: "maintenance-admin@example.invalid",
};
const c = {
  transactionId: randomUUID(),
  traceId: "a".repeat(32),
  spanId: "b".repeat(16),
};
const audit = async () => {};
const read = (path, query = {}) =>
  telemetryAdmin(
    db,
    actor,
    "GET",
    "/api/v1/admin/telemetry/" + path,
    null,
    query,
    c,
    null,
    audit,
  );
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error("Emulator required");
  server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (d) => chunks.push(d));
    req.on("end", () => {
      if (req.url.endsWith("/traces")) {
        const raw = Buffer.concat(chunks),
          decoded = wire.decode(
            req.headers["content-encoding"] === "gzip" ? gunzipSync(raw) : raw,
          );
        spans.push(
          ...decoded.resources.flatMap((r) => r.scopes.flatMap((s) => s.spans)),
        );
      }
      if (req.url.endsWith("/logs")) {
        const raw = Buffer.concat(chunks),
          decoded = logWire.decode(
            req.headers["content-encoding"] === "gzip" ? gunzipSync(raw) : raw,
          );
        exportedLogs.push(
          ...decoded.resources.flatMap((r) =>
            r.scopes.flatMap((s) => s.records.map((r) => r.body?.text)),
          ),
        );
      }
      res.writeHead(req.url.includes("bizevents") ? 202 : 200, {
        "Content-Type": "application/x-protobuf",
      });
      res.end();
    });
  });
  await new Promise((resolve) => server.listen(8799, "127.0.0.1", resolve));
  app = initializeApp({ projectId: "demo-chaicart" }, "maintenance-test");
  db = getFirestore(app);
  await db.doc("admins/" + actor.email).set({ role: "facilitator" });
});
after(async () => {
  await flushTelemetry();
  await new Promise((resolve) => server.close(resolve));
  await deleteApp(app);
});
test("telemetry admin denies learners, captains and scoped credentials", async () => {
  for (const who of [
    { uid: "learner", email: "learner@example.invalid" },
    { uid: "captain", email: "captain@example.invalid" },
    { ...actor, apiTokenId: "synthetic-token" },
  ])
    await assert.rejects(
      telemetryAdmin(
        db,
        who,
        "GET",
        "/api/v1/admin/telemetry/health",
        null,
        {},
        c,
        null,
        audit,
      ),
      (e) => e.code === "permission-denied",
    );
});
test("outbox pages exclude private payloads; redrive is audited, optimistic and retry-safe", async () => {
  const prefix = "maintenance-" + randomUUID();
  const refs = [
    db.doc("learningTelemetry/" + prefix + "-a"),
    db.doc("learningTelemetry/" + prefix + "-b"),
  ];
  for (const ref of refs)
    await ref.set({
      ...eventRecord("test.fixture", actor, c, {
        "private.reason": "secret-text",
      }),
      status: "failed",
      attempts: 20,
      lastStatus: 400,
    });
  const page = await read("events", { status: "failed", limit: "1" });
  assert.equal(page.items.length, 1);
  assert.ok(page.nextCursor);
  assert.ok(!JSON.stringify(page).includes("secret-text"));
  assert.ok(!JSON.stringify(page).includes(actor.email));
  await assert.rejects(
    read("events", { status: "pending", cursor: page.nextCursor }),
    (e) => e.code === "invalid-argument",
  );
  const target = refs[0],
    before = (await target.get()).data(),
    key = randomUUID(),
    body = { reason: "Reviewed synthetic failure", expectedAttempts: 20 };
  const drive = (b = body, k = key) =>
    telemetryAdmin(
      db,
      actor,
      "POST",
      `/api/v1/admin/telemetry/events/${target.id}/redrive`,
      b,
      {},
      c,
      k,
      audit,
    );
  const result = await drive();
  assert.equal(result.queued, true);
  assert.deepEqual(await drive(), result);
  const after = (await target.get()).data();
  assert.deepEqual(after.payload, before.payload);
  assert.equal(after.attempts, 0);
  assert.equal(after.redriveCount, 1);
  await assert.rejects(
    drive({ ...body, reason: "Changed reason" }),
    (e) => e.code === "already-exists",
  );
  await assert.rejects(
    drive(body, randomUUID()),
    (e) => e.code === "failed-precondition",
  );
  const receipts = await db
    .collection("learningTelemetryOperations")
    .where("actorId", "==", actor.uid)
    .get();
  assert.ok(receipts.docs.some((d) => d.data().result.id === target.id));
  const events = await db.collection("learningTelemetry").get();
  assert.ok(
    events.docs.some(
      (d) =>
        d.data().payload?.data?.["event.name"] === "telemetry.event.redriven",
    ),
  );
  const health = await read("health");
  assert.ok(health.pending >= 1);
  assert.ok(health.failed >= 1);
  await Promise.all(refs.map((r) => r.delete()));
});
test("large pending sample reports unknown oldest age instead of a false exact value", async () => {
  const refs = Array.from({ length: 502 }, (_, i) =>
    db.doc("learningTelemetry/sample-" + i),
  );
  for (let i = 0; i < refs.length; i += 250) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + 250))
      batch.set(ref, { status: "pending", createdAt: Timestamp.now() });
    await batch.commit();
  }
  const result = await outboxHealth(db);
  assert.equal(result.oldestPendingAgeComplete, false);
  assert.equal(result.oldestPendingAgeSeconds, null);
  assert.equal(result.sampledPending, 501);
  for (let i = 0; i < refs.length; i += 250) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + 250)) batch.delete(ref);
    await batch.commit();
  }
});
test("legacy erasure discovery pages and resumes without deleting Live records", async () => {
  const uid = "maintenance-removal",
    ids = Array.from(
      { length: 55 },
      (_, i) => "PAGE" + String(i).padStart(4, "0"),
    );
  for (const sid of ids) {
    await db.doc("sessions/" + sid).set({ title: "Synthetic" });
    await db.doc(`sessions/${sid}/students/${uid}`).set({ name: "Synthetic" });
  }
  await db.doc("learningPrivacy/" + uid).set({
    state: "erasing",
    requestId: "maintenance-removal-request",
    blockedSessions: [],
    discovery: {
      historyDone: true,
      sessionAfter: null,
      sessionDone: false,
    },
    leaseUntil: 0,
  });
  assert.equal(
    await completeErasure(db, uid, actor, c, { discoveryBudgetMs: 0 }),
    false,
  );
  const interrupted = (await db.doc("learningPrivacy/" + uid).get()).data();
  assert.equal(interrupted.state, "erasing");
  assert.ok(interrupted.discovery.sessionAfter);
  assert.equal(interrupted.leaseUntil, 0);
  assert.equal(await completeErasure(db, uid, actor, c), true);
  const marker = (await db.doc("learningPrivacy/" + uid).get()).data();
  assert.equal(marker.state, "erased");
  assert.ok(marker.blockedSessions.includes(ids[54]));
  for (const sid of ids) assert.ok(marker.blockedSessions.includes(sid), sid);
  assert.equal(
    (await db.doc(`sessions/${ids[54]}/students/${uid}`).get()).exists,
    true,
  );
  const { recoverReactivation } = await import("../functions/actions.js");
  await db.doc("learningPrivacy/" + uid).update({
    state: "active",
    reactivationScan: { after: ids[20], done: false },
  });
  assert.equal(await recoverReactivation(db, uid, c, actor, 0), true);
  assert.equal(
    (await db.doc(`learningLearners/${uid}/workshops/${ids[54]}`).get()).exists,
    false,
    "blocked sessions stay blocked",
  );
  assert.equal(
    (await db.doc("learningPrivacy/" + uid).get()).data().reactivationScan.done,
    true,
  );
  for (const sid of ids) await db.recursiveDelete(db.doc("sessions/" + sid));
});
test("real OTLP contains nested native Firestore, Auth, PDF and outbound spans without secrets", async () => {
  const result = await measured(
    "maintenance.trace.fixture",
    actor,
    async () => {
      const ref = db.doc("maintenanceFixtures/trace");
      await ref.set({ safe: true });
      await ref.get();
      await db.runTransaction(async (tx) => {
        await tx.get(ref);
        tx.update(ref, { safe: true });
      });
      const auth = instrumentAuth({
        getUser: async () => ({ uid: "synthetic" }),
        verifyIdToken: async () => ({ uid: "synthetic" }),
      });
      await auth.getUser("never-export-this-uid");
      await auth.verifyIdToken("never-export-this-token");
      await certificatePdf({
        id: "SYNTHETIC",
        name: "Synthetic Learner",
        title: "Synthetic workshop",
        date: "2026-10-27",
        revision: 1,
      });
      const out = db.collection("maintenanceFixtures").doc();
      await out.set(eventRecord("test.fixture", actor, c));
      await deliver(out);
      await out.delete();
      return true;
    },
  );
  assert.equal(result, true);
  const root = spans.find((s) => s.name === "maintenance.trace.fixture");
  assert.ok(root, "root span exported");
  const hex = (b) => Buffer.from(b).toString("hex");
  const children = spans.filter((s) => hex(s.traceId) === hex(root.traceId));
  for (const name of [
    "firebase.auth.getUser",
    "firebase.auth.verifyIdToken",
    "certificate.pdf.render",
    "http.client.bizevents",
  ])
    assert.ok(
      children.some((s) => s.name === name),
      name,
    );
  assert.ok(
    children.some((s) => s.name === "Transaction.Run"),
    children.map((s) => s.name).join(","),
  );
  const auth = children.find((s) => s.name === "firebase.auth.getUser");
  assert.equal(hex(auth.parentSpanId), hex(root.spanId));
  assert.equal(auth.kind, 3);
  assert.ok(!JSON.stringify(children).includes("never-export-this"));
  assert.ok(
    !children.some((s) => s.name.includes("/otlp/")),
    "no exporter recursion",
  );
});

test("public REST verification requires no authentication and accepts no writes or unknown filters", async () => {
  const express = require("express"),
    app = express();
  const { apiHandler } = await import("../functions/api-http.js");
  app.use(express.json());
  app.use(
    apiHandler({
      db,
      auth: {
        verifyIdToken() {
          throw Error("Public route attempted authentication");
        },
      },
      rate() {},
      measured,
      audit,
    }),
  );
  const listener = app.listen(0, "127.0.0.1");
  await new Promise((r) => listener.once("listening", r));
  try {
    const url = `http://127.0.0.1:${listener.address().port}/api/v1/public/certificates/NOTAVAILABLE/verification`;
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "private-or-unavailable",
    });
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await fetch(url + "?unknown=true")).status, 400);
    assert.equal((await fetch(url, { method: "POST" })).status, 405);
  } finally {
    await new Promise((r) => listener.close(r));
  }
});

test("platform and OTLP log sinks can avoid duplication without changing the default", async () => {
  const original = console.log,
    printed = [];
  try {
    console.log = (line) => printed.push(line);
    process.env.TELEMETRY_LOG_SINK = "platform";
    log("WARN", "maintenance-platform-only");
    process.env.TELEMETRY_LOG_SINK = "otlp";
    log("WARN", "maintenance-otlp-only");
    delete process.env.TELEMETRY_LOG_SINK;
    log("WARN", "maintenance-default-both");
    await flushTelemetry();
  } finally {
    console.log = original;
    delete process.env.TELEMETRY_LOG_SINK;
  }
  assert.ok(printed.some((x) => x.includes("maintenance-platform-only")));
  assert.ok(!printed.some((x) => x.includes("maintenance-otlp-only")));
  assert.ok(!exportedLogs.includes("maintenance-platform-only"));
  assert.ok(exportedLogs.includes("maintenance-otlp-only"));
  assert.ok(printed.some((x) => x.includes("maintenance-default-both")));
  assert.ok(exportedLogs.includes("maintenance-default-both"));
});
