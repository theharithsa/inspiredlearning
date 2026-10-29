# InspiredLearning 2.1.1 production release — 29 October 2026

Release tracking: #34; design implementation: #56/#59; release security patch: #61 (closes #60).

## Artifacts and rollout

Frontend 2.1.1, Functions 2.0.0, API 1.5.0, MCP 1.0.1. Frontend revision: 186c28efa6ee002c5b6f92347df23557b98edbb3. Backend source: 4420d1d4acc2a8aeeea24a7f785c17ef49f1fc68. The frontend patch has no Functions changes; the successful backend deployment was not repeated.

Only the nine InspiredLearning functions and learner/admin Hosting sites are included. Functions deployed first, then the separate admin app; learner cutover waited for the custom admin domain to serve HTTPS and real administrator Google sign-in/reauthentication. The eight ChaiCart function metadata records compare equal after recursive key normalization. ChaiCart Hosting release versions are unchanged.

The actual admin site is inspiredlearning-admin-vh; .firebaserc records the confirmed logical target inspiredlearning-admin. admin.inspi.in has the CNAME inspiredlearning-admin-vh.web.app, verified ownership and a valid HTTPS response. Existing Firebase authorized domains were retained; additions are admin.inspi.in and the new site's web.app/firebaseapp.com domains. Shared Authentication identities, roles and mandatory-MFA policy were not migrated.

Production configuration must reach both Vite builds: --mode admin does not inherit .env.production.local automatically. Load the existing secure production public config into the process environment for npm run build. Validate both version.json files as production, clean, matching revision/version and correct surface; never publish demo CI artifacts. No secrets or local preview identity bootstrap are part of the production bundle.

## Verification

PR #61 exact head bdd52af7874460d16a7de7b318b938d4b0f23b28 passed CI run 40872462178: 34 unit, 43 integration, 1 Auth, 1 Swagger, 3 MCP and 45 browser cases; Functions tests also passed on Node 22. GitGuardian passed. Both builds and lint passed. Both live manifests identify clean production revision 186c28e, version 2.1.1, API 1.5.0 and the correct surface. scripts/verify-release.mjs passed both public origins, API contracts and anonymous admin 401 checks. Its default private/tenant unresolved fields are supplemented by the independent checks below. Both origins return nosniff, DENY, strict-origin-when-cross-origin, restricted Permissions-Policy and CSP-Report-Only; CSP is not enforced. Root, Functions and MCP production dependency audits report zero vulnerabilities.

The release audit found GHSA-gg6h-894w-4m9c in transitive re2js 2.8.6. The compatible 2.8.7 patch is locked without adding a direct dependency or forced override. Frontend, Functions and MCP production audits report zero vulnerabilities; development-tooling advisories remain separately tracked by #57.

Real Google sign-in, recent Google reauthentication and read-only certificate register loading succeeded on the admin custom domain. The final 2.1.1 admin session survived refresh and cleared after tab close/reopen. The existing learner session remained signed in on inspi.in and its learning dashboard loaded without browser errors. The live admin Material settings showed all six palettes and fourteen fonts. Private checks do not authorize publication, correction, erasure, awards or token creation. Emulator browser checks cover destructive workflows on synthetic data only. Physical-device and Safari-specific UI coverage are not implied by Chromium checks.

Read-only GMU0810 verification checks 119 participation, 38 award and 39 revoked/superseded certificate versions. A projected hash comparison covers the 119 participant workshop statuses and stored credit fields; it excludes private names/emails and unrelated telemetry/audit changes. Baseline is after the compatible backend deployment and before the learner frontend cutover. The original unsorted JSON hash was sensitive to Firestore map key ordering, so it was not used to claim preservation. A read-only point-in-time re-read at 2026-10-29T12:14:09Z and a current read were recursively key-normalized: both 119-record workshop hashes are 42cae599333335f8ad8b47c3850fba857c7df54052339f7d461577c2d2773e22. The 196 certificate projection hash also matches before/after (53de9c3899cc2bfd4de397b6d8003c72e94cc95c19c1047c2d770a7830f37f3d). No participant record was changed as a test.

Dynatrace tenant bos01241 contains service.version 2.0.0 spans, logs and operation-outcome metrics from this deployment. Example api.request SERVER trace: 1f5e0bc096be1a7d2b7a4f804033ed4b; example auth-denial log trace: 82a3548205bac5493db3b98eac3381cd. The approved browser RUM script loads on the admin origin. These observations do not prove native RUM-to-backend navigation, all per-signal ingestion responses, alert evaluation, or CI lifecycle ingestion. The independent CI observer remains unbound and skipped; no runtime credential was copied into CI. SLO/notification installation and global infrastructure protection remain separate tracked work.

## Rollback

Previous learner Hosting release: sites/inspiredlearning-vh/releases/1792519826040000; previous version: sites/inspiredlearning-vh/versions/5b5e1f683d35dc20 (20 October). Restore a provider-supported previous Hosting release if needed; do not rebuild old source with today's dependencies as an equivalent rollback. Admin Hosting can roll back independently to its verified 2.1.0 artifact sites/inspiredlearning-admin-vh/versions/4db95e5da51b07e1. The administrator domain and Auth authorized-domain additions stay reserved; never roll back learner records, certificate history, erasure markers, event IDs or receipts. Review recovery compatibility before rolling back Functions.

Final Hosting versions: learner sites/inspiredlearning-vh/versions/4a6aac06f8a450a2 (12:28:01.670Z); admin sites/inspiredlearning-admin-vh/versions/5dcd533e5d6ea459 (12:27:28.168Z). Release documentation may advance main after this artifact revision; documentation-only changes do not redeploy the app.
