// Test fixture, excluded from production entrypoints. No Firebase, roles or domain mocks.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import Field from "../src/ui/Field";
import Select from "../src/ui/Select";
import Button from "../src/ui/Button";
import Checkbox from "../src/ui/Checkbox";
import DateField from "../src/ui/DateField";
import SettingsHost, { SettingsButton } from "../src/ui/Settings";
import { applyAppearance } from "../src/ui/appearance";
import "../src/styles.css";
if (!import.meta.env.DEV || import.meta.env.VITE_USE_EMULATORS !== "true")
  throw Error("Local test fixture only");
applyAppearance();
export default function Fixture() {
  const [name, setName] = useState(""),
    [choice, setChoice] = useState("first"),
    [checked, setChecked] = useState(false),
    [date, setDate] = useState("2026-10-08"),
    [count, setCount] = useState(0);
  return (
    <main className="public-page">
      <header className="public-header">
        <h1>Material controls</h1>
        <SettingsButton />
      </header>
      <SettingsHost />
      <form
        className="panel stack"
        onSubmit={(event) => {
          event.preventDefault();
          setCount((n) => n + 1);
        }}
      >
        <Field
          label="Your name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Field
          label="Read-only account"
          value="demo@example.invalid"
          readOnly
        />
        <Select
          label="Workshop format"
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
        >
          <option value="first">On campus</option>
          <option value="disabled" disabled>
            Unavailable option
          </option>
          <option value="remote">Remote workshop</option>
        </Select>
        <label className="token-permission">
          <Checkbox
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            aria-label="Include practice exercises"
          />
          Include practice exercises
        </label>
        <DateField
          label="Workshop date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <div className="staff-actions">
          <Button>Save example</Button>
          <Button type="button" variant="outlined" disabled>
            Disabled action
          </Button>
        </div>
        <output role="status">Submitted {count} times</output>
      </form>
    </main>
  );
}
createRoot(document.getElementById("fixture")!).render(<Fixture />);
