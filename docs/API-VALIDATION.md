# Initial API/MCP validation — 11 October 2026

Remote origin/main was fetched and matches local HEAD 325ecfd. Existing uncommitted handover/plan edits were preserved. No production deployment, shared rule/index changes, score recalculation or account migration was performed.

The schema audit confirmed shared Google UIDs, reserved session-document workshop IDs, permanent `learningLearners/{uid}/workshops/{sid}` results, `learningCertificates` versions, `learningPrivacy` markers and per-session captain-region assignments. College has no stable existing collection and is deferred. The implementation scope and remaining proposed resources are in [API.md](API.md).

Passed:

- 8 unit tests: shared Google identity, bounded/filter-bound pagination, null/zero score handling and HTTP write/token rejection.
- 26 InspiredLearning integration tests: existing completion/certificate/erasure behavior plus API owner/admin/captain denial, privacy filtering, cursor continuation, audit failure, OpenAPI validation, published quiz answers, certificate enumeration, actual HTTP responses and Swagger asset serving.
- 39 ChaiCart Live tests: rules, regional captain access, immutable quiz answers, idempotent scoring, business audit delivery, 120-student role reservations and deletion/erasure guards.
- 3 MCP tests: typed routes, authorization error propagation, GET-only/no-redirect forwarding and real SDK stdio client/server parity.
- 1 Auth emulator test: real Firebase Google ID token identity, tampered token rejection, disabled-user rejection and anonymous rejection.
- 1 Swagger browser test: all 12 GET operations render without JavaScript errors using local resources only.
- Frontend production build; existing lint suite (one pre-existing main.tsx Fast Refresh warning); added API/MCP/test file lint; git diff whitespace check.

All Firebase tests used isolated demo-chaicart emulators. Slow extraction on the external volume required validation from exact source copies on local temporary storage. Final workspace unit tests also pass with temporary dependency symlinks. The interrupted Functions extraction is retained under an ignored `.dependency-backup/node_modules`; it is explicitly excluded from Functions packaging. Run normal npm ci for root/functions/mcp after temporary storage is cleared.

The local adapter was implemented only after the initial API authorization/OpenAPI tests passed. Its eight tools are limited to implemented endpoints, require a short-lived interactive Firebase token and cannot access Firestore or mutate domain data. Hosted MCP, service identities, college/staff directories, feedback, live submissions and comprehensive profile expansions are outside this release.

## Administrator token extension

Added versioned Google-admin-only credential management and the `/#/admin` API tokens panel. Eight read scopes, optional learner/workshop ID restrictions, 1/7/30-day expiry, one-time secret delivery, server-side hashes, owner-only idempotent revocation, transactionally enforced active quota and current issuer account/role checks preserve the existing learning privacy policy. Scoped tokens never authorize management endpoints or callables.

Validation: 28 Auth/Firestore integration tests passed (27 domain/API tests plus one real Firebase Auth test); 8 unit tests; 3 MCP tests; Swagger render; frontend build and lint with the existing main.tsx warning. A real Functions/Auth/Firestore/browser rehearsal passed Google reauthentication → creation → one-time clipboard copy → allowed profile read → unselected history denial → revocation → rejected token. The browser also verified the credential never appeared in DOM text or form values. Local telemetry received the lifecycle/read audits without secret logging. Screenshot: `/tmp/inspi-admin-api-tokens.png`. No production deployment or shared rule/index changes.

## Resource and write extension

Added Students/Workshops/Colleges Swagger groups, AND-combined student college/workshop filters, permanent participant and published score lists, explicit college and membership records, and reasoned profile corrections. The initial eight read scopes remain supported; there are now ten read scopes and four explicitly selected write scopes. Write scopes are unchecked by default in the admin portal. Existing tokens retain their saved permissions.

Final backend verification: 29 Auth/Firestore tests, 39 shared Live rules/action/audit tests (including 120 concurrent Google students), 8 unit tests, 3 MCP tests and grouped Swagger browser rendering all pass. New cases cover zero versus null credits and provenance, OpenAPI Student/College/Membership/ScoreRow schemas, version conflicts, identical/conflicting retries, read/write separation, resource restrictions, current admin authority, direct client write denial, privacy filtering and erasure of roster pointers/cached results. Real Firebase Auth HTTP tests exercise scoped PUT corrections and POST scope denial. Build and lint pass with the existing main.tsx Fast Refresh warning. Swagger renders 21 GET, 2 POST, 5 PUT and 1 DELETE operations; one POST and the DELETE are token management. The ten MCP tools still issue only GET requests.

College affiliations require explicit assignment; existing records are not automatically inferred or migrated. Provider webhook receivers, score/certificate writes and production deployment remain outside this extension. Minimal hashed replay tombstones survive erasure without request bodies or result data so delayed retries cannot restore removed learning data.

The final Functions/Auth/Firestore portal rehearsal also passed token creation, Google reauthentication, one-time copy, allowed read, unselected permission denial and revocation. It verifies the new college/name write permissions are present and unchecked by default. No temporary emulator secret remains. Functions declare Node 22; the local emulator used the installed Node 24 runtime.

## Unified credit extension (v1.2)

Approved award policy: every completed workshop contributes final team credits PLUS the learner's individual credits, intentionally repeating individual performance as an attendance benefit. Legacy fixed completion points are compatibility data and excluded from the unified total. Existing snapshots count without republishing. Immutable prospective adjustment records and their audits commit with publication, correction, revocation and reinstatement. The account reads the latest completed records and signed non-workshop contributions from one consistent transaction snapshot; removed/blocked records are excluded. Unknown awards produce a null total, and bounded account reads fail rather than truncate.

Validation: 30 Auth/Firestore tests and 9 unit tests pass, including concurrent repeat publication/correction/reinstatement, exact credit deltas, multiple workshops, community earnings/consumption, unknown versus zero, bulk token restrictions, owner access, workshop filters and erasure/privacy. Swagger rendering, 3 MCP tests, frontend build and lint pass with only the existing main.tsx warning. The 39 shared Live regression tests previously passed; this extension does not change Live code or shared rules. MCP now has eleven GET-only tools. Provider-specific community award/consumption write APIs and production deployment remain outside this extension.

The two real Functions/Auth/Firestore browser rehearsals also pass: existing token creation/revocation, and a dashboard total of 1420 from workshop awards of 1200 and 250 plus a community deduction of 30. The workshop page shows the 1200 attendance award and explains the intentional individual bonus. Screenshot inspected at `/tmp/inspi-unified-credits.png`.

Production deployment and GitHub documentation updates were explicitly authorized on 11 October 2026 after the unified-credit implementation. The deployment outcome and final release checks are recorded in RELEASE-CHECKS.md; earlier local-only statements describe their original validation stage.

Final release verification: all 19 portal browser tests and 39 shared Live tests passed again; combined release matrix is 101 cases. The token browser fixture explicitly seeds its administrator profile to avoid relying on asynchronous profile creation. Source `050ecbc` passed GitHub CI and deployed successfully to production; nine dedicated Node 22 functions are ACTIVE. Public portal/Swagger browser checks, exact live OpenAPI parity, 401 unauthenticated score rejection and 405 unsupported-method rejection passed on both domains. See RELEASE-CHECKS.md.
