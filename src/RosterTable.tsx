import type { StaffWorkflowProps } from "./types";
import { action } from "./observability";
import { statusLabel } from "./constants";
export default function RosterTable({
  roster,
  selected,
  setSelected,
  reason,
  busy,
  run,
}: Omit<StaffWorkflowProps, "setReason">) {
  return (
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
  );
}
