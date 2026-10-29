# CSP, HTML cache and RUM loading — #14

Source candidate only. Production remains app 2.1.2 / Functions 2.0.0 until a separately approved release. These changes do not change authentication policy, learner records, certificate content or API permissions.

Both Hosting configurations enforce Content-Security-Policy instead of report-only. Scripts remain self-hosted except the existing approved Google and Dynatrace sources; inline scripts are blocked. Swagger initialization moves to a same-origin external script. Firebase/Google auth frames, blob PDF frames/workers, existing API/telemetry connections and local fonts remain allowed. Inline styles remain allowed because Material Web and React styles depend on them. This is a bounded allowlist, not a claim that CSP eliminates XSS.

The catch-all HTML policy is no-cache, including rewritten SPA paths. Hashed /assets files retain their immutable one-year policy; version manifests and /api paths retain no-store. The actual pinned Hosting emulator tests both surfaces, including an unknown SPA route; reading configuration alone would not establish routing/cache behavior.

The approved RUM tag loads asynchronously so it cannot block parsing. A bounded in-memory bridge retries application identity/observations for at most five seconds, retains at most 32 observations and clears on account change/page hide. No durable storage, backend relay or canonical event is introduced. Email attribution is unchanged. Late or blocked agents can lose early native timings/actions; application buffering does not restore those native measurements or prove RUM-to-backend linkage.

## Local gates

- npm run lint and npm test: lint plus 38 unit cases, including late/blocked-agent bounds, expiration and account changes.
- Build both surfaces with demo-chaicart settings; never publish the rehearsal artifacts.
- npm run test:security-browser: real Chromium with the enforced policy; blocks an inline probe, allows a same-origin external probe, renders public Settings/local typography and local Swagger.
- npm run test:hosting-cache: actual isolated Hosting emulators check learner/admin SPA HTML revalidation, enforced CSP and immutable hashed JavaScript.
- npm run test:swagger and existing integration/Auth/browser rehearsal suites remain applicable.

## Release gates still required

Deploy the compatible Functions change before Hosting, so Swagger initialization exists when CSP is enforced. Verify exact clean revision/version manifests for both surfaces. Exercise Google sign-in/reauthentication on the real learner/admin origins, public/private verification, authorized PDF viewing/download and Settings. Inspect console/policy violations and actual HTML/API/asset headers on both origins. Verify approved native RUM agent identity/events in the tenant separately from HTTP ingestion acceptance. Keep #14 open until those checks pass; alerts in #9 remain deferred.

Rollback uses the previous Hosting versions on both sites and prior Functions revision as a coordinated release. Do not enable unsafe-inline scripts as a diagnostic shortcut. Retain successful production security headers if reverting an unrelated visual change.

References: [Firebase Hosting headers](https://firebase.google.com/docs/hosting/full-config), [Dynatrace snippet formats and asynchronous loading tradeoffs](https://docs.dynatrace.com/docs/observe/digital-experience-classic/rum-classic/web-applications/initial-setup/snippet-formats).
