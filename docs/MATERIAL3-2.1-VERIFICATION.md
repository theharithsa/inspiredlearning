# App 2.1.0 verification

Issue: #58. Date: 29 October 2026. Scope: Material 3 component correction and local appearance preferences after the v2.0 preview review. Functions 2.0.0, API 1.5.0 and MCP 1.0.1 are unchanged.

This is source/local-preview evidence. Production deployment and admin provisioning remain gated by the user's design review. Synthetic emulator accounts only; no published results or learner records were changed.

## Verification record

- Unit: 34 passed, including strict appearance allowlists, fourteen real licensed font assets/hashes, both modes of six palettes, date-only boundaries and the native-control guard.
- Lint and both learner/admin production builds pass. The existing lazy-loaded Firebase chunk remains above Vite's 500 kB warning threshold; it is not loaded by public privacy/Settings. No warning threshold was raised.
- Production dependency audit: zero vulnerabilities in frontend dependencies. Existing CLI development-only chain is tracked separately in #57.
- The actual Material browser checks have passed form submission/constraints, dropdown keyboard/Escape, date selection/focus, all fourteen font loads, saved preferences/reset, all palettes/modes, narrow/short windows and font failure/focus loops. Axe's WCAG 2 A/AA and 2.1 A/AA tags pass in both themes after correcting radio semantics and using the Material button's default label slot.
- Full emulator regression: **45 passed**, zero failed/skipped/flaky, in 2.5 minutes. Includes the 36 existing domain/session/layout journeys, eight Material/appearance checks and one safe shadow-click observability test. **Eight follow-up UI checks also passed**, including every actual font at 320px, open dropdown bounds at 320/390/768/1200/1600px and reduced-motion menu behavior. The accessibility pass additionally checks the active form fixture and actual public-page Settings; light/dark and open-menu captures are in `evidence/v2.1.0`.

## Review decisions

The original native controls and popups did not provide consistent M3 coverage. App-owned React adapters now isolate the pinned upstream Material Web controls. App-owned adaptive chrome/dialogs/cards/tables remain explicit in MATERIAL3-COVERAGE.md. React/custom-element boolean ARIA values are serialized as valid strings. Controlled checkbox disabled state is reapplied after fieldset insertion, preserving the admin token form's loading lifecycle. Shadow click events preserve allowlisted browser metadata without collecting field values or claiming canonical business outcomes.

Settings uses only allowlisted mode/palette/font values in browser storage, migrates the old mode preference, reports real font readiness/fallback and resets only appearance. No server preference API or Firebase writes are introduced. Font assets/licenses and official symbol source/license attribution are committed. Membership, captain mapping, retention/capacity policy, auth/session/reauthentication and PDF templates are unchanged.

## Evidence limits

Automated rules, browser emulation and token contrast do not certify full WCAG conformance, every assistive technology or physical Safari/device behavior. Google OAuth, deployed headers, domain/session isolation across real production hostnames, production RUM, ingestion and Dynatrace tenant verification remain separate release checks. Material Web is in maintenance mode; dependency isolation and the regression suite are part of the maintenance plan.


## Source and review

`evidence/v2.1.0/source-manifest.json` records 193 source/test/config/asset path hashes (excluding secrets, dependency directories and local preview helpers). Captures metadata records the manifest digest, viewport, mode, font, palette and image digests. These working-tree captures do not claim an immutable deployed artifact; PR CI verifies its own exact committed revision.

Self-review using the PR-review and React checklists: production behavior, adapter correctness, user experience, meaningful regression coverage and documentation pass within the stated scope. No new domain API, Google identity policy, CI secret or deployment mutation is introduced. GitHub Pages is not used. Pinned upstream maintenance status, lazy Firebase bundle warning and physical-device/tenant checks remain explicit limits. The linked PR must pass exact-head checks before source merge; production remains held for design approval.
