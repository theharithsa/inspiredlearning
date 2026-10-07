# InspiredLearning use-case validation

Tests use disposable `demo-chaicart` Firebase emulators, synthetic Google identities and a local telemetry receiver. They do not mutate real learners. Browser journeys exercise the actual UI, callable backend, Firestore rules and generated PDFs together.

| Workflow | Expected result | Coverage |
|---|---|---|
| Public onboarding / Discord | Mobile landing and community links work without account access | Browser |
| Google learner / new account | Empty account is usable; admin route denied | Browser + permissions |
| Join workshop / backfill older session | Registered history appears once, no points or certificate yet | Backend + browser |
| Captain attendance | Review only assigned region; cannot close, publish or run admin support | Backend + browser |
| Administrator attendance / completion | Verify attendance, close workshop, publish results; repeated/concurrent publish does not duplicate points | Backend + browser |
| Participation with wrong quiz answers | Verified attendance qualifies for participation certificate; scores accurately reflect performance | Backend |
| Absent / partial publication failure | Absent receives no certificate; per-learner failures reported and safe to retry | Backend |
| Individual/team results and surveys | Individual score and team score remain separate, with activity/confidence summaries | Model + backend + browser |
| Points ledger | Initial completion +100 once, revoke -100 once, reinstate +100 once; corrections add no points | Backend + browser |
| Certificate / PDF / public verification | Owner downloads issued PDF; public verification is explicit opt-in and reveals no email or scores | Model + backend + browser + PDF review |
| Other account / anonymous user | No access to another learner's private records or PDF | Rules + browser |
| Admin PDF preview | Global facilitator with reason can preview valid issued PDF; captain and nonstaff cannot | Backend + browser |
| Profile preference | Saved name survives automatic Google refresh; changing name does not silently change issued certificate | Backend + browser |
| Admin profile/certificate correction | Email/UID/certificate lookup; verified name/title/calendar date update creates private replacement and revokes old certificate | Backend + browser |
| Archived workshop | History/PDF survive Live session deletion; archived completion can be corrected, revoked or reinstated | Backend + browser + Live regression |
| Student requests | Owner submits request and sees response; admin receives live requests and can resolve corrections, decline or reopen | Backend + browser |
| Request pagination | More than 50 requests accessible without duplicates across server pages | Backend |
| Permission revoked / invalid input | Role rechecked inside admin transactions; malformed IDs/dates/reasons and forged writes rejected | Backend + rules |
| Portal-only removal | Matching owner request, review reason and exact typed UID required; removes history, versions, ledger and certificates | Backend + browser |
| Removal scope | Shared Auth UID and Live registrations unchanged; minimal request/marker retained | Backend + browser |
| Interrupted removal | Remains processing; retry resumes rather than claiming completed deletion | Injected backend failure |
| Sign in after removal | Shows removed state; cannot recreate old history/profile by ordinary sign-in or backfill | Backend + browser |
| Explicit reactivation | New profile allowed for future workshops; old sessions and points stay blocked, including concurrent import | Backend + browser |
| Account switching | Old learner's results and request history clear on sign-out/account switch | Browser |
| Canonical telemetry | Real OTel trace/span IDs and transaction IDs on accepted correlated business events; new admin/privacy events delivered | Browser collector + backend outbox |

## Checks outside emulator simulation

Real Google OAuth popup/consent, MFA and account availability must be checked with the owner's real account on the deployed site; emulator Google credentials do not prove external provider configuration. Verify inspi.in DNS/SSL separately in GoDaddy and Firebase. A new alphabet needs font coverage review before assuming PDF support. Offline PDF copies cannot be recalled. Dynatrace telemetry erasure follows its own retention procedure. Network/provider outages are handled as errors, but this rehearsal is not a production capacity or browser compatibility certification.

## Test entry points

- `npm test`: four pure-model cases.
- `npm run test:integration`: 24 backend/Firestore cases (requires Firebase CLI and Java 21).
- `CI=true npm run test:rehearsal`: 17 serial browser journeys with real emulated Functions, Auth and Firestore.
- Shared Live `npm run test:rules`: 39 rules/action/audit cases including erasure-aware archival.
- Shared Live `CI=true npm run test:rehearsal`: baseline workshop journeys for regression.

See [TESTING.md](TESTING.md) for release results, and [RUNBOOK.md](RUNBOOK.md) for operator instructions.
