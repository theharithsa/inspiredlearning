import { useState } from "react";
export default function CertificateCorrection({
  workshop,
  busy,
  reason,
  onSave,
}: {
  workshop: { name: string; title: string; date: string | null };
  busy: boolean;
  reason: string;
  onSave: (data: {
    name: string;
    title: string;
    date: string | null;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(workshop.name),
    [title, setTitle] = useState(workshop.title),
    [date, setDate] = useState(workshop.date || "");
  return (
    <div className="stack">
      <h4>Correct certificate details</h4>
      <label>
        Verified certificate name
        <input
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        Verified workshop title
        <input
          value={title}
          maxLength={140}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label>
        Verified workshop date
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <p className="small muted">
        This creates a replacement private certificate, invalidates the previous
        copy and preserves learning points. Leave the date blank only when it is
        unknown.
      </p>
      <button
        className="button secondary"
        disabled={busy || !name.trim() || !title.trim() || !reason.trim()}
        onClick={() => void onSave({ name, title, date: date || null })}
      >
        Replace certificate with corrected details
      </button>
    </div>
  );
}
