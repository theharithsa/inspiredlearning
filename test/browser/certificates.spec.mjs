import { acceptConfirmations } from "./confirm-helpers.mjs";
import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
const require = createRequire(
  new URL("../../functions/package.json", import.meta.url),
);
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
let app, db;
const email = "certificate-admin@example.invalid";
test.beforeAll(async () => {
  if (process.env.GCLOUD_PROJECT !== "demo-chaicart")
    throw Error("Emulator required");
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8185";
  app = initializeApp({ projectId: "demo-chaicart" }, "certificate-browser");
  db = getFirestore(app);
  await db.doc(`admins/${email}`).set({ role: "facilitator" });
});
test.afterAll(async () => {
  await deleteApp(app);
});
test("administrator sees certificate types, status history and authorized PDF previews", async ({
  page,
}) => {
  await acceptConfirmations(page);
  await page.route("https://**dynatrace.com/**", (r) => r.abort());
  await page.goto("/admin.html#/certificates");
  const uid = await page.evaluate(
    (email) => import("/test/browser-auth.ts").then((m) => m.login(email)),
    email,
  );
  await db
    .doc(`learningLearners/${uid}`)
    .set({ name: "Certificate Administrator", email });
  const student = "cert-browser-student",
    sid = "CERTVIEW",
    parent = randomUUID(),
    award = randomUUID(),
    revoked = randomUUID();
  await db.doc(`learningLearners/${student}/workshops/${sid}`).set({
    uid: student,
    sid,
    name: "Test Recipient",
    status: "completed",
    certificateId: parent,
  });
  const base = {
    uid: student,
    sid,
    name: "Test Recipient",
    title: "Certificate UI Workshop",
    date: "2026-10-01",
    revision: 1,
    status: "issued",
    public: false,
    awards: ["Best CTO"],
  };
  for (const cert of [
    { ...base, id: parent, kind: "participation" },
    {
      ...base,
      id: award,
      kind: "award",
      awardTitle: "Best CTO",
      parentCertificateId: parent,
    },
    { ...base, id: revoked, kind: "participation", status: "revoked" },
  ])
    await db.doc(`learningCertificates/${cert.id}`).set(cert);
  await page.goto("/admin.html#/certificates");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Issued certificates and history" }),
  ).toBeVisible();
  const register = page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "Issued certificates and history",
    }),
  });
  await register.getByLabel("Workshop code", { exact: true }).fill(sid);
  await register
    .getByRole("button", { name: "Load certificates", exact: true })
    .click();
  await expect(
    register.getByText("3 certificates loaded.", { exact: false }),
  ).toBeVisible();
  await expect(register.getByRole("cell", { name: /Best CTO/ })).toBeVisible();
  const download = page.waitForEvent("download");
  await register.getByRole("button", { name: "Preview PDF" }).first().click();
  expect((await download).suggestedFilename()).toMatch(/InspiredLearning/);
  await register
    .getByLabel("Certificate type", { exact: true })
    .selectOption("award");
  await register
    .getByRole("button", { name: "Load certificates", exact: true })
    .click();
  await expect(
    register.getByText("1 certificates loaded.", { exact: false }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(
      tmpdir(),
      "inspi-certificate-audit",
      "admin-certificates.png",
    ),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    register.getByRole("heading", { name: "Issued certificates and history" }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(
      tmpdir(),
      "inspi-certificate-audit",
      "admin-certificates-mobile.png",
    ),
    fullPage: true,
  });
});
