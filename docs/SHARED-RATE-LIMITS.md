# Shared request limits — #15

The implementation uses transactions in the existing Firestore database. `SHARED_RATE_LIMITS=true` enables shared quotas for backend-verified UID/token keys only; public/pre-auth IP buckets keep the existing best-effort local throttle. The default remains the existing local limiter. **Do not enable this flag in production before usage and ingress identity review.** No capacity limit, paid edge service or TTL policy is provisioned by the source change.

The existing keys/limits and 60-second windows are retained, including the legacy shared UID bucket for actions/PDFs. Keys are SHA-256 namespaced document IDs; rows hold only start/count/expiry, with no raw UID, IP, token or learner payload. These hashes are pseudonymous, not anonymous. All quota decisions are transactional; per-worker queues only reduce contention and never grant local quota. Requests fail closed on database failures/malformed state, and a limiter rejection includes a bounded retry delay. REST adds Retry-After only for limiter rejections, not unrelated capacity errors. Async limiter failures are awaited and map to the existing error envelope.

Expired rows are rechecked in a bounded cleanup transaction in the existing recovery job only when the flag is on. This avoids deleting a concurrently refreshed bucket. A two-minute expiry timestamp is not a claim that Firestore TTL is enabled. Cleanup has its own read/delete usage and a bounded 100-row pass; if creation exceeds cleanup, capacity/backlog must be reviewed before rollout.

## Measured usage before rollout

Reproduce with `FIRESTORE_EMULATOR_HOST=127.0.0.1:8185 RATE_MEASUREMENT_OUTPUT=/private/tmp/rate-measurement.json node scripts/measure-rate-limits.mjs`. This refuses non-loopback targets and uses only demo-chaicart synthetic counters, then removes its own fixtures. Results: [emulator operation/latency report](evidence/rate-counter-emulator.json).

- 20 sequential callable requests: 20 transaction document reads, 20 confirmed writes, 20 attempts.
- 20 REST requests with shared actor/token checks: 40 reads, 40 confirmed writes, 40 attempts. The unverified pre-auth IP throttle remains local and adds no counter write.
- 16 concurrent calls through two independent limiter instances: 18 reads/attempts, 16 confirmed writes. All 16 succeeded below quota. A separate concurrent quota test admitted exactly five of sixteen against a limit of five, with the rest rejected.
- Warm sequential emulator median was 5ms (callable) / 8ms (REST). Cold first-call p95 was approximately 3.1s and the two-instance burst p95 approximately 3.4s. These include emulator/SDK startup and contention and **are not production latency or billing evidence**. The extra retry read is visible rather than hidden. Do not assume production throughput from these small cohorts.

No currency estimate is inferred. Reads, failed transaction attempts, cleanup, retained counters and exports can add actual billable usage; the local observations are not a cloud billing receipt. Database/clock/observer-failure and cleanup-race tests are in test/rate-limit.test.mjs and run with the Firestore integration suite.

## Remaining rollout gates

Authenticated actor/token keys are derived from verified backend identity. Public verification and the pre-auth REST bucket still inherit req.ip from the deployed proxy chain. A forwarded header alone is not proof of an end-user identity. Preserve public certificate access, inspect the actual Hosting/direct-function chain, test spoofed headers without logging raw IPs, and establish a trusted key before applying a distributed public-IP quota. The implementation explicitly excludes those unverified public keys even when the authenticated rollout flag is on. Otherwise a proxy-wide bucket can lock out a classroom, or spoofed keys can create unbounded counter writes. This gate is why the global flag remains off.

Reference: https://docs.cloud.google.com/functions/docs/reference/headers documents the forwarding chain but does not attest arbitrary leftmost forwarded values for this application. Keep #15 open through measured production activation/verification; merging a disabled implementation does not resolve the deployed limiter issue.
