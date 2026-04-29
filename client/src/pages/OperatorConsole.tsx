import { useEffect, useState, useCallback } from "react";
import {
  listReviewQueue,
  getReviewTask,
  processAction,
  type ReviewTask,
  type ItemObservation,
  type RepairObservation,
} from "../api";

type TabId = "pending" | "completed";

export function OperatorConsole() {
  const [tasks, setTasks] = useState<ReviewTask[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReviewTask | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      setError(null);
      const t = await listReviewQueue(activeTab === "completed" ? "completed" : "pending");
      setTasks(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load queue");
    }
  }, [activeTab]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    getReviewTask(selectedId)
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [selectedId]);

  const handleAction = async (actionType: string, observationId?: string, extra?: Record<string, string>) => {
    if (!selectedId) return;
    try {
      await processAction(selectedId, { actionType, observationId, ...extra });
      setActionsOpen(false);
      fetchTasks();
      if (detail) {
        const updated = await getReviewTask(selectedId);
        setDetail(updated);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  };

  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const completedCount = tasks.filter((t) => t.status === "completed").length;

  return (
    <div style={consoleStyle}>
      {/* Header */}
      <header style={headerStyle}>
        <h1 style={{ fontSize: "var(--sm-text-lg)", fontWeight: 600, margin: 0 }}>Operator Console</h1>
        {detail?.walkthrough && (
          <span style={badgeStyle}>
            Walkthrough {detail.walkthrough.id.slice(0, 8)}
          </span>
        )}
      </header>

      {/* Error banner */}
      {error && (
        <div style={errorBannerStyle}>
          {error}
          <button onClick={() => setError(null)} style={dismissStyle}>x</button>
        </div>
      )}

      {/* Queue Panel (Left) */}
      <nav style={queuePanelStyle} aria-label="Candidate queue">
        <div style={tabsStyle}>
          <button
            style={tabStyle(activeTab === "pending")}
            onClick={() => { setActiveTab("pending"); setSelectedId(null); }}
          >
            Pending <span style={countStyle(activeTab === "pending")}>{pendingCount}</span>
          </button>
          <button
            style={tabStyle(activeTab === "completed")}
            onClick={() => { setActiveTab("completed"); setSelectedId(null); }}
          >
            Completed <span style={countStyle(activeTab === "completed")}>{completedCount}</span>
          </button>
        </div>
        <div style={queueListStyle}>
          {tasks.map((task) => {
            const obs = task.itemObservations || [];
            const firstObs = obs[0];
            const highConf = obs.filter((o) => (o.confidence || 0) >= 0.9).length;
            return (
              <div
                key={task.id}
                style={candidateStyle(task.id === selectedId)}
                onClick={() => setSelectedId(task.id)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--sm-space-2)", marginBottom: "var(--sm-space-1)" }}>
                  <span style={{ fontSize: "var(--sm-text-sm)", fontWeight: 600 }}>
                    {obs.length} observation{obs.length !== 1 ? "s" : ""}
                  </span>
                  {highConf > 0 && (
                    <span style={confidenceStyle}>
                      {highConf} high confidence
                    </span>
                  )}
                </div>
                {firstObs && (
                  <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-secondary)", marginBottom: "var(--sm-space-1)" }}>
                    {firstObs.label}
                    {firstObs.zone && ` — ${firstObs.zone.name}`}
                  </div>
                )}
                <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)" }}>
                  {task.walkthrough.uploadedAt
                    ? new Date(task.walkthrough.uploadedAt).toLocaleDateString()
                    : task.createdAt.slice(0, 10)}
                </div>
              </div>
            );
          })}
          {tasks.length === 0 && (
            <div style={{ padding: "var(--sm-space-4)", textAlign: "center", color: "var(--sm-text-tertiary)", fontSize: "var(--sm-text-sm)" }}>
              No {activeTab} tasks
            </div>
          )}
        </div>
      </nav>

      {/* Main Panel (Center) */}
      <main style={mainStyle}>
        {!detail ? (
          <div style={emptyStyle}>
            <div style={{ fontSize: 48, marginBottom: "var(--sm-space-4)" }}>&#9776;</div>
            <p style={{ maxWidth: 320, fontSize: "var(--sm-text-sm)", color: "var(--sm-text-tertiary)" }}>
              Select a task from the queue to review observations and take action.
            </p>
          </div>
        ) : (
          <DetailView
            detail={detail}
            onAction={handleAction}
            selectedId={selectedId!}
          />
        )}
      </main>

      {/* Actions Panel (Right) */}
      <aside
        style={{
          ...actionsStyle,
          transform: actionsOpen ? "translateX(0)" : undefined,
        }}
        id="actions-panel"
      >
        <ActionsView
          detail={detail}
          onAction={handleAction}
        />
      </aside>

      {/* Mobile actions toggle */}
      <button
        style={fabStyle}
        onClick={() => setActionsOpen(!actionsOpen)}
        aria-label="Toggle actions panel"
      >
        {actionsOpen ? "✕" : "⚙"}
      </button>
      {actionsOpen && (
        <div style={overlayStyle} onClick={() => setActionsOpen(false)} />
      )}
    </div>
  );
}

// ── Detail View ─────────────────────────────────────────────────────

function DetailView({
  detail,
  onAction,
  selectedId,
}: {
  detail: ReviewTask;
  onAction: (type: string, obsId?: string, extra?: Record<string, string>) => void;
  selectedId: string;
}) {
  const observations = detail.itemObservations || [];
  const repairs = detail.repairObservations || [];
  const activeObs = observations[0];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "var(--sm-space-6)" }}>
      {activeObs ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--sm-space-6)", flexWrap: "wrap", gap: "var(--sm-space-3)" }}>
            <div>
              <h2 style={{ fontSize: "var(--sm-text-xl)", marginBottom: "var(--sm-space-1)" }}>
                {activeObs.label}
              </h2>
              <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)" }}>
                {activeObs.zone?.name && `Zone ${activeObs.zone.name}`}
                {activeObs.storageLocation?.name && ` — ${activeObs.storageLocation.name}`}
              </p>
            </div>
            {activeObs.confidence != null && (
              <span style={confidencePillStyle(activeObs.confidence)}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", display: "inline-block", background: activeObs.confidence >= 0.9 ? "var(--sm-success-500)" : activeObs.confidence >= 0.7 ? "var(--sm-warning-400)" : "var(--sm-danger-500)" }} />
                {" "}{Math.round(activeObs.confidence * 100)}% match
              </span>
            )}
          </div>

          {/* Evidence frame */}
          <div style={frameStyle}>
            {activeObs.keyframeUrl ? (
              <img
                src={activeObs.keyframeUrl}
                alt="Evidence frame"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div style={framePlaceholderStyle}>
                [Frame — {activeObs.zone?.name || "Unknown zone"}]
              </div>
            )}
            <div style={frameOverlayStyle}>
              <span style={frameBadgeStyle}>
                {activeObs.zone?.name && `Zone ${activeObs.zone.name}`}
              </span>
            </div>
          </div>

          {/* Detail grid */}
          <div style={detailGridStyle}>
            <Field label="Proposed Identity" value={activeObs.label} sub={`Status: ${activeObs.status}`} />
            <Field
              label="Current Location"
              value={[
                activeObs.zone?.name && `Zone ${activeObs.zone.name}`,
                activeObs.storageLocation?.name,
              ].filter(Boolean).join(" — ") || "Unknown"}
              sub={`Confidence: ${activeObs.confidence != null ? Math.round(activeObs.confidence * 100) + "%" : "N/A"}`}
            />
            <Field label="Observation ID" value={activeObs.id.slice(0, 12) + "..."} sub={`Created ${activeObs.createdAt.slice(0, 10)}`} />
            <Field label="Walkthrough" value={detail.walkthroughId.slice(0, 12) + "..."} sub={`Status: ${detail.walkthrough.status}`} />
          </div>

          {/* Observation list */}
          {observations.length > 1 && (
            <div style={{ marginBottom: "var(--sm-space-6)" }}>
              <h3 style={sectionTitleStyle}>All Observations ({observations.length})</h3>
              {observations.map((obs) => (
                <div key={obs.id} style={obsRowStyle}>
                  <span style={{ fontSize: "var(--sm-text-sm)", fontWeight: 500 }}>{obs.label}</span>
                  <span style={statusBadgeStyle(obs.status)}>{obs.status}</span>
                </div>
              ))}
            </div>
          )}

          {/* Repair observations */}
          {repairs.length > 0 && (
            <div style={{ marginBottom: "var(--sm-space-6)" }}>
              <h3 style={sectionTitleStyle}>Repair Observations ({repairs.length})</h3>
              {repairs.map((rep) => (
                <div key={rep.id} style={obsRowStyle}>
                  <span style={{ fontSize: "var(--sm-text-sm)", fontWeight: 500 }}>{rep.label}</span>
                  <span style={statusBadgeStyle(rep.status)}>{rep.status}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div style={emptyStyle}>
          <p style={{ color: "var(--sm-text-tertiary)", fontSize: "var(--sm-text-sm)" }}>
            No observations in this task.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Actions View ─────────────────────────────────────────────────────

function ActionsView({
  detail,
  onAction,
}: {
  detail: ReviewTask | null;
  onAction: (type: string, obsId?: string, extra?: Record<string, string>) => void;
}) {
  const [resolutionNote, setResolutionNote] = useState("");

  if (!detail) {
    return (
      <div style={{ padding: "var(--sm-space-4)" }}>
        <h3 style={sectionTitleStyle}>Actions</h3>
        <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-tertiary)" }}>
          Select a task to see available actions.
        </p>
      </div>
    );
  }

  const observations = detail.itemObservations || [];
  const repairs = detail.repairObservations || [];
  const firstObs = observations[0];

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <h3 style={{ fontSize: "var(--sm-text-sm)", fontWeight: 600, marginBottom: "var(--sm-space-4)" }}>
        Actions
      </h3>

      {/* Quick accept */}
      {firstObs && firstObs.confidence != null && firstObs.confidence >= 0.9 && firstObs.status === "pending" && (
        <div style={quickAcceptStyle}>
          <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-success-700)", marginBottom: "var(--sm-space-2)" }}>
            High confidence — quick accept available
          </div>
          <button
            style={btnStyle("success")}
            onClick={() => onAction("accept", firstObs.id)}
          >
            Confirm Identity &amp; Location
          </button>
        </div>
      )}

      {/* Item Identity */}
      {firstObs && firstObs.status === "pending" && (
        <ActionGroup title="Item Identity">
          <button
            style={btnStyle("outline", true)}
            onClick={() => onAction("accept", firstObs.id)}
          >
            Accept Observation
          </button>
          <button
            style={btnStyle("ghost", true)}
            onClick={() => onAction("reject", firstObs.id)}
          >
            Reject Observation
          </button>
        </ActionGroup>
      )}

      {/* Relabel */}
      {firstObs && firstObs.status === "pending" && (
        <ActionGroup title="Relabel">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const input = form.elements.namedItem("newLabel") as HTMLInputElement;
              if (input.value.trim()) {
                onAction("relabel", firstObs.id, {
                  newLabel: input.value.trim(),
                  previousLabel: firstObs.label,
                });
              }
            }}
          >
            <input
              name="newLabel"
              placeholder="New label…"
              defaultValue={firstObs.label}
              style={inputStyle}
            />
            <button type="submit" style={btnStyle("outline", true)}>
              Relabel
            </button>
          </form>
        </ActionGroup>
      )}

      {/* Repair actions */}
      {repairs.map((rep) => (
        <ActionGroup key={rep.id} title={`Repair: ${rep.label}`}>
          <button style={btnStyle("outline", true)} onClick={() => onAction("accept", rep.id)}>
            Accept — Open Repair
          </button>
          <button style={btnStyle("ghost", true)} onClick={() => onAction("reject", rep.id)}>
            Reject — False Positive
          </button>
        </ActionGroup>
      ))}

      {/* Resolution note */}
      <div style={{ marginBottom: "var(--sm-space-6)" }}>
        <h4 style={groupTitleStyle}>Resolution Note</h4>
        <textarea
          style={textareaStyle}
          placeholder="Evidence note for audit trail…"
          value={resolutionNote}
          onChange={(e) => setResolutionNote(e.target.value)}
        />
      </div>

      {/* History */}
      {detail.actions && detail.actions.length > 0 && (
        <div>
          <h4 style={groupTitleStyle}>Recent Actions</h4>
          {detail.actions.slice(0, 10).map((a) => (
            <div key={a.id} style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-secondary)", marginBottom: "var(--sm-space-1)" }}>
              <strong>{a.actionType}</strong>
              {a.newLabel && ` → ${a.newLabel}`}
              {" "}
              <span style={{ color: "var(--sm-text-tertiary)" }}>
                {new Date(a.createdAt).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Shared mini-components ──────────────────────────────────────────

function Field({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--sm-space-1)" }}>
        {label}
      </div>
      <div style={{ fontSize: "var(--sm-text-sm)", fontWeight: 500 }}>{value}</div>
      {sub && <div style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)" }}>{sub}</div>}
    </div>
  );
}

function ActionGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "var(--sm-space-6)" }}>
      <h4 style={groupTitleStyle}>{title}</h4>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sm-space-2)" }}>
        {children}
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const consoleStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "var(--sm-sidebar-width) 1fr 320px",
  gridTemplateRows: "var(--sm-header-height) 1fr",
  gridTemplateAreas: '"header header header" "queue main actions"',
  height: "calc(100vh - 57px)",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  gridArea: "header",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 var(--sm-space-6)",
  background: "var(--sm-surface-card)",
  borderBottom: "1px solid var(--sm-border-default)",
  gap: "var(--sm-space-4)",
};

const badgeStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-xs)",
  fontWeight: 500,
  padding: "2px 8px",
  borderRadius: "var(--sm-radius-full)",
  background: "var(--sm-brand-100)",
  color: "var(--sm-brand-700)",
};

const queuePanelStyle: React.CSSProperties = {
  gridArea: "queue",
  display: "flex",
  flexDirection: "column",
  borderRight: "1px solid var(--sm-border-default)",
  background: "var(--sm-surface-sidebar)",
  overflow: "hidden",
};

const tabsStyle: React.CSSProperties = {
  display: "flex",
  borderBottom: "1px solid var(--sm-border-default)",
};

const tabStyle = (active: boolean): React.CSSProperties => ({
  flex: 1,
  padding: "var(--sm-space-3) var(--sm-space-2)",
  fontSize: "var(--sm-text-xs)",
  fontWeight: 500,
  textAlign: "center",
  border: "none",
  background: "none",
  color: active ? "var(--sm-brand-600)" : "var(--sm-text-secondary)",
  cursor: "pointer",
  borderBottom: `2px solid ${active ? "var(--sm-brand-600)" : "transparent"}`,
});

const countStyle = (active: boolean): React.CSSProperties => ({
  display: "inline-block",
  marginLeft: 4,
  padding: "0 6px",
  fontSize: 10,
  borderRadius: "var(--sm-radius-full)",
  background: active ? "var(--sm-brand-100)" : "var(--sm-neutral-200)",
  color: active ? "var(--sm-brand-700)" : "var(--sm-text-secondary)",
});

const queueListStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "var(--sm-space-2)",
};

const candidateStyle = (active: boolean): React.CSSProperties => ({
  padding: "var(--sm-space-3)",
  marginBottom: "var(--sm-space-2)",
  borderRadius: "var(--sm-radius-md)",
  border: `1px solid ${active ? "var(--sm-brand-400)" : "var(--sm-border-default)"}`,
  background: "var(--sm-surface-card)",
  cursor: "pointer",
  boxShadow: active ? "0 0 0 1px var(--sm-brand-400)" : undefined,
});

const confidenceStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: "1px 6px",
  borderRadius: "var(--sm-radius-full)",
  background: "#dcfce7",
  color: "var(--sm-success-700)",
};

const mainStyle: React.CSSProperties = {
  gridArea: "main",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const emptyStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--sm-text-tertiary)",
  textAlign: "center",
  padding: "var(--sm-space-8)",
};

const actionsStyle: React.CSSProperties = {
  gridArea: "actions",
  borderLeft: "1px solid var(--sm-border-default)",
  background: "var(--sm-surface-sidebar)",
  overflowY: "auto",
  padding: "var(--sm-space-4)",
};

const frameStyle: React.CSSProperties = {
  borderRadius: "var(--sm-radius-lg)",
  border: "1px solid var(--sm-border-default)",
  overflow: "hidden",
  marginBottom: "var(--sm-space-6)",
  background: "var(--sm-neutral-100)",
  aspectRatio: "16 / 9",
  position: "relative",
};

const framePlaceholderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  color: "var(--sm-text-tertiary)",
  fontSize: "var(--sm-text-sm)",
};

const frameOverlayStyle: React.CSSProperties = {
  position: "absolute",
  bottom: "var(--sm-space-3)",
  left: "var(--sm-space-3)",
  right: "var(--sm-space-3)",
  display: "flex",
  gap: "var(--sm-space-2)",
};

const frameBadgeStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-xs)",
  padding: "3px 8px",
  borderRadius: "var(--sm-radius-sm)",
  background: "rgba(0,0,0,0.65)",
  color: "#fff",
};

const detailGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "var(--sm-space-4)",
  marginBottom: "var(--sm-space-6)",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-sm)",
  fontWeight: 600,
  marginBottom: "var(--sm-space-3)",
  color: "var(--sm-text-secondary)",
};

const groupTitleStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-xs)",
  fontWeight: 500,
  color: "var(--sm-text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: "var(--sm-space-2)",
};

const quickAcceptStyle: React.CSSProperties = {
  padding: "var(--sm-space-3)",
  borderRadius: "var(--sm-radius-md)",
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  marginBottom: "var(--sm-space-6)",
};

const obsRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "var(--sm-space-2) var(--sm-space-3)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-md)",
  marginBottom: "var(--sm-space-1)",
};

const errorBannerStyle: React.CSSProperties = {
  gridArea: "header",
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 200,
  background: "var(--sm-danger-500)",
  color: "#fff",
  padding: "var(--sm-space-2) var(--sm-space-6)",
  fontSize: "var(--sm-text-sm)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const dismissStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: "var(--sm-text-base)",
};

const fabStyle: React.CSSProperties = {
  display: "none",
  position: "fixed",
  right: "var(--sm-space-4)",
  bottom: "var(--sm-space-4)",
  zIndex: 101,
  width: 48,
  height: 48,
  borderRadius: "var(--sm-radius-full)",
  background: "var(--sm-brand-600)",
  color: "var(--sm-text-inverse)",
  border: "none",
  fontSize: 20,
  cursor: "pointer",
  boxShadow: "var(--sm-shadow-md)",
  alignItems: "center",
  justifyContent: "center",
};

const overlayStyle: React.CSSProperties = {
  display: "none",
  position: "fixed",
  inset: 0,
  background: "var(--sm-surface-overlay)",
  zIndex: 99,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  font: "inherit",
  fontSize: "var(--sm-text-sm)",
  padding: "var(--sm-space-2)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-md)",
  background: "var(--sm-surface-card)",
  color: "var(--sm-text-primary)",
  marginBottom: "var(--sm-space-2)",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  minHeight: 60,
};

function confidencePillStyle(confidence: number): React.CSSProperties {
  const color =
    confidence >= 0.9 ? "var(--sm-success-700)" :
    confidence >= 0.7 ? "var(--sm-warning-600)" :
    "var(--sm-danger-700)";
  const bg =
    confidence >= 0.9 ? "#dcfce7" :
    confidence >= 0.7 ? "#fef9c3" :
    "#fee2e2";

  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
    fontSize: 11,
    fontWeight: 600,
    padding: "1px 6px",
    borderRadius: "var(--sm-radius-full)",
    background: bg,
    color,
  };
}

function statusBadgeStyle(status: string): React.CSSProperties {
  const map: Record<string, { bg: string; color: string }> = {
    pending: { bg: "#fef3c7", color: "#92400e" },
    accepted: { bg: "#dcfce7", color: "var(--sm-success-700)" },
    rejected: { bg: "#fee2e2", color: "var(--sm-danger-700)" },
  };
  const s = map[status] || map.pending;
  return {
    fontSize: 11,
    fontWeight: 500,
    padding: "2px 8px",
    borderRadius: "var(--sm-radius-full)",
    background: s.bg,
    color: s.color,
  };
}

function btnStyle(variant: "primary" | "success" | "outline" | "ghost" | "danger", block?: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "var(--sm-space-2)",
    font: "inherit",
    fontSize: "var(--sm-text-xs)",
    fontWeight: 500,
    padding: "var(--sm-space-1) var(--sm-space-3)",
    borderRadius: "var(--sm-radius-md)",
    border: "1px solid transparent",
    cursor: "pointer",
    minHeight: 32,
    transition: "background var(--sm-transition-fast)",
    whiteSpace: "nowrap",
    width: block ? "100%" : undefined,
  };

  switch (variant) {
    case "primary":
      return { ...base, background: "var(--sm-brand-600)", color: "var(--sm-text-inverse)" };
    case "success":
      return { ...base, background: "var(--sm-success-600)", color: "var(--sm-text-inverse)", fontSize: "var(--sm-text-sm)", padding: "var(--sm-space-2) var(--sm-space-4)", minHeight: 44 };
    case "danger":
      return { ...base, background: "var(--sm-danger-600)", color: "var(--sm-text-inverse)" };
    case "ghost":
      return { ...base, background: "transparent", color: "var(--sm-text-secondary)" };
    case "outline":
    default:
      return { ...base, background: "var(--sm-surface-card)", borderColor: "var(--sm-border-default)", color: "var(--sm-text-primary)" };
  }
}
