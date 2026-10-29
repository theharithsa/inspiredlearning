import Button from "./ui/Button";
import Brand from "./ui/Brand";
import Theme from "./ui/Theme";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiJson } from "./api";
import { Message } from "./components";
export default function Verify() {
  const { id } = useParams();
  const [state, set] = useState<{
      id?: string;
      data: {
        status: string;
        name?: string;
        title?: string;
        date?: string;
        revision?: number;
        kind?: string;
        awardTitle?: string;
      };
    } | null>(null),
    [failure, setFailure] = useState<{ id?: string; message: string } | null>(
      null,
    );
  const error = failure && failure.id === id ? failure.message : "";
  useEffect(() => {
    document.title = "Certificate verification · InspiredLearning";
    let active = true;
    void fetch(
      `/api/v1/public/certificates/${encodeURIComponent(id || "")}/verification`,
      { cache: "no-store" },
    )
      .then((response) =>
        apiJson<NonNullable<typeof state>["data"]>(
          response,
          "Could not verify this certificate. Please try again.",
        ),
      )
      .then((r) => {
        if (active) set({ id, data: r });
      })
      .catch((e) => {
        if (active)
          setFailure({
            id,
            message:
              e instanceof Error ? e.message : "Verification unavailable.",
          });
      });
    return () => {
      active = false;
    };
  }, [id]);
  const result = state?.id === id ? state?.data : null;
  return (
    <main className="public-page">
      <header className="public-header">
        <Brand />
        <Theme />
      </header>
      <section className="panel verification">
        <span className="eyebrow">CERTIFICATE VERIFICATION</span>
        <h1>
          {error
            ? "Verification unavailable."
            : !result
              ? "Checking certificate…"
              : result.status === "valid"
                ? result.kind === "award"
                  ? "Verified achievement."
                  : "Verified participation."
                : result.status === "revoked"
                  ? "Certificate revoked."
                  : "Private or unavailable."}
        </h1>
        {error ? (
          <Message error>{error}</Message>
        ) : result?.name ? (
          <>
            <h2>{result.name}</h2>
            <p>{result.title}</p>
            {result.awardTitle && <p>{result.awardTitle}</p>}
            <p>
              {result.date} · Revision {result.revision}
            </p>
            <p>
              {result.status === "valid"
                ? "This certificate was issued after facilitator verification."
                : "This certificate is no longer valid. Ask the learner for their current certificate."}
            </p>
          </>
        ) : (
          result && (
            <p>
              The learner has not enabled public verification, or this
              certificate is unavailable. Sign in to view your own certificates.
            </p>
          )
        )}
        <Button href="#/certificates">My certificates →</Button>
      </section>
    </main>
  );
}
