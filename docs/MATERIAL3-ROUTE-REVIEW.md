# Material 3 route review — 2.1.3 candidate

References #63 and #34. Production remains 2.1.2 until a separately approved release.

The empty learner dashboard leads with account/community next steps rather than repeating three zero counters and an empty milestone card. Non-workshop balances, unknown balances and load errors retain the existing score presentation. No credit calculation or published record changes.

Profile editing and record support now have separate task groups and independent heights. Account identifiers remain available in an expandable Account details section. Profile actions use content-sized Material buttons and the layout collapses below 1000px. The administrator Requests page puts its review queue before optional learner lookup, and the lookup uses a short floating label with readable supporting text instead of a truncated identifier list. The remaining primary link CTAs (public return/verification, certificate link and administrator handoff) use the same Material button adapter as form actions. Empty-state decoration uses an official Material icon. Workshop onboarding is platform-oriented rather than ChaiCart-only.

## Evidence and limits

The route-review browser suite uses demo-chaicart Auth/Firestore/Functions emulators and synthetic example.invalid accounts. It captures 84 learner/admin route combinations: seven routes per surface, 390x844/1280x720/1600x1000, light/dark. Additional captures cover learner/admin sign-in, valid/revoked/private public verification and the fixed-region captain roster at compact/desktop sizes. Private verification must omit the synthetic learner name; the captain test excludes the other region. A separate empty-account case preserves the non-workshop credit presentation.

Screenshots and revision-bearing inventory JSON are generated under test-results/route-review and retained as the CI synthetic-route-review artifact. They are not production screenshots. Local representative captures were inspected for profile task grouping, admin integrations/list/request surfaces, certificate states, compact navigation and captain form spacing. Geometry checks detect page overflow and heading duplication; they do not establish visual quality, physical-device compatibility or WCAG certification by themselves.

The Settings palette test now waits for the actual open/closed Material popup lifecycle before inspecting a popup or switching to another dropdown. This addresses an observed CI test race without retries, skipped assertions or forced clicks.

Before release, review exact-head CI screenshots and complete the existing full browser/API/Auth gates. After an approved deployment, inspect both real origins and verify exact version/revision manifests. #63/#34 acceptance is separate from the source merge; #14 CSP/native RUM gates and #9 deferred alerts retain their own evidence.
