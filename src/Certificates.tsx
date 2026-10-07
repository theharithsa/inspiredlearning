import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Link } from "react-router-dom";
import { db, auth } from "./firebase";
import type { Certificate } from "./types";
import { action, call, errorMessage, interaction } from "./observability";
import { Empty, Message } from "./components";
export default function Certificates({ user }: { user: User }) {
  const [rows, setRows] = useState<Certificate[] | undefined>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(
    () =>
      onSnapshot(
        query(
          collection(db, "learningCertificates"),
          where("uid", "==", user.uid),
        ),
        (s) =>
          setRows(
            s.docs.map((d) => ({ ...d.data(), id: d.id }) as Certificate),
          ),
        () =>
          setError("Could not load your certificates. Check your connection."),
      ),
    [user.uid],
  );
  async function download(c: Certificate) {
    setBusy(c.id);
    setError("");
    try {
      const result = await call<{ base64: string; filename: string }>(
        "learningCertificate",
        { id: c.id },
      );
      if (auth.currentUser?.uid !== user.uid) return;
      const bytes = Uint8Array.from(atob(result.base64), (c) =>
        c.charCodeAt(0),
      );
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "application/pdf" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      interaction("certificate.download", c.sid);
      setNotice("Your certificate download is ready.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  }
  async function visibility(c: Certificate) {
    setBusy(c.id);
    setError("");
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
      {error && <Message error>{error}</Message>}
      {notice && <Message>{notice}</Message>}
      {!rows ? (
        <p role="status">Loading certificates…</p>
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
              <h2>{c.title}</h2>
              <p>
                {c.name} · {c.date || "Date recorded by staff"}
              </p>
              <small>
                Revision {c.revision} · {c.id}
              </small>
              {c.status === "issued" && (
                <>
                  <button
                    className="button"
                    disabled={busy === c.id}
                    onClick={() => download(c)}
                  >
                    {busy === c.id ? "Working…" : "Download PDF"}
                  </button>
                  <button
                    className="text-button"
                    disabled={busy === c.id}
                    onClick={() => visibility(c)}
                  >
                    {c.public
                      ? "Turn off public verification"
                      : "Enable public verification"}
                  </button>
                  {c.public && (
                    <Link to={"/verify/" + c.id}>Open verification page ↗</Link>
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
