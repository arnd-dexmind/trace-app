import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  listSpaces,
  createSpace,
  updateSpace,
  deleteSpace,
  type Space,
  setSpaceId,
  getSpaceId,
} from "../api";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";

export function Spaces() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const selectedSpaceId = getSpaceId();

  // Form state
  const [showCreate, setShowCreate] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");

  const fetchSpaces = () => {
    setLoading(true);
    setError(null);
    listSpaces()
      .then(setSpaces)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load spaces"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSpaces();
  }, []);

  const resetForm = () => {
    setFormName("");
    setFormDesc("");
    setShowCreate(false);
    setEditingId(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    try {
      await createSpace({ name: formName.trim(), description: formDesc || undefined });
      resetForm();
      fetchSpaces();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create space");
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !formName.trim()) return;
    try {
      await updateSpace(editingId, { name: formName.trim(), description: formDesc || undefined });
      resetForm();
      fetchSpaces();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update space");
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteSpace(deletingId);
      setDeletingId(null);
      if (selectedSpaceId === deletingId) {
        setSpaceId("");
      }
      fetchSpaces();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete space");
    }
  };

  const startEdit = (s: Space) => {
    setEditingId(s.id);
    setFormName(s.name);
    setFormDesc(s.description || "");
    setShowCreate(false);
  };

  const startCreate = () => {
    setShowCreate(true);
    setEditingId(null);
    setFormName("");
    setFormDesc("");
  };

  const isSubmitting = editingId !== null || showCreate;

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
        <div>
          <h1 style={{ fontSize: "var(--sm-text-2xl)", fontWeight: 700, margin: 0 }}>Spaces</h1>
          <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)", margin: "4px 0 0" }}>
            Manage your spaces
          </p>
        </div>
        {!isSubmitting && (
          <Button variant="primary" size="md" onClick={startCreate}>+ New Space</Button>
        )}
      </div>

      {/* Create / Edit form */}
      {isSubmitting && (
        <form onSubmit={editingId ? handleUpdate : handleCreate} style={formCard}>
          <h2 style={{ fontSize: "var(--sm-text-base)", fontWeight: 600, margin: 0 }}>
            {editingId ? "Edit Space" : "New Space"}
          </h2>
          <div style={formFields}>
            <div style={fieldGroup}>
              <label style={fieldLabel} htmlFor="space-name">Name</label>
              <input
                id="space-name"
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                style={textInput}
                placeholder="e.g. Warehouse A"
                autoFocus
                required
              />
            </div>
            <div style={fieldGroup}>
              <label style={fieldLabel} htmlFor="space-desc">Description</label>
              <input
                id="space-desc"
                type="text"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                style={textInput}
                placeholder="Brief description (optional)"
              />
            </div>
          </div>
          <div style={formActions}>
            <Button type="submit" variant="primary" size="sm">
              {editingId ? "Save Changes" : "Create Space"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Delete confirmation */}
      {deletingId && (
        <div style={modalBackdrop} onClick={() => setDeletingId(null)}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: "var(--sm-text-base)", fontWeight: 600, margin: 0 }}>Delete Space</h3>
            <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)", margin: "8px 0 0" }}>
              This permanently deletes the space and all associated data (walkthroughs, items, repairs, zones). This action cannot be undone.
            </p>
            <div style={{ display: "flex", gap: "var(--sm-space-3)", marginTop: "var(--sm-space-5)", justifyContent: "flex-end" }}>
              <Button variant="ghost" size="sm" onClick={() => setDeletingId(null)}>Cancel</Button>
              <Button variant="danger" size="sm" onClick={handleDelete}>Delete</Button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "var(--sm-space-16) 0", color: "var(--sm-text-tertiary)" }}>
          Loading spaces...
        </div>
      ) : spaces.length === 0 && !isSubmitting ? (
        <EmptyState
          icon="&#127968;"
          title="No Spaces Yet"
          description="Create your first space to start tracking inventory and repairs."
          action={<Button variant="primary" size="md" onClick={startCreate}>+ New Space</Button>}
        />
      ) : (
        <div style={spaceGrid}>
          {spaces.map((s) => (
            <div key={s.id} style={spaceCard}>
              <div style={cardBody}>
                <Link to={`/?space=${s.id}`} style={spaceLink} onClick={() => setSpaceId(s.id)}>
                  <h3 style={{ fontSize: "var(--sm-text-base)", fontWeight: 600, margin: 0, color: "var(--sm-text-primary)" }}>
                    {s.name}
                  </h3>
                </Link>
                {s.description && (
                  <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)", margin: "4px 0 0" }}>
                    {s.description}
                  </p>
                )}
                <div style={countsRow}>
                  <span style={countChip}>
                    {s.itemCount ?? "—"} items
                  </span>
                  <span style={countChip}>
                    {s.zoneCount ?? "—"} zones
                  </span>
                  <span style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)" }}>
                    Created {new Date(s.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div style={cardActions}>
                <Link to={`/?space=${s.id}`} onClick={() => setSpaceId(s.id)}>
                  <Button variant="outline" size="sm">Dashboard</Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={() => startEdit(s)}>Edit</Button>
                <Button variant="ghost" size="sm" onClick={() => setDeletingId(s.id)}>Delete</Button>
              </div>
            </div>
          ))}
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
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "var(--sm-space-4)",
  marginBottom: "var(--sm-space-6)",
};

const formCard: React.CSSProperties = {
  padding: "var(--sm-space-5)",
  background: "var(--sm-surface-card)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-lg)",
  marginBottom: "var(--sm-space-6)",
};

const formFields: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--sm-space-3)",
  marginTop: "var(--sm-space-4)",
};

const fieldGroup: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--sm-space-1)",
};

const fieldLabel: React.CSSProperties = {
  fontSize: "var(--sm-text-sm)",
  fontWeight: 500,
  color: "var(--sm-text-secondary)",
};

const textInput: React.CSSProperties = {
  font: "inherit",
  fontSize: "var(--sm-text-sm)",
  padding: "var(--sm-space-2) var(--sm-space-3)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-md)",
  background: "var(--sm-surface-card)",
  color: "var(--sm-text-primary)",
};

const formActions: React.CSSProperties = {
  display: "flex",
  gap: "var(--sm-space-3)",
  marginTop: "var(--sm-space-4)",
};

const spaceGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
  gap: "var(--sm-space-4)",
};

const spaceCard: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  padding: "var(--sm-space-5)",
  background: "var(--sm-surface-card)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-lg)",
};

const cardBody: React.CSSProperties = {
  flex: 1,
};

const spaceLink: React.CSSProperties = {
  textDecoration: "none",
};

const countsRow: React.CSSProperties = {
  display: "flex",
  gap: "var(--sm-space-3)",
  alignItems: "center",
  marginTop: "var(--sm-space-3)",
  flexWrap: "wrap",
};

const countChip: React.CSSProperties = {
  fontSize: "var(--sm-text-xs)",
  fontWeight: 500,
  color: "var(--sm-brand-700)",
  background: "var(--sm-brand-100)",
  padding: "2px var(--sm-space-2)",
  borderRadius: "var(--sm-radius-sm)",
};

const cardActions: React.CSSProperties = {
  display: "flex",
  gap: "var(--sm-space-2)",
  marginTop: "var(--sm-space-4)",
  paddingTop: "var(--sm-space-3)",
  borderTop: "1px solid var(--sm-border-subtle)",
};

const modalBackdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};

const modalCard: React.CSSProperties = {
  background: "var(--sm-surface-card)",
  borderRadius: "var(--sm-radius-lg)",
  padding: "var(--sm-space-6)",
  maxWidth: 420,
  width: "100%",
  margin: "var(--sm-space-4)",
  border: "1px solid var(--sm-border-default)",
  boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
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
