import { DISCORD } from "./constants";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  HashRouter,
  Routes,
  Route,
  NavLink,
  Link,
  useLocation,
} from "react-router-dom";
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
const Verify = lazy(() => import("./Verify"));
import { CommunityCard, Message, Qr } from "./components";
function PageEvents() {
  const { pathname } = useLocation();
  useEffect(() => interaction("page.view"), [pathname]);
  return null;
}
function Landing() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="landing">
      <header className="public-header">
        <Link className="brand" to="/">
          ✳ InspiredLearning
        </Link>
        <Link to="/community">Our community ↗</Link>
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
            Use the same Google account you used for ChaiCart.{" "}
            <Link to="/privacy">How we use your data</Link>
          </p>
          {error && <Message error>{error}</Message>}
        </section>
        <div
          className="journey-illustration"
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
function Privacy() {
  return (
    <main className="public-page">
      <Link className="brand" to="/">
        ✳ InspiredLearning
      </Link>
      <section className="panel stack">
        <h1>Your learning record, your privacy.</h1>
        <p>
          Google sign-in links your account to verified workshop participation.
          We store your display name, email, attendance, results, learning
          points and certificates. Team scores are shown separately from
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
  const { rows, error } = useRows<Workshop>(
    `learningLearners/${user.uid}/workshops`,
  );
  const workshops = rows
    ?.slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
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
          <NavLink to="/community">Community ↗</NavLink>
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
      <main className="workspace">
        <div className="workspace-top">
          <span className="status-dot" /> Your learning, connected.
        </div>
        {error && <Message error>{error}</Message>}
        <Routes>
          <Route
            path="/"
            element={
              <>
                <Dashboard profile={profile} workshops={workshops} />
                <PointsHistory uid={user.uid} />
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
          <Route path="/staff" element={<Staff />} />
          <Route
            path="/admin"
            element={
              administrator === null ? (
                <p role="status">Checking administrator access…</p>
              ) : administrator ? (
                <Staff admin />
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
      <PageEvents />
      <Routes>
        <Route path="/verify/:id" element={<Verify />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route
          path="*"
          element={
            user === undefined ? (
              <main className="public-page">
                <p role="status">Connecting to your account…</p>
              </main>
            ) : user && googleUser(user) ? (
              <LearnerLayout key={user.uid} user={user} />
            ) : (
              <Routes>
                <Route
                  path="/community"
                  element={
                    <main className="public-page">
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
    <HashRouter>
      <Suspense
        fallback={
          <main className="public-page">
            <p role="status">Loading your page…</p>
          </main>
        }
      >
        <Application />
      </Suspense>
    </HashRouter>
  );
}
