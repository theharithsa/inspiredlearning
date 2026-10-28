import { confirmAction } from "./ui/Confirm";
import type { StaffWorkflowProps } from "./types";
import { action } from "./observability";
export default function AttendancePanel({
  roster,
  selected,
  setSelected,
  reason,
  setReason,
  busy,
  run,
}: StaffWorkflowProps) {
  const eligible = roster.students
    .filter((s) => s.attendance === "attended" && selected.includes(s.uid))
    .map((s) => s.uid);
  return (
    <section className="panel stack">
      <div className="staff-actions">
        <button
          className="button secondary"
          disabled={busy}
          onClick={() =>
            setSelected(
              roster.students
                .filter((s) => s.resultStatus !== "removed")
                .map((s) => s.uid),
            )
          }
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
            onClick={async () => {
              if (
                await confirmAction(
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
              busy || !roster.complete || !eligible.length || !reason.trim()
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
        Publishing awards 100 learning points once and issues a certificate.
        Repeating it is safe. Corrections create a new result version and
        replace the previous certificate.
      </p>
    </section>
  );
}
