/* eslint-disable react/only-export-components -- The dialog service and its host share the event contract. */
import { useEffect, useId, useRef, useState } from "react";
interface Request {
  message: string;
  resolve: (accepted: boolean) => void;
  opener: Element | null;
}
const eventName = "inspiredlearning:confirm";
const cancelEvent = "inspiredlearning:cancel-confirmations";
export function cancelConfirmations() {
  window.dispatchEvent(new Event(cancelEvent));
}
export function confirmAction(message: string) {
  return new Promise<boolean>((resolve) =>
    window.dispatchEvent(
      new CustomEvent<Request>(eventName, {
        detail: { message, resolve, opener: document.activeElement },
      }),
    ),
  );
}
export default function ConfirmHost() {
  const [request, setRequest] = useState<Request | null>(null),
    active = useRef<Request | null>(null),
    dialog = useRef<HTMLDialogElement>(null),
    title = useId(),
    description = useId();
  function finish(accepted: boolean) {
    const current = active.current;
    if (!current) return;
    active.current = null;
    dialog.current?.close();
    setRequest(null);
    current.resolve(accepted);
    queueMicrotask(() => {
      if (current.opener instanceof HTMLElement && current.opener.isConnected)
        current.opener.focus();
    });
  }
  useEffect(() => {
    const handler = (event: Event) => {
      const next = (event as CustomEvent<Request>).detail;
      if (active.current) {
        next.resolve(false);
        return;
      }
      active.current = next;
      setRequest(next);
    };
    const cancel = () => finish(false);
    window.addEventListener(eventName, handler);
    window.addEventListener(cancelEvent, cancel);
    window.addEventListener("hashchange", cancel);
    return () => {
      window.removeEventListener(cancelEvent, cancel);
      window.removeEventListener("hashchange", cancel);
      window.removeEventListener(eventName, handler);
      active.current?.resolve(false);
      active.current = null;
    };
  }, []);
  useEffect(() => {
    if (request && dialog.current && !dialog.current.open)
      dialog.current.showModal();
  }, [request]);
  return request ? (
    <dialog
      ref={dialog}
      className="material-dialog"
      aria-labelledby={title}
      aria-describedby={description}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const items = Array.from(
          e.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
          ),
        ).filter((node) => node.getClientRects().length);
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        finish(false);
      }}
    >
      <h2 id={title}>Confirm this change</h2>
      <p id={description}>{request.message}</p>
      <div className="dialog-actions">
        <button className="text-button" autoFocus onClick={() => finish(false)}>
          Cancel
        </button>
        <button className="button" data-confirm onClick={() => finish(true)}>
          Continue
        </button>
      </div>
    </dialog>
  ) : null;
}
