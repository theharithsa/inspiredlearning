# Certificate delivery audit — GMU0810

Read-only investigation, 20 October 2026. No certificates, awards, credits or deployment resources were changed.

## Verified against production

The active `asia-south1/learningCertificate` source was downloaded privately and compared with local `functions/pdf.js`, `model.js` and `finalize.js`; all three match. The function's last update is 12 October 2026 at 01:27:05 UTC. Do not confuse newer documentation/report changes with a deployed certificate generator.

- There are 119 completed learner workshop snapshots with 119 linked certificates.
- All 119 linked certificates are issued. 20 contain existing team/region recognitions, matching their published workshop snapshots.
- Current stored award definitions: Best Architecture, Most Creative Pitch, Richest Startup and the four regional champions. Each recognition is present for all five members of the corresponding winning team.
- Best CEO, Best CTO and Best COO are absent from the stored award definitions and current certificate awards. The facilitator's previously confirmed recipients map to Keerthana N S (Chennai-1d CEO), Manasa Nadiger (Chennai-1c CTO) and SM POOJA (Chennai-1d COO).
- `pdf.js` creates a participation certificate and appends up to three award titles as recognition text. There is no separate award-certificate issuance flow in the audited generator.
- The deployed PDF code and its source bundle contain no signature asset or signature embedding. Re-downloading cannot add a signature. The audit's known local asset search found no signature image.
- There are 154 issued certificate documents for this workshop: 119 currently linked and 35 extra issued documents. The learner certificate page queries every document belonging to the learner, so older still-issued documents may be shown alongside current results. Their intended history must be reviewed before revoking anything.

## Latent publication bug

`model.js` filters awards only by award.uid, although stored definitions also contain scope and teamId. Existing snapshots have team-expanded recognitions, but the deployed publication function would not reproduce those for all teammates. A blind mass-finalize could remove legitimate team recognition or replace certificates unnecessarily. Do not use republishing as a signature fix.

## Repair direction

1. Obtain the approved signature asset and intended certificate presentation; never synthesize a signature.
2. Define scoped recipient resolution: individual UID for role awards, explicit winning team membership for team/region winner awards. Preserve existing recognition and avoid changes to score/account totals.
3. Define whether recognition appears on the participation PDF, separate award PDFs, or both. If separate certificates are required, add an explicit certificate kind/award identity and retain verification/revocation behavior.
4. Add the confirmed role awards through an authorized, reasoned and idempotent publication/correction workflow; do not substitute report text for an automatic database write.
5. Review historical issued duplicates and prepare a per-record correction plan. Preserve public verification semantics, visibility preferences, privacy blocks and an audit trail.
6. Preview signed participation and individual/team award certificates, then test owner/admin download, all winning team members, repeat operations, revoked versions and privacy erasure before a scoped release.

Signature embedding and template changes do not require recalculating scores, migrating accounts or changing shared Auth/Firestore rules. Existing downloaded PDF files cannot be updated retroactively; students must download the corrected version after a release.

## Implemented and deployed follow-up

On 20 October, the certificate register, typed participation/award PDFs, scoped recipient resolution, current-result verification guards and idempotent recognition reconciliation were deployed to InspiredLearning Hosting and the four affected HTTP/callable functions (learningApi, learningAction, learningCertificate, learningVerify). Shared Live data, Authentication, rules/indexes and the other codebases were not deployed.

Verification: 11 unit checks, 33 Firestore integration checks, Swagger browser validation, administrator desktop/mobile browser flow, TypeScript production build and lint passed (one pre-existing main.tsx refresh warning). The browser check downloaded an authenticated preview and filtered award certificates. The lifecycle tests cover publication, name correction, revocation/restoration, zero credit changes during repair, retries, privacy and ordinary-user/token denial. Both public domains expose the register/reconcile OpenAPI routes; anonymous requests are rejected.

**Production record repair is pending:** the signed-in Firebase CLI infrastructure identity is not a facilitator in the app. The attempted repair preflight stopped before any production write; no authority was fabricated and no app role was granted. A Google-authenticated global facilitator must run the repair. The admin register includes a workshop refresh and an optional explicit individual-award entry, with a review reason.

**Signature remains pending:** latest GitHub main and local assets contain only certificate fonts, with no approved signature image. Signature rendering support exists, and the admin register explicitly reports missing signature configuration. Nothing in this release claims signed PDFs. Locate the actual approved image before completing that part; files already downloaded must be downloaded again after the asset is deployed.


## Signature asset found after the initial investigation

The user-provided `assets/sign.png` appeared in the working tree during implementation. It was copied unchanged into `functions/assets/signature.png`, embedded in both participation and award PDFs, and visually verified on rendered previews. A regression check asserts signature configuration and both signature/QR image embedding. A follow-up deployment updates learningCertificate and learningApi (the latter reports signature configuration). This resolves the earlier asset blocker; the production data repair still requires an authorized facilitator account.
