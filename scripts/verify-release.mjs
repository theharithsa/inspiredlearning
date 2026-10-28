import { readFileSync } from "node:fs";
import { verifiedDeployment } from "./observability/release-verification.mjs";
// Read-only post-deployment checks; no deploy, identity mutation or synthetic awards.
for (const [surface, folder, origin] of [
  ["learner", "dist", "https://inspi.in"],
  ["admin", "dist-admin", "https://admin.inspi.in"],
]) {
  const manifest = JSON.parse(readFileSync(folder + "/version.json", "utf8"));
  const response = await fetch(origin + "/version.json", {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error(surface + " artifact metadata unavailable");
  const live = await response.json();
  const verified = verifiedDeployment(manifest, live, surface);
  const api = await fetch(origin + "/api/openapi.json", {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!api.ok || (await api.json()).info.version !== manifest.apiContract)
    throw Error(surface + " API contract mismatch");
  const denied = await fetch(origin + "/api/v1/admin/access", {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (denied.status !== 401)
    throw Error(surface + " anonymous admin denial failed");
  console.log(
    JSON.stringify({
      ...verified,
      origin,
      artifactAndPublicApi: "verified",
      googleLoginAndPrivateJourneys: "not-verified",
      tenantObservability: "not-verified",
    }),
  );
}
