# Verification

Automated coverage uses a disposable `demo-chaicart` project; no real attendees or production scores are changed.

- Four pure model cases: result scope, points transitions, verification privacy, identifier bounds.
- 24 backend/Firestore cases: idempotent enrollment, regional authorization, attendance/closed-session prerequisites, concurrent publication, result correction, owner isolation/forged writes, PDF with Latin/Devanagari name, revocation, persistent archival, archived correction/revocation, administrator controls, scoped removal/recovery/reactivation, pagination and request decisions.
- 17 browser rehearsal journeys: mobile onboarding/Discord, Google empty state/nonstaff denial, registration, attendance/publication/idempotency, results/PDF/verification, other-account and anonymous denial, captain boundary, profile/request review, revocation and archived history.

The browser auth helper is emulator-only. It is not imported by the production application. Real Google OAuth and GoDaddy domain ownership require external account configuration; passing emulator tests does not prove those providers' live account state. Production checks separately verify deployed Hosting, function health and telemetry delivery.

PDF visual review checks one-page layout, QR, certificate identity and version. Fonts include Noto Sans and Noto Sans Devanagari (OFL license); do not assume coverage for every writing system.


The expanded matrix is in [USE-CASE-VALIDATION.md](USE-CASE-VALIDATION.md). Shared Live rules/action/audit regression: 39 cases passed, including completed erasure as an archival alternative and rejecting in-progress erasure. The browser suite includes live request arrival, mobile corrected PDFs, role-gated navigation, email lookup, admin preview, archived reinstatement, request decisions, account switching, typed removal and future-only reactivation.

18 Live backend unit cases also passed. Total distinct automated cases across the two applications: 119. Live browser regression was repeated successfully after the dependency patches. Portal runtime and initial shared archival source passed GitHub CI.
