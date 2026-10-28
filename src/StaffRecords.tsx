import Field from "./ui/Field";
import Button from "./ui/Button";
import { confirmAction } from "./ui/Confirm";
import { downloadPdf, type PdfResponse } from "./api";
import CertificateCorrection from "./CertificateCorrection";
import RequestsPanel from "./RequestsPanel";
import { useState } from "react";
import { auth } from "./firebase";
import { action, call, errorMessage } from "./observability";
import { Message } from "./components";
import { statusLabel } from "./constants";
interface Lookup {
  uid: string;
  name: string;
  email: string | null;
  removed?: boolean;
  workshops: {
    sid: string;
    title: string;
    date: string | null;
    name: string;
    status: string;
    revision: number;
    certificateId: string | null;
  }[];
}
export default function StaffRecords({
  showRequests = true,
}: {
  showRequests?: boolean;
}) {
  const [requestVersion, setRequestVersion] = useState(0),
    [reference, setReference] = useState(""),
    [lookup, setLookup] = useState<Lookup | null>(null),
    [name, setName] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function load(ref = reference) {
    setBusy(true);
    setError("");
    setLookup(null);
    try {
      const result = await action<Lookup>("lookup", { reference: ref.trim() });
      setLookup(result);
      setName(result.name);
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
      setRequestVersion((v) => v + 1);
      if (lookup)
        setLookup(await action<Lookup>("lookup", { reference: lookup.uid }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function preview(id: string) {
    const actor = auth.currentUser?.uid;
    setBusy(true);
    setError("");
    try {
      const r = await call<PdfResponse>("learningCertificate", { id, reason });
      if (auth.currentUser?.uid !== actor) return;
      downloadPdf(r);
      setNotice("Administrator certificate preview downloaded.");
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
        <Field
          label="Learner email, account reference or certificate ID"
          value={reference}
          required
          onChange={(e) => setReference(e.target.value)}
        />
        <Button className="button secondary" disabled={busy} busy={!!busy}>
          Find record
        </Button>
      </form>
      <Field
        multiline
        label="Review / correction note"
        value={reason}
        maxLength={500}
        onChange={(e) => setReason(e.target.value)}
      />
      {lookup && (
        <div>
          <h3>
            {lookup.name} · {lookup.email}
          </h3>
          <Field
            label="Learner display name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            className="button secondary"
            disabled={busy || lookup.removed || !name.trim() || !reason.trim()}
            busy={!!busy}
            onClick={() =>
              run(() =>
                action("updateLearner", { uid: lookup.uid, name, reason }),
              )
            }
          >
            Correct learner display name
          </Button>
          <p className="small muted">
            Google email and account identity cannot be changed here.
            Certificate names use their separate versioned correction control.
          </p>
          {lookup.workshops.map((w) => (
            <div className="panel" key={w.sid}>
              <h3>{w.title}</h3>
              <p>
                {w.sid} · {w.name} · {statusLabel(w.status)} · v{w.revision}
              </p>
              {w.status === "revoked" && (
                <Button
                  className="button secondary"
                  disabled={busy || !reason.trim()}
                  busy={!!busy}
                  onClick={async () => {
                    if (
                      await confirmAction(
                        "Reinstate verified completion, issue a replacement private certificate and restore the original 100 learning points once?",
                      )
                    )
                      void run(() =>
                        action("restoreCompletion", {
                          uid: lookup.uid,
                          sid: w.sid,
                          reason,
                        }),
                      );
                  }}
                >
                  Reinstate completion and certificate
                </Button>
              )}
              {w.status === "completed" && (
                <div className="staff-actions">
                  {w.certificateId && (
                    <Button
                      className="button secondary"
                      disabled={busy || !reason.trim()}
                      busy={!!busy}
                      onClick={() => void preview(w.certificateId!)}
                    >
                      Preview certificate PDF
                    </Button>
                  )}
                  <CertificateCorrection
                    key={w.sid + ":" + w.revision}
                    workshop={w}
                    busy={!!busy}
                    reason={reason}
                    onSave={(data) =>
                      run(() =>
                        action("correctCertificate", {
                          uid: lookup.uid,
                          sid: w.sid,
                          reason,
                          ...data,
                        }),
                      )
                    }
                  />
                  <Button
                    className="text-button danger"
                    disabled={busy || !reason.trim()}
                    busy={!!busy}
                    onClick={async () => {
                      if (
                        await confirmAction(
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
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {showRequests && (
        <RequestsPanel
          refresh={requestVersion}
          reason={reason}
          onDone={() => {
            setRequestVersion((v) => v + 1);
            if (lookup) void load(lookup.uid);
          }}
          onOpen={(uid) => {
            setReference(uid);
            void load(uid);
          }}
        />
      )}
      <p className="muted">
        Corrections and revocation work even after a live session is deleted.
        Approved removal deletes InspiredLearning records through a recoverable
        server workflow. Shared authentication and Live workshop data are
        outside its scope.
      </p>
    </section>
  );
}
