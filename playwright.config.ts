import { defineConfig } from "@playwright/test";
const webPort = Number(process.env.INSPI_REHEARSAL_WEB_PORT || 5182);
if (!Number.isSafeInteger(webPort) || webPort < 1024 || webPort > 65535)
  throw new Error("Invalid rehearsal web port");
export default defineConfig({
  testDir: "test/browser",
  globalSetup: "./test/collector-setup.mjs",
  workers: 1,
  fullyParallel: false,
  maxFailures: 1,
  timeout: 120000,
  expect: { timeout: 20000 },
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["./scripts/observability/playwright-reporter.mjs"],
  ],
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    channel: process.env.CI ? undefined : "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15000,
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${webPort} --strictPort`,
    url: `http://127.0.0.1:${webPort}`,
    reuseExistingServer: false,
    env: {
      VITE_USE_EMULATORS: "true",
      VITE_FIREBASE_API_KEY: "demo-key",
      VITE_FIREBASE_PROJECT_ID: "demo-chaicart",
      VITE_FIREBASE_APP_ID: "demo-app",
      VITE_FIREBASE_AUTH_DOMAIN: "localhost",
    },
  },
});
