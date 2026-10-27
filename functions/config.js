import defaults from "./runtime-defaults.json" with { type: "json" };
export { defaults };
// Separate profiles preserve existing deployment limits; tuning is an explicit release decision.
const request = {
  region: defaults.region,
  maxInstances: 2,
  memory: "512MiB",
  timeoutSeconds: 540,
};
const worker = {
  region: defaults.region,
  maxInstances: 2,
  timeoutSeconds: 120,
};
export const functionProfiles = Object.freeze({
  actions: { ...request },
  api: { ...request },
  pdf: { ...request },
  verify: { ...request },
  legacyTelemetry: { ...request },
  enrollment: { ...request },
  delivery: { ...worker },
  recovery: { ...worker },
});
