import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { getRepair, updateRepairStatus, type RepairIssue, type RepairObservation, getSpaceId } from "../api";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";

const STATUS_TRANSITIONS: Record<string, { next: string | null; label: string; variant: "outline" | "primary" | "success" }> = {
  open: { next: "in_progress", label: "Start Monitoring", variant: "primary" },
  in_progress: { next: "resolved", label: "Mark Resolved", variant: "success" },
  resolved: { next: null, label: "", variant: "outline" },
};

const STATUS_MAP: Record<string, { label: string; variant: "status-open" | "status-monitoring" | "status-resolved" }> = {
  open: { label: "Open", variant: "status-open" },
  in_progress: { label: "Monitoring", variant: "status-monitoring" },
  resolved: { label: "Resolved", variant: "status-resolved" },
};

const SEV_MAP: Record<string, "severity-high" | "severity-medium" | "severity-low"> = {
  high: "severity-high",
  medium: "severity-medium",
  low: "severity-low",
};

export function RepairDetail() {
  const { repairId } = useParams<{ repairId: string }>();
  const spaceId = getSpaceId();
  const navigate = useNavigate();
  const [repair, setRepair] = useState<RepairIssue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const loadRepair = () => {
    if (!spaceId || !repairId) return;
    getRepair(spaceId, repairId)
      .then(setRepair)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load repair"));
  };

  useEffect(loadRepair, [spaceId, repairId]);

  const handleTransition = async () => {
    if (!spaceId || !repairId || !repair) return;
    const transition = STATUS_TRANSITIONS[repair.status];
    if (!transition.next) return;

    setUpdating(true);
    try {
      const updated = await updateRepairStatus(spaceId, repairId, transition.next);
      setRepair(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setUpdating(false);
    }
  };

  if (!spaceId || !repairId) {
    return (
      <div style={shell}>
        <EmptyState icon="&#128295;" title="Missing Data" description="Select a space and repair issue to view details." />
      </div>
    );
  }

  if (error) {
    return (
      <div style={shell}>
        <div style={errorBanner}>
          {error}
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "#fff", fontWeight: 700, cursor: "pointer" }}>x</button>
        </div>
        <div style={{ marginTop: "var(--sm-space-4)" }}>
          <Button variant="outline" onClick={() => navigate("/repairs")}>Back to Repairs</Button>
        </div>
      </div>
    );
  }

  if (!repair) {
    return (
      <div style={shell}>
        <div style={{ textAlign: "center", padding: "var(--sm-space-16)", color: "var(--sm-text-tertiary)" }}>
          Loading...
        </div>
      </div>
    );
  }

  const status = STATUS_MAP[repair.status] || STATUS_MAP.open;
  const transition = STATUS_TRANSITIONS[repair.status];

  return (
    <div style={shell}>
      <nav style={breadcrumb} aria-label="Breadcrumb">
        <Link to="/repairs" style={{ color: "var(--sm-text-link)", textDecoration: "none" }}>Repairs</Link>
        <span style={{ color: "var(--sm-text-tertiary)" }}>&#8250;</span>
        <span>{repair.title}</span>
      </nav>

      <div style={detailHeader}>
        <div>
          <Badge variant={status.variant} dot>{status.label}</Badge>
          <h1 style={{ fontSize: "var(--sm-text-2xl)", fontWeight: 700, marginTop: "var(--sm-space-2)", marginBottom: "var(--sm-space-1)" }}>
            {repair.title}
          </h1>
          {repair.description && (
            <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)", maxWidth: 600 }}>
              {repair.description}
            </p>
          )}
        </div>
        {transition.next && (
          <Button
            variant={transition.variant}
            size="md"
            onClick={handleTransition}
            disabled={updating}
          >
            {updating ? "Updating..." : transition.label}
          </Button>
        )}
      </div>

      <div className="info-grid-stack" style={infoGrid}>
        <InfoItem label="Status" value={status.label} />
        <InfoItem
          label="Severity"
          value={repair.severity ? repair.severity.charAt(0).toUpperCase() + repair.severity.slice(1) : "Not set"}
        >
          {repair.severity && <Badge variant={SEV_MAP[repair.severity] || "severity-low"}>{repair.severity}</Badge>}
        </InfoItem>
        <InfoItem label="Created" value={new Date(repair.createdAt).toLocaleString()} />
        <InfoItem
          label="Resolved"
          value={repair.resolvedAt ? new Date(repair.resolvedAt).toLocaleString() : "Not yet"}
        />
      </div>

      {repair.itemId && (
        <div style={linkedCard}>
          <h2 style={{ fontSize: "var(--sm-text-base)", fontWeight: 600, marginBottom: "var(--sm-space-2)" }}>
            Linked Item
          </h2>
          <Link
            to={`/items/${repair.itemId}`}
            style={{ color: "var(--sm-text-link)", fontSize: "var(--sm-text-sm)", textDecoration: "none" }}
          >
            {repair.item?.name || repair.itemId.slice(0, 12)} &rarr;
          </Link>
        </div>
      )}

      {repair.repairObservations && repair.repairObservations.length > 0 && (
        <div style={linkedCard}>
          <h2 style={{ fontSize: "var(--sm-text-base)", fontWeight: 600, marginBottom: "var(--sm-space-4)" }}>
            Walkthrough Evidence
          </h2>
          {repair.repairObservations.map((obs) => (
            <div key={obs.id} style={obsRow}>
              <div>
                <div style={{ fontSize: "var(--sm-text-sm)", fontWeight: 600 }}>{obs.label}</div>
                <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-secondary)" }}>
                  {obs.confidence != null && `Confidence: ${Math.round(obs.confidence * 100)}%`}
                  {obs.keyframeUrl && <span> &middot; Has keyframe</span>}
                </div>
              </div>
              <Badge variant="neutral">{obs.status}</Badge>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: "var(--sm-space-6)" }}>
        <Button variant="outline" onClick={() => navigate("/repairs")}>&larr; Back to Repairs</Button>
      </div>
    </div>
  );
}

function InfoItem({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--sm-space-1)" }}>
        {label}
      </div>
      <div style={{ fontSize: "var(--sm-text-base)", fontWeight: 500 }}>{value}</div>
      {children && <div style={{ marginTop: "var(--sm-space-1)" }}>{children}</div>}
    </div>
  );
}

const shell: React.CSSProperties = {
  maxWidth: 960, margin: "0 auto", padding: "0 var(--sm-space-4)", paddingTop: "var(--sm-space-4)",
};

const breadcrumb: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: "var(--sm-space-2)",
  fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)", marginBottom: "var(--sm-space-6)",
};

const detailHeader: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
  gap: "var(--sm-space-4)", marginBottom: "var(--sm-space-8)", flexWrap: "wrap",
};

const infoGrid: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--sm-space-4)",
  marginBottom: "var(--sm-space-8)", padding: "var(--sm-space-6)",
  border: "1px solid var(--sm-border-default)", borderRadius: "var(--sm-radius-xl)",
  background: "var(--sm-surface-card)",
};

const linkedCard: React.CSSProperties = {
  padding: "var(--sm-space-6)", border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-xl)", marginBottom: "var(--sm-space-4)",
  background: "var(--sm-surface-card)",
};

const obsRow: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "var(--sm-space-3) var(--sm-space-4)",
  border: "1px solid var(--sm-border-default)", borderRadius: "var(--sm-radius-md)",
  marginBottom: "var(--sm-space-2)",
};

const errorBanner: React.CSSProperties = {
  background: "var(--sm-danger-500)", color: "#fff",
  padding: "var(--sm-space-2) var(--sm-space-4)", borderRadius: "var(--sm-radius-md)",
  display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--sm-text-sm)",
  marginTop: "var(--sm-space-6)",
};
