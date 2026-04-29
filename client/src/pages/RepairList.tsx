import { useEffect, useState } from "react";
import { listRepairs, RepairIssue, getSpaceId } from "../api";

const STATUS_FILTERS = ["", "open", "in_progress", "resolved"];

export function RepairList() {
  const spaceId = getSpaceId();
  const [repairs, setRepairs] = useState<RepairIssue[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!spaceId) return;
    setLoading(true);
    listRepairs(spaceId, filter || undefined)
      .then(setRepairs)
      .catch(() => setError("Failed to load repairs"))
      .finally(() => setLoading(false));
  }, [spaceId, filter]);

  if (!spaceId) return <p style={muted}>No space selected.</p>;

  return (
    <div style={container}>
      <h2>Repairs</h2>

      <div style={{ display: "flex", gap: "var(--sm-space-2)", marginBottom: "var(--sm-space-4)" }}>
        {STATUS_FILTERS.map((s) => (
          <button key={s} onClick={() => setFilter(s)} style={filter === s ? pillActive : pill}>
            {s || "All"}
          </button>
        ))}
      </div>

      {error && <p style={{ color: "var(--sm-semantic-error)" }}>{error}</p>}
      {loading && <p style={muted}>Loading...</p>}

      {!loading && repairs.length === 0 && <p style={muted}>No repair issues found.</p>}
      {repairs.map((r) => (
        <div key={r.id} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>{r.title}</strong>
            <span style={badge(r.status)}>{r.status}</span>
          </div>
          {r.description && <p style={muted}>{r.description}</p>}
          {r.severity && <p style={muted}>Severity: {r.severity}</p>}
          <p style={muted}>{new Date(r.createdAt).toLocaleDateString()}</p>
        </div>
      ))}
    </div>
  );
}

const container: React.CSSProperties = { maxWidth: 720, margin: "0 auto", padding: "var(--sm-space-6)" };
const muted: React.CSSProperties = { color: "var(--sm-text-muted)", fontSize: "var(--sm-text-sm)" };
const card: React.CSSProperties = { background: "var(--sm-surface-card)", border: "1px solid var(--sm-border-default)", borderRadius: "var(--sm-radius-lg)", padding: "var(--sm-space-4)", marginBottom: "var(--sm-space-2)" };
const pill: React.CSSProperties = { font: "inherit", fontSize: "var(--sm-text-sm)", background: "var(--sm-surface-page)", border: "1px solid var(--sm-border-default)", padding: "4px 12px", borderRadius: "var(--sm-radius-full)", cursor: "pointer" };
const pillActive: React.CSSProperties = { ...pill, background: "var(--sm-brand-600)", color: "#fff", borderColor: "var(--sm-brand-600)" };
const badge = (status: string): React.CSSProperties => ({
  fontSize: "var(--sm-text-xs)", fontWeight: 600, padding: "2px 8px",
  borderRadius: "var(--sm-radius-full)",
  background: status === "open" ? "var(--sm-semantic-error)" : status === "in_progress" ? "var(--sm-semantic-warning)" : "var(--sm-semantic-success)",
  color: "#fff",
});
