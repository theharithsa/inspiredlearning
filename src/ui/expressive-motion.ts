import { useEffect, useRef } from "react";
import { sampleSpring, springFrames, SPRINGS } from "./spring-model";
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let keyboard = false;
const active = new Set<() => void>();
const settleAll = () => {
  for (const stop of [...active]) stop();
};
window.addEventListener(
  "keydown",
  () => {
    keyboard = true;
    settleAll();
  },
  { capture: true },
);
window.addEventListener(
  "pointerdown",
  () => {
    keyboard = false;
  },
  { capture: true },
);
reduced.addEventListener("change", settleAll);
export const canAnimate = () => !reduced.matches && !keyboard;

/** Compositor-driven spatial entry. Never moves a reading surface repeatedly. */
export function enterSurface(el: HTMLElement, expressive = false, delay = 0) {
  if (!canAnimate()) return () => {};
  const frames = springFrames(
    0,
    1,
    0,
    expressive ? SPRINGS.expressive : SPRINGS.standard,
  );
  const spatial = el.animate(
    frames.values.map((p) => ({
      transform: `translateY(${(1 - p) * 16}px) scale(${0.98 + p * 0.02})`,
    })),
    { duration: frames.duration, delay, fill: "backwards" },
  );
  const effects = el.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: 200,
    delay,
    easing: "cubic-bezier(0.34,0.80,0.34,1)",
    fill: "backwards",
  });
  const stop = () => {
    spatial.cancel();
    effects.cancel();
    active.delete(stop);
  };
  active.add(stop);
  void Promise.allSettled([spatial.finished, effects.finished]).then(() =>
    active.delete(stop),
  );
  return stop;
}

/** Retarget a real spring from its current position AND velocity on pointer release.
 * WAAPI owns frames; React never renders per-frame state. Keyboard stays instant. */
export function usePressMotion(disabled = false) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;
    let animation: Animation | undefined, pointer: number | undefined;
    let state = { from: 1, to: 1, velocity: 0, started: performance.now() };
    const rest = () => {
      animation?.cancel();
      animation = undefined;
      state = { from: 1, to: 1, velocity: 0, started: performance.now() };
      active.delete(rest);
    };
    const move = (to: number) => {
      if (!canAnimate()) {
        rest();
        return;
      }
      const now = performance.now();
      const current = sampleSpring(
        state.from,
        state.to,
        state.velocity,
        (now - state.started) / 1000,
        SPRINGS.standard,
      );
      animation?.cancel();
      state = {
        from: current.position,
        to,
        velocity: current.velocity,
        started: now,
      };
      const frames = springFrames(
        current.position,
        to,
        current.velocity,
        SPRINGS.standard,
      );
      animation = el.animate(
        frames.values.map((p) => ({ transform: `scale(${p})` })),
        { duration: frames.duration, fill: "forwards" },
      );
      void animation.finished.catch(() => {});
      active.add(rest);
    };
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0 || el.hasAttribute("disabled"))
        return;
      pointer = event.pointerId;
      move(0.97);
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return;
      pointer = undefined;
      move(1);
      const released = animation;
      void released?.finished.then(
        () => {
          if (animation === released) rest();
        },
        () => {},
      );
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("blur", rest);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", rest);
      rest();
    };
  }, [disabled]);
  return ref;
}
