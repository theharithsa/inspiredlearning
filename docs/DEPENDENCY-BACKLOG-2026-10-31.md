# Dependency backlog — #82

Baseline: clean main `6b8759bef5980470692b000d236f05089ccb9110`, 18 open Dependabot PRs inspected on 31 October 2026. This candidate is app 2.2.2 / Functions 2.0.2 / MCP 1.0.2; API 1.5.0 is unchanged. Source maintenance does not authorize deployment. Production remains app 2.2.0 / Functions 2.0.1 until separately approved.

## Original PR disposition

The replacement consolidates these changes against current main; original green checks on older revisions are not reused as current acceptance. Close originals as superseded only after the replacement is reviewed, checked and merged.

| PR | Resolution in replacement |
| --- | --- |
| #36 | MCP Zod 4.6.7 |
| #37 | MCP body-parser 2.4.0 lockfile resolution |
| #38 | Root fast-uri 3.1.9 lockfile resolution |
| #40 | checkout 7.0.1, verified commit `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| #41 | setup-node 7.1.0, verified commit `949feb2413d6458794dcd2491c4babbbce0c15c1` |
| #42 | upload-artifact 7.0.2, verified commit `cf430e030ddbb5b0abf93d22962f4752f3646cd9` |
| #43 | Functions OTLP trace exporter 0.300.0 with matching exporters/SDK |
| #44 | Remove unused root resources/API/web tracing dependencies; browser uses native RUM and has no OTel exporter |
| #45 | MCP SDK 1.32.2 |
| #46 | Functions resources 3.0.0 with the matching SDK |
| #47 | setup-java 6.1.0, verified commit `b843ebf9b913146b38da2eaa7aeddf76074ae1ad` |
| #48 | Node SDK 0.300.0 with API 1.10 and stable SDK 3.0 |
| #49 | Vite 8.3.5 |
| #50 | Swagger UI 5.34.1 (compatible newer patch than proposed 5.34.0) |
| #51 | SDK logs 3.0.0; remove obsolete api-logs and import logs/SeverityNumber from API 1.10 |
| #52 | Playwright 1.64.1 |
| #53 | React **and React DOM** 19.3.1 |
| #54 | TypeScript 7.0.2, including native compiler platform packages in the lockfile |

## Compatibility and trust

The [OTel 3 migration guide](https://github.com/open-telemetry/opentelemetry-js/blob/main/doc/3.x/migration-guide.md) requires API/SDK alignment, moves logs into the API and changes module entrypoints. Backend SDK construction uses CommonJS entrypoints consistently with Firebase Admin/Firestore: otherwise the Firestore client can retain an undelegated early CommonJS tracer proxy while ESM SDK startup registers another proxy. The existing decoded-wire regression constructs the client before the first measured request and must still observe native transaction children, Auth/PDF/outbound children and log sinks. It is not weakened or skipped. The trusted CI reporter already uses CommonJS resolution from the Functions package and moves its logs import to the main API as well. Minimum SDK Node version is 22.15; CI uses current Node 22/24. Verify the actual production runtime before a future Functions rollout.

The transitive HTTP refresh exposed absolute-path Swagger serving under a hidden checkout parent. Serve only the two existing allowlisted package assets relative to their fixed package root. Preserve default dotfile denial inside that root, existing initializer/CSP/no-store behavior and API authorization. No arbitrary file server or request-controlled root is added.

All four Action tags were resolved through their upstream repositories and their signed commit identities verified. They use Node 24 internally; application test runtimes remain Node 24 and a separate Node 22 backend job. Preserve read-only Checks, default-branch-only trusted observer execution, `persist-credentials:false`, Production environment `deployment:false`, and absence of PR secrets/artifact execution. [checkout release](https://github.com/actions/checkout/releases/tag/v7.0.1), [setup-node release](https://github.com/actions/setup-node/releases/tag/v7.1.0), [upload-artifact release](https://github.com/actions/upload-artifact/releases/tag/v7.0.2), [setup-java release](https://github.com/actions/setup-java/releases/tag/v6.1.0).

Dependabot groups React/React DOM and Functions OpenTelemetry updates to avoid new isolated incompatible PRs. The Firebase CLI remains pinned at 15.34.2; its older internal OTel tree and scoped Pub/Sub core override are separate from the application's SDK. Do not globally force SDK 3 into CLI internals.

## Security and validation boundaries

Fresh baseline audit: **13 moderate** root dependency nodes. After the non-forced audit resolution: **9 moderate development-only** Firebase CLI nodes; root `--omit=dev`, Functions and MCP production audits are **zero**. The current glob/minimatch advisories are tracked in [#83](https://github.com/theharithsa/inspiredlearning/issues/83). The audit resolution selects unaffected versions within existing ranges: CLI Pub/Sub 5.2.0 (previously 5.3.1), affected google-gax 5.0.4 (previously 5.0.8) and gcp-metadata 8.1.2 (previously 8.1.4). These are explicit compatible downgrades, not new upstream patches; preserve Pub/Sub emulator/propagation and multipart tests. No forced breaking CLI downgrade or blanket cross-major override is used. Historical zero-audit snapshots do not describe this newer advisory database.

Validation includes clean lockfile installs, lint, unit cases, TypeScript/both builds, real MCP stdio parity, Pub/Sub propagation/multipart compatibility, emulator Auth/Firestore/decoded OTLP and browser journeys. Initial integration failure exposed the cold-start trace proxy and hidden-parent asset regressions above. Final local results and exact-head CI/review are recorded in the replacement PR; do not infer green execution from this plan. Local emulator overrides use demo-chaicart on isolated ports and are restored before committing. No production fixture, token, certificate, credit or learner mutation is used.

No Hosting/Functions rollout, retention/attribution/scopes, tenant configuration, paid infrastructure, Auth/DNS change, alerts (#9), membership migration (#17) or native RUM linkage claim follows from this source change. #34/#63/#77/#79 retain their distinct runtime acceptance work. Future rollout must pin its approved revision; the earlier 2.2.1 source is not silently replaced by this candidate.

Local final validation: lint, all 56 unit cases, both builds, 49 Firestore/integration cases (including decoded OTLP), one real Auth test, eight focused token/layout browser cases, three MCP stdio/API cases, two tooling compatibility cases and Swagger rendering passed. Clean installs succeeded on npm 10 and the host's default npm 11 after regenerating complete native TypeScript platform entries. A separate task cache avoided pre-existing shared-cache permission failures; no cache ownership or unrelated processes were altered. Full exact-head GitHub CI, the Node 22 job, new Actions execution and review remain the merge gate; their links/results belong in the PR ledger.
