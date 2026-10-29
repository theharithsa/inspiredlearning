# 2.1.3 maintenance candidate — release plan

This is a reviewable source/release plan, not deployment authorization or a completed release record.

## Scope

- App 2.1.3: learner empty/profile layouts, administrator Requests hierarchy and complete Material primary link controls (#68, references #63/#34).
- Functions 2.0.1: external Swagger initialization for enforced CSP (#67) and disabled-by-default transactional request counters (#66).
- REST API remains 1.5.0; MCP remains 1.0.1. No domain permissions, credits, certificates, fixed captain mapping or shared Firebase UIDs change.
- CLI-only advisory remediation was merged in #65. It does not require a production deployment.

#9 alert delivery remains deferred by explicit decision. Outbox retention and documented email telemetry remain unchanged. No membership-index writer, rules/index deployment, backfill or completeness cutover (#17), paid infrastructure or CI credential binding is included. The membership migration is explicitly on hold by owner decision.

## Predeployment gates

1. Review and merge #66/#67/#68 only on passing exact-head checks; resolve the combined source and run the applicable integrated checks. Do not reuse success from a previous head or treat cancelled/skipped jobs as passing.
2. Run lint, unit, both demo builds, production dependency audits, Firestore integration, Auth, Swagger, MCP and full browser rehearsal. Include test:security-browser and test:hosting-cache from #67, tooling compatibility and the six counter emulator cases from #66. Review CI synthetic-route-review screenshots from #68. Tests use demo-chaicart/local collectors only.
3. The owner accepted shared authenticated limits after reviewing emulator usage: verified users/API tokens only, with public checks available under the existing anonymous throttle. Activate SHARED_RATE_LIMITS=true with the approved production Functions rollout; the source default remains off. Public/pre-auth IP keys remain excluded regardless of this flag. The emulator report is not production performance or billing evidence; record actual counter operation/latency observations separately after activation.
4. Capture current deployed functions/Hosting revisions and read-only learner/certificate projection hashes. Confirm existing secure configuration/rollback artifacts without printing credentials. Build the exact clean merged revision with the existing production public config passed to both modes. Verify both version.json files: app version, correct surface, clean revision and production environment. Never deploy the demo CI artifacts.
5. Obtain release authorization for the concrete integrated candidate. Repository source/merge permission alone does not grant production rollout.

## Ordered scoped rollout and postdeployment checks

Deploy only the InspiredLearning Functions codebase first so /api/docs/swagger-init.js exists. Deploy administrator Hosting and then learner Hosting to the existing sites/targets. No ChaiCart hosting/functions/rules/indexes or Auth/DNS provisioning changes.

Verify live version manifests on inspi.in/admin.inspi.in against the immutable revision; API 1.5.0/Functions 2.0.1 health; safe anonymous denial of admin reads; actual CSP/no-cache HTML/no-store API/immutable assets for both surfaces; Swagger rendering. Exercise real-origin Google sign-in, recent reauthentication, tab/session persistence, authorized PDF and opt-in public/private verification without altering learner results. Inspect console/CSP violations and actual responsive task layouts. Compare read-only learner/certificate projections before and after.

Record telemetry acceptance separately from actual tenant spans/logs/metrics/browser identity/events. An asynchronously loaded agent can miss early native timings/actions. No native RUM-to-backend linkage, CI observer or alert delivery is certified by deployment/HTTP success. Do not configure #9 alerts.

#15 stays open through an approved shared-counter activation and verification, including unresolved anonymous-client identity protection. #14 stays open until actual OAuth/PDF/header/RUM verification. #63/#34 acceptance is based on completed route/release review, not version number alone.

## Rollback

Retain current 2.1.2 learner/admin Hosting versions and existing Functions 2.0.0 revision before rollout. Roll back through provider-supported artifacts, not a rebuild of old source with new dependencies. Coordinate Functions/Hosting rollback because the enforced CSP expects external Swagger initialization. If counters are later activated, disable the flag before reverting implementation; do not delete learner records or reset privacy/outbox state. Counter cleanup is private metadata housekeeping and must not block privacy recovery/canonical delivery.
