import { choose } from "./material-helpers.mjs";
import { acceptConfirmations } from "./confirm-helpers.mjs";
import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../../functions/package.json", import.meta.url),
);
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
let app, db;
const email = "triage-admin@example.invalid";
test.beforeAll(async () => {
  if (process.env.GCLOUD_PROJECT !== "demo-chaicart")
    throw Error("Emulators required");
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8185";
  app = initializeApp({ projectId: "demo-chaicart" }, "triage-browser");
  db = getFirestore(app);
  await db.doc(`admins/${email}`).set({ role: "facilitator" });
});
test.afterAll(async () => {
  await deleteApp(app);
});
async function login(page, account = email) {
  if (account === email) await acceptConfirmations(page);
  await page.route("https://**dynatrace.com/**", (r) => r.abort());
  const admin = account === email;
  await page.goto(admin ? "/admin.html" : "/");
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
test("request pages survive live edits and switch cleanly between tabs", async ({
  page,
}) => {
  const batch = db.batch();
  for (let i = 0; i < 55; i++)
    batch.set(
      db.doc(`learningRequests/triage-open-${String(i).padStart(3, "0")}`),
      {
        uid: "triage-learner",
        email: "triage-learner@example.invalid",
        kind: "correction",
        status: "open",
        reason: `Triage request ${i}`,
      },
    );
  batch.set(db.doc("learningRequests/triage-reviewed"), {
    uid: "triage-learner",
    kind: "correction",
    status: "resolved",
    reason: "Triage reviewed request",
  });
  await batch.commit();
  await login(page);
  await page.goto("/admin.html#/requests");
  await page.getByRole("button", { name: "Load more requests" }).click();
  await expect(
    page.getByText("Triage request 54", { exact: true }),
  ).toBeVisible();
  await db
    .doc("learningRequests/triage-open-000")
    .update({ reason: "Triage request updated" });
  await expect(
    page.getByText("Triage request updated", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Triage request 54", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Request history", exact: true }).click();
  await expect(
    page.getByText("Triage reviewed request", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Triage request 54", { exact: true }),
  ).toHaveCount(0);
  const cleanup = db.batch();
  for (let i = 0; i < 55; i++)
    cleanup.delete(
      db.doc(`learningRequests/triage-open-${String(i).padStart(3, "0")}`),
    );
  cleanup.delete(db.doc("learningRequests/triage-reviewed"));
  await cleanup.commit();
});
test("correction form clears and erasure cancellation does not submit", async ({
  page,
}) => {
  const uid = await login(page, "triage-learner@example.invalid");
  await page.goto("/#/profile");
  await page
    .getByLabel("Details", { exact: true })
    .fill("Triage correction details");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(
    page.getByText(
      "Request submitted. Your facilitator can review it with you.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Details", { exact: true })).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Send request" }),
  ).toBeDisabled();
  await choose(page, "Request type", "erasure");
  await page
    .getByLabel("Details", { exact: true })
    .fill("Triage removal request");
  await page.getByRole("button", { name: "Send request" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect(
    (
      await db
        .collection("learningRequests")
        .where("uid", "==", uid)
        .where("kind", "==", "erasure")
        .get()
    ).size,
  ).toBe(0);
  const databases = await page.evaluate(() => indexedDB.databases());
  expect(databases.some((d) => d.name?.startsWith("firestore/"))).toBe(false);
});
test("generic clicks do not call telemetry and profile updates do not refetch credits", async ({
  page,
}) => {
  let relays = 0,
    scores = 0;
  page.on("request", (req) => {
    if (req.url().includes("/learningTelemetry")) relays++;
    if (req.url().includes("/api/v1/me/scores")) scores++;
  });
  const uid = await login(page, "triage-credits@example.invalid");
  await expect(page.getByText("Across your Inspi activities")).toBeVisible();
  const previous = scores;
  await db
    .doc(`learningLearners/${uid}`)
    .update({ name: "Triage updated profile" });
  await expect(
    page.getByText(/Welcome back, Triage updated profile/),
  ).toBeVisible();
  expect(scores).toBe(previous);
  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await expect(page).toHaveTitle("Profile · InspiredLearning");
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  expect(relays).toBe(0);
});
test("verification recovers after an error and register handles non-JSON errors", async ({
  page,
}) => {
  await page.route("**/api/v1/public/certificates/*/verification", (route) =>
    route.request().url().includes("/broken/")
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: { status: "UNAVAILABLE", message: "Try again" },
          }),
        })
      : route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            status: "valid",
            name: "Synthetic Learner",
            title: "Synthetic workshop",
            revision: 1,
          }),
        }),
  );
  await page.goto("/#/verify/broken");
  await expect(
    page.getByRole("heading", { name: "Verification unavailable." }),
  ).toBeVisible();
  await page.goto("/#/verify/fixed");
  await expect(
    page.getByRole("heading", { name: "Verified participation." }),
  ).toBeVisible();
  await login(page);
  await page.route("**/api/v1/certificates?*", (route) =>
    route.fulfill({
      status: 502,
      contentType: "text/html",
      body: "<html>Gateway error</html>",
    }),
  );
  await page.goto("/admin.html#/certificates");
  await expect(
    page.getByText("Could not load certificates. Please try again.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Unexpected token/)).toHaveCount(0);
});

test("a failed lazy module shows reload recovery instead of a blank page", async ({
  page,
}) => {
  await page.route("**/src/App.tsx*", (route) => route.abort());
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "We couldn’t load this page." }),
  ).toBeVisible();
  await page.unroute("**/src/App.tsx*");
  await page.getByRole("button", { name: "Reload page", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Continue with Google →" }),
  ).toBeVisible();
});

test("public privacy and verification do not initialize Firebase or load the production RUM agent", async ({
  page,
}) => {
  const requests = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.route("**/api/v1/public/certificates/*/verification", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ status: "private-or-unavailable" }),
    }),
  );
  await page.goto("/#/privacy");
  await expect(page).toHaveTitle("Privacy · InspiredLearning");
  await page.goto("/#/verify/synthetic");
  await expect(
    page.getByRole("heading", { name: "Private or unavailable." }),
  ).toBeVisible();
  expect(
    requests.filter((u) =>
      /src\/firebase|firebase_auth|firebase_firestore|identitytoolkit|js-cdn\.dynatrace/.test(
        u,
      ),
    ),
  ).toEqual([]);
});
test("admin redrive keeps its request key and reason when the response fails", async ({
  page,
}) => {
  await login(page);
  let queued = false;
  const attempts = [];
  await page.route("**/api/v1/admin/telemetry/health", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        pending: queued ? 1 : 0,
        failed: queued ? 0 : 1,
        delivered: 0,
        oldestPendingAgeSeconds: 0,
        oldestPendingAgeComplete: true,
        asOf: new Date().toISOString(),
      }),
    }),
  );
  await page.route("**/api/v1/admin/telemetry/events?*", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: queued
          ? []
          : [
              {
                id: "fixture-failed",
                status: "failed",
                eventId: "synthetic",
                eventName: "test.fixture",
                attempts: 20,
                lastStatus: 400,
              },
            ],
        nextCursor: null,
      }),
    }),
  );
  await page.route(
    "**/api/v1/admin/telemetry/events/fixture-failed/redrive",
    (r) => {
      attempts.push({
        key: r.request().headers()["idempotency-key"],
        body: r.request().postDataJSON(),
      });
      queued = true;
      return r.fulfill(
        attempts.length === 1
          ? {
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({
                error: { message: "Synthetic lost response" },
              }),
            }
          : {
              contentType: "application/json",
              body: JSON.stringify({
                id: "fixture-failed",
                queued: true,
                status: "pending",
              }),
            },
      );
    },
  );
  page.on("dialog", (d) => d.accept());
  await page.goto("/admin.html#/delivery");
  await page
    .getByLabel("Redrive review reason")
    .fill("Reviewed original reason");
  await page.getByRole("button", { name: "Redrive failed event" }).click();
  await expect(page.getByText("Synthetic lost response")).toBeVisible();
  await page
    .getByLabel("Redrive review reason")
    .fill("Changed text after failed response");
  await page.getByRole("button", { name: "Redrive failed event" }).click();
  await expect(page.getByText(/Event queued\. Scheduled/)).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
});

test("workshop history discloses its bounded window and loads the remaining records", async ({
  page,
}) => {
  const uid = await login(page, "triage-paging@example.invalid"),
    batch = db.batch();
  for (let i = 0; i < 55; i++) {
    const sid = "PAGED" + String(i).padStart(3, "0");
    batch.set(db.doc(`learningLearners/${uid}/workshops/${sid}`), {
      sid,
      uid,
      title: `Paged workshop ${i}`,
      date: "2026-10-27",
      status: "registered",
      revision: 0,
      learningPoints: 0,
    });
  }
  await batch.commit();
  await expect(page.getByText(/Showing 50 workshop records/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Paged workshop 54", exact: true }),
  ).toHaveCount(0);
  await page.goto("/#/workshops/PAGED054");
  await expect(
    page.getByRole("heading", { name: "Paged workshop 54", exact: true }),
  ).toBeVisible();
  await page.goto("/");
  await page
    .getByRole("button", { name: "Load more workshop records" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Paged workshop 54", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Load more workshop records" }),
  ).toHaveCount(0);
});
