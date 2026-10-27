# Changelog

## 1.0.1 — maintenance candidate

- Fix telemetry context, caller rejection classification, route/resource metadata, bounded flush and outbox retry/recovery behavior.
- Complete atomic certificate lifecycle event coverage and remove unknown-credit sentinels.
- Keep Firestore learner/staff data in memory and clear the app-specific legacy cache before rendering.
- Fix requests paging, form/error recovery, selection, credit refetching, route accessibility and certificate sharing.
- Harden CI/runtime coverage and non-breaking Hosting headers; keep CSP report-only.

This is a source maintenance release candidate, not production release evidence. Full issue dispositions and limitations: docs/ISSUE-TRIAGE-2026-10-27.md. Material 3 redesign remains v2.0.0 in issue #34.


## [Unreleased]

- **Admin API tokens** — select read scopes, learner/workshop restrictions and expiry in the admin portal; credentials are copied once, hashed server-side, audited, and revocable, with current issuer authority checked on every request.

- **Read API and Swagger** — shared-identity learner, history, published scores, participation, published quiz submissions and certificate reads with privacy filtering, bounded pagination and audited facilitator access.
- **Local read-only MCP** — eight typed tools over the authenticated API with structured results and no database access.


## Administrator controls and validation — 7 October 2026

- Role-gated admin control centre, email lookup and reasoned private certificate previews.
- Verified profile/name/title/date corrections and archived completion reinstatement with points restored once.
- Live student requests, paginated history, resolve/decline/reopen decisions and owner-visible responses.
- Scoped, resumable portal-only removal, anti-reimport marker and explicit future-workshop reactivation.
- Shared Live archival accepts completed erasure without recreating removed learner data.
- Expanded backend, permissions, mobile/browser and telemetry regression cases.

## 1.0.0

- Separate Google-authenticated learner portal and Firebase Hosting site.
- Durable workshop participation, separate personal/team results and versioned completion records.
- Exactly-once 100-point learning award, immutable ledger and revocation reversal.
- Owner-only PDF certificates, opt-in public verification and archived corrections.
- Regional attendance review, facilitator publication, account-support requests and Discord onboarding.
- Correlated RUM, OTel logs/metrics/traces and durable canonical BizEvents.
- Isolated emulator and browser regression suites.

- Grouped resource APIs and Swagger categories; explicit colleges and memberships, filtered student/workshop rosters and latest published credits. Added scoped, version-checked, idempotent POST/PUT college, assignment, membership and name corrections with atomic audits and erasure cleanup. MCP remains read-only.
- Unified student credit totals across Inspi: completed workshop team score plus individual score, intentionally counting individual awards again as the attendance benefit. Added global bulk/owner score reads, prospective adjustment logs, correction/revocation/reinstatement safety and unified portal displays; preserved legacy completion data and certificates.

## API 1.3.0 — 12 October 2026

- **Webhook student credit writes** — Add scoped, idempotent POST activity awards/deductions and versioned PUT corrections to the unified Inspi credit account, with immutable adjustments, removal replay protection, OpenAPI v1.3 descriptions and admin token permission.
