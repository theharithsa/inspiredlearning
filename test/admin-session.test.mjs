import { test } from "node:test";
import assert from "node:assert/strict";
import {
  requireRecentAuth,
  adminAccess,
  checkCallableStepUp,
} from "../functions/admin-session.js";
test("administrator step-up uses verified auth_time and preserves the existing tolerance", () => {
  for (const age of [0, 299, 300, -60])
    assert.doesNotThrow(() => requireRecentAuth(1000 - age, 1000));
  for (const value of [undefined, null, "1000", NaN, Infinity, 699, 1061])
    assert.throws(
      () => requireRecentAuth(value, 1000),
      (e) => e.code === "failed-precondition",
    );
});
test("bootstrap denies tokens and non-admins, discloses only capabilities and accepts no filters", async () => {
  const db = {
    doc: () => ({
      get: async () => ({
        exists: true,
        data: () => ({ role: "facilitator" }),
      }),
    }),
  };
  let audits = 0;
  const result = await adminAccess(
    db,
    { uid: "synthetic", email: "admin@example.invalid" },
    {},
    async () => audits++,
  );
  assert.equal(result.administrator, true);
  assert.equal(result.recentAuthMaxAgeSeconds, 300);
  assert.equal(audits, 1);
  assert.ok(!JSON.stringify(result).includes("example.invalid"));
  await assert.rejects(
    adminAccess(db, { apiTokenId: "token" }, {}, async () => {}),
    (e) => e.code === "permission-denied",
  );
  await assert.rejects(
    adminAccess(
      db,
      { email: "admin@example.invalid" },
      { all: "true" },
      async () => {},
    ),
    (e) => e.code === "invalid-argument",
  );
  const noRole = {
    doc: () => ({ get: async () => ({ exists: false, data: () => null }) }),
  };
  await assert.rejects(
    adminAccess(
      noRole,
      { email: "learner@example.invalid" },
      {},
      async () => {},
    ),
    (e) => e.code === "permission-denied",
  );
});
test("captain behavior stays unchanged while stale global-admin mutations require step-up", async () => {
  const db = (role) => ({
    doc: () => ({ get: async () => ({ data: () => role }) }),
  });
  await checkCallableStepUp(
    db(null),
    { email: "captain@example.invalid" },
    "attendance",
  );
  await checkCallableStepUp(
    db({ role: "facilitator" }),
    { email: "admin@example.invalid" },
    "roster",
  );
  await assert.rejects(
    checkCallableStepUp(
      db({ role: "facilitator" }),
      { email: "admin@example.invalid" },
      "finalize",
    ),
    (e) => e.code === "failed-precondition",
  );
});

test("callables verify current revocation/disabled state and never trust mismatched transport claims", async () => {
  const { callableActor } = await import("../functions/callable-auth.js");
  const claims = {
    uid: "fixture",
    email: "admin@example.invalid",
    email_verified: true,
    firebase: { sign_in_provider: "google.com" },
    auth_time: 123,
  };
  const request = {
    auth: { uid: claims.uid, token: claims },
    rawRequest: { headers: { authorization: "Bearer synthetic-token" } },
  };
  let checked = false;
  const actor = await callableActor(request, {
    verifyIdToken: async (token, checkRevoked) => {
      assert.equal(token, "synthetic-token");
      checked = checkRevoked;
      return claims;
    },
  });
  assert.equal(checked, true);
  assert.equal(actor.authTime, 123);
  for (const reason of ["auth/user-disabled", "auth/id-token-revoked"]) {
    await assert.rejects(
      callableActor(request, {
        verifyIdToken: async () => {
          throw Object.assign(Error("PRIVATE_PROVIDER_DETAIL"), {
            code: reason,
          });
        },
      }),
      (e) => e.code === "unauthenticated" && !e.message.includes("PRIVATE"),
    );
  }
  await assert.rejects(
    callableActor(request, {
      verifyIdToken: async () => ({ ...claims, uid: "other" }),
    }),
    (e) => e.code === "unauthenticated",
  );
  await assert.rejects(
    callableActor({ ...request, rawRequest: { headers: {} } }, {}),
    (e) => e.code === "unauthenticated",
  );
});
