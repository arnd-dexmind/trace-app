import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  listRepairs,
  createRepair,
  type RepairIssue,
  getSpaceId,
} from "../api";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";

type FilterValue = "all" | "open" | "in_progress" | "resolved";

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "Monitoring" },
  { value: "resolved", label: "Resolved" },
];

const STATUS_VARIANT: Record<string, "status-open" | "status-monitoring" | "status-resolved"> = {
  open: "status-open",
  in_progress: "status-monitoring",
  resolved: "status-resolved",
};

const SEV_VARIANT: Record<string, "severity-high" | "severity-medium" | "severity-low"> = {
  high: "severity-high",
  medium: "severity-medium",
  low: "severity-low",
};

export function RepairList() {
  const spaceId = getSpaceId();
  const navigate = useNavigate();
  const [repairs, setRepairs] = useState<RepairIssue[]>([]);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = () => {
    if (!spaceId) return;
    listRepairs(spaceId, filter === "all" ? undefined : filter)
      .then(setRepairs)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load repairs"));
  };

  useEffect(load, [spaceId, filter]);

  if (!spaceId) {
    return (
      <div style={shell}>
        <EmptyState icon="&#128295;" title="No Space Selected" description="Select a space to see repair issues." />
      </div>
    );
  }

  const counts = {
    all: repairs.length,
    open: repairs.filter((r) => r.status === "open").length,
    in_progress: repairs.filter((r) => r.status === "in_progress").length,
    resolved: repairs.filter((r) => r.status === "resolved").length,
  };

  const noResults = repairs.length === 0;

  return (
    <div style={shell}>
      <div style={pageHeader}>
        <div>
          <h1 style={{ fontSize: "var(--sm-text-2xl)", fontWeight: 700 }}>Repair Issues</h1>
          <span style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)" }}>
            {repairs.length} issue{repairs.length !== 1 ? "s" : ""} across space
          </span>
        </div>
        <Button variant="primary" size="md" onClick={() => setShowCreate(true)}>
          + New Issue
        </Button>
      </div>

      {error && (
        <div style={errorBanner}>
          {error}
          <button
            onClick={() => setError(null)}
            style={{ background: "none", border: "none", color: "#fff", fontWeight: 700, cursor: "pointer" }}
          >
            x
          </button>
        </div>
      )}

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

      {noResults ? (
        <EmptyState
          icon="&#128295;"
          title="No repair issues found"
          description={filter !== "all" ? "Try a different status filter." : "Create your first repair issue to get started."}
          action={
            <Button variant="primary" onClick={() => setShowCreate(true)}>
              + Create Issue
            </Button>
          }
        />
      ) : (
        <>
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
                  <tr
                    key={r.id}
                    style={tr}
                    onClick={() => navigate(`/repairs/${r.id}`)}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.background = "var(--sm-neutral-50)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLTableRowElement).style.background = "";
                    }}
                  >
                    <td style={td}>
                      <div style={{ fontWeight: 600, fontSize: "var(--sm-text-sm)", marginBottom: 2 }}>
                        {r.title}
                      </div>
                      {r.description && (
                        <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-secondary)" }}>
                          {r.description}
                        </div>
                      )}
                    </td>
                    <td style={td}>
                      {r.severity ? (
                        <Badge variant={SEV_VARIANT[r.severity] || "severity-low"}>{r.severity}</Badge>
                      ) : (
                        <span style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)" }}>--</span>
                      )}
                    </td>
                    <td style={td}>
                      <Badge variant={STATUS_VARIANT[r.status] || "status-open"} dot>
                        {r.status === "in_progress" ? "Monitoring" : r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                      </Badge>
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
              <div key={r.id} style={card} onClick={() => navigate(`/repairs/${r.id}`)}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "var(--sm-space-2)",
                    marginBottom: "var(--sm-space-2)",
                  }}
                >
                  <span style={{ fontSize: "var(--sm-text-sm)", fontWeight: 600 }}>{r.title}</span>
                  <Badge variant={STATUS_VARIANT[r.status] || "status-open"}>
                    {r.status === "in_progress" ? "Monitoring" : r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                  </Badge>
                </div>
                <div
                  style={{
                    fontSize: "var(--sm-text-xs)",
                    color: "var(--sm-text-secondary)",
                    display: "flex",
                    gap: "var(--sm-space-3)",
                    flexWrap: "wrap",
                  }}
                >
                  {r.severity && (
                    <Badge variant={SEV_VARIANT[r.severity] || "severity-low"}>{r.severity}</Badge>
                  )}
                  <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                  {r.description && <span>{r.description}</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {showCreate && (
        <CreateForm
          spaceId={spaceId}
          onClose={() => setShowCreate(false)}
          onCreated={(r) => {
            setRepairs((prev) => [r, ...prev]);
            setShowCreate(false);
          }}
          onError={(msg) => setError(msg)}
        />
      )}
    </div>
  );
}

// ── Create Form Modal ──────────────────────────────────────────────────

function CreateForm({
  spaceId,
  onClose,
  onCreated,
  onError,
}: {
  spaceId: string;
  onClose: () => void;
  onCreated: (r: RepairIssue) => void;
  onError: (msg: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("");
  const [itemId, setItemId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    try {
      const created = await createRepair(spaceId, {
        title: title.trim(),
        description: description.trim() || undefined,
        severity: severity || undefined,
        itemId: itemId.trim() || undefined,
      });
      onCreated(created);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to create repair issue");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeader}>
          <h2 style={{ fontSize: "var(--sm-text-lg)", fontWeight: 600 }}>New Repair Issue</h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "var(--sm-text-lg)",
              cursor: "pointer",
              color: "var(--sm-text-tertiary)",
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={formFields}>
            <label style={label}>
              Title <span style={{ color: "var(--sm-danger-500)" }}>*</span>
              <input
                style={input}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Leaky faucet in kitchen"
                required
                autoFocus
              />
            </label>

            <label style={label}>
              Description
              <textarea
                style={{ ...input, minHeight: 80, resize: "vertical" }}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the issue..."
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sm-space-4)" }}>
              <label style={label}>
                Severity
                <select
                  style={input}
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                >
                  <option value="">None</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>

              <label style={label}>
                Linked Item ID
                <input
                  style={input}
                  value={itemId}
                  onChange={(e) => setItemId(e.target.value)}
                  placeholder="Optional item ID"
                />
              </label>
            </div>
          </div>

          <div style={modalFooter}>
            <Button variant="outline" onClick={onClose} type="button">
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={submitting || !title.trim()}>
              {submitting ? "Creating..." : "Create Issue"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const shell: React.CSSProperties = {
  maxWidth: 960,
  margin: "0 auto",
  padding: "0 var(--sm-space-4)",
  paddingTop: "var(--sm-space-6)",
};

const pageHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "var(--sm-space-6)",
  flexWrap: "wrap",
  gap: "var(--sm-space-3)",
};

const filterBar: React.CSSProperties = {
  display: "flex",
  gap: "var(--sm-space-3)",
  marginBottom: "var(--sm-space-6)",
  flexWrap: "wrap",
  alignItems: "center",
};

const filterPill = (active: boolean): React.CSSProperties => ({
  font: "inherit",
  fontSize: "var(--sm-text-sm)",
  fontWeight: 500,
  padding: "var(--sm-space-1) var(--sm-space-4)",
  minHeight: 36,
  border: `1px solid ${active ? "var(--sm-brand-600)" : "var(--sm-border-default)"}`,
  borderRadius: "var(--sm-radius-full)",
  cursor: "pointer",
  background: active ? "var(--sm-brand-600)" : "var(--sm-surface-card)",
  color: active ? "var(--sm-text-inverse)" : "var(--sm-text-secondary)",
  transition: "all var(--sm-transition-fast)",
});

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: "var(--sm-text-xs)",
  fontWeight: 500,
  color: "var(--sm-text-tertiary)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  padding: "var(--sm-space-2) var(--sm-space-4)",
  borderBottom: "1px solid var(--sm-border-default)",
};

const td: React.CSSProperties = {
  padding: "var(--sm-space-3) var(--sm-space-4)",
  borderBottom: "1px solid var(--sm-border-default)",
  fontSize: "var(--sm-text-sm)",
  verticalAlign: "middle",
};

const tr: React.CSSProperties = {
  cursor: "pointer",
  transition: "background var(--sm-transition-fast)",
};

const card: React.CSSProperties = {
  padding: "var(--sm-space-4)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-lg)",
  marginBottom: "var(--sm-space-3)",
  cursor: "pointer",
  transition: "box-shadow var(--sm-transition-fast)",
};

const errorBanner: React.CSSProperties = {
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

// ── Modal styles ───────────────────────────────────────────────────────

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
  padding: "var(--sm-space-4)",
};

const modal: React.CSSProperties = {
  background: "var(--sm-surface-card)",
  borderRadius: "var(--sm-radius-xl)",
  width: "100%",
  maxWidth: 520,
  maxHeight: "90vh",
  overflowY: "auto",
  boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
};

const modalHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "var(--sm-space-4) var(--sm-space-6)",
  borderBottom: "1px solid var(--sm-border-default)",
};

const formFields: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--sm-space-4)",
  padding: "var(--sm-space-6)",
};

const label: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--sm-space-1)",
  fontSize: "var(--sm-text-sm)",
  fontWeight: 500,
  color: "var(--sm-text-secondary)",
};

const input: React.CSSProperties = {
  font: "inherit",
  fontSize: "var(--sm-text-sm)",
  padding: "var(--sm-space-2) var(--sm-space-3)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-md)",
  background: "var(--sm-surface-page)",
  color: "var(--sm-text-primary)",
};

const modalFooter: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "var(--sm-space-3)",
  padding: "var(--sm-space-4) var(--sm-space-6)",
  borderTop: "1px solid var(--sm-border-default)",
};
