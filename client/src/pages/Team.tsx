import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ErrorBanner } from "../components/ErrorBanner";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";

interface Member {
  id: string;
  userId: string;
  email: string | null;
  name: string | null;
  role: string;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  acceptedAt: string | null;
}

const TENANT_ID = () => localStorage.getItem("trace-tenant-id") || "default";
const HEADERS = () => ({ "Content-Type": "application/json", "x-tenant-id": TENANT_ID() });

export function Team() {
  const [searchParams] = useSearchParams();
  const acceptToken = searchParams.get("token");

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fetchData = () => {
    setError(null);
    Promise.all([
      fetch("/api/team/members", { headers: HEADERS() }).then((r) => r.json()),
      fetch("/api/team/invites", { headers: HEADERS() }).then((r) => r.json()),
    ])
      .then(([m, i]) => {
        setMembers(Array.isArray(m) ? m : []);
        setInvites(Array.isArray(i) ? i : []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load team data"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  // Accept invite flow
  useEffect(() => {
    if (!acceptToken) return;
    fetch(`/api/team/invites/${acceptToken}/accept`, {
      method: "POST",
      headers: HEADERS(),
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error?.message || "Failed to accept invite");
        }
        return r.json();
      })
      .then(() => {
        setToast("Invitation accepted! You now have access to this workspace.");
        fetchData();
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to accept invitation"));
  }, [acceptToken]);

  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setSending(true);
    setError(null);
    fetch("/api/team/invites", {
      method: "POST",
      headers: HEADERS(),
      body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error?.message || "Failed to send invitation");
        }
        return r.json();
      })
      .then(() => {
        setInviteEmail("");
        setToast("Invitation sent!");
        fetchData();
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to send invitation"))
      .finally(() => setSending(false));
  };

  const handleDeleteInvite = (id: string) => {
    fetch(`/api/team/invites/${id}`, { method: "DELETE", headers: HEADERS() })
      .then(() => fetchData())
      .catch(() => setError("Failed to remove invitation"));
  };

  return (
    <div style={shell}>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {toast && (
        <div style={toastBanner}>
          {toast}
          <button onClick={() => setToast(null)} style={{ background: "none", border: "none", color: "#fff", fontWeight: 700, cursor: "pointer" }}>x</button>
        </div>
      )}

      <div style={hero}>
        <h1 style={{ fontSize: "var(--sm-text-2xl)", fontWeight: 700, margin: 0 }}>Team</h1>
        <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)", margin: 0 }}>
          Manage team members and invitations
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "var(--sm-space-16) 0", color: "var(--sm-text-tertiary)" }}>
          Loading team...
        </div>
      ) : (
        <>
          {/* Members */}
          <section style={sectionStyle}>
            <h2 style={{ fontSize: "var(--sm-text-lg)", fontWeight: 600, margin: "0 0 var(--sm-space-4)" }}>
              Members ({members.length})
            </h2>
            {members.length === 0 ? (
              <div style={emptySlot}>No team members yet. Invite someone to collaborate.</div>
            ) : (
              <div style={list}>
                {members.map((m) => (
                  <div key={m.id} style={row}>
                    <div>
                      <div style={{ fontSize: "var(--sm-text-sm)", fontWeight: 500 }}>
                        {m.name || m.email || m.userId.slice(0, 8)}
                      </div>
                      <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)" }}>
                        {m.email}
                      </div>
                    </div>
                    <Badge variant={m.role === "owner" ? "brand" : "neutral"}>{m.role}</Badge>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Pending Invites */}
          {invites.filter((i) => i.status === "pending").length > 0 && (
            <section style={sectionStyle}>
              <h2 style={{ fontSize: "var(--sm-text-lg)", fontWeight: 600, margin: "0 0 var(--sm-space-4)" }}>
                Pending Invitations
              </h2>
              <div style={list}>
                {invites.filter((i) => i.status === "pending").map((inv) => (
                  <div key={inv.id} style={row}>
                    <div>
                      <div style={{ fontSize: "var(--sm-text-sm)", fontWeight: 500 }}>{inv.email}</div>
                      <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)" }}>
                        {inv.role} · Sent {new Date(inv.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteInvite(inv.id)}
                      style={removeBtn}
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Invite Form */}
          <section style={sectionStyle}>
            <h2 style={{ fontSize: "var(--sm-text-lg)", fontWeight: 600, margin: "0 0 var(--sm-space-4)" }}>
              Invite Someone
            </h2>
            <form onSubmit={handleSendInvite} style={inviteForm}>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
                required
                style={inputStyle}
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                style={selectStyle}
              >
                <option value="member">Member</option>
                <option value="owner">Owner</option>
              </select>
              <Button variant="primary" size="md" type="submit" disabled={sending}>
                {sending ? "Sending..." : "Send Invite"}
              </Button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const shell: React.CSSProperties = {
  maxWidth: 640,
  margin: "0 auto",
  padding: "0 var(--sm-space-4)",
  paddingTop: "var(--sm-space-6)",
  paddingBottom: "var(--sm-space-8)",
};

const hero: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--sm-space-1)",
  marginBottom: "var(--sm-space-6)",
};

const sectionStyle: React.CSSProperties = {
  marginBottom: "var(--sm-space-8)",
};

const list: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-lg)",
  overflow: "hidden",
};

const row: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "var(--sm-space-4)",
  padding: "var(--sm-space-3) var(--sm-space-4)",
  borderBottom: "1px solid var(--sm-border-default)",
};

const emptySlot: React.CSSProperties = {
  padding: "var(--sm-space-8)",
  textAlign: "center",
  border: "1px dashed var(--sm-border-default)",
  borderRadius: "var(--sm-radius-lg)",
  color: "var(--sm-text-tertiary)",
  fontSize: "var(--sm-text-sm)",
};

const inviteForm: React.CSSProperties = {
  display: "flex",
  gap: "var(--sm-space-3)",
  flexWrap: "wrap",
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 180,
  padding: "var(--sm-space-2) var(--sm-space-3)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-md)",
  fontSize: "var(--sm-text-sm)",
  background: "var(--sm-surface-card)",
  color: "var(--sm-text-primary)",
};

const selectStyle: React.CSSProperties = {
  padding: "var(--sm-space-2) var(--sm-space-3)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-md)",
  fontSize: "var(--sm-text-sm)",
  background: "var(--sm-surface-card)",
  color: "var(--sm-text-primary)",
};

const removeBtn: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-md)",
  padding: "var(--sm-space-1) var(--sm-space-3)",
  fontSize: "var(--sm-text-xs)",
  color: "var(--sm-text-secondary)",
  cursor: "pointer",
};

const toastBanner: React.CSSProperties = {
  background: "var(--sm-success-500)",
  color: "#fff",
  padding: "var(--sm-space-2) var(--sm-space-4)",
  borderRadius: "var(--sm-radius-md)",
  marginBottom: "var(--sm-space-4)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: "var(--sm-text-sm)",
};
