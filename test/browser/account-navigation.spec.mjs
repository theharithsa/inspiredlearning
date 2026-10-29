import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
let app;
const photo = "https://lh3.googleusercontent.com/inspi-demo-avatar";
const email = "account-layout@example.invalid";
test.beforeAll(async () => {
  if (process.env.GCLOUD_PROJECT !== "demo-chaicart" || !/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST || "")) throw Error("Isolated emulators required");
  app = initializeApp({ projectId: "demo-chaicart" }, "account-layout");
  await getFirestore(app).doc(`admins/${email}`).set({ role: "facilitator" });
});
test.afterAll(async () => deleteApp(app));
for (const admin of [false, true]) {
  test(`${admin ? "admin" : "learner"} avatar menu and sidebar actions align across widths`, async ({ page }) => {
    await page.route("https://**dynatrace.com/**", r => r.abort());
    await page.route(photo, r => r.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#6750a4"/><text x="40" y="52" text-anchor="middle" font-size="40" fill="white">A</text></svg>' }));
    await page.goto(admin ? "/admin.html" : "/");
    await page.evaluate(({email, photo}) => import("/test/browser-auth.ts").then(m => m.login(email, photo)), {email, photo});
    const trigger = page.getByRole("button", { name: "Account menu", exact: true });
    await expect(trigger).toBeVisible();
    await expect(page.locator(".account-trigger img")).toHaveAttribute("src", photo);
    await expect.poll(() => page.locator(".account-trigger img").evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    for (const width of [1440, 1024, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const geometry = await page.evaluate(() => {
        const header = document.querySelector(".workspace-top").getBoundingClientRect();
        const button = document.querySelector(".account-trigger").getBoundingClientRect();
        return { right: header.right - button.right, width: button.width, height: button.height, overflow: document.documentElement.scrollWidth - innerWidth };
      });
      expect(Math.abs(geometry.right)).toBeLessThanOrEqual(1);
      expect(geometry.width).toBeGreaterThanOrEqual(48);
      expect(geometry.height).toBeGreaterThanOrEqual(48);
      expect(geometry.overflow).toBeLessThanOrEqual(1);
      if (width === 1440) {
        const offsets = await page.locator(".sidebar-footer").evaluate(footer => [...footer.querySelectorAll("a .icon, md-list-item [slot=start] .icon")].map(icon => icon.getBoundingClientRect().left));
        const navLeft = await page.locator(".sidebar nav a .icon").first().evaluate(icon => icon.getBoundingClientRect().left);
        expect(Math.max(...offsets, navLeft) - Math.min(...offsets, navLeft)).toBeLessThanOrEqual(1);
        await expect(page.locator(".sidebar-footer").getByRole("button", {name: "Settings", exact: true})).toBeVisible();
        await expect(page.locator(".sidebar-footer").getByRole("button", {name: "Sign out", exact: true})).toBeVisible();
      }
      await trigger.focus();
      await page.keyboard.press("Enter");
      const menu = page.getByRole("menu", { name: "Account menu", exact: true });
      await expect(menu).toHaveAttribute("data-menu-state", "opened");
      await expect(menu).toBeVisible();
      const box = await menu.locator(".menu").boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      await expect(menu).toContainText(email);
      await page.keyboard.press("Escape");
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expect(trigger).toBeFocused();
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    fs.mkdirSync("test-results/account-navigation", { recursive: true });
    await page.screenshot({ path: `test-results/account-navigation/${admin ? "admin" : "learner"}-desktop.png` });
    await trigger.click();
    await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    // An actual image request failure must reveal initials without losing the menu.
    await page.route(photo, r => r.abort());
    await page.reload();
    await expect(trigger).toBeVisible();
    await expect(page.locator(".account-trigger img")).toHaveCount(0);
    await expect(page.locator(".account-trigger .avatar")).toHaveText("A");
    await trigger.click();
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await expect(trigger).toHaveCount(0);
  });
}
