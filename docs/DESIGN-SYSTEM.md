# InspiredLearning v2.1 — Material Design 3

The user approved Material 3 across InspiredLearning, a separate app at admin.inspi.in and Google reauthentication without mandatory MFA. This is a platform redesign; ChaiCart Live remains its existing workshop app.

## Foundation

The approved default is **Material violet**, with green, blue, rose, teal and neutral alternatives. `scripts/palette-source.mjs` uses Google's HCT `SchemeTonalSpot` to generate complete light/dark semantic roles in `palettes.css`; `tokens.css` owns the Material type/shape/motion scale. Generate with `node scripts/generate-palettes.mjs`.

Pinned `@material/web` 2.5.0 owns outlined text fields/exposed dropdowns, buttons, menus, checkboxes, radios, primary tabs and circular progress through `src/ui` React adapters. These are real Material components, including their popup and interaction states. The upstream project is in maintenance mode; keep the dependency pinned and isolated behind adapters. Adaptive navigation, dialogs, cards, lists, tables, notices and the date calendar remain app-owned, sharing the same roles, typography, shape and state layers. See [component coverage](MATERIAL3-COVERAGE.md). Library adoption does not prove every screen or accessibility requirement conforms.

`Icon` uses official Material Symbols Rounded paths with Apache 2.0 attribution. Settings offers 14 locally served, licensed fonts: Roboto, Google Sans, Lato, Inter, Open Sans, Source Sans 3, Noto Sans, Merriweather, Source Serif 4, Lora, Roboto Mono, IBM Plex Mono, JetBrains Mono and Google Sans Code. Brand/plain Material typography roles and ordinary text inherit the selected family. These are actual WOFF2 assets with committed OFL licenses and provenance/hashes under `public/fonts`, not aliases to system fonts. Unsupported scripts fall back to available device fonts. Certificate PDF typography is a separate published document template and is unchanged.

Use tonal surfaces and selected indicators; 4px spacing rhythm, full/pill buttons, 12–28px card/dialog shapes, 48px touch targets and explicit hover/pressed/focus/disabled/error states. Surface elevation uses tonal containers with restrained shadows. Motion uses short opacity/transform/state transitions and honors reduced motion. No decorative activity or fabricated charts/counts.

Navigation: persistent drawer on expanded screens, compact rail at medium widths and bottom learner navigation on compact screens. Secondary links remain reachable through a labeled menu. Admin uses its own drawer/top bar and compact navigation with the same token/control language. Content remains constrained for reading and expands for operational tables. Use horizontal scrolling only within labeled data-table containers; no page overflow. Public pages have a clear branded header and role-appropriate entry links.

Settings: system mode, violet palette and Roboto by default. Mode, palette and font are allowlisted local preferences under `inspiredlearning-appearance`; migrate the old `inspiredlearning-theme` value and support explicit reset. Changes apply throughout the current portal, persist across reloads and synchronize between same-origin tabs. Learner/admin origins retain independent appearance preferences. Font load failure reports fallback. No domain API is appropriate for this browser-only preference. No roster/PII browser cache. Admin and learner account state are isolated by origin/app entry; a visual mode switch is not authorization.

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

Each screen must retain semantic labels, focus/error feedback and real loading/empty/permission states. Navigation titles and focus move on route change; dialogs trap focus, support Escape and restore the opener. Material confirmations preserve existing reasoned/typed erasure safeguards. Material form controls remain visibly labeled and keyboard-operable; adapters preserve validation, form submission, controlled values, read-only/disabled state and focus. Do not add unstyled native controls.

## Verification

Target WCAG 2.2 AA without claiming certification: check token contrast, keyboard/focus, touch targets, 200% zoom/large text, long/non-Latin strings, reduced motion and light/dark at compact/medium/expanded/wide/short viewports. Use isolated emulator users and reviewed screenshots of actual app states, never participant exports. Browser emulation is not physical Safari verification.

References: https://m3.material.io/styles/color/the-color-system ; https://m3.material.io/styles/typography/applying-type ; https://m3.material.io/foundations/layout/understanding-layout/overview . Provider/runtime docs are checked separately for implementation APIs.
