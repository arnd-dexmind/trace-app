import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { useOnboarding } from "../hooks/useOnboarding";

export function Welcome() {
  const navigate = useNavigate();
  const { seed, isFirstRun, loading, advanceStep } = useOnboarding();
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);

  const handleSeed = async () => {
    setSeeding(true);
    setSeedError(null);
    const result = await seed();
    setSeeding(false);
    if (result) {
      setSeedResult(`Created "${result.spaceName}" with ${result.itemCount} items and ${result.repairCount} repair issues.`);
    } else {
      setSeedError("Failed to create sample data. You can still get started manually.");
    }
  };

  const handleSkip = () => {
    advanceStep(0);
    navigate("/");
  };

  return (
    <div style={shell}>
      <div style={hero}>
        <div style={brandIcon} aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" style={{ width: 64, height: 64 }}>
            <path d="M 10 52 Q 28 -4, 58 14" stroke="#06B6D4" strokeWidth="1.5" strokeLinecap="round" opacity="0.30"/>
            <circle cx="58" cy="14" r="2" fill="#06B6D4" opacity="0.35"/>
            <path d="M 14 48 Q 30 2, 54 20" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" opacity="0.55"/>
            <circle cx="54" cy="20" r="2.5" fill="#8B5CF6" opacity="0.6"/>
            <path d="M 18 44 Q 32 8, 50 26" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" opacity="0.85"/>
            <circle cx="50" cy="26" r="3" fill="#4F46E5" opacity="0.9"/>
            <path d="M 8 32 C 10 16, 40 14, 54 26 C 44 46, 14 48, 8 32 Z" stroke="#09090B" strokeWidth="2.5" strokeLinejoin="round"/>
            <circle cx="28" cy="31" r="10" fill="#4F46E5"/>
            <circle cx="28" cy="31" r="5" fill="#09090B"/>
            <circle cx="25" cy="28" r="2" fill="#FFFFFF"/>
          </svg>
        </div>
        <h1 style={title}>Welcome to PerifEye</h1>
        <p style={subtitle}>
          Know what&apos;s in your space and what needs attention.
        </p>
      </div>

      <div style={valueProps}>
        <div style={prop}>
          <div style={propIcon}>&#128249;</div>
          <div style={propTitle}>Walk Through &amp; Record</div>
          <div style={propDesc}>Film your space with your phone. Open drawers, cabinets — the works. AI does the rest.</div>
        </div>
        <div style={prop}>
          <div style={propIcon}>&#128269;</div>
          <div style={propTitle}>Find Anything Instantly</div>
          <div style={propDesc}>Search &quot;where are my pliers?&quot; and get the photo, location, and date they were last seen.</div>
        </div>
        <div style={prop}>
          <div style={propIcon}>&#128295;</div>
          <div style={propTitle}>Track Repairs Automatically</div>
          <div style={propDesc}>The AI flags loose sockets, cracked tiles, peeling paint — and keeps your punch list current.</div>
        </div>
      </div>

      <div style={actions}>
        <Button variant="primary" size="md" onClick={handleSkip} disabled={loading}>
          Get Started
        </Button>
        <Button variant="outline" size="md" onClick={handleSeed} disabled={seeding}>
          {seeding ? "Creating sample data..." : "Try with Sample Data"}
        </Button>
      </div>

      {seedResult && (
        <div style={successBanner}>
          <span>&#10003;</span> {seedResult}
          <button onClick={() => { setSeedResult(null); advanceStep(0); navigate("/"); }} style={bannerAction}>
            Go to Dashboard
          </button>
        </div>
      )}

      {seedError && (
        <div style={errorBanner}>
          {seedError}
          <button onClick={() => setSeedError(null)} style={{ ...bannerAction, color: "#fff" }}>x</button>
        </div>
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const shell: React.CSSProperties = {
  maxWidth: 680,
  margin: "0 auto",
  padding: "var(--sm-space-16) var(--sm-space-4)",
  textAlign: "center",
};

const hero: React.CSSProperties = {
  marginBottom: "var(--sm-space-10)",
};

const brandIcon: React.CSSProperties = {
  marginBottom: "var(--sm-space-4)",
};

const title: React.CSSProperties = {
  fontSize: "var(--sm-text-3xl)",
  fontWeight: 700,
  margin: "0 0 var(--sm-space-2)",
  color: "var(--sm-text-primary)",
};

const subtitle: React.CSSProperties = {
  fontSize: "var(--sm-text-lg)",
  color: "var(--sm-text-secondary)",
  margin: 0,
  maxWidth: 440,
  marginLeft: "auto",
  marginRight: "auto",
};

const valueProps: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "var(--sm-space-6)",
  marginBottom: "var(--sm-space-10)",
  textAlign: "left",
};

const prop: React.CSSProperties = {
  padding: "var(--sm-space-4)",
  borderRadius: "var(--sm-radius-lg)",
  border: "1px solid var(--sm-border-default)",
  background: "var(--sm-surface-card)",
};

const propIcon: React.CSSProperties = {
  fontSize: 32,
  lineHeight: 1,
  marginBottom: "var(--sm-space-3)",
};

const propTitle: React.CSSProperties = {
  fontSize: "var(--sm-text-sm)",
  fontWeight: 600,
  color: "var(--sm-text-primary)",
  marginBottom: "var(--sm-space-1)",
};

const propDesc: React.CSSProperties = {
  fontSize: "var(--sm-text-xs)",
  color: "var(--sm-text-secondary)",
  lineHeight: 1.5,
};

const actions: React.CSSProperties = {
  display: "flex",
  gap: "var(--sm-space-3)",
  justifyContent: "center",
  flexWrap: "wrap",
};

const successBanner: React.CSSProperties = {
  marginTop: "var(--sm-space-6)",
  padding: "var(--sm-space-3) var(--sm-space-4)",
  background: "var(--sm-success-50)",
  border: "1px solid var(--sm-success-200)",
  borderRadius: "var(--sm-radius-md)",
  fontSize: "var(--sm-text-sm)",
  color: "var(--sm-success-700)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--sm-space-3)",
  flexWrap: "wrap",
};

const errorBanner: React.CSSProperties = {
  marginTop: "var(--sm-space-6)",
  padding: "var(--sm-space-3) var(--sm-space-4)",
  background: "var(--sm-danger-50)",
  border: "1px solid var(--sm-danger-200)",
  borderRadius: "var(--sm-radius-md)",
  fontSize: "var(--sm-text-sm)",
  color: "var(--sm-danger-700)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const bannerAction: React.CSSProperties = {
  background: "none",
  border: "none",
  fontSize: "var(--sm-text-sm)",
  fontWeight: 600,
  color: "var(--sm-success-700)",
  cursor: "pointer",
  textDecoration: "underline",
};
