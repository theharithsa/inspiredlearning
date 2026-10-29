# InspiredLearning v2.0.0 release plan

Implementation is tracked by #34. **Production execution completed for app 2.1.1 on 29 October 2026; see [RELEASE-2.1.1.md](RELEASE-2.1.1.md) for actual evidence and remaining telemetry limitations.** The instructions below retain the original pre-deployment plan. This file prepares a reviewable release; it is not evidence of deployment or authorization to provision a Hosting site, alter DNS/auth domains, bind CI credentials or migrate learner data.

## Source scope

App/functions 2.0.0, compatible REST contract 1.5.0. React/Vite/Firebase retained. M3 light/dark/system tokens, adaptive shared controls, Material confirmations and complete existing learner/staff workflows; separate administrator HTML/build/auth/bootstrap/navigation with dedicated task pages. Google sign-in, current global role and existing 300-second recency policy protect sensitive operations. Owner-approved current-tab/session admin persistence; no mandatory MFA. Shared UIDs, captain mapping, published scores/credits, signed certificate history, privacy guards and outbox retention are preserved.

Build outputs: dist/ (learner/public), dist-admin/ (administrator), each with public version.json. Only clean Git builds with production configuration can be verified as release artifacts. CI demo builds and source-only/dirty rehearsal copies are explicitly not production artifacts. API version and MCP version are independent; the GET-only MCP adapter gains no admin authority.

#17 is designed with the broader v2 model in V2-MEMBERSHIP-INDEX-DESIGN.md. Paged/resumable legacy discovery remains until a separately reviewed atomic write-path/backfill/completeness proof. No index backfill is hidden inside a UI release.

## Pre-deployment

1. Inspect current status/remotes/handover, final PR and exact-head checks. Preserve unrelated Live/workshop-reference edits. Rebuild from the tested merged revision with existing secure production public config; never use demo CI artifacts. Verify version manifests, source revision, surface and configuration. Review package/lockfile/version consistency and rollback source.
2. Run lint/unit/build, complete integration/Auth/Swagger/MCP/browser suites, relevant unchanged Live regression, production dependency audit and safe secret scan. Review both themes, keyboard/confirmation behavior, compact/medium/expanded/short/zoom and long/missing strings. Record synthetic screenshot metadata/hash; no participant exports. Physical Safari/live OAuth remain explicit manual checks.
3. Confirm Firebase project chaicloud-workshop, existing learner Hosting inspiredlearning-vh and Functions codebase inspiredlearning/asia-south1. A read-only site inventory on 28 October found no dedicated admin Hosting site. firebase.admin.json defines logical target inspiredlearning-admin, public dist-admin, same-origin API rewrite; at that planning point no mapping existed. The actual admin site inspiredlearning-admin-vh was subsequently provisioned and bound in .firebaserc by #61.
4. After scoped resource approval, choose/check an actual available site ID, create/bind it using the secure existing provider workflow, and map admin.inspi.in. Verify DNS/TLS and Firebase Auth authorized domains. Keep learner domain and Live sites untouched. No memory/instance/concurrency increases or paid security infrastructure are part of this release.
5. Verify the approved RUM tag supports the admin origin and existing documented email attribution. No duplicate tag, Replay enablement or copied credential. #9 tenant Settings/alert installation and #14 live CSP compatibility remain distinct gates; report-only CSP is not enforced CSP.

## Ordered rollout

- Deploy the compatible InspiredLearning Functions API/policy first, preserving the codebase and other projects/rules/indexes. Existing administrators may need a fresh Google sign-in under the new recent-auth policy; communicate this before the change. Do not mutate certificates/credits to test the deployment.
- Verify API contract, anonymous denial and real authorized admin access. Deploy the separate admin Hosting target with the verified build. Confirm sign-in/session, each task route, reasoned reads/exports and safe denial without production result publication.
- Deploy the learner Hosting update only after the admin origin is usable, so legacy admin handoffs do not strand operators. Preserve existing public certificate links and API compatibility.
- `node scripts/verify-release.mjs` performs read-only artifact/contract/anonymous-denial checks against both origins. Its output deliberately leaves private OAuth/journeys and tenant observability unverified. It is not a replacement for those checks or proof of native RUM navigation.
- Verify headers/assets/cache, actual Google popup/reauthentication/cancellation, refresh/sign-out/account switch, captain isolation, public/owner PDF behavior and privacy requests with approved safe identities. Review CSP reports before enforcement. Never reissue awards merely to produce a green smoke test.
- Check OTLP acceptance/partial rejection separately per signal and stable-ID canonical delivery, then exact tenant version/revision/IDs. Check CI observer and runtime services separately; native RUM-to-trace navigation needs its own proof.

## Rollback and reporting

Rollback learner/admin Hosting independently with provider-supported release rollback to their known prior artifacts. An initial admin-site failure leaves the prior learner frontend until the new admin is verified. Do not undo learner history, privacy markers, replay tombstones, outbox IDs or receipts. Review in-progress privacy operations before Functions rollback; older source must not drop their recovery behavior. Retain shared Auth/Live/rules/indexes and DNS reservation.

Record successful, failed-before-deploy, partial, deployed-unverified and fully verified states separately with actual revision/target/time. A GitHub release is not a Firebase deployment. Deployment success is not tenant-searchability proof; repair reporting without repeating a successful deployment. No release tag or native CUSTOM_DEPLOYMENT event is generated by source tests.
