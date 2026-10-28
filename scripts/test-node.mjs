import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const [suite, ...files] = process.argv.slice(2);
if (!/^[a-z-]+$/.test(suite || "")) throw Error("Invalid suite");
const root = fileURLToPath(new URL("../", import.meta.url)),
  args = ["--import", path.join(root, "test/setup-env.mjs"), "--test"];
if (process.env.TEST_REPORT_DIR) {
  mkdirSync(process.env.TEST_REPORT_DIR, { recursive: true });
  args.push(
    "--test-reporter=spec",
    "--test-reporter=" +
      path.join(root, "scripts/observability/node-reporter.mjs"),
    "--test-reporter-destination=stdout",
    "--test-reporter-destination=" +
      path.resolve(process.env.TEST_REPORT_DIR, suite + ".json"),
  );
}
const child = spawn(process.execPath, [...args, ...files], {
  stdio: "inherit",
});
child.on("error", () => {
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
