import { useRows } from "./hooks";
import { Message } from "./components";
interface Request {
  id: string;
  kind: string;
  status: string;
  reason?: string;
  resolution?: string;
  createdAt?: { seconds: number };
  resolvedAt?: { seconds: number };
}
export default function RequestHistory({ uid }: { uid: string }) {
  const { rows, error } = useRows<Request>(`learningRequests`, [
    ["uid", "==", uid],
  ]);
  return (
    <section className="panel stack">
      <h2>Your requests</h2>
      {error && <Message error>{error}</Message>}
      {rows === undefined ? (
        <p role="status">Loading your requests…</p>
      ) : !rows.length ? (
        <p>No account requests yet.</p>
      ) : (
        rows
          .slice()
          .sort(
            (a, b) =>
              (b.resolvedAt?.seconds || b.createdAt?.seconds || 0) -
              (a.resolvedAt?.seconds || a.createdAt?.seconds || 0),
          )
          .map((r) => (
            <article className="panel" key={r.id}>
              <strong>
                {r.kind === "erasure"
                  ? "Learning-record removal"
                  : "Record correction"}{" "}
                · {r.status}
              </strong>
              {r.reason && <p>{r.reason}</p>}
              {r.resolution && <p>{r.resolution}</p>}
            </article>
          ))
      )}
    </section>
  );
}
