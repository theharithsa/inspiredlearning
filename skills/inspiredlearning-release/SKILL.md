---
name: inspiredlearning-release
description: Deliver InspiredLearning maintenance through linked issues, PR verification and explicit scoped release evidence.
metadata:
  upstream: app-launchpad
---

Use [testing](../../docs/TESTING.md), [release checks](../../docs/RELEASE-CHECKS.md), [runbook](../../docs/RUNBOOK.md) and [maintenance policy](../../docs/MAINTENANCE-POLICY-2026-10-27.md). Inspect current Git status/remotes and preserve unrelated edits. Historical deployment approval is not current authorization.

For each actionable change, reuse/create the GitHub issue before implementation, branch from a verified base, describe actual behavior in the PR, review the final diff and verify checks on the exact head before the authorized merge. Attach the PR to the task when that tool is available. Close only the scope actually resolved; keep partial/deployment/migration gates explicit. Do not direct-push main or bypass failing checks.

Run applicable commands from the repository root:

- npm run lint; npm test; npm run build
- npm run test:integration (Firestore, including decoded OTLP and outbox/erasure tests)
- npm run test:api-auth (Auth and Firestore); npm run test:swagger
- npm --prefix mcp test
- npm run test:rehearsal (real browser, Auth/Firestore/Functions, synthetic localhost collector)

The CLI is lockfile-pinned. Java 21 is required for current emulator tooling. Use demo-chaicart only. Rehearsal can avoid unrelated local services with INSPI_REHEARSAL_FUNCTIONS_PORT=5003 and INSPI_REHEARSAL_WEB_PORT=5184; leave those processes untouched. The script creates and removes only its temporary config and a missing synthetic .secret.local placeholder. Preserve existing secure files. Use meaningful shared ChaiCart Live rules/backend tests when touching shared data/privacy; do not modify their unrelated work.

Distinguish unit/integration/browser passes, reviewed source merge, production deploy, ingest acceptance, tenant visibility and cross-signal navigation. Record app/API versions separately and exact tested commit/tree, commands, actual counts, limitations and rollback scope. Before authorized deployment verify current origin/targets, config/secrets, compatibility and rollback; deploy only the approved InspiredLearning Hosting/Functions scope. Shared Auth, Live/rules/indexes, DNS, MFA, paid resources and production learner mutations require their own scope. After deployment check actual revision/health, public/denied paths, headers and approved journeys without republishing learner results. Verify telemetry independently. Never turn an undeployed merge into a release-success claim.

V2 builds have separate dist/ and dist-admin/ outputs. Read docs/V2-RELEASE-PLAN.md; verify version.json surface/revision/sourceState/environment for both. A logical firebase.admin.json target is not a provisioned site. node scripts/verify-release.mjs is read-only and deliberately leaves private OAuth/tenant checks unresolved. CI reports live outside Playwright output in ci-results/structured. Activate the independent delivery observer only after secure approved credential binding.

For maintenance 2.1.3, read docs/RELEASE-2.1.3-PLAN.md. Counter source, UI/CSP release, authenticated activation and public-IP protection have separate gates. Keep the counter flag off until usage/scope is accepted. #9 alerts are deferred and #17 migration is outside this release. Run the added Hosting/CSP gates and review exact-head synthetic route artifacts after all source PRs are integrated.
