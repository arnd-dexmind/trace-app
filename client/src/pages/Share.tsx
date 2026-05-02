import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Badge } from "../components/ui/Badge";

interface SharedItem {
  label: string;
  confidence: number | null;
  keyframeUrl: string | null;
  zone: string | null;
}

interface SharedRepair {
  label: string;
  confidence: number | null;
  keyframeUrl: string | null;
}

interface SharedWalkthrough {
  walkthroughId: string;
  status: string;
  uploadedAt: string;
  items: SharedItem[];
  repairs: SharedRepair[];
}

export function Share() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedWalkthrough | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`/api/share/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error?.message || "Share link not found or expired");
        }
        return res.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load shared results"))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div style={shell}>
        <div style={{ textAlign: "center", padding: "var(--sm-space-16) 0", color: "var(--sm-text-tertiary)" }}>
          Loading shared results...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={shell}>
        <div style={errorCard}>
          <div style={{ fontSize: 48, marginBottom: "var(--sm-space-4)" }}>&#128274;</div>
          <h1 style={{ fontSize: "var(--sm-text-xl)", fontWeight: 600, margin: "0 0 var(--sm-space-2)" }}>Not Available</h1>
          <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)", margin: 0 }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div style={shell}>
      <div style={hero}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sm-space-3)", marginBottom: "var(--sm-space-2)" }}>
          <h1 style={{ fontSize: "var(--sm-text-2xl)", fontWeight: 700, margin: 0 }}>Walkthrough Results</h1>
          <Badge variant={data.status === "applied" ? "status-resolved" : "status-monitoring"}>
            {data.status}
          </Badge>
        </div>
        <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)", margin: 0 }}>
          Uploaded {new Date(data.uploadedAt).toLocaleDateString()} &middot; {data.items.length} items &middot; {data.repairs.length} repairs
        </p>
      </div>

      {data.items.length > 0 && (
        <section style={sectionStyle}>
          <h2 style={{ fontSize: "var(--sm-text-lg)", fontWeight: 600, margin: "0 0 var(--sm-space-4)" }}>
            Inventory Items ({data.items.length})
          </h2>
          <div style={grid}>
            {data.items.map((item, i) => (
              <div key={i} style={card}>
                {item.keyframeUrl && (
                  <img
                    src={item.keyframeUrl}
                    alt={item.label}
                    style={thumbnail}
                    loading="lazy"
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "var(--sm-text-sm)", fontWeight: 500, marginBottom: 2 }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)" }}>
                    {item.zone ?? "Unknown zone"}
                    {item.confidence != null && ` · ${Math.round(item.confidence * 100)}% confidence`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.repairs.length > 0 && (
        <section style={sectionStyle}>
          <h2 style={{ fontSize: "var(--sm-text-lg)", fontWeight: 600, margin: "0 0 var(--sm-space-4)" }}>
            Repairs Found ({data.repairs.length})
          </h2>
          <div style={grid}>
            {data.repairs.map((repair, i) => (
              <div key={i} style={card}>
                {repair.keyframeUrl && (
                  <img
                    src={repair.keyframeUrl}
                    alt={repair.label}
                    style={thumbnail}
                    loading="lazy"
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "var(--sm-text-sm)", fontWeight: 500, marginBottom: 2 }}>
                    {repair.label}
                  </div>
                  <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)" }}>
                    {repair.confidence != null && `${Math.round(repair.confidence * 100)}% confidence`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div style={{ textAlign: "center", marginTop: "var(--sm-space-8)", paddingTop: "var(--sm-space-6)", borderTop: "1px solid var(--sm-border-default)" }}>
        <p style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)", margin: 0 }}>
          Shared via PerifEye
        </p>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const shell: React.CSSProperties = {
  maxWidth: 800,
  margin: "0 auto",
  padding: "var(--sm-space-4)",
  paddingTop: "var(--sm-space-6)",
  paddingBottom: "var(--sm-space-8)",
};

const hero: React.CSSProperties = {
  marginBottom: "var(--sm-space-6)",
};

const errorCard: React.CSSProperties = {
  textAlign: "center",
  padding: "var(--sm-space-16) var(--sm-space-4)",
};

const sectionStyle: React.CSSProperties = {
  marginBottom: "var(--sm-space-8)",
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
  gap: "var(--sm-space-3)",
};

const card: React.CSSProperties = {
  display: "flex",
  gap: "var(--sm-space-3)",
  alignItems: "center",
  padding: "var(--sm-space-3)",
  background: "var(--sm-surface-card)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-md)",
};

const thumbnail: React.CSSProperties = {
  width: 64,
  height: 64,
  objectFit: "cover",
  borderRadius: "var(--sm-radius-sm)",
  flexShrink: 0,
};
