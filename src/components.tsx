import Icon from "./ui/Icon";
import { workshopCredits } from "./credits";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Workshop } from "./types";
import { DISCORD, statusLabel } from "./constants";
export function Message({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <p
      role={error ? "alert" : "status"}
      className={"notice" + (error ? " error" : "")}
    >
      <Icon name={error ? "error" : "info"} />
      <span>{children}</span>
    </p>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-mark" aria-hidden="true">
        ↗
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
export function CommunityCard() {
  return (
    <aside className="community-card">
      <span className="eyebrow">LEARNING CONTINUES</span>
      <h2>
        A question today.
        <br />A conversation tomorrow.
      </h2>
      <p>
        Join fellow learners and captains on Discord. Ask questions, share what
        you build and help someone take their next step.
      </p>
      <a
        className="button light"
        data-event="discord.opened"
        href={DISCORD}
        target="_blank"
        rel="noreferrer"
      >
        Join the community ↗
      </a>
    </aside>
  );
}
export function WorkshopCard({ workshop: w }: { workshop: Workshop }) {
  return (
    <Link className="workshop-card" to={"/workshops/" + w.sid}>
      <div className="card-top">
        <span
          className={"badge " + (w.status === "completed" ? "success" : "")}
        >
          {statusLabel(w.status)}
        </span>
        <span>{w.date || "Date pending"}</span>
      </div>
      <h3>{w.title}</h3>
      <p>
        {w.teamId} · {w.role}
      </p>
      <div className="card-bottom">
        <span>
          {w.status === "completed"
            ? `${workshopCredits(w) ?? "Unknown"} credits awarded`
            : "Your participation record"}
        </span>
        <span aria-hidden="true">↗</span>
      </div>
    </Link>
  );
}
export function Qr({ url, label }: { url: string; label: string }) {
  const [src, set] = useState("");
  useEffect(() => {
    void import("qrcode")
      .then((m) => m.toDataURL(url, { width: 220, margin: 2 }))
      .then(set)
      .catch(() => {});
  }, [url]);
  return src ? <img src={src} width="180" height="180" alt={label} /> : null;
}
