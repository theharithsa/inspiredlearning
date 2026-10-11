import { createHash } from "node:crypto";
export const validCollege = (value) =>
  typeof value === "string" && /^[a-z0-9][a-z0-9-]{1,63}$/.test(value);
export const rosterId = (collegeId, uid) =>
  createHash("sha256")
    .update(JSON.stringify([collegeId, uid]))
    .digest("hex");
export async function collegeFor(db, uid, workshopId = "institutional") {
  const r = (
    await db
      .doc(`learningLearners/${uid}/collegeMemberships/${workshopId}`)
      .get()
  ).data();
  return r?.status === "active" ? r.collegeId : null;
}
