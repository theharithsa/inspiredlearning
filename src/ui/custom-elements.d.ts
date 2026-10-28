import type { DetailedHTMLProps, HTMLAttributes } from "react";
// React 19 sets custom-element properties. Public adapter props stay strongly typed.
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      [tag: `md-${string}`]: DetailedHTMLProps<
        HTMLAttributes<HTMLElement>,
        HTMLElement
      > &
        Record<string, unknown>;
    }
  }
}
