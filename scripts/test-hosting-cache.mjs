import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const output = resolve(`.firebase-rehearsal-hosting-${randomUUID()}.json`);
try {
  for (const [surface, source, dist] of [
    ["learner", "firebase.json", "dist"],
    ["admin", "firebase.admin.json", "dist-admin"],
  ]) {
    const cfg = JSON.parse(readFileSync(source));
    delete cfg.hosting.target;
    cfg.hosting.site = "demo-chaicart";
    cfg.hosting.public = dist;

    writeFileSync(
      output,
      JSON.stringify({
        hosting: cfg.hosting,
        emulators: {
          hosting: { host: "127.0.0.1", port: 5095 },
          hub: { host: "127.0.0.1", port: 4418 },
          logging: { host: "127.0.0.1", port: 4518 },
          ui: { enabled: false },
          singleProjectMode: true,
        },
      }),
    );
    const run = spawnSync(
      process.execPath,
      [
        "node_modules/firebase-tools/lib/bin/firebase.js",
        "emulators:exec",
        "--project",
        "demo-chaicart",
        "--config",
        output,
        "--only",
        "hosting",
        "node scripts/test-node.mjs hosting-cache test/hosting-cache.test.mjs",
      ],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          HOSTING_TEST_ORIGIN: "http://127.0.0.1:5095",
          HOSTING_TEST_SURFACE: surface,
        },
      },
    );
    if (run.status !== 0) {
      process.exitCode = run.status ?? 1;
      break;
    }
  }
} finally {
  rmSync(output, { force: true });
}
