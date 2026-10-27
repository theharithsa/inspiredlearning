# InspiredLearning

A permanent learner account for the ChaiCart workshop, hosted separately in the same Firebase project. Sign in with the **same Google account used in ChaiCart Live**.

- Portal: https://inspiredlearning-vh.web.app
- Planned custom domain: https://inspi.in (DNS and certificate must be verified before use)
- Workshop: https://chaicloud-workshop.web.app
- Community: https://discord.gg/yMUe8Vy3U

## What learners get

Registered, pending verification, completed, not-attended, cancelled and revoked participation states; personal quiz results alongside separate team scores; activity summaries and confidence surveys; a credit adjustment log; authenticated certificate PDF downloads; optional public certificate verification; correction/removal requests and community access.

**Students have one Inspi credit total.** Each completed, attendance-verified workshop contributes its final team score plus the student's individual score. Individual credits intentionally count again as an attendance benefit. Latest corrections replace contributions; revoked results are excluded. Existing published records are included without republishing. Signed non-workshop entries can add or consume credits in the same account. Legacy 100-point completion fields are retained for compatibility and excluded from the unified total. Registration alone does not award credits.

## Run locally

Use Node 24 locally (Cloud Functions run Node 22) and Java 21 for emulators.

```sh
npm ci
npm ci --prefix functions
cp .env.example .env.local
# Fill the public Firebase web configuration; never put server tokens here.
npm run dev
```

The Firebase web SDK configuration is public identification, not a server credential. Production authentication requires verified Google sign-in. Anonymous authentication is intentionally excluded from permanent learner accounts.

## Check before deployment

```sh
npm run lint
npm test
npm run build
# Firebase CLI is installed from the root lockfile by npm ci.
npm run test:integration
npx playwright install chromium
npm run test:rehearsal
```

Rehearsals use `demo-chaicart`, isolated emulators and a localhost telemetry sink. They do not write workshop production data or export telemetry to Dynatrace. [Test coverage](docs/TESTING.md).

## Architecture

React/Vite frontend → verified Firebase callable functions in `asia-south1` → owner-scoped Firestore records. The `inspiredlearning` Functions codebase is separate from ChaiCart Live's codebase. PDFs are generated on demand from the issued immutable version, avoiding public storage links. Firebase Authentication and admin/captain permissions are shared with Live.

The **ChaiCart Live repository owns production Firestore rules and indexes**. This repository's rules copy is for emulator tests only; `firebase.json` deliberately cannot deploy shared production rules.

## Staff workflow

1. Open **Workshop staff**, enter the session code and load it.
2. Import existing registrations if the session predates this portal.
3. Verify actual attendance. Captains can verify only their own region; facilitators can verify any team.
4. Close the workshop after scoring is finished.
5. Facilitator publishes verified results. Attendance must be confirmed; missing personal results are shown as unavailable, not invented.
6. Learners open Certificates and download their PDF. Public verification is private until they opt in.
7. Review corrections and requests. Result revisions replace earlier certificates and record credit adjustments.

Completed Live sessions cannot be deleted until every current participant has a permanent reviewed status. Reopening a session does not bypass this guard. Permanent history survives Live session deletion, and archived certificates can still be corrected or revoked.

[Deployment and operations](docs/RUNBOOK.md) · [Observability](docs/OBSERVABILITY.md) · [Private handover](docs/PROJECT-HANDOVER.md).

## Administrator support

Google-authorized global facilitators use [Admin controls](https://inspiredlearning-vh.web.app/#/admin) to verify attendance, close and publish workshop completion, inspect permanent learner records by email/UID/certificate, preview issued certificates, correct profile or certificate details, revoke and reinstate verified completion, and resolve/decline/reopen student support requests. Captains review attendance only within their assigned region. Initial certificates require verified attendance and a closed workshop; quiz correctness is not a participation requirement.

Approved removal erases InspiredLearning history and certificates only, retaining shared Google sign-in and Live data. It has typed account confirmation, resumable processing, and an anti-reimport marker. Students see their request history and can explicitly start a new profile for future workshops. See [operations](docs/RUNBOOK.md) and [use-case validation](docs/USE-CASE-VALIDATION.md).

## Read API

The first API slice and Swagger documentation are prepared for the existing Functions/Hosting codebase. See [API contract and limits](docs/API.md) and `functions/openapi.json`. Production deployment requires separate authorization.

Global facilitators can create scoped, expiring read credentials from Admin controls → API tokens. Copy each credential once and use it in Swagger Authorize or the local MCP adapter; revocation and current issuer permissions are enforced by the API.

## APIs and integrations

- Production portal: [inspi.in](https://inspi.in/); stable Hosting URL: [inspiredlearning-vh.web.app](https://inspiredlearning-vh.web.app/).
- [Swagger API documentation](https://inspi.in/api/docs) and [OpenAPI contract](https://inspi.in/api/openapi.json).
- Bulk unified student totals: `GET /api/v1/students/scores?limit=100`; workshop/college filters are optional. Follow nextCursor to fetch all authorized students.
- Global facilitators manage scoped API tokens at `/#/admin`. Select read/write permissions, optional learner/workshop allowlists and expiry. Google reauthentication is required to create a token; copy the credential once and revoke it if exposed.
- Scoped POST/PUT corrections require a UUID Idempotency-Key, review reason and current expectedVersion. Domain writes are limited to colleges, assignments, memberships and profile name corrections.
- The [MCP adapter](mcp/README.md) exposes eleven local GET-only tools using the same REST permissions.

See [API contracts and privacy](docs/API.md), [release validation](docs/API-VALIDATION.md), [operations](docs/RUNBOOK.md) and [handover](docs/PROJECT-HANDOVER.md). Existing historical awards are included from their latest published snapshots without republishing. Community contributions share the same total, but public provider award/consumption write endpoints remain future work.

Production release verified on 11 October 2026 from source `050ecbc`: portal, Swagger and all nine dedicated Node 22 functions are live; 101 automated checks and source GitHub CI passed. Deployment evidence and remaining operator checks are in [RELEASE-CHECKS.md](docs/RELEASE-CHECKS.md).

## Webhook credit writes (API v1.3)

Admins can create a token with the new **credits:write** permission in `/#/admin` (unchecked by default). POST `/api/v1/students/{studentId}/credits` awards or deducts an activity contribution; PUT `/api/v1/students/{studentId}/credit-contributions/{contributionId}` corrects its amount using expectedVersion. Add scores:read for contribution revisions and unified totals. Existing tokens retain their permissions.

Webhook callers send a UUID Idempotency-Key and stable sourceId/eventId; identical events deduplicate across credentials. Writes append immutable deltas and audit events, preserve reviewed workshop results/certificates and enforce current admin authority, student restrictions and removal. Minimal event tombstones prevent replay after reactivation. Legacy learningPoints are compatibility data; use credits for the single Inspi total. Account capacity is 500 external adjustments (429 at capacity). MCP remains read-only. Full payloads and error/retry semantics: [API.md](docs/API.md).


## Maintenance candidate 1.0.1

Public certificates offer **Copy verification link** and **Show QR code** after public verification is enabled. These controls do not make private certificates public or bypass PDF authentication. Account removal remains a reviewed request; API-token revocation requires confirmation.

The portal uses memory-only Firestore caching. If upgrade cleanup is blocked, close other InspiredLearning tabs and reload; shared Google identity is preserved. This candidate is not deployment evidence. See [pre-redesign issue review](docs/ISSUE-TRIAGE-2026-10-27.md). The Material 3 redesign and separate admin app remain tracked as v2.0.0 in issue #34.
