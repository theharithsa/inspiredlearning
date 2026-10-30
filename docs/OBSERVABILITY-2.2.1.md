# Observability 2.2.1 source candidate — #77

App 2.2.1 adds browser observations and delivery tooling. Functions 2.0.1, API 1.5.0 and MCP 1.0.1 are unchanged. Production remains 2.2.0 until a separately approved Hosting release. No alert activation (#9), membership migration (#17), retention, email attribution, capacity or learner data changes are included.

| Journey / owner | New capture | Authority / limits |
| --- | --- | --- |
| Learner/admin browser | Route template, callable duration/outcome, authenticated REST route/method/status/duration and validated server request ID | Client-observed; not proof of commit or native trace ancestry. Expected auth/validation/quota rejections differ from technical failures. Discard completions across UID changes. |
| GitHub issue/PR/review/release | Stable schema-2 event IDs, source timestamps where available, separate observation timestamp, head/base/merge SHA and direct review transitions | Source-confirmed automation. No bodies, titles, emails, commands or assertion strings. Reopen/synchronize/dismissal without source occurrence time are explicitly observations. |
| PR closing-issue references | Bounded many-to-many GitHub GraphQL snapshot | Observed linkage, not proof of the original linking time. Same-repository only; cross-repository references fail visibly rather than exporting uncontrolled metadata. Explicit local milestones are developer-reported, never inferred from commits. |
| Checks jobs/steps | Attempt-specific source status and execution spans; service version from reporter package | Separate `inspiredlearning-delivery` OTel resource. Workflow span ends at the latest job completion, not mutable run updated_at. Unknown times do not become zero-duration spans. Metrics use only bounded phase/outcome. |
| Main-push test execution | Eleven known structured suite summaries downloaded by independent observer | CI-reported, not GitHub-verified test truth. PR artifacts are excluded. ZIP is parsed in memory, never extracted/executed; identity, size, traversal, duplicate entries, symlinks and schema/count bounds are checked. |
| Firebase Hosting releases | Provider release/version/type/original releaseTime; matched GitHub release tag/package/revision and live manifest | Provider-confirmed deploy or rollback, independent of GitHub release publication. Only the two InspiredLearning sites; no Functions/Live coverage claim. |
| Live public probes | Manifest/API contract/anonymous admin denial | Separate verification event with probe time, not a replayed deployment time. Private OAuth journeys, stored learner projections, CSP/assets and tenant proof remain additional release checks. |
| Export recovery | Sanitized local pending/failed/accepted state and bounded retry/drain | At least once with stable IDs; consumer deduplication required. HTTP 202 is BizEvent acceptance, not tenant searchability. Native 201 additionally requires every returned item to be OK. OTel SDK callback results do not certify partial acceptance or tenant visibility. |

## Deployment capture and replay

After an approved deployment and normal release checks, run from the reviewed checkout:

```sh
node scripts/observability/capture-deployment.mjs 2.2.0
```

Replace the version with the actual published, immutable release. This command **does not deploy**. It reads the existing configured Firebase CLI account (or ADC), the GitHub release/tag/package/OpenAPI via `gh`, live public endpoints and provider release metadata. It reads the release twice around probes and rejects a changed release. It projects only release ID, type, time, version ID/status; releaseUser and message are excluded. It records each surface independently, so a failure after the first leaves that receipt available rather than claiming a complete rollout. The source manifest is reconstructed from the verified tag and OpenAPI; this verifies manifest correlation, not every deployed file's byte integrity. Keep artifact checksum verification in the release process.

Local `.observability/receipts` and `.observability/spool` are ignored, owner-only files. A failed probe leaves the actual deployment fact and a failed verification fact. Aggregate coverage is partial, deployed-unverified or verified (only the three listed public checks). Receipt files are operator-owned evidence, not signed proofs or a customer input API. Do not import arbitrary receipts or spoof their authority. Local state has no automatic cleanup; preserve failures and choose a retention policy before long-running scheduling. This does not alter the Firestore learningTelemetry outbox retention.

Optional `--native` queues a CUSTOM_DEPLOYMENT marker only after provider/tag/manifest/probe verification. Original provider time must be within the supported 30-day window. Without an explicitly reviewed entity selector this is an **environment-associated** marker, not a claim that Dynatrace linked it to a service. Native ingestion permissions are separate from BizEvents/OTLP permissions; do not expand a token implicitly. Native item rejection is a failed send even with HTTP 201. Rollbacks use the observed ROLLBACK release and verified target version, not an inferred inverse operation.

Use a dedicated securely supplied `DYNATRACE_CI_TOKEN` and `DYNATRACE_ENDPOINT` to send reviewed records:

```sh
node scripts/observability/drain.mjs
# Only after correcting a permanent rejection:
node scripts/observability/drain.mjs --retry-failed
```

No value belongs in a command argument, Git history, chat, screenshot or VITE variable. These commands read the environment populated by the approved secret workflow. Drain sends at most 100 records per invocation, up to three requests per record, capped exponential/Retry-After backoff, ten-second request timeout. Stop on 401/403 or exhausted transport/transient retries; other permanent rejections require explicit retry. Accepted records are not resent from the same spool. Rerunning capture/replay with a fresh spool can produce duplicates with the same stable IDs. Files must be regular, bounded, validated records; symlinks and conflicting same-ID payloads are refused.

The GitHub observer saves sanitized spool state as a 14-day artifact on failure or success. Download only this trusted observer's artifact for operator-reviewed replay; never execute its contents. Source run replay is available through Delivery observability workflow_dispatch with an exact completed Checks run ID and attempt. It revalidates repository/head/workflow/attempt and reuses source event IDs. Optional `replay_hosting_observation=true` adds only the reviewed 30 October provider/probe receipts committed in this PR. It regenerates/validates their safe envelope against the recorded facts, preserves original deployment and probe times and IDs, and does not perform new live checks or create native markers. No arbitrary receipt path or PR artifact is accepted. Future observations require newly reviewed source evidence or the local secure capture/drain flow. It does not rerun tests, deploy, replay historical issue webhooks or manufacture development-start/block/resume events. Explicit milestones can be queued with:

```sh
node scripts/observability/milestone.mjs started ISSUE_NUMBER STABLE_UUID ORIGINAL_ISO_TIMESTAMP
```

Allowed actions are started, blocked, resumed and triaged. Supply the same UUID/time on replay. These records carry the local HEAD, issue number and **developer-reported** authority; they are not verified GitHub timestamps or proof that work occurred. There is no free-text reason/body capture. This task does not retrospectively manufacture milestones. Automatic local-development detection and historical webhook reconciliation remain outside coverage.

## Activation, cost and release gates

`DYNATRACE_CI_ENABLED` defaults unset/off. `DYNATRACE_CI_TOKEN` is referenced from the existing **Production** GitHub environment with `deployment: false`, so reporting cannot create a GitHub application-deployment object. On 30 October the owner supplied this secure location; a names-only API read confirmed the secret exists and the environment has no protection rules or branch restriction. The value was never read or copied. Observer enablement remains gated by the flag. There is no credential in Checks or PR code; trusted default-branch observer dependencies install with scripts disabled. Configure only approved BizEvents and OTLP ingest scopes; optional native Events ingest needs separately reviewed scope. The workflow references that owner-provided environment secret; the enable flag has not been set. A credential pasted into conversation must be revoked and replaced through secure storage; it is never copied by this tooling.

Delivery volume is bounded by GitHub jobs/steps and eleven summaries per trusted main run, plus source transitions/relationships. Deployment capture queues two events per surface and optionally one native marker. Browser observations are best effort and add one event per authenticated request/call completion. No new high-cardinality metric labels, host monitoring, session replay, scheduled capture or paid infrastructure are introduced.

For rollback, disable the observer flag, preserve sanitized failures, and revert source through a reviewed PR. A future Hosting rollback must use an approved known artifact and be captured as a real provider rollback. Telemetry failure cannot roll back learner transactions. No native RUM/backend ancestry is established by a request ID or revision join.

## Evidence

Local 30 October read-only capture of current 2.2.0 verified learner release `sites/inspiredlearning-vh/releases/1793340066263000` and admin release `sites/inspiredlearning-admin-vh/releases/1793340034178000`, both at revision `6b18944592632dcca5a0f0876b41ba09de16d478`. [Sanitized provider/probe receipts](evidence/observability-2.2.1/provider-observation.json) preserve the original release times and actual observation times. Four sanitized events are queued locally. No production deployment, ingestion, native marker or tenant configuration change followed from this observation.

[Local validation](evidence/observability-2.2.1/local-validation.json): lint, TypeScript, both frontend builds, 54 unit and 62 browser tests passed. Browser emulators used temporary isolated port overrides, restored afterward. See PR/check evidence for exact-head CI validation. Production environment secret presence is verified; CI activation, real per-signal transport/partial-rejection receipts, exact tenant event/trace/log/metric queries, native marker association, and future Hosting deployment of browser changes remain pending. Do not close #77 solely because source tests pass.

References: [Firebase Hosting releases](https://firebase.google.com/docs/reference/hosting/rest/v1beta1/sites.releases), [Dynatrace Events ingestion](https://docs.dynatrace.com/docs/dynatrace-api/environment-api/events-v2/post-event), [Dynatrace OTLP API](https://docs.dynatrace.com/docs/ingest-from/opentelemetry/otlp-api).

Environment secret access without deployment tracking follows [GitHub’s documented deployment:false setting](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/deploy-to-environment). No environment protection or secret value was changed by this work.
