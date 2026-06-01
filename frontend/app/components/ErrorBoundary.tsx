"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * React Error Boundary — catches render-time errors in the component tree.
 * Note: does NOT catch errors in event handlers (use try/catch there).
 */
class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReset = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          role="alert"
          className="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-2xl border border-red-500/20 bg-red-500/5 p-8 text-center"
        >
          <p className="text-lg font-semibold text-red-400">Something went wrong</p>
          <p className="max-w-sm text-sm text-[var(--color-text-muted)]">
            An unexpected error occurred. You can try again or refresh the page.
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="rounded-full bg-[var(--color-accent)] px-5 py-2 text-sm font-semibold text-[#061a1a] hover:brightness-105"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
