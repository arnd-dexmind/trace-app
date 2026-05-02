interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div style={bannerStyle}>
      <span>{message}</span>
      {onDismiss && (
        <button style={dismissBtnStyle} onClick={onDismiss} aria-label="Dismiss">
          x
        </button>
      )}
    </div>
  );
}

const bannerStyle: React.CSSProperties = {
  background: "var(--sm-danger-500)",
  color: "#fff",
  padding: "var(--sm-space-2) var(--sm-space-4)",
  borderRadius: "var(--sm-radius-md)",
  marginBottom: "var(--sm-space-4)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: "var(--sm-text-sm)",
};

const dismissBtnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.2)",
  color: "#fff",
  border: "none",
  borderRadius: "var(--sm-radius-sm)",
  cursor: "pointer",
  padding: "2px 8px",
  fontSize: "var(--sm-text-sm)",
  fontWeight: 600,
};
