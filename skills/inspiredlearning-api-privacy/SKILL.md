---
name: inspiredlearning-api-privacy
description: Maintain InspiredLearning domain APIs and policy for shared identity, credits, certificates and learner removal.
---

Read [handover](../../docs/PROJECT-HANDOVER.md), [API](../../docs/API.md), [resource contract](../../docs/API-RESOURCE-CONTRACT.md) and [maintenance contract](../../docs/API-MAINTENANCE-1.4.md) for the touched surface. Inspect current source rather than treating original proposals as implemented routes.

- functions/api-http.js handles transport; functions/api.js/catalog/domain-writes and existing callables share domain policies. OpenAPI is functions/openapi.json. mcp/ delegates GET authorization to REST; it cannot bypass policy.
- Google global facilitator authority comes from admins/{email}; captains are restricted to their assigned session region. The fixed model.js team-to-region mapping is authorization. API tokens do not gain Google-admin-only token/certificate/telemetry controls merely by holding read/write scopes.
- Keep owner, captain, administrator, disabled/revoked identity and scoped-token tests. Check privacy markers on reads and transactionally on writes; UI route checks grant no authority.
- Unified stored credits use latest completed team-plus-individual awards and immutable external adjustments. Legacy learningPoints, Live activity scores and report composites are separate. Null unknown values must not become zero. Do not recalculate published historical outcomes.
- Certificates are versioned, signed PDFs rendered on demand. Preserve parent award identity, revoked/superseded history and opt-in minimal public verification. Visibility never grants a PDF download. Staff preview requires a reason.
- Erasure removes InspiredLearning history/certificates, retaining shared Auth/Live and separately governed audit/monitoring. Keep replay tombstones, blocked sessions, recovery leases and resumable discovery. Never replace legacy discovery with an incomplete enrollment index. See #17 limitations in [maintenance policy](../../docs/MAINTENANCE-POLICY-2026-10-27.md).

Define new operations before UI integration: exact schema/permissions, allowlisted filters, actor/filter-bound cursors, safe errors, input bounds, audit and retry/concurrency semantics. Test changed policy through real isolated Firestore/Auth as applicable. Shared collections require Live's relevant regression suite too; shared rules/indexes are not deployed from this repository.
