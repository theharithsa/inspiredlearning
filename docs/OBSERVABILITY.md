# InspiredLearning observability

## Browser RUM

The Vite production build injects the approved Dynatrace JavaScript tag ending `99d1da35524716f0_complete.js`. Google sign-in identifies the user by email with `dtrum.identifyUser`; signed-out visits use a persistent pseudonymous device ID. No ingestion token is included in the browser. Native RUM business events use `dynatrace.sendBizEvent` and describe **client-observed** interactions; they do not certify backend success.

Page views, buttons/links, profile updates, community navigation, certificate download/visibility and staff operations are recorded without copying form text or DOM contents. Browser interactions use RUM without a per-click backend relay. Mutations send a transaction ID; the backend continues only actual incoming HTTP W3C context. Browser OTel spans without an exporter are no longer created or sent as remote parents. Native RUM-to-trace navigation still needs independent verification.

## Backend logs, metrics and traces

Service `inspiredlearning-api`, namespace `inspiredlearning`, production resource environment. Node OTel SDK exports OTLP/HTTP protobuf (gzip) to:

- `https://indiacs.live.dynatrace.com/api/v2/otlp/v1/traces`
- `https://indiacs.live.dynatrace.com/api/v2/otlp/v1/metrics`
- `https://indiacs.live.dynatrace.com/api/v2/otlp/v1/logs`

The tenant base URL defaults to `https://indiacs.live.dynatrace.com` and can be overridden per Firebase project with `DYNATRACE_ENDPOINT` in `functions/.env` (see `functions/.env.example`). The same setting drives business-event ingest.

Classic credentials use `Authorization: Api-Token …`; platform credentials use `Bearer …`. Despite its historical name, Firebase Secret Manager `DYNATRACE_PLATFORM_TOKEN` contains the configured ingestion credential. Required classic scopes: `openTelemetryTrace.ingest`, `metrics.ingest`, `logs.ingest`, `bizevents.ingest`. Never copy the secret into frontend configuration or Git.

Resource attributes include `service.version` (from `functions/package.json`), `cloud.provider`, `cloud.platform`, `cloud.region`, and, when Cloud Run provides them, `faas.name`, `faas.version` (revision) and `cloud.account.id`. Callable and HTTP entry spans use span kind `SERVER`; Firestore triggers, outbox delivery and erasure recovery use `CONSUMER`, so Dynatrace treats them as service entry points. API spans carry `http.request.method`, a templated `http.route`, `url.path` and `request.id`. An incoming `traceparent` is continued whatever its sampled flag.

Outcomes are `success`, `rejected` (expected caller errors such as `invalid-argument`, `permission-denied`, `not-found`, `failed-precondition`, `resource-exhausted`; logged at WARN, span status left unset) and `failure` (unexpected faults; logged at ERROR, span status ERROR with recorded exception). Alert on `failure`, not on `rejected`. Rejected REST API authentication is logged at WARN with method, route and request ID.

Each measured operation logs its bounded operation name, outcome and authenticated `user.id`/`user.email`, plus genuine SDK `trace_id`, `span_id`, and `transaction.id`. Failed operations include bounded error type, not private request text. Metrics: operation outcomes counter, duration histogram in seconds, RSS, heap usage and uptime. High-cardinality user/session/certificate identifiers belong in logs/spans/events, never metric dimensions. Serverless exporter waits are bounded to 1.5 seconds and coalesced across overlapping calls. Each exporter has a 1-second network timeout; metric flushes are throttled to at most once per 15 seconds. A timed-out export may finish on available CPU, but delivery is best effort and background CPU is not assumed. Flush failures/timeouts use bounded platform diagnostics. Per-operation success INFO logs are omitted; WARN/ERROR diagnostics default to both platform and OTLP sinks.

## Canonical business events

Firestore transactions atomically write durable state and an outbox event. The outbox delivers CloudEvents to `https://indiacs.live.dynatrace.com/api/v2/bizevents/ingest`. A lease prevents competing retries, retries retain event IDs, and HTTP acceptance marks delivery. Delivery is at least once; consumers deduplicate by event ID. Only HTTP 202 marks delivery. Permanent rejections (400, 404, 413, 415) and events that reach 20 attempts move to `status: "failed"` with `failedAt` and `lastStatus`, and are logged at ERROR; they are not retried automatically. The 5-minute retry job processes erasure recovery first, isolates per-record errors, then bounds the delivery loop by half the job timeout.

Canonical events include enrollment, attendance review, completion publication/correction, learning points award/reversal, certificate issuance/revocation/visibility and account-request review. Every canonical event has `transaction.id`, `trace_id`, `span_id`, actor identity, learner/session identifiers as appropriate, and server-confirmed authority. Browser events are a separate client-observed source and must not be added to canonical award totals.

Signed-out public verification is measured without learner email or UID disclosure. Verification is opt-in and reveals only certificate name, title, date, status and version. Public visibility never grants a PDF download. PDF download requires valid issued status and either the owner, or a global facilitator with a review reason. Administrative preview emits `certificate.admin-preview.prepared` separately from owner download.

## Rehearsal isolation

`demo-chaicart` emulators use a localhost telemetry collector only. Production functions never select that collector unless the Functions Emulator flag is present. Dummy secret placeholders are temporary and ignored. Browser rehearsals abort external RUM requests. Do not use rehearsal fixtures against the production Firebase project.

## Investigating a flow

Start with `transaction.id` from an operation log or business event; join spans through `trace_id`. Distinguish the mutation trace from subsequent outbox delivery/retry traces. Investigate per-learner batch failures rather than assuming the batch succeeded because its HTTP request returned. Inspect `learningTelemetry` for pending delivery. Verify frontend RUM agent configuration is enabled before treating absent browser business events as backend failures.

## Administrator and privacy events

New canonical events: `learner.profile.corrected`, `workshop.completion.reinstated`, `request.reviewed` (with decision and request kind), `account.removal.started`, `account.removal.completed`, `account.reactivated`, and `certificate.admin-preview.prepared`. Reinstatement also emits the normal point award and certificate issuance events. Every event retains transaction/trace/span correlation, including recovery jobs. Review form text, certificate corrections and removal reasons are not copied into telemetry.

Removal deletes portal history/certificates; outbox/audit events and existing Dynatrace data have separate retention. Minimal privacy marker and request status remain. Do not interpret `account.removal.completed` as shared Google account deletion, Live workshop deletion, recalled PDFs or monitoring erasure.


## Maintenance candidate 1.0.1 (not deployment evidence)

Canonical schema version is 1.1. Certificate lifecycle events include certificate kind, ID, learner and workshop dimensions, including award families and superseded versions. Unknown credits are omitted with credits.known=false; they are not -1. workshop.closed is emitted atomically once per close transition. Existing ingested history is unchanged.

The outbox retains stable IDs, retries transient failures and dead-letters permanent 400/404/413/415 responses or the twentieth unsuccessful attempt. Only documented HTTP 202 acceptance marks delivery. Erasure recovery runs before deliveries, isolates per-record failures and is not skipped after an ingestion exception. Failed events require reviewed recovery; automatic TTL/redrive/alerts are not implemented by this release.

The owner explicitly reaffirmed the documented email attribution policy on 27 October 2026 (#12). No tenant retention changes, masking settings or Session Replay enablement are included. Browser Firestore records are now memory-only; legacy cache cleanup is scoped to this Firebase instance before app rendering. Shared Firebase Auth storage is preserved.

See [issue triage](ISSUE-TRIAGE-2026-10-27.md) for implemented and outstanding scope. Local tests, deployed configuration, ingestion acceptance, tenant queries and native RUM linkage must be reported separately.


## Maintenance 1.0.2 source

The log sink is configurable as both/platform/otlp through TELEMETRY_LOG_SINK, with both preserved as the default. Invalid configuration warns once and falls back to both sinks rather than failing a domain operation. Logs before SDK initialization keep the console fallback. The otlp choice suppresses normal console duplication after initialization, but does not guarantee platform fallback for a later exporter failure. Bounded flush failures still emit platform diagnostics. Confirm the actual GCP forwarder before selecting a single sink; duplication in the live tenant has not been asserted.

REST now starts a SERVER span before identity validation and nests INTERNAL domain operations; real Firebase Auth getUser/verifyIdToken calls have argument-free child spans. The installed Firestore SDK already emits native query/document/transaction spans through the global provider; no duplicate Firestore wrapper or broad HTTP auto-instrumentation is added. Manual PDF-render/per-learner/outbound-BizEvent spans avoid exporter recursion and private bodies. Dependency exceptions retain bounded types. Verify native Firestore trace attributes against current SDK upgrades; do not add free-text query values to them.

Public privacy/verification routes do not initialize Firebase/Auth/Firestore or the application identity helper. Existing RUM configuration still controls production capture, with no new Replay setting; the learner app retains documented signed-in email attribution. Dev/emulator HTML omits the production RUM tag. Public REST verification shares the existing opt-in minimal domain policy; no private owner/PDF access follows from a public URL.

The scheduler records pending/failed gauges, exact oldest age only when its bounded sample is complete, a conservative fifteen-minute growth gauge and delivery lag only after the lease owner commits delivered status. Durable bounded count-only history avoids treating repeated scheduler invocations/missing observations as sustained growth. A scheduled metrics export and a local decoded payload do not prove tenant ingestion. Source SLO/alerts/dashboard and read-only evidence are in [configuration](../observability/README.md). Pending/failed/delivered retention is unchanged. Redrive API/UI is audited and Google-global-admin-only; queued is distinct from accepted/delivered and tenant-searchable.


## v2 surface and delivery instrumentation

The separate admin app installs the approved RUM tag and existing documented identity attribution; app.surface distinguishes learner/admin observations. Browser page views, confirmation cancellation and reauthentication observations do not assert committed business outcomes. Existing canonical server audits/outbox events remain authoritative. Rejected recent-auth checks must not emit successful mutation events. Session/account changes clear pending confirmations; administrator bootstrap is an audited read without learner writes.

The independent inspiredlearning-delivery service exports source-validated GitHub lifecycle/run/job/step facts and trusted-main structured test summaries. See CI-OBSERVABILITY.md for trust boundaries, secret activation and evidence limits. Its local three-signal collector test is not tenant visibility or native RUM-to-trace proof. No deployment marker is inferred from build, merge or release publication. #9 tenant SLO/alert installation and #14 live CSP verification remain separate unfinished acceptance work.


## App 2.1.0 appearance

Browser session metadata now includes `app.version` from the frontend package and `app.surface`. The click observer recognizes Material shadow-control hosts through the composed event path and records only existing safe `ui.click` action metadata. It does not collect typed field values, font URLs or preference payloads. Appearance is a local browser preference; it does not emit canonical server business outcomes or write Firestore. Functions remains 2.0.0 and API remains 1.5.0. Local collector acceptance and source tests do not establish production RUM or Dynatrace tenant visibility.

## Asynchronous RUM source candidate (#14)

The candidate tag loads asynchronously. Identity and application observations have a five-second, 32-event in-memory readiness buffer cleared on account change/page hide; blocked agents remain best effort. Browser observations retain client-observed authority and the existing email attribution policy. Early native timings/actions may be absent; no native cross-signal linkage follows from queue delivery. See [Hosting security verification](SECURITY-HOSTING-HARDENING.md) for local evidence and outstanding production gates.

## 2.2.1 telemetry extension (source)

Read [coverage and activation evidence](OBSERVABILITY-2.2.1.md) for new route/outcome observations, independent CI test reporting, provider-confirmed deployment capture and sanitized retries. No runtime deployment, dedicated CI credential binding or tenant visibility follows from source implementation.
