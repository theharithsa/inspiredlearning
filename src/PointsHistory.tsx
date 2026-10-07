import { useRows } from "./hooks";
import { Link } from "react-router-dom";
export default function PointsHistory({ uid }: { uid: string }) {
  const { rows, error } = useRows<{
    sid: string;
    delta: number;
    reason: string;
    at?: { seconds: number };
  }>(`learningLearners/${uid}/points`);
  return (
    <section className="panel">
      <span className="eyebrow">LEARNING POINTS</span>
      <h2>Earned, not estimated.</h2>
      <p>
        Each verified workshop completion adds 100 points once. Revoked
        completions reverse that award.
      </p>
      {error ? (
        <p role="alert">{error}</p>
      ) : rows === undefined ? (
        <p role="status">Loading points history…</p>
      ) : rows.length ? (
        rows
          .slice()
          .sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0))
          .map((r) => (
            <div className="result-row" key={r.id}>
              <span>
                <Link to={"/workshops/" + r.sid}>{r.sid}</Link> · {r.reason}
              </span>
              <strong>
                {r.delta > 0 ? "+" : ""}
                {r.delta}
              </strong>
            </div>
          ))
      ) : (
        <p className="muted">No learning points awarded yet.</p>
      )}
    </section>
  );
}
