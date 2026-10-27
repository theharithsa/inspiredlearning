# Working on InspiredLearning

Start with Git status/remotes, docs/PROJECT-HANDOVER.md and the relevant API/observability docs. Preserve unrelated edits. Stress-test assumptions; give concrete evidence and limitations without filler agreement.

InspiredLearning is the durable platform; ChaiCart Live is the workshop activity app. Share Firebase Auth UIDs; never migrate accounts, infer roles or republish historical outcomes as a UI test. Shared Firestore rules/indexes and Live write paths belong to ChaiCart Live.

Use issue → branch → linked PR → actual checks/review → authorized merge. Deployment is a separate authorization and verification boundary. Do not infer permission from historical release notes. No direct main pushes or bypassing failed checks.

New domain features are API-first: contract, server policy, validation/errors, bounded pagination, idempotency/concurrency where relevant, committed audit and meaningful tests before UI integration. Keep callables and /api/v1 compatible; app and API contract versions are independent.

Read [skills/README.md](skills/README.md) for module guidance. Tests use demo-chaicart emulators and local telemetry only. Never copy credentials from chat/history or include secrets in VITE_* settings. Do not alter another project's running emulators to free a test port.

Maintenance decisions are in docs/MAINTENANCE-POLICY-2026-10-27.md. v2.0.0 / admin.inspi.in is planned in GitHub #34; no UI restyling, new identity policy, paid infrastructure or production data migration follows automatically from maintenance approval.
