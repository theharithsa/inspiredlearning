import fs from "node:fs";
import { spawn } from "node:child_process";
const secret = "functions/.secret.local",
  created = !fs.existsSync(secret);
if (created)
  fs.writeFileSync(secret, "DYNATRACE_PLATFORM_TOKEN=emulator-placeholder\n", {
    mode: 0o600,
  });
const port = Number(process.env.INSPI_REHEARSAL_FUNCTIONS_PORT || 5001);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid rehearsal functions port");
const config = `.firebase-rehearsal-${process.pid}.json`;
const settings = JSON.parse(fs.readFileSync("firebase.rehearsal.json", "utf8"));
settings.emulators.functions.port = port;
fs.writeFileSync(config, JSON.stringify(settings));
const child = spawn(
  "npx",
  [
    "--no-install",
    "firebase",
    "emulators:exec",
    "--config",
    config,
    "--project",
    "demo-chaicart",
    "--only",
    "auth,firestore,functions",
    "npm run test:browser",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      GCLOUD_PROJECT: "demo-chaicart",
      VITE_FUNCTIONS_EMULATOR_PORT: String(port),
    },
  },
);
const cleanup = () => {
  fs.rmSync(config, { force: true });
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
