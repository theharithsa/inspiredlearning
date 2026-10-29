import "./setup-env.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { apiHandler } from "../functions/api-http.js";
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
const express = require("express");
const config = JSON.parse(readFileSync("firebase.json"));
const policy = config.hosting.headers
  .find((x) => x.source === "**")
  .headers.find((h) => h.key === "Content-Security-Policy").value;
test("enforced CSP permits public settings/local fonts and Swagger while blocking inline scripts", async () => {
  for (const path of ["dist/version.json", "dist-admin/version.json"])
    assert.equal(
      JSON.parse(readFileSync(path)).environment,
      "rehearsal",
      "Build demo artifacts before this browser gate",
    );
  const app = express();
  app.use((_req, res, next) => {
    res.set("Content-Security-Policy", policy);
    next();
  });
  app.get("/csp-probe", (_req, res) =>
    res
      .type("html")
      .send(
        '<!doctype html><script>window.unapprovedInline=true</script><script src="/probe.js"></script>',
      ),
  );
  app.get("/probe.js", (_req, res) =>
    res.type("js").send("window.approvedExternal=true;"),
  );
  const handler = apiHandler({
    auth: {
      verifyIdToken: async () => {
        throw Error("No authenticated fixture");
      },
    },
    rate() {},
    measured() {},
  });
  app.use((req, res, next) =>
    req.path.startsWith("/api/") ? handler(req, res) : next(),
  );
  app.use(express.static("dist"));
  app.get("/privacy", (_req, res) =>
    res.sendFile(process.cwd() + "/dist/index.html"),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      channel: process.env.CI ? undefined : "chrome",
    });
    const page = await browser.newPage();
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(base + "/csp-probe");
    assert.equal(await page.evaluate(() => window.unapprovedInline), undefined);
    assert.equal(await page.evaluate(() => window.approvedExternal), true);
    await page.goto(base + "/#/privacy");
    await page
      .getByRole("heading", { name: "Your learning record, your privacy." })
      .waitFor();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("dialog", { name: "Settings", exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("combobox", { name: "Site font", exact: true })
        .isVisible(),
      true,
    );
    assert.equal(
      await page.evaluate(async () => {
        const faces = await document.fonts.load('400 16px "Lato"');
        return faces.length > 0 && faces.every((face) => face.status === "loaded");
      }),
      true,
      "self-hosted font must load under the enforced policy",
    );
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.goto(base + "/api/docs");
    await page
      .locator(".swagger-ui .opblock-get")
      .first()
      .waitFor({ timeout: 20000 });
    assert.equal(
      (await page.locator("#swagger-ui .opblock").count()) > 0,
      true,
    );
  } finally {
    await browser?.close();
    await new Promise((r) => server.close(r));
  }
});
