export function verifiedRelease(release, tagRevision, version) {
  if (
    !release ||
    !Number.isSafeInteger(release.id) ||
    release.draft ||
    !release.published_at ||
    !/^v?\d+\.\d+\.\d+$/.test(release.tag_name || "") ||
    release.tag_name.replace(/^v/, "") !== version ||
    !/^[0-9a-f]{40}$/.test(tagRevision || "")
  )
    throw Error("Release/tag/package mismatch");
  return { revision: tagRevision, version, tag: release.tag_name };
}
export function verifiedDeployment(manifest, live, expectedSurface) {
  if (
    !manifest ||
    !live ||
    manifest.sourceState !== "clean" ||
    manifest.environment !== "production" ||
    !/^[0-9a-f]{40}$/.test(manifest.revision || "") ||
    manifest.surface !== expectedSurface ||
    live.sourceState !== "clean" ||
    live.environment !== "production" ||
    live.revision !== manifest.revision ||
    live.version !== manifest.version ||
    live.surface !== manifest.surface ||
    live.apiContract !== manifest.apiContract
  )
    throw Error("Deployed artifact not verified");
  return {
    revision: manifest.revision,
    version: manifest.version,
    surface: expectedSurface,
  };
}
