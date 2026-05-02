import { Link, useLocation } from "react-router-dom";

// SVG path data for icons — defined before use
const homeIcon = (
  <>
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </>
);

const searchIcon = (
  <>
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </>
);

const wrenchIcon = (
  <>
    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
  </>
);

const uploadIcon = (
  <>
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </>
);

const reviewIcon = (
  <>
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
  </>
);

const navItems = [
  { to: "/", label: "Home", icon: homeIcon },
  { to: "/items", label: "Items", icon: searchIcon },
  { to: "/repairs", label: "Repairs", icon: wrenchIcon },
  { to: "/upload", label: "Upload", icon: uploadIcon },
  { to: "/review", label: "Review", icon: reviewIcon },
];

export function BottomNav() {
  const location = useLocation();

  return (
    <nav className="bottom-nav" aria-label="Bottom navigation">
      {navItems.map((item) => {
        const isActive =
          item.to === "/"
            ? location.pathname === "/"
            : location.pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            style={linkStyle(isActive)}
            aria-current={isActive ? "page" : undefined}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={isActive ? 2.5 : 1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {item.icon}
            </svg>
            <span style={labelStyle(isActive)}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function linkStyle(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    minWidth: 48,
    minHeight: 56,
    padding: "var(--sm-space-1) var(--sm-space-2)",
    textDecoration: "none",
    color: active ? "var(--sm-brand-600)" : "var(--sm-text-tertiary)",
    borderRadius: "var(--sm-radius-md)",
    flex: 1,
  };
}

function labelStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: 10,
    fontWeight: active ? 600 : 400,
    lineHeight: 1,
  };
}
