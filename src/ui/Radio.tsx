import {
  useEffect,
  useRef,
  type InputHTMLAttributes,
  type ChangeEvent,
} from "react";
import "@material/web/radio/radio.js";
import type { MdRadio } from "@material/web/radio/radio.js";
export default function Radio({
  onChange,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const ref = useRef<MdRadio>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !onChange) return;
    const handler = (event: Event) =>
      onChange(event as unknown as ChangeEvent<HTMLInputElement>);
    el.addEventListener("change", handler);
    return () => el.removeEventListener("change", handler);
  }, [onChange]);
  return (
    <md-radio
      {...props}
      role="radio"
      aria-checked={props.checked ? "true" : "false"}
      ref={ref}
      touch-target="wrapper"
    />
  );
}
