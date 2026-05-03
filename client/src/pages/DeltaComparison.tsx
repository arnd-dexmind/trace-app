import { useEffect, useState } from "react";
import {
  listWalkthroughs,
  getWalkthroughComparison,
  getSpaceId,
  type Walkthrough,
  type WalkthroughComparison,
  type ComparisonItem,
} from "../api";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";

const CHANGE_COLORS: Record<ComparisonItem["changeType"], string> = {
  added: "var(--sm-green-100)",
  removed: "var(--sm-red-100)",
  changed: "var(--sm-amber-100)",
  unchanged: "var(--sm-gray-50)",
};

const CHANGE_TEXT: Record<ComparisonItem["changeType"], string> = {
  added: "#166534",
  removed: "#991b1b",
  changed: "#92400e",
  unchanged: "#374151",
};

const CHANGE_BADGE: Record<ComparisonItem["changeType"], string> = {
  added: "#dcfce7",
  removed: "#fee2e2",
  changed: "#fef3c7",
  unchanged: "#f3f4f6",
};

const CHANGE_LABEL: Record<ComparisonItem["changeType"], string> = {
  added: "Added",
  removed: "Removed",
  changed: "Changed",
  unchanged: "Unchanged",
};

type FilterType = "all" | ComparisonItem["changeType"];

export function DeltaComparison() {
  const spaceId = getSpaceId();

  const [walkthroughs, setWalkthroughs] = useState<Walkthrough[]>([]);
  const [baselineId, setBaselineId] = useState<string>("");
  const [comparisonId, setComparisonId] = useState<string>("");
  const [result, setResult] = useState<WalkthroughComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");

  useEffect(() => {
    if (!spaceId) return;
    listWalkthroughs(spaceId)
      .then((data) => setWalkthroughs(data.filter((w) => w.status === "applied" || w.status === "awaiting_review")))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load walkthroughs"));
  }, [spaceId]);

  const handleCompare = () => {
    if (!baselineId || !comparisonId) return;
    setLoading(true);
    setError(null);
    getWalkthroughComparison(baselineId, comparisonId)
      .then((data) => setResult(data))
      .catch((e) => setError(e instanceof Error ? e.message : "Comparison failed"))
      .finally(() => setLoading(false));
  };

  const filteredItems = result?.items.filter(
    (item) => filter === "all" || item.changeType === filter,
  ) ?? [];

  if (!spaceId) {
    return (
      <div style={shell}>
        <EmptyState
          icon="&#128200;"
          title="No Space Selected"
          description="Select a space from the top navigation to compare walkthroughs."
        />
      </div>
    );
  }

  return (
    <div style={shell}>
      <div style={hero}>
        <h1 style={{ fontSize: "var(--sm-text-2xl)", fontWeight: 700, margin: 0 }}>Walkthrough Comparison</h1>
        <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)", margin: 0 }}>
          Compare observations between two walkthroughs
        </p>
      </div>

      {error && (
        <div style={errorBanner}>
          {error}
          <button onClick={() => setError(null)} style={dismissBtn}>x</button>
        </div>
      )}

      {/* Picker */}
      <div style={pickerCard}>
        <div style={pickerRow}>
          <div style={pickerField}>
            <label style={pickerLabel}>Baseline</label>
            <select
              value={baselineId}
              onChange={(e) => setBaselineId(e.target.value)}
              style={pickerSelect}
            >
              <option value="">Select walkthrough...</option>
              {walkthroughs
                .filter((w) => w.id !== comparisonId)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {new Date(w.uploadedAt).toLocaleDateString()} — {w.status}
                  </option>
                ))}
            </select>
          </div>
          <div style={pickerField}>
            <label style={pickerLabel}>Comparison</label>
            <select
              value={comparisonId}
              onChange={(e) => setComparisonId(e.target.value)}
              style={pickerSelect}
            >
              <option value="">Select walkthrough...</option>
              {walkthroughs
                .filter((w) => w.id !== baselineId)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {new Date(w.uploadedAt).toLocaleDateString()} — {w.status}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <Button
          onClick={handleCompare}
          disabled={!baselineId || !comparisonId || loading}
          style={{ width: "100%", marginTop: "var(--sm-space-4)" }}
        >
          {loading ? "Comparing..." : "Compare Walkthroughs"}
        </Button>
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Summary stats */}
          <div style={summaryGrid}>
            {(["added", "removed", "changed", "unchanged"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilter(filter === type ? "all" : type)}
                style={{
                  ...summaryCard,
                  backgroundColor: filter === type ? CHANGE_BADGE[type] : "var(--sm-bg-surface)",
                  borderColor: filter === type ? CHANGE_TEXT[type] : "var(--sm-border-default)",
                }}
              >
                <span style={{ fontSize: "var(--sm-text-2xl)", fontWeight: 700, color: CHANGE_TEXT[type] }}>
                  {result.summary[type]}
                </span>
                <span style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)" }}>
                  {CHANGE_LABEL[type]}
                </span>
              </button>
            ))}
          </div>

          {/* Diff table */}
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Status</th>
                  <th style={th}>Label</th>
                  <th style={th}>Zone</th>
                  <th style={th}>Location</th>
                  <th style={th}>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr
                    key={item.id}
                    style={{ backgroundColor: CHANGE_COLORS[item.changeType] }}
                  >
                    <td style={td}>
                      <span style={{
                        ...badgeStyle,
                        backgroundColor: CHANGE_BADGE[item.changeType],
                        color: CHANGE_TEXT[item.changeType],
                      }}>
                        {CHANGE_LABEL[item.changeType]}
                      </span>
                    </td>
                    <td style={td}>
                      <DiffValue
                        baseline={item.baselineLabel}
                        comparison={item.comparisonLabel}
                        changed={item.changeType === "changed"}
                        changeType={item.changeType}
                      />
                    </td>
                    <td style={td}>
                      <DiffValue
                        baseline={item.baselineZone}
                        comparison={item.comparisonZone}
                        changed={item.changeType === "changed" && item.baselineZone !== item.comparisonZone}
                        changeType={item.changeType}
                      />
                    </td>
                    <td style={td}>
                      <DiffValue
                        baseline={item.baselineLocation}
                        comparison={item.comparisonLocation}
                        changed={item.changeType === "changed" && item.baselineLocation !== item.comparisonLocation}
                        changeType={item.changeType}
                      />
                    </td>
                    <td style={td}>
                      <DiffValue
                        baseline={item.baselineConfidence != null ? `${(item.baselineConfidence * 100).toFixed(0)}%` : null}
                        comparison={item.comparisonConfidence != null ? `${(item.comparisonConfidence * 100).toFixed(0)}%` : null}
                        changed={item.changeType === "changed" && item.baselineConfidence !== item.comparisonConfidence}
                        changeType={item.changeType}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredItems.length === 0 && (
              <div style={emptyRow}>No items match the selected filter.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DiffValue({
  baseline,
  comparison,
  changed,
  changeType,
}: {
  baseline: string | null;
  comparison: string | null;
  changed: boolean;
  changeType: ComparisonItem["changeType"];
}) {
  if (changeType === "added") {
    return <span style={{ color: "#166534", fontWeight: 600 }}>{comparison ?? baseline ?? "—"}</span>;
  }
  if (changeType === "removed") {
    return <span style={{ color: "#991b1b", textDecoration: "line-through" }}>{baseline ?? "—"}</span>;
  }
  if (changed) {
    return (
      <span>
        <span style={{ color: "#991b1b", textDecoration: "line-through", marginRight: 6 }}>
          {baseline ?? "—"}
        </span>
        <span style={{ color: "#166534", fontWeight: 600 }}>
          {comparison ?? "—"}
        </span>
      </span>
    );
  }
  return <span>{comparison ?? baseline ?? "—"}</span>;
}

const shell: React.CSSProperties = {
  maxWidth: 1200,
  margin: "0 auto",
  padding: "var(--sm-space-6) var(--sm-space-4)",
};

const hero: React.CSSProperties = {
  marginBottom: "var(--sm-space-6)",
};

const errorBanner: React.CSSProperties = {
  backgroundColor: "var(--sm-red-100)",
  color: "#991b1b",
  padding: "var(--sm-space-3) var(--sm-space-4)",
  borderRadius: "var(--sm-radius-md)",
  marginBottom: "var(--sm-space-4)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const dismissBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#991b1b",
  fontWeight: 700,
  cursor: "pointer",
};

const pickerCard: React.CSSProperties = {
  backgroundColor: "var(--sm-bg-surface)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-lg)",
  padding: "var(--sm-space-4)",
  marginBottom: "var(--sm-space-6)",
};

const pickerRow: React.CSSProperties = {
  display: "flex",
  gap: "var(--sm-space-4)",
  flexWrap: "wrap" as const,
};

const pickerField: React.CSSProperties = {
  flex: "1 1 200px",
};

const pickerLabel: React.CSSProperties = {
  display: "block",
  fontSize: "var(--sm-text-sm)",
  fontWeight: 600,
  color: "var(--sm-text-secondary)",
  marginBottom: "var(--sm-space-2)",
};

const pickerSelect: React.CSSProperties = {
  width: "100%",
  padding: "var(--sm-space-2) var(--sm-space-3)",
  fontSize: "var(--sm-text-sm)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-md)",
  backgroundColor: "var(--sm-bg-input)",
  color: "var(--sm-text-primary)",
};

const summaryGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: "var(--sm-space-3)",
  marginBottom: "var(--sm-space-6)",
};

const summaryCard: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "var(--sm-space-4)",
  borderRadius: "var(--sm-radius-lg)",
  border: "2px solid transparent",
  cursor: "pointer",
  background: "none",
  fontFamily: "inherit",
};

const tableWrap: React.CSSProperties = {
  overflowX: "auto",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-lg)",
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "var(--sm-text-sm)",
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "var(--sm-space-2) var(--sm-space-3)",
  fontWeight: 600,
  color: "var(--sm-text-secondary)",
  borderBottom: "1px solid var(--sm-border-default)",
  backgroundColor: "var(--sm-bg-subtle)",
};

const td: React.CSSProperties = {
  padding: "var(--sm-space-2) var(--sm-space-3)",
  borderBottom: "1px solid var(--sm-border-default)",
  verticalAlign: "middle",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: "var(--sm-radius-full)",
  fontSize: "var(--sm-text-xs)",
  fontWeight: 600,
};

const emptyRow: React.CSSProperties = {
  textAlign: "center",
  padding: "var(--sm-space-8)",
  color: "var(--sm-text-tertiary)",
};
