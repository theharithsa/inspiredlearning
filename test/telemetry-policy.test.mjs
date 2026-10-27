import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
const { HttpsError } = require("firebase-functions/v2/https");
import { errorOutcome, boundedFlush } from "../functions/telemetry-policy.js";
import { routeTemplate } from "../functions/api-http.js";
import {
  issueAwardFamily,
  revokeAwardFamily,
} from "../functions/certificate-policy.js";
test("domain rejections are distinguished from dependency and programming failures", () => {
  assert.equal(
    errorOutcome(new HttpsError("permission-denied", "not allowed")),
    "rejected",
  );
  assert.equal(
    errorOutcome(new HttpsError("unavailable", "service unavailable")),
    "failure",
  );
  assert.equal(
    errorOutcome(
      Object.assign(new Error("private dependency error"), {
        code: "resource-exhausted",
      }),
    ),
    "failure",
  );
});
test("flush preserves completion, rejection and a hard waiting deadline", async () => {
  assert.equal(await boundedFlush(async () => {}, 20), "flushed");
  assert.equal(
    await boundedFlush(async () => {
      throw Error();
    }, 20),
    "failed",
  );
  const started = performance.now();
  assert.equal(await boundedFlush(() => new Promise(() => {}), 20), "timeout");
  assert.ok(performance.now() - started < 500);
});
test("HTTP routes use the OpenAPI template including tokens and certificates", () => {
  assert.equal(
    routeTemplate("/api/v1/students/scores"),
    "/api/v1/students/scores",
  );
  assert.equal(
    routeTemplate("/api/v1/certificates/private-certificate"),
    "/api/v1/certificates/{certificateId}",
  );
  assert.equal(
    routeTemplate("/api/v1/admin/api-tokens/private-token"),
    "/api/v1/admin/api-tokens/{tokenId}",
  );
  assert.equal(
    routeTemplate("/api/v1/unknown/private-value"),
    "/api/v1/{unmatched}",
  );
});
test("award lifecycle queues transactional events only for transitions", () => {
  const creates = [],
    updates = [];
  const tx = {
    create: (ref, data) => creates.push({ ref, data }),
    update: (ref, data) => updates.push({ ref, data }),
  };
  const db = {
    doc: (path) => path,
    collection: () => ({ doc: () => "event" }),
  };
  const actor = { uid: "admin" },
    c = {
      transactionId: "tx",
      traceId: "a".repeat(32),
      spanId: "b".repeat(16),
    };
  issueAwardFamily(
    tx,
    db,
    { id: "parent", sid: "WORK01", uid: "learner", awards: ["Award", "Award"] },
    actor,
    c,
  );
  assert.equal(creates.length, 2);
  assert.equal(creates[1].data.payload.data["certificate.kind"], "award");
  assert.equal(creates[1].data.payload.data["event.schema.version"], "1.1");
  revokeAwardFamily(
    tx,
    [
      {
        id: "award",
        ref: "cert",
        data: () => ({ status: "issued", uid: "learner", sid: "WORK01" }),
      },
      { data: () => ({ status: "revoked" }) },
    ],
    1,
    "private reason",
    db,
    actor,
    c,
  );
  assert.equal(updates.length, 1);
  assert.equal(creates.length, 3);
  assert.equal(
    creates[2].data.payload.data["event.name"],
    "certificate.revoked",
  );
  assert.ok(!JSON.stringify(creates).includes("private reason"));
});

test("unexpected per-learner batch failures never expose dependency messages", async () => {
  const { execute } = await import("../functions/actions.js");
  const db = {
    doc: (path) => ({
      get: async () => ({
        exists: true,
        data: () => (path.startsWith("admins/") ? { role: "facilitator" } : {}),
      }),
    }),
    runTransaction: async () => {
      throw new Error("private database endpoint and internal failure");
    },
  };
  const result = await execute(
    db,
    { uid: "fac", email: "fac@example.invalid" },
    {
      action: "attendanceBatch",
      sid: "BATCH001",
      uids: ["learner"],
      status: "attended",
      reason: "Verified attendance",
    },
    { transactionId: "batch-test" },
  );
  assert.equal(result.results[0].status, "failed");
  assert.equal(
    result.results[0].message,
    "Could not update this learner. Retry.",
  );
  assert.ok(!JSON.stringify(result).includes("private database"));
});
