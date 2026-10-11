import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Relative base so the build works on Firebase Hosting and on a GitHub Pages sub-path.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    proxy:
      process.env.VITE_USE_EMULATORS === "true"
        ? {
            "/api": {
              target: "http://127.0.0.1:5001",
              changeOrigin: true,
              rewrite: (path) =>
                "/demo-chaicart/asia-south1/learningApi" + path,
            },
          }
        : undefined,
  },
  // The Firebase SDK (Auth + Firestore with offline cache) is a single large, rarely-changing chunk.
  build: { chunkSizeWarningLimit: 900 },
});
