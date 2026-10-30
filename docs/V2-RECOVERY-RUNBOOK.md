# Independent v2 recovery

Scope: InspiredLearning only, Firebase project `chaicloud-workshop`. This is a documented/tabletop procedure, not evidence of a production rollback. Every production recovery needs explicit scoped approval. Never roll back learner records, certificates, credits, shared Authentication, Live rules/indexes or privacy markers with frontend assets.

## Choose the smallest recovery

| Fault | Recovery | Preserve |
| --- | --- | --- |
| Learner frontend regression | Previous immutable learner Hosting version | Admin release, Functions and domain data |
| Admin frontend regression | Previous immutable admin Hosting version | Learner release, Functions and domain data |
| Backend regression | Reviewed compatible Functions artifact/configuration | Both sites where compatible, shared limits and privacy/outbox guards |
| Admin domain/Auth configuration | Restore verified previous configuration for that origin | Shared UIDs, learner domain and authorized domains used by Live |
| Telemetry transport failure | Preserve receipts; correct exporter and retry reporting | Successful deployment and business transactions |

## Hosting runbook

1. Record approval, incident, UTC time, operator, site and actual current release/version. Read both live `version.json` manifests and provider release history immediately before acting. Stop if another release is in progress or the expected current revision changed.
2. Select a retained immutable version whose API/auth/assets remain compatible. Confirm the version is still available in Firebase. Do not rebuild an old commit and call it the same artifact.
3. Current known 2.2.0 versions from the dated [release evidence](RELEASE-2.2.0.md): learner `7a60990658b3e00b`, admin `d858b41a07625334`. Historical 2.1.3 targets: learner `74c1fc945f26b967`, admin `09fb3f38660686a8`. These identifiers are examples for recovery selection, not permission or proof of current retention. Prefer the latest known-good compatible release.
4. In Firebase Hosting Release history, select the approved previous release and **Roll back** for the affected site only: `inspiredlearning-vh` or `inspiredlearning-admin-vh`. This creates a new release pointing to the selected existing version. Leave the other site unchanged.
5. An alternative with pinned Firebase CLI 15.34.2 is `hosting:clone` from a version to the same site's live channel. The parser accepts `[project:]site@version` and `[project:]site:channel`. For example, only after approval and target verification:

```sh
npx --no-install firebase hosting:clone \
  chaicloud-workshop:inspiredlearning-vh@74c1fc945f26b967 \
  chaicloud-workshop:inspiredlearning-vh:live \
  --project chaicloud-workshop
```

For admin recovery substitute the admin site and approved admin version in **both** arguments. This command is a production mutation, has no safe implied dry run and may check API/Auth settings. A clone may be recorded by the provider as DEPLOY; report that actual type, not an invented ROLLBACK. Console rollback is preferred when provider rollback semantics are needed.

6. Read the provider release again, record new release ID/time/type and selected version, then verify both origins. Check target manifest/revision/surface, asset loads, headers/cache/CSP, public certificate verification and expected anonymous admin denial. Run approved private Google OAuth/role/reauth checks separately. Confirm the unaffected origin retained its release. Record failures independently, not as an overall success.
7. Capture provider-confirmed delivery facts and separate probe outcomes using [deployment capture](OBSERVABILITY-2.2.1.md). Never relabel an old release publication as this deployment or repeatedly deploy because reporting failed. Verify transport and tenant searchability separately.

## Compatible Functions recovery

Hosting recovery leaves Functions 2.0.1 / API 1.5.0 in place. Do not revert to 2.0.0 merely because an old frontend used it. Before a backend recovery, verify the archived exact source/artifact, dependency lock, configuration and API compatibility with **both** active frontend versions. Require a separate approved backend release plan, current provider metadata and the privacy/credit/certificate/outbox/Auth regression gates in [testing](TESTING.md).

Deploy only the `inspiredlearning` codebase in `asia-south1`. Preserve approved production `SHARED_RATE_LIMITS=true`, existing secrets and limits. Recheck all nine function states, the API contract and denied/authorized journeys. Do not deploy shared Live rules/indexes, weaken erasure/blocked-reimport guards, replay learner mutations or roll back stored records. A source revert alone is not an operational backend recovery rehearsal.

## Auth and DNS recovery

Before any approved change, retain private verified configuration snapshots and exact domain records/TTL/certificate state. Recover only the affected origin from its known-good snapshot. Preserve shared Firebase project/UIDs, learner sign-in persistence, admin tab/session persistence, Google provider and 300-second sensitive-operation reauthentication. No mandatory MFA, new roles or blanket authorized-domain removal follows from recovery.

If admin cutover fails, keep learners and stable Firebase certificate/printed-QR verification URLs available. Recheck DNS resolution, TLS, Hosting mapping and fresh Google OAuth independently; successful HTTP alone does not prove OAuth. Do not publish private console screenshots, session URLs or account details.

## Tabletop record — 31 October 2026

**Passed (documentation/source inspection):** pinned CLI source supports same-site immutable-version clone; separate learner/admin targets, compatibility baseline, public/private checks and reporting retry boundaries are mapped above. Walked through learner-only failure, admin-only failure and telemetry-only failure; each preserves the unaffected site and domain data.

**Not run:** production rollback, clone, Functions recovery deployment, DNS/Auth configuration mutation or disaster recovery against production. This runbook is not a claim that those operations were rehearsed live. Provider availability and configuration must be refreshed at execution time. Official references: [Hosting release management](https://firebase.google.com/docs/hosting/manage-hosting-resources), [release creation API](https://firebase.google.com/docs/reference/hosting/rest/v1beta1/sites.releases/create).
