import { useEffect, useState, useCallback, useRef } from "react";
import {
  listReviewQueue,
  getReviewTask,
  processAction,
  bulkProcessActions,
  searchItems,
  type ReviewTask,
  type ItemObservation,
  type RepairObservation,
  type InventoryItem,
} from "../api";

type TabId = "pending" | "completed";

export function OperatorConsole() {
  const [tasks, setTasks] = useState<ReviewTask[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>("pending");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReviewTask | null>(null);
  const [selectedObsIndex, setSelectedObsIndex] = useState(0);
  const [batchSelection, setBatchSelection] = useState<Set<string>>(new Set());
  const [actionsOpen, setActionsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mergeOpen, setMergeOpen] = useState<string | null>(null); // obsId of merge target
  const [mergeQuery, setMergeQuery] = useState("");
  const [mergeResults, setMergeResults] = useState<InventoryItem[]>([]);
  const [relabelingId, setRelabelingId] = useState<string | null>(null);
  const [relabelValue, setRelabelValue] = useState("");
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const rangeAnchorRef = useRef<string | null>(null);

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
      setSelectedObsIndex(0);
      setBatchSelection(new Set());
      return;
    }
    setSelectedObsIndex(0);
    setBatchSelection(new Set());
    getReviewTask(selectedId)
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [selectedId]);

  // Merge search debounce
  const mergeTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!mergeOpen || !detail) return;
    if (!mergeQuery.trim()) {
      setMergeResults([]);
      return;
    }
    const spaceId = detail.walkthrough.spaceId;
    clearTimeout(mergeTimer.current);
    mergeTimer.current = setTimeout(async () => {
      try {
        const items = await searchItems(spaceId, mergeQuery.trim());
        setMergeResults(items);
      } catch {
        setMergeResults([]);
      }
    }, 250);
    return () => clearTimeout(mergeTimer.current);
  }, [mergeQuery, mergeOpen, detail]);

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

  const toggleBatch = (obsId: string) => {
    setBatchSelection((prev) => {
      const next = new Set(prev);
      if (next.has(obsId)) next.delete(obsId);
      else next.add(obsId);
      return next;
    });
  };

  const handleBatchAccept = async () => {
    if (batchSelection.size === 0) return;
    setError(null);
    try {
      const { results } = await bulkProcessActions({
        itemIds: [...batchSelection],
        action: "accept",
      });
      const errors = results.filter((r) => r.status === "error");
      if (errors.length > 0) {
        setError(`${errors.length} of ${results.length} failed: ${errors[0].error}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Batch accept failed");
    }
    setBatchSelection(new Set());
    fetchTasks();
    if (selectedId) {
      const updated = await getReviewTask(selectedId);
      setDetail(updated);
    }
  };

  const handleBatchReject = async () => {
    if (batchSelection.size === 0) return;
    setError(null);
    try {
      const { results } = await bulkProcessActions({
        itemIds: [...batchSelection],
        action: "reject",
      });
      const errors = results.filter((r) => r.status === "error");
      if (errors.length > 0) {
        setError(`${errors.length} of ${results.length} failed: ${errors[0].error}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Batch reject failed");
    }
    setBatchSelection(new Set());
    setShowRejectConfirm(false);
    fetchTasks();
    if (selectedId) {
      const updated = await getReviewTask(selectedId);
      setDetail(updated);
    }
  };

  const handleRangeSelect = (obsId: string) => {
    if (!detail) return;
    const observations = detail.itemObservations || [];
    setBatchSelection((prev) => {
      const next = new Set(prev);
      if (!rangeAnchorRef.current) {
        rangeAnchorRef.current = obsId;
        if (next.has(obsId)) next.delete(obsId);
        else next.add(obsId);
        return next;
      }

      const anchorIdx = observations.findIndex((o) => o.id === rangeAnchorRef.current);
      const currentIdx = observations.findIndex((o) => o.id === obsId);
      if (anchorIdx === -1 || currentIdx === -1) return next;

      const [start, end] = anchorIdx < currentIdx ? [anchorIdx, currentIdx] : [currentIdx, anchorIdx];
      const selectAll = !next.has(obsId);
      for (let i = start; i <= end; i++) {
        if (selectAll) next.add(observations[i].id);
        else next.delete(observations[i].id);
      }
      return next;
    });
  };

  const handleMerge = async (obsId: string, targetItemId: string) => {
    await handleAction("merge", obsId, { itemId: targetItemId });
    setMergeOpen(null);
    setMergeQuery("");
    setMergeResults([]);
  };

  const handleRelabel = async (obsId: string) => {
    if (!relabelValue.trim()) {
      setRelabelingId(null);
      return;
    }
    await handleAction("relabel", obsId, { newLabel: relabelValue.trim() });
    setRelabelingId(null);
    setRelabelValue("");
  };

  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const completedCount = tasks.filter((t) => t.status === "completed").length;

  return (
    <div className="review-console" style={consoleStyle}>
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
      <nav className="queue-panel" style={queuePanelStyle} aria-label="Candidate queue">
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
            selectedObsIndex={selectedObsIndex}
            setSelectedObsIndex={setSelectedObsIndex}
            onAction={handleAction}
            onMergeOpen={(obsId) => setMergeOpen(obsId)}
            batchSelection={batchSelection}
            onToggleBatch={toggleBatch}
            onRangeSelect={handleRangeSelect}
            selectedId={selectedId!}
            rangeAnchorRef={rangeAnchorRef}
            relabelingId={relabelingId}
            relabelValue={relabelValue}
            onRelabelStart={(obsId, currentLabel) => { setRelabelingId(obsId); setRelabelValue(currentLabel); }}
            onRelabelChange={setRelabelValue}
            onRelabelSave={handleRelabel}
            onRelabelCancel={() => { setRelabelingId(null); setRelabelValue(""); }}
          />
        )}
      </main>

      {/* Actions Panel (Right) */}
      <aside
        className={`actions-panel${actionsOpen ? " open" : ""}`}
        style={actionsStyle}
        id="actions-panel"
      >
        <ActionsView
          detail={detail}
          onAction={handleAction}
          batchSelection={batchSelection}
          onToggleBatch={toggleBatch}
          onBatchAccept={handleBatchAccept}
          onBatchReject={() => setShowRejectConfirm(true)}
        />
      </aside>

      {/* Merge search modal */}
      {mergeOpen && (
        <div style={modalOverlayStyle} onClick={() => { setMergeOpen(null); setMergeQuery(""); setMergeResults([]); }}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sm-space-4)" }}>
              <h3 style={{ margin: 0, fontSize: "var(--sm-text-base)", fontWeight: 600 }}>Merge into Existing Item</h3>
              <button
                style={{ ...btnStyle("ghost"), padding: 0 }}
                onClick={() => { setMergeOpen(null); setMergeQuery(""); setMergeResults([]); }}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-secondary)", marginBottom: "var(--sm-space-3)" }}>
              Search inventory to link observation <strong>{detail?.itemObservations?.find((o: ItemObservation) => o.id === mergeOpen)?.label || mergeOpen.slice(0, 8)}</strong> to an existing item.
            </p>
            <input
              style={inputStyle}
              placeholder="Search inventory by name…"
              value={mergeQuery}
              onChange={(e) => setMergeQuery(e.target.value)}
              autoFocus
            />
            <div style={{ maxHeight: 240, overflowY: "auto", marginTop: "var(--sm-space-2)" }}>
              {mergeResults.length === 0 && mergeQuery.trim() && (
                <p style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)", textAlign: "center", padding: "var(--sm-space-4)" }}>
                  No matching items found
                </p>
              )}
              {mergeResults.map((item) => (
                <button
                  key={item.id}
                  style={mergeResultStyle}
                  onClick={() => handleMerge(mergeOpen, item.id)}
                >
                  <div>
                    <div style={{ fontSize: "var(--sm-text-sm)", fontWeight: 500 }}>{item.name}</div>
                    <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)" }}>
                      {item.category || "No category"}
                      {item.latestLocation?.zone?.name && ` · Zone ${item.latestLocation.zone.name}`}
                    </div>
                  </div>
                  <span style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-secondary)" }}>
                    Qty {item.quantity}
                  </span>
                </button>
              ))}
              {mergeResults.length === 0 && !mergeQuery.trim() && (
                <p style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)", textAlign: "center", padding: "var(--sm-space-4)" }}>
                  Type to search inventory
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reject confirmation dialog */}
      {showRejectConfirm && (
        <div style={modalOverlayStyle} onClick={() => setShowRejectConfirm(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: "var(--sm-text-base)", fontWeight: 600, marginBottom: "var(--sm-space-3)" }}>
              Reject {batchSelection.size} item{batchSelection.size !== 1 ? "s" : ""}?
            </h3>
            <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)", marginBottom: "var(--sm-space-4)" }}>
              This will mark all selected observations as rejected. This action cannot be undone.
            </p>
            <div style={{ display: "flex", gap: "var(--sm-space-2)", justifyContent: "flex-end" }}>
              <button style={btnStyle("outline")} onClick={() => setShowRejectConfirm(false)}>
                Cancel
              </button>
              <button style={btnStyle("danger")} onClick={handleBatchReject}>
                Reject All Selected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile actions toggle */}
      <button
        className="review-fab"
        style={fabStyle}
        onClick={() => setActionsOpen(!actionsOpen)}
        aria-label="Toggle actions panel"
      >
        {actionsOpen ? "✕" : "⚙"}
      </button>
      {actionsOpen && (
        <div className="review-overlay" style={overlayStyle} onClick={() => setActionsOpen(false)} />
      )}
    </div>
  );
}

// ── Detail View ─────────────────────────────────────────────────────

function DetailView({
  detail,
  selectedObsIndex,
  setSelectedObsIndex,
  onAction,
  onMergeOpen,
  batchSelection,
  onToggleBatch,
  onRangeSelect,
  selectedId,
  rangeAnchorRef,
  relabelingId,
  relabelValue,
  onRelabelStart,
  onRelabelChange,
  onRelabelSave,
  onRelabelCancel,
}: {
  detail: ReviewTask;
  selectedObsIndex: number;
  setSelectedObsIndex: (i: number) => void;
  onAction: (type: string, obsId?: string, extra?: Record<string, string>) => void;
  onMergeOpen: (obsId: string) => void;
  batchSelection: Set<string>;
  onToggleBatch: (obsId: string) => void;
  onRangeSelect: (obsId: string) => void;
  selectedId: string;
  rangeAnchorRef: React.MutableRefObject<string | null>;
  relabelingId: string | null;
  relabelValue: string;
  onRelabelStart: (obsId: string, currentLabel: string) => void;
  onRelabelChange: (v: string) => void;
  onRelabelSave: (obsId: string) => void;
  onRelabelCancel: () => void;
}) {
  const observations = detail.itemObservations || [];
  const repairs = detail.repairObservations || [];
  const actions = detail.actions || [];
  const activeObs = observations[selectedObsIndex] || null;

  const allProcessed = observations.every((o) => o.status !== "pending") &&
    repairs.every((r) => r.status !== "pending");
  const pendingObs = observations.filter((o) => o.status === "pending");

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "var(--sm-space-6)" }}>
      {/* Completion banner */}
      {allProcessed && observations.length > 0 && (
        <div style={completionBannerStyle}>
          <span style={{ fontWeight: 600 }}>Walkthrough complete</span>
          <span style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-success-700)" }}>
            All {observations.length} observations processed.{repairs.length > 0 ? ` ${repairs.length} repairs reviewed.` : ""}
          </span>
        </div>
      )}

      {activeObs ? (
        <>
          {/* Obs header with nav */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--sm-space-4)", flexWrap: "wrap", gap: "var(--sm-space-3)" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--sm-space-2)", marginBottom: "var(--sm-space-1)" }}>
                {relabelingId === activeObs.id ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--sm-space-1)" }}>
                    <input
                      style={relabelInputStyle}
                      value={relabelValue}
                      onChange={(e) => onRelabelChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onRelabelSave(activeObs.id);
                        if (e.key === "Escape") onRelabelCancel();
                      }}
                      autoFocus
                    />
                    <button style={relabelBtnStyle("save")} onClick={() => onRelabelSave(activeObs.id)}>Save</button>
                    <button style={relabelBtnStyle("cancel")} onClick={onRelabelCancel}>Cancel</button>
                  </div>
                ) : (
                  <>
                    <h2
                      style={{ fontSize: "var(--sm-text-xl)", margin: 0, cursor: "pointer", borderBottom: "2px dashed transparent", transition: "border-color var(--sm-transition-fast)" }}
                      onClick={() => onRelabelStart(activeObs.id, activeObs.label)}
                      onMouseEnter={(e) => { (e.target as HTMLElement).style.borderBottomColor = "var(--sm-brand-400)"; }}
                      onMouseLeave={(e) => { (e.target as HTMLElement).style.borderBottomColor = "transparent"; }}
                      title="Click to relabel"
                    >
                      {activeObs.label}
                    </h2>
                  </>
                )}
                <span style={statusBadgeStyle(activeObs.status)}>{activeObs.status}</span>
              </div>
              <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)", margin: 0 }}>
                {activeObs.zone?.name && `Zone ${activeObs.zone.name}`}
                {activeObs.storageLocation?.name && ` — ${activeObs.storageLocation.name}`}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--sm-space-3)" }}>
              {activeObs.confidence != null && (
                <span style={confidencePillStyle(activeObs.confidence)}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", display: "inline-block", background: activeObs.confidence >= 0.9 ? "var(--sm-success-500)" : activeObs.confidence >= 0.7 ? "var(--sm-warning-400)" : "var(--sm-danger-500)" }} />
                  {" "}{Math.round(activeObs.confidence * 100)}%
                </span>
              )}
              {/* Nav arrows */}
              <div style={{ display: "flex", gap: 2 }}>
                <button
                  style={navBtnStyle}
                  disabled={selectedObsIndex === 0}
                  onClick={() => setSelectedObsIndex(Math.max(0, selectedObsIndex - 1))}
                  aria-label="Previous observation"
                >&#8592;</button>
                <button
                  style={navBtnStyle}
                  disabled={selectedObsIndex >= observations.length - 1}
                  onClick={() => setSelectedObsIndex(Math.min(observations.length - 1, selectedObsIndex + 1))}
                  aria-label="Next observation"
                >&#8594;</button>
              </div>
            </div>
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
              <span style={frameBadgeStyle}>
                {selectedObsIndex + 1} / {observations.length}
              </span>
            </div>
          </div>

          {/* Inline actions for current observation */}
          {activeObs.status === "pending" && (
            <div style={{ display: "flex", gap: "var(--sm-space-2)", marginBottom: "var(--sm-space-4)", flexWrap: "wrap" }}>
              <button style={btnStyle("success")} onClick={() => onAction("accept", activeObs.id)}>
                Accept
              </button>
              <button style={btnStyle("danger")} onClick={() => onAction("reject", activeObs.id)}>
                Reject
              </button>
              <button style={btnStyle("outline")} onClick={() => onRelabelStart(activeObs.id, activeObs.label)}>
                Relabel
              </button>
              <button style={btnStyle("outline")} onClick={() => onMergeOpen(activeObs.id)}>
                Merge into Item
              </button>
            </div>
          )}

          {/* Detail grid */}
          <div style={detailGridStyle}>
            <Field label="Proposed Identity" value={activeObs.label} sub={`Confidence: ${activeObs.confidence != null ? Math.round(activeObs.confidence * 100) + "%" : "N/A"}`} />
            <Field
              label="Current Location"
              value={[
                activeObs.zone?.name && `Zone ${activeObs.zone.name}`,
                activeObs.storageLocation?.name,
              ].filter(Boolean).join(" — ") || "Unknown"}
              sub={activeObs.bbox ? `BBox: ${activeObs.bbox}` : undefined}
            />
            <Field label="Observation ID" value={activeObs.id.slice(0, 12) + "..."} sub={`Created ${activeObs.createdAt.slice(0, 10)}`} />
            <Field label="Walkthrough" value={detail.walkthroughId.slice(0, 12) + "..."} sub={`${pendingObs.length} pending of ${observations.length}`} />
          </div>

          {/* Observation thumbnail strip */}
          {observations.length > 1 && (
            <div style={{ marginBottom: "var(--sm-space-6)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sm-space-3)" }}>
                <h3 style={{ ...sectionTitleStyle, marginBottom: 0 }}>All Observations ({observations.length})</h3>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--sm-space-1)", fontSize: "var(--sm-text-xs)", color: "var(--sm-text-secondary)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={batchSelection.size === pendingObs.length && pendingObs.length > 0}
                    onChange={() => {
                      if (batchSelection.size === pendingObs.length) {
                        onToggleBatch("__select_none__");
                      } else {
                        pendingObs.forEach((o) => onToggleBatch(o.id));
                      }
                    }}
                    style={{ width: 14, height: 14 }}
                  />
                  Select all pending
                </label>
              </div>
              <div style={thumbnailStripStyle}>
                {observations.map((obs, idx) => (
                  <div key={obs.id} style={{ position: "relative" }}>
                    <button
                      style={thumbStyle(idx === selectedObsIndex, obs.status)}
                      onClick={(e: React.MouseEvent) => {
                        if (e.shiftKey) {
                          onRangeSelect(obs.id);
                        } else {
                          rangeAnchorRef.current = obs.id;
                          setSelectedObsIndex(idx);
                        }
                      }}
                    >
                      <div style={thumbFrameStyle}>
                        {obs.keyframeUrl ? (
                          <img src={obs.keyframeUrl} alt={obs.label || "Observation keyframe"} style={thumbImgStyle} />
                        ) : (
                          <span style={{ fontSize: 10, color: "var(--sm-text-tertiary)" }}>No frame</span>
                        )}
                      </div>
                      <div style={thumbLabelStyle}>{obs.label}</div>
                      <div style={{ fontSize: 10, color: "var(--sm-text-tertiary)" }}>
                        {obs.confidence != null ? Math.round(obs.confidence * 100) + "%" : "?"}
                        {" · "}
                        {obs.status}
                      </div>
                    </button>
                    {obs.status === "pending" && (
                      <label style={thumbCheckboxStyle}>
                        <input
                          type="checkbox"
                          checked={batchSelection.has(obs.id)}
                          onChange={(e) => {
                            if ((e.nativeEvent as MouseEvent).shiftKey) {
                              onRangeSelect(obs.id);
                            } else {
                              onToggleBatch(obs.id);
                            }
                          }}
                          style={{ width: 12, height: 12 }}
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Repair observations */}
          {repairs.length > 0 && (
            <div style={{ marginBottom: "var(--sm-space-6)" }}>
              <h3 style={sectionTitleStyle}>Repair Observations ({repairs.length})</h3>
              {repairs.map((rep) => (
                <div key={rep.id} style={obsRowStyle}>
                  <div>
                    <span style={{ fontSize: "var(--sm-text-sm)", fontWeight: 500 }}>{rep.label}</span>
                    {rep.zone?.name && (
                      <span style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)", marginLeft: "var(--sm-space-2)" }}>
                        Zone {rep.zone.name}
                      </span>
                    )}
                  </div>
                  <span style={statusBadgeStyle(rep.status)}>{rep.status}</span>
                </div>
              ))}
            </div>
          )}

          {/* Audit log */}
          {actions.length > 0 && (
            <div>
              <h3 style={sectionTitleStyle}>Audit Log ({actions.length})</h3>
              <div style={auditLogStyle}>
                {actions.map((a) => (
                  <div key={a.id} style={auditRowStyle}>
                    <span style={auditTypeStyle(a.actionType)}>{a.actionType}</span>
                    <span style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-secondary)" }}>
                      {a.observationId?.slice(0, 8)}...
                    </span>
                    {a.newLabel && (
                      <span style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-secondary)" }}>
                        → {a.newLabel}
                      </span>
                    )}
                    {a.note && (
                      <span style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)", fontStyle: "italic" }}>
                        "{a.note}"
                      </span>
                    )}
                    <span style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)", marginLeft: "auto" }}>
                      {new Date(a.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={emptyStyle}>
          <p style={{ color: "var(--sm-text-tertiary)", fontSize: "var(--sm-text-sm)" }}>
            {observations.length === 0
              ? "No observations in this task."
              : "All observations processed."}
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
  batchSelection,
  onToggleBatch,
  onBatchAccept,
  onBatchReject,
}: {
  detail: ReviewTask | null;
  onAction: (type: string, obsId?: string, extra?: Record<string, string>) => void;
  batchSelection: Set<string>;
  onToggleBatch: (obsId: string) => void;
  onBatchAccept: () => void;
  onBatchReject: () => void;
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
  const pendingObs = observations.filter((o) => o.status === "pending");
  const highConfPending = pendingObs.filter((o) => (o.confidence || 0) >= 0.9);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <h3 style={{ fontSize: "var(--sm-text-sm)", fontWeight: 600, marginBottom: "var(--sm-space-4)" }}>
        Batch Operations
      </h3>

      {/* Batch accept */}
      {pendingObs.length > 0 && (
        <div style={quickAcceptStyle}>
          <div style={{ fontSize: "var(--sm-text-xs)", fontWeight: 600, color: "var(--sm-text-secondary)", marginBottom: "var(--sm-space-2)" }}>
            {pendingObs.length} pending observation{pendingObs.length !== 1 ? "s" : ""}
            {batchSelection.size > 0 && ` — ${batchSelection.size} selected`}
          </div>
          {pendingObs.length <= 12 && (
            <div style={{ marginBottom: "var(--sm-space-2)" }}>
              {pendingObs.map((obs) => (
                <label key={obs.id} style={checkboxRowStyle}>
                  <input
                    type="checkbox"
                    checked={batchSelection.has(obs.id)}
                    onChange={() => onToggleBatch(obs.id)}
                    style={{ width: 14, height: 14 }}
                  />
                  <span style={{ fontSize: "var(--sm-text-xs)", fontWeight: 500 }}>{obs.label}</span>
                  <span style={{ fontSize: 10, color: "var(--sm-text-tertiary)" }}>
                    {obs.confidence != null ? Math.round(obs.confidence * 100) + "%" : "?"}
                  </span>
                </label>
              ))}
            </div>
          )}
          {batchSelection.size > 0 && (
            <div style={{ display: "flex", gap: "var(--sm-space-2)", flexWrap: "wrap" }}>
              <button
                style={btnStyle("success", true)}
                onClick={onBatchAccept}
              >
                Accept Selected ({batchSelection.size})
              </button>
              <button
                style={btnStyle("danger", true)}
                onClick={onBatchReject}
              >
                Reject Selected ({batchSelection.size})
              </button>
            </div>
          )}
        </div>
      )}
      {highConfPending.length === 1 && pendingObs.length === 1 && (
        <div style={quickAcceptStyle}>
          <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-success-700)", marginBottom: "var(--sm-space-2)" }}>
            High confidence — quick accept
          </div>
          <button
            style={btnStyle("success", true)}
            onClick={() => onAction("accept", highConfPending[0].id)}
          >
            Confirm Identity &amp; Location
          </button>
        </div>
      )}

      {/* Quick stats */}
      {pendingObs.length > 0 && (
        <div style={{ marginBottom: "var(--sm-space-6)", fontSize: "var(--sm-text-xs)", color: "var(--sm-text-secondary)" }}>
          {pendingObs.length} pending observation{pendingObs.length !== 1 ? "s" : ""} remaining
        </div>
      )}

      {/* Repair actions */}
      {repairs.filter((r) => r.status === "pending").map((rep) => (
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

      {/* Quick actions summary */}
      <div>
        <h4 style={groupTitleStyle}>Task Info</h4>
        <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-secondary)", lineHeight: 1.6 }}>
          <div>Status: {detail.status}</div>
          <div>Observations: {observations.length}</div>
          <div>Repairs: {repairs.length}</div>
          <div>Actions taken: {detail.actions?.length || 0}</div>
          <div style={{ marginTop: "var(--sm-space-1)" }}>
            Walkthrough: {detail.walkthroughId.slice(0, 12)}...
          </div>
        </div>
      </div>
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

const completionBannerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "var(--sm-space-3) var(--sm-space-4)",
  borderRadius: "var(--sm-radius-md)",
  background: "#dcfce7",
  border: "1px solid #bbf7d0",
  marginBottom: "var(--sm-space-4)",
  fontSize: "var(--sm-text-sm)",
  color: "var(--sm-success-700)",
};

const navBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-sm)",
  background: "var(--sm-surface-card)",
  color: "var(--sm-text-secondary)",
  cursor: "pointer",
  fontSize: 14,
};

const thumbnailStripStyle: React.CSSProperties = {
  display: "flex",
  gap: "var(--sm-space-2)",
  overflowX: "auto",
  paddingBottom: "var(--sm-space-1)",
};

function thumbStyle(active: boolean, status: string): React.CSSProperties {
  return {
    minWidth: 100,
    maxWidth: 100,
    border: `2px solid ${active ? "var(--sm-brand-500)" : "var(--sm-border-default)"}`,
    borderRadius: "var(--sm-radius-md)",
    padding: "var(--sm-space-1)",
    background: active ? "var(--sm-brand-50)" : "var(--sm-surface-card)",
    cursor: "pointer",
    opacity: status === "rejected" ? 0.4 : 1,
    textAlign: "left",
    font: "inherit",
  };
}

const thumbFrameStyle: React.CSSProperties = {
  width: "100%",
  height: 56,
  borderRadius: "var(--sm-radius-sm)",
  background: "var(--sm-neutral-100)",
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 4,
};

const thumbImgStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const thumbLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const auditLogStyle: React.CSSProperties = {
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-md)",
  overflow: "hidden",
};

const auditRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--sm-space-2)",
  padding: "var(--sm-space-2) var(--sm-space-3)",
  borderBottom: "1px solid var(--sm-border-default)",
  fontSize: "var(--sm-text-xs)",
};

function auditTypeStyle(type: string): React.CSSProperties {
  const colors: Record<string, { bg: string; color: string }> = {
    accept: { bg: "#dcfce7", color: "var(--sm-success-700)" },
    reject: { bg: "#fee2e2", color: "var(--sm-danger-700)" },
    merge: { bg: "#dbeafe", color: "var(--sm-brand-700)" },
    relabel: { bg: "#fef3c7", color: "#92400e" },
  };
  const c = colors[type] || { bg: "var(--sm-neutral-100)", color: "var(--sm-text-secondary)" };
  return {
    fontWeight: 600,
    fontSize: 10,
    padding: "1px 6px",
    borderRadius: "var(--sm-radius-full)",
    background: c.bg,
    color: c.color,
    textTransform: "uppercase",
  };
}

const checkboxRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--sm-space-2)",
  padding: "var(--sm-space-1) 0",
  cursor: "pointer",
};

const modalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 300,
  background: "var(--sm-surface-overlay)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const modalStyle: React.CSSProperties = {
  background: "var(--sm-surface-card)",
  borderRadius: "var(--sm-radius-lg)",
  border: "1px solid var(--sm-border-default)",
  boxShadow: "var(--sm-shadow-lg)",
  padding: "var(--sm-space-6)",
  width: "100%",
  maxWidth: 420,
  maxHeight: "80vh",
  display: "flex",
  flexDirection: "column",
};

const mergeResultStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  width: "100%",
  padding: "var(--sm-space-2) var(--sm-space-3)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-md)",
  marginBottom: "var(--sm-space-1)",
  background: "var(--sm-surface-card)",
  cursor: "pointer",
  font: "inherit",
  textAlign: "left",
};

const thumbCheckboxStyle: React.CSSProperties = {
  position: "absolute",
  top: 2,
  left: 2,
  zIndex: 5,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--sm-surface-card)",
  borderRadius: "var(--sm-radius-sm)",
  width: 18,
  height: 18,
};

const relabelInputStyle: React.CSSProperties = {
  font: "inherit",
  fontSize: "var(--sm-text-lg)",
  fontWeight: 600,
  padding: "var(--sm-space-1) var(--sm-space-2)",
  border: "2px solid var(--sm-brand-400)",
  borderRadius: "var(--sm-radius-md)",
  background: "var(--sm-surface-card)",
  color: "var(--sm-text-primary)",
  maxWidth: 280,
};

function relabelBtnStyle(variant: "save" | "cancel"): React.CSSProperties {
  return {
    font: "inherit",
    fontSize: "var(--sm-text-xs)",
    fontWeight: 500,
    padding: "var(--sm-space-1) var(--sm-space-2)",
    borderRadius: "var(--sm-radius-sm)",
    border: "1px solid var(--sm-border-default)",
    cursor: "pointer",
    background: variant === "save" ? "var(--sm-brand-600)" : "var(--sm-surface-card)",
    color: variant === "save" ? "var(--sm-text-inverse)" : "var(--sm-text-secondary)",
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
