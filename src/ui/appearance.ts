import { useSyncExternalStore } from "react";
import {
  DEFAULT_PREFERENCES,
  FONT_CATALOG,
  familyStack,
  validatePreferences,
  type Preferences,
} from "./appearance-model";
const key = "inspiredlearning-appearance",
  event = "inspiredlearning:appearance-change";
function read() {
  try {
    const saved = localStorage.getItem(key);
    if (saved) return validatePreferences(JSON.parse(saved));
    return validatePreferences({
      mode: localStorage.getItem("inspiredlearning-theme"),
    });
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}
let state = read(),
  installed = false;
const listeners = new Set<() => void>();
let fontGeneration = 0;
export function applyAppearance() {
  const root = document.documentElement,
    dark =
      state.mode === "dark" ||
      (state.mode === "system" &&
        matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.add("theme-changing");
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.palette = state.palette;
  root.dataset.font = state.font;
  root.style.setProperty("--app-font-family", familyStack(state.font));
  const font = FONT_CATALOG.find((f) => f.id === state.font)!;
  root.dataset.fontCategory = font.category;
  const generation = ++fontGeneration;
  root.dataset.fontStatus = "loading";
  window.dispatchEvent(new Event("inspiredlearning:font-status"));
  void document.fonts
    .load(`400 16px "${font.family}"`)
    .then((faces) => {
      if (generation === fontGeneration) {
        root.dataset.fontStatus = faces.length ? "ready" : "fallback";
        window.dispatchEvent(new Event("inspiredlearning:font-status"));
      }
    })
    .catch(() => {
      if (generation === fontGeneration) {
        root.dataset.fontStatus = "fallback";
        window.dispatchEvent(new Event("inspiredlearning:font-status"));
      }
    });
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta)
    meta.setAttribute(
      "content",
      getComputedStyle(root).getPropertyValue("--md-sys-color-surface").trim(),
    );
  requestAnimationFrame(() =>
    requestAnimationFrame(() => root.classList.remove("theme-changing")),
  );
  if (!installed) {
    installed = true;
    matchMedia("(prefers-color-scheme: dark)").addEventListener(
      "change",
      applyAppearance,
    );
    window.addEventListener("storage", (e) => {
      if (
        e.key === key ||
        e.key === "inspiredlearning-theme" ||
        e.key === null
      ) {
        state = read();
        applyAppearance();
        listeners.forEach((fn) => fn());
      }
    });
  }
}
export function setAppearance(patch: Partial<Preferences>) {
  state = validatePreferences({ ...state, ...patch });
  try {
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem("inspiredlearning-theme", state.mode);
  } catch {
    /* Apply in memory when browser storage is unavailable. */
  }
  applyAppearance();
  listeners.forEach((fn) => fn());
  window.dispatchEvent(new Event(event));
}
export function resetAppearance() {
  setAppearance({ ...DEFAULT_PREFERENCES });
}
export function useAppearance() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => state,
  );
}
