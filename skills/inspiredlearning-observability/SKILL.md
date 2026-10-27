---
name: inspiredlearning-observability
description: Implement and verify InspiredLearning RUM, OpenTelemetry dependencies, canonical outbox delivery and operational health.
metadata:
  upstream: dt-obs
  upstream-version: "1.2.0"
---

Read [observability](../../docs/OBSERVABILITY.md), [outbox API](../../docs/API-MAINTENANCE-1.4.md) and [configuration evidence](../../observability/README.md). This app-specific adaptation does not authorize tenant writes.

- Browser events are client-observed RUM; canonical BizEvents are transactional server-confirmed events. Neither button clicks nor HTTP success alone prove business commit. Keep stable event IDs across delivery retries/redrive.
- functions/monitor.js owns SDK initialization, context, bounded/coalesced flush, log sinks and low-cardinality operation metrics. Existing Firestore SDK tracing uses the global provider. Confirm installed behavior before adding a second instrumentation layer. Manual Auth/PDF/per-learner/outbound spans must not export tokens, payloads, review text or PDF bytes. Exclude exporter requests from HTTP instrumentation.
- HTTP entry spans include rejected authentication; nested domain spans are INTERNAL. Continue genuine incoming W3C context; transaction IDs correlate business flows but do not establish native RUM navigation.
- Retain the owner's documented email attribution policy. RUM build injection is disabled for dev/emulators. No browser ingest credentials or Session Replay enablement. TELEMETRY_LOG_SINK defaults to both; change sinks only after checking actual forwarding/OTLP visibility.
- functions/events.js owns durable delivery, leases, capped retries and scheduled privacy recovery. Only 202 marks BizEvent acceptance. Admin telemetry API is Google-global-admin-only, metadata-only and audited; redrive preserves the original payload/event ID, checks expected attempts and uses a UUID receipt. Queued is not ingested.
- Outbox retention is unchanged. Do not TTL pending/failed or delivered events without a new owner decision. Health age is unknown if the bounded sample cannot prove completeness; missing is not zero. Metric dimensions cannot contain learner/event IDs.

Run unit policy tests and test/maintenance.test.mjs through test:integration. It independently decodes real local OTLP and checks native child spans, context, privacy and exporter-recursion exclusion. Rehearsal exports go to localhost. Tenant DQL syntax acceptance, metric visibility, Settings application, alert execution and native linkage need separate evidence. Read-only query success is not deployed configuration. Keep observability/README.md current with actual access failures and unverified gates.
