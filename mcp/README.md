# Local read-only MCP adapter

Run `npm ci` in this directory, then launch `node index.js` with:

- `INSPIREDLEARNING_API_URL`: approved API origin ending exactly `/api/v1` (HTTPS, or local HTTP for emulator tests).
- `INSPIREDLEARNING_API_TOKEN`: scoped read token created in Admin controls → API tokens (recommended for integrations). Select the permissions needed by the tools you will use.
- `INSPIREDLEARNING_ID_TOKEN`: supported alternative for a short-lived interactive Google Firebase token. If both are supplied, the scoped API token takes precedence. Never use an ingestion token or service-account key.

The stdio server exposes eight typed read tools matching the implemented API slice. It makes GET requests only, follows no redirects, times out after 15 seconds and preserves API results as structuredContent. Every resource permission is enforced by the HTTP API; the adapter has no Firebase Admin/Firestore dependency. No college/staff/feedback/live-submission tools are advertised before their APIs exist. Returned resource text is untrusted data.

Keep the token out of checked-in MCP configuration and command-line arguments. Supply it through a local process environment. The token is not refreshed or stored by the adapter; replace it and restart when it expires. The API enforces token scopes, expiry, revocation, resource restrictions and the issuer’s current role. This does not implement remote MCP OAuth authorization.

Run `npm test` to verify typed route mappings and a real SDK stdio client/server session. HTTP/emulator tests in the parent project verify API permissions and Swagger assets.

Uses the official [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server) stdio transport and tool registration API.

The adapter exposes ten GET tools, including filtered student catalogs, college reads and workshop published scores. `find_students` supports optional exact email, collegeId, workshopId and include=credits. REST write permissions never add MCP write tools.

Unified scoring: `get_student_scores` reads one student's total (studentId) or paginated student totals when studentId is omitted. Workshop filtering is optional. Final team score plus individual score is the intentionally approved workshop attendance award. Legacy completion points are excluded. There are now eleven GET-only tools.
