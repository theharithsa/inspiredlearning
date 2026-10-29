# Verification

Automated coverage uses a disposable `demo-chaicart` project; no real attendees or production scores are changed.

- Four pure model cases: result scope, points transitions, verification privacy, identifier bounds.
- 24 backend/Firestore cases: idempotent enrollment, regional authorization, attendance/closed-session prerequisites, concurrent publication, result correction, owner isolation/forged writes, PDF with Latin/Devanagari name, revocation, persistent archival, archived correction/revocation, administrator controls, scoped removal/recovery/reactivation, pagination and request decisions.
- 17 browser rehearsal journeys: mobile onboarding/Discord, Google empty state/nonstaff denial, registration, attendance/publication/idempotency, results/PDF/verification, other-account and anonymous denial, captain boundary, profile/request review, revocation and archived history.

The browser auth helper is emulator-only. It is not imported by the production application. Real Google OAuth and GoDaddy domain ownership require external account configuration; passing emulator tests does not prove those providers' live account state. Production checks separately verify deployed Hosting, function health and telemetry delivery.

PDF visual review checks one-page layout, QR, certificate identity and version. Fonts include Noto Sans and Noto Sans Devanagari (OFL license); do not assume coverage for every writing system.


The expanded matrix is in [USE-CASE-VALIDATION.md](USE-CASE-VALIDATION.md). Shared Live rules/action/audit regression: 39 cases passed, including completed erasure as an archival alternative and rejecting in-progress erasure. The browser suite includes live request arrival, mobile corrected PDFs, role-gated navigation, email lookup, admin preview, archived reinstatement, request decisions, account switching, typed removal and future-only reactivation.

18 Live backend unit cases also passed. Total distinct automated cases across the two applications: 119. Live browser regression was repeated successfully after the dependency patches. Portal runtime and initial shared archival source passed GitHub CI.

## Maintenance 1.0.2 additions

Current executable commands, not historical case counts, are authoritative. `test:integration` now includes test/maintenance.test.mjs: Google-admin-only health/redrive denial, bounded payload-free pages, filter-bound cursors, transactional receipts/audit, optimistic/idempotent recovery, stable event identity, unknown age above the sample cap, paged/resumable legacy removal/reactivation, public REST verification, independently decoded real native Firestore/Auth/PDF/outbound OTLP spans and selectable log sinks. Unit tests include conservative fifteen-minute backlog growth and Hosting/emulator/profile consistency. Browser additions cover public-route Firebase/RUM isolation and redrive retries after a lost response.

To avoid services from unrelated projects, use `INSPI_REHEARSAL_FUNCTIONS_PORT=5003 INSPI_REHEARSAL_WEB_PORT=5184 npm run test:rehearsal`. Default ports remain unchanged in checked-in configuration. The rehearsal creates its own ignored temporary Firebase config and removes it on completion. Never terminate unrelated emulators to free a port. Local PDF-only timing is `node scripts/benchmark-pdf.mjs`; it is not a deployed load/capacity test.

No tests use production participant records. Decoded local telemetry, actual HTTP ingest acceptance and searchable Dynatrace records are separate evidence. Final results and remaining gates are recorded with the maintenance PR.


## v2 checks

Run npm run lint, npm test, npm run build; sequential emulator suites npm run test:integration, npm run test:api-auth, npm run test:swagger, npm --prefix mcp test and npm run test:rehearsal. Java 21 is required. If another project's local functions/web ports are in use, set INSPI_REHEARSAL_FUNCTIONS_PORT and INSPI_REHEARSAL_WEB_PORT; do not stop its services. Rehearsal is synthetic demo-chaicart only.

The browser suite covers separate admin bootstrap/session/learner isolation, denied/revoked access, account-change cancellation, responsive light/dark layouts, contrast, dialog keyboard behavior and existing publication/certificate/privacy/token/delivery journeys. Synthetic screenshots are generated under test-results/v2-design. This Chromium rehearsal does not prove physical Safari, real Google popup behavior, production DNS/TLS or Dynatrace tenant visibility.

Set TEST_REPORT_DIR=ci-results/structured for bounded structured Node/Playwright summaries. Keep this directory outside Playwright test-results, which is cleared when browser tests start. Missing/partial reports never count as success. GitHub artifacts are evidence only; privileged workflow observers do not execute or ingest PR artifacts.


## Material 3 controls and appearance

`npm test` includes strict preference validation, all bundled font hashes/licenses, six-palette text/outline contrast, date-only validation and a guard against raw native controls in app screens. `test/browser/material.spec.mjs` uses the actual Material adapters and DEV/emulator-only control fixture, plus public-page Settings. It checks keyboard submission, constraints, read-only/disabled controls, real dropdown selection, date selection/focus, fourteen loaded fonts, persistence/reset, font failure, every palette/mode, viewport bounds and axe WCAG rules. Existing domain journeys run through the new controls against emulators. No local preview auto-login helper is part of production source. See MATERIAL3-2.1-VERIFICATION.md for actual results and limits.

## Firebase CLI dependency compatibility (#57)

The pinned CLI is 15.34.2. Two scoped development-only overrides retain the CLI parent versions while patching the affected exported APIs: @google-cloud/pubsub uses @opentelemetry/core 2.12.0 (its tracing helper uses W3CTraceContextPropagator), and gaxios 6.7.1 uses CommonJS uuid 11.1.1 (its multipart path calls v4). These intentionally cross the parents' declared dependency ranges and require the compatibility gates below; do not broaden them or silently apply them to runtime Functions dependencies. Remove the exceptions after the upstream parents adopt patched ranges.

`npm run test:tooling` verifies the actual Pub/Sub injection/extraction path and bounded baggage extraction, UUID buffer rejection, and a local multipart HTTP upload. `npm run test:tooling-emulator` starts the pinned CLI's isolated Pub/Sub emulator with demo-chaicart, then creates a synthetic topic/subscription, publishes, pulls, acknowledges and removes those fixtures. It refuses a non-loopback emulator. Java 21 is required. CI runs both plus the existing Auth/Firestore/Functions/browser suites. `npm ci` must reconstruct the lockfile cleanly and `npm audit` must include development dependencies; an omit-dev audit cannot close this issue. No production deployment is required for this development-tooling fix.
