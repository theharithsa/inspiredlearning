import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { renameSync } from "node:fs";
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
    envDir: process.cwd(),
    plugins: [
      {
        name: "source-artifact-identity",
        generateBundle() {
          let revision: string | null = null,
            dirty = true;
          try {
            revision = execFileSync("git", ["rev-parse", "HEAD"], {
              encoding: "utf8",
              stdio: ["ignore", "pipe", "ignore"],
            }).trim();
            dirty = !!execFileSync(
              "git",
              ["status", "--porcelain", "--untracked-files=normal"],
              { encoding: "utf8" },
            ).trim();
          } catch {
            /* A source-only rehearsal copy is explicitly not a release artifact. */
          }
          this.emitFile({
            type: "asset",
            fileName: "version.json",
            source: JSON.stringify({
              version: JSON.parse(readFileSync("package.json", "utf8")).version,
              revision: dirty ? null : revision,
              sourceState: dirty ? "working-tree" : "clean",
              surface: mode === "admin" ? "admin" : "learner",
              apiContract: "1.5.0",
              environment:
                env.VITE_FIREBASE_PROJECT_ID === defaults.emulatorProject
                  ? "rehearsal"
                  : env.VITE_FIREBASE_PROJECT_ID === "chaicloud-workshop" &&
                      env.VITE_FIREBASE_API_KEY &&
                      env.VITE_FIREBASE_APP_ID &&
                      env.VITE_FIREBASE_AUTH_DOMAIN
                    ? "production"
                    : "unconfigured",
            }),
          });
        },
      },
      react(),
      {
        name: "admin-entry-output",
        closeBundle() {
          if (command === "build" && mode === "admin")
            renameSync("dist-admin/admin.html", "dist-admin/index.html");
        },
      },
      {
        name: "approved-rum-tag",
        transformIndexHtml: (html) =>
          html.replace(
            "<!-- APP_RUM -->",
            rum
              ? `<script src="${rum.replaceAll('"', "&quot;")}" crossorigin="anonymous" async data-app-rum="async"></script>`
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
    build: {
      chunkSizeWarningLimit: 500,
      outDir: mode === "admin" ? "dist-admin" : "dist",
      rolldownOptions: {
        input: mode === "admin" ? "admin.html" : "index.html",
      },
    },
  };
});
