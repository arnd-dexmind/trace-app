import { useEffect, useState } from "react";

export function NetworkDetector() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div style={bannerStyle}>
      <span>You are offline. Some features may be unavailable.</span>
      <button style={dismissBtnStyle} onClick={() => window.location.reload()}>
        Reconnect
      </button>
    </div>
  );
}

const bannerStyle: React.CSSProperties = {
  background: "var(--sm-warning-500, #f59e0b)",
  color: "#fff",
  padding: "var(--sm-space-2) var(--sm-space-4)",
  fontSize: "var(--sm-text-sm)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  position: "sticky",
  top: 0,
  zIndex: 1000,
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
