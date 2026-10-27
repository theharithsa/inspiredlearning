# Pre-redesign issue review — 27 October 2026

Reviewed issues #1–#33 against main e4caca1 and unmerged review commit 3079e54 (PR #35). Each issue received a source-specific comment. No issue was already fully resolved on main. Some findings describe deliberate existing behavior but still raise valid follow-up concerns; they were not closed solely because the behavior was documented.

The maintenance candidate is 1.0.1. The Material 3/admin separation redesign remains 2.0.0 in #34. This work does not deploy either release or change production learner records.

## Implemented maintenance scope

| Issues | Result |
| --- | --- |
| #1, #11 | Generic browser observations use RUM only; no per-click callable or unexported browser-parent trace. Callable handlers extract actual incoming HTTP context. Transaction IDs remain cross-flow correlation, not proof of native RUM navigation. |
| #3–#6 | Bounded/coalesced serverless flush, typed domain rejection classification, package/cloud resource metadata and SERVER/CONSUMER spans, contract-derived HTTP route templates, bounded outbox attempts/dead letters. Erasure recovery precedes delivery and handles per-learner errors. HTTP 202 remains the documented acceptance condition. |
| #7–#8 | Atomic participation/award issue/revoke events, including supersession and repair; kind/workshop dimensions; schema 1.1; unknown credit components omitted rather than negative sentinel; idempotent workshop.closed. No historical telemetry rewrite. |
| #13 | Memory-only Firestore cache. Before rendering, clear only this Firebase instance's legacy IndexedDB cache; if another tab blocks cleanup, show recovery instead of opening sensitive screens. Auth storage remains separate. This is not forensic secure erasure. |
| #14 (partial) | nosniff, frame denial, referrer and permissions policies, immutable hashed assets; CSP report-only pending real OAuth/RUM/Swagger compatibility review. No claim of enforced CSP or verified production headers. |
| #16 | Unexpected batch errors become safe per-item retry messages; bounded diagnostics and failed-item span count retain partial failure evidence. |
| #20–#25 | Stable workshop derivation, removed-row selection filtering, live paged request window, recoverable top-level error boundary, feedback/form/verification/JSON errors, route title/focus/skip navigation and removal confirmation focus. Error recovery uses explicit reload to preserve unsaved work. |
| #26 (partial) | Existing PR endpoint/verification-origin configuration and legacy-point constant retained; revocation reverses the record's awarded legacy amount, with fallback for old missing data. Authorization mapping is not converted to writable config. |
| #27 (partial) | Shared safe JSON parser introduced. Broad component decomposition and strict TypeScript migration remain separate. |
| #28 | SHA-pinned reviewed v4 actions, least privilege/concurrency, locked Firebase CLI, Node 22 Functions check, certificate/telemetry test script coverage, Dependabot and portable certificate screenshot paths. |
| #29–#31 | Public-only verification link copy/QR, roster deep-link/register initial load, revocation/removal-request confirmation, workshop names and request dates, absent-certificate link guard, unsupported-account sign-out. |

## Open decisions and follow-ups

- #2: dependency spans require SDK/ESM and safe propagation review; exporter recursion and private attributes must be excluded.
- #9/#32: Google-admin-only redrive/health API, transactional audit and bounded UI; proposed SLO/alert thresholds need agreement and actual tenant configuration. Integrate with the separate admin app in #34.
- #10: unnecessary success logs removed, but GCP-forwarder duplication is unverified. Retain platform WARN/ERROR diagnostics until a sink/fallback policy is agreed.
- #12: owner explicitly confirmed keeping the documented email telemetry policy on 27 October. The UID-only proposal was closed as not planned, with separate Dynatrace retention/capture verification retained in #34. No tenant settings/retention changes were made.
- #15: local throttling remains best effort. Distributed quotas/App Check/edge controls need confirmed threat policy, proxy behavior and infrastructure/cost scope.
- #17: all-session privacy scan remains. An index replacement must prove completeness for legacy and live-only records and preserve concurrent erasure blocking.
- #18: do not guess paid instance/memory/concurrency settings from cohort size; measure synthetic load and agree a capacity budget.
- #19: public route separation and complete bounded history pagination require compatible contracts; do not silently truncate lists.
- #25: targeted focus/semantics fixes are not WCAG certification; verify remaining contrast/device cases in the redesign.
- #26/#27: broader environment configuration, authorization mapping, shared helpers/component splits and strictness remain open; do not claim these multi-part issues complete.
- #33: delivered retention duration is pending; never TTL pending/failed events to hide recovery work. Shared infrastructure policy remains owned by ChaiCart Live.

## Verification

Record actual final commands/results in the implementing PR. Local emulator results are not production deployment or tenant-searchability evidence. All test identities/data are synthetic under demo-chaicart; RUM requests are blocked and exports go to localhost. Do not use production data mutations to make a smoke test green.

Production release, DNS, IAM, MFA, Dynatrace settings, TTL policies and paid capacity changes are not performed by this maintenance work. Changes to shared collections require both repositories' applicable regression evidence. GitHub issue closure means tested source is merged; deployment state must be stated separately.
