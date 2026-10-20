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

test("approved signature is configured and embedded in participation and award PDFs", async () => {
  const { certificatePdf, certificateRendering } = await import(
    "../functions/pdf.js"
  );
  const { createRequire } = await import("node:module");
  const require = createRequire(
    new URL("../functions/package.json", import.meta.url),
  );
  const { PDFDocument, PDFName } = require("pdf-lib");
  assert.equal(certificateRendering().signatureConfigured, true);
  for (const kind of ["participation", "award"]) {
    const bytes = await certificatePdf({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Test Learner",
      title: "Test Workshop",
      date: "2026-10-01",
      revision: 1,
      status: "issued",
      kind,
      awardTitle: "Best CTO",
    });
    const pdf = await PDFDocument.load(bytes);
    const images = pdf
      .getPage(0)
      .node.Resources()
      .lookup(PDFName.of("XObject"));
    assert.ok(
      images.entries().length >= 2,
      "Signature and verification QR must both be embedded",
    );
  }
});
