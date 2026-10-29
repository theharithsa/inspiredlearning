type Payload = Record<string, unknown>;
type Options = {
  identify: (value: string) => boolean;
  send: (name: string, data: Payload) => boolean;
  canRetry: () => boolean;
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
};
/** Best-effort browser observations only; never a durable/canonical event queue. */
export function createRumReadiness({
  identify,
  send,
  canRetry,
  now = Date.now,
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
}: Options) {
  let current = "",
    identified = false,
    deadline = now() + 5000,
    timer: unknown;
  let pending: { name: string; data: Payload; at: number }[] = [];
  const stop = () => {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  };
  const identifyCurrent = () => {
    if (!identified && current) {
      try {
        identified = identify(current);
      } catch {}
    }
  };
  const sendOnce = (name: string, data: Payload) => {
    try {
      return send(name, data);
    } catch {
      return true;
    }
  };
  const again = () => {
    if (
      timer === undefined &&
      now() < deadline &&
      canRetry() &&
      (!identified || pending.length)
    )
      timer = schedule(flush, 100);
  };
  function flush() {
    timer = undefined;
    identifyCurrent();
    const time = now();
    pending = pending.filter(
      (e) => time - e.at < 5000 && !sendOnce(e.name, e.data),
    );
    again();
  }
  return {
    identity(value: string) {
      if (value !== current) {
        stop();
        pending = [];
        current = value;
        identified = false;
        deadline = now() + 5000;
      }
      identifyCurrent();
      again();
    },
    event(name: string, data: Payload) {
      identifyCurrent();
      if (sendOnce(name, data)) return;
      if (!canRetry() || now() >= deadline) return;
      pending.push({ name, data, at: now() });
      if (pending.length > 32) pending.shift();
      again();
    },
    clear() {
      stop();
      pending = [];
    },
  };
}
