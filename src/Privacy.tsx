import Brand from "./ui/Brand";
import Theme from "./ui/Theme";
import { useEffect } from "react";
import { Link } from "react-router-dom";
export default function Privacy() {
  useEffect(() => {
    document.title = "Privacy · InspiredLearning";
    document.querySelector<HTMLElement>("h1")?.focus();
  }, []);
  return (
    <main id="main-content" tabIndex={-1} className="public-page">
      <header className="public-header">
        <Brand />
        <Theme />
      </header>
      <section className="panel stack">
        <h1 tabIndex={-1}>Your learning record, your privacy.</h1>
        <p>
          Google sign-in links your account to verified workshop participation.
          We store your display name, email, attendance, results, learning
          credits and certificates. Your workshop award combines team and
          individual results.
        </p>
        <p>
          Dynatrace monitors application performance and interactions. Signed-in
          activity can include your email and user ID for support and trace
          correlation. Unsigned visitors use a pseudonymous device identifier.
          Free-text activity answers and PDF contents are not included in portal
          telemetry.
        </p>
        <p>
          Your records are private to your account and authorized workshop
          staff. Public certificate verification is off by default; if enabled,
          it exposes your name, workshop, certificate revision and validity. It
          never exposes your email or scores.
        </p>
        <p>
          You can request a correction or removal from your Profile page.
          Completion records persist when an operational workshop session is
          deleted. Downloaded certificates cannot be recalled; verification
          reflects revocations.
        </p>
        <Link className="button" to="/">
          Return to InspiredLearning →
        </Link>
      </section>
    </main>
  );
}
