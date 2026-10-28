import { dateOnly, calendarDate, dateString } from "./calendar-model";
import { useState, useMemo, useRef, useEffect } from "react";
import Field, { type FieldProps } from "./Field";
import Button from "./Button";
import Icon from "./Icon";
import Dialog from "./Dialog";
const iso = dateString;
export default function DateField({
  value,
  onChange,
  label,
  ...props
}: FieldProps) {
  const [open, setOpen] = useState(false),
    [view, setView] = useState(() => {
      const d = dateOnly(value) || new Date();
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    }),
    [picked, setPicked] = useState(String(value || ""));
  const moveFocus = useRef(false);
  const [activeDate, setActiveDate] = useState(() =>
    iso(dateOnly(value) || new Date()),
  );
  useEffect(() => {
    if (!open) return;
    const target = grid.current?.querySelector<HTMLElement>(
      `[data-date="${activeDate}"]`,
    );
    if (moveFocus.current || document.activeElement?.closest(".calendar-grid"))
      target?.focus();
    moveFocus.current = false;
  }, [activeDate, open]);
  const title = useMemo(
    () =>
      new Intl.DateTimeFormat("en", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(calendarDate(view.year, view.month)),
    [view],
  );
  const grid = useRef<HTMLDivElement>(null),
    first = calendarDate(view.year, view.month).getUTCDay(),
    days = calendarDate(view.year, view.month + 1, 0).getUTCDate();
  function shift(amount: number) {
    const d = calendarDate(view.year, view.month + amount);
    setView({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
    setActiveDate(iso(d));
  }
  function commit(next: string) {
    onChange?.({
      target: { value: next },
      currentTarget: { value: next },
    } as Parameters<NonNullable<FieldProps["onChange"]>>[0]);
    setOpen(false);
  }
  return (
    <div className="date-field">
      <Field
        {...props}
        label={label}
        value={value}
        type="text"
        placeholder="YYYY-MM-DD"
        pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"
        error={!!value && !dateOnly(value)}
        errorText="Use a valid date in YYYY-MM-DD format."
        onChange={onChange}
      />
      <Button
        type="button"
        variant="icon"
        aria-label={`Open calendar for ${label}`}
        disabled={props.disabled || props.readOnly}
        onClick={() => {
          const d = dateOnly(value) || new Date();
          setView({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
          setPicked(dateOnly(value) ? String(value) : "");
          setActiveDate(iso(d));
          setOpen(true);
        }}
      >
        <Icon name="calendar" />
      </Button>
      {open && (
        <Dialog
          title="Select date"
          className="date-dialog"
          onClose={() => setOpen(false)}
        >
          <p className="calendar-selection">
            {picked
              ? new Intl.DateTimeFormat("en", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(new Date(picked + "T12:00:00Z"))
              : "No date selected"}
          </p>
          <div className="calendar-month">
            <Button
              type="button"
              variant="icon"
              aria-label="Previous month"
              disabled={view.year === 1 && view.month === 0}
              onClick={() => shift(-1)}
            >
              <span className="rotate-180">
                <Icon name="chevron" />
              </span>
            </Button>
            <h3 aria-live="polite">{title}</h3>
            <Button
              type="button"
              variant="icon"
              aria-label="Next month"
              disabled={view.year === 9999 && view.month === 11}
              onClick={() => shift(1)}
            >
              <Icon name="chevron" />
            </Button>
          </div>
          <div className="calendar-weekdays" aria-hidden="true">
            {["S", "M", "T", "W", "T", "F", "S"].map((day, i) => (
              <span key={i}>{day}</span>
            ))}
          </div>
          <div
            className="calendar-grid"
            role="group"
            aria-label={title}
            ref={grid}
            onKeyDown={(e) => {
              const target = (e.target as HTMLElement).closest("[data-date]");
              if (!target) return;
              const current = dateOnly(target.getAttribute("data-date"));
              if (!current) return;
              const steps: Record<string, number> = {
                ArrowRight: 1,
                ArrowLeft: -1,
                ArrowDown: 7,
                ArrowUp: -7,
              };
              let next: Date;
              if (e.key in steps)
                next = calendarDate(
                  view.year,
                  view.month,
                  current.getUTCDate() + steps[e.key],
                );
              else if (e.key === "Home" || e.key === "End")
                next = calendarDate(
                  view.year,
                  view.month,
                  current.getUTCDate() +
                    (e.key === "Home"
                      ? -current.getUTCDay()
                      : 6 - current.getUTCDay()),
                );
              else if (e.key === "PageUp" || e.key === "PageDown") {
                const offset = e.key === "PageUp" ? -1 : 1,
                  month = calendarDate(
                    view.year + (e.shiftKey ? offset : 0),
                    view.month + (e.shiftKey ? 0 : offset),
                  );
                next = calendarDate(
                  month.getUTCFullYear(),
                  month.getUTCMonth(),
                  Math.min(
                    current.getUTCDate(),
                    calendarDate(
                      month.getUTCFullYear(),
                      month.getUTCMonth() + 1,
                      0,
                    ).getUTCDate(),
                  ),
                );
              } else return;
              e.preventDefault();
              if (next.getUTCFullYear() < 1 || next.getUTCFullYear() > 9999)
                return;
              moveFocus.current = true;
              setView({
                year: next.getUTCFullYear(),
                month: next.getUTCMonth(),
              });
              setActiveDate(iso(next));
            }}
          >
            {Array.from({ length: first }, (_, i) => (
              <span key={"blank" + i} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const day = i + 1,
                date = iso(calendarDate(view.year, view.month, day));
              return (
                <Button
                  type="button"
                  variant="text"
                  key={day}
                  data-day={day}
                  data-date={date}
                  tabIndex={activeDate === date ? 0 : -1}
                  onFocus={() => setActiveDate(date)}
                  className={`calendar-day ${picked === date ? "selected" : ""}`}
                  aria-label={date}
                  aria-pressed={picked === date}
                  onClick={() => {
                    setPicked(date);
                    setActiveDate(date);
                  }}
                >
                  {day}
                </Button>
              );
            })}
          </div>
          <footer className="dialog-actions">
            <Button type="button" variant="text" onClick={() => commit("")}>
              Clear date
            </Button>
            <Button type="button" variant="text" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!picked}
              onClick={() => commit(picked)}
            >
              Select date
            </Button>
          </footer>
        </Dialog>
      )}
    </div>
  );
}
