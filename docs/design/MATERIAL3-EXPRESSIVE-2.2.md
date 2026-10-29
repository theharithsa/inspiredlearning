# Material 3 expression — 2.2.0 source candidate

Reviewed against the current official Material site on 30 October 2026. This is a source/preview revision, not production verification or a claim of complete visual acceptance. Production remains 2.1.3; the source-only 2.1.4 avatar correction is included.

## Design audit and implemented direction

| Before | After | Why |
| --- | --- | --- |
| Repeated outlined panels with equal visual weight | Tonal container hierarchy across panels, task cards, workshop cards and the navigation drawer | Surface roles distinguish workspace, groups and interactive tasks without relying on shadows or outlines |
| Generic numbered hero panel | Original learning-world cartoon, oversized editorial type, shaped tonal image container and a separate readable learning story | Gives the public homepage a recognizable identity while keeping the Google entry and platform explanation clear |
| Unstructured illustration-free community section | A second original notebook companion with a coherent violet/cream/teal art direction | Connects collaboration, curiosity and durable records visually |
| Color/shadow transitions only | Physical spatial feedback for pointer buttons and avatar; spring entries for dialogs, confirmations and route headings | Shows feedback and spatial context instead of adding perpetual movement |
| One motion recipe everywhere | Expressive spring for the rare homepage entrance, restrained standard spring for operational controls and surfaces | Expression supports onboarding; operational content stays stable while being read |

## Verified motion reference

Sources: [current motion system](https://m3.material.io/styles/motion), [official token specs and web conversion table](https://m3.material.io/styles/motion/overview/specs), [M3 Expressive direction](https://m3.material.io/blog/building-with-m3-expressive), [color roles](https://m3.material.io/styles/color/roles).

The official JavaScript-rendered token viewer was inspected in Standard/Android and Expressive/Web contexts. Fast spatial tokens: standard damping ratio **0.9**, stiffness **1400**; expressive ratio **0.6**, stiffness **800**, unit mass. `spring-model.ts` owns those physical parameters and analytic position/velocity sampling. Effects use the official default conversion **cubic-bezier(0.34, 0.80, 0.34, 1), 200ms**, separate from spatial overshoot. These values supersede generic animation-skill curve/duration suggestions for this explicitly requested Material implementation.

`expressive-motion.ts` generates transform-only WAAPI frames. A pointer release samples the current spring position AND velocity before retargeting; it does not restart from a fixed keyframe. Release outside the control, pointer cancellation, blur, disabling, unmount, keyboard input and a changed reduced-motion preference settle/cancel motion. Keyboard activation remains immediate. Entrances are occasional, cancellable, and do not repeat on live data updates. No scroll hijacking, parallax, infinite floating, moving data tables, animation-library dependency, or delayed business action was added. Material Web still owns its internal control/menu transitions; this adaptation does not claim those components automatically implement every current Expressive feature.

## Images

[Asset provenance and complete generation prompts](../../public/illustrations/README.md). Hero is eagerly loaded with dimensions/high fetch priority; the supporting image is lazy. Both optimized WebP assets retain transparency and are locally served. Semantic colors and all existing appearance/font choices remain available; raster art uses a deliberate fixed brand palette rather than being recolored per theme.

## Validation scope

The new browser cases cover the public homepage in light/dark at 320, 390, 840, 1024 and 1440px, a narrow monospace view, actual asset load, automated axe checks, pointer release outside the target, keyboard focus and changing reduced-motion preference mid-spring. Existing account/Material/Settings suites remain required. Pure spring tests cover continuity with velocity preservation, bounded overshoot and finite convergence. Production Google OAuth, RUM tenant checks and physical-device motion feel are separate release gates. #63 remains open for broader operational-page composition acceptance; this is not a blanket closure.
