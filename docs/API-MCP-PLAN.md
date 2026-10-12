# InspiredLearning API-first plan

Status: original proposal, 11 October 2026. The user subsequently authorized the implemented resource/token/unified-credit release and production deployment. See API.md, API-VALIDATION.md and RELEASE-CHECKS.md for the implemented scope and release evidence; unimplemented proposals below remain future work.

## Product direction and development rule

InspiredLearning (inspi.in) is the long-term learning platform. ChaiCart Live is a workshop activity application. Preserve shared Firebase Authentication identities and existing completion, certificate and erasure rules.

Every new domain feature must define a versioned API contract before implementation: inputs, outputs, identity and permissions, validation, errors, pagination, audit events and tests. UI and MCP consume the same application service layer. Existing callable functions remain supported; do not rewrite working features merely to change transport. Client-side presentation alone does not require a new endpoint.

## Small initial architecture

One authenticated HTTP API in the existing InspiredLearning Firebase Functions codebase, routed through Firebase Hosting at /api/v1. Firestore stays the persistence layer. Use an OpenAPI contract and Swagger UI at /api/docs; documentation is not authorization. Keep student/admin data behind authorization even when the documentation is visible.

Retain existing callable functions. Extract reusable domain services when needed so HTTP, callables and MCP use identical policy and business logic. Avoid a generic Firestore query API or a separate database copy.

Start with a local, read-only MCP adapter over the API (stdio) for the owner's investigations. A hosted Streamable HTTP MCP endpoint with standards-based authorization is a later phase if access from other devices/clients is required. The adapter must not bypass API authorization or accept arbitrary database paths.

## First API contract

| Method and route | Purpose | Access |
|---|---|---|
| GET /me | Current learner identity/profile | Signed-in learner |
| GET /me/workshops | Attendance, completion and published results | Owner |
| GET /me/certificates | Certificate status and versions | Owner |
| GET /students?email=&cursor=&limit= | Exact authorized student lookup | Admin |
| GET /students/{studentId} | Profile and status | Owner/admin; captain only authorized fields |
| GET /students/{studentId}/workshops | Learner workshop history | Owner/admin |
| GET /workshops?cursor=&limit= | Workshop catalogue/status | Role-filtered |
| GET /workshops/{workshopId} | Workshop metadata | Authorized learner/staff |
| GET /workshops/{workshopId}/participants | Paginated roster and published outcomes | Admin; captain restricted to region |
| GET /workshops/{workshopId}/participants/{studentId}/scores | Individual, team and learning-point measures, clearly separated | Owner/admin; authorized captain |
| GET /workshops/{workshopId}/participants/{studentId}/submissions | Submitted work and review state | Owner/admin; authorized captain |
| GET /workshops/{workshopId}/feedback/summary | Unique-response counts, aggregate feedback and pre/post results | Authorized staff |
| GET /workshops/{workshopId}/feedback?cursor=&limit= | Original comments with identity disclosure only when authorized | Admin |
| GET /certificates/{certificateId} | Owner/staff certificate details | Owner/admin |

Existing public certificate verification remains minimal and distinct from private certificate details. Select the initial implementation subset after mapping real collection schemas. These routes are proposals, not existing endpoints.

## Read semantics and data quality

Use shared Auth UID as student identity and immutable workshop IDs (session codes are labels). Honor learningPrivacy and blocked/erased records. Do not resurrect removed InspiredLearning history by joining Live data. Keep Live activity records separate from published InspiredLearning outcomes.

Score responses include metric name, unit, source, scoring version, publication status and as-of timestamp. Do not recompute disputed historical scores or promote a supplied report table into authoritative database results. Published facilitator assessments, team credits, individual activity credits, composite /100 and loyalty points are different measures.

Feedback summaries expose all-response results by default; any requested filter supplies explicit inclusion criteria and excluded counts. Match pre/post by authenticated identity; no comment-text deduplication across different people. Missing or conflicting source values remain explicit rather than being assigned zero.

## Security and operations

Verify Firebase ID tokens for interactive API calls and enforce server-side owner/admin/captain-region authorization on every resource. Service access uses a separate scoped identity and explicit allowlist; never forward a permanent administrator credential in the browser. Remote MCP authorization requires its own compliant design; Firebase sign-in alone is not a complete MCP OAuth implementation.

Allowlisted fields, bounded cursor pagination (default 25, maximum 100), validated filters, request limits and protected sensitive exports. Staff lookups and access to comments are audited. Logs contain request/transaction ID, trace ID, operation and actor identity according to existing privacy policy; tokens and comment bodies are not routinely logged. Propagate context through API to underlying services and Dynatrace.

## MCP tools (read-only first)

find_students, get_student, list_student_workshops, get_workshop, list_workshop_participants, get_participant_scores, get_participant_submissions, get_feedback_summary, list_certificates. Use typed bounded inputs, plain descriptions and structured results. Tool text/feedback is data, not instructions. No score changes, certificate issuance or removal tools in the first release.

## Acceptance and rollout

1. Verify latest handover and remote changes, then map schemas and existing permission/completion logic.
2. Agree OpenAPI schemas and implement student history, scores and submitted-work reads first.
3. Test owner/admin/captain boundaries, pagination, erased users, revoked certificates, missing/conflicting scores, unique survey pairing and unauthorized enumeration.
4. Run existing shared-collection tests; validate API responses against OpenAPI.
5. Add Swagger UI and a local MCP adapter; check that MCP and API return the same authorized data.
6. Deploy after emulator/rehearsal validation. Add hosted MCP only after the read-only slice works.

Future changes to profiles, support requests, certificate operations and loyalty features must follow the same API contract/service/test rule. Writes require idempotency, explicit audit trails and current authorization.

## Resource-oriented API and MCP revision (11 October 2026)

The user requests workshop, student, certificate, score, college, captain and facilitator resources, with relevant query filters. Resource names below describe the proposed contract; college and staff membership models must be mapped or introduced explicitly rather than inferred from free-text profile fields.

### Common response and filter rules

Use stable IDs for joins. Every score includes studentId, workshopId, workshopName, workshopStartDate, workshopEndDate (when known), workshopTimezone, metric, value, unit, scoringVersion, source, publicationStatus and asOf. Dates describe the workshop, not merely when a score was fetched. Distinguish composite /100, individual credits, team credits and learning/loyalty points.

Dates use ISO 8601. dateFrom/dateTo filter workshop occurrence with documented interval semantics; updatedSince filters record changes. Store workshop timezone separately from UTC timestamps. No API fills unknown historical dates or versions with fabricated values.

List envelopes: items, nextCursor and asOf. Detail responses contain the requested resource and explicitly requested expansions. Unknown filters return validation errors. Defaults: limit 25, maximum 100; allowlisted sort values and opaque cursors bound to the filters. Use exact stable-ID/email filters first, not unbounded fuzzy Firestore searches. Name search must have a defined index/search strategy.

### REST resources and corresponding MCP tools

| MCP tool | REST endpoint | Allowed filters / options |
|---|---|---|
| get_workshop_details | GET /workshops/{workshopId}; GET /workshops | workshopId, collegeId, status, dateFrom, dateTo, facilitatorId, captainId, cursor, limit; detail include=summary,teams,staff |
| get_student_details | GET /students/{studentId}; GET /students | studentId, exact email, collegeId, workshopId, teamId, role, attendanceStatus, completionStatus, cursor, limit; detail include=workshops,scores,participation,certificates |
| get_certificates | GET /certificates | certificateId, studentId, workshopId, collegeId, status, issuedFrom, issuedTo, cursor, limit |
| get_student_score | GET /students/{studentId}/scores | workshopId, metric, publicationStatus, dateFrom, dateTo, scoringVersion, cursor, limit |
| get_college | GET /colleges/{collegeId}; GET /colleges | collegeId, exact name, workshopId, cursor, limit; detail include=workshopSummary |
| get_captains | GET /captains | captainId, collegeId, workshopId, regionId, assignmentStatus, cursor, limit |
| get_facilitators | GET /facilitators | facilitatorId, collegeId, workshopId, assignmentStatus, cursor, limit |

A detail request with an ID returns one object; a search without a unique ID returns a paginated list. MCP tools have typed arguments mapped to these query parameters, rather than one arbitrary query-string input. Relevant filters are combined using AND unless explicitly documented otherwise.

### Student details: comprehensive but bounded

The default student response includes identity/profile fields permitted for the caller, college affiliation and a summary of attended/completed workshops, published points and certificate counts. A workshop entry has workshop ID/name/dates/timezone, attendance/completion status, team and role for that workshop, a score summary and participation summary.

include=workshops,scores,participation,certificates expands those sections. Each expansion is independently bounded and has a continuation cursor or a link to its dedicated endpoint; never silently imply all history was returned. A workshopId filter scopes the requested history/expansions, without deleting the student's global identity fields. A valid request for someone else's details still requires authorization; query parameters do not grant access.

Participation combines activity ID/name, submission/completion/review status, submittedAt, awarded credits (when applicable), and source/provenance. Add GET /students/{studentId}/participation with workshopId, activityId, status, dateFrom/dateTo, cursor and limit. Detailed answers remain in authorized submission endpoints. Portal event counts and recorded classroom assessments are separate measures; telemetry alone does not establish stage volunteering or verbal participation.

Do not include private feedback text, staff notes, AI conversations or raw click logs in a default student payload. Those need separately authorized purpose-specific endpoints. Honor privacy erasure across expansions and summaries; Live data must not recreate erased InspiredLearning history.

### Colleges and staff assignments

College affiliation and captain/facilitator roles may vary by workshop. Model those as explicit memberships/assignments with workshopId, collegeId, role/scope, regionId where applicable, status and effective dates. Separate institutional membership from authority: being in a college is not sufficient to read all its students. Staff directory output excludes credentials and private email by default.

Before implementation verify which existing collections contain these resources. If colleges lack stable IDs or staff assignments are session fields, introduce only the minimal migration required, with a reviewed mapping. Historical missing affiliations remain unknown, never guessed from email or team city names.

### Example requests

GET /api/v1/students/{uid}?include=workshops,scores,participation,certificates&workshopId=GMU0810
GET /api/v1/students/{uid}/scores?workshopId=GMU0810&metric=composite&publicationStatus=published
GET /api/v1/workshops?collegeId={collegeId}&dateFrom=2026-10-01&dateTo=2026-11-01
GET /api/v1/captains?workshopId=GMU0810&regionId=west

GMU0810 currently names a session code; the schema audit must establish its canonical workshop ID and code mapping rather than assume all future workshop IDs are human-readable codes.

### Revised implementation order

1. Canonical workshop/student IDs, workshop metadata and score response dimensions.
2. Student details with bounded workshop/score/participation/certificate expansions.
3. College and staff assignment resources plus their query filters.
4. OpenAPI schemas, authorization/query tests, then matching read-only MCP tools.

Preserve existing app APIs and published historical scores. This revision adds resource structure and provenance; it does not approve score recalculation or production deployment.

## Delivered activity write extension (12 October 2026)

OpenAPI v1.3 adds authenticated student activity credit POST awards/deductions, GET contribution revision and PUT contribution correction. `credits:write` is an explicit admin-token permission; UUID request keys, stable event IDs, immutable deltas and erasure replay tombstones preserve retries and privacy. These changes contribute to the existing unified student total. MCP stays GET-only. Contract and limits: [API.md](API.md).
