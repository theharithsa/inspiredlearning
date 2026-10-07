# Operations runbook

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

Use Workshop staff → Load workshop → Import existing registrations for older sessions. Verify attendees rather than inferring attendance from a name or a login. Mark absentees not-attended. Captains are region-scoped; only global facilitators can close and publish. Complete scoring before publishing. Publish again after score corrections to create a new result/certificate version. Identical publication is a no-op.

A failed batch reports per-learner failures; correct those and repeat. The transaction and ledger prevent duplicate points. Deleting a reviewed live session retains all permanent learner records and certificates. Session codes with archived learner records cannot be reused.

## Correct/revoke after archival

Workshop staff → Permanent records → Find by learner account reference (UID) or certificate ID. Add a review note. Correct certificate name creates a new private certificate revision and invalidates its predecessor, with no additional points. Revoke archived completion invalidates the certificate and subtracts the original 100 learning points once. Names on issued certificates do not follow student display-name edits.

## Requests and removal

Learners submit correction or removal requests from Profile. Global facilitators see pending requests. **Mark reviewed records the review only; it does not delete anything.** For removal, verify the requester owns the Google UID and confirm the requested scope. Revoke issued completions first so public verification becomes invalid. Through an authorized Firebase administrator, remove that UID's `learningLearners/{uid}` document and subcollections and owned `learningCertificates` records; remove their UID from `learningEnrollments` arrays. Remove associated requests after retaining only the minimum non-identifying review evidence required by your retention policy. Existing live workshop membership and Firebase Auth account deletion are separate decisions: confirm whether the request covers them before deleting. Telemetry has separate Dynatrace retention and erasure controls and must be handled there if requested. Check that account sign-in no longer exposes the removed learning data, then record the request resolution. Do not tell a learner their data is erased merely because a request was marked reviewed.

## Recovery

Outbox `learningTelemetry` stores canonical events pending/delivered. A scheduled retry runs every five minutes with leases and exponential delay. Inspect pending retries and export errors; fix secret scopes/endpoint before replaying. Do not regenerate event IDs for retries. Completion can be republished safely; revocation must remain an explicit staff decision. Do not restore points by editing aggregate totals manually.

## Authentication

Google sign-in must be enabled and all Hosting/custom domains authorized in Firebase Authentication. Learners use the same Google account as Live. Anonymous users cannot obtain certificates. Staff authorization comes from `admins/{email}` (facilitator) or `sessions/{sid}/staff/{email}` (regional captain), not frontend route visibility.

## Rollback

For a frontend regression, use Firebase Hosting release history for **inspiredlearning-vh** to restore its previous version, leaving ChaiCart Live's Hosting site intact. For backend changes, check out the last verified source and redeploy only `functions:inspiredlearning`; retain the durable records and outbox. A frontend rollback does not roll back Functions, security rules or Firestore data. Coordinate any shared rules rollback through ChaiCart Live's reviewed rules source and run both apps' permission tests first. Never delete learner records or the points ledger as a rollback shortcut.

Initial creation of retry-enabled functions requires Firebase's `--force` deployment option after reviewing their idempotency. If an initial build leaves new functions in FAILED state with missing trigger metadata, verify they are never-live functions in the dedicated codebase before removing/recreating those failed placeholders. Do not apply that cleanup procedure to active workshop functions.
