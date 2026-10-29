import { useEffect, useRef, type ReactNode } from "react";
import type { MdListItem } from "@material/web/list/list-item.js";
import "@material/web/list/list-item.js";
import Icon, { type IconName } from "./Icon";

/** Material list actions share the navigation row's icon and label alignment. */
export default function SidebarAction({
  icon,
  children,
  onClick,
  label,
  dialog = false,
}: {
  icon: IconName;
  children: ReactNode;
  onClick: () => void;
  label: string;
  dialog?: boolean;
}) {
  const ref = useRef<MdListItem>(null);
  useEffect(() => {
    const el = ref.current;
    let active = true;
    // Material Web 2.5 renders a native button with a listitem role (upstream
    // TODO b/265339866). Standalone navigation actions need button semantics.
    void el?.updateComplete.then(() => {
      const button = el.shadowRoot?.querySelector("button");
      if (!active || !button) return;
      button.setAttribute("role", "button");
      button.setAttribute("aria-label", label);
    });
    return () => {
      active = false;
    };
  }, [label]);
  return (
    <md-list-item
      ref={ref}
      type="button"
      className="sidebar-action"
      aria-label={label}
      aria-haspopup={dialog ? "dialog" : undefined}
      onClick={onClick}
    >
      <span slot="start">
        <Icon name={icon} />
      </span>
      <span slot="headline" className="sidebar-action-label">
        {children}
      </span>
    </md-list-item>
  );
}
