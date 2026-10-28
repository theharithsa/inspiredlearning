import { useReducedMotion } from "./motion";
import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  type ChangeEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type CSSProperties,
} from "react";
import "@material/web/select/outlined-select.js";
import "@material/web/select/select-option.js";
import type { MdOutlinedSelect } from "@material/web/select/outlined-select.js";
type Props = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "onChange" | "multiple" | "size"
> & {
  label: string;
  supportingText?: string;
  error?: boolean;
  errorText?: string;
  children: ReactNode;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
};
/** Material exposed dropdown: its popup, keyboard/typeahead and options share the theme. */
export default function Select({
  children,
  label,
  onChange,
  value,
  className = "",
  ...props
}: Props) {
  const quick = useReducedMotion();
  const ref = useRef<MdOutlinedSelect>(null),
    callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  }, [onChange]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const changed = (event: Event) =>
      callback.current?.(event as unknown as ChangeEvent<HTMLSelectElement>);
    const states = ["opening", "opened", "closing", "closed"] as const;
    const listeners = states.map((state) => {
      const fn = () => {
        el.dataset.menuState = state;
      };
      el.addEventListener(state, fn);
      return [state, fn] as const;
    });
    el.dataset.menuState = "closed";
    el.addEventListener("change", changed);
    return () => {
      el.removeEventListener("change", changed);
      listeners.forEach(([state, fn]) => el.removeEventListener(state, fn));
    };
  }, []);
  useEffect(() => {
    let active = true;
    const el = ref.current;
    if (el)
      void el.updateComplete.then(() => {
        const menu = el.shadowRoot?.querySelector<
          HTMLElement & { quick: boolean }
        >("md-menu");
        if (active && menu) menu.quick = quick;
      });
    return () => {
      active = false;
    };
  }, [quick]);
  return (
    <md-outlined-select
      {...props}
      ref={ref}
      label={label}
      data-field-label={label}
      value={String(value ?? "")}
      className={`md-field md-select ${className}`}
      aria-label={props["aria-label"] || label}
      menuPositioning="fixed"
    >
      {Children.map(children, (child) => {
        if (
          !isValidElement<{
            value?: string | number;
            disabled?: boolean;
            children: ReactNode;
            style?: CSSProperties;
          }>(child)
        )
          return null;
        const option = child.props;
        return (
          <md-select-option
            data-value={String(option.value ?? "")}
            value={String(option.value ?? "")}
            disabled={!!option.disabled}
            style={option.style}
          >
            <span slot="headline">{option.children}</span>
          </md-select-option>
        );
      })}
    </md-outlined-select>
  );
}
