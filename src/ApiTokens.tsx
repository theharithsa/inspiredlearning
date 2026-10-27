import { useCallback, useEffect, useRef, useState } from "react";
import { reauthenticateWithPopup } from "firebase/auth";
import { auth, google } from "./firebase";
import { errorMessage } from "./observability";
import { Message } from "./components";
type Token = {
  id: string;
  name: string;
  scopes: string[];
  studentIds: string[];
  workshopIds: string[];
  expiresAt: string;
  status: "active" | "expired" | "revoked";
};
type Listing = {
  items: Token[];
  nextCursor: string | null;
  permissions: { scope: string; label: string }[];
};
async function request<T>(path = "", options: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw Error("Sign in with Google.");
  const idToken = await user.getIdToken();
  if (auth.currentUser?.uid !== user.uid)
    throw Error("Your signed-in account changed.");
  const response = await fetch("/api/v1/admin/api-tokens" + path, {
    ...options,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok)
    throw Error(data.error?.message || "Could not manage API tokens.");
  if (auth.currentUser?.uid !== user.uid)
    throw Error("Your signed-in account changed.");
  return data as T;
}
export default function ApiTokens() {
  const [tokens, setTokens] = useState<Token[]>([]),
    [permissions, setPermissions] = useState<Listing["permissions"]>([]),
    [cursor, setCursor] = useState<string | null>(null);
  const [name, setName] = useState(""),
    [scopes, setScopes] = useState<string[]>([]),
    [days, setDays] = useState(7),
    [studentIds, setStudentIds] = useState(""),
    [workshopIds, setWorkshopIds] = useState("");
  const [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [secret, setSecret] = useState<string | null>(null);
  const mounted = useRef(false),
    creation = useRef<{ key: string; body: string } | null>(null);
  const load = useCallback(async (next?: string) => {
    const result = await request<Listing>(
      next ? `?cursor=${encodeURIComponent(next)}` : "",
    );
    if (!mounted.current) return;
    setTokens((old) => (next ? [...old, ...result.items] : result.items));
    setCursor(result.nextCursor);
    setPermissions(result.permissions);
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load()
      .catch((e) => {
        if (mounted.current) setError(errorMessage(e));
      })
      .finally(() => {
        if (mounted.current) setBusy(false);
      });
    return () => {
      mounted.current = false;
    };
  }, [load]);
  async function create() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const user = auth.currentUser;
      if (!user) throw Error("Sign in with Google.");
      await reauthenticateWithPopup(user, google);
      if (!mounted.current || auth.currentUser?.uid !== user.uid) return;
      const ids = (value: string) => value.split(/[\s,]+/).filter(Boolean);
      const body = JSON.stringify({
        name: name.trim(),
        scopes,
        expiresInDays: days,
        studentIds: ids(studentIds),
        workshopIds: ids(workshopIds),
      });
      if (creation.current?.body !== body)
        creation.current = { key: crypto.randomUUID(), body };
      const result = await request<{
        secret: string | null;
        alreadyCreated: boolean;
      }>("", {
        method: "POST",
        body,
        headers: { "Idempotency-Key": creation.current!.key },
      });
      if (!mounted.current) return;
      setSecret(result.secret);
      creation.current = null;
      setNotice(
        result.alreadyCreated
          ? "This request already created a token. Its secret cannot be recovered; revoke it and create a replacement."
          : "Token created. Copy it now; it cannot be retrieved again.",
      );
      setName("");
      await load();
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function revoke(id: string) {
    if (
      !window.confirm(
        "Revoke this API token? Integrations using it will lose access immediately.",
      )
    )
      return;
    setNotice("");
    setBusy(true);
    setError("");
    try {
      await request(`/${id}`, { method: "DELETE" });
      if (mounted.current) {
        setNotice("Token revoked. New requests will be rejected.");
        await load();
      }
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section className="panel stack" aria-labelledby="api-tokens-title">
      <span className="eyebrow">INTEGRATIONS</span>
      <h2 id="api-tokens-title">API tokens</h2>
      <p>
        Create a scoped token for Swagger or an integration. Choose the data it
        can read or correct. Your administrator access is checked on every
        request.
      </p>
      <a href="/api/docs" target="_blank" rel="noreferrer">
        Open API documentation ↗
      </a>
      {error && <Message error>{error}</Message>}
      {notice && <Message>{notice}</Message>}
      {secret && (
        <div className="notice stack" role="status">
          <p>
            Your token is ready to copy. It stays here only until you dismiss it
            or leave this page.
          </p>
          <div className="staff-actions">
            <button
              className="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(secret);
                  if (mounted.current)
                    setNotice(
                      "Token copied. Paste it into Swagger’s Authorize field or your integration.",
                    );
                } catch {
                  if (mounted.current)
                    setError(
                      "Clipboard access failed. Allow clipboard access and try again.",
                    );
                }
              }}
            >
              Copy new token
            </button>
            <button
              className="button secondary"
              onClick={() => {
                setSecret(null);
                setNotice("Token dismissed. Only its saved metadata remains.");
              }}
            >
              I saved it — dismiss
            </button>
          </div>
        </div>
      )}
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <label>
          Token name
          <input
            value={name}
            disabled={busy || !!secret}
            maxLength={80}
            required
            placeholder="Local MCP investigation"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <fieldset disabled={busy || !!secret}>
          <legend>Permissions</legend>
          <div className="token-permissions">
            {permissions.map((p) => (
              <label key={p.scope} className="token-permission">
                <input
                  type="checkbox"
                  checked={scopes.includes(p.scope)}
                  onChange={(e) =>
                    setScopes((old) =>
                      e.target.checked
                        ? [...old, p.scope]
                        : old.filter((s) => s !== p.scope),
                    )
                  }
                />
                {p.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="inline-form">
          <label>
            Expires after
            <select
              disabled={busy || !!secret}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={1}>1 day</option>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
            </select>
          </label>
          <label>
            Learner IDs (optional)
            <textarea
              value={studentIds}
              disabled={busy || !!secret}
              maxLength={6500}
              placeholder="Leave empty for learners your role permits"
              onChange={(e) => setStudentIds(e.target.value)}
            />
          </label>
          <label>
            Workshop IDs (optional)
            <textarea
              value={workshopIds}
              disabled={busy || !!secret}
              maxLength={850}
              placeholder="Leave empty for workshops your role permits"
              onChange={(e) => setWorkshopIds(e.target.value.toUpperCase())}
            />
          </label>
        </div>
        <p className="small muted">
          Separate IDs with commas or spaces. Workshop IDs limit workshop
          records; use learner IDs to restrict profile access. Writes require
          selecting an explicit write permission. Tokens cannot manage other
          tokens. Creating one opens Google to confirm your identity.
        </p>
        <button
          className="button"
          disabled={busy || !!secret || !name.trim() || !scopes.length}
        >
          {busy ? "Working…" : "Confirm Google sign-in and create token"}
        </button>
      </form>
      <h3>Your tokens</h3>
      {!tokens.length && !busy && <p>No API tokens created yet.</p>}
      {tokens.length > 0 && (
        <div className="table-wrap">
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
                      <button
                        className="text-button danger"
                        disabled={busy}
                        onClick={() => void revoke(t.id)}
                      >
                        Revoke {t.name}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cursor && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await load(cursor);
            } catch (e) {
              if (mounted.current) setError(errorMessage(e));
            } finally {
              if (mounted.current) setBusy(false);
            }
          }}
        >
          Load more tokens
        </button>
      )}
    </section>
  );
}
