import { useEffect, useId, useRef, type ReactNode } from "react";
import Button from "./Button";
import Icon from "./Icon";
import { enterSurface } from "./expressive-motion";
interface Props {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}
/** Native modality with M3 geometry and a shared focus policy, including shadow controls. */
export default function Dialog({
  title,
  children,
  onClose,
  className = "",
}: Props) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId(),
    close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const opener = document.activeElement,
      el = ref.current;
    if (!el) return;
    el.showModal();
    const stopMotion = enterSurface(el);
    let active = true;
    const ready = Array.from(
      el.querySelectorAll<HTMLElement>(
        "md-text-button,md-filled-button,md-icon-button",
      ),
    ).map(
      (node) =>
        (node as HTMLElement & { updateComplete?: Promise<unknown> })
          .updateComplete,
    );
    void Promise.all(ready).then(() => {
      if (active && el.open)
        el.querySelector<HTMLElement>("[data-dialog-close]")?.focus();
    });
    const escape = () => close.current();
    window.addEventListener("hashchange", escape);
    return () => {
      active = false;
      stopMotion();
      window.removeEventListener("hashchange", escape);
      el.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`material-dialog ${className}`}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        // Let an open Material listbox/menu own its roving focus and keyboard loop.
        if (
          e.currentTarget.querySelector(
            "md-outlined-select[open],md-menu[open]",
          )
        )
          return;
        const candidates = Array.from(
          e.currentTarget.querySelectorAll<HTMLElement>(
            "md-filled-button,md-outlined-button,md-filled-tonal-button,md-text-button,md-icon-button,md-outlined-text-field,md-outlined-select,md-radio,md-checkbox,button,a[href]",
          ),
        ).filter(
          (n) =>
            n.getClientRects().length &&
            !n.hasAttribute("disabled") &&
            n.getAttribute("tabindex") !== "-1",
        );
        const first = candidates[0],
          last = candidates.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }}
    >
      <header className="dialog-heading">
        <h2 id={id}>{title}</h2>
        <Button
          variant="icon"
          type="button"
          aria-label={`Close ${title}`}
          data-dialog-close
          onClick={onClose}
        >
          <Icon name="close" />
        </Button>
      </header>
      {children}
    </dialog>
  );
}
