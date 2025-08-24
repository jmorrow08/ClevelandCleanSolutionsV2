import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; error?: Error };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error("App error boundary caught", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-red-600 dark:text-red-400">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm opacity-80">{this.state.error?.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
