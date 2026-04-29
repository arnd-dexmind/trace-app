import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getItem, InventoryItem, getSpaceId } from "../api";

export function ItemDetail() {
  const { itemId } = useParams<{ itemId: string }>();
  const spaceId = getSpaceId();
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!spaceId || !itemId) return;
    setLoading(true);
    getItem(spaceId, itemId)
      .then(setItem)
      .catch(() => setError("Failed to load item"))
      .finally(() => setLoading(false));
  }, [spaceId, itemId]);

  if (!spaceId || !itemId) return <p style={muted}>Missing space or item ID.</p>;
  if (loading) return <p style={muted}>Loading...</p>;
  if (error) return <p style={{ color: "var(--sm-semantic-error)", padding: "var(--sm-space-6)" }}>{error}</p>;
  if (!item) return <p style={muted}>Item not found.</p>;

  return (
    <div style={container}>
      <Link to="/items" style={{ color: "var(--sm-brand-600)", textDecoration: "none" }}>&larr; Back to inventory</Link>
      <h2>{item.name}</h2>
      {item.category && <p style={muted}>Category: {item.category}</p>}
      {item.description && <p>{item.description}</p>}
      <p style={muted}>Quantity: {item.quantity}</p>

      <section style={{ marginTop: "var(--sm-space-6)" }}>
        <h3>Location History</h3>
        {(!item.locationHistory || item.locationHistory.length === 0) && <p style={muted}>No location history recorded.</p>}
        {item.locationHistory?.map((entry) => (
          <div key={entry.id} style={card}>
            <p style={{ fontWeight: 600 }}>{entry.zone?.name || "Unknown zone"}{entry.storageLocation?.name && ` / ${entry.storageLocation.name}`}</p>
            <p style={muted}>{new Date(entry.observedAt).toLocaleString()}</p>
          </div>
        ))}
      </section>

      {item.identityLinks && item.identityLinks.length > 0 && (
        <section style={{ marginTop: "var(--sm-space-6)" }}>
          <h3>Identity Links</h3>
          {item.identityLinks.map((link) => (
            <div key={link.id} style={card}>
              <p style={muted}>Observation: {link.observation?.label || link.observationId}</p>
              {link.matchConfidence != null && <p style={muted}>Confidence: {(link.matchConfidence * 100).toFixed(0)}%</p>}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

const container: React.CSSProperties = { maxWidth: 720, margin: "0 auto", padding: "var(--sm-space-6)" };
const muted: React.CSSProperties = { color: "var(--sm-text-muted)", fontSize: "var(--sm-text-sm)" };
const card: React.CSSProperties = { background: "var(--sm-surface-card)", border: "1px solid var(--sm-border-default)", borderRadius: "var(--sm-radius-lg)", padding: "var(--sm-space-3)", marginBottom: "var(--sm-space-2)" };
