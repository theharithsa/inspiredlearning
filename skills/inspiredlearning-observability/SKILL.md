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

V2 adds app.surface=learner/admin to browser observations while preserving existing email attribution. Verify the admin origin/tag separately; no duplicate RUM agent or replay enablement. Authenticated callables now check revocation/disabled state, with bounded Auth spans; rejected authentication is never a successful business mutation.

The independent inspiredlearning-delivery CI service is implemented in scripts/observability/pipeline.mjs and report-github.mjs, triggered by .github/workflows/observability.yml. Read docs/CI-OBSERVABILITY.md for trusted default-branch checkout, same-repository run/attempt/revision validation, stable IDs, no PR-head/artifact execution, structured trusted-main test reports and secure DYNATRACE_CI_TOKEN/DYNATRACE_CI_ENABLED activation. CI service metrics use bounded phase/outcome dimensions. Local delivery-export tests decode actual separate OTLP signals; no tenant proof or native deployment marker follows from them. Never bind the runtime secret into Actions automatically.

App 2.1.0 includes `app.version` and resolves allowlisted actions through the composed click path for Material shadow controls. Test event authority, exact safe metadata keys and absence of field/preference values in `test/browser/material-observability.spec.mjs`. Settings itself has no server business outcome.

Read [2.2.1 coverage/recovery](../../docs/OBSERVABILITY-2.2.1.md) for source/observation timing, direct reviews/closing references, exact-attempt replay, trusted-main data-only artifacts and provider-confirmed Hosting capture. capture-deployment is read-only and queues sanitized events; drain needs a dedicated securely supplied credential. Native deployment markers require verified provider/manifest/probes and original timestamps; environment association is not service linkage. Browser route/request fields stay allowlisted and completion events must not cross UIDs. No source-job ingestion token, PR artifact execution, chat credential copying, automatic activation, alert setup or membership migration. Keep source/local/queued/accepted/searchable/native-link evidence separate.

Privileged review capture must use workflow_run from the trusted default branch. The separate Review signal workflow has permissions:{} and no checkout/environment/secrets/artifacts; never add a secret-bearing pull_request_review job. Validate exact signal path/event/run/revision and PR association, then read bounded published review snapshots through GitHub API. Unknown dismissal time and missing/overflowed associations remain explicit gaps.
