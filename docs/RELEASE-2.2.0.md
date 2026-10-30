# InspiredLearning 2.2.0 production release — 30 October 2026

Deployed revision **6b18944592632dcca5a0f0876b41ba09de16d478** (PR #75, including the previously source-only #73 account correction). Owner approval: “Deploy the site please.” App 2.2.0 / unchanged Functions 2.0.1 / API 1.5.0 / MCP 1.0.1. [Release facts and image provenance](evidence/v2.2.0/release.json).

## Build and deployment

Built both surfaces from the clean merged revision with existing secure production public configuration, emulator mode disabled and the approved async RUM injection. Both manifests match the revision, version, production environment, API and intended surface. Retained SHA-256 checksums for all 120 artifact files; the build remained identical through deployment. Source PR CI [40946417411](https://github.com/theharithsa/inspiredlearning/actions/runs/40946417411) passed 60 browser, 40 unit and existing integration/Auth/Swagger/MCP/security/Hosting/tooling gates; merged-source Checks [40947933801](https://github.com/theharithsa/inspiredlearning/actions/runs/40947933801) also passed. No demo artifacts were deployed.

Hosting only: administrator site inspiredlearning-admin-vh version **d858b41a07625334**, released **11:30:34 IST** (06:00:34.178Z); then learner site inspiredlearning-vh version **7a60990658b3e00b**, released **11:31:06 IST** (06:01:06.263Z). Both custom domains serve the exact new manifests. No Functions, shared rule/index, Auth-domain, DNS, capacity, retention, identity-policy or learner-migration deployment was performed. The approved authenticated shared limits remain part of the existing backend release; preserve SHARED_RATE_LIMITS=true in future authorized Functions deployments.

Both ChaiCart Hosting versions match the predeployment snapshot: chaicart-gmu0810 62e49b5bcc174654 and chaicloud-workshop 3e1b149e54d87fa3. Backend and Hosting configuration sources are unchanged from deployed 2.1.3. No function deployment was included.

## Live verification

Both custom origins passed exact-manifest/API 1.5.0 checks, anonymous admin denial (401), enforced CSP, no-cache SPA HTML (root/index/rewritten privacy path), no-store API/Swagger initializer, immutable hashed JavaScript and async RUM checks. Public verification returned the private-safe response for the sentinel and valid responses for three already-opted-in certificates without email/scores. Both illustration assets returned image/webp and byte-identical SHA-256 values on both origins.

The actual learner site restored the existing signed-in account and displayed the new learner build. The administrator public entry and Settings rendered correctly; all 14 fonts/six palettes were present. Lato loaded under the production CSP and Roboto was restored. Captured browser console windows (last 30 warnings/errors per context) contained no CSP failures. The signed-out illustrated homepage was reviewed on the production Firebase Hosting alias, which serves the same learner release; this avoided signing the existing learner session out. Screenshot evidence contains public pages only, no real learner records or private account details.

Fresh Google popup sign-in, administrator private tools/PDF export, current-release tab-close/session cases and physical-device motion feel were **not** retested live in this frontend-only rollout. Their applicable emulator coverage passed; prior production evidence remains historical. No certificate/credit/publication/privacy-action mutation was used as a smoke test.

## Preservation and observability

Before/after projections match: **119** issued participation certificates, **38** issued awards, **39** revoked/superseded versions (196 total) and all **119** tracked GMU0810 credit/status records. Certificate projection SHA-256: 30ddc28eb8e39403b658ce5500a1d3665148560b1ce6981389081672fd364b0a; workshop projection: 42cae599333335f8ad8b47c3850fba857c7df54052339f7d461577c2d2773e22. These are bounded field projections, not a whole-database comparison.

Native RUM BizEvents with app.version **2.2.0** are searchable in Dynatrace for **both learner and admin** surfaces with **client-observed** authority. The bounded verification query projected aggregate version/surface/authority only. No browser click was reported as a canonical server-confirmed outcome. This rollout did not collect new per-signal transport receipts, retest backend instrumentation or establish native RUM-to-backend navigation. The independent CI observer is still unbound/disabled; #9 alerts are deferred and #17 migration held. #34/#63 retain their broader acceptance scope.

## Rollback

Retain the previous learner Hosting version **74c1fc945f26b967** and administrator version **09fb3f38660686a8** from 2.1.3. Provider-supported rollback of either Hosting release requires no backend/data rollback. Do not rebuild old source as an equivalent immutable rollback artifact, revert learner history/privacy markers/outbox IDs or disable approved shared authenticated limits. No production rollback was rehearsed.

[Updated Discord announcement draft](announcements/2.2.0-discord.md) — not posted.
