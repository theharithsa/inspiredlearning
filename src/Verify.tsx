import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { call, errorMessage } from "./observability";
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
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void call<any>("learningVerify", { id })
      .then((r) => {
        if (active) set({ id, data: r });
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [id]);
  const result = state?.id === id ? state?.data : null;
  return (
    <main className="public-page">
      <Link className="brand" to="/">
        ✳ InspiredLearning
      </Link>
      <section className="panel verification">
        <span className="eyebrow">CERTIFICATE VERIFICATION</span>
        <h1>
          {!result
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
        <Link className="button" to="/certificates">
          My certificates →
        </Link>
      </section>
    </main>
  );
}
