import test from "node:test";
import assert from "node:assert/strict";
import { sampleSpring, springFrames, SPRINGS } from "../src/ui/spring-model.ts";
test("pointer release retargets continuously with preserved velocity", () => {
  const held = sampleSpring(1, 0.97, 0, 0.06, SPRINGS.standard);
  const released = sampleSpring(
    held.position,
    1,
    held.velocity,
    0,
    SPRINGS.standard,
  );
  assert.equal(released.position, held.position);
  assert.ok(Math.abs(released.velocity - held.velocity) < 1e-12);
  const settled = sampleSpring(
    held.position,
    1,
    held.velocity,
    1,
    SPRINGS.standard,
  );
  assert.ok(Math.abs(settled.position - 1) < 1e-9);
});
test("spatial schemes settle finitely and expressiveness stays bounded", () => {
  for (const scheme of Object.values(SPRINGS)) {
    const { values, duration } = springFrames(0, 1, 0, scheme);
    assert.equal(values[0], 0);
    assert.equal(values.at(-1), 1);
    assert.ok(duration > 0 && duration <= 1000);
    assert.ok(values.every(Number.isFinite));
    assert.ok(Math.max(...values) <= 1.12);
    assert.ok(Math.min(...values) >= 0);
  }
  assert.ok(
    Math.max(...springFrames(0, 1, 0, SPRINGS.expressive).values) > 1.05,
  );
});
