import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getItem, type InventoryItem, type LocationHistoryEntry, type RepairIssue, getSpaceId } from "../api";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";

export function ItemDetail() {
  const { itemId } = useParams<{ itemId: string }>();
  const spaceId = getSpaceId();
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!spaceId || !itemId) return;
    getItem(spaceId, itemId)
      .then(setItem)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load item"));
  }, [spaceId, itemId]);

  if (!spaceId || !itemId) {
    return <div style={shell}><p style={muted}>Missing space or item ID.</p></div>;
  }

  if (error) {
    return (
      <div style={shell}>
        <div style={{ ...errorBanner, marginTop: "var(--sm-space-6)" }}>
          {error}
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "#fff", fontWeight: 700, cursor: "pointer" }}>x</button>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div style={shell}>
        <div style={{ textAlign: "center", padding: "var(--sm-space-16)", color: "var(--sm-text-tertiary)" }}>
          Loading...
        </div>
      </div>
    );
  }

  const history = item.locationHistory || [];

  return (
    <div style={shell}>
      {/* Breadcrumb */}
      <nav style={breadcrumb} aria-label="Breadcrumb">
        <Link to="/items" style={{ color: "var(--sm-text-link)", textDecoration: "none" }}>Items</Link>
        <span style={{ color: "var(--sm-text-tertiary)" }}>&#8250;</span>
        <span>{item.name}</span>
      </nav>

      {/* Header */}
      <div style={detailHeader}>
        <div>
          <span style={statusBadge("in-place")}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--sm-success-500)", display: "inline-block" }} />{" "}
            {item.category ? "Active" : "In place"}
          </span>
          <h1 style={{ fontSize: "var(--sm-text-2xl)", fontWeight: 700, marginBottom: "var(--sm-space-1)" }}>
            {item.name}
          </h1>
          <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)" }}>
            ID: {item.id.slice(0, 12)}...{item.category && <><span style={{ margin: "0 8px" }}>&middot;</span><span style={chip}>{item.category}</span></>}
          </p>
        </div>
      </div>

      {/* Info Grid */}
      <div className="info-grid-stack" style={infoGrid}>
        <InfoItem label="Category" value={item.category || "Uncategorized"} />
        <InfoItem label="Status" value="Active" sub={history.length > 0 ? `Tracked since ${new Date(history[history.length - 1].observedAt).toLocaleDateString()}` : "No history"} />
        <InfoItem
          label="Last Seen"
          value={history.length > 0 ? new Date(history[0].observedAt).toLocaleString() : "Never"}
          sub={history.length > 0 ? `Source: observation` : undefined}
        />
        <InfoItem label="Quantity" value={String(item.quantity)} sub={item.description || undefined} />
      </div>

      {/* Current Location */}
      {history.length > 0 && (
        <div style={locationCard}>
          <h2 style={{ fontSize: "var(--sm-text-base)", fontWeight: 600, marginBottom: "var(--sm-space-4)", display: "flex", alignItems: "center", gap: "var(--sm-space-2)" }}>
            &#128205; Current Location
          </h2>
          <div className="location-grid-stack" style={locationGrid}>
            <LocItem label="Zone" value={history[0].zone?.name || "Unknown"} />
            <LocItem label="Position" value={history[0].storageLocation?.name || "N/A"} />
            <LocItem label="Observed" value={new Date(history[0].observedAt).toLocaleDateString()} />
          </div>
        </div>
      )}

      {/* Location History Timeline */}
      <div style={{ marginBottom: "var(--sm-space-8)" }}>
        <h2 style={{ fontSize: "var(--sm-text-base)", fontWeight: 600, marginBottom: "var(--sm-space-6)" }}>
          Location History
        </h2>
        <div style={timelineContainer}>
          {history.map((entry, i) => (
            <TimelineItem key={entry.id} entry={entry} isCurrent={i === 0} />
          ))}
          {history.length === 0 && (
            <p style={muted}>No location history recorded.</p>
          )}
        </div>
      </div>

      {/* Identity Links */}
      {item.identityLinks && item.identityLinks.length > 0 && (
        <div style={{ marginBottom: "var(--sm-space-8)" }}>
          <h2 style={{ fontSize: "var(--sm-text-base)", fontWeight: 600, marginBottom: "var(--sm-space-4)" }}>
            Identity Links
          </h2>
          {item.identityLinks.map((link) => (
            <div key={link.id} style={linkRow}>
              <div>
                <div style={{ fontSize: "var(--sm-text-sm)", fontWeight: 600 }}>
                  {link.observation?.label || link.observationId}
                </div>
                <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-secondary)" }}>
                  Confidence: {link.matchConfidence != null ? `${Math.round(link.matchConfidence * 100)}%` : "N/A"}
                </div>
              </div>
              {link.matchConfidence != null && link.matchConfidence >= 0.9 && (
                <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: "var(--sm-radius-full)", background: "#dcfce7", color: "var(--sm-success-700)" }}>
                  High match
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Linked Repairs */}
      {item.repairIssues && item.repairIssues.length > 0 && (
        <div style={{ marginBottom: "var(--sm-space-8)" }}>
          <h2 style={{ fontSize: "var(--sm-text-base)", fontWeight: 600, marginBottom: "var(--sm-space-4)" }}>
            Linked Repairs ({item.repairIssues.length})
          </h2>
          {item.repairIssues.map((repair: RepairIssue) => (
            <Link
              key={repair.id}
              to={`/repairs/${repair.id}`}
              style={{ ...linkRow, textDecoration: "none", color: "inherit" }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "var(--sm-text-sm)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {repair.title}
                </div>
                <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-secondary)", marginTop: 2 }}>
                  {new Date(repair.createdAt).toLocaleDateString()}
                  {repair.severity && <> &middot; {repair.severity}</>}
                </div>
              </div>
              <Badge variant={repair.status === "open" ? "status-open" : repair.status === "in_progress" ? "status-monitoring" : "status-resolved"}>
                {repair.status}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      {/* Observation Evidence (keyframes) */}
      {item.identityLinks && item.identityLinks.some((l) => l.observation?.keyframeUrl) && (
        <div style={{ marginBottom: "var(--sm-space-8)" }}>
          <h2 style={{ fontSize: "var(--sm-text-base)", fontWeight: 600, marginBottom: "var(--sm-space-4)" }}>
            Observation Evidence
          </h2>
          <div style={keyframeGrid}>
            {item.identityLinks
              .filter((l) => l.observation?.keyframeUrl)
              .map((link) => (
                <div key={link.id} style={keyframeCard}>
                  <img
                    src={link.observation!.keyframeUrl!}
                    alt={link.observation?.label || "Keyframe"}
                    style={keyframeImg}
                    loading="lazy"
                  />
                  <div style={{ padding: "var(--sm-space-2) var(--sm-space-3)", fontSize: "var(--sm-text-xs)", color: "var(--sm-text-secondary)" }}>
                    {link.observation?.label}
                    {link.matchConfidence != null && (
                      <> &middot; {Math.round(link.matchConfidence * 100)}% match</>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function InfoItem({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--sm-space-1)" }}>
        {label}
      </div>
      <div style={{ fontSize: "var(--sm-text-base)", fontWeight: 500 }}>{value}</div>
      {sub && <div style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)" }}>{sub}</div>}
    </div>
  );
}

function LocItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--sm-space-1)" }}>
        {label}
      </div>
      <div style={{ fontSize: "var(--sm-text-sm)", fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function TimelineItem({ entry, isCurrent }: { entry: LocationHistoryEntry; isCurrent: boolean }) {
  return (
    <div style={{ position: "relative", paddingBottom: "var(--sm-space-6)" }}>
      <div style={{
        position: "absolute", left: -22, top: 4,
        width: 12, height: 12, borderRadius: "50%",
        border: `2px solid ${isCurrent ? "var(--sm-brand-500)" : "var(--sm-neutral-400)"}`,
        background: isCurrent ? "var(--sm-brand-500)" : "var(--sm-surface-card)",
        zIndex: 1,
      }} />
      <div>
        <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)", marginBottom: 2 }}>
          {new Date(entry.observedAt).toLocaleString()}
        </div>
        <div style={{ fontSize: "var(--sm-text-sm)", fontWeight: 500 }}>
          {entry.zone?.name && `Zone ${entry.zone.name}`}
          {entry.storageLocation?.name && ` — ${entry.storageLocation.name}`}
        </div>
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const shell: React.CSSProperties = {
  maxWidth: 960, margin: "0 auto", padding: "0 var(--sm-space-4)", paddingTop: "var(--sm-space-4)",
};

const muted: React.CSSProperties = {
  fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)",
};

const breadcrumb: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "var(--sm-space-2)",
  fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)", marginBottom: "var(--sm-space-6)",
};

const detailHeader: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
  gap: "var(--sm-space-4)", marginBottom: "var(--sm-space-8)", flexWrap: "wrap",
};

const statusBadge = (_status: string): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 4,
  fontSize: 11, fontWeight: 500, padding: "2px 8px",
  borderRadius: "var(--sm-radius-full)", marginBottom: "var(--sm-space-2)",
  background: "#dcfce7", color: "var(--sm-success-700)",
});

const chip: React.CSSProperties = {
  display: "inline-block", fontSize: 11, fontWeight: 500,
  padding: "1px 8px", borderRadius: "var(--sm-radius-full)",
  background: "var(--sm-neutral-100)", color: "var(--sm-text-secondary)",
};

const infoGrid: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sm-space-4)",
  marginBottom: "var(--sm-space-8)", padding: "var(--sm-space-6)",
  border: "1px solid var(--sm-border-default)", borderRadius: "var(--sm-radius-xl)",
  background: "var(--sm-surface-card)",
};

const locationCard: React.CSSProperties = {
  padding: "var(--sm-space-6)", border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-xl)", marginBottom: "var(--sm-space-8)",
  background: "var(--sm-surface-card)",
};

const locationGrid: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--sm-space-4)",
};

const timelineContainer: React.CSSProperties = {
  position: "relative", paddingLeft: "var(--sm-space-6)",
};

const linkRow: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "var(--sm-space-3) var(--sm-space-4)",
  border: "1px solid var(--sm-border-default)", borderRadius: "var(--sm-radius-md)",
  marginBottom: "var(--sm-space-2)",
};

const errorBanner: React.CSSProperties = {
  background: "var(--sm-danger-500)", color: "#fff",
  padding: "var(--sm-space-2) var(--sm-space-4)", borderRadius: "var(--sm-radius-md)",
  display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--sm-text-sm)",
};

const keyframeGrid: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
  gap: "var(--sm-space-4)",
};

const keyframeCard: React.CSSProperties = {
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-lg)", overflow: "hidden",
  background: "var(--sm-surface-card)",
};

const keyframeImg: React.CSSProperties = {
  width: "100%", height: 160, objectFit: "cover",
  display: "block", background: "var(--sm-neutral-100)",
};
