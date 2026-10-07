import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resultSnapshot,
  fingerprint,
  pointsTransition,
  publicCertificate,
  validSid,
  regionFor,
} from "../functions/model.js";
test("personal and shared results remain distinct; missing values are not fabricated", () => {
  const r = resultSnapshot(
    "WORKSHOP",
    "one",
    { title: "Cloud workshop", workshopDate: "2026-10-08" },
    { name: "Learner", teamId: "mumbai-1a", role: "COO" },
    { scores: { "mumbai-1a": 1500, "mumbai-1b": 1500, "delhi-1a": 1800 } },
    { credits: 100, answers: { 0: { correct: true, credits: 100 } } },
    [
      {
        uid: "one",
        scope: "individual",
        activity: "survey-pre",
        values: { c0: 2, hope: "private text" },
      },
      {
        uid: "other",
        scope: "team",
        teamId: "mumbai-1a",
        activity: "architecture",
      },
    ],
    null,
    [],
  );
  assert.equal(r.personalCredits, 100);
  assert.equal(r.teamCredits, 1500);
  assert.equal(r.teamRank, 2);
  assert.deepEqual(r.teamActivities, ["architecture"]);
  assert.deepEqual(r.surveyPre, { c0: 2 });
  assert.ok(!JSON.stringify(r).includes("private text"));
  assert.equal(fingerprint(r), fingerprint(r));
  const empty = resultSnapshot(
    "WORKSHOP",
    "one",
    {},
    { name: "Learner", teamId: "mumbai-1a", role: "COO" },
    {},
    null,
    [],
    null,
    [],
  );
  assert.equal(empty.personalCredits, null);
  assert.equal(empty.teamCredits, null);
});
test("completion and revocation award once; points never equal the team score", () => {
  assert.equal(pointsTransition(null, "completed"), 100);
  assert.equal(pointsTransition({ status: "completed" }, "completed"), 0);
  assert.equal(pointsTransition({ status: "completed" }, "revoked"), -100);
  assert.equal(pointsTransition({ status: "revoked" }, "completed"), 100);
});
test("public verification is opt-in and contains no email, UID or scores", () => {
  assert.deepEqual(publicCertificate({ public: false, name: "Hidden" }), {
    status: "private-or-unavailable",
  });
  const c = publicCertificate({
    public: true,
    id: "id",
    uid: "private",
    email: "learner@example.invalid",
    status: "issued",
    name: "Learner",
    title: "Workshop",
    date: "2026-10-08",
    revision: 1,
  });
  assert.equal(c.status, "valid");
  assert.ok(!("uid" in c));
  assert.ok(!("email" in c));
  assert.equal(
    publicCertificate({ public: true, status: "revoked" }).status,
    "revoked",
  );
});
test("session and region identifiers are bounded", () => {
  assert.equal(validSid("../admins"), false);
  assert.equal(validSid("WORKSHOP01"), true);
  assert.equal(regionFor("mumbai-1a"), "west");
});
