# Operations runbook

Current production evidence and independent Hosting rollback references: [2.1.1 release](RELEASE-2.1.1.md), deployed 29 October 2026. Learner https://inspi.in and administrator https://admin.inspi.in. Older single-portal routes below are historical.

## Deploy

Project: `chaicloud-workshop`. Hosting target `inspiredlearning` maps to `inspiredlearning-vh`; Functions codebase `inspiredlearning` uses region `asia-south1` and the existing server secret `DYNATRACE_PLATFORM_TOKEN`.

```sh
firebase login
npm run build
firebase deploy --project chaicloud-workshop --only functions:inspiredlearning,hosting:inspiredlearning
```

Deploy shared Firestore rules/indexes and Live integration from **chaicart-live**, not from this repository. Do not use an unscoped functions deployment or delete the other codebase. Tokens stay in Secret Manager. Never add credentials, `.env.local`, `.secret.local`, service account files or deployment logs to Git.

## Domain

DNS is managed in GoDaddy. Use Firebase Hosting's current **exact required DNS records** for `inspi.in`; do not guess the address or remove unrelated MX/TXT records. The Firebase URL works independently of custom-domain propagation. Check domain ownership and certificate status before distributing `inspi.in`. Certificate QR codes use the stable Firebase verification URL.

## Publish completion

Use Admin controls (global facilitators) or Workshop staff (captains) → Load workshop → Import existing registrations for older sessions. Verify attendees rather than inferring attendance from a name or a login. Mark absentees not-attended. Captains are region-scoped; only global facilitators can close and publish. Complete scoring before publishing. Publish again after score corrections to create a new result/certificate version. Identical publication is a no-op.

A failed batch reports per-learner failures; correct those and repeat. The transaction and latest result revision prevent duplicate credit awards. Deleting a reviewed live session retains all permanent learner records and certificates. Session codes with archived learner records cannot be reused.

## Administrator controls and archived records

Open `/#/admin` after Google sign-in. Only global facilitators from `admins/{email}` can use this control centre; captains retain region-scoped attendance review through `/#/staff`. Navigation visibility is not authorization: backend transactions recheck the role for privileged changes.

Find permanent records by the learner's Google email, UID, or certificate ID. Add a review note before any correction or decision. Correct learner display name affects only the portal profile, not Google identity or issued certificates. Replace certificate details allows verified name, workshop title and date changes, creates a new private revision and invalidates its predecessor without more points. An administrator can preview an issued PDF with a recorded review reason; students can download only their own issued certificates.

Revoke completion invalidates its certificate and removes its unified credit contribution. Reinstate only previously verified revoked completion: it restores that contribution once and issues a new private certificate. Legacy 100-point fields continue to transition for compatibility but never enter the unified total. It cannot manufacture attendance or initial completion. These controls remain available after the Live session is archived. Never change aggregate credits or source contributions directly.

## Student requests and removal

Learners submit corrections or removal requests in Profile and can see status and the review response. Pending requests arrive live in Admin controls. The first page has 50 records; Load more retrieves subsequent pages. Apply a verified profile/certificate correction before choosing **Resolve correction**. Administrators may decline requests with a reason, or reopen reviewed requests. Completed removals cannot be reopened; a new request is needed for newly created data.

For removal, open the learner's submitted removal request, add the review reason, choose **Approve removal**, and type the exact learner account reference. Scope is **InspiredLearning history and certificates only**: recursive learner history, versions, points, reviews and owned certificates are removed; enrollment arrays are cleared and other requests are reduced to minimal status. Shared Firebase Authentication, Google sign-in and ChaiCart Live workshop records remain intact.

A minimal UID removal marker, blocked workshop codes and request resolution remain to prevent accidental re-import. Previously downloaded PDFs cannot be recalled; monitoring has separate Dynatrace retention controls. Do not promise those have been erased by this operation.

The request stays processing until deletion completes. Failed work is resumable: use **Retry removal** with the same request and typed UID, or let the five-minute recovery job finish it after the lease expires. Inspect `learningPrivacy` for persistent erasing state. Do not manually mark processing work resolved. Removed learners see the removal status instead of stale results. They may explicitly start a new profile for future workshops; old workshop codes remain blocked and no old points or certificates return.

## Recovery

Outbox `learningTelemetry` stores canonical events pending/delivered. A scheduled retry runs every five minutes with leases and exponential delay. Inspect pending retries and export errors; fix secret scopes/endpoint before replaying. Do not regenerate event IDs for retries. Completion can be republished safely; revocation must remain an explicit staff decision. Do not restore credits by editing aggregate totals manually.

## Authentication

Google sign-in must be enabled and all Hosting/custom domains authorized in Firebase Authentication. Learners use the same Google account as Live. Anonymous users cannot obtain certificates. Staff authorization comes from `admins/{email}` (facilitator) or `sessions/{sid}/staff/{email}` (regional captain), not frontend route visibility.

## Rollback

For a frontend regression, use Firebase Hosting release history for **inspiredlearning-vh** to restore its previous version, leaving ChaiCart Live's Hosting site intact. For backend changes, check out the last verified source and redeploy only `functions:inspiredlearning`; retain the durable records and outbox. A frontend rollback does not roll back Functions, security rules or Firestore data. Coordinate any shared rules rollback through ChaiCart Live's reviewed rules source and run both apps' permission tests first. Never delete learner records or the points ledger as a rollback shortcut.

Initial creation of retry-enabled functions requires Firebase's `--force` deployment option after reviewing their idempotency. If an initial build leaves new functions in FAILED state with missing trigger metadata, verify they are never-live functions in the dedicated codebase before removing/recreating those failed placeholders. Do not apply that cleanup procedure to active workshop functions.

## Scoped API credentials

Global facilitators open `/#/admin` → **API tokens** to create scoped credentials, select permissions, limit learner/workshop IDs, choose a short expiry and revoke their tokens. Google reauthentication is required for creation. Copy the credential once; it cannot be retrieved from stored metadata. Use the raw credential in Swagger Authorize or the local MCP adapter’s `INSPIREDLEARNING_API_TOKEN`. Token-mediated requests cannot create or revoke credentials. If a credential is exposed, revoke it and create a replacement; expiry, account disablement and role removal also block future requests. See [API policy and contract](API.md).

Deploy this portal panel together with `learningApi` and the Hosting `/api/**` rewrite. Production deployment was explicitly authorized by the user on 11 October 2026. Do not deploy shared rules/indexes or other Functions codebases.

Resource API corrections require explicit write permissions, review reason, expectedVersion and UUID Idempotency-Key. Review [resource contract](API-RESOURCE-CONTRACT.md) before wiring webhook clients. No incoming webhook receiver is included.

## Unified scoring operations

Use `GET /api/v1/students/scores?limit=100` for bulk totals; follow nextCursor until null. Workshop filtering is optional. Each published completed workshop contributes team score plus individual score, with the approved repeat-individual attendance benefit. Non-workshop entries add signed amounts to the same account. A null total means source awards are unknown; knownCredits is a subtotal, not the full total. CreditAccount reads use a consistent transaction snapshot and fail above 500 records per source rather than truncate. Inspect latest permanent source records when reconciling; no Live backfill or automatic legacy points conversion occurs.

After a reviewed score correction, republish through the existing attendance/completion workflow. Identical publication does not append a second adjustment or award. Credit transaction logs are prospective and omit private reasons; original historical awards still count even when they predate that log. Removal recursively deletes contributions/adjustments. Community producer write APIs are not part of this release.

The production web build needs the existing project's public Firebase web configuration. Keep `.env.production.local` ignored; never commit environment/secret files. Functions target Node 22; local emulator verification used host Node 24. Shared rules/indexes remain owned by ChaiCart Live. The docs-only local preview on port 8787 is not an authenticated API server.

Latest verified release: source `050ecbc`, deployed 11 October 2026. Live portal/API docs on inspi.in and the stable Firebase URL are verified. All nine dedicated Functions are ACTIVE (Node 22). See RELEASE-CHECKS.md for source CI and release evidence.

## Webhook credit writes (API v1.3)

Admins can create a token with the new **credits:write** permission in `/#/admin` (unchecked by default). POST `/api/v1/students/{studentId}/credits` awards or deducts an activity contribution; PUT `/api/v1/students/{studentId}/credit-contributions/{contributionId}` corrects its amount using expectedVersion. Add scores:read for contribution revisions and unified totals. Existing tokens retain their permissions.

Webhook callers send a UUID Idempotency-Key and stable sourceId/eventId; identical events deduplicate across credentials. Writes append immutable deltas and audit events, preserve reviewed workshop results/certificates and enforce current admin authority, student restrictions and removal. Minimal event tombstones prevent replay after reactivation. Legacy learningPoints are compatibility data; use credits for the single Inspi total. Account capacity is 500 external adjustments (429 at capacity). MCP remains read-only. Full payloads and error/retry semantics: [API.md](API.md).


## Maintenance 1.0.1 recovery notes

The app uses memory-only Firestore caching. On upgrade it clears only its Firestore instance's old IndexedDB cache before rendering; if an old tab blocks cleanup, close the other InspiredLearning tabs and reload. Firebase Auth persistence is not cleared by cache cleanup. No cache cleanup promises forensic secure erasure.

Outbox events marked failed are not delivered again automatically. Preserve their payload/event IDs and investigate HTTP status/configuration before a separately reviewed redrive. Pending/failed TTL, redrive UI and alert thresholds are tracked in #9/#32/#33. Do not delete pending records or change event IDs to make backlog numbers green. Retry recovery processes erasures before deliveries; inspect each failed erasure independently.

CSP is report-only in the maintenance configuration. Validate actual Google OAuth, Swagger and Dynatrace script/beacon origins before enforcing it. Source headers are not proof that deployed responses contain them.

## Maintenance telemetry recovery (1.0.2 source)

In the current administrator controls, open **Telemetry delivery health**. Refresh aggregate counts and failed metadata; oldest pending age is explicitly unavailable when the bounded sample cannot prove it. Inspect HTTP status and diagnose the exporter/configuration before retrying. Enter a review reason and confirm **Redrive failed event**. The server rechecks current global administrator status, failed state/attempt count and inactive lease. Identical retries reuse their receipt and original event ID; payloads cannot be edited. The UI retains the request key and reason after a failed response. Refresh before starting a different review. Queued means pending, not Dynatrace accepted; scheduled retries run every five minutes.

Do not bulk-reset pending/failed rows, delete events to hide backlog or grant a scoped API credential access to this panel. Firestore outbox retention remains unchanged by owner decision. Configuration and actual validation limits are in [observability/README.md](../observability/README.md). Use TELEMETRY_LOG_SINK=platform only after checking the GCP forwarder; otlp only after verifying OTLP visibility. Both remains the default. Do not promise console fallback for an OTLP export failure after initialization; bounded platform flush warnings are the fallback diagnostic.

Privacy recovery processes paged erasure discovery and unfinished reactivation scans. Existing blocked workshops remain blocked. See the [maintenance policy](MAINTENANCE-POLICY-2026-10-27.md) before replacing legacy membership discovery with an index.


## v2 separate administrator workspace (source)

Open https://admin.inspi.in after its separately approved deployment. Sign in using the existing authorized Google account. Learner inspi.in no longer loads global administrator tools; legacy administrator links hand off. Captains continue /#/staff with fixed workshop/region authority. Admin navigation separates workshops, learner records, certificate register, support requests, scoped integrations and event delivery.

Admin sign-in is limited to the current tab/session; refresh retains it, closing clears it, learner persistence stays unchanged. For sensitive changes or non-owner PDF previews, use Verify with Google or accept the action's Google reauthentication popup. Verification lasts five minutes under the existing recent-auth policy; this is not an idle timeout. A cancelled popup/action does not submit the mutation. If the account or role changes, review access and the action again. Never repeat a write after an uncertain response without checking its existing idempotency/result state.

Existing reason requirements, erasure scope, replay guards, immutable certificate versions and score semantics still apply. Use V2-RELEASE-PLAN.md for backend-first rollout, admin-origin checks, learner handoff deployment and independent Hosting rollback. Current source does not establish that admin.inspi.in is deployed.
