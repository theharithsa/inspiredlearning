import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaults, functionProfiles } from "../functions/config.js";
const json = (p) =>
  JSON.parse(readFileSync(new URL("../" + p, import.meta.url)));
test("Hosting and emulator configuration match the single runtime defaults", () => {
  for (const name of ["firebase.json", "firebase.rehearsal.json"]) {
    const config = json(name);
    for (const [kind, port] of Object.entries(defaults.ports))
      assert.equal(config.emulators[kind].port, port);
  }
  assert.equal(
    json("firebase.json").hosting.rewrites[0].function.region,
    defaults.region,
  );
  for (const p of Object.values(functionProfiles)) {
    assert.equal(p.region, defaults.region);
    assert.equal(p.maxInstances, 2);
  }
  for (const key of [
    "actions",
    "api",
    "pdf",
    "verify",
    "legacyTelemetry",
    "enrollment",
  ]) {
    assert.equal(functionProfiles[key].timeoutSeconds, 540);
    assert.equal(functionProfiles[key].memory, "512MiB");
  }
  assert.notEqual(functionProfiles.api, functionProfiles.pdf);
});
