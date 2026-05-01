import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import {
  getWalkthroughResultItem,
  updateWalkthroughResultItem,
  getSpaceId,
  type WalkthroughResultDetail,
} from "../api";
import { Button } from "../components/ui/Button";

type PageState = "loading" | "ready" | "error" | "not-found";

const CATEGORY_OPTIONS = [
  "Office Supplies", "Safety Equipment", "Signage", "Equipment",
  "Furniture", "IT Equipment", "Cleaning Supplies", "Raw Materials",
  "Packaging", "Unknown",
];

const ZONE_OPTIONS = [
  "Zone 1-A", "Zone 1-B", "Zone 1-C",
  "Zone 2-A", "Zone 2-B",
  "Zone 3-A", "Zone 3-B",
  "Zone 4-A",
];

function useWindowWidth() {
  const [width, setWidth] = useState(() => typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    function handleResize() { setWidth(window.innerWidth); }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return width;
}

function confidenceLabel(c: number | null): string {
  if (c === null) return "N/A";
  if (c >= 80) return "High";
  if (c >= 50) return "Medium";
  return "Low";
}

function confidenceLevel(c: number | null): "high" | "medium" | "low" {
  if (c === null) return "low";
  if (c >= 80) return "high";
  if (c >= 50) return "medium";
  return "low";
}

function statusLabel(status: string): string {
  switch (status) {
    case "new": return "New detection";
    case "matched": return "Matched";
    case "relocated": return "Relocated";
    case "missing": return "Missing";
    default: return status;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function Toast({ message, visible }: { message: string; visible: boolean }) {
  return (
    <div style={{ ...toastStyle, opacity: visible ? 1 : 0 }}>
      {message}
    </div>
  );
}

export function ItemDetailEdit() {
  const { walkthroughId, itemId } = useParams<{ walkthroughId: string; itemId: string }>();
  const spaceId = getSpaceId();
  const vw = useWindowWidth();

  const [pageState, setPageState] = useState<PageState>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [data, setData] = useState<WalkthroughResultDetail | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editZone, setEditZone] = useState("");
  const [editStorageLocation, setEditStorageLocation] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [toastMsg, setToastMsg] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const isNarrow = vw <= 640;
  const isMedium = vw <= 768;

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastVisible(true);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2500);
  }, []);

  // Fetch
  useEffect(() => {
    if (!walkthroughId || !itemId || !spaceId) {
      setPageState("error");
      setErrorMsg("Missing walkthrough or item context.");
      return;
    }
    let cancelled = false;
    setPageState("loading");

    getWalkthroughResultItem(spaceId, walkthroughId, itemId)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setPageState("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Failed to load item";
        setPageState(msg.includes("not found") || msg.includes("404") ? "not-found" : "error");
        setErrorMsg(msg);
      });

    return () => { cancelled = true; };
  }, [walkthroughId, itemId, spaceId]);

  // Accept
  const handleAccept = useCallback(async () => {
    if (!spaceId || !walkthroughId || !itemId || !data) return;
    try {
      const updated = await updateWalkthroughResultItem(spaceId, walkthroughId, itemId, {
        status: "accepted",
      });
      setData(updated);
      showToast("Item accepted. Added to inventory.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to accept item");
    }
  }, [spaceId, walkthroughId, itemId, data, showToast]);

  // Reject with confirmation
  const handleReject = useCallback(() => {
    if (!window.confirm(
      "Reject this detection? The item will be excluded from this walkthrough's results. This can be undone from the walkthrough review page."
    )) return;

    if (!spaceId || !walkthroughId || !itemId || !data) return;
    updateWalkthroughResultItem(spaceId, walkthroughId, itemId, { status: "rejected" })
      .then((updated) => {
        setData(updated);
        showToast("Item rejected.");
      })
      .catch((err) => {
        showToast(err instanceof Error ? err.message : "Failed to reject item");
      });
  }, [spaceId, walkthroughId, itemId, data, showToast]);

  // Enter edit mode
  const enterEdit = useCallback(() => {
    if (!data) return;
    setEditLabel(data.label);
    setEditCategory(data.category ?? "");
    setEditZone(data.zoneName ?? "");
    setEditStorageLocation(data.storageLocationName ?? "");
    setEditNotes("");
    setIsEditing(true);
  }, [data]);

  // Cancel edit
  const cancelEdit = useCallback(() => {
    setIsEditing(false);
  }, []);

  // Save edit
  const saveEdit = useCallback(async () => {
    if (!spaceId || !walkthroughId || !itemId || !data) return;
    setSaving(true);
    try {
      const updated = await updateWalkthroughResultItem(spaceId, walkthroughId, itemId, {
        label: editLabel,
        category: editCategory || undefined,
        zoneId: editZone || null,
        storageLocationId: editStorageLocation || null,
      });
      setData(updated);
      setIsEditing(false);
      showToast("Changes saved");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }, [spaceId, walkthroughId, itemId, data, editLabel, editCategory, editZone, editStorageLocation, showToast]);

  // Suggested label click
  const selectSuggestedLabel = useCallback((label: string) => {
    setEditLabel(label);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === "Escape" && isEditing) {
          e.preventDefault();
          cancelEdit();
        }
        return;
      }

      if (isEditing) {
        if (e.key === "Escape") {
          e.preventDefault();
          cancelEdit();
        }
        return;
      }

      if (e.key === "a" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleAccept();
      } else if (e.key === "e" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        enterEdit();
      } else if (e.key === "r" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleReject();
      } else if (e.key === "ArrowRight" && !e.shiftKey && data?.nextItemId) {
        e.preventDefault();
        window.location.href = `/results/${walkthroughId}/items/${data.nextItemId}`;
      } else if (e.key === "ArrowLeft" && !e.shiftKey && data?.prevItemId) {
        e.preventDefault();
        window.location.href = `/results/${walkthroughId}/items/${data.prevItemId}`;
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isEditing, data, walkthroughId, handleAccept, enterEdit, handleReject, cancelEdit]);

  // ── Render: Loading ───────────────────────────────────────────────────
  if (pageState === "loading") {
    return (
      <div style={shell}>
        <div style={loadingStyle}>
          <p>Loading item...</p>
        </div>
      </div>
    );
  }

  // ── Render: Error ─────────────────────────────────────────────────────
  if (pageState === "error") {
    return (
      <div style={shell}>
        <div style={errorBlockStyle}>
          <div style={{ fontSize: 32, marginBottom: "var(--sm-space-3)" }}>&#9888;&#65039;</div>
          <h3 style={{ fontSize: "var(--sm-text-lg)", marginBottom: "var(--sm-space-2)" }}>Failed to Load Item</h3>
          <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)", marginBottom: "var(--sm-space-4)" }}>
            {errorMsg}
          </p>
          <Button variant="primary" size="md" onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

  // ── Render: Not Found ─────────────────────────────────────────────────
  if (pageState === "not-found" || !data) {
    return (
      <div style={shell}>
        <div style={emptyStateStyle}>
          <div style={{ fontSize: 48, marginBottom: "var(--sm-space-4)" }}>&#128270;</div>
          <h3 style={{ fontSize: "var(--sm-text-lg)", marginBottom: "var(--sm-space-2)" }}>Item Not Found</h3>
          <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)", maxWidth: 400, margin: "0 auto var(--sm-space-4)" }}>
            This item could not be found in this walkthrough. It may have been removed.
          </p>
          <Link to={`/results/${walkthroughId}`}>
            <Button variant="primary" size="md">Back to Results</Button>
          </Link>
        </div>
      </div>
    );
  }

  const confLevel = confidenceLevel(data.confidence);
  const itemStatus = data.status === "accepted" ? "accepted"
    : data.status === "rejected" ? "rejected"
    : "needs-review";

  return (
    <div style={shell}>
      {/* Breadcrumb */}
      <nav style={breadcrumbStyle} aria-label="Breadcrumb">
        <Link to="/upload" style={breadcrumbLinkStyle}>Upload</Link>
        <span style={{ color: "var(--sm-text-tertiary)" }}>&#8250;</span>
        <Link to={`/results/${walkthroughId}`} style={breadcrumbLinkStyle}>Walkthrough Results</Link>
        <span style={{ color: "var(--sm-text-tertiary)" }}>&#8250;</span>
        <span style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)" }}>{data.label}</span>
      </nav>

      {/* Action Bar */}
      <div style={actionBarStyle(isMedium)}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sm-space-2)", fontSize: "var(--sm-text-sm)", fontWeight: 500 }}>
          <span style={statusBadgeStyle(itemStatus)}>{statusLabel(itemStatus === "needs-review" ? "new" : itemStatus)}</span>
          <span style={confidenceBadgeStyle(confLevel)}>{data.confidence !== null ? `${Math.round(data.confidence)}%` : "N/A"}</span>
        </div>
        <div style={{ flex: 1, ...(isMedium ? { display: "none" } : {}) }} />
        {data.status !== "accepted" && (
          <Button variant="success" size="md" onClick={handleAccept} aria-label="Accept this detection">
            &#10003; Accept
          </Button>
        )}
        <Button
          variant={isEditing ? "primary" : "outline"}
          size="md"
          onClick={isEditing ? cancelEdit : enterEdit}
          aria-label={isEditing ? "Close editor" : "Edit item details"}
        >
          {isEditing ? "✕ Close Editor" : "✎ Edit"}
        </Button>
        {data.status !== "rejected" && (
          <Button variant="danger" size="md" onClick={handleReject} aria-label="Reject this detection">
            &#10007; Reject
          </Button>
        )}
      </div>

      {/* Keyframe Viewer */}
      <div style={keyframeSectionStyle}>
        <div style={keyframeViewerStyle}>
          {data.keyframeUrl ? (
            <img src={data.keyframeUrl} alt="Detection keyframe" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ fontSize: 64 }}>&#128218;</span>
          )}
          <div style={keyframeOverlayStyle}>
            <span>{data.frameRef ?? `Observation ${data.id.slice(0, 8)}`}</span>
            <span>{[data.zoneName, data.storageLocationName].filter(Boolean).join(" · ") || "No location"}</span>
          </div>
        </div>
      </div>

      {/* Detail Header */}
      <div style={detailHeaderStyle(isMedium)}>
        <div>
          <h1 style={itemTitleStyle(isMedium)}>{data.label}</h1>
          <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)" }}>
            ID: {data.id.slice(0, 8)} &middot;
            {data.category && <><span style={categoryChipStyle}>{data.category}</span> &middot; </>}
            Detected {formatDate(data.createdAt)}
          </p>
        </div>
      </div>

      {/* AI Explanation Callout */}
      {!isEditing && (
        <div style={aiCalloutStyle}>
          <div style={{ fontSize: "var(--sm-text-sm)", fontWeight: 600, color: "var(--sm-brand-700)", marginBottom: "var(--sm-space-1)", display: "flex", alignItems: "center", gap: "var(--sm-space-2)" }}>
            &#9889; AI Detection Summary
          </div>
          <div style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-brand-800)" }}>
            Detected as "{data.label}" with {data.confidence !== null ? `${confidenceLabel(data.confidence).toLowerCase()} confidence (${Math.round(data.confidence)}%)` : "unknown confidence"}.
            {data.confidenceBreakdown && (
              <> Confidence breakdown: Category {data.confidenceBreakdown.category}%, Identity {data.confidenceBreakdown.identity}%, Location {data.confidenceBreakdown.location}%.</>
            )}
            {" "}<strong>Recommendation:</strong>{" "}
            {data.resultStatus === "new" ? "Review and confirm." :
             data.resultStatus === "matched" ? "Item matched to existing inventory — verify correctness." :
             data.resultStatus === "relocated" ? "Item appears to have moved — review location change." :
             "Review before finalizing inventory."}
          </div>
        </div>
      )}

      {/* View Mode */}
      {!isEditing && (
        <div id="view-mode">
          <div style={infoGridStyle(isNarrow)}>
            <InfoItem label="Category" value={data.category ?? "—"} />
            <InfoItem label="Status" value={statusLabel(data.resultStatus)} sub={data.resultStatus === "new" ? "Not previously catalogued in this space" : undefined} />
            <InfoItem
              label="AI Confidence"
              value={data.confidence !== null ? `${Math.round(data.confidence)}% · ${confidenceLabel(data.confidence)}` : "N/A"}
              sub={data.confidenceBreakdown ? `Category: ${data.confidenceBreakdown.category}% · Identity: ${data.confidenceBreakdown.identity}% · Location: ${data.confidenceBreakdown.location}%` : undefined}
            />
            <InfoItem label="Detected At" value={formatDate(data.createdAt)} sub={`Walkthrough · ${data.frameRef ?? "N/A"}`} />
            <InfoItem label="Zone" value={data.zoneName ?? "—"} />
            <InfoItem label="Position" value={data.storageLocationName ?? "—"} />
            <div style={{ gridColumn: isNarrow ? undefined : "1 / -1" } as React.CSSProperties}>
              <InfoItem label="Notes" value="No operator notes yet." sub="Use Edit mode to add notes about this item." />
            </div>
          </div>

          {/* Location Card */}
          <div style={locationCardStyle}>
            <h2 style={{ fontSize: "var(--sm-text-base)", fontWeight: 600, marginBottom: "var(--sm-space-4)", display: "flex", alignItems: "center", gap: "var(--sm-space-2)" }}>
              &#128205; Detected Location
            </h2>
            <div style={locationDetailStyle(isNarrow)}>
              <div>
                <div style={ldLabelStyle}>Zone</div>
                <div style={ldValueStyle}>{data.zoneName ?? "—"}</div>
              </div>
              <div>
                <div style={ldLabelStyle}>Position</div>
                <div style={ldValueStyle}>{data.storageLocationName ?? "—"}</div>
              </div>
              <div>
                <div style={ldLabelStyle}>Storage Path</div>
                <div style={ldValueStyle}>
                  {[data.zoneName?.charAt(data.zoneName.length - 1), data.zoneName?.charAt(0), data.storageLocationName]
                    .filter(Boolean).join(" / ") || "—"}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Mode */}
      {isEditing && (
        <div id="edit-mode">
          {/* Suggested Labels */}
          {data.suggestedLabels.length > 0 && (
            <div style={{ marginBottom: "var(--sm-space-6)" }}>
              <h3 style={{ fontSize: "var(--sm-text-sm)", fontWeight: 600, marginBottom: "var(--sm-space-3)" }}>
                Suggested Labels (click to select)
              </h3>
              <div style={suggestedLabelsContainerStyle}>
                {data.suggestedLabels.map((sl) => (
                  <div
                    key={sl.label}
                    style={suggestedLabelStyle(editLabel === sl.label)}
                    onClick={() => selectSuggestedLabel(sl.label)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") selectSuggestedLabel(sl.label); }}
                  >
                    <span>{sl.label}</span>
                    <span style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)" }}>{Math.round(sl.confidence)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Edit Form */}
          <div style={infoGridStyle(isNarrow)}>
            <div style={formFieldStyle}>
              <label htmlFor="edit-name" style={formLabelStyle}>Item Name</label>
              <input
                type="text"
                id="edit-name"
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                style={formInputStyle}
              />
              <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)", marginTop: "var(--sm-space-1)" }}>
                Use a descriptive, searchable name
              </div>
            </div>
            <div style={formFieldStyle}>
              <label htmlFor="edit-category" style={formLabelStyle}>Category</label>
              <select
                id="edit-category"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                style={formInputStyle}
              >
                <option value="">— Select —</option>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div style={formFieldStyle}>
              <label htmlFor="edit-zone" style={formLabelStyle}>Zone</label>
              <select
                id="edit-zone"
                value={editZone}
                onChange={(e) => setEditZone(e.target.value)}
                style={formInputStyle}
              >
                <option value="">— Select —</option>
                {ZONE_OPTIONS.map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </div>
            <div style={formFieldStyle}>
              <label htmlFor="edit-position" style={formLabelStyle}>Position / Location Detail</label>
              <input
                type="text"
                id="edit-position"
                value={editStorageLocation}
                onChange={(e) => setEditStorageLocation(e.target.value)}
                style={formInputStyle}
              />
            </div>
            <div style={{ ...formFieldStyle, gridColumn: isNarrow ? undefined : "1 / -1" } as React.CSSProperties}>
              <label htmlFor="edit-notes" style={formLabelStyle}>Operator Notes</label>
              <textarea
                id="edit-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Add any notes about this item..."
                style={{ ...formInputStyle, minHeight: 80, resize: "vertical" as const }}
              />
            </div>
          </div>

          <div style={editActionsStyle}>
            <Button variant="ghost" size="md" onClick={cancelEdit}>Cancel</Button>
            <Button variant="primary" size="md" onClick={saveEdit} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      )}

      {/* Prev/Next Navigation */}
      <div style={itemNavStyle(isMedium)}>
        {data.prevItemId ? (
          <Link to={`/results/${walkthroughId}/items/${data.prevItemId}`} style={{ textDecoration: "none" }}>
            <Button variant="outline" size="sm">&#8592; Previous Item</Button>
          </Link>
        ) : (
          <span />
        )}
        <span style={navHintStyle}>
          Item {data.itemIndex + 1} of {data.totalItems} in this walkthrough
        </span>
        {data.nextItemId ? (
          <Link to={`/results/${walkthroughId}/items/${data.nextItemId}`} style={{ textDecoration: "none" }}>
            <Button variant="outline" size="sm">Next Item &#8594;</Button>
          </Link>
        ) : (
          <span />
        )}
      </div>

      {/* Keyboard Hints */}
      <p style={kbdHintsStyle}>
        <Kbd>a</Kbd> accept &middot;
        <Kbd>e</Kbd> edit &middot;
        <Kbd>r</Kbd> reject &middot;
        <Kbd>&#8592;</Kbd> / <Kbd>&#8594;</Kbd> prev/next &middot;
        <Kbd>Esc</Kbd> cancel edit
      </p>

      {/* Toast */}
      <Toast message={toastMsg} visible={toastVisible} />
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function InfoItem({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div style={infoLabelStyle}>{label}</div>
      <div style={infoValueStyle}>{value}</div>
      {sub && <div style={infoSubStyle}>{sub}</div>}
    </div>
  );
}

function Kbd({ children }: { children: string }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "0 4px",
      border: "1px solid var(--sm-border-default)",
      borderRadius: 3,
      fontSize: 11,
      fontFamily: "var(--sm-font-mono)",
      background: "var(--sm-neutral-50)",
    }}>
      {children}
    </span>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const shell: React.CSSProperties = {
  maxWidth: 960,
  margin: "0 auto",
  padding: "0 var(--sm-space-4)",
  paddingTop: "var(--sm-space-6)",
  paddingBottom: "var(--sm-space-12)",
};

const loadingStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "var(--sm-space-16) var(--sm-space-4)",
  color: "var(--sm-text-secondary)",
  fontSize: "var(--sm-text-sm)",
};

const errorBlockStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "var(--sm-space-16) var(--sm-space-4)",
  border: "1px solid #fecaca",
  borderRadius: "var(--sm-radius-xl)",
  background: "#fef2f2",
  marginTop: "var(--sm-space-8)",
};

const emptyStateStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "var(--sm-space-16) var(--sm-space-4)",
  color: "var(--sm-text-tertiary)",
};

const breadcrumbStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--sm-space-2)",
  fontSize: "var(--sm-text-sm)",
  color: "var(--sm-text-secondary)",
  marginBottom: "var(--sm-space-4)",
  flexWrap: "wrap",
};

const breadcrumbLinkStyle: React.CSSProperties = {
  color: "var(--sm-text-link)",
  textDecoration: "none",
};

const actionBarStyle = (isMedium: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: "var(--sm-space-3)",
  padding: "var(--sm-space-4)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-xl)",
  background: "var(--sm-surface-card)",
  marginBottom: "var(--sm-space-6)",
  flexWrap: "wrap",
  position: "sticky",
  top: 0,
  zIndex: 10,
  ...(isMedium ? { flexDirection: "column", alignItems: "stretch", position: "static" as const } : {}),
});

const keyframeSectionStyle: React.CSSProperties = {
  marginBottom: "var(--sm-space-6)",
};

const keyframeViewerStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  aspectRatio: "16 / 9",
  borderRadius: "var(--sm-radius-xl)",
  background: "var(--sm-neutral-200)",
  overflow: "hidden",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const keyframeOverlayStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 0,
  left: 0,
  right: 0,
  padding: "var(--sm-space-4) var(--sm-space-6)",
  background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  color: "#fff",
  fontSize: "var(--sm-text-sm)",
  flexWrap: "wrap",
  gap: "var(--sm-space-2)",
};

const detailHeaderStyle = (isMedium: boolean): React.CSSProperties => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "var(--sm-space-4)",
  marginBottom: "var(--sm-space-6)",
  flexWrap: "wrap",
});

const itemTitleStyle = (isMedium: boolean): React.CSSProperties => ({
  fontSize: isMedium ? "var(--sm-text-xl)" : "var(--sm-text-2xl)",
  fontWeight: 700,
  marginBottom: "var(--sm-space-1)",
});

const infoGridStyle = (isNarrow: boolean): React.CSSProperties => ({
  display: "grid",
  gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr",
  gap: "var(--sm-space-4)",
  marginBottom: "var(--sm-space-6)",
  padding: isNarrow ? "var(--sm-space-4)" : "var(--sm-space-6)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-xl)",
  background: "var(--sm-surface-card)",
});

const infoLabelStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-xs)",
  color: "var(--sm-text-tertiary)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: "var(--sm-space-1)",
};

const infoValueStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-base)",
  fontWeight: 500,
};

const infoSubStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-sm)",
  color: "var(--sm-text-secondary)",
  fontWeight: 400,
};

const locationCardStyle: React.CSSProperties = {
  padding: "var(--sm-space-6)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-xl)",
  marginBottom: "var(--sm-space-6)",
  background: "var(--sm-surface-card)",
};

const locationDetailStyle = (isNarrow: boolean): React.CSSProperties => ({
  display: "grid",
  gridTemplateColumns: isNarrow ? "1fr" : "repeat(3, 1fr)",
  gap: "var(--sm-space-4)",
});

const ldLabelStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-xs)",
  color: "var(--sm-text-tertiary)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: "var(--sm-space-1)",
};

const ldValueStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-sm)",
  fontWeight: 500,
};

const aiCalloutStyle: React.CSSProperties = {
  padding: "var(--sm-space-4)",
  borderRadius: "var(--sm-radius-lg)",
  background: "var(--sm-brand-50)",
  border: "1px solid var(--sm-brand-200)",
  marginBottom: "var(--sm-space-6)",
};

const suggestedLabelsContainerStyle: React.CSSProperties = {
  display: "flex",
  gap: "var(--sm-space-2)",
  flexWrap: "wrap",
};

const suggestedLabelStyle = (selected: boolean): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--sm-space-2)",
  fontSize: "var(--sm-text-sm)",
  padding: "var(--sm-space-2) var(--sm-space-4)",
  border: `1px solid ${selected ? "var(--sm-brand-500)" : "var(--sm-border-default)"}`,
  borderRadius: "var(--sm-radius-lg)",
  background: selected ? "var(--sm-brand-50)" : "var(--sm-surface-card)",
  color: selected ? "var(--sm-brand-700)" : undefined,
  fontWeight: selected ? 500 : undefined,
  cursor: "pointer",
  transition: "all var(--sm-transition-fast)",
});

const formFieldStyle: React.CSSProperties = {
  marginBottom: "var(--sm-space-4)",
};

const formLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--sm-text-xs)",
  fontWeight: 500,
  color: "var(--sm-text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: "var(--sm-space-1)",
};

const formInputStyle: React.CSSProperties = {
  width: "100%",
  font: "inherit",
  fontSize: "var(--sm-text-base)",
  padding: "var(--sm-space-2) var(--sm-space-3)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-md)",
  background: "var(--sm-surface-card)",
  color: "var(--sm-text-primary)",
  minHeight: 44,
  boxSizing: "border-box",
};

const editActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: "var(--sm-space-3)",
  justifyContent: "flex-end",
  paddingTop: "var(--sm-space-4)",
  borderTop: "1px solid var(--sm-border-default)",
  marginBottom: "var(--sm-space-8)",
};

const itemNavStyle = (isMedium: boolean): React.CSSProperties => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: "var(--sm-space-8)",
  paddingTop: "var(--sm-space-6)",
  borderTop: "1px solid var(--sm-border-default)",
  ...(isMedium ? { flexDirection: "column", gap: "var(--sm-space-3)", textAlign: "center" } : {}),
});

const navHintStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-xs)",
  color: "var(--sm-text-tertiary)",
};

const kbdHintsStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-xs)",
  color: "var(--sm-text-tertiary)",
  marginTop: "var(--sm-space-6)",
  textAlign: "center",
};

const toastStyle: React.CSSProperties = {
  position: "fixed",
  bottom: "var(--sm-space-6)",
  left: "50%",
  transform: "translateX(-50%)",
  background: "var(--sm-neutral-900)",
  color: "var(--sm-text-inverse)",
  padding: "var(--sm-space-3) var(--sm-space-6)",
  borderRadius: "var(--sm-radius-lg)",
  fontSize: "var(--sm-text-sm)",
  fontWeight: 500,
  boxShadow: "var(--sm-shadow-lg)",
  zIndex: 100,
  transition: "opacity 200ms ease",
  pointerEvents: "none",
};

const statusBadgeStyle = (status: string): React.CSSProperties => {
  const isAccepted = status === "accepted";
  const isRejected = status === "rejected";
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    fontWeight: 500,
    padding: "2px 8px",
    borderRadius: "var(--sm-radius-full)",
    background: isAccepted ? "#dcfce7" : isRejected ? "#fee2e2" : "#fef3c7",
    color: isAccepted ? "#166534" : isRejected ? "#991b1b" : "#92400e",
  };
};

const confidenceBadgeStyle = (level: string): React.CSSProperties => {
  const bg = level === "high" ? "#dcfce7" : level === "medium" ? "#fef3c7" : "#fee2e2";
  const color = level === "high" ? "#166534" : level === "medium" ? "#92400e" : "#991b1b";
  const borderColor = level === "high" ? "#bbf7d0" : level === "medium" ? "#fde68a" : "#fecaca";
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    fontWeight: 500,
    padding: "1px 6px",
    borderRadius: "var(--sm-radius-full)",
    border: `1px solid ${borderColor}`,
    background: bg,
    color,
  };
};

const categoryChipStyle: React.CSSProperties = {
  display: "inline-block",
  fontSize: 11,
  fontWeight: 500,
  padding: "1px 8px",
  borderRadius: "var(--sm-radius-full)",
  background: "var(--sm-neutral-100)",
  color: "var(--sm-text-secondary)",
};
