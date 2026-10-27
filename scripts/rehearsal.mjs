import fs from "node:fs";
import { spawn } from "node:child_process";
const secret = "functions/.secret.local",
  created = !fs.existsSync(secret);
if (created)
  fs.writeFileSync(secret, "DYNATRACE_PLATFORM_TOKEN=emulator-placeholder\n", {
    mode: 0o600,
  });
const child = spawn(
  "npx",
  [
    "--no-install",
    "firebase",
    "emulators:exec",
    "--config",
    "firebase.rehearsal.json",
    "--project",
    "demo-chaicart",
    "--only",
    "auth,firestore,functions",
    "npm run test:browser",
  ],
  {
    stdio: "inherit",
    env: { ...process.env, GCLOUD_PROJECT: "demo-chaicart" },
  },
);
const cleanup = () => {
  if (created) fs.rmSync(secret, { force: true });
};
child.on("error", (e) => {
  cleanup();
  console.error(e.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  cleanup();
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
