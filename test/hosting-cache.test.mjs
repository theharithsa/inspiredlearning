import { test } from "node:test";
import assert from "node:assert/strict";
const origin = process.env.HOSTING_TEST_ORIGIN;
if (origin !== "http://127.0.0.1:5095")
  throw Error("Use isolated Hosting emulator");
test(`real Hosting routing caches SPA HTML safely and hashed assets immutably (${process.env.HOSTING_TEST_SURFACE})`, async () => {
  for (const path of ["/", "/index.html", "/privacy", "/unknown-route"]) {
    const r = await fetch(origin + path);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-cache", path);
    assert.ok(
      r.headers
        .get("content-security-policy")
        ?.includes("frame-ancestors 'none'"),
    );
    assert.equal(r.headers.get("content-security-policy-report-only"), null);
  }
  const html = await (await fetch(origin)).text();
  const asset = html.match(/(?:src|href)="(\/assets\/[^" ]+\.js)"/)[1];
  assert.equal(
    (await fetch(origin + asset)).headers.get("cache-control"),
    "public,max-age=31536000,immutable",
  );
});
