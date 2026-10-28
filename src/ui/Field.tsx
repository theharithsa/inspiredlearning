import {
  useEffect,
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
  type InputHTMLAttributes,
} from "react";
import "@material/web/textfield/outlined-text-field.js";
import type { MdOutlinedTextField } from "@material/web/textfield/outlined-text-field.js";
export type FieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "size"
> & {
  label: string;
  multiline?: boolean;
  rows?: number;
  supportingText?: string;
  error?: boolean;
  errorText?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
};
export default function Field({
  label,
  multiline,
  onChange,
  onKeyDown,
  className = "",
  ...props
}: FieldProps) {
  const ref = useRef<MdOutlinedTextField>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !onChange) return;
    const handler = (event: Event) =>
      onChange(event as unknown as ChangeEvent<HTMLInputElement>);
    el.addEventListener("input", handler);
    return () => el.removeEventListener("input", handler);
  }, [onChange]);
  useEffect(() => {
    ref.current?.setCustomValidity(
      props.error ? props.errorText || "Check this value." : "",
    );
  }, [props.error, props.errorText]);
  return (
    <md-outlined-text-field
      {...props}
      type={multiline ? "textarea" : props.type || "text"}
      label={label}
      ref={ref}
      className={`md-field ${className}`}
      aria-label={props["aria-label"]}
      onKeyDown={(event) => {
        onKeyDown?.(event as unknown as KeyboardEvent<HTMLInputElement>);
        if (
          event.defaultPrevented ||
          multiline ||
          event.key !== "Enter" ||
          event.nativeEvent.isComposing ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey
        )
          return;
        const form = ref.current?.form;
        if (!form) return;
        const submitter = Array.from(
          form.querySelectorAll<
            HTMLElement & { type?: string; disabled?: boolean }
          >(
            "md-filled-button,md-outlined-button,md-text-button,md-filled-tonal-button,button",
          ),
        ).find((node) => node.type === "submit" && !node.disabled);
        if (submitter) {
          event.preventDefault();
          form.requestSubmit();
        }
      }}
    />
  );
}
