import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "React render error",
        error: error.message,
        stack: error.stack?.slice(0, 500),
        componentStack: info.componentStack?.slice(0, 500),
      }),
    );
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div style={containerStyle}>
          <div style={cardStyle}>
            <div style={iconStyle}>!</div>
            <h2 style={titleStyle}>Something went wrong</h2>
            <p style={messageStyle}>
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <div style={actionsStyle}>
              <button
                style={retryBtnStyle}
                onClick={() => this.setState({ hasError: false, error: null })}
              >
                Try Again
              </button>
              <button
                style={reloadBtnStyle}
                onClick={() => window.location.reload()}
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "60vh",
  padding: "var(--sm-space-4)",
};

const cardStyle: React.CSSProperties = {
  background: "var(--sm-surface-1)",
  border: "1px solid var(--sm-border-1)",
  borderRadius: "var(--sm-radius-lg)",
  padding: "var(--sm-space-8)",
  maxWidth: 480,
  textAlign: "center",
};

const iconStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: "50%",
  background: "var(--sm-danger-500)",
  color: "#fff",
  fontSize: 24,
  fontWeight: 700,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  margin: "0 auto var(--sm-space-4)",
};

const titleStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-lg)",
  fontWeight: 600,
  margin: "0 0 var(--sm-space-2)",
  color: "var(--sm-text-1)",
};

const messageStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-sm)",
  color: "var(--sm-text-2)",
  margin: "0 0 var(--sm-space-6)",
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  gap: "var(--sm-space-3)",
  justifyContent: "center",
};

const retryBtnStyle: React.CSSProperties = {
  padding: "var(--sm-space-2) var(--sm-space-4)",
  background: "var(--sm-brand-600)",
  color: "#fff",
  border: "none",
  borderRadius: "var(--sm-radius-md)",
  fontSize: "var(--sm-text-sm)",
  fontWeight: 500,
  cursor: "pointer",
};

const reloadBtnStyle: React.CSSProperties = {
  padding: "var(--sm-space-2) var(--sm-space-4)",
  background: "transparent",
  color: "var(--sm-text-2)",
  border: "1px solid var(--sm-border-1)",
  borderRadius: "var(--sm-radius-md)",
  fontSize: "var(--sm-text-sm)",
  cursor: "pointer",
};
