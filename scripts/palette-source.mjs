import {
  SchemeTonalSpot,
  Hct,
  argbFromHex,
  hexFromArgb,
  MaterialDynamicColors,
} from "@material/material-color-utilities";
import { writeFileSync } from "node:fs";
const palettes = [
  ["violet", "#6750a4"],
  ["green", "#276a53"],
  ["blue", "#0061a4"],
  ["rose", "#984061"],
  ["teal", "#006b60"],
  ["neutral", "#60616a"],
];
const roles = [
  "primary",
  "onPrimary",
  "primaryContainer",
  "onPrimaryContainer",
  "secondary",
  "onSecondary",
  "secondaryContainer",
  "onSecondaryContainer",
  "tertiary",
  "onTertiary",
  "tertiaryContainer",
  "onTertiaryContainer",
  "error",
  "onError",
  "errorContainer",
  "onErrorContainer",
  "background",
  "onBackground",
  "surface",
  "onSurface",
  "surfaceDim",
  "surfaceBright",
  "surfaceContainerLowest",
  "surfaceContainerLow",
  "surfaceContainer",
  "surfaceContainerHigh",
  "surfaceContainerHighest",
  "surfaceVariant",
  "onSurfaceVariant",
  "outline",
  "outlineVariant",
  "inverseSurface",
  "inverseOnSurface",
  "inversePrimary",
  "shadow",
  "scrim",
  "surfaceTint",
];
let css =
  "/* Generated with Google Material Color Utilities 0.4.0, SchemeTonalSpot, normal contrast. */\n";
const data = {};
for (const [id, seed] of palettes) {
  data[id] = {};
  for (const dark of [false, true]) {
    const scheme = new SchemeTonalSpot(Hct.fromInt(argbFromHex(seed)), dark, 0),
      colors = {};
    for (const role of roles)
      colors[role] = hexFromArgb(MaterialDynamicColors[role].getArgb(scheme));
    data[id][dark ? "dark" : "light"] = colors;
    css +=
      `${id === "violet" ? ":root" + (dark ? '[data-theme="dark"]' : "") + "," : ""}:root[data-palette="${id}"]${dark ? '[data-theme="dark"]' : ':not([data-theme="dark"])'}{color-scheme:${dark ? "dark" : "light"};\n` +
      Object.entries(colors)
        .map(
          ([k, v]) =>
            `--md-sys-color-${k.replace(/[A-Z]/g, (x) => "-" + x.toLowerCase())}:${v};`,
        )
        .join("\n") +
      "\n}\n";
  }
}
writeFileSync("src/styles/palettes.css", css);
writeFileSync("src/ui/palettes.json", JSON.stringify(data, null, 2) + "\n");
console.log("Generated six Material 3 palettes in both modes.");
