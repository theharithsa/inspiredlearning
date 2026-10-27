import { DISCORD } from "./constants";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Routes, Route, NavLink, Link, useLocation } from "react-router-dom";
import { signInWithPopup, signOut, type User } from "firebase/auth";
import { auth, google } from "./firebase";
import { useUser, useRows, useRecord, googleUser } from "./hooks";
import { action, errorMessage, identity, interaction } from "./observability";
import type { Profile as LearnerProfile, Workshop } from "./types";
import Dashboard from "./Dashboard";
import Workshops from "./Workshops";
import PointsHistory from "./PointsHistory";
const WorkshopDetail = lazy(() => import("./WorkshopDetail"));
const Certificates = lazy(() => import("./Certificates"));
const RemovedAccount = lazy(() => import("./RemovedAccount"));
const Profile = lazy(() => import("./Profile"));
const Staff = lazy(() => import("./Staff"));
import { CommunityCard, Message, Qr } from "./components";
function PageEvents() {
  const { pathname } = useLocation();
  useEffect(() => {
    interaction("page.view");
    const titles: Record<string, string> = {
      "/": "My learning",
      "/workshops": "My workshops",
      "/certificates": "Certificates",
      "/community": "Community",
      "/profile": "Profile",
      "/admin": "Administration",
      "/staff": "Workshop staff",
      "/privacy": "Privacy",
    };
    document.title = `${titles[pathname] || (pathname.startsWith("/verify/") ? "Certificate verification" : "Learning record")} · InspiredLearning`;
    let observer: MutationObserver | undefined;
    const focusHeading = () => {
      const heading = document.querySelector<HTMLElement>("main h1");
      if (!heading) return false;
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      window.scrollTo(0, 0);
      observer?.disconnect();
      return true;
    };
    if (!focusHeading()) {
      observer = new MutationObserver(focusHeading);
      observer.observe(document.body, { childList: true, subtree: true });
    }
    return () => observer?.disconnect();
  }, [pathname]);
  return null;
}
function Landing() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main id="main-content" tabIndex={-1} className="landing">
      <header className="public-header">
        <Link className="brand" to="/">
          ✳ InspiredLearning
        </Link>
        <Link to="/community">Our community</Link>
      </header>
      <div className="landing-hero">
        <section>
          <span className="eyebrow">
            LEARNING DOESN’T END WITH THE WORKSHOP
          </span>
          <h1>
            What you learn
            <br />
            stays with you.
          </h1>
          <p className="lead">
            Keep your verified workshops, celebrate your progress and find your
            people. One account for the learning you build on.
          </p>
          <button
            className="button large"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await signInWithPopup(auth, google);
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Opening Google…" : "Continue with Google →"}
          </button>
          <p className="small muted">
            Use the Google account linked to your learning records.{" "}
            <Link to="/privacy">How we use your data</Link>
          </p>
          {auth.currentUser && (
            <button className="text-button" onClick={() => void signOut(auth)}>
              Sign out of this account
            </button>
          )}
          {error && <Message error>{error}</Message>}
        </section>
        <div
          className="journey-illustration"
          role="img"
          aria-label="Participate, reflect, and keep learning"
        >
          <div className="orbit" aria-hidden="true">
            ✳
          </div>
          <div className="journey-step">
            <span>01</span>
            <strong>Show up</strong>
            <p>Participate in the workshop.</p>
          </div>
          <div className="journey-step">
            <span>02</span>
            <strong>Look back</strong>
            <p>See your verified progress.</p>
          </div>
          <div className="journey-step">
            <span>03</span>
            <strong>Keep going</strong>
            <p>Build with your community.</p>
          </div>
        </div>
      </div>
      <div className="landing-features">
        <article>
          <h2>Your learning record</h2>
          <p>
            A lasting home for your workshops, individual results and team
            contributions.
          </p>
        </article>
        <article>
          <h2>Recognition you can keep</h2>
          <p>
            Download certificates after facilitator verification. You control
            public verification.
          </p>
        </article>
        <article>
          <h2>A community beyond class</h2>
          <p>
            Ask questions and share what you build with learners and captains on
            Discord.
          </p>
        </article>
      </div>
      <CommunityCard />
      <footer>InspiredLearning · Curiosity into practice.</footer>
    </main>
  );
}
function Community() {
  return (
    <>
      <header className="page-heading compact">
        <span className="eyebrow">LEARN TOGETHER</span>
        <h1>
          Bring your questions.
          <br />
          Share your discoveries.
        </h1>
        <p>
          The workshop is a starting point. Discord is where the conversation
          can continue.
        </p>
      </header>
      <div className="split">
        <CommunityCard />
        <section className="panel stack">
          <h2>Scan to join</h2>
          <Qr
            url={DISCORD}
            label="QR code to join the InspiredLearning Discord community"
          />
          <a
            href={DISCORD}
            target="_blank"
            rel="noreferrer"
            data-event="discord.opened"
          >
            Open Discord invitation ↗
          </a>
          <h3>Make your first conversation useful</h3>
          <ol>
            <li>Introduce yourself and mention your workshop.</li>
            <li>
              When asking for help, describe what you tried and what happened.
            </li>
            <li>
              Share useful resources and help other learners when you can.
            </li>
          </ol>
          <p className="muted">
            Never post passwords, access tokens or private account information.
          </p>
        </section>
      </div>
    </>
  );
}
function LearnerLayout({ user }: { user: User }) {
  const privacy = useRecord<{ state: string }>(`learningPrivacy/${user.uid}`);
  const [administrator, setAdministrator] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    void action<{ facilitator: boolean }>("access")
      .then((r) => {
        if (active) setAdministrator(r.facilitator);
      })
      .catch(() => {
        if (active) setAdministrator(false);
      });
    return () => {
      active = false;
    };
  }, [user.uid]);
  const profile = useRecord<LearnerProfile>(`learningLearners/${user.uid}`);
  const { rows, error, hasMore, loadMore } = useRows<Workshop>(
    `learningLearners/${user.uid}/workshops`,
    [],
    { pageSize: 50 },
  );
  const workshops = useMemo(
    () =>
      rows?.slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [rows],
  );
  useEffect(() => {
    void action("profile").catch(() => {});
  }, [user.uid]);
  if (privacy?.state === "erasing" || privacy?.state === "erased")
    return <RemovedAccount user={user} state={privacy.state} />;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to="/">
          ✳ InspiredLearning
        </Link>
        <p className="sidebar-caption">A place for your progress.</p>
        <nav aria-label="Main navigation">
          <NavLink to="/" end>
            My learning
          </NavLink>
          <NavLink to="/workshops">My workshops</NavLink>
          <NavLink to="/certificates">Certificates</NavLink>
          <NavLink to="/community">Community</NavLink>
          <NavLink to="/profile">Profile</NavLink>
          {administrator && <NavLink to="/admin">Admin controls</NavLink>}
        </nav>
        <div className="sidebar-footer">
          <Link to="/staff">Workshop staff</Link>
          <Link to="/privacy">Privacy</Link>
          <small>{user.email}</small>
          <button
            className="text-button"
            onClick={() => {
              interaction("auth.signed-out");
              void signOut(auth);
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main id="main-content" tabIndex={-1} className="workspace">
        <div className="workspace-top">
          <span className="status-dot" /> Your learning, connected.
        </div>
        {error && <Message error>{error}</Message>}
        {hasMore && (
          <div className="panel stack">
            <p>
              Showing {rows?.length} workshop records. Counts and milestones
              below cover loaded records; the Inspi credit total comes from the
              complete server calculation.
            </p>
            <button className="button secondary" onClick={loadMore}>
              Load more workshop records
            </button>
          </div>
        )}
        <Routes>
          <Route
            path="/"
            element={
              <>
                <Dashboard profile={profile} workshops={workshops} />
                <PointsHistory uid={user.uid} workshops={workshops} />
              </>
            }
          />
          <Route
            path="/workshops"
            element={<Workshops workshops={workshops} />}
          />
          <Route
            path="/workshops/:sid"
            element={<WorkshopDetail workshops={workshops} />}
          />
          <Route path="/certificates" element={<Certificates user={user} />} />
          <Route path="/community" element={<Community />} />
          <Route
            path="/profile"
            element={
              profile === undefined ? (
                <p role="status">Loading your profile…</p>
              ) : (
                <Profile key={user.uid} user={user} profile={profile} />
              )
            }
          />
          <Route
            path="/staff"
            element={<Staff globalFacilitator={administrator === true} />}
          />
          <Route
            path="/admin"
            element={
              administrator === null ? (
                <p role="status">Checking administrator access…</p>
              ) : administrator ? (
                <Staff admin globalFacilitator />
              ) : (
                <Message error>Administrator access required.</Message>
              )
            }
          />
          <Route
            path="*"
            element={
              <div className="panel">
                <h1>Page not found</h1>
                <Link to="/">Back to my learning</Link>
              </div>
            }
          />
        </Routes>
        <footer>InspiredLearning · Keep learning, together.</footer>
      </main>
    </div>
  );
}
function Application() {
  const user = useUser();
  useEffect(() => {
    if (user !== undefined) {
      identity(user);
      if (googleUser(user)) interaction("auth.signed-in");
    }
  }, [user]);
  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          const main = document.querySelector<HTMLElement>("main");
          if (main) {
            main.tabIndex = -1;
            main.focus();
          }
        }}
      >
        Skip to main content
      </a>
      <PageEvents />
      <Routes>
        <Route
          path="*"
          element={
            user === undefined ? (
              <main id="main-content" tabIndex={-1} className="public-page">
                <p role="status">Connecting to your account…</p>
              </main>
            ) : user && googleUser(user) ? (
              <LearnerLayout key={user.uid} user={user} />
            ) : (
              <Routes>
                <Route
                  path="/community"
                  element={
                    <main
                      id="main-content"
                      tabIndex={-1}
                      className="public-page"
                    >
                      <Link className="brand" to="/">
                        ✳ InspiredLearning
                      </Link>
                      <Community />
                    </main>
                  }
                />
                <Route path="*" element={<Landing />} />
              </Routes>
            )
          }
        />
      </Routes>
    </>
  );
}
export default function App() {
  return (
    <Suspense
      fallback={
        <main id="main-content" tabIndex={-1} className="public-page">
          <p role="status">Loading your page…</p>
        </main>
      }
    >
      <Application />
    </Suspense>
  );
}
