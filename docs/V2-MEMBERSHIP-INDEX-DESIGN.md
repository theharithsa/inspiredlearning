# v2 authoritative membership index — #17

Owner decision (28 October 2026): design the complete index and verified legacy migration with v2, rather than a pre-v2 migration. The merged paged/resumable compatibility discovery remains until a replacement is proven complete. This document does not mark #17 fixed or authorize a production backfill.

## Required invariant

An index used to suppress erased history must include every relevant legacy/live-only membership, including joins while a learner is opted out. learningEnrollments alone is incomplete because portal enrollment is intentionally suppressed by privacy markers. An asynchronous trigger without completeness guarantees cannot certify immediate membership visibility before erasure.

## Proposed write/read model

Use an authoritative per-UID membership index with stable workshop IDs and source provenance, maintained atomically with the actual membership write path. Keep published InspiredLearning history and Live activity records separate; an index pointer grants no score/certificate/privacy permission. Do not infer affiliation, captain authority or a new role from an index entry. Design archival/deletion tombstones and session-code reservation before removing source sessions.

The concrete candidate below follows the inspected Live join/move/deletion paths. It is not made admin-editable through a generic Firestore API. Validate UID/path consistency in shared rules or a trusted server policy and test malicious/partial writes. All consumers recheck current privacy/blocked-session policy.

## Migration acceptance

1. Inventory all actual membership create/update/delete paths and old documents without a uid field. Model joins/deletes during migration, opt-out/reactivation and trigger retries.
2. Build a bounded idempotent dry-run/backfill/reconciliation tool with durable cursors, source versions and explicit completeness reporting. Never turn a partial scan into a complete flag.
3. Update the authoritative write path first through a separate ChaiCart Live issue/PR and both regression suites. Deploy prerequisites only with scoped authorization; no paid resource or shared rule/index provisioning is implied by this design.
4. Reconcile per-UID/per-workshop counts and differences against the legacy source, including live-only and erased cases. Run concurrent join/delete/erasure tests and a second reconciliation after catch-up.
5. Gate indexed reads on verified completeness/version, retaining safe fallback for incomplete legacy partitions. Measure reads/latency and verify no historical result resurrection. Keep rollback compatible with privacy tombstones.
6. Only after accepted source tests and separately authorized production migration/verification can the global compatibility scan be retired and #17 closed.

No migration is run merely to demonstrate v2 styling. No shared Authentication/UID migration, stored-credit recalculation or certificate reissue is part of this index design.


## Concrete v1 index candidate

Inspected source: Live `src/lib/membership.ts:joinTeam` atomically creates `sessions/{sid}/students/{uid}` and occupies the team-role slot; `src/console/StudentsTab.tsx:move` atomically moves slots and updates the existing student; `functions/workshop.js:deleteSession` marks deletion, checks permanent-history/privacy preservation and recursively deletes the session. `firestore.rules` owns the client-side join/move boundary. Older student documents need not contain a uid field: the student document ID is authoritative. The local source-copy checksums matched these four current workspace files on 28 October; no Live file is changed by this design.

Proposed minimal pointer: `learningMembershipIndex/{uid}/workshops/{sid}` with `schemaVersion:1`, `uid`, `workshopId:sid`, `source:"chaicart-live"`, `firstObservedAt` (trusted server time), and `sourceState:"present"|"archived"`. No name, email, team score, region, certificate or institutional affiliation belongs here. Stable `{uid,sid}` IDs deduplicate retries. This pointer records an ever-observed membership for privacy discovery; it does not imply current attendance, completion or access. Archived pointers retain only the workshop identifier and provenance; existing published history/blocked-session metadata continue to own their own semantics. Review the minimal-pointer retention/erasure policy before any collection is deployed; no new TTL is assumed.

`learningMembershipIndex/{uid}` carries `schemaVersion`, `verificationEpoch`, `status:"backfilling"|"verified"|"invalid"`, and `verifiedAt`. A UID marker alone is never proof that an absent legacy membership does not exist. Indexed-only discovery requires a completed global source-coverage epoch plus a matching verified UID marker. Missing, invalid or interrupted metadata uses the existing paged/resumable fallback. Treat UIDs with zero known rows as unverified until the complete source scan proves that absence.

### Atomic write paths and lifecycle

- Join: extend the existing source/team transaction with the minimal pointer. Shared rules use `getAfter` to require matching source UID/sid and pointer in the same commit, deny a standalone forged pointer, disallow client completeness flags and require trusted timestamps. Reject session deletion/archived reservation as today. Membership pointers must still be written when InspiredLearning opt-out suppresses learner enrollment; otherwise the original privacy bug returns.
- Team move: membership identity is unchanged, so the existing transaction keeps the same pointer. Any future move across workshops is a new membership plus a retained old pointer, never a rename that loses privacy coverage.
- Individual removal: before an authorized source student deletion, atomically preserve/update the minimal pointer. Do not allow the source deletion to erase discovery evidence. Enumerate any operational/import/Admin SDK scripts before enabling the new invariant; client rules cannot constrain Admin SDK bypasses.
- Workshop deletion: first retain the existing deleting fence, preventing new joins. A bounded, resumable preflight materializes pointers for every remaining source student and verifies archive/privacy preservation. Recursive deletion begins only after that preflight is complete. Keep archived pointer/reservation semantics compatible with retries and existing deletion guards.
- Erasure: collect the union of indexed memberships, current InspiredLearning history and applicable fallback results, then use the existing guarded erasure state machine. No read optimization can drop blocked sessions or create completion. Reactivation only allows future eligible workshops; old pointers never clear privacy blocks. Concurrent join/erase must retry on the privacy generation/fence before declaring completion.

### Migration proof and API envelope

Install/test every authoritative writer and deletion preflight before starting a migration epoch. Page session IDs and their student document IDs with durable cursors; also reconcile permanent history for archived source workshops. Upsert pointers idempotently without rewriting published records. Record source coverage, reconciled differences, failures and the writer-invariant version. A transactionally committed epoch is eligible only after all partitions complete and a second reconciliation finds no gaps. New atomic joins cannot be missed behind a completed legacy cursor; deleting sessions are fenced and preflighted. A bypassed writer or incomplete partition invalidates the relevant completeness proof and retains fallback.

A future migration PR must first specify Google-admin-only, recent-authenticated, reasoned dry-run/start/resume/status operations (proposed `/api/v1/admin/migrations/membership-index` and `/{id}`). Inputs are allowlisted `mode`, bounded page size (1–100), opaque cursor, expected epoch/version and UUID idempotency key for writes. Responses disclose aggregate counts/status/cursor and bounded safe failures, never learner exports. Deny learners/captains/scoped automation; use 400 invalid input, 401/403 identity/authority, 409 stale epoch or invalid state, 429 bounds and safe 5xx dependency failures. Persist canonical transition audits and stable job IDs. These proposed endpoints are not in OpenAPI 1.5.0 and must not be advertised as implemented.

Acceptance must exercise old records without uid, an empty UID, multiple session pages, join/move/delete during scans, repeated jobs, interrupted preflight, opted-out joins, concurrent erasure/reactivation, archived source removal, malicious pointer-only writes and a deliberately bypassed Admin SDK writer. Compare the final membership set and unchanged certificate/credit/privacy outcomes against fallback; measure reads and latency before retiring it. Source/rules deployment and a production backfill remain separate approvals and #17 stays open.

Completeness concurrency detail: every future authoritative pointer write must also advance a per-UID membership revision in its transaction. Erasure/reactivation reads and validates that revision in its final guarded transaction; a concurrent join forces retry. Preserve current privacy state throughout discovery. Joins after completed erasure remain suppressed from InspiredLearning until explicit reactivation, whose discovery must include those opted-out memberships. Shared rules must constrain revision writes to the caller's UID and the coupled membership write; implementing that constraint or moving the join behind a trusted policy is a prerequisite of the migration PR, not a permission granted to arbitrary client metadata writes.
