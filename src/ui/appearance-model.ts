export const FONT_CATALOG = [
  { id: "roboto", family: "Roboto", category: "Sans serif" },
  { id: "google-sans", family: "Google Sans", category: "Sans serif" },
  { id: "lato", family: "Lato", category: "Sans serif" },
  { id: "inter", family: "Inter", category: "Sans serif" },
  { id: "open-sans", family: "Open Sans", category: "Sans serif" },
  { id: "source-sans-3", family: "Source Sans 3", category: "Sans serif" },
  { id: "noto-sans", family: "Noto Sans", category: "Sans serif" },
  { id: "merriweather", family: "Merriweather", category: "Serif" },
  { id: "source-serif-4", family: "Source Serif 4", category: "Serif" },
  { id: "lora", family: "Lora", category: "Serif" },
  { id: "roboto-mono", family: "Roboto Mono", category: "Monospace" },
  { id: "ibm-plex-mono", family: "IBM Plex Mono", category: "Monospace" },
  { id: "jetbrains-mono", family: "JetBrains Mono", category: "Monospace" },
  { id: "google-sans-code", family: "Google Sans Code", category: "Monospace" },
] as const;
export const PALETTES = [
  { id: "violet", label: "Material violet" },
  { id: "green", label: "InspiredLearning green" },
  { id: "blue", label: "Material blue" },
  { id: "rose", label: "Rose" },
  { id: "teal", label: "Teal" },
  { id: "neutral", label: "Neutral" },
] as const;
export type FontId = (typeof FONT_CATALOG)[number]["id"];
export type PaletteId = (typeof PALETTES)[number]["id"];
export type Mode = "system" | "light" | "dark";
export interface Preferences {
  mode: Mode;
  palette: PaletteId;
  font: FontId;
}
export const DEFAULT_PREFERENCES: Preferences = {
  mode: "system",
  palette: "violet",
  font: "roboto",
};
/** Allowlist local preferences; no arbitrary font URL, CSS or account data. */
export function validatePreferences(value: unknown): Preferences {
  const item =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    mode:
      typeof item.mode === "string" &&
      ["system", "light", "dark"].includes(item.mode)
        ? (item.mode as Mode)
        : "system",
    palette: PALETTES.some((p) => p.id === item.palette)
      ? (item.palette as PaletteId)
      : "violet",
    font: FONT_CATALOG.some((f) => f.id === item.font)
      ? (item.font as FontId)
      : "roboto",
  };
}
export function familyStack(id: FontId) {
  const font = FONT_CATALOG.find((f) => f.id === id) || FONT_CATALOG[0];
  return `"${font.family}", ${font.category === "Monospace" ? "ui-monospace, monospace" : font.category === "Serif" ? "Georgia, serif" : "system-ui, sans-serif"}`;
}
