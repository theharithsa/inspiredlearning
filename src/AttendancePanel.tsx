import Field from "./ui/Field";
import Button from "./ui/Button";
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
        <Button
          className="button secondary"
          disabled={busy}
          busy={!!busy}
          onClick={() =>
            setSelected(
              roster.students
                .filter((s) => s.resultStatus !== "removed")
                .map((s) => s.uid),
            )
          }
        >
          Select all visible
        </Button>
        <Button
          className="text-button"
          disabled={busy}
          busy={!!busy}
          onClick={() => setSelected([])}
        >
          Clear selection
        </Button>
        {roster.facilitator && (
          <Button
            className="text-button"
            disabled={busy}
            busy={!!busy}
            onClick={() => run(() => action("sync", { sid: roster.sid }))}
          >
            Import existing registrations
          </Button>
        )}
      </div>
      <Field
        multiline
        label="Attendance / correction reason"
        maxLength={500}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Record how attendance was checked, or explain a correction."
      />
      <div className="staff-actions">
        <Button
          className="button"
          disabled={busy || !selected.length || !reason.trim()}
          busy={!!busy}
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
        </Button>
        <Button
          className="button secondary"
          disabled={busy || !selected.length || !reason.trim()}
          busy={!!busy}
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
        </Button>
        {roster.facilitator && !roster.complete && (
          <Button
            className="button secondary"
            disabled={busy}
            busy={!!busy}
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
          </Button>
        )}
        {roster.facilitator && (
          <Button
            className="button"
            disabled={
              busy || !roster.complete || !eligible.length || !reason.trim()
            }
            busy={!!busy}
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
          </Button>
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
