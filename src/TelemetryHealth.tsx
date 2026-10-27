import { useEffect, useRef, useState } from "react";
import { apiFetch } from "./api";
import { Message } from "./components";
import { errorMessage } from "./observability";
interface Health {
  pending: number;
  failed: number;
  delivered: number;
  oldestPendingAgeSeconds: number | null;
  oldestPendingAgeComplete: boolean;
  asOf: string;
}
interface EventRow {
  id: string;
  status: string;
  eventId: string | null;
  eventName: string | null;
  attempts: number;
  lastStatus: number | null;
}
interface EventPage {
  items: EventRow[];
  nextCursor: string | null;
}
export default function TelemetryHealth() {
  const generation = useRef(0),
    retries = useRef(new Map<string, { key: string; body: string }>());
  const [health, setHealth] = useState<Health | null>(null),
    [rows, setRows] = useState<EventRow[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function load(next?: string) {
    const current = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const [h, p] = await Promise.all([
        apiFetch<Health>("/api/v1/admin/telemetry/health"),
        apiFetch<EventPage>(
          "/api/v1/admin/telemetry/events?status=failed" +
            (next ? `&cursor=${encodeURIComponent(next)}` : ""),
        ),
      ]);
      if (generation.current !== current) return;
      setHealth(h);
      setRows((old) => (next ? [...old, ...p.items] : p.items));
      setCursor(p.nextCursor);
    } catch (e) {
      if (generation.current === current) setError(errorMessage(e));
    } finally {
      if (generation.current === current) setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    const requestGeneration = generation;
    void Promise.resolve().then(() => {
      if (active) void load();
    });
    return () => {
      active = false;
      requestGeneration.current++;
    };
  }, []);
  async function redrive(row: EventRow) {
    if (
      !reason.trim() ||
      !window.confirm(
        "Queue this failed event for another delivery attempt? The original event ID and payload will stay unchanged.",
      )
    )
      return;
    const current = ++generation.current;
    const attempt = retries.current.get(row.id) || {
      key: crypto.randomUUID(),
      body: JSON.stringify({ reason, expectedAttempts: row.attempts }),
    };
    retries.current.set(row.id, attempt);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiFetch(
        `/api/v1/admin/telemetry/events/${encodeURIComponent(row.id)}/redrive`,
        {
          method: "POST",
          headers: { "Idempotency-Key": attempt.key },
          body: attempt.body,
        },
      );
      if (generation.current !== current) return;
      retries.current.delete(row.id);
      setNotice(
        "Event queued. Scheduled delivery retries it within five minutes; queued does not mean accepted by Dynatrace.",
      );
      setReason("");
      await load();
    } catch (e) {
      if (generation.current === current) {
        setError(errorMessage(e));
        setNotice(
          "Retrying this event reuses the original review reason and request key. Refresh to check whether it was already queued.",
        );
      }
    } finally {
      if (generation.current === current) setBusy(false);
    }
  }
  return (
    <section className="panel stack">
      <h2>Telemetry delivery health</h2>
      <p>
        Server-confirmed events awaiting delivery. Counts are operational
        observations; no learner payloads are shown.
      </p>
      {health && (
        <>
          <p>
            Pending: {health.pending} · Failed: {health.failed} · Delivered:{" "}
            {health.delivered}
          </p>
          <p>
            Oldest pending age:{" "}
            {health.oldestPendingAgeSeconds === null
              ? "Unavailable above the bounded sample"
              : `${Math.round(health.oldestPendingAgeSeconds)} seconds`}
          </p>
          <small>Observed {new Date(health.asOf).toLocaleString()}</small>
        </>
      )}
      <button
        className="button secondary"
        disabled={busy}
        onClick={() => void load()}
      >
        Refresh delivery health
      </button>
      {error && <Message error>{error}</Message>}
      {notice && <Message>{notice}</Message>}
      <label>
        Redrive review reason
        <input
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {rows.map((row) => (
        <article key={row.id}>
          <strong>{row.eventName || "Unnamed event"}</strong>
          <p>
            {row.attempts} attempts ·{" "}
            {row.lastStatus ? `HTTP ${row.lastStatus}` : "No HTTP response"}
          </p>
          <button
            className="button secondary"
            disabled={busy || !reason.trim()}
            onClick={() => void redrive(row)}
          >
            Redrive failed event
          </button>
        </article>
      ))}
      {!busy && !rows.length && <p>No failed deliveries.</p>}
      {cursor && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void load(cursor)}
        >
          Load more failed events
        </button>
      )}
    </section>
  );
}
