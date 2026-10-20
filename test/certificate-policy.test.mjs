import { test } from "node:test";
import assert from "node:assert/strict";
import {
  recipientAwards,
  awardCertificateId,
} from "../functions/certificate-policy.js";
import { validCertificate } from "../functions/model.js";
test("scoped recognition reaches winning teammates and only the named role recipient", () => {
  const awards = [
    {
      uid: "representative",
      scope: "team",
      teamId: "mumbai-1a",
      title: "Best Team",
    },
    { scope: "region", teamId: "mumbai-1a", title: "Regional Champion" },
    { uid: "one", title: "Best COO" },
  ];
  assert.deepEqual(recipientAwards(awards, "one", { teamId: "mumbai-1a" }), [
    "Best COO",
    "Best Team",
    "Regional Champion",
  ]);
  assert.deepEqual(recipientAwards(awards, "two", { teamId: "mumbai-1a" }), [
    "Best Team",
    "Regional Champion",
  ]);
  assert.deepEqual(
    recipientAwards(awards, "three", { teamId: "mumbai-1b" }),
    [],
  );
  assert.deepEqual(
    recipientAwards(
      [{ scope: "team", uid: "one", title: "Invalid" }],
      "one",
      {},
    ),
    [],
  );
});
test("award certificate identity is stable per parent and recognition", () => {
  const id = awardCertificateId("parent", "Best Team");
  assert.ok(validCertificate(id));
  assert.equal(id, awardCertificateId("parent", "Best Team"));
  assert.notEqual(id, awardCertificateId("other", "Best Team"));
  assert.notEqual(id, awardCertificateId("parent", "Best CTO"));
});
