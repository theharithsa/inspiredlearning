// Scheduler overlap must not turn repeated observations into evidence of sustained growth.
export function backlogHistory(previous, pending, now) {
  const points = (Array.isArray(previous) ? previous : []).filter(
    (p) =>
      Number.isFinite(p.at) &&
      Number.isSafeInteger(p.pending) &&
      p.at >= now - 30 * 60_000 &&
      p.at <= now,
  );
  if (!points.length || now - points.at(-1).at >= 60_000)
    points.push({ at: now, pending });
  const start = points.findLastIndex((p) => p.at <= now - 15 * 60_000);
  const window = start < 0 ? [] : points.slice(start);
  const growing =
    window.length >= 4 &&
    window.at(-1).at === now &&
    window
      .slice(1)
      .every(
        (p, i) =>
          p.pending > window[i].pending && p.at - window[i].at <= 7 * 60_000,
      );
  return { points: points.slice(-32), growingFor15Minutes: growing };
}
export async function observeBacklog(db, sample, now = Date.now()) {
  const ref = db.doc("learningTelemetryHealth/backlog");
  const result = await db.runTransaction(async (tx) => {
    const old = await tx.get(ref),
      prior = old.data();
    // A duplicate or stale scheduler invocation cannot overwrite a newer observation.
    if (prior?.observedAt >= now) return prior;
    const state = backlogHistory(prior?.points, sample.pending, now);
    tx.set(ref, { ...state, observedAt: now });
    return state;
  });
  return {
    ...sample,
    pendingGrowing15Minutes: result.growingFor15Minutes ? 1 : 0,
  };
}
