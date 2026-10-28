import Loading from "./ui/Loading";
import Button from "./ui/Button";
import defaults from "../functions/runtime-defaults.json";
import { useRows } from "./hooks";
import { downloadPdf, type PdfResponse } from "./api";
import { useState } from "react";
import type { User } from "firebase/auth";
import { Link } from "react-router-dom";
import { auth } from "./firebase";
import type { Certificate } from "./types";
import { action, call, errorMessage, interaction } from "./observability";
import { Empty, Message, Qr } from "./components";
export default function Certificates({ user }: { user: User }) {
  const {
    rows,
    error: readError,
    hasMore,
    loadMore,
  } = useRows<Certificate>("learningCertificates", [["uid", "==", user.uid]]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [notice, setNotice] = useState(""),
    [qrId, setQrId] = useState("");
  async function download(c: Certificate) {
    setBusy(c.id);
    setError("");
    setNotice("");
    try {
      const result = await call<PdfResponse>("learningCertificate", {
        id: c.id,
      });
      if (auth.currentUser?.uid !== user.uid) return;
      downloadPdf(result);
      interaction("certificate.download", c.sid);
      setNotice("Your certificate download is ready.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  }
  const verificationUrl = (c: Certificate) =>
    `${defaults.publicBaseUrl}/#/verify/${encodeURIComponent(c.id)}`;
  async function copyLink(c: Certificate) {
    setNotice("");
    setError("");
    try {
      await navigator.clipboard.writeText(verificationUrl(c));
      interaction("certificate.link.copied", c.sid);
      setNotice("Verification link copied.");
    } catch {
      setError(
        "Could not copy the link. Open the verification page and copy its address.",
      );
    }
  }
  async function visibility(c: Certificate) {
    setBusy(c.id);
    setError("");
    setNotice("");
    try {
      await action("certificateVisibility", {
        certificateId: c.id,
        public: !c.public,
      });
      setNotice(
        c.public
          ? "Public verification turned off."
          : "Public verification enabled. Anyone with the certificate link can see your name and workshop.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <header className="page-heading compact">
        <span className="eyebrow">YOUR ACHIEVEMENTS</span>
        <h1>Learning worth keeping.</h1>
        <p>
          Download your verified participation certificates. Public verification
          is your choice.
        </p>
      </header>
      {(error || readError) && <Message error>{error || readError}</Message>}
      {notice && <Message>{notice}</Message>}
      {hasMore && (
        <Button className="button secondary" onClick={loadMore}>
          Load more certificates
        </Button>
      )}
      {!rows ? (
        <Loading>Loading certificates…</Loading>
      ) : !rows.length ? (
        <Empty title="Your certificate belongs here">
          After your facilitator verifies completion, your downloadable
          certificate will appear here.
        </Empty>
      ) : (
        <div className="cards">
          {rows.map((c) => (
            <article className="panel certificate-card" key={c.id}>
              <span
                className={"badge " + (c.status === "issued" ? "success" : "")}
              >
                {c.status === "issued" ? "Issued" : "Revoked / replaced"}
              </span>
              <div className="certificate-symbol" aria-hidden="true">
                ✳
              </div>
              <span className="eyebrow">
                {c.kind === "award"
                  ? "Award certificate"
                  : "Participation certificate"}
              </span>
              <h2>{c.awardTitle || c.title}</h2>
              {c.kind === "award" && <p>{c.title}</p>}
              <p>
                {c.name} · {c.date || "Date recorded by staff"}
              </p>
              <small>
                Revision {c.revision} · {c.id}
              </small>
              {c.status === "issued" && (
                <>
                  <Button
                    className="button"
                    disabled={busy === c.id}
                    busy={!!busy}
                    onClick={() => download(c)}
                  >
                    {busy === c.id ? "Working…" : "Download PDF"}
                  </Button>
                  <Button
                    className="text-button"
                    disabled={busy === c.id}
                    busy={!!busy}
                    onClick={() => visibility(c)}
                  >
                    {c.public
                      ? "Turn off public verification"
                      : "Enable public verification"}
                  </Button>
                  {c.public && (
                    <>
                      <Link to={"/verify/" + c.id}>Open verification page</Link>
                      <Button
                        className="text-button"
                        onClick={() => void copyLink(c)}
                      >
                        Copy verification link
                      </Button>
                      <Button
                        className="text-button"
                        aria-expanded={qrId === c.id}
                        onClick={() => setQrId(qrId === c.id ? "" : c.id)}
                      >
                        Show QR code
                      </Button>
                      {qrId === c.id && (
                        <Qr
                          url={verificationUrl(c)}
                          label="Public certificate verification QR code"
                        />
                      )}
                    </>
                  )}
                </>
              )}
              <p className="muted small">
                {c.public
                  ? "Your name, workshop and validity are visible to anyone with the link."
                  : "Verification is private. Your email and scores are never public."}
              </p>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
