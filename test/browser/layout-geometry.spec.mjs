import { test, expect } from "@playwright/test";
import { openSettings } from "./material-helpers.mjs";
for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1024, height: 600 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`Settings keeps title and actions visible while its content scrolls at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/test/material-controls.html");
    const dialog = await openSettings(page);
    const body = dialog.locator(".settings-body");
    for (const end of ["start", "end"]) {
      await body.evaluate((el, end) => {
        el.scrollTop = end === "end" ? el.scrollHeight : 0;
      }, end);
      const geometry = await dialog.evaluate((el) => {
        const bounds = (n) => {
          const r = n.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
        };
        return {
          header: bounds(el.querySelector(".dialog-heading")),
          actions: bounds(el.querySelector(".dialog-actions")),
          dialog: bounds(el),
          h: innerHeight,
          w: innerWidth,
        };
      });
      for (const r of [geometry.header, geometry.actions, geometry.dialog]) {
        expect(r.top).toBeGreaterThanOrEqual(0);
        expect(r.bottom).toBeLessThanOrEqual(geometry.h);
        expect(r.left).toBeGreaterThanOrEqual(0);
        expect(r.right).toBeLessThanOrEqual(geometry.w);
      }
    }
    await body.evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.screenshot({
      path: `test-results/layout-review/settings-${viewport.width}x${viewport.height}.png`,
      animations: "disabled",
    });
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    await expect(dialog).not.toBeVisible();
  });
}
