import { lazy, Suspense } from "react";
import ErrorBoundary from "./ErrorBoundary";
import { createRoot } from "react-dom/client";
import "./styles.css";
const App = lazy(() =>
  import("./App").then(async (module) => {
    const { cacheReady } = await import("./firebase");
    await cacheReady;
    const monitoring = await import("./observability");
    monitoring.installClicks();
    return module;
  }),
);
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <Suspense
      fallback={
        <main className="public-page">
          <p role="status">Connecting to InspiredLearning…</p>
        </main>
      }
    >
      <App />
    </Suspense>
  </ErrorBoundary>,
);
