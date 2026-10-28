/* eslint-disable react/only-export-components -- Theme initialization runs before the app renders. */
import { useEffect, useState } from "react";
type Theme = "system" | "light" | "dark";
const key = "inspiredlearning-theme";
function preference(): Theme {
  try {
    const t = localStorage.getItem(key);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}
function resolveTheme(t: Theme) {
  const value =
    t === "system"
      ? matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : t;
  const root = document.documentElement;
  if (root.dataset.theme === value) return;
  root.classList.add("theme-changing");
  root.dataset.theme = value;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => root.classList.remove("theme-changing")),
  );
}
export function applyTheme() {
  resolveTheme(preference());
}
export default function Theme() {
  const [value, setValue] = useState<Theme>(preference);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)"),
      update = () => {
        setValue(preference());
        applyTheme();
      };
    applyTheme();
    media.addEventListener("change", update);
    window.addEventListener("storage", update);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return (
    <label className="theme-control">
      <span>Appearance</span>
      <select
        aria-label="Appearance"
        value={value}
        onChange={(e) => {
          const t = e.target.value as Theme;
          try {
            localStorage.setItem(key, t);
          } catch {}
          setValue(t);
          resolveTheme(t);
        }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
