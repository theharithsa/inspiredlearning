# v2.0.0 source verification — 28 October 2026

PR: https://github.com/theharithsa/inspiredlearning/pull/56 ; epic #34 remains open for production acceptance. Runtime source base is 4bb4849ced7482790f46d29f9596d5014e61a8b6, followed by compatible dependency patches, MCP version-metadata alignment and attempt-specific CI source reads. The final PR head must pass its own checks before merge. This document does not certify deployment.

## Environment and source identity

Local source-only copy under /private/tmp avoided external-volume I/O and used synthetic demo-chaicart Auth/Firestore/Functions plus localhost collectors. Functions/web overrides were 5003/5184; unrelated services on 5001/5182/8080 were preserved. Java 21 and Node 24 were used. Runtime/test/config files were byte-compared with the workspace: [source manifest](evidence/v2.0.0/source-manifest.json), SHA-256 **f3257ea2f1f77d7a4d7855497b10c4bf4d6f0a1293ba193e76cd7d7a19dea011** (142 sorted path/digest entries, compact JSON UTF-8). CI validates the committed head independently on Node 24 plus Functions Node 22.

## Observed checks

| Check | Result |
| --- | --- |
| npm run lint | Passed, no warnings |
| npm test | 29 passed, including server recency/revocation policy and real three-signal CI export/structural failure reporting |
| npm run build | Both dist and dist-admin passed; source-only/unconfigured manifests explicitly nonrelease |
| npm run test:integration | 43 passed, including actual HTTP bootstrap/freshness, privacy and independently decoded local OTLP |
| npm run test:api-auth | 1 full real Auth/Firestore transport test passed |
| npm run test:swagger | 1 passed |
| npm --prefix mcp test | 3 passed, including real SDK stdio, repeated after patched dependencies/MCP 1.0.1 |
| npm run test:rehearsal | 36 passed in final complete Chromium run; zero failed/skipped/flaky/missing |
| ChaiCart unchanged-source rules/workflow/audit | 39 passed, including 120 atomic joins and erasure/archive guards |
| ChaiCart backend units | 18 passed |
| Production dependency audit | Root app, Functions, patched MCP: zero vulnerabilities |
| All root dependencies | Five moderate development-only Firebase CLI chain entries remain, tracked by #57; no forced downgrade |
| Credential-pattern scan | No credential patterns in changed source; GitGuardian also checked the PR |
| Repository skills | Admin/auth and Material 3 frontmatter validation passed; relative references and module ownership reviewed |
| GitHub source attempt API | Real attempt-specific endpoint and requested API version returned matching repository/run/attempt/workflow fields |

The complete browser run covers published-result/certificate/privacy/token/delivery workflows, learner/captain denial, separate admin startup without learner data writes, refresh/tab-close/session independence, current-role/disabled-account denial, cancelled confirmations/account switches, keyboard focus, both palettes, 320–1600px, long/non-Latin names, 200% text, short windows and reduced motion. Token contrast pairs meet 4.5:1 in both themes; this is not a complete WCAG certification.

Local browser testing preceded dependency-only lockfile patches; a fresh npm ci then passed lint/unit/build/Swagger/MCP on the patched locks. Final exact-head GitHub checks are the merge gate for the complete combination. Structured reports upload outside Playwright's cleared output folder with 14-day CI retention. The independent privileged observer never consumes PR artifacts.

## Reviewed synthetic design evidence

All included captures were visually inspected and copied without raster editing. Metadata lists viewport, version, timestamp, browser and SHA-256: [captures.json](evidence/v2.0.0/captures.json). Only synthetic users/records are present. Earlier full-page stitching duplicates and transitional-theme captures were rejected; final evidence uses real viewports. Operational tables retain their own keyboard-focusable horizontal scroll.

- [Learner, light desktop](evidence/v2.0.0/learner-light.png)
- [Learner, dark mobile](evidence/v2.0.0/learner-dark-mobile.png)
- [Administrator overview](evidence/v2.0.0/admin-overview-light.png)
- [Administrator certificate register, mobile](evidence/v2.0.0/admin-certificates-mobile.png)
- [Public entry, mobile](evidence/v2.0.0/public-mobile.png)

Review fixes included theme-change intermediate contrast, dialog Shift+Tab/focus return and route/account cancellation, current callable revocation checks, same-UID new-session bootstrap reuse, long-name overflow, first-sign-in credit-read ordering and misleading certificate-count/legacy-points copy. Existing profile edits still avoid credit refetches.

## Explicitly unverified / not performed

No Hosting/Functions deployment, new admin Hosting site/binding, DNS/Auth-domain changes, production mutations, membership migration, capacity/retention change, paid infrastructure or CI secret binding. The delivery observer remains disabled until secure configuration. BizEvent HTTP 202 and SDK flush are not tenant visibility or per-record OTLP acceptance. Real Google popup/reauthentication, physical Safari/session restore, live CSP/header compatibility, SLO/alert installation and native RUM-to-trace navigation remain separate release checks. Existing Firebase SDK chunks remain approximately 539 kB minified and retain Vite's warning; public privacy/verification routes avoid loading them.

Follow docs/V2-RELEASE-PLAN.md for backend-first rollout, verified admin origin before learner handoff, independent rollback and exact live artifact/tenant proof. Keep #34, #17 and #57 open until their own acceptance criteria are met.
