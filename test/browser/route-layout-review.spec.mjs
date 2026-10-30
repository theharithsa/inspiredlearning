import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { setColorMode } from "./material-helpers.mjs";
const require = createRequire(
  new URL("../../functions/package.json", import.meta.url),
);
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
let app, db;
const adminEmail = "layout-admin@example.invalid";
test.beforeAll(async () => {
  if (process.env.GCLOUD_PROJECT !== "demo-chaicart")
    throw Error("Use demo emulators only");
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8185";
  app = initializeApp({ projectId: "demo-chaicart" }, "layout-" + randomUUID());
  db = getFirestore(app);
  await db.doc("admins/" + adminEmail).set({ role: "facilitator" });
});
test.afterAll(() => deleteApp(app));
async function login(page, email, admin = false, path = "/") {
  await page.goto((admin ? "/admin.html#" : "/#") + path);
  const uid = await page.evaluate(
    (email) => import("/test/browser-auth.ts").then((m) => m.login(email)),
    email,
  );
  await expect(
    page.getByRole("navigation", {
      name: admin ? "Administrator navigation" : "Main navigation",
    }),
  ).toBeVisible();
  return uid;
}
test("empty dashboard leads with useful next steps, but preserves non-workshop credit balances", async ({
  page,
}) => {
  await login(page, "layout-empty@example.invalid");
  await expect(
    page.getByRole("heading", {
      name: "Your next chapter starts here",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".stats")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Check my account", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/route-review/learner-empty.png", animations: "disabled" });
  await page.route("**/api/v1/me/scores", (route) =>
    route.fulfill({ json: { totalCredits: 250, unknownAwards: 0 } }),
  );
  await page.reload();
  await expect(page.locator(".stats")).toContainText("250");
});
test("profile groups editing and record support, with inspectable read-only account details", async ({
  page,
}) => {
  await login(page, "layout-profile@example.invalid", false, "/profile");
  await expect(
    page.getByRole("heading", { name: "Record support", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Google account", { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Account details", exact: true })
    .click();
  await expect(
    page.getByLabel("Google account", { exact: true }),
  ).toHaveAttribute("readonly", "");
  const name = await page
    .getByLabel("Display name", { exact: true })
    .boundingBox();
  const action = await page
    .getByRole("button", { name: "Save profile", exact: true })
    .boundingBox();
  expect(action.width).toBeLessThan(name.width);
});
for (const admin of [false, true])
  test(`${admin ? "admin" : "learner"} route inventory has bounded geometry in both themes across compact, short and expanded viewports`, async ({
    page,
  }) => {
    const uid = await login(
      page,
      admin ? adminEmail : "layout-records@example.invalid",
      admin,
    );
    if (!admin) {
      await db.doc(`learningLearners/${uid}/workshops/REVIEW01`).set({
        sid: "REVIEW01",
        name: "Demo Learner",
        title: "Synthetic layout review",
        date: "2026-10-10",
        teamId: "mumbai-1a",
        role: "COO",
        status: "completed",
        revision: 1,
        personalCredits: 12,
        teamCredits: 38,
        awards: [],
      });
    }
    const routes = admin
      ? [
          "/",
          "/workshops",
          "/learners",
          "/certificates",
          "/requests",
          "/integrations",
          "/delivery",
        ]
      : [
          "/",
          "/workshops",
          "/workshops/REVIEW01",
          "/certificates",
          "/community",
          "/profile",
          "/privacy",
        ];
    const results = [];
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1280, height: 720 },
      { width: 1600, height: 1000 },
    ]) {
      await page.setViewportSize(viewport);
      for (const mode of ["light", "dark"]) {
        await setColorMode(page, mode);
        for (const route of routes) {
          await page.goto((admin ? "/admin.html#" : "/#") + route);
          await expect(page.getByRole("main")).toBeVisible();
          await page.getByRole("heading").first().waitFor();
          await page.evaluate(() => document.fonts.ready);
          if (admin && route === "/requests") {
            const queue = await page.getByRole("heading", { name: "Student requests", exact: true }).boundingBox();
            const lookup = await page.getByLabel("Learner reference", { exact: true }).boundingBox();
            expect(queue.y).toBeLessThan(lookup.y);
          }
          const geometry = await page.evaluate(() => ({
            width: innerWidth,
            scroll: document.documentElement.scrollWidth,
            headings: [...document.querySelectorAll("main h1")].filter(
              (e) => e.getClientRects().length,
            ).length,
          }));
          expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
          expect(geometry.headings).toBe(1);
          const file = `test-results/route-review/${admin ? "admin" : "learner"}-${route.replaceAll("/", "-") || "home"}-${viewport.width}-${mode}.png`;
          await page.screenshot({ path: file, animations: "disabled" });
          results.push({ route, viewport, mode, file, geometry });
        }
      }
    }
    fs.mkdirSync("test-results/route-review", { recursive: true });
    fs.writeFileSync(
      `test-results/route-review/${admin ? "admin" : "learner"}-inventory.json`,
      JSON.stringify(
        {
          environment: "demo-chaicart emulators",
          revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
          sourceState: process.env.CI ? "CI checkout" : "local candidate",
          results,
        },
        null,
        2,
      ),
    );
  });

test("public sign-in and certificate states retain usable layouts without exposing private records", async ({ page }) => {
  const uid = "layout-verification-owner";
  const certificates = [
    { id: randomUUID(), sid: "REVIEWV1", public: true, status: "issued", heading: "Verified participation." },
    { id: randomUUID(), sid: "REVIEWV2", public: true, status: "revoked", heading: "Certificate revoked." },
    { id: randomUUID(), sid: "REVIEWV3", public: false, status: "issued", heading: "Private or unavailable." },
  ];
  for (const cert of certificates) {
    await db.doc(`learningCertificates/${cert.id}`).set({ ...cert, uid, name: "Synthetic Learner", title: "Synthetic layout review", date: "2026-10-10", revision: 1 });
    await db.doc(`learningLearners/${uid}/workshops/${cert.sid}`).set({ status: "completed", certificateId: cert.id });
  }
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(viewport);
      for (const mode of ["light", "dark"]) {
        await page.goto("/#/privacy");
        await setColorMode(page, mode);
        for (const [surface, path] of [["learner-sign-in", "/#/"], ["admin-sign-in", "/admin.html#/"]]) {
          await page.goto(path);
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          await page.evaluate(() => document.fonts.ready);
          await page.screenshot({ path: `test-results/route-review/${surface}-${viewport.width}-${mode}.png`, animations: "disabled" });
        }
        for (const cert of certificates) {
          await page.goto(`/#/verify/${cert.id}`);
          await expect(page.getByRole("heading", { name: cert.heading, exact: true })).toBeVisible();
          if (!cert.public) await expect(page.getByText("Synthetic Learner", { exact: true })).toHaveCount(0);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
          await page.screenshot({ path: `test-results/route-review/public-${cert.public ? cert.status : "private"}-${viewport.width}-${mode}.png`, animations: "disabled" });
        }
      }
    }
  } finally {
    for (const cert of certificates) {
      await db.doc(`learningCertificates/${cert.id}`).delete();
      await db.doc(`learningLearners/${uid}/workshops/${cert.sid}`).delete();
    }
  }
});
test("captain roster uses the existing region boundary with responsive Material controls", async ({ page }) => {
  const sid = "REVIEWCAP", email = "layout-captain@example.invalid";
  await db.doc(`sessions/${sid}`).set({ title: "Synthetic captain layout review", workshopDate: "2026-10-10" });
  await db.doc(`sessions/${sid}/staff/${email}`).set({ role: "captain", region: "west" });
  await db.doc(`sessions/${sid}/students/layout-west`).set({ name: "Synthetic West Learner", teamId: "mumbai-1a", role: "COO" });
  await db.doc(`sessions/${sid}/students/layout-south`).set({ name: "Synthetic South Learner", teamId: "chennai-1a", role: "CTO" });
  try {
    await login(page, email, false, `/staff?session=${sid}`);
    for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(viewport);
      for (const mode of ["light", "dark"]) {
        await setColorMode(page, mode);
        await expect(page.getByText("Synthetic West Learner", { exact: true })).toBeVisible();
        await expect(page.getByText("Synthetic South Learner", { exact: true })).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await page.screenshot({ path: `test-results/route-review/captain-roster-${viewport.width}-${mode}.png`, animations: "disabled" });
      }
    }
  } finally {
    await db.recursiveDelete(db.doc(`sessions/${sid}`));
  }
});

test("integration creation starts within the short viewport with compact, distinct headings", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page, adminEmail, true, "/integrations");
  await expect(
    page.getByRole("heading", { level: 1, name: "API access", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Create API token",
      exact: true,
    }),
  ).toBeVisible();
  const name = page.getByLabel("Token name", { exact: true }),
    expiry = page.getByRole("combobox", { name: "Expires after", exact: true });
  await expect(name).toBeEnabled();
  await expect(page.getByText("No API tokens created yet.", { exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(expiry).toBeVisible();
  const [n, e] = await Promise.all([
    page.locator(".token-identity-fields > md-outlined-text-field").boundingBox(),
    page.locator(".token-identity-fields > md-outlined-select").boundingBox(),
  ]);
  expect(n.y + n.height).toBeLessThanOrEqual(720 * 2 / 3);
  expect(Math.abs(n.y - e.y)).toBeLessThan(2);
  await expect(
    page.getByRole("link", { name: "API documentation", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/route-review/admin-integrations-short.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(name).toBeVisible();
  await page.screenshot({ path: "test-results/route-review/admin-integrations-mobile.png", animations: "disabled" });
  const geometry = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
});
