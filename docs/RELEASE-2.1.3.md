# InspiredLearning 2.1.3 production release — 29 October 2026

Deployed revision **42b2efb5b6a85f1bef8926022b2aaaa5c07e71d4**. App 2.1.3 / Functions 2.0.1 / API 1.5.0 / MCP 1.0.1. Source: PRs #65–#68. Deployment was explicitly approved after the candidate/build/usage review. [Safe release facts and image provenance](evidence/v2.1.3/release.json).

## Deployment and preservation

All nine InspiredLearning Node 22 functions updated successfully and are ACTIVE with SHARED_RATE_LIMITS=true. Shared quotas apply to verified UID/token keys only; public/pre-authentication IP buckets remain on the existing best-effort local throttle. Preserve this approved production flag in future deployments; a fresh local checkout defaults to off. No function capacity/runtime setting changed. Counter cleanup runs after privacy recovery/canonical delivery and isolates failures.

Functions deployed before Hosting so the external Swagger initializer existed before CSP enforcement. Admin Hosting version 09fb3f38660686a8 released at 22:01:14 IST, followed by learner version 74c1fc945f26b967 at 22:02:08 IST. Both live manifests match the clean production revision/version/surface. All eight unrelated ChaiCart function metadata records and both ChaiCart Hosting release versions match the predeployment snapshot. Existing Auth domains were preserved; no DNS, role, rule/index or Auth-account migration was performed.

Read-only projections before/after match: 119 issued participation certificates, 38 issued awards and 39 revoked/superseded versions (196 total), plus all 119 tracked GMU0810 workshop status/credit records. Certificate projection SHA-256: 30ddc28eb8e39403b658ce5500a1d3665148560b1ce6981389081672fd364b0a; workshop projection: 42cae599333335f8ad8b47c3850fba857c7df54052339f7d461577c2d2773e22. These projections exclude names and unrelated audit/telemetry; they do not assert a whole-database comparison.

## Actual checks

Exact PR-head CI run [40909430445](https://github.com/theharithsa/inspiredlearning/actions/runs/40909430445) passed 55 browser cases (zero flaky/skipped), 49 Firestore integration, 38 unit, 1 Auth, 1 Swagger, 3 MCP, 1 enforced-CSP browser, independent learner/admin Hosting checks, 2 tooling compatibility and 1 real Pub/Sub emulator case. Node 22 Functions and GitGuardian passed. The merged application revision also passed its Checks workflow. The CI artifact contains 109 synthetic screenshots; representative captures were reviewed with inventory revision matching the tested merge ref. Earlier failed/cancelled runs remain recorded.

Live checks on both origins: correct manifests/API 1.5.0, anonymous admin 401, enforced CSP, no-cache root/index/rewritten SPA HTML, no-store API/docs initializer, immutable hashed JavaScript, and an asynchronous approved RUM tag. Swagger renders real operations under the deployed policy. Captured public browser consoles had no CSP failures. Three already-opted-in certificates returned valid public verification without email/scores; a missing/private sentinel returned the private-safe response. No privacy toggle or certificate repair was used as a test.

Safari real Google administrator sign-in and explicit reauthentication succeeded, and the register loaded. A reasoned administrator PDF preview downloaded (44,312 bytes) and parsed as one page. The new learner build restored the existing signed-in account and displayed the revised empty/profile/support layouts. All 14 font choices were present; Lato loaded successfully under CSP and the original Roboto preference was restored. Session refresh/tab-close behavior is covered by the emulator suite and previous production release; the current Safari follow-up was interrupted when the browser moved to another page, so those current-release live checks are not claimed.

## Observability and usage evidence

The tenant contains Functions 2.0.1 server spans, logs and operation-outcome metrics. Example server trace: cb4768c41404a10d2cf6338fd7aefedb. Native browser BizEvents are searchable for both app.surface values with app.version 2.1.3 and client-observed authority. The PDF-preview event is separately server-confirmed: transaction 85079854-0a06-4b03-8430-0a5af8d0eba9, trace c54f2792eed7d3626b7cd40493e4cac8. This is not native RUM-to-backend navigation proof.

Live private counter rows contain only start/count/expiry; matching rate.limit logs show one read, one attempt and one confirmed write for observed authenticated requests. Dynatrace normalizes these field names to committedwrites/attemptedwrites. This supplements the pre-rollout emulator measurements; it is not a billing receipt, a token-path production load test, or a cross-instance production load certification. Retry/cleanup/storage costs remain additional. Public IP provenance stays unresolved in #15.

Independent per-signal HTTP/partial-rejection receipts were not captured in this pass; tenant searchability is the verified stage. The CI observer remains unbound/disabled, native RUM-to-trace navigation remains unverified, #9 alerts remain deferred and #17 membership migration remains held. Outbox retention and documented email attribution are unchanged. #34 remains open for its remaining observability/acceptance gates; #63 retains any remaining operational-layout review.

## Rollback

Retain previous learner Hosting version 1c068c997ca0707d and admin version 6820a2981c191ef1, plus the captured Functions 2.0.0 metadata/source references. Use provider-supported previous artifacts; do not rebuild old source as equivalent rollback. Coordinate Functions/Hosting rollback because CSP expects the external Swagger initializer. Disable the approved counter flag before reverting its implementation if needed. Never roll back learner results, certificate history, shared Auth, privacy markers, outbox event IDs or receipts. No destructive rollback was rehearsed in production.

[Discord announcement draft and screenshot captions](announcements/2.1.3-discord.md).
