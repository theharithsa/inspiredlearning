import { useRows } from "./hooks";
import { Link } from "react-router-dom";
import type { Workshop } from "./types";
export default function PointsHistory({
  uid,
  workshops,
}: {
  uid: string;
  workshops?: Workshop[];
}) {
  const { rows, error, hasMore, loadMore } = useRows<{
    workshopId: string;
    delta: number | null;
    reason: string;
    at?: { seconds: number };
  }>(`learningLearners/${uid}/creditTransactions`);
  return (
    <section className="panel">
      <span className="eyebrow">CREDIT ADJUSTMENTS</span>
      <h2>Your credit history.</h2>
      <p>
        Published workshops award the final team score plus your individual
        credits. Corrections adjust the award; revocations reverse it. Existing
        historical awards are included in your total even if they predate this
        adjustment log.
      </p>
      {error ? (
        <p role="alert">{error}</p>
      ) : rows === undefined ? (
        <p role="status">Loading credit history…</p>
      ) : rows.length ? (
        rows
          .slice()
          .sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0))
          .map((r) => (
            <div className="result-row" key={r.id}>
              <span>
                {r.workshopId ? (
                  <Link to={"/workshops/" + r.workshopId}>
                    {workshops?.find((w) => w.sid === r.workshopId)?.title ||
                      r.workshopId}
                  </Link>
                ) : (
                  "Community contribution"
                )}{" "}
                · {r.reason}
              </span>
              <strong>
                {r.delta !== null && r.delta > 0 ? "+" : ""}
                {r.delta ?? "Unknown"}
              </strong>
            </div>
          ))
      ) : (
        <p className="muted">No credit adjustments recorded yet.</p>
      )}
      {hasMore && (
        <button className="button secondary" onClick={loadMore}>
          Load more records
        </button>
      )}
    </section>
  );
}
