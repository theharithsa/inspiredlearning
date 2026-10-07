import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
const require = createRequire(
  new URL("../../functions/package.json", import.meta.url),
);
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
test.describe.configure({ mode: "serial" });
let app, db, sink;
const events = [],
  sid = "INSPIRE01",
  fac = "facilitator@example.invalid";
let learnerUid, secondUid, cert;
async function actor(browser, email, path = "/", mobile = false) {
  const context = await browser.newContext(
    mobile
      ? {
          viewport: { width: 390, height: 844 },
          isMobile: true,
          hasTouch: true,
        }
      : {},
  );
  await context.route("https://**dynatrace.com/**", (r) => r.abort());
  const page = await context.newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  const uid = await page.evaluate(
    (email) => import("/test/browser-auth.ts").then((m) => m.login(email)),
    email,
  );
  await page.goto("/#" + path);
  await page.reload();
  return { context, page, uid };
}
test.beforeAll(async () => {
  if (process.env.GCLOUD_PROJECT !== "demo-chaicart")
    throw new Error("Emulator project required.");
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8185";
  app = initializeApp({ projectId: "demo-chaicart" }, "portal-browser");
  db = getFirestore(app);
  sink = http.createServer(async (req, res) => {
    let b = "";
    for await (const chunk of req) b += chunk;
    if (req.url.includes("bizevents")) events.push(JSON.parse(b));
    res.writeHead(req.url.includes("bizevents") ? 202 : 200, {
      "Content-Type": "application/json",
    });
    res.end("{}");
  });
  await new Promise((r) => sink.listen(8799, "127.0.0.1", r));
  await db.doc("admins/" + fac).set({ role: "facilitator" });
  await db.doc("sessions/" + sid).set({
    title: "ChaiCart Cloud Workshop",
    workshopDate: "2026-10-08",
    state: { phase: "open" },
    completedAt: null,
  });
});
test.afterAll(async () => {
  await new Promise((r) => sink.close(r));
  await deleteApp(app);
});
test("public mobile onboarding and Discord work without exposing records", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await context.route("https://**dynatrace.com/**", (r) => r.abort());
  const page = await context.newPage();
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Continue with Google →" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.getByRole("link", { name: "Our community ↗" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Bring your questions. Share your discoveries.",
    }),
  ).toBeVisible();
  await expect(
    page.getByAltText("QR code to join the InspiredLearning Discord community"),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/inspiredlearning-mobile.png",
    fullPage: true,
  });
  await context.close();
});
test("Google learner gets an honest empty state and cannot open staff data", async ({
  browser,
}) => {
  const s = await actor(browser, "learner@example.invalid");
  learnerUid = s.uid;
  await expect(
    s.page.getByRole("heading", { name: "Your next chapter starts here" }),
  ).toBeVisible();
  await s.page
    .getByRole("link", { name: "Workshop staff", exact: true })
    .click();
  await s.page.getByLabel("Session code").fill(sid);
  await s.page.getByRole("button", { name: "Load workshop" }).click();
  await expect(s.page.getByRole("alert")).toContainText(
    "authorized facilitator",
  );
  await s.context.close();
  const two = await actor(browser, "other@example.invalid");
  secondUid = two.uid;
  await two.context.close();
});
test("registration appears before completion, with no certificate or learning points", async ({
  browser,
}) => {
  for (const [uid, name, team] of [
    [learnerUid, "Rehearsal Learner", "mumbai-1a"],
    [secondUid, "Other Learner", "delhi-1a"],
  ])
    await db
      .doc(`sessions/${sid}/students/${uid}`)
      .set({ name, teamId: team, role: "COO" });
  await db
    .doc(`sessions/${sid}/public/leaderboard`)
    .set({ scores: { "mumbai-1a": 1700, "delhi-1a": 1600 } });
  await db.doc(`sessions/${sid}/quizResults/${learnerUid}`).set({
    credits: 200,
    answers: {
      0: { answer: 0, correct: true, credits: 100 },
      1: { answer: 1, correct: false, credits: 0 },
    },
  });
  const s = await actor(browser, "learner@example.invalid");
  await expect(
    s.page.getByRole("link", { name: /Registered.*ChaiCart Cloud Workshop/ }),
  ).toBeVisible();
  await s.page.getByRole("link", { name: "Certificates", exact: true }).click();
  await expect(
    s.page.getByRole("heading", { name: "Your certificate belongs here" }),
  ).toBeVisible();
  await s.context.close();
});
test("facilitator verifies attendance, closes workshop and publishes completion once", async ({
  browser,
}) => {
  const a = await actor(browser, fac, "/staff?session=" + sid);
  await a.page.getByRole("button", { name: "Load workshop" }).click();
  await expect(
    a.page.getByText("Rehearsal Learner", { exact: true }),
  ).toBeVisible();
  await a.page
    .getByRole("checkbox", { name: "Select Rehearsal Learner" })
    .check();
  await a.page
    .getByLabel("Attendance / correction reason")
    .fill("Verified attendance at both workshop sessions.");
  await a.page.getByRole("button", { name: "Confirm attended (1)" }).click();
  await expect(a.page.getByRole("status")).toContainText(
    "attendance records saved",
  );
  await a.page.getByRole("button", { name: "Close live workshop" }).click();
  await a.page
    .getByRole("button", { name: "Publish verified results (1)" })
    .click();
  await expect(a.page.getByRole("status")).toContainText("records published");
  await a.page
    .getByRole("button", { name: "Publish verified results (1)" })
    .click();
  await expect(a.page.getByRole("status")).toContainText("already current");
  const r = (
    await db.doc(`learningLearners/${learnerUid}/workshops/${sid}`).get()
  ).data();
  cert = r.certificateId;
  expect(r.personalCredits).toBe(200);
  expect(r.teamCredits).toBe(1700);
  expect(
    (await db.doc(`learningLearners/${learnerUid}`).get()).data()
      .learningPoints,
  ).toBe(100);
  await a.context.close();
});
test("learner sees distinct scores, downloads PDF and opts into public verification", async ({
  browser,
}) => {
  const s = await actor(
    browser,
    "learner@example.invalid",
    "/workshops/" + sid,
    true,
  );
  await expect(
    s.page.getByText("Personally earned quiz credits", { exact: true }),
  ).toBeVisible();
  await expect(s.page.getByText("200", { exact: true })).toBeVisible();
  await expect(s.page.getByText("1700", { exact: true })).toBeVisible();
  await s.page.getByRole("link", { name: "View certificate →" }).click();
  await expect(
    s.page.getByText("Verification is private.", { exact: false }),
  ).toBeVisible();
  const downloadEvent = s.page.waitForEvent("download");
  await s.page
    .getByRole("button", { name: "Download PDF", exact: true })
    .click();
  const download = await downloadEvent;
  const bytes = fs.readFileSync(await download.path());
  expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  fs.writeFileSync("/tmp/inspiredlearning-certificate-preview.pdf", bytes);
  await s.page
    .getByRole("button", { name: "Enable public verification" })
    .click();
  await expect(
    s.page.getByRole("button", { name: "Turn off public verification" }),
  ).toBeVisible();
  await s.page.getByRole("link", { name: "Open verification page ↗" }).click();
  await expect(
    s.page.getByRole("heading", { name: "Verified participation." }),
  ).toBeVisible();
  await expect(
    s.page.getByRole("heading", { name: "Rehearsal Learner" }),
  ).toBeVisible();
  await s.context.close();
});
test("second account and anonymous users cannot download another learner certificate", async ({
  browser,
}) => {
  const second = await actor(browser, "other@example.invalid", "/certificates");
  await expect(
    second.page.getByRole("heading", { name: "Your certificate belongs here" }),
  ).toBeVisible();
  const result = await second.page.evaluate(async (id) => {
    try {
      await (
        await import("/src/observability.ts")
      ).call("learningCertificate", { id });
      return "allowed";
    } catch (e) {
      return e.code;
    }
  }, cert);
  expect(result).toContain("permission-denied");
  await second.context.close();
  const context = await browser.newContext();
  await context.route("https://**dynatrace.com/**", (r) => r.abort());
  const page = await context.newPage();
  await page.goto("/");
  await page.evaluate(() =>
    import("/test/browser-auth.ts").then((m) => m.anonymous()),
  );
  const denied = await page.evaluate(async () => {
    try {
      await (await import("/src/observability.ts")).action("profile");
      return "allowed";
    } catch (e) {
      return e.code;
    }
  });
  expect(denied).toContain("unauthenticated");
  await context.close();
});
test("captain sees their region only and cannot issue completion", async ({
  browser,
}) => {
  await db
    .doc(`sessions/${sid}/staff/captain@example.invalid`)
    .set({ role: "captain", region: "west" });
  const c = await actor(
    browser,
    "captain@example.invalid",
    "/staff?session=" + sid,
  );
  await c.page.getByRole("button", { name: "Load workshop" }).click();
  await expect(
    c.page.getByText("Rehearsal Learner", { exact: true }),
  ).toBeVisible();
  await expect(c.page.getByText("Other Learner", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    c.page.getByRole("button", { name: /Publish verified results/ }),
  ).toHaveCount(0);
  await c.context.close();
});
test("learner profile and correction request reach facilitator review", async ({
  browser,
}) => {
  const s = await actor(browser, "learner@example.invalid", "/profile");
  await s.page.getByLabel("Display name").fill("Learner Example");
  await s.page.getByRole("button", { name: "Save profile" }).click();
  await expect(s.page.getByRole("status")).toContainText("Profile saved");
  await s.page
    .getByLabel("Details", { exact: true })
    .fill("Please review my workshop certificate name.");
  await s.page.getByRole("button", { name: "Send request" }).click();
  await expect(s.page.getByRole("status")).toContainText("Request submitted");
  await s.context.close();
  const a = await actor(browser, fac, "/staff");
  await expect(
    a.page.getByText("Please review my workshop certificate name.", {
      exact: true,
    }),
  ).toBeVisible();
  await a.page.getByRole("button", { name: "Open learner records" }).click();
  await expect(
    a.page.getByText("Learner Example · learner@example.invalid"),
  ).toBeVisible();
  await a.page
    .getByLabel("Review / correction note")
    .fill("Reviewed with learner; original certificate name is correct.");
  await a.page.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(a.page.getByText("No pending requests.")).toBeVisible();
  await a.page.screenshot({
    path: "/tmp/inspiredlearning-staff.png",
    fullPage: true,
  });
  await a.context.close();
});
test("revocation updates verification and points, and records survive deletion", async ({
  browser,
}) => {
  const a = await actor(browser, fac, "/staff?session=" + sid);
  await a.page.getByRole("button", { name: "Load workshop" }).click();
  await a.page
    .getByLabel("Attendance / correction reason")
    .fill("Attendance record corrected after facilitator review.");
  await a.page.getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(a.page.getByRole("status")).toContainText("revoked");
  await a.context.close();
  const s = await actor(browser, "learner@example.invalid", "/verify/" + cert);
  await expect(
    s.page.getByRole("heading", { name: "Certificate revoked." }),
  ).toBeVisible();
  await s.context.close();
  await db.recursiveDelete(db.doc("sessions/" + sid));
  expect(
    (
      await db.doc(`learningLearners/${learnerUid}/workshops/${sid}`).get()
    ).data().status,
  ).toBe("revoked");
  expect(
    (await db.doc(`learningLearners/${learnerUid}`).get()).data()
      .learningPoints,
  ).toBe(0);
  await expect
    .poll(() => events.filter((e) => e.source === "inspiredlearning").length)
    .toBeGreaterThan(5);
  for (const e of events) {
    expect(e.data["transaction.id"]).toBeTruthy();
    expect(e.data.trace_id).toMatch(/^[a-f0-9]{32}$/);
    expect(e.data.span_id).toMatch(/^[a-f0-9]{16}$/);
  }
  let old = -1,
    stable = 0;
  await expect
    .poll(
      async () => {
        const rows = (await db.collection("learningTelemetry").get()).docs.map(
          (d) => d.data(),
        );
        stable =
          rows.every((r) => r.status === "delivered") && rows.length === old
            ? stable + 1
            : 0;
        old = rows.length;
        return stable >= 3;
      },
      { timeout: 60000, intervals: [1000] },
    )
    .toBe(true);
});
