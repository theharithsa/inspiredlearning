import { enterSurface } from "../ui/expressive-motion";
import packageJson from "../../package.json" with { type: "json" };
import AccountMenu from "../ui/AccountMenu";
import SidebarAction from "../ui/SidebarAction";
import Loading from "../ui/Loading";
import Button from "../ui/Button";
import { lazy, Suspense, useEffect, useState } from "react";
import { NavLink, Link, Routes, Route, useLocation } from "react-router-dom";
import {
  signInWithPopup,
  signOut,
  reauthenticateWithPopup,
  type User,
} from "firebase/auth";
import { auth, google } from "../firebase";
import { useUser, googleUser } from "../hooks";
import { apiFetch } from "../api";
import { identity, interaction, errorMessage } from "../observability";
import { learnerUrl } from "../surface";
import Brand from "../ui/Brand";
import Icon, { type IconName } from "../ui/Icon";
import Theme from "../ui/Theme";
import { Message } from "../components";
const Staff = lazy(() => import("../Staff"));
const Records = lazy(() => import("../StaffRecords"));
const Certificates = lazy(() => import("../AdminCertificates"));
const Tokens = lazy(() => import("../ApiTokens"));
const Delivery = lazy(() => import("../TelemetryHealth"));
interface Access {
  administrator: true;
  capabilities: string[];
  recentAuthMaxAgeSeconds: number;
}
const navigation: [string, IconName, string][] = [
  ["/", "home", "Overview"],
  ["/workshops", "workshops", "Workshops"],
  ["/learners", "person", "Learners"],
  ["/certificates", "certificate", "Certificates"],
  ["/requests", "requests", "Requests"],
  ["/integrations", "key", "Integrations"],
  ["/delivery", "activity", "Delivery"],
];
const tasks = [
  [
    "/workshops",
    "workshops",
    "Workshop participation",
    "Review attendance, close workshops and publish verified results.",
  ],
  [
    "/learners",
    "person",
    "Learner records",
    "Find a learner and make a reasoned correction to their record.",
  ],
  [
    "/requests",
    "requests",
    "Support requests",
    "Review corrections and manage learner-requested removal.",
  ],
  [
    "/certificates",
    "certificate",
    "Certificate register",
    "Find participation and award certificates, versions and signed previews.",
  ],
  [
    "/integrations",
    "key",
    "API access",
    "Create narrowly scoped credentials and revoke access when it is no longer needed.",
  ],
  [
    "/delivery",
    "activity",
    "Delivery health",
    "Inspect failed event deliveries and request an audited retry.",
  ],
] as [string, IconName, string, string][];
function Overview() {
  return (
    <>
      <header className="page-heading">
        <span className="eyebrow">ADMINISTRATION</span>
        <h1>Manage learning records.</h1>
        <p>
          Review participation, support learners and keep their achievements
          accurate.
        </p>
      </header>
      <div className="task-grid">
        {tasks.map(([path, icon, title, copy]) => (
          <Link key={path} to={path} className="task-card">
            <Icon name={icon} />
            <div>
              <h2>{title}</h2>
              <p>{copy}</p>
            </div>
            <Icon name="arrow" />
          </Link>
        ))}
      </div>
    </>
  );
}
function RouteHeading({ title, copy }: { title: string; copy: string }) {
  return (
    <header className="page-heading compact">
      <span className="eyebrow">ADMINISTRATION</span>
      <h1>{title}</h1>
      <p>{copy}</p>
    </header>
  );
}
function Workspace() {
  const { pathname } = useLocation();
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    document.title = `${navigation.find(([path]) => path === pathname)?.[2] || "Administration"} · InspiredLearning Admin`;
    interaction("page.view");
    let observer: MutationObserver | undefined;
    let stopMotion: (() => void) | undefined;
    const focus = () => {
      const h = document.querySelector<HTMLElement>("main h1");
      if (!h) return false;
      h.tabIndex = -1;
      h.focus({ preventScroll: true });
      const surface = h.closest<HTMLElement>(".page-heading");
      if (surface) stopMotion = enterSurface(surface);
      window.scrollTo(0, 0);
      observer?.disconnect();
      return true;
    };
    if (!focus()) {
      observer = new MutationObserver(focus);
      observer.observe(document.body, { childList: true, subtree: true });
    }
    return () => {
      observer?.disconnect();
      stopMotion?.();
    };
  }, [pathname]);
  async function verify() {
    const user = auth.currentUser;
    if (!user) return;
    setBusy(true);
    setMessage("");
    try {
      await reauthenticateWithPopup(user, google);
      if (auth.currentUser?.uid !== user.uid)
        throw Error("Your account changed. Sign in again.");
      await user.getIdToken(true);
      setMessage(
        "Identity verified. Sensitive actions are available for five minutes.",
      );
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app-shell admin-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to main content
      </a>
      <aside className="sidebar">
        <Brand />
        <p className="sidebar-caption">Administrator workspace</p>
        <nav aria-label="Administrator navigation">
          {navigation.map(([path, icon, label], i) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/"}
              className={i > 4 ? "mobile-secondary" : undefined}
            >
              <Icon name={icon} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <a href={learnerUrl()}>
            <Icon name="learning" />
            <span>Learner portal</span>
          </a>
          <Theme navigation />
          <SidebarAction
            icon="logout"
            label="Sign out"
            onClick={() => void signOut(auth)}
          >
            Sign out
          </SidebarAction>
        </div>
      </aside>
      <main id="main-content" tabIndex={-1} className="workspace">
        <div className="workspace-top">
          <div className="top-title">
            <Icon name="admin" />
            <span>InspiredLearning Admin</span>
          </div>
          <AccountMenu
            name={auth.currentUser?.displayName || "Administrator"}
            photoURL={auth.currentUser?.photoURL}
            email={auth.currentUser?.email}
            items={[
              { label: "Integrations", href: "#/integrations" },
              { label: "Delivery health", href: "#/delivery" },
              { label: "Learner portal", href: learnerUrl() },
            ]}
            onSignOut={() => void signOut(auth)}
          />
        </div>
        <div className="reauth-banner">
          <p>
            Google verification is required for sensitive changes and
            administrator PDF exports.
          </p>
          <Button
            className="button secondary"
            disabled={busy}
            busy={!!busy}
            onClick={() => void verify()}
          >
            Verify with Google
          </Button>
        </div>
        {message && <Message>{message}</Message>}
        <Suspense fallback={<Loading>Loading administrator tools…</Loading>}>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/workshops" element={<Staff />} />
            <Route
              path="/learners"
              element={
                <>
                  <RouteHeading
                    title="Learner records"
                    copy="Look up an authorized record and review changes before saving."
                  />
                  <Records showRequests={false} />
                </>
              }
            />
            <Route
              path="/requests"
              element={
                <>
                  <RouteHeading
                    title="Support requests"
                    copy="Resolve corrections and learner-requested removal with a review reason."
                  />
                  <Records />
                </>
              }
            />
            <Route
              path="/certificates"
              element={
                <>
                  <RouteHeading
                    title="Certificate register"
                    copy="Review current and historical certificates without changing published credits."
                  />
                  <Certificates />
                </>
              }
            />
            <Route
              path="/integrations"
              element={
                <>
                  <RouteHeading
                    title="API access"
                    copy="Manage scoped integrations. Keep credentials limited to their intended work."
                  />
                  <Tokens />
                </>
              }
            />
            <Route
              path="/delivery"
              element={
                <>
                  <RouteHeading
                    title="Delivery health"
                    copy="Inspect server-confirmed events and recover failed deliveries."
                  />
                  <Delivery />
                </>
              }
            />
            <Route
              path="*"
              element={
                <section className="panel">
                  <h1>Page not found</h1>
                  <Link to="/">Return to overview</Link>
                </section>
              }
            />
          </Routes>
        </Suspense>
        <footer>InspiredLearning Admin · v{packageJson.version}</footer>
      </main>
    </div>
  );
}
export default function AdminApp() {
  const user = useUser();
  const [access, setAccess] = useState<{
      uid: string;
      user: User;
      allowed: boolean;
      error: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    identity(user || null);
    if (user) interaction("auth.signed-in");
  }, [user]);
  useEffect(() => {
    let active = true;
    if (!user || !googleUser(user)) return;
    void apiFetch<Access>("/api/v1/admin/access")
      .then((r) => {
        if (active)
          setAccess({
            uid: user.uid,
            user,
            allowed: r.administrator === true,
            error: "",
          });
      })
      .catch((e) => {
        if (active)
          setAccess({
            uid: user.uid,
            user,
            allowed: false,
            error: errorMessage(e),
          });
      });
    return () => {
      active = false;
    };
  }, [user]);
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== "visible" || !auth.currentUser) return;
      const current = auth.currentUser;
      const uid = current.uid;
      void apiFetch<Access>("/api/v1/admin/access")
        .then((r) => {
          if (auth.currentUser?.uid === uid)
            setAccess({
              uid,
              user: current,
              allowed: r.administrator,
              error: "",
            });
        })
        .catch((e) => {
          if (auth.currentUser?.uid === uid)
            setAccess({
              uid,
              user: current,
              allowed: false,
              error: errorMessage(e),
            });
        });
    };
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, []);
  if (
    user === undefined ||
    (user &&
      googleUser(user) &&
      (access?.uid !== user.uid || access.user !== user))
  )
    return (
      <main className="admin-login">
        <Loading>Checking administrator access…</Loading>
      </main>
    );
  if (
    user &&
    googleUser(user) &&
    access?.uid === user.uid &&
    access.user === user &&
    access.allowed
  )
    return <Workspace key={user.uid} />;
  return (
    <main className="admin-login">
      <section className="admin-login-card stack">
        <Brand />
        <span className="eyebrow">ADMINISTRATOR SIGN-IN</span>
        <h1>Learning, thoughtfully managed.</h1>
        <p>
          Sign in with your authorized Google account to manage workshops,
          certificates and learner support.
        </p>
        {user && (
          <Message error>
            {access?.error ||
              "This account does not have administrator access."}
          </Message>
        )}
        {error && <Message error>{error}</Message>}
        <Button
          className="button large"
          disabled={busy}
          busy={!!busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              if (auth.currentUser) await signOut(auth);
              await signInWithPopup(auth, google);
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Opening Google…" : "Continue with Google"}
        </Button>
        {user && (
          <Button
            aria-label="Sign out"
            className="text-button"
            onClick={() => void signOut(auth)}
          >
            <Icon name="logout" />
            Sign out of this account
          </Button>
        )}
        <hr className="design-divider" />
        <a href={learnerUrl()}>Looking for your learning record?</a>
        <Theme />
      </section>
    </main>
  );
}
