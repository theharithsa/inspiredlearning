# Verification

Automated coverage uses a disposable `demo-chaicart` project; no real attendees or production scores are changed.

- Four pure model cases: result scope, points transitions, verification privacy, identifier bounds.
- Ten backend/Firestore cases: idempotent enrollment, regional authorization, attendance/closed-session prerequisites, concurrent publication, result correction, owner isolation/forged writes, PDF with Latin/Devanagari name, revocation, persistent archival, archived correction/revocation.
- Browser rehearsal: mobile onboarding/Discord, Google empty state/nonstaff denial, registration, attendance/publication/idempotency, results/PDF/verification, other-account and anonymous denial, captain boundary, profile/request review, revocation and archived history.

The browser auth helper is emulator-only. It is not imported by the production application. Real Google OAuth and GoDaddy domain ownership require external account configuration; passing emulator tests does not prove those providers' live account state. Production checks separately verify deployed Hosting, function health and telemetry delivery.

PDF visual review checks one-page layout, QR, certificate identity and version. Fonts include Noto Sans and Noto Sans Devanagari (OFL license); do not assume coverage for every writing system.
