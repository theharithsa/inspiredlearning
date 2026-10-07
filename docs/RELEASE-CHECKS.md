# Release checks — 7 October 2026

## Deployed

- InspiredLearning: https://inspiredlearning-vh.web.app
- Private repository: https://github.com/theharithsa/inspiredlearning (privacy verified)
- Source implementation: `79f6313`; all eight dedicated Firebase functions are ACTIVE.
- Shared learning rules/indexes and the Live archival backend are deployed from ChaiCart Live.
- Facilitator guide and Workshop Flow Map include the permanent learner completion handoff.
- Review channel: https://inspiredlearning-vh--review-tf3wvsog.web.app (temporary, expires 8 October).

## Verification

78 automated cases passed across the portal and Live integration: four portal model, ten portal backend/rules, nine portal browser, 38 Live backend/rules and 17 Live browser cases. The final Live browser run also simulated reopening an older completed session without the archive flag. PDF layout was rendered and inspected; mobile layout and staff screens were inspected. Backend clean installation with Firebase's npm version passed, with zero reported dependency vulnerabilities.

Dynatrace accepted traces, metrics and logs from the real portal OTel SDK using the existing protected credential. Production registration created a registered record with zero learning points and no certificate. Its enrollment and cancellation canonical BizEvents reached delivered state with genuine trace/span and transaction IDs. The disposable session and learner fixture were removed; real attendees and their scores were not changed. The deployed frontend contains the supplied RUM tag and showed no browser errors during the public-page check.

GitHub CI passed for portal source `79f6313`, the Live integration source, and the updated facilitator notes. Later documentation-only updates do not change deployed runtime behavior. The final older-session frontend fix is tracked in the Live repository separately.

## Remaining external checks

`inspi.in` still needs GoDaddy sign-in and DNS changes. Firebase's verified requested records are:

| Type | Name | Required value |
| --- | --- | --- |
| A | @ | 199.36.158.100 |
| TXT | @ | hosting-site=inspiredlearning-vh |

The existing root A value was `76.76.21.21`; changing it moves the root website to Firebase. Preserve email MX and SPF records. Re-read Firebase's domain requirements before applying changes, then verify ownership, TLS certificate and real Google sign-in on the custom domain. The Firebase URL works meanwhile. Google authentication was tested through isolated emulator identities; a live user's OAuth flow and custom-domain login still require a real account check.

For a session created before the portal, a facilitator opens Workshop staff and imports existing registrations. Staff must confirm actual attendance before publication. No historical completion, attendance or score was guessed during deployment.
