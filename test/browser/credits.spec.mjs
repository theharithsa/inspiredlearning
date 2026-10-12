import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import http from "node:http";
const require = createRequire(
  new URL("../../functions/package.json", import.meta.url),
);
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
let app, db, sink;
test.beforeAll(async () => {
  if (process.env.GCLOUD_PROJECT !== "demo-chaicart")
    throw Error("Emulator only");
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8185";
  app = initializeApp({ projectId: "demo-chaicart" }, "credit-ui");
  db = getFirestore(app);
  sink = http.createServer((req, res) => {
    req.resume();
    res.writeHead(req.url.includes("bizevents") ? 202 : 200);
    res.end("{}");
  });
  await new Promise((resolve) => sink.listen(8799, "127.0.0.1", resolve));
});
test.afterAll(async () => {
  await new Promise((resolve) => sink.close(resolve));
  await deleteApp(app);
});
test("portal shows one Inspi credit total and workshop attendance bonus without legacy points", async ({
  page,
}) => {
  await page.route("https://**dynatrace.com/**", (route) => route.abort());
  await page.goto("/");
  const uid = await page.evaluate(() =>
    import("/test/browser-auth.ts").then((m) =>
      m.login("credit-ui@example.invalid"),
    ),
  );
  await db.doc(`learningLearners/${uid}`).set({
    name: "Credit learner",
    email: "credit-ui@example.invalid",
    learningPoints: 999,
  });
  const row = {
    name: "Credit learner",
    title: "Credit workshop",
    sid: "CREDITUI",
    teamId: "mumbai-1a",
    role: "COO",
    status: "completed",
    revision: 1,
    teamCredits: 1000,
    personalCredits: 200,
  };
  await db.doc(`learningLearners/${uid}/workshops/CREDITUI`).set(row);
  await db
    .doc(`learningLearners/${uid}/workshops/CREDIT02`)
    .set({ ...row, sid: "CREDIT02", teamCredits: 200, personalCredits: 50 });
  await db
    .doc(`learningLearners/${uid}/creditEntries/community-use`)
    .set({ sourceType: "community", delta: -30 });
  await page.reload();
  const total = page
    .getByText("Total Inspi credits", { exact: true })
    .locator("..");
  await expect(total.getByText("1420", { exact: true })).toBeVisible();
  await expect(
    page.getByText("100 per verified completion", { exact: true }),
  ).toHaveCount(0);
  await db.doc("admins/credit-ui@example.invalid").set({ role: "facilitator" });
  const awarded = await page.evaluate(async (uid) => {
    const { auth } = await import("/src/firebase.ts");
    const token = await auth.currentUser.getIdToken();
    const response = await fetch(`/api/v1/students/${uid}/credits`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        credits: 50,
        sourceId: "browser",
        eventId: "activity1",
        reason: "Activity completed",
      }),
    });
    return { status: response.status, data: await response.json() };
  }, uid);
  expect(awarded.status).toBe(200);
  await expect(total.getByText("1470", { exact: true })).toBeVisible();
  await page.goto("/#/workshops/CREDITUI");
  await expect(
    page.getByRole("heading", { name: "1200 credits awarded to you" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Individual credits count again as an attendance benefit/),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/inspi-unified-credits.png",
    fullPage: true,
  });
});
