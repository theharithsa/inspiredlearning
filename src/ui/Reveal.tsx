import { useLayoutEffect, useRef, type ReactNode } from "react";
import { enterSurface } from "./expressive-motion";
export default function Reveal({
  children,
  className = "",
  expressive = false,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  expressive?: boolean;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(
    () =>
      ref.current ? enterSurface(ref.current, expressive, delay) : undefined,
    [expressive, delay],
  );
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
