import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { execute, enroll, verification } from "../functions/actions.js";
import { certificatePdf } from "../functions/pdf.js";
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
let app, db, env;
const fac = { uid: "fac", email: "facilitator@example.invalid" },
  captain = { uid: "captain", email: "captain@example.invalid" },
  c = {
    transactionId: "integration-transaction",
    traceId: "a".repeat(32),
    spanId: "b".repeat(16),
  };
const sid = "LEARN001",
  st = { name: "Test Learner", teamId: "mumbai-1a", role: "COO" };
const run = (actor, action, data = {}) =>
  execute(db, actor, { action, sid, ...data }, c);
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST)
    throw new Error("Use Firebase emulators.");
  app = initializeApp({ projectId: "demo-chaicart" }, "learning-integration");
  db = getFirestore(app);
  env = await initializeTestEnvironment({
    projectId: "demo-chaicart",
    firestore: {
      host: "127.0.0.1",
      port: 8185,
      rules: fs.readFileSync("test/firestore.rules", "utf8"),
    },
  });
  await env.clearFirestore();
  await db.doc("admins/" + fac.email).set({ role: "facilitator" });
  await db.doc("sessions/" + sid).set({
    title: "Verified Cloud Workshop",
    workshopDate: "2026-10-08",
    state: { phase: "open" },
    completedAt: null,
  });
  await db
    .doc(`sessions/${sid}/staff/${captain.email}`)
    .set({ role: "captain", region: "west" });
  for (const [uid, team] of [
    ["one", "mumbai-1a"],
    ["two", "delhi-1a"],
  ])
    await db
      .doc(`sessions/${sid}/students/${uid}`)
      .set({ ...st, teamId: team });
  await db
    .doc(`sessions/${sid}/public/leaderboard`)
    .set({ scores: { "mumbai-1a": 1700, "delhi-1a": 1600 } });
  await db.doc(`sessions/${sid}/quizResults/one`).set({
    credits: 200,
    answers: { 0: { answer: 1, correct: true, credits: 100 } },
  });
});
after(async () => {
  await env.cleanup();
  await deleteApp(app);
});
test("registration alone grants no certificate or points; enrolling twice is safe", async () => {
  const s = (await db.doc("sessions/" + sid).get()).data();
  assert.equal(await enroll(db, sid, "one", st, s, c, fac), true);
  assert.equal(await enroll(db, sid, "one", st, s, c, fac), false);
  const r = (
    await db.doc(`learningLearners/one/workshops/${sid}`).get()
  ).data();
  assert.equal(r.status, "registered");
  assert.equal(r.learningPoints, 0);
  assert.equal((await db.collection("learningCertificates").get()).size, 0);
});
test("captain is regional and cannot finalize; reason is mandatory", async () => {
  await assert.rejects(
    run(captain, "attendance", {
      uid: "two",
      status: "attended",
      reason: "Checked",
    }),
    /outside/,
  );
  await assert.rejects(
    run(captain, "finalize", { uids: ["one"], reason: "Checked" }),
    /Only facilitators/,
  );
  await assert.rejects(
    run(fac, "attendance", { uid: "one", status: "attended", reason: "" }),
    /reason/,
  );
  await run(captain, "attendance", {
    uid: "one",
    status: "attended",
    reason: "Verified participation",
  });
});
test("completion requires closed workshop and attendance", async () => {
  let r = await run(fac, "finalize", { uids: ["one"], reason: "Closing" });
  assert.equal(r.results[0].status, "failed");
  await run(fac, "close");
  r = await run(fac, "finalize", { uids: ["two"], reason: "Closing" });
  assert.equal(r.results[0].status, "failed");
});
test("concurrent repeated finalization awards exactly 100 and issues one certificate", async () => {
  await Promise.all([
    run(fac, "finalize", { uids: ["one"], reason: "Verified closing" }),
    run(fac, "finalize", { uids: ["one"], reason: "Retried closing" }),
  ]);
  const r = (
    await db.doc(`learningLearners/one/workshops/${sid}`).get()
  ).data();
  assert.equal(r.status, "completed");
  assert.equal(r.personalCredits, 200);
  assert.equal(r.teamCredits, 1700);
  assert.equal(r.learningPoints, 100);
  assert.equal(
    (await db.doc("learningLearners/one").get()).data().learningPoints,
    100,
  );
  assert.equal((await db.collection("learningCertificates").get()).size, 1);
  assert.equal(
    (await db.collection("learningLearners/one/points").get()).size,
    1,
  );
});
test("correction versions results, replaces certificate, and does not duplicate learning points", async () => {
  const before = (
    await db.doc(`learningLearners/one/workshops/${sid}`).get()
  ).data();
  await db.doc(`sessions/${sid}/quizResults/one`).update({ credits: 300 });
  await run(fac, "finalize", { uids: ["one"], reason: "Corrected quiz grade" });
  const r = (
    await db.doc(`learningLearners/one/workshops/${sid}`).get()
  ).data();
  assert.equal(r.revision, 2);
  assert.notEqual(r.certificateId, before.certificateId);
  assert.equal(
    (await db.doc(`learningCertificates/${before.certificateId}`).get()).data()
      .status,
    "revoked",
  );
  assert.equal(
    (await db.doc("learningLearners/one").get()).data().learningPoints,
    100,
  );
});
test("certificate visibility and results are owner-scoped; clients cannot forge points", async () => {
  const claims = {
    email: "one@example.invalid",
    email_verified: true,
    firebase: { sign_in_provider: "google.com" },
  };
  const owner = env.authenticatedContext("one", claims).firestore(),
    other = env
      .authenticatedContext("two", { ...claims, email: "two@example.invalid" })
      .firestore();
  await assertSucceeds(
    getDoc(doc(owner, `learningLearners/one/workshops/${sid}`)),
  );
  await assertFails(
    getDoc(doc(other, `learningLearners/one/workshops/${sid}`)),
  );
  await assertFails(
    setDoc(doc(owner, "learningLearners/one"), { learningPoints: 99999 }),
  );
  const r = (
    await db.doc(`learningLearners/one/workshops/${sid}`).get()
  ).data();
  await assertFails(
    getDoc(doc(other, `learningCertificates/${r.certificateId}`)),
  );
  await assertSucceeds(
    getDocs(
      query(
        collection(owner, "learningCertificates"),
        where("uid", "==", "one"),
      ),
    ),
  );
  assert.equal(
    (await verification(db, r.certificateId)).status,
    "private-or-unavailable",
  );
  await execute(
    db,
    { uid: "one", email: "one@example.invalid" },
    {
      action: "certificateVisibility",
      certificateId: r.certificateId,
      public: true,
    },
    c,
  );
  assert.equal((await verification(db, r.certificateId)).status, "valid");
  await assert.rejects(
    execute(
      db,
      { uid: "two", email: "two@example.invalid" },
      {
        action: "certificateVisibility",
        certificateId: r.certificateId,
        public: true,
      },
      c,
    ),
    /another account/,
  );
});
test("PDF renders Unicode names and contains a real PDF document", async () => {
  const r = (
    await db.doc(`learningLearners/one/workshops/${sid}`).get()
  ).data();
  const cert = (
    await db.doc(`learningCertificates/${r.certificateId}`).get()
  ).data();
  const bytes = await certificatePdf({ ...cert, name: "विद्यार्थी" });
  assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
  assert.ok(bytes.length > 10000);
});
test("revocation reverses points once; downloaded certificate verification becomes revoked", async () => {
  const r = (
    await db.doc(`learningLearners/one/workshops/${sid}`).get()
  ).data();
  await run(fac, "revoke", { uid: "one", reason: "Attendance corrected" });
  assert.equal(
    (await db.doc("learningLearners/one").get()).data().learningPoints,
    0,
  );
  assert.equal((await verification(db, r.certificateId)).status, "revoked");
  await assert.rejects(
    run(fac, "revoke", { uid: "one", reason: "Duplicate" }),
    /no active completion/,
  );
});
test("durable records survive recursive session deletion; every canonical event is correlated", async () => {
  await run(fac, "attendance", {
    uid: "two",
    status: "not-attended",
    reason: "Absent",
  });
  await db.recursiveDelete(db.doc("sessions/" + sid));
  assert.equal(
    (await db.doc(`learningLearners/one/workshops/${sid}`).get()).data().status,
    "revoked",
  );
  for (const row of (await db.collection("learningTelemetry").get()).docs) {
    const d = row.data().payload.data;
    assert.ok(d["transaction.id"]);
    assert.match(d.trace_id, /^[a-f0-9]{32}$/);
    assert.match(d.span_id, /^[a-f0-9]{16}$/);
  }
});

test("facilitator can correct and revoke an archived certificate without the deleted source session", async () => {
  const path = `learningLearners/one/workshops/${sid}`,
    old = (await db.doc(path).get()).data();
  await db.doc(path).update({ status: "completed", learningPoints: 100 });
  await db.doc("learningLearners/one").update({ learningPoints: 100 });
  await run(fac, "correctCertificate", {
    uid: "one",
    name: "Verified New Name",
    reason: "Verified name correction after archived-session deletion",
  });
  const current = (await db.doc(path).get()).data();
  assert.equal(current.name, "Verified New Name");
  assert.notEqual(current.certificateId, old.certificateId);
  assert.equal(
    (await db.doc("learningLearners/one").get()).data().learningPoints,
    100,
  );
  await run(fac, "revoke", {
    uid: "one",
    reason: "Final archived record review",
  });
  assert.equal(
    (await db.doc("learningLearners/one").get()).data().learningPoints,
    0,
  );
});
