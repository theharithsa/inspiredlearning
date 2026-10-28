import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(
  new URL("../../functions/package.json", import.meta.url),
);
const { initializeApp, deleteApp } = require("firebase-admin/app"),
  { getFirestore } = require("firebase-admin/firestore");
let app, db;
const email = "v2-admin@example.invalid";
test.beforeAll(async () => {
  if (process.env.GCLOUD_PROJECT !== "demo-chaicart")
    throw Error("Emulators required");
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8185";
  app = initializeApp({ projectId: "demo-chaicart" }, "v2-browser");
  db = getFirestore(app);
  await db.doc("admins/" + email).set({ role: "facilitator" });
});
test.afterAll(async () => deleteApp(app));
async function login(page, account = email, admin = true, path = "/") {
  await page.route("https://**dynatrace.com/**", (r) => r.abort());
  await page.goto(admin ? "/admin.html#" + path : "/#" + path);
  const uid = await page.evaluate(
    (email) => import("/test/browser-auth.ts").then((m) => m.login(email)),
    account,
  );
  await expect(
    page.getByRole("navigation", {
      name: admin ? "Administrator navigation" : "Main navigation",
    }),
  ).toBeVisible();
  return uid;
}
async function noOverflow(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}
test("admin startup creates no learner data and tab session stays separate from learner sign-in", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const admin = await context.newPage();
  const requests = [];
  admin.on("request", (r) => requests.push(r.postData() || r.url()));
  const uid = await login(admin);
  expect((await db.doc(`learningLearners/${uid}`).get()).exists).toBe(false);
  expect(
    requests.filter(
      (x) =>
        x.includes("learningLearners") || /"action"\s*:\s*"profile"/.test(x),
    ),
  ).toEqual([]);
  await admin.reload();
  await expect(
    admin.getByRole("navigation", { name: "Administrator navigation" }),
  ).toBeVisible();
  const learner = await context.newPage();
  await learner.goto("/");
  await expect(
    learner.getByRole("button", { name: "Continue with Google →" }),
  ).toBeVisible();
  await learner.evaluate(
    (email) => import("/test/browser-auth.ts").then((m) => m.login(email)),
    email,
  );
  await expect(
    learner.getByRole("link", { name: "My learning", exact: true }),
  ).toBeVisible();
  await admin.close();
  const next = await context.newPage();
  await next.goto("/admin.html");
  await expect(
    next.getByRole("button", { name: "Continue with Google", exact: true }),
  ).toBeVisible();
  await expect(
    learner.getByRole("link", { name: "My learning", exact: true }),
  ).toBeVisible();
  await context.close();
});
test("learner is denied admin bootstrap and revoked role is rechecked", async ({
  page,
}) => {
  await page.goto("/admin.html");
  await page.evaluate(() =>
    import("/test/browser-auth.ts").then((m) =>
      m.login("v2-denied@example.invalid"),
    ),
  );
  await expect(page.getByRole("alert")).toContainText(
    "Administrator access required",
  );
  await expect(
    page.getByRole("navigation", { name: "Administrator navigation" }),
  ).toHaveCount(0);
  await login(page);
  await db.doc("admins/" + email).delete();
  try {
    await page.reload();
    await expect(page.getByRole("alert")).toContainText(
      "Administrator access required",
    );
    await expect(
      page.getByRole("navigation", { name: "Administrator navigation" }),
    ).toHaveCount(0);
  } finally {
    await db.doc("admins/" + email).set({ role: "facilitator" });
  }
});
test("Material themes, compact navigation and actual surfaces remain usable across viewports", async ({
  page,
}) => {
  const dir = "test-results/v2-design";
  fs.mkdirSync(dir, { recursive: true });
  await login(page, "v2-design-learner@example.invalid", false);
  for (const width of [320, 390, 768, 840, 1200, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
    await expect(
      page.getByRole("link", { name: "Certificates", exact: true }),
    ).toBeVisible();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: dir + "/learner-light.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Account and more options").click();
  await page
    .getByLabel("Appearance")
    .filter({ visible: true })
    .selectOption("dark");
  await page.getByLabel("Account and more options").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await noOverflow(page);
  await page.screenshot({
    path: dir + "/learner-dark-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.goto("/admin.html");
  await page.evaluate(
    (email) => import("/test/browser-auth.ts").then((m) => m.login(email)),
    email,
  );
  await expect(
    page.getByRole("navigation", { name: "Administrator navigation" }),
  ).toBeVisible();
  for (const width of [320, 390, 768, 840, 1200, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByLabel("Appearance")
    .filter({ visible: true })
    .selectOption("light");
  await page.screenshot({
    path: dir + "/admin-overview-light.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.goto("/admin.html#/certificates");
  await expect(
    page.getByRole("heading", { name: "Certificate register", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: dir + "/admin-certificates-light.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await page.screenshot({
    path: dir + "/admin-certificates-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.goto("/");
  await page.evaluate(() =>
    import("/test/browser-auth.ts").then((m) => m.logout()),
  );
  await expect(
    page.getByRole("button", { name: "Continue with Google →" }),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: dir + "/public-mobile.png", fullPage: true });
});
test("Material confirmation supports Escape, traps focus and restores its opener", async ({
  page,
}) => {
  await login(page, "v2-dialog@example.invalid", false, "/profile");
  await page.getByLabel("Request type").selectOption("erasure");
  await page
    .getByLabel("Details", { exact: true })
    .fill("Synthetic cancellation check");
  const opener = page.getByRole("button", { name: "Send request" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Confirm this change" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Continue", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});
test("text and button color pairs meet normal-text contrast in both themes", async ({
  page,
}) => {
  await page.goto("/#/privacy");
  for (const theme of ["light", "dark"]) {
    await page.getByLabel("Appearance").selectOption(theme);
    const ratios = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const luminance = (hex) => {
        const n = parseInt(hex.trim().slice(1), 16),
          v = [n >> 16, (n >> 8) & 255, n & 255].map((x) => {
            x /= 255;
            return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
          });
        return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
      };
      return [
        ["on-surface", "surface"],
        ["on-surface-variant", "surface"],
        ["on-primary", "primary"],
        ["on-primary-container", "primary-container"],
        ["on-secondary-container", "secondary-container"],
        ["on-error-container", "error-container"],
      ].map(([fg, bg]) => {
        const a = luminance(style.getPropertyValue("--md-sys-color-" + fg)),
          b = luminance(style.getPropertyValue("--md-sys-color-" + bg));
        return {
          pair: fg + "/" + bg,
          ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        };
      });
    });
    for (const row of ratios)
      expect(row.ratio, theme + " " + row.pair).toBeGreaterThanOrEqual(4.5);
  }
});

test("changing accounts cancels an unconfirmed learner request", async ({
  page,
}) => {
  const uid = await login(
    page,
    "v2-cancel-old@example.invalid",
    false,
    "/profile",
  );
  await page.getByLabel("Request type").selectOption("erasure");
  await page
    .getByLabel("Details", { exact: true })
    .fill("Synthetic account-switch cancellation");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.evaluate(() =>
    import("/test/browser-auth.ts").then(async (m) => {
      await m.logout();
      await m.login("v2-cancel-new@example.invalid");
    }),
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (
      await db
        .collection("learningRequests")
        .where("uid", "==", uid)
        .where("kind", "==", "erasure")
        .get()
    ).size,
  ).toBe(0);
});

test("disabled admin is rejected by the real callable transport", async ({
  page,
}) => {
  const account = "v2-disabled@example.invalid";
  await db.doc("admins/" + account).set({ role: "facilitator" });
  const uid = await login(page, account);
  const auth = require("firebase-admin/auth").getAuth(app);
  try {
    await auth.updateUser(uid, { disabled: true });
    const code = await page.evaluate(async () => {
      const { action } = await import("/src/observability.ts");
      try {
        await action("roster", { sid: "NONE00" });
        return "unexpected-success";
      } catch (e) {
        return e.code;
      }
    });
    expect(code).toBe("functions/unauthenticated");
  } finally {
    await auth.updateUser(uid, { disabled: false });
    await db.doc("admins/" + account).delete();
  }
});

test("large text, long names, short windows and reduced motion keep navigation usable", async ({
  page,
}) => {
  const uid = await login(page, "v2-layout@example.invalid", false);
  await db
    .doc("learningLearners/" + uid)
    .update({ name: "ಲಿಯಾನಾ学习" + "LongUnbrokenName".repeat(18) });
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  await noOverflow(page);
  await expect(
    page.getByRole("link", { name: "Profile", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => (document.documentElement.style.fontSize = ""));
  await page.setViewportSize({ width: 640, height: 320 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await noOverflow(page);
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await expect(page.getByLabel("Display name")).toBeVisible();
  const duration = await page
    .getByRole("button", { name: "Save profile" })
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(duration).toBe("0s");
});
