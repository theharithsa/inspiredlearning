import { createHash } from "node:crypto";
export const LEARNING_POINTS = 100;
export const regionFor = (team) =>
  ({ mumbai: "west", chennai: "south", pune: "central", delhi: "north" })[
    String(team).split("-")[0]
  ] || null;
export const validSid = (s) =>
  typeof s === "string" && /^[A-Z0-9-]{4,16}$/.test(s);
export const validUid = (s) =>
  typeof s === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(s);
export const validCertificate = (s) =>
  typeof s === "string" && /^[0-9a-f-]{36}$/.test(s);
const clean = (o) => JSON.parse(JSON.stringify(o));
export function resultSnapshot(
  sid,
  uid,
  session,
  student,
  board,
  quiz,
  submissions,
  networking,
  awards,
) {
  const own = submissions.filter(
    (s) => s.uid === uid && s.scope === "individual",
  );
  const team = submissions.filter(
    (s) => s.teamId === student.teamId && s.scope === "team",
  );
  const scores = board.scores || {};
  const score = Number.isFinite(scores[student.teamId])
    ? scores[student.teamId]
    : null;
  const rank =
    score === null
      ? null
      : 1 +
        Object.values(scores).filter((v) => Number.isFinite(v) && v > score)
          .length;
  const ratings = (stage) => {
    const values = own.find((s) => s.activity === stage)?.values;
    return values
      ? Object.fromEntries(
          Object.entries(values).filter(
            ([k, v]) =>
              /^c[0-9]$/.test(k) && Number.isFinite(v) && v >= 0 && v <= 5,
          ),
        )
      : null;
  };
  return clean({
    sid,
    uid,
    title: session.title || "ChaiCart Cloud Workshop",
    date: session.workshopDate || null,
    name: student.name,
    teamId: student.teamId,
    role: student.role,
    personalCredits: Number.isFinite(quiz?.credits) ? quiz.credits : null,
    personalQuiz: quiz?.answers || quiz?.questions || null,
    teamCredits: score,
    teamRank: rank,
    personalActivities: [...new Set(own.map((s) => s.activity))].sort(),
    teamActivities: [...new Set(team.map((s) => s.activity))].sort(),
    networking: networking?.completed || [],
    surveyPre: ratings("survey-pre"),
    surveyPost: ratings("survey-post"),
    awards: (awards || []).filter((a) => a.uid === uid).map((a) => a.title),
    pointsPolicy: "verified-completion-v1",
  });
}
const resultKeys = [
  "sid",
  "uid",
  "title",
  "date",
  "name",
  "teamId",
  "role",
  "personalCredits",
  "personalQuiz",
  "teamCredits",
  "teamRank",
  "personalActivities",
  "teamActivities",
  "networking",
  "surveyPre",
  "surveyPost",
  "awards",
  "pointsPolicy",
];
export function fingerprint(result) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        Object.fromEntries(resultKeys.map((k) => [k, result[k] ?? null])),
      ),
    )
    .digest("hex");
}
export function publicCertificate(c) {
  if (!c || !c.public) return { status: "private-or-unavailable" };
  return {
    status: c.status === "issued" ? "valid" : "revoked",
    id: c.id,
    name: c.name,
    title: c.title,
    date: c.date,
    revision: c.revision,
    issuedAt: c.issuedAt?.toDate?.().toISOString() || null,
  };
}
export function pointsTransition(previous, next) {
  const before = previous?.status === "completed" ? LEARNING_POINTS : 0;
  const after = next === "completed" ? LEARNING_POINTS : 0;
  return after - before;
}
