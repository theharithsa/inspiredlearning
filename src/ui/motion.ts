import { useSyncExternalStore } from "react";
const query = matchMedia("(prefers-reduced-motion: reduce)");
const subscribe = (notify: () => void) => {
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, () => query.matches);
}
