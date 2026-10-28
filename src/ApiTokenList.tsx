import Button from "./ui/Button";
import type { Token, Listing } from "./ApiTokens";
export default function ApiTokenList({
  tokens,
  permissions,
  busy,
  revoke,
  cursor,
  load,
}: {
  tokens: Token[];
  permissions: Listing["permissions"];
  busy: boolean;
  revoke: (id: string) => Promise<void>;
  cursor: string | null;
  load: (cursor?: string) => Promise<void>;
}) {
  return (
    <>
      {" "}
      <h3>Your tokens</h3>
      {!tokens.length && !busy && <p>No API tokens created yet.</p>}
      {tokens.length > 0 && (
        <div
          className="table-wrap"
          role="region"
          aria-label="Scrollable records table"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Permissions and restrictions</th>
                <th>Expiry</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>
                    {t.scopes
                      .map(
                        (scope) =>
                          permissions.find((p) => p.scope === scope)?.label ||
                          scope,
                      )
                      .join(", ")}
                    <br />
                    <small>
                      {t.studentIds.length
                        ? `Learners: ${t.studentIds.join(", ")}`
                        : "All authorized learners"}{" "}
                      ·{" "}
                      {t.workshopIds.length
                        ? `Workshops: ${t.workshopIds.join(", ")}`
                        : "All authorized workshops"}
                    </small>
                  </td>
                  <td>{new Date(t.expiresAt).toLocaleString()}</td>
                  <td>{t.status}</td>
                  <td>
                    {t.status === "active" && (
                      <Button
                        className="text-button danger"
                        disabled={busy}
                        busy={!!busy}
                        onClick={() => void revoke(t.id)}
                      >
                        Revoke {t.name}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cursor && (
        <Button
          className="button secondary"
          disabled={busy}
          busy={!!busy}
          onClick={() => void load(cursor)}
        >
          Load more tokens
        </Button>
      )}
    </>
  );
}
