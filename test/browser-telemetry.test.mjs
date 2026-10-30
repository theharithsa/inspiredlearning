import { test } from "node:test";
import assert from "node:assert/strict";
import {
  routeTemplate,
  outcome,
  registerTelemetry,
  observeRequest,
} from "../src/browser-telemetry.ts";
test("routes strip query strings and entity identifiers with static route precedence", () => {
  assert.equal(
    routeTemplate(
      "/api/v1/students/private@example.com/certificates?token=SECRET",
      true,
    ),
    "/students/{studentId}/certificates",
  );
  assert.equal(
    routeTemplate("/api/v1/students/scores", true),
    "/students/scores",
  );
  assert.equal(
    routeTemplate("/workshops/PRIVATE?code=SECRET"),
    "/workshops/:workshopId",
  );
  assert.equal(routeTemplate("/unexpected/PRIVATE"), "unknown");
});
test("expected rejections stay distinct from technical failures; raw messages are excluded", () => {
  assert.equal(
    outcome({ code: "functions/permission-denied", message: "SECRET" }).outcome,
    "rejected",
  );
  assert.equal(outcome({ code: "functions/cancelled" }).outcome, "cancelled");
  assert.equal(outcome(new Error("SECRET"), 503).outcome, "failure");
  assert.equal(outcome(new Error("SECRET"), 429).errorKind, "http-429");
  assert.equal(outcome().outcome, "success");
  assert.ok(!JSON.stringify(outcome(new Error("SECRET"))).includes("SECRET"));
});
test("bridge is inert until registered and sink failures never affect requests", () => {
  observeRequest({});
  let seen;
  registerTelemetry((name, data) => {
    seen = [name, data];
    throw Error("failure");
  });
  assert.doesNotThrow(() => observeRequest({ outcome: "success" }));
  assert.equal(seen[0], "api.request.completed");
});
