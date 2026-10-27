import { apiFetch } from "./api";
import { useEffect, useState } from "react";
import { auth } from "./firebase";
import { useRows } from "./hooks";
import type { Profile, Workshop } from "./types";
import { CommunityCard, Empty, WorkshopCard } from "./components";
export default function Dashboard({
  profile,
  workshops,
}: {
  profile: Profile | null | undefined;
  workshops: Workshop[] | undefined;
}) {
  const { rows: entries } = useRows<{ delta: number }>(
    auth.currentUser
      ? `learningLearners/${auth.currentUser.uid}/creditEntries`
      : null,
    [],
    { pageSize: 501 },
  );
  const uid = auth.currentUser?.uid;
  const [state, setState] = useState<{
    uid: string | undefined;
    workshops: typeof workshops;
    entries: typeof entries;
    account: { totalCredits: number | null; unknownAwards: number } | null;
    error: boolean;
  } | null>(null);
  const current =
    state?.uid === uid &&
    state?.workshops === workshops &&
    state?.entries === entries;
  const account = current ? state?.account : null,
    creditError = current && state?.error;
  useEffect(() => {
    let active = true;
    const user = auth.currentUser;
    if (!user) return;
    void apiFetch<{ totalCredits: number | null; unknownAwards: number }>(
      "/api/v1/me/scores",
    )
      .then((data) => {
        if (active)
          setState({ uid, workshops, entries, account: data, error: false });
      })
      .catch(() => {
        if (active)
          setState({ uid, workshops, entries, account: null, error: true });
      });
    return () => {
      active = false;
    };
  }, [uid, workshops, entries]);
  const complete = workshops?.filter((w) => w.status === "completed") || [];
  return (
    <>
      <header className="page-heading">
        <span className="eyebrow">YOUR LEARNING JOURNEY</span>
        <h1>
          Keep your curiosity.
          <br />
          <em>Build on your progress.</em>
        </h1>
        <p>
          {profile?.name ? "Welcome back, " + profile.name + ". " : ""}Your
          workshops and verified achievements, all in one place.
        </p>
      </header>
      <div className="stats">
        <div>
          <span>Completed workshops</span>
          <strong>{complete.length}</strong>
        </div>
        <div>
          <span>Total Inspi credits</span>
          <strong>{account?.totalCredits ?? "—"}</strong>
          <small>
            {creditError
              ? "Could not load credits"
              : account?.unknownAwards
                ? "Some published credits are unknown"
                : account
                  ? "Across your Inspi activities"
                  : "Loading credits…"}
          </small>
        </div>
        <div>
          <span>Available certificates</span>
          <strong>{complete.filter((w) => w.certificateId).length}</strong>
        </div>
      </div>
      <div className="section-heading">
        <h2>Your workshops</h2>
        <span>{workshops?.length || 0} participation records</span>
      </div>
      {workshops === undefined ? (
        <p role="status">Loading your learning history…</p>
      ) : workshops.length ? (
        <div className="cards">
          {workshops.map((w) => (
            <WorkshopCard key={w.sid} workshop={w} />
          ))}
        </div>
      ) : (
        <Empty title="Your next chapter starts here">
          Join a ChaiCart workshop with this Google account. Your participation
          will appear here; verified completion unlocks your certificate and
          learning points.
        </Empty>
      )}
      <div className="split">
        <section className="panel">
          <span className="eyebrow">MILESTONES</span>
          <h2>Progress that means something.</h2>
          <p>
            {complete.length === 0
              ? "Complete your first workshop to earn your first milestone."
              : complete.length === 1
                ? "First workshop completed. You have started a learning habit."
                : `${complete.length} workshops completed. Keep building on what you learned.`}
          </p>
          <p className="muted">
            Learning points recognise verified participation. They are separate
            from the credits earned in workshop games.
          </p>
        </section>
        <CommunityCard />
      </div>
    </>
  );
}
