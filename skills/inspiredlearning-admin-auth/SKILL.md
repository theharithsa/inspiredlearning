---
name: inspiredlearning-admin-auth
description: Maintain the separate InspiredLearning administrator app, Google sign-in/session isolation, recent authentication and server authorization.
---

Read [admin contract](../../docs/API-V2-ADMIN-CONTRACT.md), [handover](../../docs/PROJECT-HANDOVER.md) and src/admin/App.tsx, src/firebase.ts, src/surface.ts, functions/admin-session.js before changes.

- admin.html/admin-main.tsx is a separate build entry, emitted as dist-admin/index.html. The learner build emits dist/. Production admin.inspi.in is a separate origin. Local /admin.html is rehearsal only; neither pathname nor build mode grants a role.
- The admin Firebase app has its own name/auth state but uses the existing project/Google UIDs and global facilitator policy. The owner approved browserSessionPersistence on 28 October 2026; await authReady before app/login. Learner persistence stays unchanged. No duplicate accounts, new MFA, cookie session layer or invented idle timeout.
- Startup verifies GET /api/v1/admin/access and never invokes learner profile or subscribes to learner history. Recheck current role on visibility return; every privileged operation independently checks authority server-side. Don't claim instantaneous revocation from a UI listener.
- Reuse the existing 300-second recent-auth policy with 60-second future clock tolerance. Server trusts verified auth_time only. Sensitive global-admin mutations and non-owner PDF exports require it at transport boundaries; domain policy still rechecks roles/resources/privacy transactionally. Browser ensureRecentAdminAuth is convenience, not enforcement. Keep API-token automation scopes intact; Google-only bootstrap/operations reject tokens.
- Captains retain existing learner-origin /staff and fixed regional policy. Global administrators use the dedicated app; legacy /#/admin hands off without credentials in URLs. The learner build must not include administrator tool bundles.
- Account change/sign-out/denied bootstrap unmounts private tools. Confirmations cancel on identity/route changes. Cancelled reauthentication must not send the pending write. Never retry an uncertain write automatically merely because authentication changed.

Run admin-session unit tests, real Auth/Firestore/API tests and v2 browser isolation/denial/revocation/refresh/new-tab/confirmation tests. Hosting target binding, authorized domains, DNS, live OAuth and RUM origin verification are separate release gates. firebase.admin.json contains a logical target only until a real approved site is mapped; never fabricate an active admin domain from a build pass.
