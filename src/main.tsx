/* eslint-disable react/only-export-components -- Application bootstrap has no reusable exports. */
import { lazy, Suspense } from "react";
import ErrorBoundary from "./ErrorBoundary";
import { HashRouter, Routes, Route } from "react-router-dom";
import { createRoot } from "react-dom/client";
import "./styles.css";
const App = lazy(async () => {
  const [module, { cacheReady }, monitoring] = await Promise.all([
    import("./App"),
    import("./firebase"),
    import("./observability"),
  ]);
  await cacheReady;
  monitoring.installClicks();
  return module;
});
const Verify = lazy(() => import("./Verify"));
const Privacy = lazy(() => import("./Privacy"));
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <Suspense
      fallback={
        <main className="public-page">
          <p role="status">Connecting to InspiredLearning…</p>
        </main>
      }
    >
      <HashRouter>
        <Routes>
          <Route path="/verify/:id" element={<Verify />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="*" element={<App />} />
        </Routes>
      </HashRouter>
    </Suspense>
  </ErrorBoundary>,
);
