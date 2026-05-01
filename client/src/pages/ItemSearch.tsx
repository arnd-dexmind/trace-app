import { useEffect, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { searchItems, type InventoryItem, type ItemSearchParams, getSpaceId } from "../api";
import { EmptyState } from "../components/ui/EmptyState";

const SORT_OPTIONS: { value: ItemSearchParams["sort"]; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "category", label: "Category" },
  { value: "zone", label: "Zone" },
  { value: "lastSeen", label: "Last Seen" },
  { value: "confidence", label: "Confidence" },
];

export function ItemSearch() {
  const spaceId = getSpaceId();
  const [searchParams, setSearchParams] = useSearchParams();

  // Derive state from URL params
  const query = searchParams.get("q") || "";
  const sort = (searchParams.get("sort") as ItemSearchParams["sort"]) || "name";
  const order = (searchParams.get("order") as ItemSearchParams["order"]) || "asc";
  const categoryFilter = searchParams.get("category") || "";
  const zoneFilter = searchParams.get("zone") || "";
  const confidenceMin = searchParams.get("confMin") ? Number(searchParams.get("confMin")) : undefined;
  const confidenceMax = searchParams.get("confMax") ? Number(searchParams.get("confMax")) : undefined;

  const [results, setResults] = useState<InventoryItem[]>([]);
  const [suggestions, setSuggestions] = useState<InventoryItem[]>([]);
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Collect unique categories and zones from results for filter chips
  const categories = [...new Set(results.map((i) => i.category).filter(Boolean) as string[])];
  const zones = [...new Set(
    results
      .map((i) => i.latestLocation?.zone?.name)
      .filter(Boolean) as string[]
  )];

  const hasActiveFilters = !!(categoryFilter || zoneFilter || confidenceMin !== undefined || confidenceMax !== undefined || sort !== "name" || order !== "asc");

  const doSearch = useCallback(async (searchQuery: string) => {
    if (!spaceId) return;
    setLoading(true);
    try {
      const params: ItemSearchParams = {};
      if (searchQuery) params.name = searchQuery;
      if (categoryFilter) params.category = categoryFilter;
      if (zoneFilter) params.zoneId = zoneFilter;
      if (confidenceMin !== undefined) params.confidenceMin = confidenceMin;
      if (confidenceMax !== undefined) params.confidenceMax = confidenceMax;
      if (sort !== "name") params.sort = sort;
      if (order !== "asc") params.order = order;

      const items = await searchItems(spaceId, params);
      setResults(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [spaceId, categoryFilter, zoneFilter, confidenceMin, confidenceMax, sort, order]);

  // Initial load and re-search when filters change
  useEffect(() => {
    if (!spaceId) return;
    doSearch(query);
  }, [spaceId, categoryFilter, zoneFilter, confidenceMin, confidenceMax, sort, order]);

  const handleInput = (q: string) => {
    updateParam("q", q || null);
    setFocusedIdx(-1);
    setShowSuggestions(true);
    if (q.length > 0 && spaceId) {
      searchItems(spaceId, q).then((items) => setSuggestions(items.slice(0, 6)));
    } else {
      setSuggestions([]);
    }
  };

  const submitSearch = (q: string) => {
    if (!spaceId) return;
    setShowSuggestions(false);
    updateParam("q", q || null);
    doSearch(q);
  };

  const updateParam = (key: string, value: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  };

  const clearAllFilters = () => {
    setSearchParams(new URLSearchParams());
    setQueryInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      if (focusedIdx >= 0 && suggestions[focusedIdx]) {
        setQueryInput(suggestions[focusedIdx].name);
      }
      submitSearch(query);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  // Local input state for controlled input with URL sync
  const [queryInput, setQueryInput] = useState(query);

  if (!spaceId) {
    return (
      <div style={shell}>
        <EmptyState
          icon="&#128269;"
          title="No space selected"
          description="Select a space to search its inventory."
        />
      </div>
    );
  }

  return (
    <div style={shell}>
      {/* Search bar */}
      <div style={{ position: "relative", marginBottom: "var(--sm-space-4)" }}>
        <span style={searchIcon}>&#128269;</span>
        <input
          type="search"
          style={searchInput}
          placeholder="Search items by name, category, or location..."
          value={queryInput}
          onChange={(e) => {
            setQueryInput(e.target.value);
            handleInput(e.target.value);
          }}
          onFocus={() => { if (query) setShowSuggestions(true); }}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={showSuggestions && suggestions.length > 0}
        />

        {showSuggestions && suggestions.length > 0 && (
          <div style={autocomplete}>
            {suggestions.map((item, i) => (
              <div
                key={item.id}
                style={acItem(i === focusedIdx)}
                onMouseEnter={() => setFocusedIdx(i)}
                onClick={() => {
                  setQueryInput(item.name);
                  submitSearch(item.name);
                }}
              >
                <div style={acIcon}>&#128736;</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "var(--sm-text-sm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                  <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)" }}>
                    {item.category || "Uncategorized"}
                    {item.latestLocation && (
                      <> &middot; Last seen {new Date(item.latestLocation.observedAt).toLocaleDateString()}</>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sort & Filter Toolbar */}
      <div style={toolbarStyle}>
        <div style={toolbarLeft}>
          {/* Sort */}
          <label style={controlLabel}>
            <span style={labelText}>Sort</span>
            <select
              value={sort}
              onChange={(e) => updateParam("sort", e.target.value === "name" ? null : e.target.value)}
              style={selectStyle}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <button
            onClick={() => updateParam("order", order === "asc" ? "desc" : null)}
            style={orderBtnStyle}
            aria-label={order === "asc" ? "Sort ascending" : "Sort descending"}
            title={order === "asc" ? "Ascending" : "Descending"}
          >
            {order === "asc" ? "&#8593;" : "&#8595;"}
          </button>

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            style={{
              ...filterToggleStyle,
              background: showFilters || hasActiveFilters ? "var(--sm-brand-100)" : "var(--sm-neutral-100)",
              borderColor: showFilters || hasActiveFilters ? "var(--sm-brand-500)" : "var(--sm-border-default)",
            }}
          >
            &#9776; Filters{hasActiveFilters ? " *" : ""}
          </button>

          {hasActiveFilters && (
            <button onClick={clearAllFilters} style={clearBtnStyle}>
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div style={filterPanelStyle}>
          {/* Category chips */}
          {categories.length > 0 && (
            <div style={filterGroupStyle}>
              <span style={filterLabelStyle}>Category</span>
              <div style={chipGroupStyle}>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => updateParam("category", categoryFilter === cat ? null : cat)}
                    style={filterChipStyle(categoryFilter === cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Zone filter */}
          {zones.length > 0 && (
            <div style={filterGroupStyle}>
              <span style={filterLabelStyle}>Zone</span>
              <select
                value={zoneFilter}
                onChange={(e) => updateParam("zone", e.target.value || null)}
                style={selectStyle}
              >
                <option value="">All zones</option>
                {zones.map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
            </div>
          )}

          {/* Confidence range */}
          <div style={filterGroupStyle}>
            <span style={filterLabelStyle}>Confidence</span>
            <div style={{ display: "flex", gap: "var(--sm-space-2)", alignItems: "center" }}>
              <input
                type="number"
                min={0}
                max={100}
                placeholder="Min"
                value={confidenceMin ?? ""}
                onChange={(e) => updateParam("confMin", e.target.value || null)}
                style={numberInputStyle}
              />
              <span style={{ color: "var(--sm-text-tertiary)" }}>&ndash;</span>
              <input
                type="number"
                min={0}
                max={100}
                placeholder="Max"
                value={confidenceMax ?? ""}
                onChange={(e) => updateParam("confMax", e.target.value || null)}
                style={numberInputStyle}
              />
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={errorBanner}>
          {error}
          <button onClick={() => setError(null)} style={dismissBtn}>x</button>
        </div>
      )}

      {/* Loading indicator */}
      {loading && <div style={loadingBar} />}

      {/* Results */}
      <div style={resultsHeader}>
        <h2 style={{ fontSize: "var(--sm-text-base)", fontWeight: 600 }}>Results</h2>
        <span style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)" }}>
          {results.length} item{results.length !== 1 ? "s" : ""} found
        </span>
      </div>

      <div>
        {results.map((item) => (
          <Link key={item.id} to={`/items/${item.id}`} style={resultCard}>
            <div style={resultIcon}>&#128736;</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "var(--sm-text-base)", fontWeight: 600, marginBottom: 2 }}>
                {item.name}
              </div>
              <div style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)", display: "flex", gap: "var(--sm-space-3)", flexWrap: "wrap", alignItems: "center" }}>
                {item.category && <span style={chip}>{item.category}</span>}
                {item.latestLocation ? (
                  <>
                    <span>
                      &#128205; {item.latestLocation.zone?.name || item.latestLocation.storageLocation?.name || "Unknown"}
                    </span>
                    <span>{new Date(item.latestLocation.observedAt).toLocaleDateString()}</span>
                  </>
                ) : (
                  <span>Never seen</span>
                )}
              </div>
            </div>
            <span style={{ color: "var(--sm-text-tertiary)", fontSize: 20, flexShrink: 0 }}>&#8594;</span>
          </Link>
        ))}

        {results.length === 0 && !loading && (
          <EmptyState
            icon="&#128269;"
            title="No items found"
            description={hasActiveFilters ? "No items match the current filters. Try clearing them." : "Try a different search term or check that inventory has been added for this space."}
          />
        )}
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const shell: React.CSSProperties = {
  maxWidth: 960, margin: "0 auto", padding: "0 var(--sm-space-4)", paddingTop: "var(--sm-space-6)",
};

const searchInput: React.CSSProperties = {
  width: "100%", font: "inherit", fontSize: "var(--sm-text-lg)",
  padding: "var(--sm-space-3) var(--sm-space-4)", paddingLeft: 48,
  border: "2px solid var(--sm-border-default)", borderRadius: "var(--sm-radius-lg)",
  background: "var(--sm-surface-card)", color: "var(--sm-text-primary)", boxSizing: "border-box",
};

const searchIcon: React.CSSProperties = {
  position: "absolute", left: "var(--sm-space-4)", top: "50%",
  transform: "translateY(-50%)", color: "var(--sm-text-tertiary)", fontSize: 20, pointerEvents: "none", zIndex: 1,
};

const autocomplete: React.CSSProperties = {
  position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
  background: "var(--sm-surface-card)", border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-md)", boxShadow: "var(--sm-shadow-lg)",
  zIndex: 50, maxHeight: 320, overflowY: "auto",
};

const acItem = (focused: boolean): React.CSSProperties => ({
  display: "flex", alignItems: "center", gap: "var(--sm-space-3)",
  padding: "var(--sm-space-2) var(--sm-space-4)", cursor: "pointer",
  background: focused ? "var(--sm-neutral-50)" : undefined,
});

const acIcon: React.CSSProperties = {
  width: 32, height: 32, borderRadius: "var(--sm-radius-md)",
  background: "var(--sm-neutral-100)", display: "flex",
  alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0,
};

const resultCard: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "var(--sm-space-4)",
  padding: "var(--sm-space-4)", border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-lg)", marginBottom: "var(--sm-space-3)",
  textDecoration: "none", color: "inherit", transition: "box-shadow var(--sm-transition-fast)",
};

const resultIcon: React.CSSProperties = {
  width: 48, height: 48, borderRadius: "var(--sm-radius-md)",
  background: "var(--sm-neutral-100)", display: "flex",
  alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0,
};

const chip: React.CSSProperties = {
  display: "inline-block", fontSize: 11, fontWeight: 500, padding: "1px 8px",
  borderRadius: "var(--sm-radius-full)", background: "var(--sm-neutral-100)", color: "var(--sm-text-secondary)",
};

const resultsHeader: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  marginBottom: "var(--sm-space-4)", flexWrap: "wrap", gap: "var(--sm-space-2)",
};

const errorBanner: React.CSSProperties = {
  background: "var(--sm-danger-500)", color: "#fff",
  padding: "var(--sm-space-2) var(--sm-space-4)", borderRadius: "var(--sm-radius-md)",
  marginBottom: "var(--sm-space-4)", display: "flex",
  justifyContent: "space-between", alignItems: "center", fontSize: "var(--sm-text-sm)",
};

const dismissBtn: React.CSSProperties = {
  background: "none", border: "none", color: "#fff", fontWeight: 700, cursor: "pointer",
};

// ── New toolbar & filter styles ──────────────────────────────────────

const toolbarStyle: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  flexWrap: "wrap", gap: "var(--sm-space-2)", marginBottom: "var(--sm-space-4)",
};

const toolbarLeft: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "var(--sm-space-2)", flexWrap: "wrap",
};

const controlLabel: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "var(--sm-space-2)",
  fontSize: "var(--sm-text-sm)",
};

const labelText: React.CSSProperties = {
  color: "var(--sm-text-secondary)", fontWeight: 500,
};

const selectStyle: React.CSSProperties = {
  font: "inherit", fontSize: "var(--sm-text-sm)",
  padding: "var(--sm-space-1) var(--sm-space-3)",
  border: "1px solid var(--sm-border-default)", borderRadius: "var(--sm-radius-md)",
  background: "var(--sm-surface-card)", color: "var(--sm-text-primary)",
};

const orderBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 32, height: 32, fontSize: 14, fontWeight: 700,
  border: "1px solid var(--sm-border-default)", borderRadius: "var(--sm-radius-md)",
  background: "var(--sm-surface-card)", color: "var(--sm-text-primary)",
  cursor: "pointer",
};

const filterToggleStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "var(--sm-space-1)",
  padding: "var(--sm-space-1) var(--sm-space-3)",
  fontSize: "var(--sm-text-sm)", fontWeight: 500,
  border: "1px solid var(--sm-border-default)", borderRadius: "var(--sm-radius-md)",
  cursor: "pointer",
};

const clearBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center",
  padding: "var(--sm-space-1) var(--sm-space-3)",
  fontSize: "var(--sm-text-sm)", fontWeight: 500,
  border: "none", borderRadius: "var(--sm-radius-md)",
  background: "var(--sm-danger-100)", color: "var(--sm-danger-700)",
  cursor: "pointer",
};

const filterPanelStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: "var(--sm-space-4)",
  padding: "var(--sm-space-4)", marginBottom: "var(--sm-space-4)",
  border: "1px solid var(--sm-border-default)", borderRadius: "var(--sm-radius-lg)",
  background: "var(--sm-surface-card)",
};

const filterGroupStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: "var(--sm-space-1)",
};

const filterLabelStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-xs)", fontWeight: 600, color: "var(--sm-text-secondary)",
  textTransform: "uppercase", letterSpacing: "0.05em",
};

const chipGroupStyle: React.CSSProperties = {
  display: "flex", flexWrap: "wrap", gap: "var(--sm-space-1)",
};

const filterChipStyle = (active: boolean): React.CSSProperties => ({
  display: "inline-flex", padding: "2px 10px", fontSize: "var(--sm-text-sm)", fontWeight: 500,
  border: active ? "2px solid var(--sm-brand-500)" : "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-full)", cursor: "pointer",
  background: active ? "var(--sm-brand-100)" : "var(--sm-neutral-50)",
  color: active ? "var(--sm-brand-700)" : "var(--sm-text-secondary)",
});

const numberInputStyle: React.CSSProperties = {
  width: 70, font: "inherit", fontSize: "var(--sm-text-sm)",
  padding: "var(--sm-space-1) var(--sm-space-2)",
  border: "1px solid var(--sm-border-default)", borderRadius: "var(--sm-radius-md)",
  background: "var(--sm-surface-card)", color: "var(--sm-text-primary)",
};

const loadingBar: React.CSSProperties = {
  height: 3, marginBottom: "var(--sm-space-4)",
  borderRadius: "var(--sm-radius-full)",
  background: "var(--sm-brand-500)",
  animation: "pulse 1.5s ease infinite",
};
