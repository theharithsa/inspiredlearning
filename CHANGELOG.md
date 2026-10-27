# Changelog

## 1.0.1 — maintenance candidate

- Fix telemetry context, caller rejection classification, route/resource metadata, bounded flush and outbox retry/recovery behavior.
- Complete atomic certificate lifecycle event coverage and remove unknown-credit sentinels.
- Keep Firestore learner/staff data in memory and clear the app-specific legacy cache before rendering.
- Fix requests paging, form/error recovery, selection, credit refetching, route accessibility and certificate sharing.
- Harden CI/runtime coverage and non-breaking Hosting headers; keep CSP report-only.

This is a source maintenance release candidate, not production release evidence. Full issue dispositions and limitations: docs/ISSUE-TRIAGE-2026-10-27.md. Material 3 redesign remains v2.0.0 in issue #34.
