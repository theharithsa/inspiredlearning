import { useId, useState, type ReactNode } from "react";
import Button from "./Button";
import Icon from "./Icon";
export default function Disclosure({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false),
    id = useId();
  return (
    <section className="md-disclosure">
      <Button
        type="button"
        variant="text"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span className={open ? "rotate-90" : ""}>
          <Icon name="chevron" />
        </span>
        {label}
      </Button>
      {open && (
        <div id={id} className="md-disclosure-content">
          {children}
        </div>
      )}
    </section>
  );
}
