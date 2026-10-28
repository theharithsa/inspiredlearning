import { createElement, type ReactNode } from "react";
import "@material/web/progress/circular-progress.js";
export default function Loading({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="md-loading">
      {createElement("md-circular-progress", {
        indeterminate: true,
        "aria-hidden": "true",
      })}
      <span>{children}</span>
    </div>
  );
}
