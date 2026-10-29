import fs from "node:fs";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { choose, openSettings } from "./material-helpers.mjs";
import { FONT_CATALOG, PALETTES } from "../../src/ui/appearance-model.ts";
const fixture = "/test/material-controls.html";
test("Material fields submit by keyboard once, validate required values, and preserve read-only and checkbox behavior", async ({
  page,
}) => {
  await page.goto(fixture);
  await page.getByRole("button", { name: "Save example", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Submitted 0 times");
  await page.getByLabel("Your name", { exact: true }).fill("Demo learner");
  await page.getByLabel("Your name", { exact: true }).press("Enter");
  await expect(page.getByRole("status")).toHaveText("Submitted 1 times");
  await expect(
    page.getByLabel("Read-only account", { exact: true }),
  ).toHaveAttribute("readonly", "");
  await page
    .getByRole("checkbox", { name: "Include practice exercises", exact: true })
    .check();
  await expect(
    page.getByRole("checkbox", {
      name: "Include practice exercises",
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Disabled action", exact: true }),
  ).toBeDisabled();
});
test("Material dropdown owns popup surfaces, keyboard navigation, disabled options and Escape focus return", async ({
  page,
}) => {
  await page.goto(fixture);
  const control = page.locator(
    'md-outlined-select[data-field-label="Workshop format"]',
  );
  await control.click();
  const unavailable = control.locator(
    'md-select-option[data-value="disabled"]',
  );
  await expect(unavailable).toHaveJSProperty("disabled", true);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("combobox", { name: "Workshop format", exact: true }),
  ).toBeFocused();
  await choose(page, "Workshop format", "remote");
  await expect(control).toHaveAttribute("data-menu-state", "closed");
  await control.getByRole("combobox").click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await expect(control).toHaveJSProperty("value", "first");
});
test("Material calendar uses date-only values, editable input, visible selection and restores focus", async ({
  page,
}) => {
  await page.goto(fixture);
  await page.getByLabel("Workshop date", { exact: true }).fill("not-a-date");
  await page
    .getByRole("button", { name: "Open calendar for Workshop date" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Select date", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByLabel("Workshop date", { exact: true }).fill("2026-10-08");
  await page
    .getByRole("button", { name: "Open calendar for Workshop date" })
    .click();
  // Roving calendar focus crosses month boundaries without changing the stored date.
  await dialog.getByRole("button", { name: "2026-10-31", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    dialog.getByRole("button", { name: "2026-11-01", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("PageUp");
  await expect(
    dialog.getByRole("button", { name: "2026-10-01", exact: true }),
  ).toBeFocused();
  await dialog.getByRole("button", { name: "2026-10-15", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Select date", exact: true })
    .click();
  await expect(page.getByLabel("Workshop date", { exact: true })).toHaveValue(
    "2026-10-15",
  );
  await expect(
    page.getByRole("button", { name: "Open calendar for Workshop date" }),
  ).toBeFocused();
});
test("all 14 fonts actually load locally and apply to page, forms, menus and dialog controls", async ({
  page,
}) => {
  const external = [];
  page.on("request", (request) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(request.url()))
      external.push(request.url());
  });
  await page.goto("/#/privacy");
  const dialog = await openSettings(page);
  await page.setViewportSize({ width: 320, height: 720 });
  for (const font of FONT_CATALOG) {
    await choose(dialog, "Site font", font.id);
    await expect(page.locator("html")).toHaveAttribute("data-font", font.id);
    await expect(page.locator("html")).toHaveAttribute(
      "data-font-status",
      "ready",
    );
    const loaded = await page.evaluate(async (family) => {
      const faces = await document.fonts.load(`400 16px "${family}"`);
      return (
        faces.length > 0 && faces.every((face) => face.status === "loaded")
      );
    }, font.family);
    expect(loaded, font.family).toBe(true);
    const family = await dialog
      .getByRole("button", { name: "Done", exact: true })
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(family).toContain(font.family);
    const fieldFamily = await dialog
      .getByRole("combobox", { name: "Site font", exact: true })
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(fieldFamily).toContain(font.family);
  }
  expect(external).toEqual([]);
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  expect(
    await page.locator("h1").evaluate((el) => getComputedStyle(el).fontFamily),
  ).toContain(FONT_CATALOG.at(-1).family);
});
test("preferences persist across pages/reload, reset explicitly, and do not load Firebase from public privacy", async ({
  page,
}) => {
  const calls = [];
  page.on("request", (r) => calls.push(r.url()));
  await page.goto("/#/privacy");
  let dialog = await openSettings(page);
  await choose(dialog, "Site font", "lato");
  await choose(dialog, "Color mode", "dark");
  await dialog
    .getByRole("radio", { name: "Material blue", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-font", "lato");
  await expect(page.locator("html")).toHaveAttribute("data-palette", "blue");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  dialog = await openSettings(page);
  await dialog
    .getByRole("button", { name: "Reset appearance", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-font", "roboto");
  await expect(page.locator("html")).toHaveAttribute("data-palette", "violet");
  expect(
    calls.filter((url) =>
      /firebase|googleapis|learningAction|learningTelemetry/.test(url),
    ),
  ).toEqual([]);
});
test("every palette and mode themes the actual open dropdown and remains usable on narrow and short screens", async ({
  page,
}) => {
  await page.goto("/#/privacy");
  let dialog = await openSettings(page);
  for (const mode of ["light", "dark"])
    for (const palette of PALETTES) {
      await choose(dialog, "Color mode", mode);
      await dialog
        .getByRole("radio", { name: palette.label, exact: true })
        .click();
      await expect(page.locator("html")).toHaveAttribute(
        "data-palette",
        palette.id,
      );
      await expect(page.locator("html")).toHaveAttribute("data-theme", mode);
      const control = dialog.locator(
        'md-outlined-select[data-field-label="Site font"]',
      );
      await control.getByRole("combobox").click();
      await expect(control).toHaveAttribute("data-menu-state", "opened");
      const surface = await control.locator("md-menu").evaluate((el) => {
        const box = el.shadowRoot
          .querySelector(".menu")
          .getBoundingClientRect();
        return {
          left: box.left,
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          width: innerWidth,
          height: innerHeight,
          color: getComputedStyle(el)
            .getPropertyValue("--md-menu-container-color")
            .trim(),
        };
      });
      expect(surface.left).toBeGreaterThanOrEqual(0);
      expect(surface.right).toBeLessThanOrEqual(surface.width + 1);
      expect(surface.top).toBeGreaterThanOrEqual(0);
      expect(surface.bottom).toBeLessThanOrEqual(surface.height + 1);
      expect(surface.color).toMatch(/^#/);
      await page.keyboard.press("Escape");
      await expect(control).toHaveAttribute("data-menu-state", "closed");
    }
  for (const width of [320, 390, 768, 1200, 1600]) {
    await page.setViewportSize({ width, height: 600 });
    await choose(dialog, "Site font", "jetbrains-mono");
    const popup = dialog.locator(
      'md-outlined-select[data-field-label="Site font"]',
    );
    await popup.getByRole("combobox").click();
    await expect(popup).toHaveAttribute("data-menu-state", "opened");
    const bounds = await popup.locator("md-menu").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: innerWidth,
        height: innerHeight,
      };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(bounds.width + 1);
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.bottom).toBeLessThanOrEqual(bounds.height + 1);
    await page.keyboard.press("Escape");
    await expect(popup).toHaveAttribute("data-menu-state", "closed");
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      )
      .toBe(true);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    dialog.locator("md-outlined-select").first().locator("md-menu"),
  ).toHaveJSProperty("quick", true);
  await page.setViewportSize({ width: 640, height: 320 });
  await expect(
    dialog.getByRole("button", { name: "Done", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});
test("font-loading failure gives truthful fallback feedback and settings focus loops safely", async ({
  page,
}) => {
  await page.route("**/fonts/lato-400.woff2", (r) => r.abort());
  await page.goto("/#/privacy");
  const dialog = await openSettings(page);
  await expect(
    dialog.getByRole("button", { name: "Close Settings", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Done", exact: true }),
  ).toBeFocused();
  await choose(dialog, "Site font", "lato");
  await expect(page.locator("html")).toHaveAttribute(
    "data-font-status",
    "fallback",
  );
  await expect(dialog.getByRole("status")).toContainText("Could not load Lato");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toBeFocused();
});
test("Material controls and settings pass automated accessibility checks in both themes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(fixture);
  const controls = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    controls.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
  await page.goto("/#/privacy");
  const dialog = await openSettings(page);
  fs.mkdirSync("test-results/material-design", { recursive: true });
  for (const mode of ["light", "dark"]) {
    await choose(dialog, "Color mode", mode);
    await page.screenshot({
      path: `test-results/material-design/settings-${mode}.png`,
      animations: "disabled",
    });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      results.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    ).toEqual([]);
  }
  const popup = dialog.locator(
    'md-outlined-select[data-field-label="Site font"]',
  );
  await popup.getByRole("combobox").click();
  await expect(popup).toHaveAttribute("data-menu-state", "opened");
  await page.screenshot({
    path: "test-results/material-design/font-menu-dark.png",
    animations: "disabled",
  });
});
