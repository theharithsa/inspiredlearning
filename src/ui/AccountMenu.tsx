import { useReducedMotion } from "./motion";
import { usePressMotion } from "./expressive-motion";
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
  name,
  photoURL,
  items,
  onSignOut,
}: {
  email?: string | null;
  name: string;
  photoURL?: string | null;
  items: Item[];
  onSignOut: () => void;
}) {
  const quick = useReducedMotion();
  const triggerRef = usePressMotion();
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const showPhoto = !!photoURL && failedPhoto !== photoURL;
  const id = "account-" + useId().replace(/[^a-z0-9]/gi, ""),
    ref = useRef<MdMenu>(null),
    [open, setOpen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.dataset.menuState = "closed";
    const opened = () => {
      el.dataset.menuState = "opened";
    };
    const closed = () => {
      el.dataset.menuState = "closed";
      setOpen(false);
    };
    el.addEventListener("opened", opened);
    el.addEventListener("closed", closed);
    return () => {
      el.removeEventListener("opened", opened);
      el.removeEventListener("closed", closed);
    };
  }, []);
  function settings() {
    const el = ref.current;
    const launch = () => {
      const trigger = document.getElementById(id);
      if (!trigger) return;
      trigger.focus();
      openSettings();
    };
    if (el && el.dataset.menuState !== "closed") {
      // Menu-item activation can start closing before React handles its click.
      // Wait for completion so the dialog records the avatar as its opener.
      el.addEventListener("closed", launch, { once: true });
      el.close();
    } else launch();
  }
  return (
    <div className="account-menu">
      <span className="account-name" aria-hidden="true">
        {name}
      </span>
      <md-icon-button
        ref={triggerRef}
        className="account-trigger"
        id={id}
        aria-label="Account menu"
        title={`Account menu for ${name}`}
        aria-controls={id + "-menu"}
        aria-haspopup="menu"
        aria-expanded={open ? "true" : "false"}
        onClick={() => setOpen(!open)}
      >
        <span className="avatar" aria-hidden="true">
          {photoURL && showPhoto ? (
            <img
              src={photoURL}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setFailedPhoto(photoURL)}
            />
          ) : (
            Array.from(name.trim())[0]?.toUpperCase() || "?"
          )}
        </span>
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
        role="menu"
      >
        <div className="menu-account">
          <strong>{name}</strong>
          <span>{email}</span>
        </div>
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
