import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import {
  getWalkthroughResults,
  bulkProcessResults,
  getSpaceId,
  type WalkthroughResults as WalkthroughResultsData,
  type WalkthroughResultItem,
} from "../api";
import { Button } from "../components/ui/Button";

type FilterStatus = "all" | "new" | "matched" | "relocated" | "missing";
type FilterConfidence = "all" | "high" | "medium" | "low";
type SortKey = "confidence" | "name" | "zone" | "status";
type PageState = "loading" | "ready" | "error" | "empty";

function classifyConfidence(c: number | null): FilterConfidence {
  if (c === null || c === undefined) return "low";
  if (c >= 80) return "high";
  if (c >= 50) return "medium";
  return "low";
}

function statusLabel(status: string): string {
  switch (status) {
    case "new": return "New";
    case "matched": return "Matched";
    case "relocated": return "Relocated";
    case "missing": return "Missing";
    default: return status;
  }
}

const STATUS_ORDER: Record<string, number> = {
  new: 0, matched: 1, relocated: 2, missing: 3,
};

function useWindowWidth() {
  const [width, setWidth] = useState(() => typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    function handleResize() { setWidth(window.innerWidth); }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return width;
}

export function Results() {
  const { walkthroughId } = useParams<{ walkthroughId: string }>();
  const spaceId = getSpaceId();
  const vw = useWindowWidth();

  const [pageState, setPageState] = useState<PageState>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [data, setData] = useState<WalkthroughResultsData | null>(null);

  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterConfidence, setFilterConfidence] = useState<FilterConfidence>("all");
  const [sortKey, setSortKey] = useState<SortKey>("confidence");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  const isNarrow = vw <= 640;
  const isMedium = vw <= 768;

  // Fetch results
  useEffect(() => {
    if (!walkthroughId || !spaceId) {
      setPageState("error");
      setErrorMsg("Missing walkthrough or space context.");
      return;
    }

    let cancelled = false;
    setPageState("loading");

    getWalkthroughResults(spaceId, walkthroughId)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setPageState(res.items.length > 0 ? "ready" : "empty");
      })
      .catch((err) => {
        if (cancelled) return;
        setPageState("error");
        setErrorMsg(err instanceof Error ? err.message : "Failed to load results");
      });

    return () => { cancelled = true; };
  }, [walkthroughId, spaceId]);

  // Filter + sort
  const filteredItems = (data?.items ?? []).filter((item) => {
    if (filterStatus !== "all" && item.resultStatus !== filterStatus) return false;
    if (filterConfidence !== "all" && classifyConfidence(item.confidence) !== filterConfidence) return false;
    return true;
  });

  const sortedItems = [...filteredItems].sort((a, b) => {
    switch (sortKey) {
      case "name":
        return a.label.localeCompare(b.label);
      case "zone":
        return (a.zoneName ?? "").localeCompare(b.zoneName ?? "");
      case "status":
        return (STATUS_ORDER[a.resultStatus] ?? 99) - (STATUS_ORDER[b.resultStatus] ?? 99);
      case "confidence":
      default:
        return (b.confidence ?? 0) - (a.confidence ?? 0);
    }
  });

  // Selection
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleBulkAccept = useCallback(async () => {
    if (!spaceId || !walkthroughId || selectedIds.size === 0) return;
    try {
      await bulkProcessResults(spaceId, walkthroughId, {
        observationIds: [...selectedIds],
        action: "accept",
      });
      // Optimistic UI update
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((item) =>
            selectedIds.has(item.id)
              ? { ...item, resultStatus: "matched" as const }
              : item,
          ),
        };
      });
      clearSelection();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Bulk accept failed");
    }
  }, [spaceId, walkthroughId, selectedIds, clearSelection]);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      // Skip if inside an input/select
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;

      const cards = sortedItems;
      if (cards.length === 0) return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIdx((prev) => Math.min(prev + 1, cards.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIdx((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && focusedIdx >= 0 && focusedIdx < cards.length) {
        e.preventDefault();
        const item = cards[focusedIdx];
        window.location.href = `/items/${item.itemId || item.id}`;
      } else if (e.key === "a" && !e.shiftKey && focusedIdx >= 0 && focusedIdx < cards.length) {
        e.preventDefault();
        toggleSelect(cards[focusedIdx].id);
      } else if (e.key === "A" && e.shiftKey) {
        e.preventDefault();
        // Select all high-confidence items
        const highIds = cards
          .filter((item) => classifyConfidence(item.confidence) === "high")
          .map((item) => item.id);
        setSelectedIds(new Set(highIds));
      } else if (e.key === "e" && focusedIdx >= 0 && focusedIdx < cards.length) {
        e.preventDefault();
        const item = cards[focusedIdx];
        window.location.href = `/items/${item.itemId || item.id}`;
      } else if (e.key === "Escape") {
        clearSelection();
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [sortedItems, focusedIdx, toggleSelect, clearSelection]);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIdx < 0 || !listRef.current) return;
    const cards = listRef.current.querySelectorAll('[data-result-id]');
    if (focusedIdx < cards.length) {
      cards[focusedIdx].scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [focusedIdx]);

  // ── Render ──────────────────────────────────────────────────────────

  if (pageState === "loading") {
    return (
      <div style={shell}>
        <div style={loadingStyle}>
          <p>Loading results...</p>
        </div>
      </div>
    );
  }

  if (pageState === "error") {
    return (
      <div style={shell}>
        <div style={errorBlockStyle}>
          <div style={{ fontSize: 32, marginBottom: "var(--sm-space-3)" }}>&#9888;&#65039;</div>
          <h3 style={{ fontSize: "var(--sm-text-lg)", marginBottom: "var(--sm-space-2)" }}>Failed to Load Results</h3>
          <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)", marginBottom: "var(--sm-space-4)" }}>
            {errorMsg}
          </p>
          <Button variant="primary" size="md" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (pageState === "empty" || !data) {
    return (
      <div style={shell}>
        <div style={emptyStateStyle}>
          <div style={{ fontSize: 48, marginBottom: "var(--sm-space-4)" }}>&#128270;</div>
          <h3 style={{ fontSize: "var(--sm-text-lg)", marginBottom: "var(--sm-space-2)" }}>No Items Detected</h3>
          <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)", maxWidth: 400, margin: "0 auto var(--sm-space-4)" }}>
            The AI pipeline did not detect any items in this walkthrough. Try re-uploading with clearer footage.
          </p>
          <Link to="/upload">
            <Button variant="primary" size="md">Upload Another Walkthrough</Button>
          </Link>
        </div>
      </div>
    );
  }

  const summary = data.summary;

  return (
    <div style={shell}>
      {/* Breadcrumb */}
      <nav style={breadcrumbStyle} aria-label="Breadcrumb">
        <Link to="/upload" style={breadcrumbLinkStyle}>Upload</Link>
        <span style={{ color: "var(--sm-text-tertiary)" }}>&#8250;</span>
        <span style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)" }}>Walkthrough Results</span>
      </nav>

      {/* Page Header */}
      <div style={pageHeaderStyle(isMedium)}>
        <div>
          <h1 style={titleStyle(isMedium)}>Walkthrough Results</h1>
          <p style={subtitleStyle}>
            {data.items.length} items detected &middot; Status: {data.status}
          </p>
        </div>
        <div style={headerActionsStyle(isMedium)}>
          <Link to={`/review`}>
            <Button variant="primary" size="md">Open in Operator Console</Button>
          </Link>
          <Link to="/upload">
            <Button variant="outline" size="md">Upload Another</Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={statsGridStyle(isNarrow)}>
        <StatCard label="Total Items" value={summary.total} color="total" active={filterStatus === "all"} onClick={() => setFilterStatus("all")} />
        <StatCard label="New" value={summary.new} color="new" active={filterStatus === "new"} onClick={() => setFilterStatus("new")} />
        <StatCard label="Matched" value={summary.matched} color="matched" active={filterStatus === "matched"} onClick={() => setFilterStatus("matched")} />
        <StatCard label="Relocated" value={summary.relocated} color="relocated" active={filterStatus === "relocated"} onClick={() => setFilterStatus("relocated")} />
        <StatCard label="Missing" value={summary.missing} color="missing" active={filterStatus === "missing"} onClick={() => setFilterStatus("missing")} />
      </div>

      {/* Toolbar */}
      <div style={toolbarStyle(isNarrow)}>
        <div style={toolbarLeftStyle}>
          <FilterPill label="All Confidence" value="all" active={filterConfidence === "all"} onClick={() => setFilterConfidence("all")} />
          <FilterPill label="High (≥80%)" value="high" active={filterConfidence === "high"} onClick={() => setFilterConfidence("high")} />
          <FilterPill label="Medium (50–79%)" value="medium" active={filterConfidence === "medium"} onClick={() => setFilterConfidence("medium")} />
          <FilterPill label="Low (&lt;50%)" value="low" active={filterConfidence === "low"} onClick={() => setFilterConfidence("low")} />
        </div>
        <div style={toolbarRightStyle}>
          <select
            style={sortSelectStyle}
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-label="Sort items"
          >
            <option value="confidence">Sort by Confidence</option>
            <option value="name">Sort by Name</option>
            <option value="zone">Sort by Zone</option>
            <option value="status">Sort by Status</option>
          </select>
          <span style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)" }}>
            {sortedItems.length} item{sortedItems.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div style={bulkBarStyle(isNarrow)}>
          <span style={{ fontSize: "var(--sm-text-sm)", fontWeight: 500 }}>
            {selectedIds.size} selected
          </span>
          <Button variant="success" size="sm" onClick={handleBulkAccept}>
            Accept Selected
          </Button>
          <Button variant="outline" size="sm" onClick={clearSelection}>
            Clear
          </Button>
        </div>
      )}

      {/* Filtered empty state */}
      {sortedItems.length === 0 && (
        <div style={emptyStateStyle}>
          <div style={{ fontSize: 48, marginBottom: "var(--sm-space-4)" }}>&#128270;</div>
          <h3 style={{ fontSize: "var(--sm-text-lg)", marginBottom: "var(--sm-space-2)" }}>No Matching Items</h3>
          <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)", maxWidth: 400, margin: "0 auto var(--sm-space-4)" }}>
            No items match the current filter combination. Try adjusting the status or confidence filters.
          </p>
          <Button variant="ghost" size="md" onClick={() => {
            setFilterStatus("all");
            setFilterConfidence("all");
          }}>
            Clear All Filters
          </Button>
        </div>
      )}

      {/* Results List */}
      <div ref={listRef} style={listStyle}>
        {sortedItems.map((item, idx) => (
          <ResultCard
            key={item.id}
            item={item}
            isSelected={selectedIds.has(item.id)}
            isFocused={idx === focusedIdx}
            isNarrow={isNarrow}
            onToggleSelect={() => toggleSelect(item.id)}
          />
        ))}
      </div>

      {/* Keyboard Hints */}
      {sortedItems.length > 0 && (
        <p style={kbdHintsStyle}>
          <Kbd>j</Kbd> / <Kbd>k</Kbd> navigate &middot;
          <Kbd>Enter</Kbd> open detail &middot;
          <Kbd>a</Kbd> select &middot;
          <Kbd>e</Kbd> edit &middot;
          <Kbd>Shift+A</Kbd> select all high-confidence &middot;
          <Kbd>Esc</Kbd> clear selection
        </p>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function StatCard({ label, value, color, active, onClick }: {
  label: string;
  value: number;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div
      style={statCardStyle(active)}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-pressed={active}
      aria-label={`${label}: ${value}`}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
    >
      <div style={{ fontSize: "var(--sm-text-2xl)", fontWeight: 700, lineHeight: 1.2, ...statColorStyle(color) }}>
        {value}
      </div>
      <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-secondary)", marginTop: "var(--sm-space-1)" }}>
        {label}
      </div>
    </div>
  );
}

function FilterPill({ label, value, active, onClick }: {
  label: string;
  value: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <span
      style={filterPillStyle(active)}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-pressed={active}
      aria-label={`Filter ${label}`}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
    >
      {label}
    </span>
  );
}

function ResultCard({ item, isSelected, isFocused, isNarrow, onToggleSelect }: {
  item: WalkthroughResultItem;
  isSelected: boolean;
  isFocused: boolean;
  isNarrow: boolean;
  onToggleSelect: () => void;
}) {
  const confClass = classifyConfidence(item.confidence);

  const handleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    if (e.shiftKey || e.metaKey) {
      e.preventDefault();
      onToggleSelect();
    }
  };

  return (
    <div
      data-result-id={item.id}
      style={resultCardStyle(isSelected || isFocused, isNarrow)}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={`${item.label} - ${statusLabel(item.resultStatus)} - ${item.confidence !== null ? `${Math.round(item.confidence)}%` : "N/A"}`}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          window.location.href = `/items/${item.itemId || item.id}`;
        }
      }}
    >
      {/* Thumbnail */}
      <div style={thumbStyle(isNarrow)}>
        {item.keyframeUrl ? (
          <img src={item.keyframeUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontSize: 28 }}>{item.resultStatus === "missing" ? "&#10060;" : "&#128218;"}</span>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "var(--sm-text-base)", fontWeight: 600, marginBottom: 2, display: "flex", alignItems: "center", gap: "var(--sm-space-2)", flexWrap: "wrap" }}>
          {item.label}
          <span style={statusBadgeStyle(item.resultStatus)}>
            <span style={statusDotStyle(item.resultStatus)} />
            {statusLabel(item.resultStatus)}
          </span>
          {item.confidence !== null && (
            <span style={confidenceBadgeStyle(confClass)}>
              {Math.round(item.confidence)}%
            </span>
          )}
        </div>
        <div style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)", display: "flex", gap: "var(--sm-space-3)", flexWrap: "wrap" }}>
          {item.category && <span style={categoryChipStyle}>{item.category}</span>}
          {item.zoneName && <span>{item.zoneName}{item.storageLocationName ? ` · ${item.storageLocationName}` : ""}</span>}
          {item.previousZoneName && item.resultStatus === "relocated" && (
            <span>Previously {item.previousZoneName}</span>
          )}
          {item.frameRef && <span>{item.frameRef}</span>}
          {item.resultStatus === "missing" && <span>Not found in this walkthrough</span>}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "var(--sm-space-2)", flexShrink: 0 }}>
        <Button variant="success" size="sm" onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}>
          &#10003;
        </Button>
        <Button variant="ghost" size="sm" onClick={(e) => {
          e.stopPropagation();
          window.location.href = `/items/${item.itemId || item.id}`;
        }}>
          &#9998;
        </Button>
      </div>
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
};

const breadcrumbLinkStyle: React.CSSProperties = {
  color: "var(--sm-text-link)",
  textDecoration: "none",
};

const pageHeaderStyle = (isMedium: boolean): React.CSSProperties => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "var(--sm-space-4)",
  marginBottom: "var(--sm-space-6)",
  flexWrap: "wrap",
  ...(isMedium ? { flexDirection: "column" as const } : {}),
});

const titleStyle = (isMedium: boolean): React.CSSProperties => ({
  fontSize: isMedium ? "var(--sm-text-xl)" : "var(--sm-text-2xl)",
  fontWeight: 700,
  marginBottom: "var(--sm-space-1)",
});

const subtitleStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-sm)",
  color: "var(--sm-text-secondary)",
};

const headerActionsStyle = (isMedium: boolean): React.CSSProperties => ({
  display: "flex",
  gap: "var(--sm-space-3)",
  flexWrap: "wrap",
  ...(isMedium ? { width: "100%" } : {}),
});

const statsGridStyle = (isNarrow: boolean): React.CSSProperties => ({
  display: "grid",
  gridTemplateColumns: isNarrow ? "repeat(3, 1fr)" : "repeat(5, 1fr)",
  gap: isNarrow ? "var(--sm-space-2)" : "var(--sm-space-3)",
  marginBottom: "var(--sm-space-8)",
});

const statCardStyle = (active: boolean): React.CSSProperties => ({
  textAlign: "center",
  padding: "var(--sm-space-4)",
  border: `1px solid ${active ? "var(--sm-brand-500)" : "var(--sm-border-default)"}`,
  borderRadius: "var(--sm-radius-lg)",
  background: active ? "var(--sm-brand-50)" : "var(--sm-surface-card)",
  cursor: "pointer",
  transition: "border-color var(--sm-transition-fast), box-shadow var(--sm-transition-fast)",
});

const statColorStyle = (color: string): React.CSSProperties => {
  switch (color) {
    case "new": return { color: "var(--sm-success-600)" };
    case "matched": return { color: "var(--sm-brand-600)" };
    case "relocated": return { color: "var(--sm-warning-600)" };
    case "missing": return { color: "var(--sm-danger-600)" };
    default: return { color: "var(--sm-text-primary)" };
  }
};

const toolbarStyle = (isNarrow: boolean): React.CSSProperties => ({
  display: "flex",
  justifyContent: "space-between",
  alignItems: isNarrow ? "flex-start" : "center",
  gap: "var(--sm-space-4)",
  marginBottom: "var(--sm-space-4)",
  flexWrap: "wrap",
  ...(isNarrow ? { flexDirection: "column" as const } : {}),
});

const toolbarLeftStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--sm-space-3)",
};

const toolbarRightStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--sm-space-2)",
};

const filterPillStyle = (active: boolean): React.CSSProperties => ({
  fontSize: "var(--sm-text-xs)",
  fontWeight: 500,
  padding: "var(--sm-space-1) var(--sm-space-3)",
  borderRadius: "var(--sm-radius-full)",
  border: `1px solid ${active ? "var(--sm-brand-600)" : "var(--sm-border-default)"}`,
  background: active ? "var(--sm-brand-600)" : "var(--sm-surface-card)",
  color: active ? "var(--sm-text-inverse)" : "var(--sm-text-secondary)",
  cursor: "pointer",
  transition: "all var(--sm-transition-fast)",
  whiteSpace: "nowrap",
});

const sortSelectStyle: React.CSSProperties = {
  font: "inherit",
  fontSize: "var(--sm-text-sm)",
  padding: "var(--sm-space-1) var(--sm-space-3)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-md)",
  background: "var(--sm-surface-card)",
  color: "var(--sm-text-primary)",
  cursor: "pointer",
};

const bulkBarStyle = (isNarrow: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: "var(--sm-space-4)",
  padding: "var(--sm-space-3) var(--sm-space-4)",
  background: "var(--sm-brand-50)",
  border: "1px solid var(--sm-brand-200)",
  borderRadius: "var(--sm-radius-lg)",
  marginBottom: "var(--sm-space-4)",
  flexWrap: "wrap",
  position: "sticky",
  top: 0,
  zIndex: 10,
  ...(isNarrow ? { flexDirection: "column" as const, alignItems: "stretch", textAlign: "center" as const } : {}),
});

const listStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--sm-space-3)",
};

const resultCardStyle = (highlighted: boolean, isNarrow: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: isNarrow ? "var(--sm-space-3)" : "var(--sm-space-4)",
  padding: isNarrow ? "var(--sm-space-3)" : "var(--sm-space-4)",
  border: `1px solid ${highlighted ? "var(--sm-brand-500)" : "var(--sm-border-default)"}`,
  borderRadius: "var(--sm-radius-lg)",
  background: highlighted ? "var(--sm-brand-50)" : "var(--sm-surface-card)",
  cursor: "pointer",
  transition: "box-shadow var(--sm-transition-fast), border-color var(--sm-transition-fast)",
  ...(isNarrow ? { flexWrap: "wrap" as const } : {}),
});

const thumbStyle = (isNarrow: boolean): React.CSSProperties => ({
  width: isNarrow ? 56 : 72,
  height: isNarrow ? 42 : 54,
  borderRadius: "var(--sm-radius-md)",
  background: "var(--sm-neutral-200)",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
});

const statusDotStyle = (status: string): React.CSSProperties => {
  const color =
    status === "new" ? "var(--sm-success-500)" :
    status === "matched" ? "var(--sm-brand-500)" :
    status === "relocated" ? "var(--sm-warning-400)" :
    "var(--sm-danger-500)";
  return { width: 8, height: 8, borderRadius: "50%", display: "inline-block", flexShrink: 0, background: color };
};

const statusBadgeStyle = (status: string): React.CSSProperties => {
  const bg =
    status === "new" ? "#dcfce7" :
    status === "matched" ? "#dbeafe" :
    status === "relocated" ? "#fef3c7" :
    status === "missing" ? "#fee2e2" :
    "#fef3c7";
  const color =
    status === "new" ? "#166534" :
    status === "matched" ? "#1e40af" :
    status === "relocated" ? "#92400e" :
    status === "missing" ? "#991b1b" :
    "#92400e";
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    fontWeight: 500,
    padding: "2px 8px",
    borderRadius: "var(--sm-radius-full)",
    background: bg,
    color,
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

const kbdHintsStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-xs)",
  color: "var(--sm-text-tertiary)",
  marginTop: "var(--sm-space-6)",
  textAlign: "center",
};
