import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the build works on Firebase Hosting and on a GitHub Pages sub-path.
export default defineConfig({
  base: './',
  plugins: [react()],
  // The Firebase SDK (Auth + Firestore with offline cache) is a single large, rarely-changing chunk.
  build: { chunkSizeWarningLimit: 900 },
})
