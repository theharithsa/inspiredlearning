import ApiTokens from "./ApiTokens";
import StaffRecords from "./StaffRecords";
import { statusLabel } from "./constants";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { action, errorMessage } from "./observability";
import type { Roster } from "./types";
import { Message } from "./components";
export default function Staff({ admin = false }: { admin?: boolean }) {
  const [params] = useSearchParams();
  const [globalFacilitator, setGlobalFacilitator] = useState(false);
  useEffect(() => {
    let active = true;
    void action<{ facilitator: boolean }>("access")
      .then((r) => {
        if (active) setGlobalFacilitator(r.facilitator);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const [sid, setSid] = useState(params.get("session") || ""),
    [roster, setRoster] = useState<Roster | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  async function load(code = sid) {
    setBusy(true);
    setError("");
    try {
      const r = await action<Roster>("roster", {
        sid: code.trim().toUpperCase(),
      });
      setRoster(r);
      setSelected([]);
    } catch (e) {
      setRoster(null);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function run(work: () => Promise<any>) {
    setBusy(true);
    setError("");
    try {
      const result = await work();
      setMessage(result.message || "Confirmed.");
      const r = await action<Roster>("roster", { sid: roster!.sid });
      setRoster(r);
      if (result.results?.some((r: any) => r.status === "failed"))
        setError(
          result.results
            .filter((r: any) => r.status === "failed")
            .map((r: any) => r.message)
            .join(" "),
        );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const eligible =
    roster?.students
      .filter((s) => s.attendance === "attended" && selected.includes(s.uid))
      .map((s) => s.uid) || [];
  return (
    <>
      <header className="page-heading compact">
        <span className="eyebrow">WORKSHOP STAFF</span>
        <h1>{admin ? "Admin control centre." : "Verify the journey."}</h1>
        <p>
          Confirm attendance, publish lasting results and correct issued
          records. Quiz performance does not determine eligibility for a
          participation certificate.
        </p>
      </header>
      {admin && globalFacilitator && <ApiTokens />}
      <form
        className="panel inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label>
          Session code
          <input
            value={sid}
            maxLength={16}
            onChange={(e) => setSid(e.target.value.toUpperCase())}
            required
          />
        </label>
        <button className="button" disabled={busy}>
          Load workshop
        </button>
      </form>
      {error && <Message error>{error}</Message>}
      {message && <Message>{message}</Message>}
      {roster && (
        <>
          <div className="section-heading">
            <div>
              <h2>{roster.title}</h2>
              <p>
                {roster.date} ·{" "}
                {roster.facilitator
                  ? "Facilitator"
                  : `${roster.region} captain`}{" "}
                · {roster.complete ? "Workshop closed" : "Workshop active"}
              </p>
            </div>
            <span>{roster.students.length} participants</span>
          </div>
          <section className="panel stack">
            <div className="staff-actions">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setSelected(roster.students.map((s) => s.uid))}
              >
                Select all visible
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => setSelected([])}
              >
                Clear selection
              </button>
              {roster.facilitator && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => run(() => action("sync", { sid: roster.sid }))}
                >
                  Import existing registrations
                </button>
              )}
            </div>
            <label>
              Attendance / correction reason
              <textarea
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Record how attendance was checked, or explain a correction."
              />
            </label>
            <div className="staff-actions">
              <button
                className="button"
                disabled={busy || !selected.length || !reason.trim()}
                onClick={() =>
                  run(() =>
                    action("attendanceBatch", {
                      sid: roster.sid,
                      uids: selected,
                      status: "attended",
                      reason,
                    }),
                  )
                }
              >
                Confirm attended ({selected.length})
              </button>
              <button
                className="button secondary"
                disabled={busy || !selected.length || !reason.trim()}
                onClick={() =>
                  run(() =>
                    action("attendanceBatch", {
                      sid: roster.sid,
                      uids: selected,
                      status: "not-attended",
                      reason,
                    }),
                  )
                }
              >
                Mark not attended
              </button>
              {roster.facilitator && !roster.complete && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        "Close the live workshop? Students will stop submitting activities.",
                      )
                    )
                      void run(() => action("close", { sid: roster.sid }));
                  }}
                >
                  Close live workshop
                </button>
              )}
              {roster.facilitator && (
                <button
                  className="button"
                  disabled={
                    busy ||
                    !roster.complete ||
                    !eligible.length ||
                    !reason.trim()
                  }
                  onClick={() =>
                    run(() =>
                      action("finalize", {
                        sid: roster.sid,
                        uids: eligible,
                        reason,
                      }),
                    )
                  }
                >
                  Publish verified results ({eligible.length})
                </button>
              )}
            </div>
            <p className="muted">
              Publishing awards 100 learning points once and issues a
              certificate. Repeating it is safe. Corrections create a new result
              version and replace the previous certificate.
            </p>
          </section>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Learner</th>
                  <th>Team / role</th>
                  <th>Attendance</th>
                  <th>Account record</th>
                  <th>Correction</th>
                </tr>
              </thead>
              <tbody>
                {roster.students.map((s) => (
                  <tr key={s.uid}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={"Select " + s.name}
                        checked={selected.includes(s.uid)}
                        disabled={s.resultStatus === "removed"}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, s.uid]
                              : selected.filter((id) => id !== s.uid),
                          )
                        }
                      />
                    </td>
                    <td>{s.name}</td>
                    <td>
                      {s.teamId}
                      <br />
                      <small>{s.role}</small>
                    </td>
                    <td>{s.attendance}</td>
                    <td>
                      {statusLabel(s.resultStatus)}
                      {s.revision > 0 && <small> · v{s.revision}</small>}
                    </td>
                    <td>
                      {roster.facilitator && s.resultStatus === "completed" && (
                        <button
                          className="text-button danger"
                          disabled={busy || !reason.trim()}
                          onClick={() => {
                            if (
                              confirm(
                                "Revoke this completion, certificate and 100 learning points?",
                              )
                            )
                              void run(() =>
                                action("revoke", {
                                  sid: roster.sid,
                                  uid: s.uid,
                                  reason,
                                }),
                              );
                          }}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {globalFacilitator && <StaffRecords />}
    </>
  );
}
