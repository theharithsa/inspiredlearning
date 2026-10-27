import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import defaults from "./functions/runtime-defaults.json" with { type: "json" };

// API routes are root-absolute; deployment is explicitly origin-root Hosting.
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const rum =
    command === "serve" || env.VITE_USE_EMULATORS === "true"
      ? ""
      : (env.VITE_DYNATRACE_RUM_SRC ?? defaults.rumSrc);
  if (
    rum &&
    (new URL(rum).protocol !== "https:" ||
      new URL(rum).hostname !== "js-cdn.dynatrace.com")
  )
    throw new Error("Use the approved HTTPS Dynatrace CDN.");
  return {
    base: "/",
    plugins: [
      react(),
      {
        name: "approved-rum-tag",
        transformIndexHtml: (html) =>
          html.replace(
            "<!-- APP_RUM -->",
            rum
              ? `<script src="${rum.replaceAll('"', "&quot;")}" crossorigin="anonymous"></script>`
              : "",
          ),
      },
    ],
    server: {
      proxy:
        process.env.VITE_USE_EMULATORS === "true"
          ? {
              "/api": {
                target: `http://127.0.0.1:${env.VITE_FUNCTIONS_EMULATOR_PORT || defaults.ports.functions}`,
                changeOrigin: true,
                rewrite: (path) =>
                  `/${defaults.emulatorProject}/${defaults.region}/learningApi` +
                  path,
              },
            }
          : undefined,
    },
    // Retain the standard warning threshold; public routes do not load the Firebase chunk.
    build: { chunkSizeWarningLimit: 500 },
  };
});
