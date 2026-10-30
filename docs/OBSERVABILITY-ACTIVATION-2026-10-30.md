# Delivery telemetry activation — 30 October 2026

PR #78 merged as `cdaa9d947b6e712d2922fbd549055e48adb41b07` after full exact-head Checks [41064644023](https://github.com/theharithsa/inspiredlearning/actions/runs/41064644023) passed at `ad4224fc720976aa1e3fe9c928ce44f93d8d2094`. Source includes app candidate 2.2.1; production Hosting remains 2.2.0 and Functions/API/MCP remain 2.0.1/1.5.0/1.0.1.

## Approved activation and observed failure

The owner supplied `Production/DYNATRACE_CI_TOKEN` in GitHub and explicitly approved enabling delivery telemetry and bounded verification after merge. A names-only API read verified the secret reference; its value was never read or copied. `DYNATRACE_CI_ENABLED=true` is now set at repository scope. Production environment access uses `deployment:false`; the GitHub deployments API returned an empty list both before and after reporting. No environment protection, token scope, tenant configuration, Hosting or Functions deployment was changed.

First dispatch [41066469245](https://github.com/theharithsa/inspiredlearning/actions/runs/41066469245) failed before queuing or ingestion because GitHub had cleared the merged review run's `pull_requests` association. Both the ordinary and attempt-specific run responses subsequently returned an empty association, despite the association being present during pre-merge API validation. This was not a token failure. The source correction recovers only GitHub commit associations matching the exact same head repository, SHA and branch, with bounded cardinality and no PR artifact access. Changed head/branch/repository, duplicate or missing associations still fail visibly. This preserves API-observed review state without inferring a historical triggering review or dismissal time.

## Accepted and searchable evidence

Dispatch [41066818831](https://github.com/theharithsa/inspiredlearning/actions/runs/41066818831) used completed Checks run `41064644023`, attempt 1, plus the reviewed Hosting observation. It succeeded with **37 HTTP-202 accepted business events, zero pending, zero failed**. The sanitized retry artifact contains 37 accepted records. OTLP SDK callbacks reported one successful export each for traces, logs and metrics, with no SDK failures. Those callback results are not per-record partial-acceptance receipts.

Read-only queries through the existing indiacs connector verified the actual tenant independently:

- All four exact provider/probe event IDs are searchable: two Firebase Hosting deployments and two public verification observations. Original provider release times (06:00:34.178Z admin, 06:01:06.263Z learner) and later probe times (13:03:02.267Z admin, 13:02:57.957Z learner) are retained. These describe existing 2.2.0 releases, not a new deployment.
- All 33 source execution BizEvents for run `41064644023` are searchable with 33 distinct stable IDs: 32 success and one skipped phase observation.
- 33 native CI spans are searchable with service `inspiredlearning-delivery`, service.version `2.2.1`, reporter build `cdaa9d9` and source revision `ad4224f`. Native workflow → job → step parent IDs match within trace `d8505217ae68c20ca26763a828716e48`.
- The workflow log is searchable with the same native trace ID and root span ID `a394e40c70668bd6`. This verifies CI log/span correlation, not browser/backend navigation.
- Native metric keys `inspiredlearning.delivery.executions`, `inspiredlearning.delivery.duration` and histogram buckets are searchable. A timeseries query returned 1 workflow, 2 jobs, 29 successful steps and 1 skipped step for the initial reporting window. These count reporting observations and can duplicate on replay; they are not unique-build/SLO denominators.

Dynatrace maps CloudEvents `source` to `event.provider`. Actual providers are `inspiredlearning:github`, `inspiredlearning:firebase-hosting`, `inspiredlearning:runtime-probe` and `inspiredlearning:developer`; do not filter these records by the payload's generic delivery-provider value. `sdlc.source`, repository, schema and stable IDs are reliable selectors. BizEvent run IDs are numeric; native span/log run IDs are strings. Use `span.parent_id` for native parents and `trace_id`/`span_id` for log IDs. Initial queries using the wrong provider/field names returned no rows; corrected exact-ID/source queries returned the evidence above.

## Remaining gates

The review-association correction and its 56 local unit tests require their own exact-head CI/merge and live replay at the time of this pre-merge evidence snapshot. [Issue #77](https://github.com/theharithsa/inspiredlearning/issues/77) is the ongoing post-merge acceptance ledger; check its latest verification comment before treating this snapshot as current gate status. Automatic main-push ingestion is verified: main Checks 41066447618 passed; observer 41067734338 accepted 44 BizEvents (33 source phases plus eleven suite summaries), with zero pending/failed and successful SDK exports for all three OTLP signals. Tenant queries returned eleven complete/passed summaries, including 55 unit tests, 49 integration tests, 62 browser tests with zero flaky tests, and separate learner/admin Hosting checks. #77 stays open while those gates and the future browser Hosting rollout remain unresolved. Source browser changes have 62 passing emulator regressions, but are not deployed. No native CUSTOM_DEPLOYMENT marker or service association is claimed, no RUM/backend navigation is verified, #9 alerts remain deferred, #17 migration remains held, and retention/email/capacity/learner data are unchanged.

The earlier source-candidate documents are historical preparation evidence. This dated activation record supersedes their statements that the observer flag is unset or all tenant verification is pending.
