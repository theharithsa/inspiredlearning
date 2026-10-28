import Brand from "./ui/Brand";
import Theme from "./ui/Theme";
import Button from "./ui/Button";
import { confirmAction } from "./ui/Confirm";
import { useState } from "react";
import { signOut, type User } from "firebase/auth";
import { auth } from "./firebase";
import { action, errorMessage } from "./observability";
import { Message, CommunityCard } from "./components";
import RequestHistory from "./RequestHistory";
export default function RemovedAccount({
  user,
  state,
}: {
  user: User;
  state: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <main className="public-page stack">
      <header className="public-header">
        <Brand />
        <Theme />
      </header>
      <h1>
        {state === "erasing"
          ? "Removing your learning records."
          : "Your learning records were removed."}
      </h1>
      <p>
        Your shared Google sign-in and ChaiCart Live workshop data remain
        available. A minimal removal marker prevents old records being imported
        again. Previously downloaded PDFs and retained monitoring data are
        outside this removal.
      </p>
      <RequestHistory uid={user.uid} />
      {error && <Message error>{error}</Message>}
      {state === "erased" && (
        <>
          <p>
            You can start a new learning profile for future workshops. This does
            not restore erased history or certificates.
          </p>
          <Button
            className="button"
            disabled={busy}
            busy={!!busy}
            onClick={async () => {
              if (
                !(await confirmAction(
                  "Start a new learning profile with your Google account? Erased historical workshops will stay removed.",
                ))
              )
                return;
              setBusy(true);
              try {
                await action("reactivate");
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Start a new learning profile
          </Button>
        </>
      )}
      <CommunityCard />
      <Button className="text-button" onClick={() => void signOut(auth)}>
        Sign out
      </Button>
    </main>
  );
}
