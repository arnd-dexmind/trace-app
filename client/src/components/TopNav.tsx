import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { listSpaces, Space, setSpaceId, getSpaceId, getTenantId, setTenantId } from "../api";

export function TopNav() {
  const location = useLocation();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState(getSpaceId() || "");
  const [tenantId, setLocalTenantId] = useState(getTenantId());

  useEffect(() => {
    listSpaces()
      .then(setSpaces)
      .catch(() => setSpaces([]));
  }, [tenantId]);

  useEffect(() => {
    if (!selectedSpaceId && spaces.length > 0) {
      setSelectedSpaceId(spaces[0].id);
      setSpaceId(spaces[0].id);
    }
  }, [spaces, selectedSpaceId]);

  const handleSpaceChange = (id: string) => {
    setSelectedSpaceId(id);
    setSpaceId(id);
  };

  const handleTenantChange = () => {
    const id = prompt("Tenant ID:", tenantId);
    if (id) {
      setTenantId(id);
      setLocalTenantId(id);
      setSelectedSpaceId("");
      setSpaces([]);
    }
  };

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--sm-space-4)",
        padding: "var(--sm-space-3) var(--sm-space-6)",
        borderBottom: "1px solid var(--sm-border-default)",
        background: "var(--sm-surface-card)",
        flexWrap: "wrap",
        minHeight: "var(--sm-header-height)",
      }}
    >
      <Link
        to="/review"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--sm-space-2)",
          fontSize: "var(--sm-text-lg)",
          fontWeight: 700,
          color: "var(--sm-text-primary)",
          textDecoration: "none",
          marginRight: "var(--sm-space-2)",
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"
             style={{ width: "28px", height: "28px", flexShrink: 0 }}
             aria-hidden="true">
          <path d="M 10 52 Q 28 -4, 58 14" stroke="#06B6D4" strokeWidth="1.5" strokeLinecap="round" opacity="0.30"/>
          <circle cx="58" cy="14" r="2" fill="#06B6D4" opacity="0.35"/>
          <path d="M 14 48 Q 30 2, 54 20" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" opacity="0.55"/>
          <circle cx="54" cy="20" r="2.5" fill="#8B5CF6" opacity="0.6"/>
          <path d="M 18 44 Q 32 8, 50 26" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" opacity="0.85"/>
          <circle cx="50" cy="26" r="3" fill="#4F46E5" opacity="0.9"/>
          <path d="M 8 32 C 10 16, 40 14, 54 26 C 44 46, 14 48, 8 32 Z" stroke="#09090B" strokeWidth="2.5" strokeLinejoin="round"/>
          <circle cx="28" cy="31" r="10" fill="#4F46E5"/>
          <circle cx="28" cy="31" r="5" fill="#09090B"/>
          <circle cx="25" cy="28" r="2" fill="#FFFFFF"/>
        </svg>
        PerifEye
      </Link>

      <Link
        to="/"
        style={navLinkStyle(location.pathname === "/")}
      >
        Dashboard
      </Link>
      <Link
        to="/spaces"
        style={navLinkStyle(isActive("/spaces"))}
      >
        Spaces
      </Link>
      <Link
        to="/review"
        style={navLinkStyle(isActive("/review"))}
      >
        Review
      </Link>
      <Link
        to="/items"
        style={navLinkStyle(isActive("/items"))}
      >
        Items
      </Link>
      <Link
        to="/repairs"
        style={navLinkStyle(isActive("/repairs"))}
      >
        Repairs
      </Link>
      <Link
        to="/upload"
        style={navLinkStyle(isActive("/upload"))}
      >
        Upload
      </Link>
      <Link
        to="/capture"
        style={navLinkStyle(isActive("/capture"))}
      >
        Capture
      </Link>

      <div style={{ marginLeft: "auto", display: "flex", gap: "var(--sm-space-3)", alignItems: "center" }}>
        <select
          value={selectedSpaceId}
          onChange={(e) => handleSpaceChange(e.target.value)}
          style={selectStyle}
          aria-label="Select space"
        >
          {spaces.length === 0 && (
            <option value="">No spaces</option>
          )}
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <button
          onClick={handleTenantChange}
          style={{
            ...buttonStyle,
            fontSize: "var(--sm-text-xs)",
            padding: "4px var(--sm-space-3)",
          }}
          title="Change tenant"
        >
          {tenantId}
        </button>
      </div>
    </nav>
  );
}

const navLinkStyle = (active: boolean): React.CSSProperties => ({
  fontSize: "var(--sm-text-sm)",
  fontWeight: 500,
  color: active ? "var(--sm-brand-600)" : "var(--sm-text-secondary)",
  textDecoration: "none",
  padding: "var(--sm-space-1) var(--sm-space-2)",
  borderRadius: "var(--sm-radius-md)",
});

const selectStyle: React.CSSProperties = {
  font: "inherit",
  fontSize: "var(--sm-text-sm)",
  padding: "4px 8px",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-md)",
  background: "var(--sm-surface-card)",
  color: "var(--sm-text-primary)",
  minWidth: 160,
};

const buttonStyle: React.CSSProperties = {
  font: "inherit",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-md)",
  background: "var(--sm-surface-card)",
  color: "var(--sm-text-secondary)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};
