import Loading from "./ui/Loading";
import SettingsHost from "./ui/Settings";
import ConfirmHost from "./ui/Confirm";
/* eslint-disable react/only-export-components -- Application entrypoint. */
import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import ErrorBoundary from "./ErrorBoundary";
import { applyTheme } from "./ui/Theme";
import "./styles.css";
applyTheme();
const AdminApp = lazy(async () => {
  const [module, firebase, monitoring] = await Promise.all([
    import("./admin/App"),
    import("./firebase"),
    import("./observability"),
  ]);
  await Promise.all([firebase.cacheReady, firebase.authReady]);
  monitoring.installClicks();
  return module;
});
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <ConfirmHost />
    <SettingsHost />
    <Suspense
      fallback={
        <main className="admin-login">
          <Loading>Opening InspiredLearning Admin…</Loading>
        </main>
      }
    >
      <HashRouter>
        <AdminApp />
      </HashRouter>
    </Suspense>
  </ErrorBoundary>,
);
