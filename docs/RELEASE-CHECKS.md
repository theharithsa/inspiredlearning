# Release checks — 7 October 2026

## Administrator support release

Source `b14a76b` adds role-gated administrator controls, private certificate preview, verified profile/certificate corrections, archived completion reinstatement, live paginated requests, request decisions, scoped resumable removal and future-only reactivation. Runtime deployed to the existing Firebase URL on 7 October; changed functions were confirmed ACTIVE, the RUM tag and new administrator controls are present in production assets, and the production Firebase configuration is correct. Shared privacy rule is released; pending/history production queries were accepted without additional indexes. No real learner records were changed by this release's simulation.

119 automated cases passed: four portal model, 24 portal backend/rules, 17 portal browser, 39 Live rules/actions/audit, 17 Live browser and 18 Live backend unit cases. The Live browser suite passed again after patching dependencies. Build and lint succeeded (existing Fast Refresh warnings remain). Live frontend and backend clean installs report zero audit vulnerabilities after source-map-js/UUID patches. UI screenshots and private PDFs were checked in the rehearsal.

GitHub CI passed for portal runtime `b14a76b` and shared archival source `7377ad4`. Live patch source `a0ce28d` is deployed, with all seven telemetry functions confirmed ACTIVE; its regression workflow is tracked in GitHub Actions. These checks do not replace real Google OAuth or custom-domain verification below.

## Initial deployment

- InspiredLearning: https://inspiredlearning-vh.web.app
- Private repository: https://github.com/theharithsa/inspiredlearning (privacy verified)
- Source implementation: `79f6313`; all eight dedicated Firebase functions are ACTIVE.
- Shared learning rules/indexes and the Live archival backend are deployed from ChaiCart Live.
- Facilitator guide and Workshop Flow Map include the permanent learner completion handoff.
- Review channel: https://inspiredlearning-vh--review-tf3wvsog.web.app (temporary, expires 8 October).

## Verification

78 automated cases passed across the portal and Live integration: four portal model, ten portal backend/rules, nine portal browser, 38 Live backend/rules and 17 Live browser cases. The final Live browser run also simulated reopening an older completed session without the archive flag. PDF layout was rendered and inspected; mobile layout and staff screens were inspected. Backend clean installation with Firebase's npm version passed, with zero reported dependency vulnerabilities.

Dynatrace accepted traces, metrics and logs from the real portal OTel SDK using the existing protected credential. Production registration created a registered record with zero learning points and no certificate. Its enrollment and cancellation canonical BizEvents reached delivered state with genuine trace/span and transaction IDs. The disposable session and learner fixture were removed; real attendees and their scores were not changed. The deployed frontend contains the supplied RUM tag and showed no browser errors during the public-page check.

GitHub CI passed for portal source `79f6313`, the Live integration source, and the updated facilitator notes. Later documentation-only updates do not change deployed runtime behavior. The final older-session frontend fix is tracked in the Live repository separately.

## Remaining external checks

`inspi.in` still needs GoDaddy sign-in and DNS changes. Firebase's verified requested records are:

| Type | Name | Required value |
| --- | --- | --- |
| A | @ | 199.36.158.100 |
| TXT | @ | hosting-site=inspiredlearning-vh |

The existing root A value was `76.76.21.21`; changing it moves the root website to Firebase. Preserve email MX and SPF records. Re-read Firebase's domain requirements before applying changes, then verify ownership, TLS certificate and real Google sign-in on the custom domain. The Firebase URL works meanwhile. Google authentication was tested through isolated emulator identities; a live user's OAuth flow and custom-domain login still require a real account check.

For a session created before the portal, a facilitator opens Workshop staff and imports existing registrations. Staff must confirm actual attendance before publication. No historical completion, attendance or score was guessed during deployment.

## API, admin tokens and unified student credits — 11 October 2026

Release candidate includes OpenAPI v1.2.0 with 34 described operations, role-gated admin token creation/revocation, explicit college/membership resources and reasoned idempotent POST/PUT corrections. Unified student totals are available without a workshop through `/api/v1/students/scores`; each completed workshop awards final team score plus individual score, intentionally counting individual credits again as the approved attendance benefit. Legacy fixed learning points remain compatibility data and are excluded. Publication/correction/revocation/reinstatement append atomic prospective adjustments; old published snapshots count without republishing or certificate replacement.

The user explicitly authorized production deployment and GitHub README/handover updates. Preflight verified `chaicloud-workshop`, Hosting target `inspiredlearning-vh`, private GitHub repository/main branch, and the existing public Firebase app configuration. inspi.in currently maps to the same app; no DNS change is required. The production build embeds the existing shared Firebase configuration, not demo settings. Production dependency audits report zero vulnerabilities for web, Functions and MCP. Nine unit tests also pass under the declared production Node 22 runtime. Shared rules/indexes and the Live codebase are excluded from deployment.

Final full-browser/shared-regression and deployment outcomes will be appended after completion. No production learner records are intentionally changed during release verification. Production sign-in/authorized student data require a real Google session; isolated emulator fixtures exercise those flows without altering production records. The MCP adapter remains local stdio and GET-only; no hosted MCP server is part of deployment.
