import { useRef, useEffect } from "react";
import "@material/web/tabs/tabs.js";
import "@material/web/tabs/primary-tab.js";
import type { MdTabs } from "@material/web/tabs/tabs.js";
export default function Tabs({
  labels,
  panelId,
  value,
  onChange,
}: {
  labels: string[];
  panelId: string;
  value: number;
  onChange: (index: number) => void;
}) {
  const ref = useRef<MdTabs>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const change = () => onChange(el.activeTabIndex);
    el.addEventListener("change", change);
    return () => el.removeEventListener("change", change);
  }, [onChange]);
  return (
    <md-tabs
      ref={ref}
      activeTabIndex={value}
      aria-label="Request view"
      role="tablist"
      className="md-tabs"
    >
      {labels.map((label, index) => (
        <md-primary-tab
          key={label}
          active={index === value}
          role="tab"
          aria-selected={index === value ? "true" : "false"}
          aria-controls={panelId}
          id={panelId + "-tab-" + index}
        >
          {label}
        </md-primary-tab>
      ))}
    </md-tabs>
  );
}
