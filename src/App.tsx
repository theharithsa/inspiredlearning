import AccountMenu from "./ui/AccountMenu";
import Loading from "./ui/Loading";
import Button from "./ui/Button";
import Brand from "./ui/Brand";
import Icon, { type IconName } from "./ui/Icon";
import Theme from "./ui/Theme";
import { adminUrl } from "./surface";
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
        <Brand />
        <div className="public-header-actions">
          <Theme />
          <Link to="/community">Our community</Link>
          <a className="text-button" href={adminUrl()}>
            Administrator sign-in
          </a>
        </div>
      </header>
      <div className="landing-hero">
        <section>
          <span className="eyebrow">YOUR LEARNING, CONNECTED</span>
          <h1>
            Make your learning
            <br />
            <em>count for more.</em>
          </h1>
          <p className="lead">
            Bring your verified participation, earned credits and certificates
            together. A lasting record of the learning you build on.
          </p>
          <Button
            className="button large"
            disabled={busy}
            busy={!!busy}
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
          </Button>
          <p className="small muted">
            Use the Google account linked to your learning records.{" "}
            <Link to="/privacy">How we use your data</Link>
          </p>
          {auth.currentUser && (
            <Button
              aria-label="Sign out"
              className="text-button"
              onClick={() => void signOut(auth)}
            >
              <Icon name="logout" />
              Sign out of this account
            </Button>
          )}
          {error && <Message error>{error}</Message>}
        </section>
        <div
          className="journey-illustration"
          role="img"
          aria-label="Participate, earn recognition, and keep learning"
        >
          <div className="orbit" aria-hidden="true">
            <Icon name="learning" />
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
          <Icon name="workshops" />
          <h2>Your learning record</h2>
          <p>
            A lasting home for your workshops, individual results and team
            contributions.
          </p>
        </article>
        <article>
          <Icon name="certificate" />
          <h2>Recognition you can keep</h2>
          <p>
            Download certificates after facilitator verification. You control
            public verification.
          </p>
        </article>
        <article>
          <Icon name="community" />
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
        <Brand />
        <p className="sidebar-caption">A place for your progress.</p>
        <nav aria-label="Main navigation">
          {(
            [
              ["/", "home", "My learning"],
              ["/workshops", "workshops", "My workshops"],
              ["/certificates", "certificate", "Certificates"],
              ["/community", "community", "Community"],
              ["/profile", "person", "Profile"],
            ] as [string, IconName, string][]
          ).map(([path, icon, label]) => (
            <NavLink key={path} to={path} end={path === "/"}>
              <Icon name={icon} />
              <span className="nav-label">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <Link to="/staff">
            <Icon name="admin" />
            <span>Workshop staff</span>
          </Link>
          <Link to="/privacy">
            <Icon name="help" />
            <span>Privacy</span>
          </Link>
          {administrator && (
            <a href={adminUrl()}>
              <Icon name="admin" />
              <span>Administrator portal</span>
            </a>
          )}
          <Theme />
          <small>{user.email}</small>
          <Button
            aria-label="Sign out"
            className="text-button"
            onClick={() => {
              interaction("auth.signed-out");
              void signOut(auth);
            }}
          >
            <Icon name="logout" />
            Sign out
          </Button>
        </div>
      </aside>
      <main id="main-content" tabIndex={-1} className="workspace">
        <div className="workspace-top">
          <div className="top-title">
            <Icon name="learning" />
            <span>Your learning</span>
          </div>
          <div className="account-chip">
            <span className="avatar" aria-hidden="true">
              {(profile?.name || user.displayName || "L")
                .slice(0, 1)
                .toUpperCase()}
            </span>
            <small>{profile?.name || user.displayName || "Learner"}</small>
          </div>
          <AccountMenu
            email={user.email}
            items={[
              { label: "Workshop staff", href: "#/staff" },
              { label: "Privacy", href: "#/privacy" },
              ...(administrator
                ? [{ label: "Administrator portal", href: adminUrl() }]
                : []),
            ]}
            onSignOut={() => void signOut(auth)}
          />
        </div>
        {error && <Message error>{error}</Message>}
        {hasMore && (
          <div className="panel stack">
            <p>
              Showing {rows?.length} workshop records. Counts and milestones
              below cover loaded records; the Inspi credit total comes from the
              complete server calculation.
            </p>
            <Button className="button secondary" onClick={loadMore}>
              Load more workshop records
            </Button>
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
          <Route path="/workshops/:sid" element={<WorkshopDetail />} />
          <Route path="/certificates" element={<Certificates user={user} />} />
          <Route path="/community" element={<Community />} />
          <Route
            path="/profile"
            element={
              profile === undefined ? (
                <Loading>Loading your profile…</Loading>
              ) : (
                <Profile key={user.uid} user={user} profile={profile} />
              )
            }
          />
          <Route
            path="/staff"
            element={
              administrator === null ? (
                <Loading>Checking staff access…</Loading>
              ) : administrator ? (
                <div className="panel stack">
                  <h1>Administrator portal</h1>
                  <p>
                    Open the dedicated administrator app to manage learning
                    records.
                  </p>
                  <Button href={adminUrl()}>Open administrator portal</Button>
                </div>
              ) : (
                <Staff />
              )
            }
          />
          <Route
            path="/admin"
            element={
              administrator === null ? (
                <Loading>Checking administrator access…</Loading>
              ) : administrator ? (
                <div className="panel stack">
                  <h1>Administrator portal</h1>
                  <Button href={adminUrl()}>Open administrator portal</Button>
                </div>
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
                <Loading>Connecting to your account…</Loading>
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
                      <header className="public-header">
                        <Brand />
                        <Theme />
                      </header>
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
          <Loading>Loading your page…</Loading>
        </main>
      }
    >
      <Application />
    </Suspense>
  );
}
