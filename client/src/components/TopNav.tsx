import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { listSpaces, Space, setSpaceId, getSpaceId, getTenantId, setTenantId } from "../api";

export function TopNav() {
  const location = useLocation();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState(getSpaceId() || "");
  const [tenantId, setLocalTenantId] = useState(getTenantId());
  const [mobileOpen, setMobileOpen] = useState(false);

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

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

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

  const navLinks = [
    { to: "/", label: "Dashboard", active: location.pathname === "/" },
    { to: "/spaces", label: "Spaces", active: isActive("/spaces") },
    { to: "/review", label: "Review", active: isActive("/review") },
    { to: "/items", label: "Items", active: isActive("/items") },
    { to: "/repairs", label: "Repairs", active: isActive("/repairs") },
    { to: "/analytics", label: "Analytics", active: isActive("/analytics") },
    { to: "/team", label: "Team", active: isActive("/team") },
    { to: "/settings", label: "Settings", active: isActive("/settings") },
    { to: "/upload", label: "Upload", active: isActive("/upload") },
    { to: "/capture", label: "Capture", active: isActive("/capture") },
  ];

  return (
    <nav style={navStyle}>
      {/* Logo */}
      <Link to="/review" style={logoStyle} aria-label="PerifEye home">
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
        <span className="brand-text" style={{ display: "none" }}>PerifEye</span>
      </Link>

      {/* Desktop nav links */}
      <div className="desktop-nav" style={desktopNavStyle}>
        {navLinks.map((link) => (
          <Link key={link.to} to={link.to} style={navLinkStyle(link.active)}>
            {link.label}
          </Link>
        ))}
      </div>

      {/* Space selector + tenant (right side) */}
      <div className="desktop-nav" style={rightSideStyle}>
        <select
          value={selectedSpaceId}
          onChange={(e) => handleSpaceChange(e.target.value)}
          style={selectStyle}
          aria-label="Select space"
        >
          {spaces.length === 0 && <option value="">No spaces</option>}
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <button onClick={handleTenantChange} style={tenantBtnStyle} title="Change tenant">
          {tenantId}
        </button>
      </div>

      {/* Mobile hamburger */}
      <button
        type="button"
        className="mobile-nav-toggle"
        style={hamburgerStyle}
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-expanded={mobileOpen}
        aria-label="Toggle navigation"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          {mobileOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          )}
        </svg>
      </button>

      {/* Mobile menu drawer */}
      {mobileOpen && (
        <div className="mobile-nav" style={mobileMenuStyle}>
          <div style={mobileLinksStyle}>
            {navLinks.map((link) => (
              <Link key={link.to} to={link.to} style={mobileLinkStyle(link.active)}>
                {link.label}
              </Link>
            ))}
          </div>
          <div style={mobileControlsStyle}>
            <select
              value={selectedSpaceId}
              onChange={(e) => handleSpaceChange(e.target.value)}
              style={{ ...selectStyle, width: "100%" }}
              aria-label="Select space"
            >
              {spaces.length === 0 && <option value="">No spaces</option>}
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button onClick={handleTenantChange} style={{ ...tenantBtnStyle, width: "100%" }} title="Change tenant">
              Tenant: {tenantId}
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const navStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--sm-space-4)",
  padding: "var(--sm-space-3) var(--sm-space-6)",
  borderBottom: "1px solid var(--sm-border-default)",
  background: "var(--sm-surface-card)",
  minHeight: "var(--sm-header-height)",
  position: "relative",
};

const logoStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--sm-space-2)",
  fontSize: "var(--sm-text-lg)",
  fontWeight: 700,
  color: "var(--sm-text-primary)",
  textDecoration: "none",
  marginRight: "var(--sm-space-2)",
  flexShrink: 0,
};

// Brand text: hidden on mobile via inline, shown via .brand-text media query

const desktopNavStyle: React.CSSProperties = {
  alignItems: "center",
  gap: "var(--sm-space-1)",
};

const rightSideStyle: React.CSSProperties = {
  marginLeft: "auto",
  gap: "var(--sm-space-3)",
  alignItems: "center",
};

const hamburgerStyle: React.CSSProperties = {
  marginLeft: "auto",
  alignItems: "center",
  justifyContent: "center",
  width: 44,
  height: 44,
  padding: 0,
  border: "none",
  borderRadius: "var(--sm-radius-md)",
  background: "none",
  color: "var(--sm-text-secondary)",
  cursor: "pointer",
};

const mobileMenuStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  background: "var(--sm-surface-card)",
  borderBottom: "1px solid var(--sm-border-default)",
  boxShadow: "var(--sm-shadow-lg)",
  zIndex: 100,
  padding: "var(--sm-space-3)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--sm-space-3)",
};

const mobileLinksStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const mobileControlsStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--sm-space-2)",
  padding: "var(--sm-space-3)",
  borderTop: "1px solid var(--sm-border-default)",
};

function navLinkStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: "var(--sm-text-sm)",
    fontWeight: 500,
    color: active ? "var(--sm-brand-600)" : "var(--sm-text-secondary)",
    textDecoration: "none",
    padding: "var(--sm-space-1) var(--sm-space-2)",
    borderRadius: "var(--sm-radius-md)",
    minHeight: 32,
    display: "inline-flex",
    alignItems: "center",
  };
}

function mobileLinkStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: "var(--sm-text-base)",
    fontWeight: active ? 600 : 400,
    color: active ? "var(--sm-brand-600)" : "var(--sm-text-primary)",
    textDecoration: "none",
    padding: "var(--sm-space-3) var(--sm-space-4)",
    borderRadius: "var(--sm-radius-md)",
    minHeight: 44,
    display: "flex",
    alignItems: "center",
    background: active ? "var(--sm-brand-50)" : undefined,
  };
}

const selectStyle: React.CSSProperties = {
  font: "inherit",
  fontSize: "var(--sm-text-sm)",
  padding: "6px 8px",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-md)",
  background: "var(--sm-surface-card)",
  color: "var(--sm-text-primary)",
  minWidth: 160,
  minHeight: 44,
};

const tenantBtnStyle: React.CSSProperties = {
  font: "inherit",
  fontSize: "var(--sm-text-xs)",
  padding: "4px var(--sm-space-3)",
  minHeight: 44,
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-md)",
  background: "var(--sm-surface-card)",
  color: "var(--sm-text-secondary)",
  cursor: "pointer",
  whiteSpace: "nowrap",
};
