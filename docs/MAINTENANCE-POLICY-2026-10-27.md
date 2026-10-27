# Approved maintenance decisions and remaining release gates

The owner confirmed these decisions on 27 October 2026, before the 2.0.0 redesign. This document describes source maintenance 1.0.2 / compatible REST contract 1.4.0; it does not authorize or certify a deployment.

| Issue | Decision / implementation boundary |
| --- | --- |
| #12 | Keep the documented email telemetry policy. UID-only telemetry was declined; no historical tenant data rewrite. |
| #33 | Retain the current Firestore outbox policy. No TTL, delivered-record purge or cleanup of pending/failed records. GitHub issues and Dynatrace retention are independent. |
| #15 / #18 | Preserve existing limits; plan stronger protection without paid infrastructure. Named function profiles permit later measured tuning but currently preserve deployed capacity settings. |
| #9 | Adopt 99.5% callable technical success, failed outbox > 0 and pending growth for fifteen minutes. Chart p95 without inventing a latency threshold. Store configuration as code; distinguish validation from tenant installation. |
| #26 | Keep ChaiCart team-to-region authorization fixed for this maintenance release. No admin-writable map or captain permission expansion. |
| #34 | v2.0.0 remains a separate Material 3 redesign, with the approved separate administrator app at admin.inspi.in. Maintenance does not implement that topology. |

## Stronger protection plan (#15)

Current throttling is a per-process minute bucket and can be multiplied across instances/cold starts; it is not a global abuse limit. Authentication, current-role checks and body bounds remain separate protections. Keep the existing limits in this release.

1. Verify Firebase/Cloud Run trusted proxy and `req.ip` behavior using an authorized deployed request. Do not trust arbitrary forwarded headers or log raw token/header values.
2. Inventory public verification, Google browser callables/REST, scoped credential clients and GET-only MCP. App Check must not silently break non-browser clients or public certificates. Review current provider support and cost, introduce observation-only evidence before selecting enforcement, and document recovery/bypass for authorized automation.
3. Design quotas by route class and verified actor, with a separately bounded anonymous pre-auth budget. Choose a shared mechanism only after quantifying contention, read/write cost, failure policy and a credible abuse scenario. Avoid writing a single global Firestore counter on every request by assumption.
4. Rehearse denied/expired identity, spoofed forwarding headers, duplicate/cold-instance traffic and legitimate workshop bursts. Compare 429/503 and p95; preserve reviewed publication, certificate and erasure workflows.
5. Implement enforcement in its own issue/PR after the technical/cost decision. No gateway, paid security tier, distributed quota store, App Check enforcement, increased instances/memory or new role is provisioned by this release.

## Privacy scan follow-up (#17)

Legacy Live participants can lack both portal workshop history and enrollment index entries. Using `learningEnrollments` alone would miss them and permit erased historical memberships to reappear after reactivation. The maintenance change keeps the compatibility discovery, pages session/history reads outside the initial administrator transaction, persists erasure discovery cursors and checks the erasure lease before each cursor write. The global erasing marker blocks portal imports while discovery/deletion is incomplete. Reactivation similarly persists its compatibility cursor and has scheduled recovery; blocked sessions stay blocked.

This bounds pages and improves recovery but retains O(total sessions) legacy discovery. It is **not** the complete index solution and #17 stays open. A source migration must define an authoritative per-UID membership index in the Live write path (including old documents without a UID field), backfill with an idempotent dry-run/count/reconciliation tool, verify coverage against legacy and concurrent joins/deletes, then switch only after completeness is proven. Shared rules/indexes and Live writes belong to the ChaiCart Live repository and require their own issue/PR plus both regression suites. No production backfill, shared rule/index deployment or learner-data migration is included here.

## Deployment and tenant gates

- #14: security headers and CSP report-only are source configuration from 1.0.1. Real Google popup/OAuth, RUM/beacon, Fonts, PDF and Swagger compatibility still need a deployed-header/report review before CSP enforcement. Do not enforce guessed origins or report an enforced CSP.
- #9: Monaco SLO/alert source and dashboard queries are stored under `observability/`. Read-only DQL syntax/execution checks are distinct from Settings schema validation, application, alert evaluation, notification routing and actual tenant visibility. Local dtctl schema access returned 401; retain this gate until the configuration identity is refreshed through secure storage.
- #19: public pages are Firebase-free and list listeners are explicitly bounded. User-requested load-more windows can reread preceding records; this favors live consistency without claiming cursor-stream efficiency. Counts below the workshop load-more notice cover loaded records. Canonical credit totals remain server-computed, with the existing 500-record capacity/error policy. Production LCP/INP measurement is pending deployment.
- #18: a local sequential synthetic PDF benchmark is not deployed concurrency, queueing, warm-instance availability or capacity evidence. Preserve settings until a separately authorized synthetic load rehearsal and tenant p95 review justify tuning.

No production Firebase/Hosting/DNS/permissions/retention or Dynatrace Settings writes were performed in this maintenance work. GitHub issue closure certifies merged source scope only.
