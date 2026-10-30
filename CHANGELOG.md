# Changelog

## [2.2.1] - source candidate

- Expand dt-obs delivery coverage with source/observation timestamps, source review and PR revision facts, bounded issue relationships and exact-attempt replay.
- Move structured test ingestion into the trusted observer; exclude PR artifacts, validate bounded data-only ZIP summaries and preserve sanitized retry state. Add per-signal OTel SDK outcome diagnostics and current reporter version.
- Capture real Firebase Hosting deployment/rollback facts separately from live manifest/API/access verification, with optional verified native deployment markers.
- Add redacted browser route, callable/REST duration, request-ID and rejection/failure context with account-switch isolation. Keep canonical learner events unchanged.
- [Coverage, recovery, local evidence and activation/deployment gates](docs/OBSERVABILITY-2.2.1.md). No 2.2.1 production deployment or CI activation is certified.

## [2.2.0] - 2026-10-30

- Recompose the public landing page with original cartoon learning-world and notebook-companion illustrations, a clear Google entry, expressive type/shape hierarchy and responsive learning-story/community sections.
- Use semantic tonal containers for shared learner/admin panels, task cards and navigation. Keep the 2.1.4 aligned sidebar actions and Google-avatar account menu.
- Add current Material 3 spatial spring tokens and separate effects timing: expressive homepage entry, restrained operational feedback, velocity-preserving pointer retargeting, dialog/confirmation/route-heading entry and immediate keyboard/reduced-motion handling.
- Add responsive visual, image-load, accessibility and interruption/reduced-motion regressions, plus pure spring-continuity/convergence tests (#74). See [design audit and sources](docs/design/MATERIAL3-EXPRESSIVE-2.2.md) and [image provenance/prompts](public/illustrations/README.md).
- Deployed to inspi.in and admin.inspi.in from 6b18944 after approval. Live manifests, headers/caching, public verification, illustration bytes, Settings and both-surface RUM searchability were verified. Stored GMU0810 certificate and credit/status projections match before/after. Functions 2.0.1 / API 1.5.0 / MCP 1.0.1 are unchanged. [Production evidence and remaining gates](docs/RELEASE-2.2.0.md).

## [2.1.4] - source changes included in 2.2.0

- Align sidebar Settings and Sign out as Material list actions with the same icon/label inset as adjacent links in learner and admin apps.
- Move the account control to the header’s right edge; open account options directly from the avatar and remove the separate three-dot trigger.
- Display the signed-in Google/Firebase profile photo with an initials fallback for missing or failed images. Keep identity details in the account menu and preserve compact-screen access.
- Verify avatar-menu keyboard/focus, narrow-screen geometry, image failure, Settings and sign-out flows with synthetic emulator accounts (#72). These changes were deployed with 2.2.0; Functions 2.0.1 / API 1.5.0 / MCP 1.0.1 are unchanged.

## [2.1.3] - 2026-10-29

Deployed to [inspi.in](https://inspi.in) and [admin.inspi.in](https://admin.inspi.in). App 2.1.3 / Functions 2.0.1 / API 1.5.0 / MCP 1.0.1.

- **Learner and admin layouts** — simplify empty learner states, group Profile and record-support tasks, and use Material link actions consistently. Retain synthetic route/state screenshots across both apps (#63, #34).
- **Hosting security and caching** — enforce CSP, revalidate all SPA HTML, keep API responses and Swagger initialization uncached, externalize Swagger initialization, and load RUM asynchronously with bounded readiness buffering (#14).
- **Authenticated shared limits** — activate Firestore-backed counters for verified users and API tokens, with expiry cleanup and operation-usage telemetry. Public certificate checks retain the existing anonymous throttle; stronger public-client protection remains open (#15).
- **Development tooling** — patch Firebase CLI advisories with pinned CLI 15.34.2 and narrowly scoped core/uuid overrides; verify Pub/Sub propagation, multipart HTTP and CLI emulator compatibility (#57).
- **Release verification** — CI and live checks cover both sites, Google admin sign-in/reauthentication, reasoned PDF download, public certificate verification and searchable runtime telemetry. All 119 tracked GMU0810 credit/status records, 157 active certificates and 39 revoked/superseded versions were preserved.
- **Remaining work** — broader visual acceptance (#63), public-client protection (#15) and epic acceptance (#34) remain open. Alerts (#9) are deferred; the membership migration (#17) is held. Native RUM-to-backend navigation and CI observer activation remain unverified.

See [production evidence and limitations](docs/RELEASE-2.1.3.md) and the [GitHub release](https://github.com/theharithsa/inspiredlearning/releases/tag/v2.1.3).

## [2.1.2] - 2026-10-29

- Keep the Settings title, close control and action footer visible while only the body scrolls; remove duplicate preview actions and make the font control visible at laptop height.
- Rebalance shared workspace, heading, panel and verification-banner spacing; use content-width actions in stacked forms.
- Add four viewport geometry regressions. This is the scoped correction in #64; broader route-by-route visual acceptance remains tracked by #63. Functions 2.0.0/API 1.5.0/MCP 1.0.1 are unchanged.

## [2.1.1] - 2026-10-29

- Patch the frontend’s transitive re2js dependency to 2.8.7 for GHSA-gg6h-894w-4m9c, found during the production release audit (#60).
- Keep the Material 3 design, Firebase identities, permissions and published records unchanged. Functions remains 2.0.0, API 1.5.0 and MCP 1.0.1.

## [2.1.0] - 2026-10-29 (source)

- **Material 3 coverage** — replace native controls/popups with pinned Material Web adapters, official symbols and shared semantic roles across learner/admin/public screens.
- **Appearance settings** — approved violet default, six palettes and fourteen real locally served font families with license/provenance, persistence/reset and fallback feedback.
- **Interaction verification** — keyboard/forms, dialogs/calendar, all fonts/palettes and automated accessibility checks complement existing emulator journeys.
- Functions 2.0.0/API 1.5.0/MCP 1.0.1, auth policies and published records are unchanged. Source version does not establish deployment.

## 2.0.0 — source release

- Material 3 semantic themes, adaptive navigation, accessible controls and confirmation dialogs across learner and existing administration workflows.
- Separate administrator app/build/bootstrap at admin.inspi.in with per-tab session persistence, current server role checks and recent Google reauthentication for sensitive operations.
- Compatible API 1.5.0 adds administrator capability bootstrap; shared learner/captain, certificate, credit and privacy policies are preserved.
- Versioned artifact manifests, read-only release verifier, delivery observability reporters and repository agent guidance; membership migration remains a documented acceptance gate.
- MCP 1.0.1 patches compatible dependency advisories without changing its GET-only contract; remaining Firebase CLI development-only advisories are tracked in #57.
- Production rollout, tenant verification and secure CI activation require their separate release evidence.

## 1.0.2 — 27 October 2026 (source candidate)

- **Operational recovery** — Google-admin-only API/UI for outbox health, bounded metadata and audited idempotent redrive; original payload/event identity retained. New backlog/lag metrics and source-owned SLO/alerts/dashboard.
- **Dependencies and logs** — Native Firestore plus Auth, PDF, batch and outbound child spans; selectable log sinks preserve current defaults.
- **Frontend maintenance** — Public routes avoid Firebase startup, live histories are bounded with load-more, transport/PDF helpers and types are shared, staff/token views split and strict TypeScript enabled.
- **Configuration and privacy recovery** — Safe defaults and per-function profiles preserve existing limits and fixed captain mapping; legacy privacy discovery is paged/resumable, with the complete membership-index migration still open in #17.
- No production deployment, retention change, paid provisioning, shared rule/index change or historical score/certificate migration.

## 1.0.1 — maintenance candidate

- Fix telemetry context, caller rejection classification, route/resource metadata, bounded flush and outbox retry/recovery behavior.
- Complete atomic certificate lifecycle event coverage and remove unknown-credit sentinels.
- Keep Firestore learner/staff data in memory and clear the app-specific legacy cache before rendering.
- Fix requests paging, form/error recovery, selection, credit refetching, route accessibility and certificate sharing.
- Harden CI/runtime coverage and non-breaking Hosting headers; keep CSP report-only.

This is a source maintenance release candidate, not production release evidence. Full issue dispositions and limitations: docs/ISSUE-TRIAGE-2026-10-27.md. Material 3 redesign remains v2.0.0 in issue #34.

## API 1.3.0 — 12 October 2026

- **Webhook student credit writes** — Add scoped, idempotent POST activity awards/deductions and versioned PUT corrections to the unified Inspi credit account, with immutable adjustments, removal replay protection, OpenAPI v1.3 descriptions and admin token permission.

## Administrator controls and validation — 7 October 2026

- Role-gated admin control centre, email lookup and reasoned private certificate previews.
- Verified profile/name/title/date corrections and archived completion reinstatement with points restored once.
- Live student requests, paginated history, resolve/decline/reopen decisions and owner-visible responses.
- Scoped, resumable portal-only removal, anti-reimport marker and explicit future-workshop reactivation.
- Shared Live archival accepts completed erasure without recreating removed learner data.
- Expanded backend, permissions, mobile/browser and telemetry regression cases.

## Earlier API additions — originally undated

- **Admin API tokens** — select read scopes, learner/workshop restrictions and expiry in the admin portal; credentials are copied once, hashed server-side, audited, and revocable, with current issuer authority checked on every request.

- **Read API and Swagger** — shared-identity learner, history, published scores, participation, published quiz submissions and certificate reads with privacy filtering, bounded pagination and audited facilitator access.
- **Local read-only MCP** — eight typed tools over the authenticated API with structured results and no database access.

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
