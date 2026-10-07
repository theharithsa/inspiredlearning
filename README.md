# InspiredLearning

A permanent learner account for the ChaiCart workshop, hosted separately in the same Firebase project. Sign in with the **same Google account used in ChaiCart Live**.

- Portal: https://inspiredlearning-vh.web.app
- Planned custom domain: https://inspi.in (DNS and certificate must be verified before use)
- Workshop: https://chaicloud-workshop.web.app
- Community: https://discord.gg/yMUe8Vy3U

## What learners get

Registered, pending verification, completed, not-attended, cancelled and revoked participation states; personal quiz results alongside separate team scores; activity summaries and confidence surveys; a permanent points ledger; authenticated certificate PDF downloads; optional public certificate verification; correction/removal requests and community access.

**100 learning points are awarded once for each verified completed workshop.** These are separate from the workshop's team credits and individual quiz credits. Repeat publication and corrected certificates do not award another 100 points. Revocation reverses the award once. Registration and the old session-wide certificate announcement do not establish completion.

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
npm install --global firebase-tools
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
7. Review corrections and requests. Result revisions replace earlier certificates and preserve the points ledger.

Completed Live sessions cannot be deleted until every current participant has a permanent reviewed status. Reopening a session does not bypass this guard. Permanent history survives Live session deletion, and archived certificates can still be corrected or revoked.

[Deployment and operations](docs/RUNBOOK.md) · [Observability](docs/OBSERVABILITY.md) · [Private handover](docs/PROJECT-HANDOVER.md).

## Administrator support

Google-authorized global facilitators use [Admin controls](https://inspiredlearning-vh.web.app/#/admin) to verify attendance, close and publish workshop completion, inspect permanent learner records by email/UID/certificate, preview issued certificates, correct profile or certificate details, revoke and reinstate verified completion, and resolve/decline/reopen student support requests. Captains review attendance only within their assigned region. Initial certificates require verified attendance and a closed workshop; quiz correctness is not a participation requirement.

Approved removal erases InspiredLearning history and certificates only, retaining shared Google sign-in and Live data. It has typed account confirmation, resumable processing, and an anti-reimport marker. Students see their request history and can explicitly start a new profile for future workshops. See [operations](docs/RUNBOOK.md) and [use-case validation](docs/USE-CASE-VALIDATION.md).
