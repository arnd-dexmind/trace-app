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
          fontSize: "var(--sm-text-lg)",
          fontWeight: 700,
          color: "var(--sm-text-primary)",
          textDecoration: "none",
          marginRight: "var(--sm-space-2)",
        }}
      >
        Space Memory
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
