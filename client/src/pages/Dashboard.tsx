import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  searchItems,
  listRepairs,
  listWalkthroughs,
  type InventoryItem,
  type RepairIssue,
  type Walkthrough,
  getSpaceId,
} from "../api";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";

const WALKTHROUGH_STATUS: Record<string, { label: string; variant: "status-open" | "status-monitoring" | "status-resolved" }> = {
  uploaded: { label: "Uploaded", variant: "status-monitoring" },
  processing: { label: "Processing", variant: "status-monitoring" },
  awaiting_review: { label: "Awaiting Review", variant: "status-open" },
  applied: { label: "Applied", variant: "status-resolved" },
};

export function Dashboard() {
  const spaceId = getSpaceId();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [repairs, setRepairs] = useState<RepairIssue[]>([]);
  const [walkthroughs, setWalkthroughs] = useState<Walkthrough[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!spaceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([
      searchItems(spaceId),
      listRepairs(spaceId),
      listWalkthroughs(spaceId),
    ])
      .then(([itemsRes, repairsRes, walkthroughsRes]) => {
        setItems(itemsRes);
        setRepairs(repairsRes);
        setWalkthroughs(walkthroughsRes);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load dashboard data"))
      .finally(() => setLoading(false));
  }, [spaceId]);

  if (!spaceId) {
    return (
      <div style={shell}>
        <EmptyState
          icon="&#127968;"
          title="No Space Selected"
          description="Select a space from the top navigation to view your dashboard."
        />
      </div>
    );
  }

  const openRepairs = repairs.filter((r) => r.status !== "resolved").length;
  const recentWalkthroughs = walkthroughs.slice(0, 5);
  const hasData = items.length > 0 || repairs.length > 0 || walkthroughs.length > 0;

  const summaryCards = [
    { label: "Inventory Items", value: items.length, href: "/items", icon: "&#128230;" },
    { label: "Open Repairs", value: openRepairs, href: "/repairs", icon: "&#128295;" },
    { label: "Walkthroughs", value: walkthroughs.length, href: "/upload", icon: "&#128249;" },
  ];

  return (
    <div style={shell}>
      {error && (
        <div style={errorBanner}>
          {error}
          <button
            onClick={() => setError(null)}
            style={{ background: "none", border: "none", color: "#fff", fontWeight: 700, cursor: "pointer" }}
          >
            x
          </button>
        </div>
      )}

      <div style={hero}>
        <h1 style={{ fontSize: "var(--sm-text-2xl)", fontWeight: 700, margin: 0 }}>Dashboard</h1>
        <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)", margin: 0 }}>
          At-a-glance view of your space
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "var(--sm-space-16) 0", color: "var(--sm-text-tertiary)" }}>
          Loading dashboard...
        </div>
      ) : hasData ? (
        <>
          {/* Summary Cards */}
          <div style={cardGrid}>
            {summaryCards.map((card) => (
              <Link key={card.label} to={card.href} style={summaryCard}>
                <span style={{ fontSize: 28, lineHeight: 1 }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: card.icon }} />
                <span style={{ fontSize: "var(--sm-text-2xl)", fontWeight: 700, color: "var(--sm-text-primary)" }}>
                  {card.value}
                </span>
                <span style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)" }}>{card.label}</span>
              </Link>
            ))}
          </div>

          {/* Recent Walkthroughs */}
          <section style={{ marginTop: "var(--sm-space-8)" }}>
            <div style={sectionHeader}>
              <h2 style={{ fontSize: "var(--sm-text-lg)", fontWeight: 600, margin: 0 }}>Recent Walkthroughs</h2>
              <Link to="/upload" style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-link)", textDecoration: "none" }}>
                View all
              </Link>
            </div>

            {recentWalkthroughs.length === 0 ? (
              <div style={emptySlot}>
                <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-tertiary)", margin: 0 }}>
                  No walkthroughs yet. Upload your first walkthrough to get started.
                </p>
              </div>
            ) : (
              <div style={walkthroughList}>
                {recentWalkthroughs.map((w) => {
                  const ws = WALKTHROUGH_STATUS[w.status] || { label: w.status, variant: "neutral" as const };
                  return (
                    <div key={w.id} style={walkthroughRow}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "var(--sm-text-sm)", fontWeight: 500, marginBottom: 2 }}>
                          Walkthrough {w.id.slice(0, 8)}
                        </div>
                        <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)" }}>
                          {new Date(w.uploadedAt).toLocaleDateString()} &middot;{" "}
                          {w.metadata && typeof w.metadata === "object" && "fileCount" in w.metadata
                            ? `${(w.metadata as Record<string, unknown>).fileCount} files`
                            : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "var(--sm-space-2)", alignItems: "center", flexShrink: 0 }}>
                        {w.itemObsCount != null && (
                          <span style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)" }}>
                            {w.itemObsCount} items
                          </span>
                        )}
                        {w.repairObsCount != null && (
                          <span style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)" }}>
                            {w.repairObsCount} repairs
                          </span>
                        )}
                        <Badge variant={ws.variant} dot>{ws.label}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Quick Actions */}
          <section style={{ marginTop: "var(--sm-space-8)" }}>
            <h2 style={{ fontSize: "var(--sm-text-lg)", fontWeight: 600, margin: 0, marginBottom: "var(--sm-space-4)" }}>
              Quick Actions
            </h2>
            <div style={quickActions}>
              <Link to="/upload">
                <Button variant="primary" size="md">+ New Walkthrough</Button>
              </Link>
              <Link to="/items">
                <Button variant="outline" size="md">Search Items</Button>
              </Link>
              <Link to="/repairs">
                <Button variant="outline" size="md">View Repairs</Button>
              </Link>
            </div>
          </section>
        </>
      ) : (
        /* Empty state for spaces with no data */
        <div style={{ marginTop: "var(--sm-space-8)" }}>
          <EmptyState
            icon="&#127881;"
            title="Welcome to PerifEye"
            description="Your space is ready. Follow the steps below to get started."
          />

          <div style={setupSteps}>
            <div style={setupStep}>
              <div style={stepNumber}>1</div>
              <div>
                <div style={{ fontSize: "var(--sm-text-sm)", fontWeight: 600, marginBottom: 2 }}>Upload your first walkthrough</div>
                <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-secondary)" }}>
                  Capture your space with video or photos. The AI will detect items and potential issues.
                </div>
              </div>
            </div>

            <div style={setupStep}>
              <div style={stepNumber}>2</div>
              <div>
                <div style={{ fontSize: "var(--sm-text-sm)", fontWeight: 600, marginBottom: 2 }}>Review observations</div>
                <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-secondary)" }}>
                  Accept or refine detected items and repairs in the review queue.
                </div>
              </div>
            </div>

            <div style={setupStep}>
              <div style={stepNumber}>3</div>
              <div>
                <div style={{ fontSize: "var(--sm-text-sm)", fontWeight: 600, marginBottom: 2 }}>Manage inventory & repairs</div>
                <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-secondary)" }}>
                  Search your item catalog and track repair issues over time.
                </div>
              </div>
            </div>

            <div style={{ textAlign: "center", marginTop: "var(--sm-space-6)" }}>
              <Link to="/upload">
                <Button variant="primary" size="md">+ New Walkthrough</Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const shell: React.CSSProperties = {
  maxWidth: 960,
  margin: "0 auto",
  padding: "0 var(--sm-space-4)",
  paddingTop: "var(--sm-space-6)",
};

const hero: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--sm-space-1)",
  marginBottom: "var(--sm-space-6)",
};

const cardGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "var(--sm-space-4)",
};

const summaryCard: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--sm-space-2)",
  padding: "var(--sm-space-5)",
  background: "var(--sm-surface-card)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-lg)",
  textDecoration: "none",
  transition: "box-shadow var(--sm-transition-fast), border-color var(--sm-transition-fast)",
};

const sectionHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "var(--sm-space-4)",
};

const emptySlot: React.CSSProperties = {
  padding: "var(--sm-space-6)",
  textAlign: "center",
  border: "1px dashed var(--sm-border-default)",
  borderRadius: "var(--sm-radius-lg)",
  background: "var(--sm-neutral-50)",
};

const walkthroughList: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-lg)",
  overflow: "hidden",
};

const walkthroughRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "var(--sm-space-4)",
  padding: "var(--sm-space-3) var(--sm-space-4)",
  borderBottom: "1px solid var(--sm-border-default)",
};

const quickActions: React.CSSProperties = {
  display: "flex",
  gap: "var(--sm-space-3)",
  flexWrap: "wrap",
};

const setupSteps: React.CSSProperties = {
  maxWidth: 480,
  margin: "0 auto",
  marginTop: "var(--sm-space-6)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--sm-space-4)",
};

const setupStep: React.CSSProperties = {
  display: "flex",
  gap: "var(--sm-space-4)",
  alignItems: "flex-start",
};

const stepNumber: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "var(--sm-radius-full)",
  background: "var(--sm-brand-600)",
  color: "var(--sm-text-inverse)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "var(--sm-text-sm)",
  fontWeight: 600,
  flexShrink: 0,
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
