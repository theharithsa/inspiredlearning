# Maintenance 1.0.2 verification — 27 October 2026

PR: https://github.com/theharithsa/inspiredlearning/pull/55. Base: 4db2f0e9f863a58a9c2c04bf1267f8c2f36ec87b. Runtime source was frozen at f891a1fd0d7182721111239271b4b1b220c3ad79 plus the final deep-link test. The final PR-head GitHub checks are the authoritative integrated revision evidence; merge only that checked head. App/functions version 1.0.2, OpenAPI contract 1.4.0 (43 operations), /api/v1 remains compatible.

## Local results

All fixtures are synthetic demo-chaicart; ignored credentials/production environment files were excluded from the frozen source. Runtime tests ran from a local-disk copy with the same tracked sources and existing dependency installs. No production learner records were read/exported/mutated for these checks.

| Check | Observed result |
| --- | --- |
| npm run lint | Passed, no diagnostics |
| npm test | 19 passed |
| npm run build | Passed; normal 500 kB warning retained for authenticated Firebase chunk (~540 kB). No claim that the complete authenticated SDK is small. |
| npm run test:integration | 42 passed: Auth-policy/domain/rules, privacy/replay/credit/certificate invariants, outbox delivery, admin health/redrive and independently decoded native/dependency spans/log sinks |
| npm run test:api-auth | 1 passed using actual Firebase Auth/Firestore emulators |
| npm run test:swagger | 1 passed, actual packaged Swagger browser render |
| npm --prefix mcp test | 3 passed, adapter remains GET-only |
| npm run test:rehearsal | 28 passed on frozen final runtime/test source, including hidden-page workshop deep links, Firebase-free public pages and redrive lost-response retries |
| Shared Live regression | 39 rules/action/audit and 18 backend checks passed at unchanged Live source a0ce28d21e6c921763f38c4919e5c798d05baa16; unrelated local rehearsal-document edit preserved |
| Production dependency audit | Root and functions npm audit --omit=dev: 0 vulnerabilities each. This does not claim dev-tool/MCP/Dependabot backlog is empty. |
| Repository skills | Three frontmatter validators passed; repository-relative skill links resolve |
| Local PDF rendering | 20 sequential synthetic PDFs on Node v24.21.0: cold 233 ms, warm p50 48 ms, warm p95 62 ms. This is not network/concurrent/deployed capacity evidence. |

Local test ports: functions 5003 / web 5184 because unrelated services owned the defaults. Their processes were left running. Java 21 supplied the emulator runtime; default checked-in ports and deployment settings are unchanged.

The first browser run while source was being edited stopped on duplicate Firebase initialization after 17 passing journeys. The frozen-source rerun passed all 28. The first CI integration run exposed a sink-test race with the preceding HTTP handler's coalesced flush; commit 9aa74ac explicitly completes that prior flush before asserting a fresh batch. The full 42-case rerun passed. Keep these failed runs visible; they were not bypassed.

## Source review and boundaries

Authorization: Google global facilitator required for every telemetry read/redrive; API tokens, captains and learners denied. Redrive rechecks authority/state in its transaction, writes a private append-only reasoned receipt and canonical audit, and preserves the event payload/ID. Browser retries retain their original body/key. Metadata excludes learner payloads/reasons/emails. Public verification shares the existing opt-in policy and cannot download PDFs. No client Firestore write grants or MCP admin tool were added.

Privacy: discovery no longer performs the all-session read in the initial administrator transaction. Durable cursors and checked leases make compatibility discovery restartable; erasing markers block imports and reactivation retains blocked workshops. Legacy scan cost is still O(total sessions), so #17 remains open. Workshop detail reads one current-user record independently of the history page; it cannot accept another UID from a URL.

Frontend: strict TypeScript/no-explicit-any, shared transport/download/types and staff/token component extraction. Lists expose load-more; totals for loaded workshops are disclosed when partial. Canonical credit totals remain server-computed with existing capacity/errors. Public privacy/verification avoid Firebase initialization. The production RUM tag is omitted in dev/emulators. Actual production LCP/INP is pending deployment.

Configuration: named profiles preserve all current resource limits. Fixed ChaiCart authorization, email telemetry and retention are owner-confirmed policies. No paid resource or shared rules/index migration is provisioned. TELEMETRY_LOG_SINK defaults/falls back to both; selecting one sink needs actual forwarding/visibility review. Export and serverless background CPU remain best effort.

Observability: real local protobuf decoding confirms native Firestore transaction children, Auth/PDF/outbound children and trace parentage; sink tests check actual OTLP logs plus captured console output. No broad HTTP auto-instrumentation or exporter recursion. Six DQL queries passed tenant syntax verification. Existing historical callable success executed; new metrics are not deployed/searchable yet. Local dtctl Settings schema access returned 401. Monaco/schema/application, SLO evaluation, alert recovery/routing and native RUM navigation remain unverified; see observability/README.md.

## Issue disposition and release impact

Source closure in this PR: #2, #10, #18, #19, #26, #27, #32. #33 is separately closed as not planned after the owner chose unchanged retention. Keep #9 (tenant installation/verification), #14 (live headers/OAuth/RUM and CSP enforcement), #15 (global protection) and #17 (complete membership-index migration) open. v2 redesign #34 is untouched except app-specific agent guidance.

Release scope, if separately authorized: InspiredLearning Functions and Hosting only; deploy compatible backend API before the frontend that calls it, verify function profiles/secrets/rewrites and rollback sources, then actual public/denied/OAuth/PDF/operational journeys and telemetry. Shared Auth, Live/rules/indexes, DNS/MFA, paid infrastructure and learner migrations are outside this scope. Rollback must preserve durable privacy markers, replay tombstones, event identity and idempotency receipts; never reverse database history to roll back UI code. A rollback to an older backend would stop the new scheduled discovery behavior, so review in-progress privacy operations before any backend rollback.

No production deploy, release tag, tenant configuration write or production data migration was performed. A merged PR is source evidence, not a production release or active-alert claim.
