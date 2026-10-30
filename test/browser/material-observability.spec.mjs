import packageJson from "../../package.json" with { type: "json" };
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
    expect(event.data["app.version"]).toBe(packageJson.version);
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
        "ui.route",
        "user.email",
        "user.id",
      ].sort(),
    );
  }
  expect(JSON.stringify(events)).not.toContain("Private draft value 90317");
  expect(JSON.stringify(events)).not.toContain("Site font");
});

test("Material community links retain the allowlisted client action across their inner anchor", async ({
  page,
}) => {
  await page.route("https://**dynatrace.com/**", (route) => route.abort());
  await page.context().route("https://discord.gg/**", (route) => route.abort());
  await page.goto("/");
  const link = page.getByRole("link", {
    name: "Join the community ↗",
    exact: true,
  });
  await expect(link).toBeVisible();
  await page.evaluate(() => {
    window.__materialEvents = [];
    window.dynatrace = {
      sendBizEvent: (type, data) =>
        window.__materialEvents.push({ type, data }),
    };
  });
  const [popup] = await Promise.all([page.waitForEvent("popup"), link.click()]);
  await popup.close();
  const events = await page.evaluate(() =>
    window.__materialEvents.filter(
      (e) => e.type === "com.inspiredlearning.rum.discord.opened",
    ),
  );
  expect(events).toHaveLength(1);
  expect(events[0].data["event.authority"]).toBe("client-observed");
  expect(events[0].data["app.version"]).toBe(packageJson.version);
  expect(Object.keys(events[0].data)).not.toContain("text");
});

test("REST observations preserve status/request joins and exclude sensitive URLs and response text", async ({
  page,
}) => {
  await page.route("https://**dynatrace.com/**", (route) => route.abort());
  await page.goto("/");
  await page.evaluate(() =>
    import("/test/browser-auth.ts").then((m) =>
      m.login("rest-telemetry@example.invalid"),
    ),
  );
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await page.evaluate(() => {
    window.__materialEvents = [];
    window.dynatrace = {
      sendBizEvent: (type, data) =>
        window.__materialEvents.push({ type, data }),
    };
  });
  await page.route(
    "**/api/v1/students/PRIVATE/certificates?secret=SECRET",
    (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        headers: { "X-Request-Id": "11111111-1111-4111-a111-111111111111" },
        body: JSON.stringify({ error: { message: "PRIVATE_RESPONSE" } }),
      }),
  );
  await page.evaluate(async () => {
    const { apiFetch } = await import("/src/api.ts");
    try {
      await apiFetch("/api/v1/students/PRIVATE/certificates?secret=SECRET");
    } catch {}
  });
  const rows = await page.evaluate(() =>
    window.__materialEvents.filter(
      (e) =>
        e.type === "com.inspiredlearning.rum.api.request.completed" &&
        e.data["http.route"] === "/students/{studentId}/certificates",
    ),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].data).toMatchObject({
    "http.route": "/students/{studentId}/certificates",
    "ui.route": "/profile",
    "http.response.status_code": 403,
    "request.id": "11111111-1111-4111-a111-111111111111",
    outcome: "rejected",
    "event.authority": "client-observed",
  });
  expect(JSON.stringify(rows)).not.toMatch(/PRIVATE|SECRET/);
});

test("a pending REST completion is not attributed after sign-out", async ({
  page,
}) => {
  await page.route("https://**dynatrace.com/**", (r) => r.abort());
  await page.goto("/");
  await page.evaluate(() =>
    import("/test/browser-auth.ts").then((m) =>
      m.login("rest-switch@example.invalid"),
    ),
  );
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await page.evaluate(() => {
    window.__materialEvents = [];
    window.dynatrace = {
      sendBizEvent: (type, data) =>
        window.__materialEvents.push({ type, data }),
    };
  });
  let arrive, release;
  const arrived = new Promise((resolve) => {
      arrive = resolve;
    }),
    gate = new Promise((resolve) => {
      release = resolve;
    });
  await page.route("**/api/v1/students/SWITCH/scores", async (route) => {
    arrive();
    await gate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });
  const request = page.evaluate(async () => {
    try {
      await (
        await import("/src/api.ts")
      ).apiFetch("/api/v1/students/SWITCH/scores");
    } catch {}
  });
  await arrived;
  await page.evaluate(() =>
    import("/test/browser-auth.ts").then((m) => m.logout()),
  );
  release();
  await request;
  const rows = await page.evaluate(() =>
    window.__materialEvents.filter(
      (e) =>
        e.type === "com.inspiredlearning.rum.api.request.completed" &&
        e.data["http.route"] === "/students/{studentId}/scores",
    ),
  );
  expect(rows).toHaveLength(0);
});
