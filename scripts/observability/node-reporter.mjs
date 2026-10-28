// Runner-owned structural summary only. Never copy assertion/stdout/fixture text.
export default async function* reporter(events) {
  let summary;
  for await (const event of events)
    if (event.type === "test:summary" && !event.data.file) summary = event.data;
  if (!summary) {
    yield JSON.stringify({ schema: 1, runner: "node", complete: false }) + "\n";
    return;
  }
  const { tests, passed, failed, cancelled, skipped, todo } = summary.counts;
  yield JSON.stringify({
    schema: 1,
    runner: "node",
    complete: true,
    success: summary.success,
    counts: { tests, passed, failed, cancelled, skipped, todo },
    durationMs: summary.duration_ms,
  }) + "\n";
}
