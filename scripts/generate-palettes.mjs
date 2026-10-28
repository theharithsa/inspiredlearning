// Bundle Google's utility first: its published 0.4.0 graph has extensionless ESM imports.
import { rolldown } from "rolldown";
const bundle = await rolldown({
  input: "scripts/palette-source.mjs",
  platform: "node",
});
try {
  const { output } = await bundle.generate({ format: "esm" });
  await import(
    "data:text/javascript;base64," +
      Buffer.from(output[0].code).toString("base64")
  );
} finally {
  await bundle.close();
}
