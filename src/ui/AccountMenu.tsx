import { useReducedMotion } from "./motion";
import { useEffect, useId, useRef, useState } from "react";
import "@material/web/menu/menu.js";
import "@material/web/menu/menu-item.js";
import "@material/web/iconbutton/icon-button.js";
import type { MdMenu } from "@material/web/menu/menu.js";
import Icon from "./Icon";
import { openSettings } from "./Settings";
interface Item {
  label: string;
  href: string;
}
export default function AccountMenu({
  email,
  items,
  onSignOut,
}: {
  email?: string | null;
  items: Item[];
  onSignOut: () => void;
}) {
  const quick = useReducedMotion();
  const id = "account-" + useId().replace(/[^a-z0-9]/gi, ""),
    ref = useRef<MdMenu>(null),
    [open, setOpen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const closed = () => setOpen(false);
    el.addEventListener("closed", closed);
    return () => el.removeEventListener("closed", closed);
  }, []);
  function settings() {
    const el = ref.current;
    if (el) {
      if (el.open) {
        el.addEventListener("closed", openSettings, { once: true });
        el.close();
      } else openSettings();
    }
  }
  return (
    <div className="account-menu">
      <md-icon-button
        id={id}
        aria-label="Account and more options"
        aria-haspopup="menu"
        aria-expanded={open ? "true" : "false"}
        onClick={() => setOpen(!open)}
      >
        <Icon name="more" />
      </md-icon-button>
      <md-menu
        quick={quick}
        ref={ref}
        id={id + "-menu"}
        anchor={id}
        open={open}
        positioning="fixed"
        anchorCorner="end-end"
        menuCorner="start-end"
        aria-label="Account menu"
      >
        <div className="menu-account">{email}</div>
        {items.map((item) => (
          <md-menu-item key={item.label} href={item.href}>
            <span slot="headline">{item.label}</span>
          </md-menu-item>
        ))}
        <hr className="md-divider" />
        <md-menu-item onClick={settings}>
          <span slot="start">
            <Icon name="settings" />
          </span>
          <span slot="headline">Settings</span>
        </md-menu-item>
        <md-menu-item onClick={onSignOut}>
          <span slot="start">
            <Icon name="logout" />
          </span>
          <span slot="headline">Sign out</span>
        </md-menu-item>
      </md-menu>
    </div>
  );
}
