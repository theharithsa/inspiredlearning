# InspiredLearning observability

## Browser RUM

`index.html` loads the approved Dynatrace JavaScript tag ending `99d1da35524716f0_complete.js`. Google sign-in identifies the user by email with `dtrum.identifyUser`; signed-out visits use a persistent pseudonymous device ID. No ingestion token is included in the browser. Native RUM business events use `dynatrace.sendBizEvent` and describe **client-observed** interactions; they do not certify backend success.

Page views, buttons/links, profile updates, community navigation, certificate download/visibility and staff operations are recorded without copying form text or DOM contents. Backend mutations send an actual browser-generated OTel trace context and transaction ID. The backend continues that trace and validates account identity independently.

## Backend logs, metrics and traces

Service `inspiredlearning-api`, namespace `inspiredlearning`, production resource environment. Node OTel SDK exports OTLP/HTTP protobuf (gzip) to:

- `https://indiacs.live.dynatrace.com/api/v2/otlp/v1/traces`
- `https://indiacs.live.dynatrace.com/api/v2/otlp/v1/metrics`
- `https://indiacs.live.dynatrace.com/api/v2/otlp/v1/logs`

Classic credentials use `Authorization: Api-Token …`; platform credentials use `Bearer …`. Despite its historical name, Firebase Secret Manager `DYNATRACE_PLATFORM_TOKEN` contains the configured ingestion credential. Required classic scopes: `openTelemetryTrace.ingest`, `metrics.ingest`, `logs.ingest`, `bizevents.ingest`. Never copy the secret into frontend configuration or Git.

Each measured operation logs its bounded operation name, outcome and authenticated `user.id`/`user.email`, plus genuine SDK `trace_id`, `span_id`, and `transaction.id`. Failed operations include bounded error type, not private request text. Metrics: operation outcomes counter, duration histogram in seconds, RSS, heap usage and uptime. High-cardinality user/session/certificate identifiers belong in logs/spans/events, never metric dimensions. Exporters are flushed at the end of serverless work.

## Canonical business events

Firestore transactions atomically write durable state and an outbox event. The outbox delivers CloudEvents to `https://indiacs.live.dynatrace.com/api/v2/bizevents/ingest`. A lease prevents competing retries, retries retain event IDs, and HTTP acceptance marks delivery. Delivery is at least once; consumers deduplicate by event ID.

Canonical events include enrollment, attendance review, completion publication/correction, learning points award/reversal, certificate issuance/revocation/visibility and account-request review. Every canonical event has `transaction.id`, `trace_id`, `span_id`, actor identity, learner/session identifiers as appropriate, and server-confirmed authority. Browser events are a separate client-observed source and must not be added to canonical award totals.

Signed-out public verification is measured without learner email or UID disclosure. Verification is opt-in and reveals only certificate name, title, date, status and version. Public visibility never grants a PDF download. PDF download requires the certificate owner and valid issued status.

## Rehearsal isolation

`demo-chaicart` emulators use a localhost telemetry collector only. Production functions never select that collector unless the Functions Emulator flag is present. Dummy secret placeholders are temporary and ignored. Browser rehearsals abort external RUM requests. Do not use rehearsal fixtures against the production Firebase project.

## Investigating a flow

Start with `transaction.id` from an operation log or business event; join spans through `trace_id`. Distinguish the mutation trace from subsequent outbox delivery/retry traces. Investigate per-learner batch failures rather than assuming the batch succeeded because its HTTP request returned. Inspect `learningTelemetry` for pending delivery. Verify frontend RUM agent configuration is enabled before treating absent browser business events as backend failures.
