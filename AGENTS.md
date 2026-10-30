# Working on InspiredLearning

Start with Git status/remotes, docs/PROJECT-HANDOVER.md and the relevant API/observability docs. Preserve unrelated edits. Stress-test assumptions; give concrete evidence and limitations without filler agreement.

InspiredLearning is the durable platform; ChaiCart Live is the workshop activity app. Share Firebase Auth UIDs; never migrate accounts, infer roles or republish historical outcomes as a UI test. Shared Firestore rules/indexes and Live write paths belong to ChaiCart Live.

Use issue → branch → linked PR → actual checks/review → authorized merge. Deployment is a separate authorization and verification boundary. Do not infer permission from historical release notes. No direct main pushes or bypassing failed checks.

New domain features are API-first: contract, server policy, validation/errors, bounded pagination, idempotency/concurrency where relevant, committed audit and meaningful tests before UI integration. Keep callables and /api/v1 compatible; app and API contract versions are independent.

Read [skills/README.md](skills/README.md) for module guidance. Tests use demo-chaicart emulators and local telemetry only. Never copy credentials from chat/history or include secrets in VITE_* settings. Do not alter another project's running emulators to free a test port.

Maintenance decisions are in docs/MAINTENANCE-POLICY-2026-10-27.md. v2.0.0 / admin.inspi.in is planned in GitHub #34; no UI restyling, new identity policy, paid infrastructure or production data migration follows automatically from maintenance approval.


v2.0.0 implementation is authorized under #34: Material 3 across existing InspiredLearning workflows and a separate admin.inspi.in app, with approved tab/session persistence and recent reauthentication, no mandatory MFA. This supersedes the earlier planning-only UI restriction. Read docs/DESIGN-SYSTEM.md, docs/API-V2-ADMIN-CONTRACT.md and docs/V2-RELEASE-PLAN.md. Membership #17 is design-only until migration is separately accepted. Source PR/merge permission does not authorize admin Hosting/DNS/Auth-domain provisioning, CI credential binding or production deployment. Preserve fixed captain mapping, current limits, outbox retention and documented email attribution.

Current production deployment: app 2.2.0 at inspi.in and admin.inspi.in; Functions 2.0.1/API 1.5.0. Read docs/RELEASE-2.2.0.md before relying on the historical planning-only gates above. Future deployments, identity-policy changes, paid provisioning and learner migrations still require their own scope.

Maintenance candidate 2.1.3 is tracked in docs/RELEASE-2.1.3-PLAN.md. The owner accepted shared authenticated limits after usage review; activate only with an approved production Functions release. Public IP protection remains separately unresolved. #9 alert setup is explicitly deferred. #17 membership writer/rules/backfill/cutover is explicitly on hold. Preserve those gates even after source merges.

2.1.3 is deployed from 42b2efb. Preserve the approved production SHARED_RATE_LIMITS=true setting during future deployments; source/local defaults remain off. Public IP buckets are excluded. #9 alerts are deferred, #17 migration is held, and CI observer/native RUM linkage remain unverified. Consult dated release evidence before closing broader issues.

2.2.0 is deployed from 6b18944 to both Hosting sites. This release changed frontend assets only; the existing Functions 2.0.1/shared-limit runtime was not redeployed. Release evidence is in docs/RELEASE-2.2.0.md. Future production deployments still need their own approval.
