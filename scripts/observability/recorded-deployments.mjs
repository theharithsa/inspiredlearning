import { isDeepStrictEqual } from "node:util";
import { hostingFacts, deploymentCoverage } from "./deployment.mjs";
export function recordedDeploymentEvents(receipts) {
  if (!Array.isArray(receipts) || receipts.length !== 2)
    throw Error("Incomplete recorded Hosting observation");
  deploymentCoverage(receipts);
  return receipts.flatMap((receipt) => {
    if (
      receipt.schema !== 1 ||
      receipt.provider !== "firebase-hosting" ||
      receipt.events?.length !== 2
    )
      throw Error("Invalid recorded receipt");
    const verification = receipt.events[1].data;
    const regenerated = hostingFacts({
      surface: receipt.surface,
      manifest: receipt.manifest,
      before: receipt.source,
      after: receipt.source,
      live:
        verification["verification.manifest"] === true
          ? receipt.manifest
          : null,
      checks: {
        api: verification["verification.api"],
        anonymousAdminDenied:
          verification["verification.anonymous_admin_denied"],
      },
      observedAt: receipt.observedAt,
    });
    if (!isDeepStrictEqual(regenerated, receipt))
      throw Error("Recorded observation mismatch");
    return regenerated.events;
  });
}
