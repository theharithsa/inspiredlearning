# v2 authoritative membership index — #17

Owner decision (28 October 2026): design the complete index and verified legacy migration with v2, rather than a pre-v2 migration. The merged paged/resumable compatibility discovery remains until a replacement is proven complete. This document does not mark #17 fixed or authorize a production backfill.

## Required invariant

An index used to suppress erased history must include every relevant legacy/live-only membership, including joins while a learner is opted out. learningEnrollments alone is incomplete because portal enrollment is intentionally suppressed by privacy markers. An asynchronous trigger without completeness guarantees cannot certify immediate membership visibility before erasure.

## Proposed write/read model

Use an authoritative per-UID membership index with stable workshop IDs and source provenance, maintained atomically with the actual membership write path. Keep published InspiredLearning history and Live activity records separate; an index pointer grants no score/certificate/privacy permission. Do not infer affiliation, captain authority or a new role from an index entry. Design archival/deletion tombstones and session-code reservation before removing source sessions.

The exact shared path/schema must follow inspection of Live join/delete transactions and the broader workshop model; it is not made admin-editable through a generic Firestore API. Validate UID/path consistency in shared rules or a trusted server policy and test malicious/partial writes. All consumers recheck current privacy/blocked-session policy.

## Migration acceptance

1. Inventory all actual membership create/update/delete paths and old documents without a uid field. Model joins/deletes during migration, opt-out/reactivation and trigger retries.
2. Build a bounded idempotent dry-run/backfill/reconciliation tool with durable cursors, source versions and explicit completeness reporting. Never turn a partial scan into a complete flag.
3. Update the authoritative write path first through a separate ChaiCart Live issue/PR and both regression suites. Deploy prerequisites only with scoped authorization; no paid resource or shared rule/index provisioning is implied by this design.
4. Reconcile per-UID/per-workshop counts and differences against the legacy source, including live-only and erased cases. Run concurrent join/delete/erasure tests and a second reconciliation after catch-up.
5. Gate indexed reads on verified completeness/version, retaining safe fallback for incomplete legacy partitions. Measure reads/latency and verify no historical result resurrection. Keep rollback compatible with privacy tombstones.
6. Only after accepted source tests and separately authorized production migration/verification can the global compatibility scan be retired and #17 closed.

No migration is run merely to demonstrate v2 styling. No shared Authentication/UID migration, stored-credit recalculation or certificate reissue is part of this index design.
