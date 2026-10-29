import { createHash } from "node:crypto";
import { HttpsError } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
export const RATE_WINDOW_MS = 60000;
export const rateId = (key) =>
  createHash("sha256")
    .update("inspiredlearning-rate-v1:" + key)
    .digest("hex");
// No raw UID/IP/token is stored. Hashes remain pseudonymous, private metadata.
export function createSharedRateLimiter(
  db,
  { now = Date.now, observe = () => {} } = {},
) {
  const lanes = new Map();
  return async function rate(input, limit = 120) {
    const items = Array.isArray(input) ? input : [{ key: input, limit }];
    if (
      !items.length ||
      items.length > 3 ||
      items.some(
        (x) =>
          !x ||
          typeof x !== "object" ||
          typeof x.key !== "string" ||
          !x.key ||
          x.key.length > 512 ||
          !Number.isSafeInteger(x.limit) ||
          x.limit < 1 ||
          x.limit > 120,
      )
    )
      throw new HttpsError("invalid-argument", "Invalid rate policy.");
    if (new Set(items.map((x) => x.key)).size !== items.length)
      throw new HttpsError("invalid-argument", "Duplicate rate policy.");
    // Serialize same-key requests within this worker; the database still decides admission globally.
    const lane = items
      .map((x) => rateId(x.key))
      .sort()
      .join(":");
    const previous = lanes.get(lane) || Promise.resolve();
    let release;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    lanes.set(lane, pending);
    await previous;
    try {
      let reads = 0,
        attemptedWrites = 0,
        attempts = 0;
      try {
        const result = await db.runTransaction(
          async (tx) => {
            attempts++;
            const time = now();
            const rows = await Promise.all(
              items.map(async (item) => {
                const ref = db
                  .collection("learningRateLimits")
                  .doc(rateId(item.key));
                reads++;
                const snap = await tx.get(ref);
                const d = snap.data();
                if (
                  d &&
                  (!Number.isSafeInteger(d.start) ||
                    d.start < 0 ||
                    !Number.isSafeInteger(d.count) ||
                    d.count < 0)
                )
                  throw new Error("Malformed rate counter");
                const fresh = !!d && time - d.start < RATE_WINDOW_MS;
                return {
                  item,
                  ref,
                  start: fresh ? d.start : time,
                  count: fresh ? d.count : 0,
                };
              }),
            );
            const denied = rows.filter((r) => r.count >= r.item.limit);
            if (denied.length)
              return {
                retryAfterSeconds: Math.max(
                  ...denied.map((r) =>
                    Math.max(
                      1,
                      Math.ceil((r.start + RATE_WINDOW_MS - time) / 1000),
                    ),
                  ),
                ),
              };
            for (const r of rows) {
              tx.set(r.ref, {
                start: r.start,
                count: r.count + 1,
                expiresAt: Timestamp.fromMillis(r.start + RATE_WINDOW_MS * 2),
              });
              attemptedWrites++;
            }
            return {};
          },
          { maxAttempts: 5 },
        );
        try {
          observe({
            reads,
            attemptedWrites,
            committedWrites: result.retryAfterSeconds ? 0 : items.length,
            attempts,
            outcome: result.retryAfterSeconds ? "rejected" : "success",
          });
        } catch {
          /* Observation failure cannot bypass or block enforcement. */
        }
        if (result.retryAfterSeconds)
          throw new HttpsError(
            "resource-exhausted",
            "Please wait and try again.",
            {
              reason: "rate-limit",
              retryAfterSeconds: result.retryAfterSeconds,
            },
          );
      } catch (e) {
        if (
          e.code === "resource-exhausted" &&
          e.details?.reason === "rate-limit"
        )
          throw e;
        try {
          observe({
            reads,
            attemptedWrites,
            committedWrites: 0,
            attempts,
            outcome: "failure",
          });
        } catch {}
        throw new HttpsError(
          "unavailable",
          "Request protection is temporarily unavailable. Please try again.",
        );
      }
    } finally {
      release();
      if (lanes.get(lane) === pending) lanes.delete(lane);
    }
  };
}
export async function cleanRateCounters(
  db,
  { now = Date.now, limit = 100 } = {},
) {
  const rows = await db
    .collection("learningRateLimits")
    .where("expiresAt", "<=", Timestamp.fromMillis(now()))
    .limit(limit)
    .get();
  if (rows.empty) return 0;
  return db.runTransaction(async (tx) => {
    const current = await Promise.all(rows.docs.map((d) => tx.get(d.ref)));
    const expired = current.filter(
      (d) =>
        d.exists &&
        typeof d.data().expiresAt?.toMillis === "function" &&
        d.data().expiresAt.toMillis() <= now(),
    );
    for (const d of expired) tx.delete(d.ref);
    return expired.length;
  });
}
