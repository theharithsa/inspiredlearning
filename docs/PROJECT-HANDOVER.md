# Private project handover

Current source work: **v2.0.0 / API 1.5.0**, tracked by #34. Read the final v2 section and V2-RELEASE-PLAN.md before using older single-portal instructions. No v2 production deployment is implied.

Workspace: InspiredLearning alongside `chaicart-live` and `workshop-reference`. Private repository: https://github.com/theharithsa/inspiredlearning. Firebase project: chaicloud-workshop; Hosting site: inspiredlearning-vh; Functions codebase: inspiredlearning; region: asia-south1. Domain inspi.in is managed in GoDaddy.

Do not migrate Authentication or duplicate accounts: the portal uses Live Google UIDs. Do not infer completion from Live's old certificate announcement. Staff verifies attendance and publishes immutable results; The canonical student total is the sum of latest completed workshop awards (final team score + individual score, intentionally repeating individual credits as an attendance benefit) and signed non-workshop entries. Legacy fixed 100 learning points are compatibility data and excluded from the total. Shared security rules/indexes are deployed only by chaicart-live. Preserve the session deletion guard and archived session-code reservation.

Credentials reside in existing Firebase Secret Manager, never in this document. Read README, RUNBOOK and OBSERVABILITY before maintenance. Run both repositories' tests for changes touching shared collections or workshop completion. Keep production and demo-chaicart fixtures separate.

Initial deployment evidence and DNS state are recorded in the task delivery and repository history. The stable Firebase URL is the certificate verification origin. Custom-domain DNS propagation must not block workshop access through Firebase.

Release verification and pending GoDaddy records: [RELEASE-CHECKS.md](RELEASE-CHECKS.md). Core portal deployment is complete; custom-domain mapping is now verified live on inspi.in (11 October 2026). PDFs are generated on demand from versioned certificate records rather than stored as permanent downloadable objects.

## Admin support release

Global facilitators now use `/#/admin` (captains retain `/#/staff`). Supported controls include attendance/publication, lookup by email/UID/certificate, reasoned PDF preview, profile corrections, versioned certificate name/title/date replacement, revoke/reinstate and live paginated student request review. Full procedure: [RUNBOOK.md](RUNBOOK.md). Test matrix: [USE-CASE-VALIDATION.md](USE-CASE-VALIDATION.md).

Removal scope is explicitly approved: InspiredLearning history and certificates only, with shared Google Auth and Live data preserved. `learningPrivacy/{uid}` provides resumable erasure and blocked session IDs; scheduled retry recovers interrupted work. Reactivation is an explicit learner action for future workshops. Shared rules add owner/facilitator marker reads, with no client writes. Live deletion recognizes completed erasure as an alternative to an archived completion; never accept in-progress erasure as sufficient.

## API-first platform direction (11 October 2026)

InspiredLearning is the primary long-term platform; ChaiCart Live is a workshop activity app. Every new domain feature must define its versioned API contract, server-side authorization, audit behavior and tests before implementation. UI and MCP must share the same business/policy layer. Preserve existing callables and shared UID/privacy semantics. Proposed APIs and the small read-only MCP rollout are in [API-MCP-PLAN.md](API-MCP-PLAN.md).

API/MCP resource refinement: use get_workshop_details, get_student_details, get_certificates, get_student_score, get_college, get_captains and get_facilitators with typed, allowlisted filters. Student details support bounded expansions for workshop history, scores, participation and certificates. Every score is contextualized with workshop ID/name/dates, unit and publication/provenance metadata. See the resource-oriented revision in API-MCP-PLAN.md; college/staff schemas require verification before implementation.

## API, tokens and unified scoring release (11 October 2026)

The user explicitly authorized production deployment and GitHub documentation updates after validation. Deploy only InspiredLearning Hosting and its Functions codebase; preserve shared Authentication, Live data, rules and indexes.

REST is hosted under `/api/v1`; `/api/docs` is locally packaged Swagger and `/api/openapi.json` is the OpenAPI 3.1 contract (v1.2.0). API categories are Students, Workshops, Colleges, Certificates and Admin tokens; every expanded operation has a description. Google-authenticated global facilitators create/revoke scoped credentials from `/#/admin`. Creation requires recent Google reauthentication. Secrets are delivered once, hashed server-side, expire within 30 days, and never appear in the DOM or browser storage. Current account/admin authority and learner/workshop restrictions are checked on every request. Write permissions are explicit and unchecked by default.

`GET /api/v1/students/scores` (alias `/scores`) returns paginated unified totals across Inspi without requiring a workshop. `GET /students/{studentId}/scores` without workshopId, or `/me/scores`, reads one authorized total. Workshop filters are optional for bulk reads; workshop-restricted tokens must supply a permitted workshop filter. Credit awards intentionally add final team score + individual score even though the team score includes individual performance. Latest result snapshots count once; correction, revocation and reinstatement change the contribution safely. Unknown awarded components produce a null total, not an invented zero. Legacy fixed learningPoints remain for backward compatibility and are excluded. Existing published results count without migration, republishing or certificate replacement.

New completion transitions atomically append prospective immutable credit adjustments and audited events. `/students/{studentId}/credit-transactions` and `/me/credit-transactions` list adjustments, excluding private reasons. Historical snapshots may predate this log; it is not a complete historical ledger. Signed server-owned `creditEntries` permit future non-workshop earnings/consumption in the same total. Authenticated community credit POST/PUT APIs are available in v1.3 below. Account reads are bounded to 500 records per source and return 429 rather than a truncated total.

Explicit `learningColleges`, `learningWorkshopMetadata`, learner collegeMemberships and `learningCollegeRoster` records support college/workshop filters. No existing affiliation is inferred. Reasoned POST/PUT corrections cover colleges, workshop hosting college, learner institutional/workshop membership and profile name only. UUID idempotency keys and optimistic versions protect retries. Published workshop score, attendance and certificate mutations remain on existing reviewed workflows. Erasure deletes learner credit records and roster pointers; minimal hashed replay tombstones prevent delayed webhook retries from restoring removed data.

The separate `mcp/` package has eleven typed GET-only tools and delegates all identity/policy decisions to REST. It is a local stdio adapter; no hosted MCP server is deployed. Read [API.md](API.md), [API-RESOURCE-CONTRACT.md](API-RESOURCE-CONTRACT.md), [API-VALIDATION.md](API-VALIDATION.md) and [RUNBOOK.md](RUNBOOK.md) before maintenance. The successful production release and live verification are recorded in [RELEASE-CHECKS.md](RELEASE-CHECKS.md).

Production release completed on 11 October 2026 from source `050ecbc`. All nine InspiredLearning functions are ACTIVE on Node 22; Hosting, inspi.in and Swagger are verified live. All 101 automated checks and GitHub source CI passed. Other codebase metadata, shared rules/indexes and shared Authentication were preserved. No production learner data migration was run.

## Webhook credit writes (API v1.3)

Admins can create a token with the new **credits:write** permission in `/#/admin` (unchecked by default). POST `/api/v1/students/{studentId}/credits` awards or deducts an activity contribution; PUT `/api/v1/students/{studentId}/credit-contributions/{contributionId}` corrects its amount using expectedVersion. Add scores:read for contribution revisions and unified totals. Existing tokens retain their permissions.

Webhook callers send a UUID Idempotency-Key and stable sourceId/eventId; identical events deduplicate across credentials. Writes append immutable deltas and audit events, preserve reviewed workshop results/certificates and enforce current admin authority, student restrictions and removal. Minimal event tombstones prevent replay after reactivation. Legacy learningPoints are compatibility data; use credits for the single Inspi total. Account capacity is 500 external adjustments (429 at capacity). MCP remains read-only. Full payloads and error/retry semantics: [API.md](API.md).

The v1.3 credit write extension is deployed to production from `c486bb2`. Nine InspiredLearning functions are ACTIVE on Node 22, both domains match OpenAPI v1.3 and anonymous credit writes are rejected. No Live deployment, shared Auth/rule/index modification or learner migration occurred. See RELEASE-CHECKS.md for evidence.

Source GitHub CI passed: https://github.com/theharithsa/inspiredlearning/actions/runs/38191807603 (commit c486bb2). The workflow includes the complete portal browser regression suite, API Auth/Firestore tests, unit/build/lint checks, Swagger rendering and the GET-only MCP adapter.


## Certificate recognition repair (20 October 2026)

Deployed 20 October 2026: scoped award resolution; separate award certificates linked to participation certificates; lifecycle propagation on publish/correct/revoke/restore; Google-admin-only GET `/api/v1/certificates` register and POST `/api/v1/workshops/{id}/certificates/reconcile`. The repair preserves credits and privacy, adds explicitly confirmed individual award definitions, versions changed recognition and retires superseded duplicates. Award certificate IDs derive from parent certificate ID plus title, so reruns do not duplicate awards. Admin historical PDF previews are visibly marked revoked/superseded; owner downloads and public verification require a current completed result.

The approved image subsequently appeared at `assets/sign.png` and was copied without alteration to `functions/assets/signature.png`. Signed participation and award PDFs were rendered and visually checked, and signature embedding is covered by a regression test. The admin register exposes whether a signature is configured. See the release evidence added to CERTIFICATE-AUDIT-2026-10-20.md before assuming deployment/repair happened.

Certificate release status: code/Hosting deployed and validated; production learner repair awaits Google facilitator authentication, and the approved signature asset is now included in a follow-up deployment. No production learner/certificate records were mutated by this repair task. Read CERTIFICATE-AUDIT-2026-10-20.md for evidence and remaining actions.

Signature follow-up is now deployed and verified: the active backend source contains the exact approved image and renderer checked locally. Existing valid participation downloads now use that signature without republishing results. Only the data repair/issuance step remains gated by facilitator sign-in; the CLI infrastructure identity is not an app facilitator. Do not bypass that guard or silently grant it an admin role.


Production certificate repair is complete (20 October 2026), following Google facilitator sign-in through the admin portal. GMU0810 now has 119 active participation certificates and 38 active award certificates, including Best CEO (Keerthana N S), Best CTO (Manasa Nadiger), Best COO (SM POOJA), and all five members for each recorded team/regional award. All active award parent links were validated. There are 39 retained revoked/superseded versions. A before/after production check confirmed all 119 learners' personalCredits, teamCredits, learningPoints and completion status unchanged. The live admin register displays all 38 issued awards and PDF preview controls. The approved signature is deployed; students must redownload older PDFs. This supersedes the earlier pending-authentication repair status.


## Pre-redesign maintenance candidate — 27 October 2026

Issues #1–#33 have source-specific triage comments; main did not already resolve them. Maintenance candidate 1.0.1 is separate from redesign #34 (2.0.0, approved separate admin app at admin.inspi.in). See ISSUE-TRIAGE-2026-10-27.md for source scope, pending policy/infrastructure decisions and verification boundaries. This note is not evidence of production deployment or learner-data repair.

## Remaining maintenance candidate — 27 October 2026

Source candidate 1.0.2 adds compatible REST contract 1.4.0: Google-admin-only metadata health/events and audited idempotent redrive, plus minimal public verification. It adds native/dependency tracing, configurable log sinks, backlog/lag metrics and source-owned SLO/alert/dashboard configuration; public routes avoid Firebase initialization, histories use bounded live windows, helpers/types/components are shared and TypeScript is strict. Per-function profiles preserve existing capacity; authorization mapping and retention are unchanged by explicit owner decision. Paged/resumable privacy discovery retains the legacy O(total sessions) fallback: #17 remains open for an authoritative membership-index migration.

Read MAINTENANCE-POLICY-2026-10-27.md and observability/README.md before assuming infrastructure, TTL, active alerts or deployed behavior. #15 global protection, #14 live CSP validation/enforcement and #9 tenant configuration/verification retain explicit gates. v2.0.0 remains in #34 with admin.inspi.in; no redesign implementation or production migration/deployment is certified by this candidate. Repository-local app skills are indexed in skills/README.md.

Maintenance PR and current local evidence: [#55](https://github.com/theharithsa/inspiredlearning/pull/55), [1.0.2 verification](MAINTENANCE-1.0.2-VERIFICATION.md). Source closure and remaining release/migration gates are listed separately there. Production remains at its previously deployed revision until an explicitly scoped release.


## v2.0.0 source implementation — 28 October 2026

This section supersedes earlier single-portal route instructions for v2 source only. Production remains separately verified in RELEASE-CHECKS.md. GitHub #34 tracks the Material 3 redesign; #17 retains the membership migration acceptance gate. Learner/public builds go to dist; the separate administrator build goes to dist-admin for admin.inspi.in. Administrator startup performs only Google/admin capability bootstrap, with no learner profile creation or history subscription. Legacy learner admin routes hand off to that origin. Captains retain learner /staff and their fixed region mapping.

The owner approved per-tab Firebase session persistence for the separately named admin app; refresh retains sign-in and closing the tab clears it. Learner persistence and shared UIDs are unchanged. No mandatory MFA. Sensitive Google-admin writes and non-owner PDF previews enforce the existing 300-second recent-auth window on the server; the frontend offers Google reauthentication. Scoped automation keeps its existing explicit permissions. Compatible OpenAPI 1.5.0 adds GET /api/v1/admin/access; app/functions version is 2.0.0 and MCP remains independently versioned.

Read DESIGN-SYSTEM.md, API-V2-ADMIN-CONTRACT.md, V2-MEMBERSHIP-INDEX-DESIGN.md, V2-RELEASE-PLAN.md and CI-OBSERVABILITY.md before further work. No learner/certificate repair, membership backfill, shared rule/index change, capacity increase, outbox retention change or paid protection is included. Repository guidance covers the new surfaces. The CI observer is source-configured but disabled until secure credential binding; local collector acceptance is not tenant proof.

No v2 deployment or admin Hosting/DNS/Auth-domain provisioning is authorized by source implementation. Build identity marks demo/unconfigured/dirty source as nonrelease; verify clean production manifests against the merged revision. Ordered rollout and rollback are in V2-RELEASE-PLAN.md.

MCP dependency security follow-up in v2 source: the local GET-only adapter is independently versioned 1.0.1 with compatible patched dependencies and no new tools/authority. Root app, Functions and MCP production audits are clean; five moderate development-only Firebase CLI chain entries are tracked in #57. Do not force a breaking CLI downgrade to make the audit count zero.
