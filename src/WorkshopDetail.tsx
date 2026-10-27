import { auth } from "./firebase";
import { useRecord } from "./hooks";
import { workshopCredits } from "./credits";
import { activityLabel, statusLabel } from "./constants";
import { Link, useParams } from "react-router-dom";
import { useEffect } from "react";
import type { Workshop } from "./types";
import { Empty } from "./components";
import { interaction } from "./observability";
import { SURVEY_TOPICS } from "./surveyTopics";
export default function WorkshopDetail() {
  const { sid } = useParams();
  const path =
    auth.currentUser && /^[A-Za-z0-9-]{4,16}$/.test(sid || "")
      ? `learningLearners/${auth.currentUser.uid}/workshops/${sid}`
      : null;
  const w = useRecord<Workshop>(path);
  useEffect(() => interaction("workshop.viewed", sid), [sid]);
  if (path && w === undefined)
    return <p role="status">Loading your workshop…</p>;
  if (!w)
    return (
      <Empty title="Workshop not found">
        This account has no participation record for that workshop.
      </Empty>
    );
  return (
    <>
      <Link className="back" to="/">
        ← My learning
      </Link>
      <header className="page-heading compact">
        <span className="eyebrow">
          {w.date || "WORKSHOP RECORD"} · {w.sid}
        </span>
        <h1>{w.title}</h1>
        <p>
          {w.teamId} · {w.role} ·{" "}
          <span className="badge">{statusLabel(w.status)}</span>
        </p>
      </header>
      {w.status !== "completed" ? (
        <div className="panel">
          <h2>{statusLabel(w.status)}</h2>
          <p>
            {w.status === "completion-pending"
              ? "Your attendance is recorded. The facilitator will publish your final results and certificate."
              : w.status === "revoked"
                ? "This completion was revoked. Contact your facilitator if you need a correction."
                : "Your account is linked to this workshop. Attendance and completion are verified by workshop staff."}
          </p>
        </div>
      ) : (
        <>
          <section className="panel">
            <h2>{workshopCredits(w) ?? "Unknown"} credits awarded to you</h2>
            <p>
              Your final team score plus your individual credits. Individual
              credits count again as an attendance benefit.
            </p>
          </section>
          <div className="stats">
            <div>
              <span>Personally earned quiz credits</span>
              <strong>{w.personalCredits ?? "—"}</strong>
              <small>Cloud or Not individual quiz</small>
            </div>
            <div>
              <span>Final team credits</span>
              <strong>{w.teamCredits ?? "—"}</strong>
              <small>Shared team score, including opening credits</small>
            </div>
            <div>
              <span>Team position</span>
              <strong>{w.teamRank ? "#" + w.teamRank : "—"}</strong>
              <small>Equal scores share a position</small>
            </div>
          </div>
          <div className="split">
            <section className="panel">
              <h2>Your participation</h2>
              <h3>Individual activities</h3>
              {w.personalActivities?.length ? (
                <ul>
                  {w.personalActivities.map((a) => (
                    <li key={a}>{activityLabel(a)}</li>
                  ))}
                </ul>
              ) : (
                <p>No individual activity summary was available.</p>
              )}
              <h3>Team collaboration</h3>
              {w.teamActivities?.length ? (
                <ul>
                  {w.teamActivities.map((a) => (
                    <li key={a}>{activityLabel(a)}</li>
                  ))}
                </ul>
              ) : (
                <p>No team activity summary was available.</p>
              )}
              <p className="muted">
                Team activity credits contribute to the final team score
                included in your workshop award.
              </p>
            </section>
            <section className="panel">
              <h2>Quiz results</h2>
              {w.personalQuiz ? (
                Object.entries(w.personalQuiz).map(([q, r]) => (
                  <div className="result-row" key={q}>
                    <span>Question {Number(q) + 1}</span>
                    <span>
                      {r.correct ? "Correct" : "Incorrect / unanswered"} ·{" "}
                      {r.credits} credits
                    </span>
                  </div>
                ))
              ) : (
                <p>
                  Detailed individual quiz results were not available for this
                  workshop.
                </p>
              )}
              <h3>Networking</h3>
              <p>
                {w.networking?.length
                  ? w.networking.map(activityLabel).join(" · ")
                  : "No networking steps recorded."}
              </p>
            </section>
          </div>
          {w.surveyPre && w.surveyPost && (
            <section className="panel">
              <h2>Your confidence, before and after</h2>
              <p className="muted">
                Self-reported ratings out of five. These are reflections, not
                exam scores.
              </p>
              <div className="confidence-grid">
                {Object.keys(w.surveyPre)
                  .filter((k) => w.surveyPost?.[k] !== undefined)
                  .map((k) => (
                    <div key={k}>
                      <span>{SURVEY_TOPICS[Number(k.slice(1))] || k}</span>
                      <strong>
                        {w.surveyPre?.[k]} → {w.surveyPost?.[k]}
                      </strong>
                    </div>
                  ))}
              </div>
            </section>
          )}
          <section className="panel certificate-summary">
            <div>
              <span className="eyebrow">VERIFIED PARTICIPATION</span>
              <h2>Your work, recognised.</h2>
              <p>
                {workshopCredits(w) ?? "Unknown"} credits · Result revision{" "}
                {w.revision}
              </p>
              {w.awards?.map((a) => (
                <span className="badge" key={a}>
                  {a}
                </span>
              ))}
            </div>
            {w.certificateId && (
              <Link className="button" to="/certificates">
                View certificate →
              </Link>
            )}
          </section>
        </>
      )}
    </>
  );
}
