# Resource API extension contract

This records the initial resource extension. The later explicitly approved unified student-credit policy and global score endpoints are documented in [API.md](API.md). Production deployment was authorized on 11 October 2026.

Approved scope: latest published credits; college records, workshop college assignment, learner membership and profile corrections. No score recalculation, arbitrary document writes, attendance/completion/certificate writes, webhook receiver or production deployment.

All routes are under `/api/v1`. Swagger groups: Students, Workshops, Colleges, Certificates, Admin tokens. Existing paths remain supported; `/workshops/{workshopId}/participants/{studentId}/scores` and `/submissions` are workshop-oriented aliases to the same published-result service.

## Reads

| Route | Semantics |
|---|---|
| GET /students | Admin paginated catalogue; exact email, collegeId, workshopId filters combined with AND; include=credits requires workshopId and scores permission. |
| GET /workshops | Admin active Live workshop metadata catalogue; collegeId and status filters use only explicitly assigned hosting-college metadata. |
| GET /workshops/{id}/participants | Admin paginated permanent participants, with optional collegeId and include=credits; no Live enrollment backfill. |
| GET /workshops/{id}/scores | Admin paginated participant rows containing the three distinct latest published measures, collegeId filter optional. |
| GET /colleges; GET /colleges/{id} | Admin allowlisted stable college catalogue. Membership does not confer authority. |
| GET /students/{id}/college-memberships | Owner/admin bounded explicit institutional/workshop affiliations. |

Student catalogue scan reads at most limit+1 entries from the selected index (profiles, college roster, or a workshop enrollment UID index), then bounded authorization/privacy joins. Empty pages can have continuation cursors; fetch all pages to obtain all permitted results. Cursors bind actor/credential/filter/include to the selected index. Exact-email ambiguity remains a conflict. Unknown filters or unsupported include values are errors.

Credits default to the latest stored permanent result, not Live leaderboard values. Individual credits, team credits and learning points retain their metric, unit, publication status, source, workshop dimensions and as-of timestamp. Missing values stay null. The original components remain provenance; canonical cross-activity totals now follow the explicitly approved team-plus-individual attendance policy in API.md. Revoked results are marked revoked. Global profile learningPoints remains the separate published completion balance.

## Explicit college model

`learningColleges/{collegeId}`: stable caller-chosen lowercase ID (2–64 characters), name, active/inactive status, revision and timestamp. No existing workshop or learner is assigned a guessed college.

`learningWorkshopMetadata/{workshopId}`: explicit hosting-college assignment with collegeRevision. This does not mutate the shared Live session.

`learningLearners/{uid}/collegeMemberships/{institutional|workshopId}`: explicit active/inactive affiliation with collegeId, optional workshopId, revision, timestamps and private reasoned versions. One institutional college and one college per workshop are supported in this slice.

`learningCollegeRoster/{hash(collegeId,uid)}`: server-only pointer index with UID, collegeId, institutional flag and active workshop IDs. It contains no name/email/scores. A college-only learner filter matches any active explicit affiliation; college+workshop matches the explicit affiliation for that workshop. Historical unknown membership stays unknown. Writes atomically update the source and pointer index; erasure deletes both learner descendants and roster pointers. Minimal hashed replay tombstones remain without request bodies or result data, preventing delayed retries from restoring removed data after reactivation.

## Writes

| Route | Body | Permission |
|---|---|---|
| POST /colleges | collegeId, name, status, reason | colleges:write |
| PUT /colleges/{id} | name, status, expectedVersion, reason | colleges:write |
| PUT /workshops/{id}/college | collegeId, expectedVersion, reason | workshops:college:write |
| PUT /students/{id}/college-membership | collegeId, status, expectedVersion, reason | memberships:write |
| PUT /workshops/{id}/participants/{uid}/college-membership | collegeId, status, expectedVersion, reason | memberships:write |
| PUT /students/{id}/profile | name, expectedVersion, reason | students:profile:write |

All writes require a current global facilitator identity or a specifically selected write scope on an admin-issued token; old read tokens never acquire write access. Learner/workshop token restrictions apply to target resources. Workshop-restricted tokens cannot mutate global learner profiles/institutional affiliations. Request bodies are bounded JSON, unknown fields are rejected and review reason is mandatory. expectedVersion=0 creates a previously absent assignment; subsequent writes require the current revision. Inactive colleges cannot receive new assignments.

A UUID Idempotency-Key is required for every domain write. The request digest, minimal response, mutation and outbox audit are committed in one Firestore transaction. A replay with the same method/path/settings returns the first result; reuse for different settings conflicts. Authorization and privacy are rechecked even on replay. Stale versions conflict; unavailable resources return 404; authorization failures return 403; missing/invalid credentials return 401. Successful writes return stable IDs and revision, never overwrite Auth UID/email or published scores/certificates.

Profile correction uses the same transactional domain helper as existing admin callables. Explicit learner profile edits also advance profileRevision so stale REST writes cannot silently overwrite them. College/roster/operation records are server-only and require no client rule grants. Shared rules and indexes remain owned by ChaiCart Live.

External webhook callers can later invoke these protected write routes with scoped credentials and event-derived idempotency keys. Incoming webhook verification, signatures, retries and provider-specific payload mapping require their own contract; this extension does not create an unauthenticated receiver.

## Acceptance

Verify AND filters, bounded continuation, no college inference, private/erased participants, credit null/zero/provenance, scoped read/write separation, stale versions, duplicate webhook-style replay, concurrent creation, profile/callable consistency, membership index consistency, erasure/recovery cleanup, OpenAPI responses and grouped Swagger rendering. Keep MCP tools read-only and map their filters to the same services.
