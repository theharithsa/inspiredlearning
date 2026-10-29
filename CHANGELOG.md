# Changelog

## 2.0.0 — source release

- Material 3 semantic themes, adaptive navigation, accessible controls and confirmation dialogs across learner and existing administration workflows.
- Separate administrator app/build/bootstrap at admin.inspi.in with per-tab session persistence, current server role checks and recent Google reauthentication for sensitive operations.
- Compatible API 1.5.0 adds administrator capability bootstrap; shared learner/captain, certificate, credit and privacy policies are preserved.
- Versioned artifact manifests, read-only release verifier, delivery observability reporters and repository agent guidance; membership migration remains a documented acceptance gate.
- MCP 1.0.1 patches compatible dependency advisories without changing its GET-only contract; remaining Firebase CLI development-only advisories are tracked in #57.
- Production rollout, tenant verification and secure CI activation require their separate release evidence.


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

## 1.0.2 — 27 October 2026 (source candidate)

- **Operational recovery** — Google-admin-only API/UI for outbox health, bounded metadata and audited idempotent redrive; original payload/event identity retained. New backlog/lag metrics and source-owned SLO/alerts/dashboard.
- **Dependencies and logs** — Native Firestore plus Auth, PDF, batch and outbound child spans; selectable log sinks preserve current defaults.
- **Frontend maintenance** — Public routes avoid Firebase startup, live histories are bounded with load-more, transport/PDF helpers and types are shared, staff/token views split and strict TypeScript enabled.
- **Configuration and privacy recovery** — Safe defaults and per-function profiles preserve existing limits and fixed captain mapping; legacy privacy discovery is paged/resumable, with the complete membership-index migration still open in #17.
- No production deployment, retention change, paid provisioning, shared rule/index change or historical score/certificate migration.

## [2.1.0] - 2026-10-29 (source)

- **Material 3 coverage** — replace native controls/popups with pinned Material Web adapters, official symbols and shared semantic roles across learner/admin/public screens.
- **Appearance settings** — approved violet default, six palettes and fourteen real locally served font families with license/provenance, persistence/reset and fallback feedback.
- **Interaction verification** — keyboard/forms, dialogs/calendar, all fonts/palettes and automated accessibility checks complement existing emulator journeys.
- Functions 2.0.0/API 1.5.0/MCP 1.0.1, auth policies and published records are unchanged. Source version does not establish deployment.

## [2.1.1] - 2026-10-29

- Patch the frontend’s transitive re2js dependency to 2.8.7 for GHSA-gg6h-894w-4m9c, found during the production release audit (#60).
- Keep the Material 3 design, Firebase identities, permissions and published records unchanged. Functions remains 2.0.0, API 1.5.0 and MCP 1.0.1.

## [2.1.2] - 2026-10-29

- Keep the Settings title, close control and action footer visible while only the body scrolls; remove duplicate preview actions and make the font control visible at laptop height.
- Rebalance shared workspace, heading, panel and verification-banner spacing; use content-width actions in stacked forms.
- Add four viewport geometry regressions. This is the scoped correction in #64; broader route-by-route visual acceptance remains tracked by #63. Functions 2.0.0/API 1.5.0/MCP 1.0.1 are unchanged.

## Unreleased

- 2.1.3 candidate (#63/#34): simplify empty learner states, group profile/support tasks, finish Material link CTAs and retain synthetic route/state screenshots across both surfaces.
- Candidate #14: enforce Hosting CSP, revalidate all SPA HTML, externalize Swagger initialization and load RUM asynchronously with bounded readiness buffering; production OAuth/RUM validation remains required.

- Patch Firebase CLI tooling advisories (#57) with pinned CLI 15.34.2 and narrowly scoped, API-reviewed core/uuid overrides. Add real Pub/Sub propagation, multipart HTTP and CLI emulator compatibility gates. No runtime Functions dependency or production deployment changes are included.
