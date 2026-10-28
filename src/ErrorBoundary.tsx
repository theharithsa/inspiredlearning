import Button from "./ui/Button";
import { Component, type ReactNode } from "react";
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    try {
      window.dtrum?.reportError?.(new Error("Application rendering failed"));
    } catch {
      /* monitoring cannot break recovery */
    }
  }
  render() {
    if (this.state.failed)
      return (
        <main className="public-page">
          <h1>We couldn’t load this page.</h1>
          <p>
            Check your connection, then reload. If another InspiredLearning tab
            is open, close it before trying again.
          </p>
          <Button className="button" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </main>
      );
    return this.props.children;
  }
}
