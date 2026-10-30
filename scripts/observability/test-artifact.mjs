import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
export function parseArchive(buffer) {
  if (buffer.length > 1000000) throw Error("Test archive too large");
  const result = spawnSync(
    "python3",
    [fileURLToPath(new URL("./read-test-archive.py", import.meta.url))],
    { input: buffer, maxBuffer: 2000000, timeout: 10000 },
  );
  if (result.status !== 0) throw Error("Unsafe or invalid test archive");
  return JSON.parse(result.stdout.toString());
}

export function selectArtifact(listing, identity, source) {
  if (
    source.event !== "push" ||
    source.head_branch !== "main" ||
    source.id !== identity.runId ||
    source.run_attempt !== identity.attempt ||
    source.head_sha !== identity.sha
  )
    throw Error("Only exact main-push artifacts are trusted");
  if (!Array.isArray(listing.artifacts) || listing.total_count > 100)
    throw Error("Artifact bound exceeded");
  const matches = listing.artifacts.filter(
    (a) => a.name === `structured-tests-${identity.attempt}`,
  );
  if (matches.length > 1) throw Error("Ambiguous test artifact");
  const artifact = matches[0];
  if (!artifact) return null;
  if (
    !Number.isSafeInteger(artifact.id) ||
    artifact.id < 1 ||
    artifact.expired !== false ||
    !Number.isSafeInteger(artifact.size_in_bytes) ||
    artifact.size_in_bytes < 1 ||
    artifact.size_in_bytes > 1000000 ||
    artifact.workflow_run?.id !== identity.runId ||
    artifact.workflow_run?.head_sha !== identity.sha
  )
    throw Error("Untrusted test artifact");
  return artifact;
}
