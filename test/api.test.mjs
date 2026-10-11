import { test } from "node:test";
import assert from "node:assert/strict";
import { googleActor, pageOptions, scores } from "../functions/api.js";
import { apiHandler } from "../functions/api-http.js";
test("shared identity accepts only verified Google users", () => {
  const token = {
    email: "one@example.invalid",
    email_verified: true,
    firebase: { sign_in_provider: "google.com" },
  };
  assert.equal(googleActor("one", token).uid, "one");
  for (const t of [
    { ...token, email_verified: false },
    { ...token, firebase: { sign_in_provider: "anonymous" } },
    null,
  ])
    assert.throws(() => googleActor("one", t));
});
test("pagination validates limits, repeated filters and binds cursors", () => {
  for (const q of [
    { limit: "101" },
    { limit: "0" },
    { limit: "2.5" },
    { uid: "one" },
    { limit: ["2"] },
    { cursor: "garbage" },
  ])
    assert.throws(() => pageOptions(q, "one"));
  const p = pageOptions({}, "one");
  const cursor = p.cursor("LEARN001");
  assert.equal(pageOptions({ cursor }, "one").after, "LEARN001");
  assert.throws(() => pageOptions({ cursor }, "two"));
});
test("scores preserve missing values and distinguish publication and units", () => {
  const result = scores("one", "LEARN001", {
    personalCredits: 0,
    teamCredits: "bad",
    learningPoints: 100,
    status: "revoked",
    date: "2026-10-08",
  });
  assert.equal(result[0].value, 0);
  assert.equal(result[1].value, null);
  assert.equal(result[2].unit, "points");
  assert.equal(result[2].publicationStatus, "revoked");
  assert.equal(result[2].scoringVersion, null);
  assert.equal(result[0].workshopTimezone, null);
  assert.equal(
    scores("one", "LEARN001", { status: "registered", personalCredits: 999 })[0]
      .value,
    null,
  );
});
test("HTTP transport rejects writes and missing/revoked identity without database access", async () => {
  const handler = apiHandler({
    db: null,
    auth: {
      verifyIdToken: async () => {
        throw Error("revoked");
      },
    },
    rate() {},
    measured() {},
  });
  for (const [method, header, expected] of [
    ["POST", "", 405],
    ["GET", "", 401],
    ["GET", "Bearer revoked", 401],
  ]) {
    const res = {
      statusCode: 200,
      set() {
        return this;
      },
      status(s) {
        this.statusCode = s;
        return this;
      },
      json(value) {
        this.value = value;
        return this;
      },
    };
    await handler(
      { method, path: "/api/v1/me", ip: "test", get: () => header },
      res,
    );
    assert.equal(res.statusCode, expected);
  }
});
