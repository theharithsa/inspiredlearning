import { test } from "node:test";
import assert from "node:assert/strict";
import { createRumReadiness } from "../src/rum-readiness.ts";
function harness(retry = true) {
  let now = 0,
    ready = false;
  const tasks = [],
    sent = [],
    identities = [];
  const bridge = createRumReadiness({
    now: () => now,
    canRetry: () => retry,
    identify: (value) => {
      if (!ready) return false;
      identities.push(value);
      return true;
    },
    send: (name, data) => {
      if (!ready) return false;
      sent.push({ name, data });
      return true;
    },
    schedule: (fn) => {
      const task = { fn, active: true };
      tasks.push(task);
      return task;
    },
    cancel: (t) => (t.active = false),
  });
  return {
    bridge,
    sent,
    identities,
    setReady() {
      ready = true;
    },
    advance(ms) {
      now += ms;
      for (const task of tasks.splice(0)) if (task.active) task.fn();
    },
    pending() {
      return tasks.filter((t) => t.active).length;
    },
  };
}
test("late agent gets current identity and queued observations without crossing account changes", () => {
  const h = harness();
  h.bridge.identity("first@example.invalid");
  h.bridge.event("click", { id: "first" });
  h.bridge.identity("second@example.invalid");
  h.bridge.event("click", { id: "second" });
  h.setReady();
  h.advance(100);
  assert.deepEqual(h.identities, ["second@example.invalid"]);
  assert.deepEqual(h.sent, [{ name: "click", data: { id: "second" } }]);
});
test("queue is capped, expires and does not block later immediate observations", () => {
  const h = harness();
  h.bridge.identity("visitor");
  for (let i = 0; i < 100; i++) h.bridge.event("click", { id: i });
  h.setReady();
  h.advance(100);
  assert.equal(h.sent.length, 32);
  assert.equal(h.sent[0].data.id, 68);
  const expired = harness();
  expired.bridge.identity("visitor");
  expired.bridge.event("old", {});
  expired.advance(6000);
  assert.equal(expired.pending(), 0);
  expired.setReady();
  expired.bridge.event("new", {});
  assert.deepEqual(
    expired.sent.map((e) => e.name),
    ["new"],
  );
});
test("dev/blocked agent has no retry loop; clear drops pending private observations", () => {
  const disabled = harness(false);
  disabled.bridge.identity("visitor");
  disabled.bridge.event("event", {});
  assert.equal(disabled.pending(), 0);
  const h = harness();
  h.bridge.identity("signed-in");
  h.bridge.event("private", {});
  h.bridge.clear();
  h.setReady();
  h.advance(100);
  assert.equal(h.sent.length, 0);
});

test("clearing a UID context drops queued data even when the email identity is unchanged", () => {
  const h = harness();
  h.bridge.identity("shared@example.invalid");
  h.bridge.event("old-account", {});
  // The application clears on a UID change before assigning the display identity.
  h.bridge.clear();
  h.bridge.identity("shared@example.invalid");
  h.bridge.event("new-account", {});
  h.setReady();
  h.advance(100);
  assert.deepEqual(h.sent.map((e) => e.name), ["new-account"]);
});
