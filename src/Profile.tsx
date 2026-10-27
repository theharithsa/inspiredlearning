import RequestHistory from "./RequestHistory";
import { useState } from "react";
import type { User } from "firebase/auth";
import type { Profile as LearnerProfile } from "./types";
import { action, errorMessage, interaction } from "./observability";
import { Message } from "./components";
export default function Profile({
  user,
  profile,
}: {
  user: User;
  profile: LearnerProfile | null | undefined;
}) {
  const [name, setName] = useState(profile?.name || user.displayName || ""),
    [reason, setReason] = useState(""),
    [kind, setKind] = useState("correction"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  async function submit(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      setMessage(success);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="page-heading compact">
        <span className="eyebrow">YOUR ACCOUNT</span>
        <h1>Make it yours.</h1>
        <p>
          Workshop records are linked to your Google account, across devices.
        </p>
      </header>
      {message && <Message>{message}</Message>}
      {error && <Message error>{error}</Message>}
      <div className="split">
        <form
          className="panel stack"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(
              () =>
                action("profile", { name }).then(() =>
                  interaction("profile.saved"),
                ),
              "Profile saved.",
            );
          }}
        >
          <h2>Profile</h2>
          <p className="small muted">Account reference: {user.uid}</p>
          <label>
            Display name
            <input
              value={name}
              maxLength={80}
              required
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Google account
            <input value={user.email || ""} readOnly />
          </label>
          <p className="muted">
            Your verified records and issued certificates keep the name recorded
            by workshop staff. A display-name edit does not change an issued
            certificate.
          </p>
          <button className="button" disabled={busy}>
            Save profile
          </button>
        </form>
        <form
          className="panel stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (
              kind === "erasure" &&
              !window.confirm(
                "Submit a request to remove your InspiredLearning history and certificates? A facilitator must review it before removal. Your shared Google sign-in and ChaiCart Live records stay available.",
              )
            )
              return;
            void submit(async () => {
              await action("requestCorrection", { kind, reason });
              setReason("");
            }, "Request submitted. Your facilitator can review it with you.");
          }}
        >
          <h2>Need a record corrected?</h2>
          <p>
            You can also request removal of your learning records. We retain
            issued records until the request is reviewed.
          </p>
          <label>
            Request type
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="correction">Correct a record</option>
              <option value="erasure">Remove my learning records</option>
            </select>
          </label>
          <label>
            Details
            <textarea
              value={reason}
              required
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            className="button secondary"
            disabled={busy || !reason.trim()}
          >
            Send request
          </button>
        </form>
      </div>
      <RequestHistory uid={user.uid} />
    </>
  );
}
