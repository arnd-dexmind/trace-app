import { useEffect, useState } from "react";
import { listRepairs, type RepairIssue, getSpaceId } from "../api";

type FilterValue = "all" | "open" | "in_progress" | "resolved";

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "Monitoring" },
  { value: "resolved", label: "Resolved" },
];

export function RepairList() {
  const spaceId = getSpaceId();
  const [repairs, setRepairs] = useState<RepairIssue[]>([]);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!spaceId) return;
    listRepairs(spaceId, filter === "all" ? undefined : filter)
      .then(setRepairs)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load repairs"));
  }, [spaceId, filter]);

  if (!spaceId) {
    return (
      <div style={shell}>
        <div style={emptyState}>
          <div style={{ fontSize: 48, marginBottom: "var(--sm-space-4)" }}>&#128295;</div>
          <p>Select a space to see repair issues.</p>
        </div>
      </div>
    );
  }

  const counts = {
    all: repairs.length,
    open: repairs.filter((r) => r.status === "open").length,
    in_progress: repairs.filter((r) => r.status === "in_progress").length,
    resolved: repairs.filter((r) => r.status === "resolved").length,
  };

  return (
    <div style={shell}>
      {/* Page header */}
      <div style={pageHeader}>
        <div>
          <h1 style={{ fontSize: "var(--sm-text-2xl)", fontWeight: 700 }}>
            Repair Issues
          </h1>
          <span style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)" }}>
            {repairs.length} issues across space
          </span>
        </div>
      </div>

      {error && (
        <div style={errorBanner}>
          {error}
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "#fff", fontWeight: 700, cursor: "pointer" }}>x</button>
        </div>
      )}

      {/* Filter bar */}
      <div style={filterBar}>
        {FILTERS.map((f) => (
          <button
            key={f.value}
            style={filterPill(filter === f.value)}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
            {f.value !== "all" && (
              <span style={{ opacity: 0.7, marginLeft: 4 }}>{counts[f.value]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="desktop-table" style={{ overflowX: "auto" }}>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Issue</th>
              <th style={th}>Severity</th>
              <th style={th}>Status</th>
              <th style={th}>Detected</th>
            </tr>
          </thead>
          <tbody>
            {repairs.map((r) => (
              <tr key={r.id} style={tr}>
                <td style={td}>
                  <div style={{ fontWeight: 600, fontSize: "var(--sm-text-sm)", marginBottom: 2 }}>{r.title}</div>
                  {r.description && (
                    <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-secondary)" }}>
                      {r.description}
                    </div>
                  )}
                </td>
                <td style={td}>
                  {r.severity && <span style={severityBadge(r.severity)}>{r.severity}</span>}
                </td>
                <td style={td}>
                  <span style={statusBadge(r.status)}>
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%", display: "inline-block",
                      background: r.status === "open" ? "#eab308" : r.status === "in_progress" ? "#3b82f6" : "#22c55e",
                    }} />{" "}
                    {r.status === "in_progress" ? "Monitoring" : r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                  </span>
                </td>
                <td style={{ ...td, fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)" }}>
                  {new Date(r.createdAt).toLocaleDateString()}
                  {r.resolvedAt && (
                    <div style={{ fontSize: "var(--sm-text-xs)" }}>
                      Resolved {new Date(r.resolvedAt).toLocaleDateString()}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="mobile-cards" style={{ display: "none" }}>
        {repairs.map((r) => (
          <div key={r.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--sm-space-2)", marginBottom: "var(--sm-space-2)" }}>
              <span style={{ fontSize: "var(--sm-text-sm)", fontWeight: 600 }}>{r.title}</span>
              <span style={statusBadge(r.status)}>
                {r.status === "in_progress" ? "Monitoring" : r.status.charAt(0).toUpperCase() + r.status.slice(1)}
              </span>
            </div>
            <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-secondary)", display: "flex", gap: "var(--sm-space-3)", flexWrap: "wrap" }}>
              {r.severity && <span style={severityBadge(r.severity)}>{r.severity}</span>}
              <span>{new Date(r.createdAt).toLocaleDateString()}</span>
              {r.description && <span>{r.description}</span>}
            </div>
          </div>
        ))}

        {repairs.length === 0 && (
          <div style={emptyState}>
            <div style={{ fontSize: 48, marginBottom: "var(--sm-space-4)" }}>&#128295;</div>
            <p>No repair issues found.</p>
          </div>
        )}
      </div>

      {repairs.length === 0 && (
        <div style={emptyState}>
          <div style={{ fontSize: 48, marginBottom: "var(--sm-space-4)" }}>&#128295;</div>
          <p>No repair issues found with the current filter.</p>
        </div>
      )}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const shell: React.CSSProperties = {
  maxWidth: 960, margin: "0 auto", padding: "0 var(--sm-space-4)", paddingTop: "var(--sm-space-6)",
};

const pageHeader: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  marginBottom: "var(--sm-space-6)", flexWrap: "wrap", gap: "var(--sm-space-3)",
};

const filterBar: React.CSSProperties = {
  display: "flex", gap: "var(--sm-space-3)", marginBottom: "var(--sm-space-6)",
  flexWrap: "wrap", alignItems: "center",
};

const filterPill = (active: boolean): React.CSSProperties => ({
  font: "inherit", fontSize: "var(--sm-text-sm)", fontWeight: 500,
  padding: "var(--sm-space-1) var(--sm-space-4)", minHeight: 36,
  border: `1px solid ${active ? "var(--sm-brand-600)" : "var(--sm-border-default)"}`,
  borderRadius: "var(--sm-radius-full)", cursor: "pointer",
  background: active ? "var(--sm-brand-600)" : "var(--sm-surface-card)",
  color: active ? "var(--sm-text-inverse)" : "var(--sm-text-secondary)",
  transition: "all var(--sm-transition-fast)",
});

const table: React.CSSProperties = {
  width: "100%", borderCollapse: "collapse",
};

const th: React.CSSProperties = {
  textAlign: "left", fontSize: "var(--sm-text-xs)", fontWeight: 500,
  color: "var(--sm-text-tertiary)", textTransform: "uppercase",
  letterSpacing: "0.05em", padding: "var(--sm-space-2) var(--sm-space-4)",
  borderBottom: "1px solid var(--sm-border-default)",
};

const td: React.CSSProperties = {
  padding: "var(--sm-space-3) var(--sm-space-4)",
  borderBottom: "1px solid var(--sm-border-default)",
  fontSize: "var(--sm-text-sm)", verticalAlign: "middle",
};

const tr: React.CSSProperties = {
  cursor: "pointer", transition: "background var(--sm-transition-fast)",
};

const card: React.CSSProperties = {
  padding: "var(--sm-space-4)", border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-lg)", marginBottom: "var(--sm-space-3)",
  cursor: "pointer", transition: "box-shadow var(--sm-transition-fast)",
};

const emptyState: React.CSSProperties = {
  textAlign: "center", padding: "var(--sm-space-16) var(--sm-space-4)", color: "var(--sm-text-tertiary)",
};

const errorBanner: React.CSSProperties = {
  background: "var(--sm-danger-500)", color: "#fff",
  padding: "var(--sm-space-2) var(--sm-space-4)", borderRadius: "var(--sm-radius-md)",
  marginBottom: "var(--sm-space-4)", display: "flex",
  justifyContent: "space-between", alignItems: "center", fontSize: "var(--sm-text-sm)",
};

const statusBadge = (status: string): React.CSSProperties => {
  const colors: Record<string, { bg: string; color: string }> = {
    open: { bg: "#fef3c7", color: "#92400e" },
    in_progress: { bg: "#dbeafe", color: "#1e40af" },
    resolved: { bg: "#dcfce7", color: "#166534" },
  };
  const c = colors[status] || colors.open;
  return {
    display: "inline-flex", alignItems: "center", gap: 4,
    fontSize: 11, fontWeight: 500, padding: "3px 10px",
    borderRadius: "var(--sm-radius-full)", whiteSpace: "nowrap",
    background: c.bg, color: c.color,
  };
};

const severityBadge = (severity: string): React.CSSProperties => {
  const colors: Record<string, { bg: string; color: string }> = {
    high: { bg: "#fee2e2", color: "var(--sm-danger-700)" },
    medium: { bg: "#fef9c3", color: "var(--sm-warning-600)" },
    low: { bg: "var(--sm-neutral-100)", color: "var(--sm-text-secondary)" },
  };
  const c = colors[severity] || colors.low;
  return {
    fontSize: 11, fontWeight: 600, padding: "2px 8px",
    borderRadius: "var(--sm-radius-sm)", whiteSpace: "nowrap",
    background: c.bg, color: c.color,
  };
};
