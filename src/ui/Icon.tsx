// Unmodified Google Material Symbols Rounded paths; Apache-2.0 license in public/licenses.
import symbols from "./material-symbols.json";
export type IconName = keyof typeof symbols;
export default function Icon({ name }: { name: IconName }) {
  const icon = symbols[name];
  return (
    <svg
      className="icon"
      viewBox={icon.viewBox}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {icon.paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
