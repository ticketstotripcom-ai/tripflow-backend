import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Settings, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Types
interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
  retryIn: number;
  autoRetryActive: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  retryTimer: any = null;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
      retryIn: 5, // seconds
      autoRetryActive: false,
    };
  }

  // React lifecycle — catches UI crashes
  static getDerivedStateFromError(_: Error): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("🔥 ErrorBoundary caught error:", error, errorInfo);

    // Send to Google Analytics if available
    if ((window as any).gtag) {
      (window as any).gtag("event", "exception", {
        description: error.toString(),
        fatal: true,
      });
    }

    this.setState((prev) => ({
      error,
      errorInfo,
      errorCount: prev.errorCount + 1,
    }));

    this.startRetryCountdown();
  }

  // Retry countdown logic
  startRetryCountdown() {
    this.setState({ autoRetryActive: true, retryIn: 5 });

    this.retryTimer = setInterval(() => {
      this.setState((prev) => {
        if (prev.retryIn <= 1) {
          clearInterval(this.retryTimer);
          this.retryTimer = null;
          this.handleReset();
          return { retryIn: 0, autoRetryActive: false };
        }
        return { retryIn: prev.retryIn - 1 };
      });
    }, 1000);
  }

  // Basic soft reset
  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      autoRetryActive: false,
    });
  };

  // Full system wipe
  handleFullReset = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      indexedDB.deleteDatabase("notifications-db");
      indexedDB.deleteDatabase("crm-cache");
    } catch (e) {
      console.warn("Failed to wipe storage:", e);
    }
    window.location.reload();
  };

  // Detect likely root cause
  getRootCause(): string {
    const { error } = this.state;
    if (!error) return "";

    const msg = error.message.toLowerCase();

    if (msg.includes("indexeddb")) return "🔧 IndexedDB storage corrupted";
    if (msg.includes("quota")) return "📦 Storage quota exceeded";
    if (msg.includes("network")) return "🌐 Network failure";
    if (msg.includes("sheet") || msg.includes("google"))
      return "📄 Google Sheets API error";
    if (msg.includes("timeout")) return "⏳ Operation timed out";

    return "⚠ Unknown application crash";
  }

  // Render fallback UI
  renderFallback() {
    const { error, errorInfo, retryIn, autoRetryActive } = this.state;

    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/40 dark:to-red-950/60 animate-fade-in relative overflow-hidden">

        {/* Animated floating background blobs */}
        <div className="absolute -top-20 -left-20 w-72 h-72 bg-red-300/40 dark:bg-red-800/40 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-orange-300/30 dark:bg-orange-800/40 rounded-full blur-3xl animate-float-slow" />

        <Card className="max-w-lg w-full shadow-xl backdrop-blur-xl bg-white/70 dark:bg-black/30 border border-white/30 animate-fade-in">
          <CardHeader className="text-center space-y-3">
            <div className="mx-auto mb-1 w-16 h-16 rounded-full bg-red-200/80 dark:bg-red-900/40 flex items-center justify-center animate-bounce">
              <AlertTriangle className="text-red-600 dark:text-red-400 w-8 h-8" />
            </div>
            <CardTitle className="text-2xl font-semibold text-red-700 dark:text-red-300">
              Something went wrong
            </CardTitle>
            <CardDescription className="text-sm">
              The app encountered an unexpected error.  
              <br /> Our diagnostics suggest:
              <div className="mt-2 font-medium text-red-600 dark:text-red-300">
                {this.getRootCause()}
              </div>
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 max-h-52 overflow-auto">
            <pre className="bg-muted p-3 rounded-md text-xs whitespace-pre-wrap">
              {error?.toString()}
            </pre>

            <pre className="text-muted-foreground text-xs overflow-auto whitespace-pre-wrap">
              {errorInfo?.componentStack || "No stack trace available."}
            </pre>

            {autoRetryActive && (
              <div className="text-center text-sm text-primary font-medium animate-pulse">
                Auto retrying in {retryIn} sec…
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button onClick={this.handleReset} className="w-full">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again Now
            </Button>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => (window.location.hash = "#/settings")}
            >
              <Settings className="w-4 h-4 mr-2" />
              Open Settings
            </Button>

            <Button
              variant="destructive"
              className="w-full"
              onClick={this.handleFullReset}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear All Data & Reload
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return this.renderFallback();
    }
    return this.props.children;
  }
}

// ---- Global Error Handlers ----------------------------------

window.addEventListener("error", (event) => {
  console.error("🌐 Global Error:", event.error);
  (window as any).__errorCount = ((window as any).__errorCount || 0) + 1;
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("🔥 Unhandled Promise Rejection:", event.reason);
  (window as any).__rejectionCount =
    ((window as any).__rejectionCount || 0) + 1;
});

export default ErrorBoundary;
