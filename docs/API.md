# Resource API v1

The initial slice is implemented in `functions/api.js` with a Firebase HTTPS transport (`learningApi`). Hosting routes `/api/**` before the SPA. `/api/docs` serves locally packaged Swagger UI; `/api/openapi.json` is the versioned OpenAPI 3.1 contract. Production deployment was explicitly authorized and completed on 11 October 2026; see RELEASE-CHECKS.md.

Supply `Authorization: Bearer <credential>` using an admin-created scoped InspiredLearning API token or a short-lived Firebase ID token from the existing shared Google sign-in. Revocation is checked. Anonymous, unverified and other provider tokens are rejected. No new accounts, rules or indexes are introduced. Explicitly scoped POST/PUT corrections are available; unsupported writes return 405. The Google-admin credential-management resource separately supports creation and revocation. Authenticated reads are rate limited per actor and IP, measured with traceparent and X-Request-Id, and return no-store responses. Global facilitator reads of other learners and exact email lookups require durable audit events; audit failure fails the request. Request IDs are returned in X-Request-Id. Tokens and query bodies are not logged.

Implemented:

- `/me`, `/students/{studentId}`: allowlisted profile, owner/global facilitator.
- `/students?email=...`: exact normalized email, global facilitator, at most one unique result. Ambiguous email is 409. Optional college/workshop filters combine with AND; paginated catalog requests support include=credits when workshopId is provided.
- `/me/workshops`, `/students/{studentId}/workshops`: permanent learning history, owner/global facilitator.
- `/me/certificates`, `/students/{studentId}/certificates`, `/certificates/{certificateId}`: private issued and revoked version metadata, owner/global facilitator. No PDFs or public visibility bypass.
- `/students/{studentId}/scores?workshopId=...`: three separate measures from the permanent result. Missing values remain null; unreviewed records disclose no score. No composite score is invented. Unknown historical scoring versions remain null, separate from the result revision.
- `/students/{studentId}/participation?workshopId=...`: bounded published individual/team activity summary (maximum 100 entries); no raw answers, comments, notes or telemetry. Unknown review/timestamps/credits remain null.
- `/students/{studentId}/submissions?workshopId=...`: immutable published personal quiz answers, correctness and awarded credits, maximum 100 entries; private fields excluded. Missing historical submission times stay null. Owner/global facilitator only.
- `/workshops/{workshopId}`: allowlisted active session metadata for enrolled learners, global facilitators or session-assigned captains. Deleted sessions return 404; permanent learner history survives deletion.

Canonical workshop IDs are currently Firestore `sessions` document IDs and permanent workshop document IDs. Session codes are reserved after archival, so the current ID is stable, but this does not establish a future independent college/workshop ID model. College affiliation is explicit via the college resources; unknown affiliation and end date/timezone are null rather than inferred.

History/certificate lists use document-ID order with limit 25 (maximum 100) and filter-bound, actor-bound opaque cursors. Each database page reads at most limit+1 records; privacy filtering can produce an empty page with a continuation cursor. Continue until nextCursor is null. All unsupported/repeated filters return 400. Erasing/erased learners are unavailable, and reactivated learners' blocked workshops are excluded. Live submissions are never joined to reconstruct removed history.

## Remaining resources

Staff directories, live submissions, feedback and additional profile expansions remain unimplemented. College records, workshop catalog and permanent rosters follow [the resource contract](API-RESOURCE-CONTRACT.md); captain authority is a session-specific email assignment and region. This slice does not grant captains private profiles, archived scores or certificates. Those require purpose-specific contracts and authorization tests before expansion. Feedback pairing tests belong to the future feedback endpoints.

## Local validation

Run `npm test`, `npm run test:integration`, `npm run test:swagger`, `npm run test:api-auth`, and the shared ChaiCart Live rules/action/audit suite. Integration tests check OpenAPI schemas with Ajv and owner/admin/captain/privacy boundaries. Rehearsals use demo-chaicart only. Swagger authorization is in memory (persistAuthorization:false); never paste a permanent administrator credential.

## Local MCP

After API tests pass, `mcp/` provides a local stdio adapter with ten typed GET tools. See [adapter setup](../mcp/README.md). It neither reads Firestore nor grants additional privileges; the supplied API token scopes or shared Firebase identity determine access. Token refresh and remote MCP authorization are outside this slice.


## Administrator token management

On `/#/admin`, global facilitators see **API tokens**. Choose a name, permissions, expiry (1, 7 or 30 days), and optional learner/workshop ID allowlists. Confirm Google sign-in, copy the new credential, and dismiss it after saving. Paste the raw token into Swagger **Authorize** (Swagger adds the Bearer prefix) or use it in an integration. No credential is saved in browser storage or rendered into DOM text/form values. The UI holds it temporarily in memory for the explicit clipboard action.

- `GET /admin/api-tokens`: your paginated metadata and available permissions. No secret/hash is returned.
- `POST /admin/api-tokens`: Google administrator identity authenticated in the last five minutes; bounded JSON settings; required UUID `Idempotency-Key`. The secret is returned once. Retrying the same key/settings returns metadata with secret=null; changed settings with that key conflict. If the first response was lost, revoke the listed token and create a replacement.
- `DELETE /admin/api-tokens/{tokenId}`: owner-only, idempotent revocation with Google administrator sign-in. API tokens cannot manage credentials.

The server stores only a SHA-256 digest of a 256-bit random secret, compares it in constant time, and enforces expiry/revocation. Every token request rechecks the current issuing Firebase user (enabled, verified Google provider, unchanged email) and global facilitator role. Tokens cannot grant a captain or student global administrator rights. Token ID is a separate credential identity retained in audits alongside the existing issuer UID; it does not create or duplicate a Google account. Disabled/deleted accounts or removed admin roles invalidate future requests automatically.

Only selected scopes are allowed. Old tokens remain read-only; writes require explicit colleges:write, workshops:college:write, memberships:write or students:profile:write grants. Learner IDs restrict learner-linked records. Workshop IDs restrict workshop-linked records and filter list pages; they do not infer membership or restrict global profile fields, so use learner IDs for profile/lookup restrictions. The existing owner/admin and privacy policy is also enforced. Restrictions can yield an empty page with a continuation cursor. Read cursors are bound to the credential ID. Permissions cannot be changed in place: revoke and replace the token. There are at most 25 active unexpired tokens per administrator, enforced transactionally.

Lifecycle audit events are `api-token.created`, `api-token.listed`, `api-token.revoked`; token-mediated reads also emit `api.token.read` with the credential ID, never the secret. Creating/revoking credentials and their outbox events are atomic. Firestore clients cannot directly read/write `learningApiTokens` or `learningApiTokenOwners`; no shared rules or index deployment is required.

## Organized resources and writes

Swagger groups Students, Workshops, Colleges, Certificates and Admin tokens. Examples:

- `GET /api/v1/students?collegeId=my-college&workshopId=WORK001&include=credits` lists explicit college/workshop participants with latest published individual credits, team credits and learning points. Continue nextCursor to fetch every permitted student.
- `GET /api/v1/workshops/WORK001/participants` and `/scores` give workshop rosters and published results.
- `GET /api/v1/colleges` lists stable explicit college records; existing memberships are never inferred.

POST /colleges creates a college. PUT college records, workshop college assignment, learner college membership and profile name corrections require UUID Idempotency-Key, review reason and expectedVersion. Names never change shared Google identity. Stale versions return 409; identical retries return the first response. No score, attendance, completion or certificate write is exposed. See [request bodies, scopes and privacy contract](API-RESOURCE-CONTRACT.md). Webhook clients can use these authenticated routes; provider webhook receivers are a later feature. MCP remains GET-only.

For expectedVersion use profileRevision from student details, collegeRevision from workshop details, and revision from college/membership records. Select the corresponding read permission alongside a write permission when the client needs to retrieve the current version. The new model does not automatically populate existing college affiliations.

## Unified student credits (v1.2)

`GET /api/v1/students/scores` (alias `/scores`) lists paginated student totals across Inspi without requiring a workshop. Optional collegeId and workshopId filters remain available. `GET /api/v1/students/{studentId}/scores` without workshopId returns one unified account; `/me/scores` reads your own account. Owner/global-facilitator permissions remain unchanged; bulk lists require a global facilitator, and tokens require scores:read. Workshop-restricted tokens must use a permitted workshopId filter, rather than receive an unrestricted total.

Each latest completed workshop result contributes **final team credits + individual credits**. Team credits already include individual performance; adding the individual amount again is the deliberately approved attendance benefit. Legacy fixed completion learningPoints are retained for compatibility, never added to this total. Score components remain source dimensions, not separate student balances. Revoked or erased/blocked results do not contribute. Corrections replace the contribution; repeated publication does not award again. Existing published snapshots count without a data migration, certificate replacement or Live leaderboard query.

CreditAccount returns totalCredits, knownCredits, unknownAwards, contributionCount, unit, policy and asOf. Unknown awarded components make totalCredits null rather than silently zero; knownCredits is only a subtotal. A zero award is valid. Accounts are bounded to 500 workshop records and 500 non-workshop entries; larger accounts fail with 429 rather than return a truncated total. Non-workshop signed contributions use server-owned `learningLearners/{uid}/creditEntries` and join the same total. Clients cannot write these entries; public community award/consumption endpoints are not included in this change.

New publication, correction, revocation and reinstatement transactions append an immutable credit adjustment and audit in the same Firestore transaction. `GET /students/{studentId}/credit-transactions` and `/me/credit-transactions` expose paginated adjustments without private review reasons. Older snapshots may predate this log, so it is a prospective adjustment log, not a complete historical balance ledger. Learner erasure deletes entries and adjustments with the existing recursive deletion.

With workshopId, the pre-existing student scores endpoint retains its original three-measure response for compatibility. The canonical single-total read omits workshopId; the bulk `/students/scores` endpoint always returns unified accounts, even with a workshop filter. The portal now presents total Inspi credits, workshop awards and credit adjustments; historical learningPoints remain compatibility storage. The MCP `get_student_scores` tool maps to the same GET endpoints.

## Webhook credit writes (API v1.3)

Global facilitators can select **credits:write** when creating a token in `/#/admin`. Existing tokens are unchanged: create a new scoped token for this integration. Add scores:read to inspect totals and contribution revisions. Student restrictions are enforced; workshop-restricted credentials cannot change community credits. The caller must keep its token on its backend.

- `POST /api/v1/students/{studentId}/credits` creates a signed contribution. Example: `{"credits":50,"sourceId":"community","eventId":"activity-123","activityId":"mentoring","reason":"Completed mentoring"}`.
- `GET /api/v1/students/{studentId}/credit-contributions/{contributionId}` returns its current amount and revision.
- `PUT /api/v1/students/{studentId}/credit-contributions/{contributionId}` corrects that contribution: `{"credits":80,"expectedVersion":1,"reason":"Corrected award"}`. This appends +30 to the same account; it does not set the entire student balance to 80.

Send `Authorization: Bearer <token>`, `Content-Type: application/json` and a fresh UUID `Idempotency-Key` for each new POST/PUT operation. Retry the same operation with its original key. POST returns contributionId, revision, credits and delta. Stable sourceId/eventId deduplicate identical source events even across different retry keys or token rotations; conflicting event settings return 409. Replaying the initial POST after a correction returns its original receipt; GET provides the current revision. Negative contributions support deductions. credits must be an integer from -1,000,000,000 to 1,000,000,000; reasons are mandatory and at most 500 characters.

These writes affect the **single Inspi credit total**, read through `/students/scores` or `/students/{studentId}/scores`. Legacy learningPoints are compatibility data, not a second writable balance. Published workshop scores/certificates retain their existing reviewed correction workflow. Immutable credit entries, version records and audit/outbox events accompany every successful new adjustment; transaction reads expose event provenance but exclude private reasons. Removal deletes learner contributions and retains minimal opaque event tombstones to block delayed replay after reactivation. Accounts are bounded to 500 external adjustments; writes at capacity return 429 and require a future archival extension. MCP remains read-only. This is an authenticated API for webhook callers, not an unsigned public webhook receiver.


## Certificate register and recognition repair

Google-authenticated global facilitators can use GET `/api/v1/certificates` with optional workshopId, studentId, status (issued/revoked), kind (participation/award), cursor and limit (1–100). The paginated scan may return an empty filtered page with a nextCursor; continue until it is null. Items include certificate type, award title, linked participation certificate and verification path. The envelope also reports rendering.signatureConfigured; links do not override private verification settings. Tokens and ordinary learner/captain accounts cannot use the global register.

POST `/api/v1/workshops/{workshopId}/certificates/reconcile` accepts a mandatory reason and optional additionalAwards array of explicit {uid,title} individual recognitions. It only accepts a Google-authenticated global facilitator; API tokens are denied. It reads the completed workshop's existing scoped awards, preserves already published recognition/credit fields, issues missing deterministic award certificates and revokes older participation/award versions. It returns per-learner results, including failures for safe retries. This is a repair/publication operation, not a balance update. Admin portal access is at `/#/admin` → Certificate register.

Award PDFs are generated by the existing authenticated learningCertificate callable. Global facilitators must supply a preview reason; historical previews carry a revoked/superseded label. Public verification remains opt-in and checks current completion and privacy. Signature/template updates change future downloads, not PDF files already saved on student devices.

## Compatible API contract 1.4 (maintenance source)

See [API-MAINTENANCE-1.4.md](API-MAINTENANCE-1.4.md) for Google-admin-only telemetry health, paginated delivery metadata, audited idempotent redrive and minimal public certificate verification. Scoped API tokens and the GET-only MCP adapter gain no admin telemetry authority. That maintenance contract had 43 operations; its app version was independently 1.0.2. Production remains on its previously deployed contract until an authorized release.


## v2 source contract 1.5.0

Compatible contract 1.5.0 has 44 operations and adds Google-global-admin-only GET /api/v1/admin/access. The endpoint returns capabilities and the 300-second recency policy without learner data or profile creation. Sensitive Google-admin writes and non-owner certificate PDF previews require recent verified auth_time; stale/missing authentication returns failed-precondition. API token scopes, owner/captain boundaries and /api/v1 compatibility remain unchanged. See API-V2-ADMIN-CONTRACT.md. These are source contracts; production version must be checked independently.
