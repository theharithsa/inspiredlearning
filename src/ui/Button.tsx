import {
  Children,
  createElement,
  isValidElement,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import "@material/web/button/filled-button.js";
import "@material/web/button/filled-tonal-button.js";
import "@material/web/button/outlined-button.js";
import "@material/web/button/text-button.js";
import "@material/web/iconbutton/icon-button.js";
import "@material/web/progress/circular-progress.js";
import Icon from "./Icon";
type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  href?: string;
  target?: string;
  download?: string;
  variant?: "filled" | "tonal" | "outlined" | "text" | "icon";
  children?: ReactNode;
  busy?: boolean;
};
/** One adapter owns Material buttons and preserves native form submission. */
export default function Button({
  className = "",
  variant,
  children,
  autoFocus,
  busy,
  ...props
}: Props) {
  const kind =
    variant ||
    (className.includes("icon-button")
      ? "icon"
      : className.includes("text-button")
        ? "text"
        : className.includes("secondary")
          ? "outlined"
          : /tonal|light/.test(className)
            ? "tonal"
            : "filled");
  const tag =
    kind === "icon"
      ? "md-icon-button"
      : kind === "tonal"
        ? "md-filled-tonal-button"
        : `md-${kind}-button`;
  const nodes = Children.toArray(children),
    icon = nodes.find((n) => isValidElement(n) && n.type === Icon);
  const classes = className
    .split(" ")
    .filter(
      (c) =>
        ![
          "button",
          "text-button",
          "icon-button",
          "secondary",
          "tonal",
          "light",
        ].includes(c),
    )
    .join(" ");
  const aria = Object.fromEntries(
    Object.entries(props)
      .filter(
        ([key, value]) => key.startsWith("aria-") && typeof value === "boolean",
      )
      .map(([key, value]) => [key, String(value)]),
  );
  return createElement(
    tag,
    {
      ...props,
      ...aria,
      disabled: props.disabled || busy,
      "aria-busy": busy ? "true" : undefined,
      className: `md-button ${classes}`,
      autofocus: autoFocus ? "" : undefined,
      ...(kind === "icon" ? {} : { hasIcon: !!icon || !!busy }),
    },
    kind === "icon"
      ? children
      : [
          busy ? (
            createElement("md-circular-progress", {
              key: "busy",
              slot: "icon",
              indeterminate: true,
              "aria-hidden": "true",
              className: "button-progress",
            })
          ) : icon ? (
            <span key="icon" slot="icon">
              {icon}
            </span>
          ) : null,
          ...nodes.filter((n) => n !== icon),
        ],
  );
}
