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
  await run(fac, "eraseLearner", {
    requestId: req.id,
    uid: "one",
    confirm: "one",
    scope: "learning-records",
    reason: "Owner confirmed scope",
  });
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
