import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import { openSettings, choose, setColorMode } from "./material-helpers.mjs";
test.beforeEach(async ({ page }) => {
  await page.route("https://**dynatrace.com/**", (r) => r.abort());
});
test("illustrated homepage stays readable in both themes and compact/expanded layouts", async ({
  page,
}) => {
  await page.goto("/");
  const hero = page.locator(".hero-art img");
  await expect(hero).toBeVisible();
  await expect
    .poll(() => hero.evaluate((img) => img.complete && img.naturalWidth > 0))
    .toBe(true);
  fs.mkdirSync("test-results/expressive", { recursive: true });
  for (const theme of ["Light", "Dark"]) {
    await setColorMode(page, theme === "Light" ? "light" : "dark");
    for (const width of [320, 390, 840, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      const boxes = await page.evaluate(() =>
        [
          ".public-header",
          ".hero-copy",
          ".hero-art",
          ".learning-story",
          ".landing-features",
          ".landing-community",
        ].map((s) => {
          const r = document.querySelector(s).getBoundingClientRect();
          return { left: r.left, right: r.right, width: r.width };
        }),
      );
      for (const box of boxes) {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(width + 1);
        expect(box.width).toBeGreaterThan(0);
      }
      await expect(
        page.getByRole("button", {
          name: "Continue with Google →",
          exact: true,
        }),
      ).toBeVisible();
      await page.screenshot({
        path: `test-results/expressive/landing-${theme}-${width}.png`,
      });
    }
    const result = await new AxeBuilder({ page }).analyze();
    expect(result.violations).toEqual([]);
  }
  const dialog = await openSettings(page);
  await choose(dialog, "Site font", "google-sans-code");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/expressive/landing-monospace-320.png",
  });
  const companion = page.locator(".landing-community img");
  await companion.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      companion.evaluate((img) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
});
test("spatial motion retargets, releases outside the button and stops for keyboard/reduced motion", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const host = page.locator(".public-header .settings-trigger");
  const button = host.getByRole("button", { name: "Settings", exact: true });
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect
    .poll(() => host.evaluate((el) => el.getAnimations().length))
    .toBeGreaterThan(0);
  await expect
    .poll(() => host.evaluate((el) => getComputedStyle(el).transform))
    .not.toBe("none");
  await page.mouse.move(1, 1);
  await page.mouse.up();
  await expect
    .poll(() => host.evaluate((el) => el.getAnimations().length))
    .toBe(0);
  await expect(host).toHaveCSS("transform", "none");
  // Keyboard activation preserves access without spatial animation.
  await page.keyboard.press("Tab");
  await button.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((el) => el.getAnimations().length)).toBe(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
  const next = await button.boundingBox();
  await page.mouse.move(next.x + next.width / 2, next.y + next.height / 2);
  await page.mouse.down();
  await expect
    .poll(() => host.evaluate((el) => el.getAnimations().length))
    .toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() => host.evaluate((el) => el.getAnimations().length))
    .toBe(0);
  await expect(host).toHaveCSS("transform", "none");
  await page.mouse.move(1, 1);
  await page.mouse.up();
  await button.click();
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((el) => el.getAnimations().length)).toBe(0);
  expect(errors).toEqual([]);
});
