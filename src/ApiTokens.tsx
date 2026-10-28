import Button from "./ui/Button";
import Field from "./ui/Field";
import Select from "./ui/Select";
import { confirmAction } from "./ui/Confirm";
import ApiTokenList from "./ApiTokenList";
import TokenPermissions from "./TokenPermissions";
import { apiFetch } from "./api";
import { useCallback, useEffect, useRef, useState } from "react";
import { reauthenticateWithPopup } from "firebase/auth";
import { auth, google } from "./firebase";
import { errorMessage } from "./observability";
import { Message } from "./components";
export type Token = {
  id: string;
  name: string;
  scopes: string[];
  studentIds: string[];
  workshopIds: string[];
  expiresAt: string;
  status: "active" | "expired" | "revoked";
};
export type Listing = {
  items: Token[];
  nextCursor: string | null;
  permissions: { scope: string; label: string }[];
};
const request = <T,>(path = "", options: RequestInit = {}) =>
  apiFetch<T>(
    "/api/v1/admin/api-tokens" + path,
    options,
    "Could not manage API tokens.",
  );
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
      !(await confirmAction(
        "Revoke this API token? Integrations using it will lose access immediately.",
      ))
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
            <Button
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
            </Button>
            <Button
              className="button secondary"
              onClick={async () => {
                setSecret(null);
                setNotice("Token dismissed. Only its saved metadata remains.");
              }}
            >
              I saved it — dismiss
            </Button>
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
        <Field
          label="Token name"
          value={name}
          disabled={busy || !!secret}
          maxLength={80}
          required
          placeholder="Local MCP investigation"
          onChange={(e) => setName(e.target.value)}
        />
        <TokenPermissions
          permissions={permissions}
          scopes={scopes}
          disabled={busy || !!secret}
          onChange={(scope, checked) =>
            setScopes((old) =>
              checked ? [...old, scope] : old.filter((s) => s !== scope),
            )
          }
        />
        <div className="inline-form">
          <Select
            label="Expires after"
            disabled={busy || !!secret}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={1}>1 day</option>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
          </Select>
          <Field
            multiline
            label="Learner IDs (optional)"
            value={studentIds}
            disabled={busy || !!secret}
            maxLength={6500}
            placeholder="Leave empty for learners your role permits"
            onChange={(e) => setStudentIds(e.target.value)}
          />
          <Field
            multiline
            label="Workshop IDs (optional)"
            value={workshopIds}
            disabled={busy || !!secret}
            maxLength={850}
            placeholder="Leave empty for workshops your role permits"
            onChange={(e) => setWorkshopIds(e.target.value.toUpperCase())}
          />
        </div>
        <p className="small muted">
          Separate IDs with commas or spaces. Workshop IDs limit workshop
          records; use learner IDs to restrict profile access. Writes require
          selecting an explicit write permission. Tokens cannot manage other
          tokens. Creating one opens Google to confirm your identity.
        </p>
        <Button
          className="button"
          disabled={busy || !!secret || !name.trim() || !scopes.length}
          busy={!!busy}
        >
          {busy ? "Working…" : "Confirm Google sign-in and create token"}
        </Button>
      </form>
      <ApiTokenList
        tokens={tokens}
        permissions={permissions}
        busy={!!busy}
        revoke={revoke}
        cursor={cursor}
        load={async (cursor) => {
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
      />
    </section>
  );
}
