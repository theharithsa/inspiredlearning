import { test, expect } from "@playwright/test";
import { openSettings, choose } from "./material-helpers.mjs";
test("Material shadow clicks retain versioned client metadata without capturing field values", async ({
  page,
}) => {
  await page.route("https://**dynatrace.com/**", (route) => route.abort());
  await page.goto("/");
  await page.evaluate(() =>
    import("/test/browser-auth.ts").then((module) =>
      module.login("material-telemetry@example.invalid"),
    ),
  );
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await page
    .getByLabel("Display name", { exact: true })
    .fill("Private draft value 90317");
  await page.evaluate(() => {
    window.__materialEvents = [];
    window.dynatrace = {
      sendBizEvent: (type, data) =>
        window.__materialEvents.push({ type, data }),
    };
  });
  const dialog = await openSettings(page);
  await choose(dialog, "Site font", "lato");
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  const events = await page.evaluate(() => window.__materialEvents);
  expect(
    events.filter((e) => e.type === "com.inspiredlearning.rum.ui.click").length,
  ).toBeGreaterThanOrEqual(3);
  for (const event of events) {
    expect(event.type).toMatch(/^com\.inspiredlearning\.rum\./);
    expect(event.data["event.authority"]).toBe("client-observed");
    expect(event.data["app.version"]).toBe("2.1.0");
    expect(event.data["app.surface"]).toBe("learner");
    expect(Object.keys(event.data).sort()).toEqual(
      [
        "app.surface",
        "app.version",
        "event.authority",
        "event.id",
        "event.provider",
        "event.source",
        "transaction.id",
        "user.email",
        "user.id",
      ].sort(),
    );
  }
  expect(JSON.stringify(events)).not.toContain("Private draft value 90317");
  expect(JSON.stringify(events)).not.toContain("Site font");
});
