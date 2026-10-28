import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
export default class Reporter {
  onBegin(_config, suite) {
    this.suite = suite;
  }
  onEnd(result) {
    if (!process.env.TEST_REPORT_DIR) return;
    const counts = {
      tests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      flaky: 0,
      cancelled: 0,
      missing: 0,
    };
    for (const test of this.suite.allTests()) {
      counts.tests++;
      if (!test.results.length) {
        counts.missing++;
        continue;
      }
      const outcome = test.outcome(),
        last = test.results.at(-1);
      if (last.status === "interrupted") counts.cancelled++;
      else if (outcome === "expected") counts.passed++;
      else if (outcome === "flaky") counts.flaky++;
      else if (outcome === "skipped") counts.skipped++;
      else counts.failed++;
    }
    mkdirSync(process.env.TEST_REPORT_DIR, { recursive: true });
    writeFileSync(
      path.join(process.env.TEST_REPORT_DIR, "browser.json"),
      JSON.stringify({
        schema: 1,
        runner: "playwright",
        complete: counts.missing === 0,
        success: result.status === "passed",
        counts,
        durationMs: result.duration,
      }),
    );
  }
}
