import { useEffect, useRef, useState } from "react";
import { apiJson } from "./api";
import { auth } from "./firebase";
import { call, errorMessage } from "./observability";
import { Message } from "./components";
interface Row {
  certificateId: string;
  studentId: string;
  workshopId: string;
  name: string;
  title: string;
  status: string;
  revision: number;
  kind: string;
  awardTitle: string | null;
  issuedAt: string | null;
}
export default function AdminCertificates() {
  const [rendering, setRendering] = useState<{
    signatureConfigured: boolean;
  } | null>(null);
  const [awardUid, setAwardUid] = useState(""),
    [awardTitle, setAwardTitle] = useState("");
  const [rows, setRows] = useState<Row[]>([]),
    [workshop, setWorkshop] = useState(""),
    [status, setStatus] = useState(""),
    [kind, setKind] = useState(""),
    [cursor, setCursor] = useState<string | null>(null),
    [reason, setReason] = useState("Certificate validation by administrator"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load(next = false) {
    const actor = auth.currentUser;
    if (!actor) return;
    setBusy(true);
    setError("");
    try {
      const token = await actor.getIdToken(),
        q = new URLSearchParams({ limit: "100" });
      if (workshop.trim()) q.set("workshopId", workshop.trim().toUpperCase());
      if (status) q.set("status", status);
      if (kind) q.set("kind", kind);
      if (next && cursor) q.set("cursor", cursor);
      const res = await fetch(`/api/v1/certificates?${q}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        result = await apiJson<{
          items: Row[];
          nextCursor: string | null;
          rendering: { signatureConfigured: boolean };
        }>(res, "Could not load certificates. Please try again.");
      if (auth.currentUser?.uid !== actor.uid) return;
      setRows((old) => (next ? [...old, ...result.items] : result.items));
      setCursor(result.nextCursor);
      setRendering(result.rendering);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const initialLoad = useRef(load);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void initialLoad.current();
    });
    return () => {
      active = false;
    };
  }, []);
  async function reconcile() {
    const actor = auth.currentUser;
    if (!actor || !workshop.trim() || !reason.trim()) return;
    setBusy(true);
    setError("");
    try {
      const token = await actor.getIdToken();
      const response = await fetch(
        `/api/v1/workshops/${encodeURIComponent(workshop.trim().toUpperCase())}/certificates/reconcile`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reason,
            ...(awardUid.trim() && awardTitle.trim()
              ? {
                  additionalAwards: [
                    { uid: awardUid.trim(), title: awardTitle.trim() },
                  ],
                }
              : {}),
          }),
        },
      );
      const result = await apiJson<{ failed?: number }>(
        response,
        "Certificate refresh failed. Please try again.",
      );
      if (result.failed)
        throw new Error(
          `${result.failed} learner certificate sets need review. Successful repairs are safe to repeat.`,
        );
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function preview(row: Row) {
    const actor = auth.currentUser?.uid;
    setBusy(true);
    setError("");
    try {
      const r = await call<{ base64: string }>("learningCertificate", {
        id: row.certificateId,
        reason,
      });
      if (auth.currentUser?.uid !== actor) return;
      const url = URL.createObjectURL(
        new Blob([Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0))], {
          type: "application/pdf",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `InspiredLearning-${row.kind}-${row.certificateId}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel stack">
      <div>
        <span className="eyebrow">CERTIFICATE REGISTER</span>
        <h2>Issued certificates and history</h2>
        <p>
          Review students’ participation and award certificates. Downloads
          require your administrator account; private PDFs are not exposed as
          public links.
        </p>
      </div>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label>
          Workshop code
          <input
            disabled={busy}
            value={workshop}
            onChange={(e) => {
              setWorkshop(e.target.value);
              setCursor(null);
            }}
            placeholder="All workshops"
            maxLength={16}
          />
        </label>
        <label>
          Status
          <select
            aria-label="Certificate status"
            disabled={busy}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setCursor(null);
            }}
          >
            <option value="">All statuses</option>
            <option value="issued">Issued</option>
            <option value="revoked">Revoked / replaced</option>
          </select>
        </label>
        <label>
          Certificate type
          <select
            aria-label="Certificate type"
            disabled={busy}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setCursor(null);
            }}
          >
            <option value="">All types</option>
            <option value="participation">Participation</option>
            <option value="award">Award</option>
          </select>
        </label>
        <button className="button" disabled={busy}>
          Load certificates
        </button>
      </form>
      {rendering && !rendering.signatureConfigured && (
        <Message error>
          The deployed certificate template has no facilitator signature image
          configured. Award and participation PDFs can be reviewed, but will
          remain unsigned until the approved asset is deployed.
        </Message>
      )}
      <label>
        Preview reason
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
        />
      </label>
      <details>
        <summary>Record a confirmed individual award</summary>
        <p>
          Use the student account reference from the learner lookup below. Only
          record awards you have confirmed.
        </p>
        <label>
          Award recipient account reference
          <input
            value={awardUid}
            onChange={(e) => setAwardUid(e.target.value)}
            maxLength={128}
          />
        </label>
        <label>
          Award title
          <input
            value={awardTitle}
            onChange={(e) => setAwardTitle(e.target.value)}
            maxLength={100}
          />
        </label>
      </details>
      <button
        className="button secondary"
        disabled={
          busy ||
          !workshop.trim() ||
          !reason.trim() ||
          Boolean(awardUid.trim()) !== Boolean(awardTitle.trim())
        }
        onClick={() => void reconcile()}
      >
        Refresh recorded award certificates
      </button>
      <p className="muted small">
        Select a workshop and add a review reason. Refresh issues certificates
        for recorded awards and retires superseded versions; it does not change
        credits.
      </p>
      {error && <Message error>{error}</Message>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Student / workshop</th>
              <th>Type / recognition</th>
              <th>Status / revision</th>
              <th>Certificate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.certificateId}>
                <td>
                  {r.name}
                  <br />
                  <small>{r.workshopId}</small>
                </td>
                <td>
                  {r.kind === "award" ? "Award" : "Participation"}
                  {r.awardTitle && (
                    <>
                      <br />
                      {r.awardTitle}
                    </>
                  )}
                </td>
                <td>
                  {r.status} · {r.revision}
                </td>
                <td>
                  <small>{r.certificateId}</small>
                  <br />
                  {
                    <button
                      className="text-button"
                      disabled={busy || !reason.trim()}
                      onClick={() => void preview(r)}
                    >
                      Preview PDF
                    </button>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        {rows.length} certificates loaded. Revoked versions are retained for
        history.
      </p>
      {cursor && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void load(true)}
        >
          Load more
        </button>
      )}
    </section>
  );
}
