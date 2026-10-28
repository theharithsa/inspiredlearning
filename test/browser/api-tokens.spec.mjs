import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../../functions/package.json", import.meta.url),
);
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
let app, db;
const email = "tokens-admin@example.invalid";
test.beforeAll(async () => {
  if (process.env.GCLOUD_PROJECT !== "demo-chaicart")
    throw Error("Emulator project required.");
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8185";
  app = initializeApp({ projectId: "demo-chaicart" }, "token-portal-browser");
  db = getFirestore(app);
  await db.doc(`admins/${email}`).set({ role: "facilitator" });
});
test.afterAll(async () => {
  await deleteApp(app);
});
test("administrator can create a scoped credential, copy it once, use it and revoke it", async ({
  browser,
}) => {
  const context = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.route("https://**dynatrace.com/**", (route) => route.abort());
  const page = await context.newPage();
  await page.goto("/admin.html#/integrations");
  const uid = await page.evaluate(
    (email) => import("/test/browser-auth.ts").then((m) => m.login(email)),
    email,
  );
  await db
    .doc(`learningLearners/${uid}`)
    .set({ name: "Token administrator", email });
  await page.goto("/admin.html#/integrations");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "API tokens", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Create and update colleges", { exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByLabel("Correct learner names", { exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByLabel("Award, deduct and correct student credits", {
      exact: true,
    }),
  ).not.toBeChecked();
  await page.getByLabel("Token name").fill("Browser scoped token");
  await page.getByLabel("Learner profiles", { exact: true }).check();
  await page.getByLabel("Learner IDs (optional)").fill(uid);
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Confirm Google sign-in and create token" })
    .click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  // Google emulator offers the existing account for reauthentication.
  await popup.getByText(email, { exact: false }).first().click();
  await expect(
    page.getByRole("button", { name: "Copy new token" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Copy new token" }).click();
  const secret = await page.evaluate(() => navigator.clipboard.readText());
  expect(secret).toMatch(/^ilapi_/);
  // Secret is held in memory and never rendered into DOM text or form values.
  expect(await page.locator("body").innerText()).not.toContain(secret);
  expect(
    await page
      .locator("input,textarea")
      .evaluateAll((nodes) => nodes.map((n) => n.value)),
  ).not.toContain(secret);
  const own = await page.evaluate(async (token) => {
    const res = await fetch("/api/v1/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: res.status, data: await res.json() };
  }, secret);
  expect(own.status).toBe(200);
  expect(own.data.studentId).toBe(uid);
  const denied = await page.evaluate(
    async (token) =>
      (
        await fetch("/api/v1/me/workshops", {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).status,
    secret,
  );
  expect(denied).toBe(403);
  await page.getByRole("button", { name: "I saved it — dismiss" }).click();
  await expect(
    page.getByRole("button", { name: "Copy new token" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Revoke Browser scoped token", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(
    await page.evaluate(
      async (token) =>
        (
          await fetch("/api/v1/me", {
            headers: { Authorization: `Bearer ${token}` },
          })
        ).status,
      secret,
    ),
  ).toBe(200);
  await page
    .getByRole("button", { name: "Revoke Browser scoped token", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  await expect(
    page.getByText("Token revoked. New requests will be rejected."),
  ).toBeVisible();
  const revoked = await page.evaluate(
    async (token) =>
      (
        await fetch("/api/v1/me", {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).status,
    secret,
  );
  expect(revoked).toBe(401);
  await page.screenshot({
    path: "/tmp/inspi-admin-api-tokens.png",
    fullPage: true,
  });
  await context.close();
});
