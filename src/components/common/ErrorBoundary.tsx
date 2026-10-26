import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center p-8 text-center bg-white rounded-xl shadow-xs border border-[#d2c2cb] m-4">
          <div className="rounded-full bg-[#eee7ec] border border-[#d2c2cb] p-4 mb-5">
            <AlertTriangle className="h-10 w-10 text-[#814d75]" />
          </div>
          <h2 className="text-2xl font-serif font-bold text-[#3a0f34] mb-2">
            Something went wrong
          </h2>
          <p className="text-[#62535d] font-serif mb-6 max-w-md text-sm">
            An unexpected error occurred while rendering this component.
            {this.state.error && (
              <span className="block mt-3 p-3 bg-[#fbf9f4] border border-[#d2c2cb] text-xs font-mono text-left rounded-lg text-[#4f444b] overflow-auto max-h-32">
                {this.state.error.toString()}
              </span>
            )}
          </p>
          <button
            onClick={this.handleReset}
            className="btn-primary flex items-center gap-2 px-6 py-2 text-xs"
          >
            <RefreshCw className="h-4 w-4" />
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
