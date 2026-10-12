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

test("administrator profile corrections preserve UID, email, points and issued certificates", async () => {
  const r = (
    await db.doc(`learningLearners/one/workshops/${sid}`).get()
  ).data();
  await db
    .doc("learningLearners/one")
    .set({ name: "Before", email: "one@example.invalid" }, { merge: true });
  await assert.rejects(
    run(captain, "updateLearner", {
      uid: "one",
      name: "Wrong",
      reason: "test",
    }),
    /Administrator access/,
  );
  await run(fac, "updateLearner", {
    uid: "one",
    name: "Approved name",
    reason: "Verified with learner",
  });
  const p = (await db.doc("learningLearners/one").get()).data();
  assert.equal(p.name, "Approved name");
  assert.equal(p.email, "one@example.invalid");
  assert.equal(p.learningPoints, 0);
  assert.equal(
    (await db.doc(`learningCertificates/${r.certificateId}`).get()).data().name,
    r.name,
  );
  const lookup = await run(fac, "lookup", { reference: "one@example.invalid" });
  assert.equal(lookup.uid, "one");
  await assert.rejects(
    run(fac, "updateLearner", { uid: "missing", name: "Test", reason: "Test" }),
    /not found/,
  );
});
test("automatic profile refresh cannot overwrite explicit preferences and concurrent refresh preserves points", async () => {
  const actor = {
    uid: "one",
    email: "one@example.invalid",
    name: "Google display",
  };
  await Promise.all([
    execute(db, actor, { action: "profile" }, c),
    execute(db, actor, { action: "profile", name: "Preferred" }, c),
  ]);
  assert.equal(
    (await db.doc("learningLearners/one").get()).data().name,
    "Preferred",
  );
  await execute(db, actor, { action: "profile" }, c);
  assert.equal(
    (await db.doc("learningLearners/one").get()).data().name,
    "Preferred",
  );
});
test("archived revoked completion can be reinstated concurrently exactly once, with a new private certificate", async () => {
  const old = (
    await db.doc(`learningLearners/one/workshops/${sid}`).get()
  ).data();
  await assert.rejects(
    run(captain, "restoreCompletion", { uid: "one", reason: "checked" }),
    /Administrator access/,
  );
  await Promise.all([
    run(fac, "restoreCompletion", {
      uid: "one",
      reason: "Attendance reverified",
    }),
    run(fac, "restoreCompletion", { uid: "one", reason: "Duplicate retry" }),
  ]);
  const now = (
    await db.doc(`learningLearners/one/workshops/${sid}`).get()
  ).data();
  assert.notEqual(now.certificateId, old.certificateId);
  assert.equal(now.status, "completed");
  assert.equal(
    (await db.doc("learningLearners/one").get()).data().learningPoints,
    100,
  );
  assert.equal(
    (await db.doc(`learningCertificates/${now.certificateId}`).get()).data()
      .public,
    false,
  );
  assert.equal(
    (await db.doc(`learningCertificates/${old.certificateId}`).get()).data()
      .status,
    "revoked",
  );
  assert.equal(
    (await verification(db, old.certificateId)).status,
    "private-or-unavailable",
  );
});
test("student requests are private; administrators can decline, reopen and resolve corrections idempotently", async () => {
  await execute(
    db,
    { uid: "one", email: "one@example.invalid" },
    {
      action: "requestCorrection",
      kind: "correction",
      reason: "Please fix my name",
    },
    c,
  );
  const req = (await run(fac, "requests")).requests.find(
    (r) => r.uid === "one",
  );
  await assert.rejects(run(captain, "requests"), /Facilitator access/);
  await assert.rejects(
    run({ uid: "other", email: "other@example.invalid" }, "reviewRequest", {
      requestId: req.id,
      reason: "Attempt",
    }),
    /Facilitator access/,
  );
  await run(fac, "reviewRequest", {
    requestId: req.id,
    reason: "Need evidence",
    decision: "rejected",
  });
  assert.equal(
    (await db.doc("learningRequests/" + req.id).get()).data().status,
    "rejected",
  );
  await run(fac, "reviewRequest", {
    requestId: req.id,
    reason: "Evidence received",
    decision: "reopen",
  });
  await run(fac, "reviewRequest", {
    requestId: req.id,
    reason: "Correction applied",
    decision: "resolved",
  });
  const count = (await db.collection("learningTelemetry").get()).size;
  await run(fac, "reviewRequest", { requestId: req.id, reason: "Duplicate" });
  assert.equal((await db.collection("learningTelemetry").get()).size, count);
  const history = await run(fac, "requests", { status: "history" });
  assert.ok(history.requests.some((r) => r.id === req.id));
});
test("request pagination makes more than fifty pending requests accessible without duplicates", async () => {
  const refs = [];
  for (let i = 0; i < 55; i++) {
    const ref = db.collection("learningRequests").doc();
    refs.push(ref);
    await ref.set({
      uid: "pagination",
      kind: "correction",
      status: "open",
      reason: "pagination fixture",
    });
  }
  const first = await run(fac, "requests");
  assert.equal(first.requests.length, 50);
  assert.ok(first.nextCursor);
  const second = await run(fac, "requests", { cursor: first.nextCursor });
  assert.ok(second.requests.length >= 5);
  assert.equal(
    new Set([...first.requests, ...second.requests].map((r) => r.id)).size,
    first.requests.length + second.requests.length,
  );
  await Promise.all(refs.map((r) => r.delete()));
});
test("completed removal is tied to the owner request, cannot be faked as a review, and rejects incorrect confirmation", async () => {
  await execute(
    db,
    { uid: "one", email: "one@example.invalid" },
    {
      action: "requestCorrection",
      kind: "erasure",
      reason: "Remove my learning history",
    },
    c,
  );
  const req = (await run(fac, "requests")).requests.find(
    (r) => r.uid === "one" && r.kind === "erasure",
  );
  await assert.rejects(
    run(fac, "reviewRequest", { requestId: req.id, reason: "Claim deleted" }),
    /removal action/,
  );
  await assert.rejects(
    run(fac, "eraseLearner", {
      requestId: req.id,
      uid: "one",
      confirm: "wrong",
      scope: "learning-records",
      reason: "Verified",
    }),
    /Confirm/,
  );
  await assert.rejects(
    run(captain, "eraseLearner", {
      requestId: req.id,
      uid: "one",
      confirm: "one",
      scope: "learning-records",
      reason: "Verified",
    }),
    /Administrator access/,
  );
  await assert.rejects(
    run(fac, "eraseLearner", {
      requestId: req.id,
      uid: "two",
      confirm: "two",
      scope: "learning-records",
      reason: "Verified",
    }),
    /this learner/,
  );
});
test("approved erasure removes certificates and all learner descendants, retains Live data and suppresses old backfill", async () => {
  const live = db.doc("sessions/ERASURE");
  await live.set({ title: "Retained workshop" });
  await live.collection("students").doc("one").set(st);
  const req = (await run(fac, "requests")).requests.find(
    (r) => r.uid === "one" && r.kind === "erasure",
  );
  await db
    .doc("learningCollegeRoster/erasure-pointer")
    .set({ uid: "one", collegeId: "erase-college" });
  await db.doc("learningApiOperations/erasure-operation").set({
    uid: "one",
    requestHash: "retained-replay-digest",
    result: { name: "Remove me" },
  });
  await db
    .doc("learningCreditEventGuards/erasure-event")
    .set({ uid: "one", erased: false });
  await run(fac, "eraseLearner", {
    requestId: req.id,
    uid: "one",
    confirm: "one",
    scope: "learning-records",
    reason: "Owner confirmed scope",
  });
  assert.equal(
    (await db.doc("learningCollegeRoster/erasure-pointer").get()).exists,
    false,
  );
  const tombstone = (
    await db.doc("learningApiOperations/erasure-operation").get()
  ).data();
  assert.deepEqual(
    (await db.doc("learningCreditEventGuards/erasure-event").get()).data(),
    { uid: "one", erased: true },
  );
  assert.equal(tombstone.erased, true);
  assert.equal(tombstone.result, null);
  assert.equal(JSON.stringify(tombstone).includes("Remove me"), false);
  assert.equal((await db.doc("learningLearners/one").get()).exists, false);
  assert.equal(
    (await db.collection("learningLearners/one/workshops").get()).size,
    0,
  );
  assert.equal(
    (await db.collection("learningLearners/one/points").get()).size,
    0,
  );
  assert.equal(
    (
      await db
        .collection("learningCertificates")
        .where("uid", "==", "one")
        .get()
    ).size,
    0,
  );
  assert.equal(
    (await live.collection("students").doc("one").get()).exists,
    true,
  );
  assert.equal(
    (await db.doc("learningPrivacy/one").get()).data().state,
    "erased",
  );
  const request = (await db.doc("learningRequests/" + req.id).get()).data();
  assert.equal(request.resolutionAction, "erased");
  assert.equal(request.email, undefined);
  assert.equal(request.reason, undefined);
  await execute(
    db,
    { uid: "one", email: "one@example.invalid" },
    { action: "profile" },
    c,
  );
  assert.equal((await db.doc("learningLearners/one").get()).exists, false);
  assert.equal(
    await enroll(db, "ERASURE", "one", st, { title: "Retained" }, c, fac),
    false,
  );
  await assert.rejects(
    run(fac, "reviewRequest", {
      requestId: req.id,
      reason: "Reopen",
      decision: "reopen",
    }),
    /cannot be reopened/,
  );
  await run(fac, "eraseLearner", {
    requestId: req.id,
    uid: "one",
    confirm: "one",
    scope: "learning-records",
    reason: "Retry",
  });
});
test("explicit reactivation allows future workshops but does not recreate erased history or points", async () => {
  const actor = {
    uid: "one",
    email: "one@example.invalid",
    name: "Returning learner",
  };
  await execute(db, actor, { action: "reactivate" }, c);
  assert.equal(
    (await db.doc("learningLearners/one").get()).data().learningPoints,
    undefined,
  );
  assert.equal(await enroll(db, "ERASURE", "one", st, {}, c, fac), false);
  await db.doc("sessions/FUTURE").set({ title: "Future workshop" });
  assert.equal(await enroll(db, "FUTURE", "one", st, {}, c, fac), true);
  await assert.rejects(
    run(fac, "restoreCompletion", { uid: "one", sid, reason: "Recreate old" }),
    /requested removal/,
  );
});

test("interrupted removal is recoverable and cannot report completion before deletion succeeds", async () => {
  const actor = { uid: "two", email: "two@example.invalid" };
  await execute(db, actor, { action: "profile", name: "Recovery learner" }, c);
  await execute(
    db,
    actor,
    {
      action: "requestCorrection",
      kind: "erasure",
      reason: "Remove my records",
    },
    c,
  );
  const request = (await run(fac, "requests")).requests.find(
    (r) => r.uid === "two" && r.kind === "erasure",
  );
  const original = db.recursiveDelete.bind(db);
  db.recursiveDelete = async () => {
    throw Error("Injected interrupted removal");
  };
  try {
    await assert.rejects(
      run(fac, "eraseLearner", {
        uid: "two",
        requestId: request.id,
        confirm: "two",
        scope: "learning-records",
        reason: "Owner verified",
      }),
      /Injected interrupted/,
    );
  } finally {
    db.recursiveDelete = original;
  }
  assert.equal(
    (await db.doc("learningPrivacy/two").get()).data().state,
    "erasing",
  );
  assert.equal(
    (await db.doc("learningRequests/" + request.id).get()).data().status,
    "processing",
  );
  const { completeErasure } = await import("../functions/erasure.js");
  assert.equal(await completeErasure(db, "two", { uid: "system" }, c), true);
  assert.equal(
    (await db.doc("learningRequests/" + request.id).get()).data()
      .resolutionAction,
    "erased",
  );
  assert.equal((await db.doc("learningLearners/two").get()).exists, false);
});
test("privacy markers and request history are owner scoped and cannot be forged by clients", async () => {
  const claims = {
    email: "one@example.invalid",
    email_verified: true,
    firebase: { sign_in_provider: "google.com" },
  };
  const owner = env.authenticatedContext("one", claims).firestore(),
    other = env
      .authenticatedContext("outsider", {
        ...claims,
        email: "other@example.invalid",
      })
      .firestore();
  await assertSucceeds(getDoc(doc(owner, "learningPrivacy/one")));
  await assertFails(getDoc(doc(other, "learningPrivacy/one")));
  await assertFails(
    setDoc(doc(owner, "learningPrivacy/one"), {
      state: "active",
      blockedSessions: [],
    }),
  );
  await assertSucceeds(
    getDocs(
      query(collection(owner, "learningRequests"), where("uid", "==", "one")),
    ),
  );
  await assertFails(getDocs(collection(owner, "learningRequests")));
});

test("verified participation with zero correct quiz answers still earns a participation certificate", async () => {
  const code = "LOWQUIZ",
    uid = "zero-score";
  await db
    .doc("sessions/" + code)
    .set({ title: "Participation workshop", workshopDate: "2026-10-08" });
  await db.doc(`sessions/${code}/students/${uid}`).set(st);
  await db
    .doc(`sessions/${code}/quizResults/${uid}`)
    .set({ credits: 0, answers: [] });
  await run(fac, "attendance", {
    sid: code,
    uid,
    status: "attended",
    reason: "Verified participation despite incorrect answers",
  });
  await run(fac, "close", { sid: code });
  const result = await run(fac, "finalize", {
    sid: code,
    uids: [uid],
    reason: "Attended and completed",
  });
  assert.equal(result.results[0].status, "completed");
  const record = (
    await db.doc(`learningLearners/${uid}/workshops/${code}`).get()
  ).data();
  assert.equal(record.personalCredits, 0);
  assert.equal(record.learningPoints, 100);
  assert.equal(
    (await db.doc(`learningCertificates/${record.certificateId}`).get()).data()
      .status,
    "issued",
  );
  const batch = await run(fac, "finalize", {
    sid: code,
    uids: [uid, "missing-student"],
    reason: "Mixed retry batch",
  });
  assert.equal(batch.results.find((r) => r.uid === uid).status, "unchanged");
  assert.equal(
    batch.results.find((r) => r.uid === "missing-student").status,
    "failed",
  );
  assert.equal(
    (await db.doc(`learningLearners/${uid}`).get()).data().learningPoints,
    100,
  );
});
test("administrative controls reject missing reasons, invalid decisions, nonstaff and revoked roles", async () => {
  await assert.rejects(
    run(fac, "updateLearner", { uid: "one", name: "X", reason: "" }),
    /review reason/,
  );
  await assert.rejects(
    run(fac, "reviewRequest", {
      requestId: "missing",
      reason: "X",
      decision: "fake",
    }),
    /valid review decision/,
  );
  await assert.rejects(
    run({ uid: "student", email: "one@example.invalid" }, "updateLearner", {
      uid: "zero-score",
      name: "Tamper",
      reason: "Attempt",
    }),
    /Administrator access/,
  );
  await db.doc("admins/" + fac.email).update({ role: "captain" });
  try {
    await assert.rejects(
      run(fac, "updateLearner", {
        uid: "one",
        name: "Tamper",
        reason: "Attempt",
      }),
      /Administrator access/,
    );
    await assert.rejects(run(fac, "requests"), /Facilitator access/);
  } finally {
    await db.doc("admins/" + fac.email).update({ role: "facilitator" });
  }
});

test("certificate metadata corrections are versioned, reject impossible dates and survive later publication", async () => {
  const code = "LOWQUIZ",
    uid = "zero-score",
    path = `learningLearners/${uid}/workshops/${code}`,
    before = (await db.doc(path).get()).data();
  await assert.rejects(
    run(fac, "correctCertificate", {
      sid: code,
      uid,
      name: "Learner",
      date: "2026-02-31",
      reason: "Checked",
    }),
    /real calendar/,
  );
  await run(fac, "correctCertificate", {
    sid: code,
    uid,
    name: "Verified Learner",
    title: "Verified Workshop",
    date: "2026-10-09",
    reason: "Corrected from workshop schedule",
  });
  const corrected = (await db.doc(path).get()).data();
  assert.notEqual(corrected.certificateId, before.certificateId);
  assert.equal(corrected.title, "Verified Workshop");
  assert.equal(corrected.date, "2026-10-09");
  const result = await run(fac, "finalize", {
    sid: code,
    uids: [uid],
    reason: "Repeated publication",
  });
  assert.equal(result.results[0].status, "unchanged");
  assert.equal(
    (await db.doc(`learningLearners/${uid}`).get()).data().learningPoints,
    100,
  );
});

test("reactivation imports a workshop joined during opt-out without restoring erased sessions", async () => {
  const uid = "two",
    code = "AFTERERASE",
    actor = { uid, email: "two@example.invalid" };
  await db.doc("sessions/" + code).set({ title: "New workshop" });
  await db.doc(`sessions/${code}/students/${uid}`).set(st);
  assert.equal(
    await enroll(db, code, uid, st, { title: "New" }, c, fac),
    false,
  );
  await execute(db, actor, { action: "reactivate" }, c);
  assert.equal(
    (await db.doc(`learningLearners/${uid}/workshops/${code}`).get()).data()
      .status,
    "registered",
  );
  assert.equal(
    (await db.doc(`learningLearners/${uid}/workshops/${sid}`).get()).exists,
    false,
  );
});

test("read API enforces owner/admin privacy and validates OpenAPI responses", async () => {
  const { readApi } = await import("../functions/api.js");
  const { default: Ajv } = await import("ajv/dist/2020.js");
  const spec = JSON.parse(fs.readFileSync("functions/openapi.json", "utf8"));
  const ajv = new Ajv({ strict: false });
  const validate = (name, result) => {
    const schema = {
      ...spec.components.schemas[name],
      $defs: spec.components.schemas,
    };
    const remap = (v) =>
      JSON.parse(
        JSON.stringify(v).replaceAll("#/components/schemas/", "#/$defs/"),
      );
    assert.equal(
      ajv.validate(remap(schema), result),
      true,
      JSON.stringify(ajv.errors),
    );
  };
  const uid = "api-one",
    owner = { uid, email: "api-one@example.invalid" };
  await db.doc(`learningLearners/${uid}`).set({
    name: "API learner",
    email: owner.email,
    privateNote: "never return",
  });
  await db.doc(`learningLearners/${uid}/workshops/API001`).set({
    sid: "API001",
    title: "API workshop",
    status: "completed",
    teamId: "mumbai-1a",
    role: "COO",
    learningPoints: 100,
    personalCredits: 0,
    teamCredits: 250,
    personalQuiz: {
      secret: true,
      0: { answer: 1, correct: false, credits: 0, privateNote: "excluded" },
    },
    personalActivities: ["quiz"],
    revision: 1,
  });
  await db
    .doc(`learningLearners/${uid}/workshops/API002`)
    .set({ sid: "API002", status: "registered" });
  const profile = await readApi(db, owner, "/me");
  validate("Student", profile);
  assert.equal(profile.privateNote, undefined);
  await assert.rejects(
    readApi(
      db,
      { uid: "other", email: "other@example.invalid" },
      `/students/${uid}`,
    ),
    { code: "permission-denied" },
  );
  await assert.rejects(
    readApi(db, captain, `/students/${uid}/scores`, { workshopId: "API001" }),
    { code: "permission-denied" },
  );
  let audited = 0;
  await readApi(db, fac, `/students/${uid}`, {}, async () => audited++);
  assert.equal(audited, 1);
  const first = await readApi(db, owner, "/me/workshops", { limit: "1" });
  validate("Workshop", first.items[0]);
  assert.ok(first.nextCursor);
  const second = await readApi(db, owner, "/me/workshops", {
    limit: "1",
    cursor: first.nextCursor,
  });
  assert.equal(second.items[0].workshopId, "API002");
  assert.equal(second.nextCursor, null);
  const scoreRows = await readApi(db, owner, `/students/${uid}/scores`, {
    workshopId: "API001",
  });
  scoreRows.items.forEach((r) => validate("Score", r));
  assert.equal(scoreRows.items[0].value, 0);
  const submissions = await readApi(db, owner, `/students/${uid}/submissions`, {
    workshopId: "API001",
  });
  validate("Submission", submissions.items[0]);
  assert.equal(submissions.items[0].awardedCredits, 0);
  assert.equal(submissions.items[0].privateNote, undefined);
  const participation = await readApi(
    db,
    owner,
    `/students/${uid}/participation`,
    { workshopId: "API001" },
  );
  validate("Participation", participation.items[0]);
  await db
    .doc(`learningPrivacy/${uid}`)
    .set({ state: "active", blockedSessions: ["API001"] });
  assert.equal((await readApi(db, owner, "/me/workshops")).items.length, 1);
  await assert.rejects(
    readApi(db, owner, `/students/${uid}/scores`, { workshopId: "API001" }),
    { code: "not-found" },
  );
  await db.doc(`learningPrivacy/${uid}`).set({ state: "erasing" });
  await assert.rejects(readApi(db, fac, `/students/${uid}`), {
    code: "not-found",
  });
  await assert.rejects(
    readApi(db, fac, "/students", { email: owner.email }, async () => {
      throw Error("audit unavailable");
    }),
    /audit unavailable/,
  );
});

test("HTTP API and Swagger serve authenticated reads without disclosing private fields", async () => {
  const { apiHandler } = await import("../functions/api-http.js");
  const express = require("express");
  const app = express(),
    uid = "api-http",
    email = "api-http@example.invalid";
  await db
    .doc(`learningLearners/${uid}`)
    .set({ name: "HTTP learner", email, staffNotes: "private" });
  await db
    .doc(`learningLearners/${uid}/workshops/HTTP01`)
    .set({ sid: "HTTP01", status: "completed" });
  await db.doc("sessions/HTTP01").set({
    title: "HTTP workshop",
    workshopDate: "2026-10-08",
    privateKeys: "never return",
  });
  const certId = "11111111-1111-4111-8111-111111111111";
  await db.doc(`learningCertificates/${certId}`).set({
    uid,
    sid: "HTTP01",
    name: "HTTP learner",
    status: "revoked",
    reason: "private review",
    revision: 1,
  });
  const { readApi } = await import("../functions/api.js");
  await assert.rejects(
    readApi(
      db,
      { uid: "stranger", email: "stranger@example.invalid" },
      `/certificates/${certId}`,
    ),
    { code: "not-found" },
  );
  await assert.rejects(
    readApi(
      db,
      { uid: "stranger", email: "stranger@example.invalid" },
      "/certificates/22222222-2222-4222-8222-222222222222",
    ),
    { code: "not-found" },
  );
  app.use(
    apiHandler({
      db,
      auth: {
        verifyIdToken: async (token, revoked) => {
          assert.equal(revoked, true);
          if (token !== "test-id-token") throw Error();
          return {
            uid,
            email,
            email_verified: true,
            firebase: { sign_in_provider: "google.com" },
          };
        },
      },
      rate() {},
      measured: async (_name, _actor, work) => work(c),
      audit: async () => {},
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (path) =>
    fetch(base + path, { headers: { Authorization: "Bearer test-id-token" } });
  try {
    assert.equal((await fetch(base + "/api/v1/me")).status, 401);
    const me = await get("/api/v1/me");
    assert.equal(me.headers.get("cache-control"), "no-store");
    assert.ok(me.headers.get("x-request-id"));
    assert.equal((await me.json()).staffNotes, undefined);
    const metadata = await (await get("/api/v1/workshops/HTTP01")).json();
    assert.equal(metadata.workshopId, "HTTP01");
    assert.equal(metadata.privateKeys, undefined);
    const cert = await (await get(`/api/v1/certificates/${certId}`)).json();
    assert.equal(cert.status, "revoked");
    assert.equal(cert.reason, undefined);
    assert.equal((await get("/api/v1/me?include=private")).status, 400);
    assert.equal(
      (await fetch(base + "/api/v1/me", { method: "POST" })).status,
      405,
    );
    const docs = await fetch(base + "/api/docs");
    assert.match(await docs.text(), /persistAuthorization:false/);
    const css = await fetch(base + "/api/docs/swagger-ui.css");
    assert.equal(css.status, 200);
    assert.match(css.headers.get("content-type"), /css/);
    const bundle = await fetch(base + "/api/docs/swagger-ui-bundle.js");
    assert.equal(bundle.status, 200);
    await bundle.arrayBuffer();
    const spec = await (await fetch(base + "/api/openapi.json")).json();
    assert.equal(spec.openapi, "3.1.0");
    await db.doc(`learningPrivacy/${uid}`).set({ state: "erased" });
    assert.equal((await get(`/api/v1/certificates/${certId}`)).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});

test("admin token lifecycle preserves scopes, resource restrictions, privacy and current authority", async () => {
  const { manageTokens, authenticateApiToken } =
    await import("../functions/api-tokens.js");
  const { readApi } = await import("../functions/api.js");
  const { Timestamp } = require("firebase-admin/firestore");
  const opts = {
    authTime: Date.now() / 1000,
    idempotencyKey: "33333333-3333-4333-8333-333333333333",
  };
  const input = {
    name: "Scoped score reader",
    scopes: ["scores:read", "history:read"],
    studentIds: ["token-one"],
    workshopIds: ["TOKEN01"],
    expiresInDays: 7,
  };
  const manage = (actor, method, id, body, options = opts) =>
    manageTokens(db, actor, method, id, body, {}, c, options);
  await assert.rejects(manage(captain, "POST", null, input), {
    code: "permission-denied",
  });
  await assert.rejects(
    manage({ uid: "student", email: "student@example.invalid" }, "GET", null),
    { code: "permission-denied" },
  );
  await assert.rejects(
    manage(fac, "POST", null, input, {
      ...opts,
      authTime: Date.now() / 1000 - 301,
    }),
    { code: "failed-precondition" },
  );
  await assert.rejects(
    manage(fac, "POST", null, { ...input, scopes: ["admin:write"] }),
    { code: "invalid-argument" },
  );
  const [first, retry] = await Promise.all([
    manage(fac, "POST", null, input),
    manage(fac, "POST", null, input),
  ]);
  const created = first.secret ? first : retry,
    duplicate = first.secret ? retry : first;
  assert.match(created.secret, /^ilapi_/);
  assert.equal(duplicate.secret, null);
  assert.equal(duplicate.alreadyCreated, true);
  const { default: Ajv } = await import("ajv/dist/2020.js");
  const spec = JSON.parse(fs.readFileSync("functions/openapi.json", "utf8"));
  const validateTokenResponse = (method, response) => {
    const schema = {
      ...spec.paths["/admin/api-tokens"][method].responses["200"].content[
        "application/json"
      ].schema,
      $defs: spec.components.schemas,
    };
    const ajv = new Ajv({ strict: false });
    assert.equal(
      ajv.validate(
        JSON.parse(
          JSON.stringify(schema).replaceAll(
            "#/components/schemas/",
            "#/$defs/",
          ),
        ),
        response,
      ),
      true,
      JSON.stringify(ajv.errors),
    );
  };
  validateTokenResponse("post", created);
  validateTokenResponse("post", duplicate);
  const id = created.token.id,
    stored = (await db.doc(`learningApiTokens/${id}`).get()).data();
  assert.equal(stored.secret, undefined);
  assert.notEqual(stored.secretHash, created.secret);
  await assert.rejects(
    manage(fac, "POST", null, { ...input, name: "Changed settings" }),
    { code: "already-exists" },
  );
  const listed = await manage(fac, "GET", null);
  validateTokenResponse("get", listed);
  assert.equal(listed.items.find((t) => t.id === id).secretHash, undefined);
  assert.equal(listed.items.find((t) => t.id === id).requestHash, undefined);
  const auth = {
    getUser: async (uid) => ({
      uid,
      email: fac.email,
      emailVerified: true,
      disabled: false,
      providerData: [{ providerId: "google.com" }],
    }),
  };
  const actor = await authenticateApiToken(db, auth, created.secret);
  await db
    .doc("learningLearners/token-one")
    .set({ name: "Token learner", email: "token-one@example.invalid" });
  for (const sid of ["TOKEN01", "TOKEN02"])
    await db.doc(`learningLearners/token-one/workshops/${sid}`).set({
      sid,
      title: "Token workshop",
      status: "completed",
      personalCredits: 0,
      teamCredits: 250,
      learningPoints: 100,
    });
  assert.equal(
    (await readApi(db, actor, "/students/token-one/workshops")).items.length,
    1,
  );
  const scores = await readApi(db, actor, "/students/token-one/scores", {
    workshopId: "TOKEN01",
  });
  assert.equal(scores.items[0].value, 0);
  await assert.rejects(readApi(db, actor, "/students/token-one"), {
    code: "permission-denied",
  });
  await assert.rejects(
    readApi(db, actor, "/students/other/scores", { workshopId: "TOKEN01" }),
    { code: "not-found" },
  );
  await assert.rejects(
    readApi(db, actor, "/students/token-one/scores", { workshopId: "TOKEN02" }),
    { code: "not-found" },
  );
  await assert.rejects(manage(actor, "POST", null, input), {
    code: "permission-denied",
  });
  await db
    .doc("learningPrivacy/token-one")
    .set({ state: "active", blockedSessions: ["TOKEN01"] });
  assert.equal(
    (await readApi(db, actor, "/students/token-one/workshops")).items.length,
    0,
  );
  await assert.rejects(
    readApi(db, actor, "/students/token-one/scores", { workshopId: "TOKEN01" }),
    { code: "not-found" },
  );
  await assert.rejects(
    authenticateApiToken(db, auth, created.secret.slice(0, -1) + "!"),
    { code: "unauthenticated" },
  );
  await assert.rejects(
    authenticateApiToken(
      db,
      {
        getUser: async () => ({
          ...(await auth.getUser(fac.uid)),
          disabled: true,
        }),
      },
      created.secret,
    ),
    { code: "unauthenticated" },
  );
  await db.doc(`admins/${fac.email}`).delete();
  await assert.rejects(authenticateApiToken(db, auth, created.secret), {
    code: "unauthenticated",
  });
  await db.doc(`admins/${fac.email}`).set({ role: "facilitator" });
  await db
    .doc(`learningApiTokens/${id}`)
    .update({ expiresAt: Timestamp.fromMillis(Date.now() - 1) });
  await assert.rejects(authenticateApiToken(db, auth, created.secret), {
    code: "unauthenticated",
  });
  await db
    .doc(`learningApiTokens/${id}`)
    .update({ expiresAt: Timestamp.fromMillis(Date.now() + 60000) });
  await db
    .doc("admins/second-admin@example.invalid")
    .set({ role: "facilitator" });
  await assert.rejects(
    manage(
      { uid: "second-admin", email: "second-admin@example.invalid" },
      "DELETE",
      id,
    ),
    { code: "not-found" },
  );
  await manage(fac, "DELETE", id);
  await manage(fac, "DELETE", id);
  await assert.rejects(authenticateApiToken(db, auth, created.secret), {
    code: "unauthenticated",
  });
  assert.equal(
    (await manage(fac, "GET", null)).items.find((t) => t.id === id).status,
    "revoked",
  );
  const browserAdmin = env
    .authenticatedContext(fac.uid, {
      email: fac.email,
      email_verified: true,
      firebase: { sign_in_provider: "google.com" },
    })
    .firestore();
  await assertFails(getDoc(doc(browserAdmin, `learningApiTokens/${id}`)));
  await assertFails(
    setDoc(doc(browserAdmin, "learningApiTokens/forged"), {
      scopes: ["admin:write"],
    }),
  );
  await db.doc(`learningApiTokenOwners/${fac.uid}`).set({
    slots: Array.from({ length: 25 }, (_, i) => ({
      id: `quota-${i}`,
      expiresAtMs: Date.now() + 60000,
    })),
  });
  await assert.rejects(
    manage(fac, "POST", null, input, {
      ...opts,
      idempotencyKey: "55555555-5555-4555-8555-555555555555",
    }),
    { code: "resource-exhausted" },
  );
  await db.doc(`learningApiTokenOwners/${fac.uid}`).set({ slots: [] });
  await db
    .doc("learningApiTokens/66666666-6666-4666-8666-666666666666")
    .set({ ...stored, revokedAt: Timestamp.now() });
  const firstPage = await manageTokens(
    db,
    fac,
    "GET",
    null,
    undefined,
    { limit: "1" },
    c,
  );
  assert.ok(firstPage.nextCursor);
  const nextPage = await manageTokens(
    db,
    fac,
    "GET",
    null,
    undefined,
    { limit: "1", cursor: firstPage.nextCursor },
    c,
  );
  assert.notEqual(nextPage.items[0].id, firstPage.items[0].id);
  assert.equal(nextPage.nextCursor, null);
  const events = await db
    .collection("learningTelemetry")
    .where(
      new (require("firebase-admin/firestore").FieldPath)(
        "payload",
        "data",
        "api.token.id",
      ),
      "==",
      id,
    )
    .get();
  assert.equal(
    events.docs.filter(
      (d) => d.data().payload.data["event.name"] === "api-token.created",
    ).length,
    1,
  );
  assert.equal(
    events.docs.filter(
      (d) => d.data().payload.data["event.name"] === "api-token.revoked",
    ).length,
    1,
  );
  assert.ok(
    events.docs.every(
      (d) => !JSON.stringify(d.data()).includes(created.secret),
    ),
  );
});

test("resource catalogs and explicit writes preserve revisions, scopes, retries and privacy", async () => {
  const { writeDomain } = await import("../functions/api-domain-writes.js");
  const { readApi } = await import("../functions/api.js");
  const { randomUUID } = await import("node:crypto");
  const write = (path, body, key = randomUUID(), actor = fac, method = "PUT") =>
    writeDomain(db, actor, method, "/api/v1" + path, body, {}, c, key);
  const read = (path, q = {}, actor = fac) =>
    readApi(db, actor, "/api/v1" + path, q, async () => {});
  await db.doc("learningLearners/catalog-user").set({
    name: "Original",
    email: "catalog@example.invalid",
    learningPoints: 0,
  });
  await db.doc("learningLearners/catalog-user/workshops/CATALOG1").set({
    status: "completed",
    personalCredits: 0,
    teamCredits: 7,
    learningPoints: 3,
  });
  await db.doc("learningEnrollments/CATALOG1").set({ uids: ["catalog-user"] });
  await db.doc("sessions/CATALOG1").set({ title: "Catalog workshop" });
  const key = randomUUID(),
    body = {
      collegeId: "catalog-college",
      name: "College",
      status: "active",
      reason: "Integration setup",
    };
  const first = await write("/colleges", body, key, fac, "POST");
  assert.deepEqual(await write("/colleges", body, key, fac, "POST"), first);
  await assert.rejects(
    write("/colleges", { ...body, name: "Different" }, key, fac, "POST"),
    { code: "already-exists" },
  );
  await assert.rejects(
    write("/colleges/catalog-college", {
      name: "College",
      status: "active",
      expectedVersion: 0,
      reason: "Correction",
    }),
    { code: "failed-precondition" },
  );
  await write("/workshops/CATALOG1/college", {
    collegeId: "catalog-college",
    expectedVersion: 0,
    reason: "Assignment",
  });
  await write(
    "/workshops/CATALOG1/participants/catalog-user/college-membership",
    {
      collegeId: "catalog-college",
      status: "active",
      expectedVersion: 0,
      reason: "Membership correction",
    },
  );
  const roster = await read("/students", {
    collegeId: "catalog-college",
    workshopId: "CATALOG1",
    include: "credits",
  });
  assert.equal(roster.items.length, 1);
  assert.equal(roster.items[0].studentId, "catalog-user");
  assert.equal(roster.items[0].credits[0].value, 0);
  assert.equal(roster.items[0].credits[1].value, 7);
  assert.equal(
    roster.items[0].credits[0].source,
    "InspiredLearning.published-result",
  );
  const firstCollegePage = await read("/colleges", { limit: "1" });
  assert.equal(firstCollegePage.items.length, 1);
  const deniedClient = env
    .authenticatedContext("catalog-user", {
      email: "catalog@example.invalid",
      email_verified: true,
      firebase: { sign_in_provider: "google.com" },
    })
    .firestore();
  await assertFails(
    setDoc(doc(deniedClient, "learningColleges/forged"), { name: "Forged" }),
  );
  const scopedWriter = {
    ...fac,
    apiTokenId: "writer",
    apiScopes: ["memberships:write"],
    apiStudentIds: ["catalog-user"],
    apiWorkshopIds: ["OTHER001"],
  };
  await assert.rejects(
    write(
      "/students/catalog-user/college-membership",
      {
        collegeId: "catalog-college",
        status: "active",
        expectedVersion: 0,
        reason: "Correction",
      },
      randomUUID(),
      scopedWriter,
    ),
    { code: "permission-denied" },
  );
  await assert.rejects(
    write(
      "/workshops/CATALOG1/participants/catalog-user/college-membership",
      {
        collegeId: "catalog-college",
        status: "inactive",
        expectedVersion: 1,
        reason: "Correction",
      },
      randomUUID(),
      scopedWriter,
    ),
    { code: "not-found" },
  );
  const spec = JSON.parse(fs.readFileSync("functions/openapi.json", "utf8"));
  const Ajv = (await import("ajv/dist/2020.js")).default,
    ajv = new Ajv({ strict: false });
  for (const [schemaName, value] of [
    ["Student", roster.items[0]],
    ["ScoreRow", (await read("/workshops/CATALOG1/scores")).items[0]],
    ["College", await read("/colleges/catalog-college")],
    [
      "Membership",
      (await read("/students/catalog-user/college-memberships")).items[0],
    ],
  ]) {
    const schema = {
      ...spec.components.schemas[schemaName],
      $defs: spec.components.schemas,
    };
    assert.equal(
      ajv.validate(
        JSON.parse(
          JSON.stringify(schema).replaceAll(
            "#/components/schemas/",
            "#/$defs/",
          ),
        ),
        value,
      ),
      true,
      JSON.stringify(ajv.errors),
    );
  }

  assert.equal(
    (await read("/students", { email: "catalog@example.invalid" })).items
      .length,
    1,
  );
  assert.equal(
    (await read("/workshops/CATALOG1/participants")).items.length,
    1,
  );
  assert.equal((await read("/workshops/CATALOG1/scores")).items.length, 1);
  assert.deepEqual(
    (await read("/workshops/CATALOG1/participants/catalog-user/scores")).items,
    (await read("/students/catalog-user/scores", { workshopId: "CATALOG1" }))
      .items,
  );
  const token = {
    ...fac,
    apiTokenId: "catalog-token",
    apiScopes: ["students:read"],
    apiStudentIds: [],
    apiWorkshopIds: [],
  };
  await assert.rejects(
    read("/students", { workshopId: "CATALOG1", include: "credits" }, token),
    { code: "permission-denied" },
  );
  await assert.rejects(
    write(
      "/students/catalog-user/profile",
      { name: "Corrected", expectedVersion: 0, reason: "Correction" },
      randomUUID(),
      token,
    ),
    { code: "permission-denied" },
  );
  const profileKey = randomUUID(),
    profileBody = {
      name: "Corrected",
      expectedVersion: 0,
      reason: "Correction",
    };
  await write("/students/catalog-user/profile", profileBody, profileKey);
  assert.deepEqual(
    await write("/students/catalog-user/profile", profileBody, profileKey),
    { studentId: "catalog-user", revision: 1 },
  );
  await assert.rejects(write("/students/catalog-user/profile", profileBody), {
    code: "failed-precondition",
  });
  assert.equal((await read("/students/catalog-user")).profileRevision, 1);
  await db.doc("learningPrivacy/catalog-user").set({ state: "erased" });
  await assert.rejects(
    write("/students/catalog-user/profile", profileBody, profileKey),
    { code: "failed-precondition" },
  );
  assert.equal(
    (
      await read("/students", {
        collegeId: "catalog-college",
        workshopId: "CATALOG1",
      })
    ).items.length,
    0,
  );
  await assert.rejects(
    write(
      "/colleges",
      { ...body, collegeId: "captain-college" },
      randomUUID(),
      captain,
      "POST",
    ),
    { code: "permission-denied" },
  );
});

test("unified credit account spans workshops and activities; publication corrections and reversal apply once", async () => {
  const { finalize } = await import("../functions/finalize.js");
  const { readApi } = await import("../functions/api.js");
  const uid = "credit-student",
    wid = "CREDIT01",
    owner = { uid, email: "credit-owner@example.invalid" };
  await db
    .doc(`learningLearners/${uid}`)
    .set({ name: "Credit learner", email: owner.email, learningPoints: 900 });
  await db
    .doc(`sessions/${wid}`)
    .set({ title: "Credit workshop", completedAt: new Date() });
  await db.doc(`sessions/${wid}/students/${uid}`).set(st);
  await db
    .doc(`sessions/${wid}/learningAttendance/${uid}`)
    .set({ status: "attended" });
  await db
    .doc(`sessions/${wid}/public/leaderboard`)
    .set({ scores: { "mumbai-1a": 1000 } });
  await db.doc(`sessions/${wid}/quizResults/${uid}`).set({ credits: 100 });
  await Promise.all([
    finalize(db, fac, c, wid, uid, "Publish"),
    finalize(db, fac, c, wid, uid, "Publish"),
  ]);
  const own = () => readApi(db, owner, "/me/scores");
  assert.equal((await own()).totalCredits, 1100);
  assert.equal(
    (await db.collection(`learningLearners/${uid}/creditTransactions`).get())
      .size,
    1,
  );
  await db.doc(`learningLearners/${uid}/workshops/CREDIT02`).set({
    status: "completed",
    teamCredits: 200,
    personalCredits: 50,
    learningPoints: 100,
  });
  await db
    .doc(`learningLearners/${uid}/creditEntries/community-earn`)
    .set({ sourceType: "community", delta: 30 });
  await db
    .doc(`learningLearners/${uid}/creditEntries/community-consume`)
    .set({ sourceType: "community", delta: -10 });
  assert.equal((await own()).totalCredits, 1370);
  await db
    .doc(`sessions/${wid}/public/leaderboard`)
    .set({ scores: { "mumbai-1a": 1200 } });
  await Promise.all([
    finalize(db, fac, c, wid, uid, "Score correction"),
    finalize(db, fac, c, wid, uid, "Score correction"),
  ]);
  assert.equal((await own()).totalCredits, 1570);
  assert.equal(
    (
      await db.doc(`learningLearners/${uid}/creditTransactions/${wid}__2`).get()
    ).data().delta,
    200,
  );
  await execute(
    db,
    fac,
    { action: "revoke", sid: wid, uid, reason: "Attendance correction" },
    c,
  );
  assert.equal((await own()).totalCredits, 270);
  await Promise.all([
    execute(
      db,
      fac,
      {
        action: "restoreCompletion",
        sid: wid,
        uid,
        reason: "Verified attendance",
      },
      c,
    ),
    execute(
      db,
      fac,
      {
        action: "restoreCompletion",
        sid: wid,
        uid,
        reason: "Verified attendance",
      },
      c,
    ),
  ]);
  assert.equal((await own()).totalCredits, 1570);
  assert.equal(
    (await db.collection(`learningLearners/${uid}/creditTransactions`).get())
      .size,
    4,
  );
  const actor = {
    ...fac,
    apiTokenId: "credits-reader",
    apiScopes: ["scores:read"],
    apiStudentIds: [uid],
    apiWorkshopIds: [],
  };
  const bulk = await readApi(db, actor, "/students/scores", { limit: "100" });
  assert.equal(bulk.items.length, 1);
  assert.equal(bulk.items[0].totalCredits, 1570);
  await assert.rejects(readApi(db, owner, "/students/scores"), {
    code: "permission-denied",
  });
  await assert.rejects(
    readApi(db, { ...actor, apiWorkshopIds: [wid] }, "/students/scores"),
    { code: "permission-denied" },
  );
  assert.equal(
    (
      await readApi(
        db,
        { ...actor, apiWorkshopIds: [wid] },
        "/students/scores",
        { workshopId: wid },
      )
    ).items[0].totalCredits,
    1300,
  );
  const log = await readApi(db, owner, "/me/credit-transactions", {
    limit: "2",
  });
  assert.equal(log.items.length, 2);
  assert.ok(log.nextCursor);
  assert.equal(log.items[0].reason, undefined);
  await db
    .doc(`learningLearners/${uid}/workshops/CREDIT03`)
    .set({ status: "completed", teamCredits: null, personalCredits: 10 });
  assert.equal((await own()).totalCredits, null);
  assert.equal((await own()).knownCredits, 1570);
  await db
    .doc(`learningPrivacy/${uid}`)
    .set({ state: "active", blockedSessions: ["CREDIT03", "CREDIT02"] });
  assert.equal((await own()).totalCredits, 1320);
  await db.doc(`learningPrivacy/${uid}`).set({ state: "erased" });
  await assert.rejects(own(), { code: "not-found" });
  assert.equal(
    (await readApi(db, actor, "/students/scores", { limit: "100" })).items
      .length,
    0,
  );
});

test("activity credit writes deduplicate events and apply versioned corrections with scope/privacy enforcement", async () => {
  const { writeDomain } = await import("../functions/api-domain-writes.js");
  const { readApi } = await import("../functions/api.js");
  const { randomUUID } = await import("node:crypto");
  const uid = "webhook-credit-student";
  await db.doc(`learningLearners/${uid}`).set({ name: "Webhook learner" });
  const token = {
    ...fac,
    apiTokenId: "credit-writer",
    apiScopes: ["credits:write", "scores:read"],
    apiStudentIds: [uid],
    apiWorkshopIds: [],
  };
  const post = `/students/${uid}/credits`;
  const body = {
    credits: 50,
    sourceId: "community",
    eventId: "event1",
    reason: "Activity completed",
  };
  const write = (method, path, data, actor = token, key = randomUUID()) =>
    writeDomain(db, actor, method, path, data, {}, c, key);
  const receipts = await Promise.all(
    Array.from({ length: 4 }, () => write("POST", post, body)),
  );
  const first = receipts[0];
  receipts.forEach((receipt) => assert.deepEqual(receipt, first));
  assert.deepEqual(
    await write("POST", post, body, { ...token, apiTokenId: "rotated" }),
    first,
  );
  assert.equal((await readApi(db, { uid }, "/me/scores", {})).totalCredits, 50);
  await assert.rejects(write("POST", post, { ...body, credits: 60 }), {
    code: "already-exists",
  });
  const path = `/students/${uid}/credit-contributions/${first.contributionId}`;
  assert.equal((await readApi(db, token, path, {})).revision, 1);
  const key = randomUUID(),
    correction = {
      credits: 80,
      expectedVersion: 1,
      reason: "Correct activity award",
    };
  const changed = await write("PUT", path, correction, token, key);
  assert.equal(changed.delta, 30);
  assert.deepEqual(await write("PUT", path, correction, token, key), changed);
  await assert.rejects(write("PUT", path, correction), {
    code: "failed-precondition",
  });
  await write("POST", post, { ...body, eventId: "event2", credits: -20 });
  assert.equal((await readApi(db, { uid }, "/me/scores", {})).totalCredits, 60);
  assert.equal(
    (await db.collection(`learningLearners/${uid}/creditEntries`).get()).size,
    3,
  );
  await assert.rejects(
    write("POST", post, body, { ...token, apiScopes: ["scores:read"] }),
    { code: "permission-denied" },
  );
  await assert.rejects(
    write("POST", post, body, { ...token, apiWorkshopIds: ["LEARN001"] }),
    { code: "permission-denied" },
  );
  await assert.rejects(write("POST", post, { ...body, credits: 0.5 }), {
    code: "invalid-argument",
  });
  await assert.rejects(write("POST", post, { ...body, learningPoints: 100 }), {
    code: "invalid-argument",
  });
  await db.doc(`learningPrivacy/${uid}`).set({ state: "erased" });
  await assert.rejects(write("POST", post, body), {
    code: "failed-precondition",
  });
  await db.doc(`learningPrivacy/${uid}`).set({ state: "active" });
  const { createHash } = await import("node:crypto");
  const guardId = createHash("sha256")
    .update(JSON.stringify([uid, first.contributionId]))
    .digest("hex");
  await db
    .doc(`learningCreditEventGuards/${guardId}`)
    .set({ uid, erased: true });
  await db
    .doc(`learningLearners/${uid}/creditContributions/${first.contributionId}`)
    .delete();
  await assert.rejects(
    write("POST", post, body, { ...token, apiTokenId: "fresh-credential" }),
    { code: "failed-precondition" },
  );
  const batch = db.batch();
  for (let i = 0; i < 497; i++)
    batch.set(db.doc(`learningLearners/${uid}/creditEntries/capacity-${i}`), {
      delta: 0,
    });
  await batch.commit();
  await assert.rejects(write("POST", post, { ...body, eventId: "capacity" }), {
    code: "resource-exhausted",
  });
});
