# Private project handover

Workspace: InspiredLearning alongside `chaicart-live` and `workshop-reference`. Private repository: https://github.com/theharithsa/inspiredlearning. Firebase project: chaicloud-workshop; Hosting site: inspiredlearning-vh; Functions codebase: inspiredlearning; region: asia-south1. Domain inspi.in is managed in GoDaddy.

Do not migrate Authentication or duplicate accounts: the portal uses Live Google UIDs. Do not infer completion from Live's old certificate announcement. Staff verifies attendance and publishes immutable results; The canonical student total is the sum of latest completed workshop awards (final team score + individual score, intentionally repeating individual credits as an attendance benefit) and signed non-workshop entries. Legacy fixed 100 learning points are compatibility data and excluded from the total. Shared security rules/indexes are deployed only by chaicart-live. Preserve the session deletion guard and archived session-code reservation.

Credentials reside in existing Firebase Secret Manager, never in this document. Read README, RUNBOOK and OBSERVABILITY before maintenance. Run both repositories' tests for changes touching shared collections or workshop completion. Keep production and demo-chaicart fixtures separate.

Initial deployment evidence and DNS state are recorded in the task delivery and repository history. The stable Firebase URL is the certificate verification origin. Custom-domain DNS propagation must not block workshop access through Firebase.

Release verification and pending GoDaddy records: [RELEASE-CHECKS.md](RELEASE-CHECKS.md). Core portal deployment is complete; custom-domain mapping awaits owner sign-in. PDFs are generated on demand from versioned certificate records rather than stored as permanent downloadable objects.

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

New completion transitions atomically append prospective immutable credit adjustments and audited events. `/students/{studentId}/credit-transactions` and `/me/credit-transactions` list adjustments, excluding private reasons. Historical snapshots may predate this log; it is not a complete historical ledger. Signed server-owned `creditEntries` permit future non-workshop earnings/consumption in the same total. Provider-specific activity award/consumption write APIs are a future feature. Account reads are bounded to 500 records per source and return 429 rather than a truncated total.

Explicit `learningColleges`, `learningWorkshopMetadata`, learner collegeMemberships and `learningCollegeRoster` records support college/workshop filters. No existing affiliation is inferred. Reasoned POST/PUT corrections cover colleges, workshop hosting college, learner institutional/workshop membership and profile name only. UUID idempotency keys and optimistic versions protect retries. No score, attendance or certificate mutation endpoint was added. Erasure deletes learner credit records and roster pointers; minimal hashed replay tombstones prevent delayed webhook retries from restoring removed data.

The separate `mcp/` package has eleven typed GET-only tools and delegates all identity/policy decisions to REST. It is a local stdio adapter; no hosted MCP server is deployed. Read [API.md](API.md), [API-RESOURCE-CONTRACT.md](API-RESOURCE-CONTRACT.md), [API-VALIDATION.md](API-VALIDATION.md) and [RUNBOOK.md](RUNBOOK.md) before maintenance. The production release outcome will be recorded in [RELEASE-CHECKS.md](RELEASE-CHECKS.md).
