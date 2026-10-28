# Material 3 coverage — app 2.1.0

Tracked by #58, following the rejected v2.0 preview. Violet is the approved default; palettes and typography are browser preferences. This document records implementation ownership and verification scope, not a conformance certificate.

| Element / surfaces | Implementation | States and checks |
| --- | --- | --- |
| Action and icon buttons, every route | Material Web via `Button` | Filled, tonal, outlined, text, icon; ripple/focus, disabled, busy, form submission |
| Text, number, email, password, multiline fields | Material outlined field via `Field` | Floating visible labels, input/change, required validation, read-only, disabled, error/supporting text, Enter submit |
| Every dropdown, including filters and Settings | Material outlined select/options via `Select` | Actual themed popup, keyboard/typeahead, selected and disabled options, Escape/focus return; no native OS select |
| Permissions, consent and visibility | Material `Checkbox` | Existing checked state, disabled fieldsets, label/keyboard; no permission semantics change |
| Settings palettes | Material `Radio` with tonal selection cards | Six palettes, light/dark/system, explicit selected state and accessible labels |
| Request Pending/History | Material primary `Tabs` | Selected indicator, keyboard interaction, existing data-loading behavior |
| Account menu | Material icon button/menu/menu items | Desktop, rail and compact reachability, fixed popup placement, Escape, Settings/sign-out |
| Advanced certificate options | `Disclosure` + Material text button | Labeled expansion and collapsed content |
| Loading and busy feedback | Material circular progress | Existing status messages, progress accessible label, disabled busy actions |
| Confirmation, Settings and date dialogs | Native modality + app-owned M3 dialog | 28px shape, tonal elevation, scrim, title, Escape, focus trap/return; typed erasure safeguard retained |
| Certificate date correction | App-owned calendar + Material field/buttons | Editable ISO dates, real Gregorian validation, month selection, arrows/Home/End/Page keys, one day tab stop, cancel/clear/select; no local-time date shifts |
| Navigation, cards, lists, tables, notices, badges | App-owned CSS sharing system roles | Drawer/rail/bottom navigation, selected indicators, hover/focus, bounded table scrolling, loading/empty/error/denied content |
| Icons | Official Material Symbols Rounded SVG paths | Consistent fill/geometry; Apache license and per-symbol source links committed |
| Typography, including shadow controls | Shared brand/plain roles and family variable | 14 actual WOFF2 families, OFL licenses/provenance, local loading, fallback status, persistence and reset |

Google’s authentication popup and the separately packaged Swagger API documentation remain vendor interfaces; they are not implemented by these app adapters. Published PDF templates also retain their document typography.

All existing routes retain their domain behavior: public/learner/captain/admin coverage is listed in DESIGN-SYSTEM.md. Preferences contain only three allowlisted values and never request server writes. They apply to the current browser/origin, not PDF certificates or other devices.

`test/appearance.test.mjs` checks strict preferences, font assets/licenses/hashes, palette contrast and date-only boundaries. `test/browser/material.spec.mjs` exercises actual controls, every font and palette/mode, keyboard/focus, narrow/short layouts, load failure and automated axe WCAG tags. Existing browser journeys cover real emulator mutations, confirmations, requests, certificates, auth isolation and responsive layouts. The local control fixture is DEV/emulator guarded and excluded from production entrypoints.

Physical Safari/device review, comprehensive assistive-technology testing, live OAuth and production observability remain separate release checks. Material Web is maintained upstream in maintenance mode; adapters isolate it and dependencies are locked. Passing automated accessibility rules does not establish full WCAG 2.2 AA compliance.
