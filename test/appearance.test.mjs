import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  FONT_CATALOG,
  PALETTES,
  DEFAULT_PREFERENCES,
  validatePreferences,
  familyStack,
} from "../src/ui/appearance-model.ts";
import {
  dateOnly,
  calendarDate,
  dateString,
} from "../src/ui/calendar-model.ts";
test("appearance accepts only exact catalog values and keeps local data out of style inputs", () => {
  assert.deepEqual(
    validatePreferences({
      mode: "dark",
      palette: "blue",
      font: "lato",
      uid: "private",
      url: "https://untrusted.invalid",
    }),
    { mode: "dark", palette: "blue", font: "lato" },
  );
  for (const value of [
    null,
    [],
    false,
    { mode: ["dark"], palette: ["blue"], font: "url(https://invalid)" },
    { mode: "DARK", palette: "unknown", font: "unknown" },
  ])
    assert.deepEqual(validatePreferences(value), DEFAULT_PREFERENCES);
  assert.ok(FONT_CATALOG.length >= 10);
  assert.equal(
    new Set(FONT_CATALOG.map((f) => f.id)).size,
    FONT_CATALOG.length,
  );
  assert.deepEqual(
    new Set(FONT_CATALOG.map((f) => f.category)),
    new Set(["Sans serif", "Serif", "Monospace"]),
  );
  assert.ok(FONT_CATALOG.some((f) => f.family === "Google Sans"));
  assert.ok(FONT_CATALOG.some((f) => f.family === "Lato"));
  for (const font of FONT_CATALOG)
    assert.ok(familyStack(font.id).startsWith('"' + font.family + '"'));
});
test("every offered font has real unmodified assets and a committed license", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../public/fonts/manifest.json", import.meta.url)),
  );
  assert.deepEqual(
    manifest.map((f) => f.id),
    FONT_CATALOG.map((f) => f.id),
  );
  for (const font of manifest) {
    assert.ok(
      existsSync(new URL("../public/fonts/" + font.license, import.meta.url)),
    );
    assert.match(
      readFileSync(
        new URL("../public/fonts/" + font.license, import.meta.url),
        "utf8",
      ),
      /SIL OPEN FONT LICENSE/i,
    );
    assert.ok(font.assets.length);
    for (const asset of font.assets) {
      const bytes = readFileSync(
        new URL("../public/fonts/" + asset.file, import.meta.url),
      );
      assert.equal(bytes.subarray(0, 4).toString(), "wOF2");
      assert.equal(bytes.length, asset.bytes);
      assert.equal(
        createHash("sha256").update(bytes).digest("hex"),
        asset.sha256,
      );
    }
  }
});
test("all Material palettes preserve normal text and outline contrast in both modes", () => {
  const colors = JSON.parse(
    readFileSync(new URL("../src/ui/palettes.json", import.meta.url)),
  );
  const lum = (hex) => {
    const nums = hex
      .slice(1)
      .match(/../g)
      .map((v) => parseInt(v, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return nums[0] * 0.2126 + nums[1] * 0.7152 + nums[2] * 0.0722;
  };
  const contrast = (a, b) =>
    (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  for (const palette of PALETTES)
    for (const mode of ["light", "dark"]) {
      const c = colors[palette.id][mode];
      for (const [fg, bg] of [
        ["onSurface", "surface"],
        ["onSurfaceVariant", "surface"],
        ["onPrimary", "primary"],
        ["onPrimaryContainer", "primaryContainer"],
        ["onSecondaryContainer", "secondaryContainer"],
        ["onErrorContainer", "errorContainer"],
      ])
        assert.ok(contrast(c[fg], c[bg]) >= 4.5, `${palette.id}/${mode}/${fg}`);
      assert.ok(contrast(c.outline, c.surface) >= 3);
    }
});
test("calendar keeps date-only values exact and rejects rollover, invalid and coercible input", () => {
  for (const value of ["2026-10-29", "2024-02-29", "0001-01-01", "9999-12-31"])
    assert.equal(dateString(dateOnly(value)), value);
  for (const value of [
    "2026-02-29",
    "2026-04-31",
    "2026-99-99",
    "0000-01-01",
    "2026-1-1",
    [],
    null,
  ])
    assert.equal(dateOnly(value), null);
  assert.equal(dateString(calendarDate(1, 0, 1)), "0001-01-01");
  assert.equal(dateString(calendarDate(2026, 12, 1)), "2027-01-01");
  assert.equal(calendarDate(2024, 2, 0).getUTCDate(), 29);
});

test("app screens use the owned Material adapters instead of raw native controls", () => {
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((item) =>
      item.isDirectory()
        ? walk(new URL(item.name + "/", dir))
        : [new URL(item.name, dir)],
    );
  for (const file of walk(new URL("../src/", import.meta.url)).filter((file) =>
    file.pathname.endsWith(".tsx"),
  ))
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /<(?:button|input|select|textarea|details|summary)\b/,
      file.pathname,
    );
});
