import { createHash } from "node:crypto";
export function recipientAwards(awards, uid, student) {
  return [
    ...new Set(
      (awards || [])
        .filter((a) => {
          if (!a || typeof a.title !== "string" || !a.title.trim())
            return false;
          // A regional champion is a winning team, not every team in the region.
          if (a.scope === "team" || a.scope === "region")
            return Boolean(a.teamId) && a.teamId === student.teamId;
          return a.uid === uid;
        })
        .map((a) => a.title.trim()),
    ),
  ].sort();
}
export function awardCertificateId(parentId, title) {
  const h = createHash("sha256")
    .update(JSON.stringify([parentId, title]))
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export const certificateKind = (c) =>
  c.kind === "award" ? "award" : "participation";
export async function readAwardFamily(tx, db, result) {
  if (!result?.certificateId) return [];
  const docs = await Promise.all(
    (result.awards || []).map((title) =>
      tx.get(
        db.doc(
          `learningCertificates/${awardCertificateId(result.certificateId, title)}`,
        ),
      ),
    ),
  );
  return docs.filter((d) => d.exists);
}
export function revokeAwardFamily(tx, docs, revokedAt, reason) {
  for (const d of docs)
    if (d.data().status === "issued")
      tx.update(d.ref, { status: "revoked", revokedAt, reason });
}
export function issueAwardFamily(tx, db, parent) {
  for (const awardTitle of [...new Set(parent.awards || [])]) {
    const id = awardCertificateId(parent.id, awardTitle);
    tx.create(db.doc(`learningCertificates/${id}`), {
      ...parent,
      id,
      kind: "award",
      awardTitle,
      parentCertificateId: parent.id,
      public: false,
    });
  }
}
