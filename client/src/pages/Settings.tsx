import { useEffect, useState } from "react";
import {
  getProfile,
  updateProfile,
  getNotificationPreferences,
  updateNotificationPreferences,
  type UserProfile,
  type NotificationPreferences,
} from "../api";
import { Button } from "../components/ui/Button";
import { ErrorBanner } from "../components/ErrorBanner";

type Tab = "profile" | "notifications" | "account";

export function Settings() {
  const [tab, setTab] = useState<Tab>("profile");

  return (
    <div style={shell}>
      <div style={hero}>
        <h1 style={{ fontSize: "var(--sm-text-2xl)", fontWeight: 700, margin: 0 }}>Settings</h1>
      </div>

      {/* Tabs — underline variant */}
      <div style={tabBar}>
        {(["profile", "notifications", "account"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={tabStyle(t === tab)}
            role="tab"
            aria-selected={t === tab}
          >
            {t === "profile" ? "Profile" : t === "notifications" ? "Notifications" : "Account"}
          </button>
        ))}
      </div>

      <div style={{ paddingTop: "var(--sm-space-6)" }}>
        {tab === "profile" && <ProfileTab />}
        {tab === "notifications" && <NotificationsTab />}
        {tab === "account" && <AccountTab />}
      </div>
    </div>
  );
}

// ── Profile Tab ────────────────────────────────────────────────────────

function ProfileTab() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    getProfile()
      .then((p) => {
        setProfile(p);
        setName(p.name || "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load profile"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = () => {
    setSaving(true);
    setError(null);
    updateProfile({ name: name.trim() || undefined })
      .then((p) => {
        setProfile(p);
        setToast("Profile updated");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to update profile"))
      .finally(() => setSaving(false));
  };

  if (loading) {
    return <div style={loadingText}>Loading profile...</div>;
  }

  return (
    <div style={tabContent}>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {toast && (
        <div style={toastStyle}>
          {toast}
          <button onClick={() => setToast(null)} style={toastDismiss}>x</button>
        </div>
      )}

      <div style={section}>
        <h2 style={sectionTitle}>Profile</h2>
        <p style={sectionDesc}>Your personal information</p>

        <div style={fieldGroup}>
          <label style={label}>Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
            placeholder="Your name"
          />
        </div>

        <div style={fieldGroup}>
          <label style={label}>Email</label>
          <input
            value={profile?.email || ""}
            readOnly
            style={{ ...inputStyle, color: "var(--sm-text-tertiary)", cursor: "not-allowed" }}
          />
          <span style={hint}>Email is managed via your authentication provider</span>
        </div>

        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}

// ── Notifications Tab ──────────────────────────────────────────────────

function NotificationsTab() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Local toggle state synced from server
  const [inApp, setInApp] = useState(true);
  const [email, setEmail] = useState(true);
  const [walkthroughComplete, setWalkthroughComplete] = useState(true);
  const [newIssue, setNewIssue] = useState(true);
  const [issueResolved, setIssueResolved] = useState(true);

  useEffect(() => {
    getNotificationPreferences()
      .then((p) => {
        setPrefs(p);
        setInApp(p.inApp);
        setEmail(p.email);
        setWalkthroughComplete(p.walkthroughComplete);
        setNewIssue(p.newIssue);
        setIssueResolved(p.issueResolved);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load preferences"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = () => {
    setSaving(true);
    setError(null);
    updateNotificationPreferences({ inApp, email, walkthroughComplete, newIssue, issueResolved })
      .then((p) => {
        setPrefs(p);
        setToast("Preferences updated");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to save preferences"))
      .finally(() => setSaving(false));
  };

  const dirty = prefs && (
    inApp !== prefs.inApp ||
    email !== prefs.email ||
    walkthroughComplete !== prefs.walkthroughComplete ||
    newIssue !== prefs.newIssue ||
    issueResolved !== prefs.issueResolved
  );

  if (loading) {
    return <div style={loadingText}>Loading preferences...</div>;
  }

  return (
    <div style={tabContent}>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {toast && (
        <div style={toastStyle}>
          {toast}
          <button onClick={() => setToast(null)} style={toastDismiss}>x</button>
        </div>
      )}

      {/* Delivery Channels */}
      <div style={section}>
        <h2 style={sectionTitle}>Delivery Channels</h2>
        <p style={sectionDesc}>How you receive notifications</p>

        <div style={toggleList}>
          <ToggleRow label="In-app notifications" checked={inApp} onChange={setInApp} />
          <ToggleRow label="Email notifications" checked={email} onChange={setEmail} />
        </div>
      </div>

      {/* Alert Configuration */}
      <div style={section}>
        <h2 style={sectionTitle}>Alert Configuration</h2>
        <p style={sectionDesc}>Which events trigger notifications</p>

        <div style={toggleList}>
          <ToggleRow label="Walkthrough completed" checked={walkthroughComplete} onChange={setWalkthroughComplete} />
          <ToggleRow label="New repair issue detected" checked={newIssue} onChange={setNewIssue} />
          <ToggleRow label="Issue resolved" checked={issueResolved} onChange={setIssueResolved} />
        </div>
      </div>

      <Button variant="primary" onClick={handleSave} disabled={!dirty || saving}>
        {saving ? "Saving..." : "Save Preferences"}
      </Button>
    </div>
  );
}

// ── Account Tab ────────────────────────────────────────────────────────

function AccountTab() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getProfile()
      .then((p) => setProfile(p))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load account"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={loadingText}>Loading account...</div>;
  }

  return (
    <div style={tabContent}>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Account Info */}
      <div style={section}>
        <h2 style={sectionTitle}>Account</h2>
        <p style={sectionDesc}>Your account details</p>

        <div style={infoGrid}>
          <InfoRow label="User ID" value={profile?.id?.slice(0, 12) || "—"} />
          <InfoRow label="Email" value={profile?.email || "—"} />
          <InfoRow label="Member since" value={profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : "—"} />
        </div>
      </div>

      {/* Session Management */}
      <div style={section}>
        <h2 style={sectionTitle}>Session Management</h2>
        <p style={sectionDesc}>Manage your active sessions across devices</p>

        <div style={sessionCard}>
          <div style={sessionDevice}>
            <div style={sessionDot} />
            <div>
              <div style={{ fontWeight: 500, fontSize: "var(--sm-text-sm)" }}>Current session</div>
              <div style={{ color: "var(--sm-text-tertiary)", fontSize: "var(--sm-text-xs)" }}>
                Active now
              </div>
            </div>
          </div>
          <span style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-success-600)", fontWeight: 500 }}>
            Active
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Shared Components ──────────────────────────────────────────────────

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={toggleRow}>
      <span style={{ fontSize: "var(--sm-text-sm)" }}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={toggleTrack(checked)}
      >
        <span style={toggleThumb(checked)} />
      </button>
    </label>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoRow}>
      <span style={{ color: "var(--sm-text-secondary)", fontSize: "var(--sm-text-sm)" }}>{label}</span>
      <span style={{ fontSize: "var(--sm-text-sm)", fontWeight: 500 }}>{value}</span>
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
  marginBottom: "var(--sm-space-6)",
};

const tabBar: React.CSSProperties = {
  display: "flex",
  gap: 0,
  borderBottom: "1px solid var(--sm-border-default)",
};

function tabStyle(active: boolean): React.CSSProperties {
  return {
    padding: "var(--sm-space-2) var(--sm-space-4)",
    fontSize: "var(--sm-text-sm)",
    fontWeight: active ? 600 : 400,
    color: active ? "var(--sm-brand-600)" : "var(--sm-text-secondary)",
    background: "none",
    border: "none",
    borderBottom: active ? "2px solid var(--sm-brand-600)" : "2px solid transparent",
    marginBottom: -1,
    cursor: "pointer",
    fontFamily: "inherit",
    minHeight: 44,
  };
}

const tabContent: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--sm-space-6)",
};

const section: React.CSSProperties = {
  paddingBottom: "var(--sm-space-6)",
  borderBottom: "1px solid var(--sm-border-default)",
};

const sectionTitle: React.CSSProperties = {
  fontSize: "var(--sm-text-lg)",
  fontWeight: 600,
  margin: "0 0 var(--sm-space-1)",
};

const sectionDesc: React.CSSProperties = {
  fontSize: "var(--sm-text-sm)",
  color: "var(--sm-text-tertiary)",
  margin: "0 0 var(--sm-space-4)",
};

const fieldGroup: React.CSSProperties = {
  marginBottom: "var(--sm-space-4)",
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: "var(--sm-text-sm)",
  fontWeight: 500,
  marginBottom: "var(--sm-space-2)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "var(--sm-space-2) var(--sm-space-3)",
  fontSize: "var(--sm-text-sm)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-md)",
  background: "var(--sm-surface-card)",
  color: "var(--sm-text-primary)",
  boxSizing: "border-box",
};

const hint: React.CSSProperties = {
  display: "block",
  fontSize: "var(--sm-text-xs)",
  color: "var(--sm-text-tertiary)",
  marginTop: "var(--sm-space-1)",
};

const toggleList: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-lg)",
  overflow: "hidden",
};

const toggleRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "var(--sm-space-3) var(--sm-space-4)",
  borderBottom: "1px solid var(--sm-border-default)",
  cursor: "pointer",
  minHeight: 44,
};

function toggleTrack(on: boolean): React.CSSProperties {
  return {
    width: 40,
    height: 24,
    borderRadius: "var(--sm-radius-full)",
    background: on ? "var(--sm-brand-600)" : "var(--sm-gray-300)",
    border: "none",
    cursor: "pointer",
    position: "relative",
    transition: "background var(--sm-transition-fast)",
    padding: 0,
    flexShrink: 0,
  };
}

function toggleThumb(on: boolean): React.CSSProperties {
  return {
    display: "block",
    width: 18,
    height: 18,
    borderRadius: "50%",
    background: "#fff",
    position: "absolute",
    top: 3,
    left: on ? 19 : 3,
    transition: "left var(--sm-transition-fast)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
  };
}

const infoGrid: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-lg)",
  overflow: "hidden",
};

const infoRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "var(--sm-space-3) var(--sm-space-4)",
  borderBottom: "1px solid var(--sm-border-default)",
};

const sessionCard: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "var(--sm-space-4)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-lg)",
};

const sessionDevice: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--sm-space-3)",
};

const sessionDot: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: "var(--sm-success-500)",
  flexShrink: 0,
};

const loadingText: React.CSSProperties = {
  textAlign: "center",
  padding: "var(--sm-space-16) 0",
  color: "var(--sm-text-tertiary)",
  fontSize: "var(--sm-text-sm)",
};

const toastStyle: React.CSSProperties = {
  background: "var(--sm-success-500)",
  color: "#fff",
  padding: "var(--sm-space-2) var(--sm-space-4)",
  borderRadius: "var(--sm-radius-md)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: "var(--sm-text-sm)",
};

const toastDismiss: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};
