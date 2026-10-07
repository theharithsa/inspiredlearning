# Private project handover

Workspace: InspiredLearning alongside `chaicart-live` and `workshop-reference`. Private repository: https://github.com/theharithsa/inspiredlearning. Firebase project: chaicloud-workshop; Hosting site: inspiredlearning-vh; Functions codebase: inspiredlearning; region: asia-south1. Domain inspi.in is managed in GoDaddy.

Do not migrate Authentication or duplicate accounts: the portal uses Live Google UIDs. Do not infer completion from Live's old certificate announcement. Staff verifies attendance and publishes immutable results; 100 learning points are separate from team scores. Shared security rules/indexes are deployed only by chaicart-live. Preserve the session deletion guard and archived session-code reservation.

Credentials reside in existing Firebase Secret Manager, never in this document. Read README, RUNBOOK and OBSERVABILITY before maintenance. Run both repositories' tests for changes touching shared collections or workshop completion. Keep production and demo-chaicart fixtures separate.

Initial deployment evidence and DNS state are recorded in the task delivery and repository history. The stable Firebase URL is the certificate verification origin. Custom-domain DNS propagation must not block workshop access through Firebase.

Release verification and pending GoDaddy records: [RELEASE-CHECKS.md](RELEASE-CHECKS.md). Core portal deployment is complete; custom-domain mapping awaits owner sign-in. PDFs are generated on demand from versioned certificate records rather than stored as permanent downloadable objects.
