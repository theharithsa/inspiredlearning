import { test } from "node:test";
import assert from "node:assert/strict";
import { apiClient, tools } from "../tools.js";
test("adapter maps only typed allowlisted GET routes and preserves the exact API data", async () => {
  const result = {
    items: [{ metric: "learningPoints", value: 100 }],
    nextCursor: null,
    asOf: "2026-10-11T00:00:00Z",
  };
  let called = 0;
  const read = apiClient(
    "https://example.invalid/api/v1",
    "short-lived-test-token",
    async (url, options) => {
      called++;
      assert.equal(url.pathname, "/api/v1/students/one/scores");
      assert.equal(url.searchParams.get("workshopId"), "API001");
      assert.equal(options.method, "GET");
      assert.equal(options.redirect, "error");
      assert.equal(
        options.headers.Authorization,
        "Bearer short-lived-test-token",
      );
      return { ok: true, json: async () => result };
    },
  );
  assert.deepEqual(
    (
      await read("get_student_score", {
        studentId: "one",
        workshopId: "API001",
      })
    ).structuredContent,
    result,
  );
  await assert.rejects(
    read("get_student_score", {
      studentId: "one",
      workshopId: "API001",
      arbitrary: true,
    }),
  );
  await assert.rejects(
    read("get_student_details", { studentId: "../../admins" }),
  );
  await assert.rejects(read("get_certificates", { limit: 101 }));
  assert.equal(called, 1);
  assert.equal(
    Object.keys(tools).some((n) => /write|delete|issue|revoke/.test(n)),
    false,
  );
});
test("credentials cannot be forwarded through insecure hosts or redirects; errors redact server data", async () => {
  for (const url of [
    "http://example.invalid/api/v1",
    "https://user:pass@example.invalid/api/v1",
    "https://example.invalid/api/v1?x=1",
  ])
    assert.throws(() => apiClient(url, "token"));
  const read = apiClient("http://127.0.0.1:5001/api/v1", "token", async () => ({
    ok: false,
    status: 403,
    json: () => {
      throw Error("private text");
    },
  }));
  await assert.rejects(read("get_student_details", {}), /403/);
});
