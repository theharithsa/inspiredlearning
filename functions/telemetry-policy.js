import { HttpsError } from "firebase-functions/v2/https";
import { createRequire } from "node:module";
const { HttpsError: CommonJsHttpsError } = createRequire(import.meta.url)(
  "firebase-functions/v2/https",
);
const rejected = new Set([
  "invalid-argument",
  "unauthenticated",
  "permission-denied",
  "not-found",
  "failed-precondition",
  "already-exists",
  "resource-exhausted",
]);
export const errorOutcome = (error) =>
  (error instanceof HttpsError || error instanceof CommonJsHttpsError) &&
  rejected.has(error.code)
    ? "rejected"
    : "failure";
export async function boundedFlush(flush, timeoutMs = 1500) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve()
        .then(flush)
        .then(
          () => "flushed",
          () => "failed",
        ),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve("timeout"), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
