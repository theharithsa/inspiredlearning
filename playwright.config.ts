import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "test/browser",
  globalSetup: "./test/collector-setup.mjs",
  workers: 1,
  fullyParallel: false,
  maxFailures: 1,
  timeout: 120000,
  expect: { timeout: 20000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5182",
    channel: process.env.CI ? undefined : "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15000,
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5182 --strictPort",
    url: "http://127.0.0.1:5182",
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
