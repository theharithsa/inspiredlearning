/* eslint-disable react/only-export-components -- Global settings service and host share a local-only event. */
import { useEffect, useState } from "react";
import Button from "./Button";
import Select from "./Select";
import Radio from "./Radio";
import Icon from "./Icon";
import Dialog from "./Dialog";
import { useAppearance, setAppearance, resetAppearance } from "./appearance";
import {
  FONT_CATALOG,
  PALETTES,
  type FontId,
  type Mode,
} from "./appearance-model";
import palettes from "./palettes.json";
import "@material/web/progress/circular-progress.js";
const event = "inspiredlearning:open-settings";
export function openSettings() {
  window.dispatchEvent(new Event(event));
}
export function SettingsButton() {
  return (
    <Button
      type="button"
      variant="text"
      className="settings-trigger"
      aria-haspopup="dialog"
      aria-label="Settings"
      onClick={openSettings}
    >
      <Icon name="settings" />
      Settings
    </Button>
  );
}
export default function SettingsHost() {
  const [open, setOpen] = useState(false),
    prefs = useAppearance(),
    [fontStatus, setFontStatus] = useState(
      () => document.documentElement.dataset.fontStatus,
    );
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(event, show);
    const status = () =>
      setFontStatus(document.documentElement.dataset.fontStatus);
    window.addEventListener("inspiredlearning:font-status", status);
    return () => {
      window.removeEventListener(event, show);
      window.removeEventListener("inspiredlearning:font-status", status);
    };
  }, []);
  if (!open) return null;
  const font = FONT_CATALOG.find((f) => f.id === prefs.font)!;
  return (
    <Dialog
      title="Settings"
      onClose={() => setOpen(false)}
      className="settings-dialog"
    >
      <p className="settings-intro">
        Make InspiredLearning feel right for you. Changes apply across this
        portal and are saved in this browser.
      </p>
      <div className="settings-layout">
        <div className="settings-controls">
          <section>
            <h3>Appearance</h3>
            <p className="muted">
              One Material palette, from surfaces to open menus.
            </p>
            <Select
              label="Color mode"
              value={prefs.mode}
              onChange={(e) => setAppearance({ mode: e.target.value as Mode })}
            >
              <option value="system">Use device setting</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </Select>
            <fieldset className="palette-group">
              <legend>Color palette</legend>
              <div className="palette-grid">
                {PALETTES.map((p) => {
                  const colors =
                    palettes[p.id][
                      document.documentElement.dataset.theme === "dark"
                        ? "dark"
                        : "light"
                    ];
                  return (
                    <label
                      className={`palette-choice ${prefs.palette === p.id ? "selected" : ""}`}
                      key={p.id}
                    >
                      <Radio
                        name="palette"
                        value={p.id}
                        checked={prefs.palette === p.id}
                        aria-label={p.label}
                        onChange={() => setAppearance({ palette: p.id })}
                      />
                      <span>
                        <span className="palette-swatches" aria-hidden="true">
                          {[
                            colors.primary,
                            colors.secondary,
                            colors.tertiary,
                          ].map((color, i) => (
                            <i key={i} style={{ backgroundColor: color }} />
                          ))}
                        </span>
                        <span>{p.label}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </section>
          <section>
            <h3>Typography</h3>
            <p className="muted">
              Choose a typeface for headings, navigation, forms, menus, tables
              and dialogs.
            </p>
            <Select
              label="Site font"
              value={prefs.font}
              onChange={(e) =>
                setAppearance({ font: e.target.value as FontId })
              }
              supportingText="14 fonts · Sans serif, serif and monospace"
            >
              {FONT_CATALOG.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.family} · {f.category}
                </option>
              ))}
            </Select>
            <p className="font-status" role="status">
              {fontStatus === "fallback"
                ? `Could not load ${font.family}. A system fallback is shown.`
                : fontStatus === "loading"
                  ? `Loading ${font.family}…`
                  : `${font.family} applied site-wide.`}
            </p>
          </section>
        </div>
        <aside className="settings-sample">
          <span className="eyebrow">LIVE PREVIEW</span>
          <h3>
            Your learning,
            <br />
            <em>your way.</em>
          </h3>
          <p>The quick brown fox jumps over the lazy dog.</p>
          <p className="sample-numbers">0123456789 · Aa Bb Cc</p>
          <span className="badge success">Verified participation</span>
          <div className="sample-actions">
            <Button type="button" onClick={() => setOpen(false)}>
              Looks right
            </Button>
            <Button type="button" variant="outlined" onClick={resetAppearance}>
              Reset defaults
            </Button>
          </div>
          <p className="small muted">
            Fonts load directly from InspiredLearning. Other writing systems use
            available fonts on your device.
          </p>
        </aside>
      </div>
      <footer className="dialog-actions">
        <Button type="button" variant="text" onClick={resetAppearance}>
          Reset appearance
        </Button>
        <Button type="button" onClick={() => setOpen(false)}>
          Done
        </Button>
      </footer>
    </Dialog>
  );
}
