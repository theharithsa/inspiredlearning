import Field from "./ui/Field";
import Button from "./ui/Button";
import AttendancePanel from "./AttendancePanel";
import RosterTable from "./RosterTable";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { action, errorMessage } from "./observability";
import type { Roster, BatchResult } from "./types";
import { Message } from "./components";
export default function Staff() {
  const [params] = useSearchParams();
  const [sid, setSid] = useState(params.get("session") || ""),
    [roster, setRoster] = useState<Roster | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const loadGeneration = useRef(0);
  const sessionCode = params.get("session") || "";
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active && /^[A-Za-z0-9-]{4,16}$/.test(sessionCode))
        void load(sessionCode);
    });
    const generation = loadGeneration;
    return () => {
      active = false;
      generation.current++;
    };
  }, [sessionCode]);
  async function load(code = sid) {
    const generation = ++loadGeneration.current;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await action<Roster>("roster", {
        sid: code.trim().toUpperCase(),
      });
      if (generation !== loadGeneration.current) return;
      setRoster(r);
      setSelected([]);
    } catch (e) {
      if (generation !== loadGeneration.current) return;
      setRoster(null);
      setError(errorMessage(e));
    } finally {
      if (generation === loadGeneration.current) setBusy(false);
    }
  }
  async function run(work: () => Promise<BatchResult>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await work();
      setMessage(result.message || "Confirmed.");
      const r = await action<Roster>("roster", { sid: roster!.sid });
      setRoster(r);
      if (result.results?.some((r) => r.status === "failed"))
        setError(
          result.results
            .filter((r) => r.status === "failed")
            .map((r) => r.message)
            .join(" "),
        );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="page-heading compact">
        <span className="eyebrow">WORKSHOP STAFF</span>
        <h1>Workshop participation</h1>
        <p>
          Confirm attendance, publish lasting results and correct issued
          records. Quiz performance does not determine eligibility for a
          participation certificate.
        </p>
      </header>
      <form
        className="panel inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <Field
          label="Session code"
          value={sid}
          maxLength={16}
          onChange={(e) => setSid(e.target.value.toUpperCase())}
          required
        />
        <Button className="button" disabled={busy} busy={!!busy}>
          Load workshop
        </Button>
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
          <AttendancePanel
            roster={roster}
            selected={selected}
            setSelected={setSelected}
            reason={reason}
            setReason={setReason}
            busy={!!busy}
            run={run}
          />
          <RosterTable
            roster={roster}
            selected={selected}
            setSelected={setSelected}
            reason={reason}
            busy={!!busy}
            run={run}
          />
        </>
      )}
    </>
  );
}
