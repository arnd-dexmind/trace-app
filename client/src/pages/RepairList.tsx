import { useEffect, useState, type FormEvent, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchAllRepairs,
  patchRepair,
  createRepair,
  listSpaces,
  type RepairIssue,
  type Space,
  getSpaceId,
} from "../api";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";

type FilterStatus = "all" | "open" | "acknowledged" | "in_progress" | "resolved" | "verified";
type FilterSeverity = "all" | "low" | "medium" | "high";
type SortMode = "newest" | "severity";
type PageState = "loading" | "ready" | "error" | "empty";

const STATUS_FILTERS: { value: FilterStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "verified", label: "Verified" },
];

const SEVERITY_FILTERS: { value: FilterSeverity; label: string }[] = [
  { value: "all", label: "All" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const STATUS_VARIANT: Record<string, "status-open" | "status-monitoring" | "status-resolved"> = {
  open: "status-open",
  acknowledged: "status-open",
  in_progress: "status-monitoring",
  resolved: "status-resolved",
  verified: "status-resolved",
};

const SEV_VARIANT: Record<string, "severity-high" | "severity-medium" | "severity-low"> = {
  high: "severity-high",
  medium: "severity-medium",
  low: "severity-low",
};

function statusLabel(status: string): string {
  switch (status) {
    case "open": return "Open";
    case "acknowledged": return "Acknowledged";
    case "in_progress": return "In Progress";
    case "resolved": return "Resolved";
    case "verified": return "Verified";
    default: return status;
  }
}

function nextActions(status: string): { label: string; nextStatus: string; variant: "primary" | "outline" | "success" }[] {
  switch (status) {
    case "open":
      return [{ label: "Acknowledge", nextStatus: "acknowledged", variant: "primary" }];
    case "acknowledged":
      return [
        { label: "Start Work", nextStatus: "in_progress", variant: "primary" },
        { label: "Resolve", nextStatus: "resolved", variant: "success" },
      ];
    case "in_progress":
      return [{ label: "Resolve", nextStatus: "resolved", variant: "success" }];
    case "resolved":
      return [{ label: "Verify", nextStatus: "verified", variant: "primary" }];
    default:
      return [];
  }
}

export function RepairList() {
  const spaceId = getSpaceId();
  const navigate = useNavigate();

  const [pageState, setPageState] = useState<PageState>("loading");
  const [repairs, setRepairs] = useState<RepairIssue[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterSeverity, setFilterSeverity] = useState<FilterSeverity>("all");
  const [filterSpace, setFilterSpace] = useState<string>("all");
  const [sort, setSort] = useState<SortMode>("newest");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);

  const loadRepairs = useCallback(() => {
    setPageState("loading");
    setError(null);
    const params = {
      spaceId: filterSpace !== "all" ? filterSpace : spaceId || undefined,
      status: filterStatus !== "all" ? filterStatus : undefined,
      severity: filterSeverity !== "all" ? filterSeverity : undefined,
      sort,
    };
    fetchAllRepairs(params)
      .then((res) => {
        setRepairs(res.data);
        setPageState(res.data.length === 0 ? "empty" : "ready");
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load repairs");
        setPageState("error");
      });
  }, [filterStatus, filterSeverity, filterSpace, sort, spaceId]);

  useEffect(() => {
    loadRepairs();
    listSpaces().then(setSpaces).catch(() => {});
  }, [loadRepairs]);

  const handleStatusChange = async (issueId: string, newStatus: string) => {
    try {
      await patchRepair(issueId, newStatus);
      loadRepairs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  const handleBulkAction = async (newStatus: string) => {
    try {
      await Promise.all(Array.from(selectedIds).map((id) => patchRepair(id, newStatus)));
      setSelectedIds(new Set());
      loadRepairs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk action failed");
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === repairs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(repairs.map((r) => r.id)));
    }
  };

  if (!spaceId && filterSpace === "all") {
    return (
      <div style={shell}>
        <EmptyState icon="&#128295;" title="No Space Selected" description="Select a space or use All Spaces to see repair issues." />
      </div>
    );
  }

  return (
    <div style={shell}>
      <div style={pageHeader}>
        <div>
          <h1 style={{ fontSize: "var(--sm-text-2xl)", fontWeight: 700 }}>Repair Issues</h1>
          <span style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)" }}>
            {repairs.length} issue{repairs.length !== 1 ? "s" : ""}{" "}
            {filterSpace !== "all" ? "" : "across all spaces"}
          </span>
        </div>
        <div style={{ display: "flex", gap: "var(--sm-space-3)" }}>
          <select
            style={selectStyle}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            aria-label="Sort repairs"
          >
            <option value="newest">Newest First</option>
            <option value="severity">Severity (Critical First)</option>
          </select>
          <Button variant="primary" size="md" onClick={() => setShowCreate(true)}>
            + New Issue
          </Button>
        </div>
      </div>

      {error && (
        <div style={errorBanner}>
          {error}
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
            x
          </button>
        </div>
      )}

      {/* Filters */}
      <div style={filterBar}>
        <div style={filterGroup}>
          {STATUS_FILTERS.map((f) => (
            <button key={f.value} style={filterPill(filterStatus === f.value)} onClick={() => setFilterStatus(f.value)}>
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ width: 1, height: 20, background: "var(--sm-border-default)", alignSelf: "center" }} />
        <div style={filterGroup}>
          {SEVERITY_FILTERS.map((f) => (
            <button key={f.value} style={filterPill(filterSeverity === f.value)} onClick={() => setFilterSeverity(f.value)}>
              {f.label}
            </button>
          ))}
        </div>
        {spaces.length > 1 && (
          <>
            <div style={{ width: 1, height: 20, background: "var(--sm-border-default)", alignSelf: "center" }} />
            <select style={selectStyle} value={filterSpace} onChange={(e) => setFilterSpace(e.target.value)} aria-label="Filter by space">
              <option value="all">All Spaces</option>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div style={bulkBar}>
          <span style={{ fontSize: "var(--sm-text-sm)", fontWeight: 500 }}>
            {selectedIds.size} selected
          </span>
          <Button variant="primary" size="sm" onClick={() => handleBulkAction("acknowledged")}>
            Acknowledge
          </Button>
          <Button variant="success" size="sm" onClick={() => handleBulkAction("resolved")}>
            Resolve
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* Loading skeleton */}
      {pageState === "loading" && (
        <div style={skeleton}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={skeletonRow} />
          ))}
        </div>
      )}

      {/* Error */}
      {pageState === "error" && (
        <div style={errorBlock}>
          <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)", marginBottom: "var(--sm-space-3)" }}>
            {error}
          </p>
          <Button variant="primary" size="sm" onClick={loadRepairs}>Retry</Button>
        </div>
      )}

      {/* Empty */}
      {pageState === "empty" && (
        <EmptyState
          icon="&#128295;"
          title="No repair issues found"
          description="Create your first repair issue or adjust filters."
          action={<Button variant="primary" onClick={() => setShowCreate(true)}>+ Create Issue</Button>}
        />
      )}

      {/* Table (desktop) */}
      {pageState === "ready" && (
        <>
          <div className="desktop-table" style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 32 }}>
                    <input type="checkbox" checked={selectedIds.size === repairs.length && repairs.length > 0} onChange={toggleAll} />
                  </th>
                  <th style={th}>Issue</th>
                  <th style={th}>Space</th>
                  <th style={th}>Severity</th>
                  <th style={th}>Status</th>
                  <th style={th}>Detected</th>
                  <th style={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {repairs.map((r) => (
                  <tr
                    key={r.id}
                    style={tr}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "var(--sm-neutral-50)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
                  >
                    <td style={td}>
                      <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} />
                    </td>
                    <td style={td} onClick={() => navigate(`/repairs/${r.id}`)}>
                      <div style={{ fontWeight: 600, fontSize: "var(--sm-text-sm)", marginBottom: 2, cursor: "pointer" }}>
                        {r.title}
                      </div>
                      {r.description && (
                        <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-secondary)" }}>
                          {r.description}
                        </div>
                      )}
                    </td>
                    <td style={td}>
                      <span style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-secondary)" }}>
                        {r.spaceId}
                      </span>
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
                        {statusLabel(r.status)}
                      </Badge>
                    </td>
                    <td style={{ ...td, fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)" }}>
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: "var(--sm-space-1)", flexWrap: "wrap" }}>
                        {nextActions(r.status).map((action) => (
                          <Button
                            key={action.nextStatus}
                            variant={action.variant}
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handleStatusChange(r.id, action.nextStatus); }}
                          >
                            {action.label}
                          </Button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards (mobile) */}
          <div className="mobile-cards" style={{ display: "none", flexDirection: "column", gap: "var(--sm-space-3)" }}>
            {repairs.map((r) => (
              <div
                key={r.id}
                style={mobileCardStyle}
                onClick={() => navigate(`/repairs/${r.id}`)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--sm-space-2)", marginBottom: "var(--sm-space-2)" }}>
                  <div style={{ fontSize: "var(--sm-text-sm)", fontWeight: 600, flex: 1, minWidth: 0 }}>
                    {r.title}
                  </div>
                  <div style={{ display: "flex", gap: "var(--sm-space-1)", flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={(e) => { e.stopPropagation(); toggleSelect(r.id); }}
                      style={{ width: 16, height: 16 }}
                      aria-label={`Select ${r.title}`}
                    />
                  </div>
                </div>
                {r.description && (
                  <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-secondary)", marginBottom: "var(--sm-space-2)" }}>
                    {r.description}
                  </div>
                )}
                <div style={{ display: "flex", gap: "var(--sm-space-2)", alignItems: "center", flexWrap: "wrap", marginBottom: "var(--sm-space-2)" }}>
                  {r.severity ? (
                    <Badge variant={SEV_VARIANT[r.severity] || "severity-low"}>{r.severity}</Badge>
                  ) : (
                    <span style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)" }}>--</span>
                  )}
                  <Badge variant={STATUS_VARIANT[r.status] || "status-open"} dot>
                    {statusLabel(r.status)}
                  </Badge>
                  <span style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)", marginLeft: "auto" }}>
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {nextActions(r.status).length > 0 && (
                  <div style={{ display: "flex", gap: "var(--sm-space-1)", flexWrap: "wrap" }}>
                    {nextActions(r.status).map((action) => (
                      <Button
                        key={action.nextStatus}
                        variant={action.variant}
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleStatusChange(r.id, action.nextStatus); }}
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Create Form Modal */}
      {showCreate && (
        <CreateForm
          spaceId={filterSpace !== "all" ? filterSpace : (spaceId || spaces[0]?.id || "")}
          spaces={spaces}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadRepairs();
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
  spaces,
  onClose,
  onCreated,
  onError,
}: {
  spaceId: string;
  spaces: Space[];
  onClose: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("");
  const [selectedSpaceId, setSelectedSpaceId] = useState(spaceId);
  const [itemId, setItemId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (!selectedSpaceId) { onError("No space selected"); return; }

    setSubmitting(true);
    try {
      await createRepair(selectedSpaceId, {
        title: title.trim(),
        description: description.trim() || undefined,
        severity: severity || undefined,
        itemId: itemId.trim() || undefined,
      });
      onCreated();
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
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "var(--sm-text-lg)", cursor: "pointer", color: "var(--sm-text-tertiary)", lineHeight: 1 }}>
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={formFields}>
            <label style={labelStyle}>
              Space
              <select style={inputStyle} value={selectedSpaceId} onChange={(e) => setSelectedSpaceId(e.target.value)} required>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Title <span style={{ color: "var(--sm-danger-500)" }}>*</span>
              <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Leaky faucet in kitchen" required autoFocus />
            </label>
            <label style={labelStyle}>
              Description
              <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the issue..." />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sm-space-4)" }}>
              <label style={labelStyle}>
                Severity
                <select style={inputStyle} value={severity} onChange={(e) => setSeverity(e.target.value)}>
                  <option value="">None</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label style={labelStyle}>
                Linked Item ID
                <input style={inputStyle} value={itemId} onChange={(e) => setItemId(e.target.value)} placeholder="Optional item ID" />
              </label>
            </div>
          </div>
          <div style={modalFooter}>
            <Button variant="outline" onClick={onClose} type="button">Cancel</Button>
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
  maxWidth: 1100,
  margin: "0 auto",
  padding: "0 var(--sm-space-4)",
  paddingTop: "var(--sm-space-6)",
  paddingBottom: "var(--sm-space-8)",
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
  marginBottom: "var(--sm-space-4)",
  flexWrap: "wrap",
  alignItems: "center",
};

const filterGroup: React.CSSProperties = {
  display: "flex",
  gap: "var(--sm-space-2)",
  flexWrap: "wrap",
};

const filterPill = (active: boolean): React.CSSProperties => ({
  font: "inherit",
  fontSize: "var(--sm-text-xs)",
  fontWeight: 500,
  padding: "var(--sm-space-1) var(--sm-space-3)",
  minHeight: 32,
  border: `1px solid ${active ? "var(--sm-brand-600)" : "var(--sm-border-default)"}`,
  borderRadius: "var(--sm-radius-full)",
  cursor: "pointer",
  background: active ? "var(--sm-brand-600)" : "var(--sm-surface-card)",
  color: active ? "var(--sm-text-inverse)" : "var(--sm-text-secondary)",
  transition: "all var(--sm-transition-fast)",
});

const selectStyle: React.CSSProperties = {
  font: "inherit",
  fontSize: "var(--sm-text-xs)",
  padding: "var(--sm-space-1) var(--sm-space-3)",
  minHeight: 32,
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-md)",
  background: "var(--sm-surface-card)",
  color: "var(--sm-text-primary)",
};

const bulkBar: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--sm-space-3)",
  padding: "var(--sm-space-3) var(--sm-space-4)",
  marginBottom: "var(--sm-space-4)",
  background: "var(--sm-brand-50)",
  border: "1px solid var(--sm-brand-200)",
  borderRadius: "var(--sm-radius-lg)",
};

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
  padding: "var(--sm-space-2) var(--sm-space-3)",
  borderBottom: "1px solid var(--sm-border-default)",
};

const td: React.CSSProperties = {
  padding: "var(--sm-space-3) var(--sm-space-3)",
  borderBottom: "1px solid var(--sm-border-default)",
  fontSize: "var(--sm-text-sm)",
  verticalAlign: "middle",
};

const tr: React.CSSProperties = {
  cursor: "default",
  transition: "background var(--sm-transition-fast)",
};

const skeleton: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--sm-space-2)",
};

const skeletonRow: React.CSSProperties = {
  height: 48,
  borderRadius: "var(--sm-radius-md)",
  background: "var(--sm-neutral-100)",
  animation: "pulse 2s ease infinite",
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

const errorBlock: React.CSSProperties = {
  textAlign: "center",
  padding: "var(--sm-space-8) var(--sm-space-4)",
  border: "1px solid #fecaca",
  borderRadius: "var(--sm-radius-xl)",
  background: "#fef2f2",
};

// Modal styles
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

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--sm-space-1)",
  fontSize: "var(--sm-text-sm)",
  fontWeight: 500,
  color: "var(--sm-text-secondary)",
};

const inputStyle: React.CSSProperties = {
  font: "inherit",
  fontSize: "var(--sm-text-sm)",
  padding: "var(--sm-space-2) var(--sm-space-3)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-md)",
  background: "var(--sm-surface-page)",
  color: "var(--sm-text-primary)",
};

const mobileCardStyle: React.CSSProperties = {
  padding: "var(--sm-space-4)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-lg)",
  background: "var(--sm-surface-card)",
  cursor: "pointer",
  transition: "box-shadow var(--sm-transition-fast)",
};

const modalFooter: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "var(--sm-space-3)",
  padding: "var(--sm-space-4) var(--sm-space-6)",
  borderTop: "1px solid var(--sm-border-default)",
};
