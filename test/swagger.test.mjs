import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { chromium } from "@playwright/test";
import { apiHandler } from "../functions/api-http.js";
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
test("Swagger renders the OpenAPI read contract using local resources", async () => {
  const express = require("express"),
    app = express();
  app.use(
    apiHandler({
      auth: {
        verifyIdToken: async () => {
          throw Error();
        },
      },
      rate() {},
      measured() {},
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      channel: process.env.CI ? undefined : "chrome",
    });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) =>
      route.request().url().startsWith(base) ? route.continue() : route.abort(),
    );
    await page.goto(base + "/api/docs");
    await page.locator(".swagger-ui .opblock-get").first().waitFor();
    const spec = await (await fetch(base + "/api/openapi.json")).json();
    assert.equal(
      await page.locator(".opblock-get").count(),
      Object.values(spec.paths).filter((route) => route.get).length,
    );
    for (const method of ["post", "put", "delete"])
      assert.equal(
        await page.locator(`.opblock-${method}`).count(),
        Object.values(spec.paths).filter((route) => route[method]).length,
      );
    for (const route of Object.values(spec.paths))
      for (const operation of Object.values(route))
        if (operation.operationId)
          assert.ok(
            operation.description?.trim(),
            "Every expanded operation needs a description",
          );
    const me = page
      .locator(".opblock-get")
      .filter({ has: page.locator('.opblock-summary-path[data-path="/me"]') });
    await me.locator(".opblock-summary").click();
    assert.match(
      await me.locator(".opblock-description-wrapper").first().innerText(),
      /Reads the profile of the identity/,
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
