import Loading from "./ui/Loading";
import type { Workshop } from "./types";
import { Empty, WorkshopCard } from "./components";
export default function Workshops({
  workshops,
}: {
  workshops: Workshop[] | undefined;
}) {
  return (
    <>
      <header className="page-heading compact">
        <span className="eyebrow">YOUR PARTICIPATION</span>
        <h1>
          Every workshop.
          <br />
          Part of your story.
        </h1>
        <p>
          Registration, verified completion and your lasting learning record.
        </p>
      </header>
      {workshops === undefined ? (
        <Loading>Loading your workshops…</Loading>
      ) : workshops.length ? (
        <div className="cards">
          {workshops.map((w) => (
            <WorkshopCard key={w.sid} workshop={w} />
          ))}
        </div>
      ) : (
        <Empty title="No workshops yet">
          Join a ChaiCart session with this Google account to start your
          participation record.
        </Empty>
      )}
    </>
  );
}
