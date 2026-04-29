import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { searchItems, type InventoryItem, getSpaceId } from "../api";

export function ItemSearch() {
  const spaceId = getSpaceId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InventoryItem[]>([]);
  const [suggestions, setSuggestions] = useState<InventoryItem[]>([]);
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!spaceId) return;
    searchItems(spaceId).then(setResults).catch(() => {});
  }, [spaceId]);

  const handleInput = (q: string) => {
    setQuery(q);
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
    searchItems(spaceId, q || undefined)
      .then(setResults)
      .catch((e) => setError(e instanceof Error ? e.message : "Search failed"));
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
        setQuery(suggestions[focusedIdx].name);
      }
      submitSearch(query);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  if (!spaceId) {
    return (
      <div style={shell}>
        <div style={emptyState}>
          <div style={{ fontSize: 48, marginBottom: "var(--sm-space-4)" }}>&#128269;</div>
          <p>Select a space to search items.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={shell}>
      {/* Search bar */}
      <div style={{ position: "relative", marginBottom: "var(--sm-space-6)" }}>
        <span style={searchIcon}>&#128269;</span>
        <input
          type="search"
          style={searchInput}
          placeholder="Search items by name, category, or location..."
          value={query}
          onChange={(e) => handleInput(e.target.value)}
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
                  setQuery(item.name);
                  submitSearch(item.name);
                }}
              >
                <div style={acIcon}>&#128736;</div>
                <div>
                  <div style={{ fontSize: "var(--sm-text-sm)" }}>{item.name}</div>
                  <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)" }}>
                    {item.category || "Uncategorized"} &middot; Qty: {item.quantity}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div style={errorBanner}>
          {error}
          <button onClick={() => setError(null)} style={dismissBtn}>x</button>
        </div>
      )}

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
              <div style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)", display: "flex", gap: "var(--sm-space-3)", flexWrap: "wrap" }}>
                {item.category && <span style={chip}>{item.category}</span>}
                <span>Qty: {item.quantity}</span>
                <span>Created {new Date(item.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
            <span style={{ color: "var(--sm-text-tertiary)", fontSize: 20, flexShrink: 0 }}>&#8594;</span>
          </Link>
        ))}

        {results.length === 0 && (
          <div style={emptyState}>
            <div style={{ fontSize: 48, marginBottom: "var(--sm-space-4)" }}>&#128269;</div>
            <p>No items found. Try a different search.</p>
          </div>
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
  background: "var(--sm-surface-card)", color: "var(--sm-text-primary)", outline: "none", boxSizing: "border-box",
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

const emptyState: React.CSSProperties = {
  textAlign: "center", padding: "var(--sm-space-16) var(--sm-space-4)", color: "var(--sm-text-tertiary)",
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
