---
name: inspiredlearning-material3
description: Build or review InspiredLearning v2 Material 3 learner/admin screens, adaptive navigation, themes and confirmations.
---

Read [design system](../../docs/DESIGN-SYSTEM.md) and the actual src/styles token/layout/component files. Keep the green InspiredLearning identity; Material 3 is the interface language, not Google branding or permission to invent product features.

- src/styles/tokens.css owns light/dark semantic roles and type/shape/motion tokens. Use roles rather than page-local color literals. Keep normal text contrast >=4.5 and usable controls/focus in both themes. Theme changes disable cross-palette transitions so intermediate colors do not break contrast.
- Reuse ui/Brand, Icon, Theme and Confirm. Labels remain visible; don't replace operational text with unexplained icons. Use confirmAction for reviewed confirmations and keep typed erasure confirmation/review reasons where required. Confirmations cancel on account/route changes and restore focus; test Escape and both Tab directions.
- Learner drawer/rail/bottom navigation adapts at existing breakpoints. Admin has separate navigation and entry. Keep secondary staff/privacy/integration/delivery links reachable on compact screens. Scroll only within labeled keyboard-focusable tables; avoid page overflow.
- Work from actual domain responses. Empty/unknown/partial records and capacity errors are real states, not zeros or fabricated counts. A missing page must not make a valid learner-owned workshop detail disappear. Do not import admin tools into learner bundles to make a visual toggle.
- test/browser/v2.spec.mjs checks 320–1600px, light/dark contrast, actual app screenshots, admin session isolation and dialog behavior. Existing browser journeys cover mutations/certificates/privacy. Use synthetic emulator fixtures only. Capture real viewports for evidence; full-page stitching can duplicate sticky/fixed content in Chromium. Record viewport/theme and source identity before sharing.

Browser checks do not certify physical Safari, complete WCAG conformance, live Google OAuth or production RUM. Preserve reduced motion, large-text/zoom and forced-color behavior. Keep design evidence and route/state coverage current when adding screens.
