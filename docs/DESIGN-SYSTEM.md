# InspiredLearning v2 — Material Design 3

The user approved Material 3 across InspiredLearning, a separate app at admin.inspi.in and Google reauthentication without mandatory MFA. This is a platform redesign; ChaiCart Live remains its existing workshop app.

## Foundation

Retain InspiredLearning's green brand family. Implement the Material 3 semantic color model with light/dark surfaces, primary/on-primary/container, secondary/tertiary, error, outline, inverse and focus roles. Use Roboto's display/headline/title/body/label hierarchy. Do not copy Google branding or claim a library default is complete M3. CSS tokens and small accessible React primitives wrap existing domain workflows, avoiding a new CSS-in-JS/runtime component dependency or wholesale policy rewrite.

Use tonal surfaces and selected indicators; 4px spacing rhythm, full/pill buttons, 12–28px card/dialog shapes, 48px touch targets and explicit hover/pressed/focus/disabled/error states. Surface elevation uses tonal containers with restrained shadows. Motion uses short opacity/transform/state transitions and honors reduced motion. No decorative activity or fabricated charts/counts.

Navigation: persistent drawer on expanded screens, compact rail at medium widths and bottom learner navigation on compact screens. Secondary links remain reachable through a labeled menu. Admin uses its own drawer/top bar and compact navigation with the same token/control language. Content remains constrained for reading and expands for operational tables. Use horizontal scrolling only within labeled data-table containers; no page overflow. Public pages have a clear branded header and role-appropriate entry links.

Themes: system by default with an explicit light/dark/system selector; store only this non-sensitive preference under an app-owned key. No roster/PII browser cache. Admin and learner account state are isolated by origin/app entry; a visual mode switch is not authorization.

## Existing route coverage

| Surface | Routes / workflows | Important states |
| --- | --- | --- |
| Public | Landing, privacy, community, certificate verification | Signed out, unsupported account, loading, offline/error, valid/private/revoked/missing certificate |
| Learner | Dashboard, workshop list/detail, credit history | Real/unknown credits, partial window/load-more, empty history, archived results, unavailable record |
| Learner | Certificates, profile/support, erasure/reactivation | Award/participation, signed download, opt-in public visibility, correction, pending/resolved/declined request, typed erasure confirmation, blocked reimport |
| Captain | Existing learner-origin /staff | Assigned region only, denied publication/global controls, mixed batch outcomes |
| Admin | Separate sign-in and overview | Checking access, no role, revoked/disabled identity, changed account, reauthentication cancelled/expired |
| Admin | Workshops, learners, requests | Attendance/close/publication, reasoned changes, removed records, bounded request pages, erasure/recovery |
| Admin | Certificates, integrations, delivery | Versioned register/preview/reconcile, one-time credentials/revoke, failed-event metadata/redrive |

Each screen must retain semantic labels, focus/error feedback and real loading/empty/permission states. Navigation titles and focus move on route change; dialogs trap focus, support Escape and restore the opener. Native destructive confirmations remain reasoned/typed where already required until their accessible dialog replacement is verified. Native form controls remain labeled and keyboard-operable.

## Verification

Target WCAG 2.2 AA without claiming certification: check token contrast, keyboard/focus, touch targets, 200% zoom/large text, long/non-Latin strings, reduced motion and light/dark at compact/medium/expanded/wide/short viewports. Use isolated emulator users and reviewed screenshots of actual app states, never participant exports. Browser emulation is not physical Safari verification.

References: https://m3.material.io/styles/color/the-color-system ; https://m3.material.io/styles/typography/applying-type ; https://m3.material.io/foundations/layout/understanding-layout/overview . Provider/runtime docs are checked separately for implementation APIs.
