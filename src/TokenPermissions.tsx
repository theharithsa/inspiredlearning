export default function TokenPermissions({
  permissions,
  scopes,
  disabled,
  onChange,
}: {
  permissions: { scope: string; label: string }[];
  scopes: string[];
  disabled: boolean;
  onChange: (scope: string, checked: boolean) => void;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend>Permissions</legend>
      <div className="token-permissions">
        {permissions.map((p) => (
          <label key={p.scope} className="token-permission">
            <input
              type="checkbox"
              checked={scopes.includes(p.scope)}
              onChange={(e) => onChange(p.scope, e.target.checked)}
            />
            {p.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
