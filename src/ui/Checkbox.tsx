import {
  useEffect,
  useRef,
  type InputHTMLAttributes,
  type ChangeEvent,
} from "react";
import "@material/web/checkbox/checkbox.js";
import type { MdCheckbox } from "@material/web/checkbox/checkbox.js";
export default function Checkbox({
  onChange,
  type: _type,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const ref = useRef<MdCheckbox>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Fieldset callbacks can reflect disabled on the custom element during insertion.
    // Reapply the controlled value after the parent fieldset commit.
    if (props.disabled !== undefined) el.disabled = props.disabled;
    if (!props["aria-label"])
      el.setAttribute(
        "aria-label",
        el.closest("label")?.textContent?.trim() || "Select item",
      );
    if (!onChange) return;
    const handler = (event: Event) =>
      onChange(event as unknown as ChangeEvent<HTMLInputElement>);
    el.addEventListener("change", handler);
    return () => el.removeEventListener("change", handler);
  }, [onChange, props]);
  return (
    <md-checkbox
      {...props}
      ref={ref}
      touch-target="wrapper"
      className="md-checkbox"
    />
  );
}
