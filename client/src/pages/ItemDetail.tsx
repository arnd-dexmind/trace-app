import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import {
  getItem,
  getItemWalkthroughs,
  type InventoryItem,
  type LocationHistoryEntry,
  type RepairIssue,
  type ItemWalkthroughGroup,
  getSpaceId,
} from "../api";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { ExportButton } from "../components/ExportButton";
import { Lightbox } from "../components/ui/Lightbox";
import { LoadingSkeleton } from "../components/ui/LoadingSkeleton";

export function ItemDetail() {
  const { itemId } = useParams<{ itemId: string }>();
  const spaceId = getSpaceId();
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [walkthroughs, setWalkthroughs] = useState<ItemWalkthroughGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!spaceId || !itemId) return;
    setItem(null);
    setWalkthroughs(null);
    setError(null);
    Promise.all([
      getItem(spaceId, itemId),
      getItemWalkthroughs(spaceId, itemId),
    ])
      .then(([i, w]) => {
        setItem(i);
        setWalkthroughs(w);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load item"));
  }, [spaceId, itemId]);

  // ── Loading state ─────────────────────────────────────────────────
  if (!spaceId || !itemId) {
    return (
      <div style={shell}>
        <LoadingSkeleton
          blocks={[
            { width: 200, height: 14 },
            { height: 32 },
            { height: 16, width: "60%" },
            { height: 120 },
            { height: 100 },
            { height: 80 },
          ]}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div style={shell}>
        <div style={errorBanner}>
          {error}
          <button onClick={() => setError(null)} style={dismissBtn}>x</button>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div style={shell}>
        <LoadingSkeleton
          blocks={[
            { width: 200, height: 14 },
            { height: 32 },
            { height: 16, width: "60%" },
            { height: 120 },
            { height: 100 },
            { height: 80 },
          ]}
        />
      </div>
    );
  }

  const history = item.locationHistory || [];
  const aliases = item.aliases || [];
  const repairIssues = item.repairIssues || [];
  const identityLinks = item.identityLinks || [];

  // Collect all photos for the lightbox gallery
  const photoGallery = useMemo(() => {
    const photos: { url: string; alt: string }[] = [];
    for (const link of identityLinks) {
      if (link.observation?.keyframeUrl) {
        photos.push({
          url: link.observation.keyframeUrl,
          alt: link.observation.label || "Observation keyframe",
        });
      }
    }
    if (walkthroughs) {
      for (const wt of walkthroughs) {
        for (const app of wt.appearances) {
          if (app.keyframeUrl && !photos.some((p) => p.url === app.keyframeUrl)) {
            photos.push({
              url: app.keyframeUrl,
              alt: `${app.label} — ${wt.walkthrough.name || wt.walkthrough.id.slice(0, 8)}`,
            });
          }
        }
      }
    }
    return photos;
  }, [identityLinks, walkthroughs]);

  return (
    <div style={shell}>
      {/* Breadcrumb */}
      <nav style={breadcrumb} aria-label="Breadcrumb">
        <Link to="/items" style={breadcrumbLink}>Items</Link>
        <span style={{ color: "var(--sm-text-tertiary)" }}>&#8250;</span>
        <span>{item.name}</span>
      </nav>

      {/* Header */}
      <div style={detailHeader}>
        <div>
          <span style={statusBadge}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--sm-success-500)", display: "inline-block" }} />{" "}
            In place
          </span>
          <h1 style={itemName}>{item.name}</h1>
          <p style={subtitle}>
            ID: {item.id.slice(0, 12)}...
            {item.category && (
              <>
                <span style={{ margin: "0 8px" }}>&middot;</span>
                <span style={chip}>{item.category}</span>
              </>
            )}
          </p>
        </div>
        <ExportButton type="inventory" />
      </div>

      {/* Tags */}
      {aliases.length > 0 && (
        <div style={tagsRow}>
          {aliases.map((a) => (
            <span key={a.id} style={tagChip}>
              {a.alias}
              {a.source === "system" && <span style={tagSource}>auto</span>}
            </span>
          ))}
        </div>
      )}

      {/* Notes */}
      {item.description && (
        <div style={notesCard}>
          <div style={notesLabel}>Notes</div>
          <div style={notesText}>{item.description}</div>
        </div>
      )}

      {/* Info Grid */}
      <div className="info-grid-stack" style={infoGrid}>
        <InfoItem label="Category" value={item.category || "Uncategorized"} />
        <InfoItem
          label="Status"
          value="Active"
          sub={history.length > 0 ? `Tracked since ${new Date(history[history.length - 1].observedAt).toLocaleDateString()}` : "No history"}
        />
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
          <h2 style={sectionHeading}>
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
        <h2 style={sectionHeading}>Location History</h2>
        <div style={timelineContainer}>
          {history.map((entry, i) => (
            <TimelineItem key={entry.id} entry={entry} isCurrent={i === 0} />
          ))}
          {history.length === 0 && (
            <p style={muted}>No location history recorded.</p>
          )}
        </div>
      </div>

      {/* Walkthrough Appearances */}
      {walkthroughs && walkthroughs.length > 0 && (
        <div style={{ marginBottom: "var(--sm-space-8)" }}>
          <h2 style={sectionHeading}>
            Walkthrough Appearances ({walkthroughs.length})
          </h2>
          {walkthroughs.map((wt) => (
            <div key={wt.walkthrough.id} style={wtCard}>
              <div style={wtHeader}>
                <div>
                  <Link
                    to={`/results/${wt.walkthrough.id}`}
                    style={{ fontSize: "var(--sm-text-sm)", fontWeight: 600, color: "var(--sm-text-link)", textDecoration: "none" }}
                  >
                    {wt.walkthrough.name || `Walkthrough ${wt.walkthrough.id.slice(0, 8)}`}
                  </Link>
                  <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-secondary)", marginTop: 2 }}>
                    {new Date(wt.walkthrough.uploadedAt).toLocaleDateString()}
                    {" "}&middot;{" "}
                    {wt.walkthrough.status}
                  </div>
                </div>
                <Badge variant={wt.walkthrough.status === "applied" ? "status-resolved" : wt.walkthrough.status === "processing" ? "status-monitoring" : "status-open"}>
                  {wt.walkthrough.status}
                </Badge>
              </div>
              <div style={appearanceList}>
                {wt.appearances.map((app) => (
                  <div key={app.id} style={appearanceRow}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "var(--sm-text-xs)", fontWeight: 500 }}>{app.label}</div>
                      <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-secondary)" }}>
                        {[app.zoneName, app.storageLocationName].filter(Boolean).join(" — ") || "Location unknown"}
                        {app.confidence != null && <> &middot; {Math.round(app.confidence * 100)}% confidence</>}
                      </div>
                    </div>
                    {app.confidence != null && (
                      <Badge
                        variant={app.confidence >= 0.9 ? "confidence-high" : app.confidence >= 0.7 ? "confidence-medium" : "confidence-low"}
                      >
                        {Math.round(app.confidence * 100)}%
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Photo Gallery */}
      {photoGallery.length > 0 && (
        <div style={{ marginBottom: "var(--sm-space-8)" }}>
          <h2 style={sectionHeading}>
            Photo Gallery ({photoGallery.length})
          </h2>
          <div style={photoGrid}>
            {photoGallery.map((photo, i) => (
              <button
                key={i}
                onClick={() => setLightboxIdx(i)}
                style={photoCard}
                aria-label={`View ${photo.alt}`}
              >
                <img
                  src={photo.url}
                  alt={photo.alt}
                  style={photoImg}
                  loading="lazy"
                />
                <div style={photoLabel}>{photo.alt}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxIdx !== null && photoGallery.length > 0 && (
        <Lightbox
          images={photoGallery}
          currentIndex={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onPrev={() => setLightboxIdx((i) => (i !== null && i > 0 ? i - 1 : i))}
          onNext={() => setLightboxIdx((i) => (i !== null && i < photoGallery.length - 1 ? i + 1 : i))}
        />
      )}

      {/* Linked Repairs */}
      {repairIssues.length > 0 && (
        <div style={{ marginBottom: "var(--sm-space-8)" }}>
          <h2 style={sectionHeading}>
            Repair History ({repairIssues.length})
          </h2>
          <div style={timelineContainer}>
            {repairIssues.map((repair: RepairIssue) => (
              <TimelineRepairItem key={repair.id} repair={repair} />
            ))}
          </div>
        </div>
      )}

      {/* Identity Links */}
      {identityLinks.length > 0 && (
        <div style={{ marginBottom: "var(--sm-space-8)" }}>
          <h2 style={sectionHeading}>Identity Links</h2>
          {identityLinks.map((link) => (
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
                <span style={highMatchChip}>High match</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state when no data at all */}
      {history.length === 0 && repairIssues.length === 0 && identityLinks.length === 0 && (!walkthroughs || walkthroughs.length === 0) && (
        <EmptyState
          icon="&#128230;"
          title="No activity yet"
          description="This item hasn't been observed in any walkthroughs or linked to any repairs."
        />
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function InfoItem({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div style={infoLabel}>{label}</div>
      <div style={infoValue}>{value}</div>
      {sub && <div style={infoSub}>{sub}</div>}
    </div>
  );
}

function LocItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={infoLabel}>{label}</div>
      <div style={{ fontSize: "var(--sm-text-sm)", fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function TimelineItem({ entry, isCurrent }: { entry: LocationHistoryEntry; isCurrent: boolean }) {
  return (
    <div style={{ position: "relative", paddingBottom: "var(--sm-space-6)" }}>
      <div style={timelineDot(isCurrent)} />
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

function TimelineRepairItem({ repair }: { repair: RepairIssue }) {
  const severityVariant =
    repair.severity === "high" ? "severity-high" :
    repair.severity === "medium" ? "severity-medium" :
    "severity-low";

  return (
    <div style={{ position: "relative", paddingBottom: "var(--sm-space-6)" }}>
      <div style={{
        position: "absolute", left: -22, top: 4,
        width: 12, height: 12, borderRadius: "50%",
        border: `2px solid ${repair.status === "resolved" ? "var(--sm-success-500)" : repair.status === "in_progress" ? "var(--sm-warning-400)" : "var(--sm-danger-500)"}`,
        background: repair.status === "resolved" ? "var(--sm-success-500)" : repair.status === "in_progress" ? "var(--sm-warning-400)" : "var(--sm-danger-500)",
        zIndex: 1,
      }} />
      <Link
        to={`/repairs/${repair.id}`}
        style={{ textDecoration: "none", color: "inherit", display: "block" }}
      >
        <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)", marginBottom: 2 }}>
          {new Date(repair.createdAt).toLocaleDateString()}
          {repair.severity && <> &middot; {repair.severity}</>}
        </div>
        <div style={{ fontSize: "var(--sm-text-sm)", fontWeight: 500, display: "flex", alignItems: "center", gap: "var(--sm-space-2)" }}>
          {repair.title}
          <Badge variant={repair.status === "open" ? "status-open" : repair.status === "in_progress" ? "status-monitoring" : "status-resolved"}>
            {repair.status}
          </Badge>
          {repair.severity && (
            <Badge variant={severityVariant}>{repair.severity}</Badge>
          )}
        </div>
      </Link>
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

const breadcrumbLink: React.CSSProperties = {
  color: "var(--sm-text-link)", textDecoration: "none",
};

const detailHeader: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
  gap: "var(--sm-space-4)", marginBottom: "var(--sm-space-4)", flexWrap: "wrap",
};

const itemName: React.CSSProperties = {
  fontSize: "var(--sm-text-2xl)", fontWeight: 700, marginBottom: "var(--sm-space-1)",
};

const subtitle: React.CSSProperties = {
  fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)",
};

const statusBadge: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4,
  fontSize: 11, fontWeight: 500, padding: "2px 8px",
  borderRadius: "var(--sm-radius-full)", marginBottom: "var(--sm-space-2)",
  background: "#dcfce7", color: "var(--sm-success-700)",
};

const chip: React.CSSProperties = {
  display: "inline-block", fontSize: 11, fontWeight: 500,
  padding: "1px 8px", borderRadius: "var(--sm-radius-full)",
  background: "var(--sm-neutral-100)", color: "var(--sm-text-secondary)",
};

const tagsRow: React.CSSProperties = {
  display: "flex", flexWrap: "wrap", gap: "var(--sm-space-2)", marginBottom: "var(--sm-space-4)",
};

const tagChip: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4,
  fontSize: 11, fontWeight: 500, padding: "2px 10px",
  borderRadius: "var(--sm-radius-full)",
  background: "var(--sm-brand-100)", color: "var(--sm-brand-700)",
};

const tagSource: React.CSSProperties = {
  fontSize: 9, opacity: 0.7, fontStyle: "italic",
};

const notesCard: React.CSSProperties = {
  padding: "var(--sm-space-4) var(--sm-space-6)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-lg)", marginBottom: "var(--sm-space-6)",
  background: "var(--sm-surface-card)",
};

const notesLabel: React.CSSProperties = {
  fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)",
  textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--sm-space-1)",
};

const notesText: React.CSSProperties = {
  fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)", lineHeight: 1.5,
};

const sectionHeading: React.CSSProperties = {
  fontSize: "var(--sm-text-base)", fontWeight: 600, marginBottom: "var(--sm-space-4)",
  display: "flex", alignItems: "center", gap: "var(--sm-space-2)",
};

const infoGrid: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sm-space-4)",
  marginBottom: "var(--sm-space-8)", padding: "var(--sm-space-6)",
  border: "1px solid var(--sm-border-default)", borderRadius: "var(--sm-radius-xl)",
  background: "var(--sm-surface-card)",
};

const infoLabel: React.CSSProperties = {
  fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)",
  textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--sm-space-1)",
};

const infoValue: React.CSSProperties = {
  fontSize: "var(--sm-text-base)", fontWeight: 500,
};

const infoSub: React.CSSProperties = {
  fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)",
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

const timelineDot = (isCurrent: boolean): React.CSSProperties => ({
  position: "absolute", left: -22, top: 4,
  width: 12, height: 12, borderRadius: "50%",
  border: `2px solid ${isCurrent ? "var(--sm-brand-500)" : "var(--sm-neutral-400)"}`,
  background: isCurrent ? "var(--sm-brand-500)" : "var(--sm-surface-card)",
  zIndex: 1,
});

const linkRow: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "var(--sm-space-3) var(--sm-space-4)",
  border: "1px solid var(--sm-border-default)", borderRadius: "var(--sm-radius-md)",
  marginBottom: "var(--sm-space-2)",
};

const highMatchChip: React.CSSProperties = {
  fontSize: 11, fontWeight: 500, padding: "2px 8px",
  borderRadius: "var(--sm-radius-full)", background: "#dcfce7", color: "var(--sm-success-700)",
};

const errorBanner: React.CSSProperties = {
  background: "var(--sm-danger-500)", color: "#fff",
  padding: "var(--sm-space-2) var(--sm-space-4)", borderRadius: "var(--sm-radius-md)",
  display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--sm-text-sm)",
};

const dismissBtn: React.CSSProperties = {
  background: "none", border: "none", color: "#fff", fontWeight: 700, cursor: "pointer",
};

const wtCard: React.CSSProperties = {
  padding: "var(--sm-space-4)", border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-lg)", marginBottom: "var(--sm-space-3)",
  background: "var(--sm-surface-card)",
};

const wtHeader: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
  marginBottom: "var(--sm-space-3)", paddingBottom: "var(--sm-space-3)",
  borderBottom: "1px solid var(--sm-border-default)",
};

const appearanceList: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: "var(--sm-space-2)",
};

const appearanceRow: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "var(--sm-space-2) 0",
};

const photoGrid: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
  gap: "var(--sm-space-3)",
};

const photoCard: React.CSSProperties = {
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-lg)", overflow: "hidden",
  background: "var(--sm-surface-card)",
  cursor: "pointer",
  padding: 0,
  textAlign: "left",
  font: "inherit",
  color: "inherit",
};

const photoImg: React.CSSProperties = {
  width: "100%", height: 140, objectFit: "cover",
  display: "block", background: "var(--sm-neutral-100)",
};

const photoLabel: React.CSSProperties = {
  padding: "var(--sm-space-2) var(--sm-space-3)",
  fontSize: "var(--sm-text-xs)", color: "var(--sm-text-secondary)",
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};
