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
  await expect(
    a.page.getByRole("status").filter({
      hasText: /reinstated|corrected|revoked|attendance|published|current/i,
    }),
  ).toContainText("attendance records saved");
  await a.page.getByRole("button", { name: "Close live workshop" }).click();
  await a.page
    .getByRole("button", { name: "Publish verified results (1)" })
    .click();
  await expect(
    a.page.getByRole("status").filter({
      hasText: /reinstated|corrected|revoked|attendance|published|current/i,
    }),
  ).toContainText("records published");
  await a.page
    .getByRole("button", { name: "Publish verified results (1)" })
    .click();
  await expect(
    a.page.getByRole("status").filter({
      hasText: /reinstated|corrected|revoked|attendance|published|current/i,
    }),
  ).toContainText("already current");
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
  await s.page.getByRole("button", { name: "Show QR code" }).click();
  await expect(
    s.page.getByRole("img", {
      name: "Public certificate verification QR code",
    }),
  ).toBeVisible();
  await s.context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await s.page.getByRole("button", { name: "Copy verification link" }).click();
  expect(await s.page.evaluate(() => navigator.clipboard.readText())).toMatch(
    /^https:\/\/inspiredlearning-vh\.web\.app\/#\/verify\//,
  );
  await s.page.getByRole("link", { name: "Open verification page" }).click();
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
  await a.page.getByRole("button", { name: "Resolve correction" }).click();
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
  await expect(
    a.page.getByRole("status").filter({
      hasText: /reinstated|corrected|revoked|attendance|published|current/i,
    }),
  ).toContainText("revoked");
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

test("administrator navigation is role gated and archived certificates can be reinstated, previewed and corrected", async ({
  browser,
}) => {
  const learner = await actor(browser, "learner@example.invalid");
  await expect(
    learner.page.getByRole("link", { name: "Admin controls" }),
  ).toHaveCount(0);
  await learner.page.goto("/#/admin");
  await expect(learner.page.getByRole("alert")).toContainText(
    "Administrator access required",
  );
  await learner.context.close();
  const a = await actor(browser, fac, "/admin");
  await expect(
    a.page.getByRole("heading", { name: "Admin control centre." }),
  ).toBeVisible();
  await expect(
    a.page.getByRole("link", { name: "Admin controls" }),
  ).toBeVisible();
  await a.page
    .getByLabel("Learner email, account reference or certificate ID")
    .fill("learner@example.invalid");
  await a.page.getByRole("button", { name: "Find record" }).click();
  await a.page
    .getByLabel("Review / correction note")
    .fill("Attendance reverified with learner after archival.");
  await a.page
    .getByRole("button", { name: "Reinstate completion and certificate" })
    .click();
  await expect(
    a.page.getByRole("status").filter({
      hasText: /reinstated|corrected|revoked|attendance|published|current/i,
    }),
  ).toContainText("reinstated");
  cert = (
    await db.doc(`learningLearners/${learnerUid}/workshops/${sid}`).get()
  ).data().certificateId;
  const download = a.page.waitForEvent("download");
  await a.page.getByRole("button", { name: "Preview certificate PDF" }).click();
  const pdf = await download;
  expect(
    fs
      .readFileSync(await pdf.path())
      .subarray(0, 4)
      .toString(),
  ).toBe("%PDF");
  await a.page
    .getByLabel("Verified certificate name")
    .fill("Verified Learner Name");
  await a.page
    .getByRole("button", { name: "Replace certificate with corrected details" })
    .click();
  await expect(
    a.page.getByRole("status").filter({
      hasText: /reinstated|corrected|revoked|attendance|published|current/i,
    }),
  ).toContainText("Certificate details corrected");
  const updated = (
    await db.doc(`learningLearners/${learnerUid}/workshops/${sid}`).get()
  ).data();
  expect(updated.certificateId).not.toBe(cert);
  expect(
    (await db.doc(`learningCertificates/${cert}`).get()).data().status,
  ).toBe("revoked");
  cert = updated.certificateId;
  expect(
    (await db.doc(`learningLearners/${learnerUid}`).get()).data()
      .learningPoints,
  ).toBe(100);
  await a.page.getByLabel("Learner display name").fill("Updated Display Name");
  await a.page
    .getByRole("button", { name: "Correct learner display name" })
    .click();
  await expect(
    a.page.getByRole("status").filter({
      hasText: /reinstated|corrected|revoked|attendance|published|current/i,
    }),
  ).toContainText("Display name corrected");
  expect((await db.doc(`learningCertificates/${cert}`).get()).data().name).toBe(
    "Verified Learner Name",
  );
  await a.page.screenshot({
    path: "/tmp/inspiredlearning-admin-controls.png",
    fullPage: true,
  });
  await a.context.close();
});
test("mobile learner sees saved profile, downloads corrected certificate and has no horizontal page overflow", async ({
  browser,
}) => {
  const s = await actor(browser, "learner@example.invalid", "/profile", true);
  await expect(s.page.getByLabel("Display name")).toHaveValue(
    "Updated Display Name",
  );
  await s.page.goto("/#/certificates");
  await expect(
    s.page.getByRole("heading", { name: "Learning worth keeping." }),
  ).toBeVisible();
  const download = s.page.waitForEvent("download");
  await s.page.getByRole("button", { name: "Download PDF" }).click();
  expect(
    fs
      .readFileSync(await (await download).path())
      .subarray(0, 4)
      .toString(),
  ).toBe("%PDF");
  expect(
    await s.page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await s.context.close();
});
test("student sees administrator decline and reopened correction request status", async ({
  browser,
}) => {
  const s = await actor(browser, "learner@example.invalid", "/profile");
  await s.page
    .getByLabel("Details", { exact: true })
    .fill("Please review my display name again.");
  await s.page.getByRole("button", { name: "Send request" }).click();
  await expect(s.page.getByRole("status")).toContainText("Request submitted");
  await s.context.close();
  const a = await actor(browser, fac, "/admin");
  await a.page
    .getByLabel("Review / correction note")
    .fill("Please provide the verified spelling.");
  await a.page.getByRole("button", { name: "Decline request" }).click();
  await expect(a.page.getByText("No pending requests.")).toBeVisible();
  await a.page
    .getByRole("button", { name: "Request history", exact: true })
    .click();
  const row = a.page
    .locator("article")
    .filter({ hasText: "Please review my display name again." });
  await row.getByRole("button", { name: "Reopen request" }).click();
  await a.page
    .getByRole("button", { name: "Pending requests", exact: true })
    .click();
  await expect(
    a.page.getByText("Please review my display name again.", { exact: true }),
  ).toBeVisible();
  await a.context.close();
  const again = await actor(browser, "learner@example.invalid", "/profile");
  await expect(
    again.page.getByText("Please provide the verified spelling.", {
      exact: true,
    }),
  ).toBeVisible();
  await again.context.close();
});
test("sign-out and account switching clear private history and administrative controls", async ({
  browser,
}) => {
  const s = await actor(browser, "learner@example.invalid", "/profile");
  await expect(s.page.getByLabel("Display name")).toHaveValue(
    "Updated Display Name",
  );
  await s.page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    s.page.getByRole("button", { name: "Continue with Google →" }),
  ).toBeVisible();
  const uid = await s.page.evaluate(() =>
    import("/test/browser-auth.ts").then((m) =>
      m.login("other@example.invalid"),
    ),
  );
  expect(uid).toBe(secondUid);
  await s.page.goto("/#/profile");
  await expect(s.page.getByLabel("Display name")).not.toHaveValue(
    "Updated Display Name",
  );
  await expect(
    s.page.getByText("Please review my display name again.", { exact: true }),
  ).toHaveCount(0);
  await expect(
    s.page.getByRole("link", { name: "Admin controls" }),
  ).toHaveCount(0);
  await s.context.close();
});
test("approved student removal deletes learning records and certificates while retaining Google identity and Live registration", async ({
  browser,
}) => {
  await db.doc("sessions/RETAIN01").set({ title: "Retained Live workshop" });
  await db
    .doc(`sessions/RETAIN01/students/${learnerUid}`)
    .set({ name: "Retained Learner", teamId: "mumbai-1a", role: "COO" });
  const s = await actor(browser, "learner@example.invalid", "/profile");
  await s.page.getByLabel("Request type").selectOption("erasure");
  await s.page
    .getByLabel("Details", { exact: true })
    .fill("Please remove only my InspiredLearning history.");
  await s.page.getByRole("button", { name: "Send request" }).click();
  await expect(s.page.getByRole("status")).toContainText("Request submitted");
  await s.context.close();
  const a = await actor(browser, fac, "/admin");
  await a.page
    .getByLabel("Review / correction note")
    .fill("Verified owner and portal-only scope.");
  await a.page.getByRole("button", { name: "Approve removal" }).click();
  const confirmation = a.page.getByLabel(
    "Type the learner account reference to confirm",
  );
  await confirmation.fill("WRONG");
  await expect(
    a.page.getByRole("button", { name: "Permanently remove learning records" }),
  ).toBeDisabled();
  await confirmation.fill(learnerUid);
  await a.page
    .getByRole("button", { name: "Permanently remove learning records" })
    .click();
  await expect
    .poll(
      async () =>
        (await db.doc(`learningPrivacy/${learnerUid}`).get()).data()?.state,
    )
    .toBe("erased");
  expect((await db.doc(`learningLearners/${learnerUid}`).get()).exists).toBe(
    false,
  );
  expect(
    (
      await db
        .collection("learningCertificates")
        .where("uid", "==", learnerUid)
        .get()
    ).empty,
  ).toBe(true);
  expect(
    (await db.doc(`sessions/RETAIN01/students/${learnerUid}`).get()).exists,
  ).toBe(true);
  await a.context.close();
  const again = await actor(browser, "learner@example.invalid");
  expect(again.uid).toBe(learnerUid);
  await expect(
    again.page.getByRole("heading", {
      name: "Your learning records were removed.",
    }),
  ).toBeVisible();
  await expect(
    again.page.getByText("Learning-record removal · resolved"),
  ).toBeVisible();
  await again.page.screenshot({
    path: "/tmp/inspiredlearning-removal-complete.png",
    fullPage: true,
  });
  await again.context.close();
});
test("erased certificate is unavailable; explicit reactivation does not restore historical results", async ({
  browser,
}) => {
  const s = await actor(browser, "learner@example.invalid");
  await expect(
    s.page.getByRole("heading", {
      name: "Your learning records were removed.",
    }),
  ).toBeVisible();
  const denied = await s.page.evaluate(
    (id) =>
      import("/src/firebase.ts").then(async (m) => {
        const { httpsCallable } =
          await import("/node_modules/.vite/deps/firebase_functions.js");
        try {
          await httpsCallable(m.functions, "learningCertificate")({ id });
          return "allowed";
        } catch (e) {
          return e.code;
        }
      }),
    cert,
  );
  expect(denied).toBe("functions/permission-denied");
  await s.page
    .getByRole("button", { name: "Start a new learning profile" })
    .click();
  await expect(
    s.page.getByRole("heading", { name: "Your next chapter starts here" }),
  ).toBeVisible();
  expect(
    (await db.collection(`learningLearners/${learnerUid}/workshops`).get())
      .empty,
  ).toBe(true);
  const a = await actor(browser, fac, "/admin");
  await a.page.getByLabel("Session code").fill("RETAIN01");
  await a.page.getByRole("button", { name: "Load workshop" }).click();
  await expect(
    a.page.getByText("Records removed", { exact: true }),
  ).toBeVisible();
  await expect(
    a.page.getByRole("checkbox", { name: "Select Retained Learner" }),
  ).toBeDisabled();
  await a.context.close();
  await db.doc("sessions/FUTURE02").set({ title: "Future workshop" });
  await db
    .doc(`sessions/FUTURE02/students/${learnerUid}`)
    .set({ name: "Returning learner", teamId: "mumbai-1a", role: "COO" });
  await expect
    .poll(
      async () =>
        (
          await db
            .doc(`learningLearners/${learnerUid}/workshops/FUTURE02`)
            .get()
        ).exists,
    )
    .toBe(true);
  expect(
    (await db.doc(`learningLearners/${learnerUid}/workshops/RETAIN01`).get())
      .exists,
  ).toBe(false);
  await s.context.close();
});
test("administrator receives new requests live without reloading the console", async ({
  browser,
}) => {
  const a = await actor(browser, fac, "/admin");
  await expect(
    a.page.getByRole("heading", { name: "Admin control centre." }),
  ).toBeVisible();
  const s = await actor(browser, "other@example.invalid", "/profile");
  await s.page
    .getByLabel("Details", { exact: true })
    .fill("New request while the administrator console stays open.");
  await s.page.getByRole("button", { name: "Send request" }).click();
  await expect(
    a.page.getByText(
      "New request while the administrator console stays open.",
      { exact: true },
    ),
  ).toBeVisible();
  await s.context.close();
  await a.context.close();
});
test("final canonical-event drain preserves trace and transaction correlation for admin controls and erasure", async () => {
  let stable = 0,
    previous = -1;
  await expect
    .poll(
      async () => {
        const rows = (await db.collection("learningTelemetry").get()).docs.map(
          (d) => d.data(),
        );
        stable =
          rows.every((r) => r.status === "delivered") &&
          rows.length === previous
            ? stable + 1
            : 0;
        previous = rows.length;
        return stable >= 3;
      },
      { timeout: 60000, intervals: [1000] },
    )
    .toBe(true);
  for (const name of [
    "workshop.completion.reinstated",
    "learner.profile.corrected",
    "account.removal.started",
    "account.removal.completed",
    "account.reactivated",
    "certificate.admin-preview.prepared",
  ])
    expect(events.some((e) => e.data?.["event.name"] === name)).toBe(true);
  for (const event of events) {
    expect(event.data["transaction.id"]).toBeTruthy();
    expect(event.data.trace_id).toMatch(/^[a-f0-9]{32}$/);
    expect(event.data.span_id).toMatch(/^[a-f0-9]{16}$/);
  }
});
