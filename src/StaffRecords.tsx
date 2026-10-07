import { useEffect, useState } from "react";
import { action, errorMessage } from "./observability";
import { Message } from "./components";
import { statusLabel } from "./constants";
interface Request {
  id: string;
  uid: string;
  email: string;
  reason: string;
  kind: string;
}
interface Lookup {
  uid: string;
  name: string;
  email: string | null;
  workshops: {
    sid: string;
    title: string;
    name: string;
    status: string;
    revision: number;
  }[];
}
export default function StaffRecords() {
  const [requests, setRequests] = useState<Request[]>([]),
    [reference, setReference] = useState(""),
    [lookup, setLookup] = useState<Lookup | null>(null),
    [name, setName] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    void action<{ requests: Request[] }>("requests")
      .then((r) => {
        if (active) setRequests(r.requests);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  async function load(ref = reference) {
    setBusy(true);
    setError("");
    try {
      setLookup(await action<Lookup>("lookup", { reference: ref.trim() }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function run(work: () => Promise<{ message?: string }>) {
    setBusy(true);
    setError("");
    try {
      const r = await work();
      setNotice(r.message || "Reviewed.");
      setRequests((await action<{ requests: Request[] }>("requests")).requests);
      if (lookup)
        setLookup(await action<Lookup>("lookup", { reference: lookup.uid }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel stack">
      <span className="eyebrow">PERMANENT RECORDS & REQUESTS</span>
      <h2>Support beyond the live session.</h2>
      {error && <Message error>{error}</Message>}
      {notice && <Message>{notice}</Message>}
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label>
          Learner account reference or certificate ID
          <input
            value={reference}
            required
            onChange={(e) => setReference(e.target.value)}
          />
        </label>
        <button className="button secondary" disabled={busy}>
          Find record
        </button>
      </form>
      <label>
        Review / correction note
        <textarea
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {lookup && (
        <div>
          <h3>
            {lookup.name} · {lookup.email}
          </h3>
          <label>
            Verified certificate name
            <input
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {lookup.workshops.map((w) => (
            <div className="panel" key={w.sid}>
              <h3>{w.title}</h3>
              <p>
                {w.sid} · {w.name} · {statusLabel(w.status)} · v{w.revision}
              </p>
              {w.status === "completed" && (
                <div className="staff-actions">
                  <button
                    className="button secondary"
                    disabled={busy || !name.trim() || !reason.trim()}
                    onClick={() =>
                      run(() =>
                        action("correctCertificate", {
                          uid: lookup.uid,
                          sid: w.sid,
                          name,
                          reason,
                        }),
                      )
                    }
                  >
                    Correct certificate name
                  </button>
                  <button
                    className="text-button danger"
                    disabled={busy || !reason.trim()}
                    onClick={() => {
                      if (
                        confirm(
                          "Revoke completion, its certificate and 100 learning points?",
                        )
                      )
                        void run(() =>
                          action("revoke", {
                            uid: lookup.uid,
                            sid: w.sid,
                            reason,
                          }),
                        );
                    }}
                  >
                    Revoke archived completion
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <h3>Pending account requests</h3>
      {!requests.length ? (
        <p className="muted">No pending requests.</p>
      ) : (
        requests.map((r) => (
          <article className="panel" key={r.id}>
            <strong>
              {r.email} · {r.kind}
            </strong>
            <p>{r.reason}</p>
            <small>Account reference: {r.uid}</small>
            <div className="staff-actions">
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setReference(r.uid);
                  void load(r.uid);
                }}
              >
                Open learner records
              </button>
              <button
                className="button secondary"
                disabled={busy || !reason.trim()}
                onClick={() => {
                  if (
                    confirm(
                      "Have you completed the requested correction or removal? This button only records your review.",
                    )
                  )
                    void run(() =>
                      action("reviewRequest", { requestId: r.id, reason }),
                    );
                }}
              >
                Mark reviewed
              </button>
            </div>
          </article>
        ))
      )}
      <p className="muted">
        Corrections and revocation work even after a live session is deleted.
        Removal requests need the documented staff removal procedure; marking a
        request reviewed does not erase records.
      </p>
    </section>
  );
}
