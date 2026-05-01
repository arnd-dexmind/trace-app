import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  getProcessingState,
  getSpaceId,
  getWalkthrough,
  type WalkthroughProcessingState,
  type ProcessingJob,
} from "../api";
import { Button } from "../components/ui/Button";

// ── Pipeline stage config ────────────────────────────────────────────────

interface UserStage {
  id: string;
  label: string;
  internalStages: string[];
}

const PIPELINE_STAGES: UserStage[] = [
  { id: "upload", label: "Upload video", internalStages: ["transcoding"] },
  { id: "extract", label: "Extracting frames", internalStages: ["frame_extraction"] },
  {
    id: "detect",
    label: "AI item detection",
    internalStages: ["scene_segmentation", "multimodal_extraction", "entity_matching", "diff_generation"],
  },
  { id: "review", label: "Review queue ready", internalStages: ["review_creation"] },
];

type StageStatus = "pending" | "active" | "done" | "error";
type PageState = "loading" | "processing" | "redirecting" | "error";

interface StageState {
  status: StageStatus;
  detail: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function deriveStages(jobs: ProcessingJob[]): StageState[] {
  const jobMap = new Map<string, ProcessingJob>();
  for (const job of jobs) {
    const existing = jobMap.get(job.stage);
    if (!existing || job.attempt > existing.attempt || job.updatedAt > existing.updatedAt) {
      jobMap.set(job.stage, job);
    }
  }

  return PIPELINE_STAGES.map((stage) => {
    const relevant = stage.internalStages
      .map((s) => jobMap.get(s))
      .filter(Boolean) as ProcessingJob[];

    if (relevant.length === 0) {
      return { status: "pending" as StageStatus, detail: "" };
    }

    const hasError = relevant.some((j) => j.status === "dead");
    if (hasError) {
      const dead = relevant.find((j) => j.status === "dead");
      return { status: "error" as StageStatus, detail: dead?.error || "Failed" };
    }

    const allDone = relevant.every((j) => j.status === "completed");
    if (allDone) return { status: "done" as StageStatus, detail: "" };

    const hasActive = relevant.some((j) => j.status === "running" || j.status === "pending");
    if (hasActive) {
      const active = relevant.find((j) => j.status === "running") || relevant[0];
      let detail = "";
      if (active.stage === "frame_extraction") {
        detail = "Processing video frames";
      } else if (active.stage === "multimodal_extraction") {
        detail = "Running vision AI";
      } else if (active.stage === "entity_matching") {
        detail = "Matching against inventory";
      }
      return { status: "active" as StageStatus, detail };
    }

    return { status: "pending" as StageStatus, detail: "" };
  });
}

function calcProgress(stages: StageState[]): number {
  let progress = 0;
  const weights = [20, 20, 40, 20];

  for (let i = 0; i < stages.length; i++) {
    if (stages[i].status === "done") {
      progress += weights[i];
    } else if (stages[i].status === "active") {
      // Active stage gets half credit (or full if quick)
      progress += weights[i] * 0.5;
      break;
    } else {
      break;
    }
  }

  // Clamp between a minimum feel and 95% (100% only on done)
  if (progress < 5) progress = 5;
  if (progress > 95) progress = 95;
  return Math.round(progress);
}

function activeStageLabel(stages: StageState[]): string {
  const active = stages.find((s) => s.status === "active");
  if (active) return PIPELINE_STAGES[stages.indexOf(active)].label;
  if (stages.every((s) => s.status === "done")) return "Finalizing";
  return "Starting";
}

// ── Component ─────────────────────────────────────────────────────────────

export function Processing() {
  const { walkthroughId } = useParams<{ walkthroughId: string }>();
  const navigate = useNavigate();
  const spaceId = getSpaceId();

  const [pageState, setPageState] = useState<PageState>("loading");
  const [stages, setStages] = useState<StageState[]>(() =>
    PIPELINE_STAGES.map(() => ({ status: "pending", detail: "" }))
  );
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redirectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [frameCount, setFrameCount] = useState<{ current: number; total: number } | null>(null);
  const frameCountFetched = useRef(false);

  const fetchState = useCallback(async () => {
    if (!walkthroughId) return;

    try {
      const state: WalkthroughProcessingState = await getProcessingState(walkthroughId);
      const derived = deriveStages(state.jobs);
      setStages(derived);

      const pct = calcProgress(derived);
      setProgress(pct);
      setProgressLabel(activeStageLabel(derived));

      // Fetch frame count metadata once (ref stable across renders, avoids stale closure)
      if (spaceId && !frameCountFetched.current) {
        frameCountFetched.current = true;
        try {
          const wt = await getWalkthrough(spaceId, walkthroughId);
          const meta = wt.metadata as { extractedFrames?: Array<{ url: string }> } | null;
          if (meta?.extractedFrames) {
            setFrameCount({ current: meta.extractedFrames.length, total: meta.extractedFrames.length });
          }
        } catch {
          frameCountFetched.current = false;
        }
      }

      if (state.done) {
        setProgress(100);
        setProgressLabel("Complete");
        setPageState("redirecting");
        redirectRef.current = setTimeout(() => {
          navigate(`/results/${walkthroughId}`);
        }, 1500);
        return;
      }

      if (state.failed) {
        const deadJob = state.jobs.find((j) => j.status === "dead");
        setErrorMsg(deadJob?.error || "Processing failed at one or more stages.");
        setPageState("error");
        return;
      }

      setPageState("processing");
      pollRef.current = setTimeout(fetchState, 2000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to fetch processing state");
      setPageState("error");
    }
  }, [walkthroughId, spaceId, navigate]);

  useEffect(() => {
    if (!walkthroughId) {
      setPageState("error");
      setErrorMsg("Missing walkthrough ID");
      return;
    }
    fetchState();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
      if (redirectRef.current) clearTimeout(redirectRef.current);
    };
  }, [walkthroughId, fetchState]);

  // ── Render ──────────────────────────────────────────────────────────────

  if (pageState === "loading") {
    return (
      <div style={shell}>
        <div style={skeletonStyle}>
          <div style={skeletonBarStyle} />
          {PIPELINE_STAGES.map((s) => (
            <div key={s.id} style={skeletonRowStyle}>
              <div style={skeletonCircleStyle} />
              <div style={skeletonTextStyle} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (pageState === "error") {
    return (
      <div style={shell}>
        <div style={errorCardStyle}>
          <div style={{ fontSize: 32, marginBottom: "var(--sm-space-3)" }}>&#9888;&#65039;</div>
          <h3 style={{ fontSize: "var(--sm-text-lg)", marginBottom: "var(--sm-space-2)" }}>
            Processing Failed
          </h3>
          <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)", marginBottom: "var(--sm-space-4)" }}>
            {errorMsg}
          </p>
          <div style={{ display: "flex", gap: "var(--sm-space-3)", flexWrap: "wrap", justifyContent: "center" }}>
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                setPageState("loading");
                setErrorMsg("");
                fetchState();
              }}
            >
              Try Again
            </Button>
            <Link to="/upload">
              <Button variant="outline" size="md">Back to Upload</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={shell}>
      {/* Breadcrumb */}
      <nav style={breadcrumbStyle} aria-label="Breadcrumb">
        <Link to="/upload" style={breadcrumbLinkStyle}>Upload</Link>
        <span style={{ color: "var(--sm-text-tertiary)" }}>&#8250;</span>
        <span style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)" }}>Processing</span>
      </nav>

      {/* Page Header */}
      <div style={headerStyle}>
        <h1 style={titleStyle}>
          {pageState === "redirecting" ? "Processing Complete" : "Processing Walkthrough"}
        </h1>
        {pageState === "redirecting" && (
          <p style={subtitleStyle}>Redirecting to results…</p>
        )}
      </div>

      {/* Progress Bar */}
      <div style={progressContainerStyle}>
        <div style={progressHeaderStyle}>
          <span style={progressLabelStyle}>{progressLabel}</span>
          <span style={progressPctStyle}>{Math.round(progress)}%</span>
        </div>
        <div style={progressTrackStyle}>
          <div
            style={{
              ...progressFillStyle,
              width: `${progress}%`,
            }}
          />
        </div>
      </div>

      {/* Pipeline Stages */}
      <div style={stagesContainerStyle}>
        {PIPELINE_STAGES.map((stage, idx) => {
          const s = stages[idx];
          const extractCount = stage.id === "extract" && frameCount
            ? `${frameCount.current} / ${frameCount.total}`
            : null;
          const detail = extractCount || s.detail;
          return (
            <PipelineStage
              key={stage.id}
              label={stage.label}
              status={s.status}
              detail={detail}
            />
          );
        })}
      </div>

      {/* Helper text */}
      <p style={helperTextStyle}>
        Processing time ~2 minutes. You can leave this page.
      </p>

      {/* Redirecting indicator */}
      {pageState === "redirecting" && (
        <div style={{ textAlign: "center", marginTop: "var(--sm-space-6)" }}>
          <div style={spinnerStyle} />
          <p style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)", marginTop: "var(--sm-space-3)" }}>
            Taking you to results…
          </p>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function PipelineStage({
  label,
  status,
  detail,
}: {
  label: string;
  status: StageStatus;
  detail?: string;
}) {
  return (
    <div style={stageRowStyle}>
      <span style={stageIconStyle(status)}>
        {status === "done" ? "✓" : ""}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={stageLabelStyle(status)}>{label}</span>
        {detail && (
          <span style={stageDetailStyle}> {detail}</span>
        )}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const shell: React.CSSProperties = {
  maxWidth: 540,
  margin: "0 auto",
  padding: "0 var(--sm-space-4)",
  paddingTop: "var(--sm-space-8)",
  paddingBottom: "var(--sm-space-12)",
};

const breadcrumbStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--sm-space-2)",
  fontSize: "var(--sm-text-sm)",
  color: "var(--sm-text-secondary)",
  marginBottom: "var(--sm-space-6)",
};

const breadcrumbLinkStyle: React.CSSProperties = {
  color: "var(--sm-text-link)",
  textDecoration: "none",
};

const headerStyle: React.CSSProperties = {
  marginBottom: "var(--sm-space-6)",
};

const titleStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-xl)",
  fontWeight: 700,
  marginBottom: "var(--sm-space-1)",
};

const subtitleStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-sm)",
  color: "var(--sm-text-secondary)",
};

// Progress bar
const progressContainerStyle: React.CSSProperties = {
  marginBottom: "var(--sm-space-6)",
};

const progressHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "var(--sm-space-2)",
};

const progressLabelStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-sm)",
  fontWeight: 500,
};

const progressPctStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-sm)",
  color: "var(--sm-text-secondary)",
};

const progressTrackStyle: React.CSSProperties = {
  width: "100%",
  height: 8,
  borderRadius: "var(--sm-radius-full)",
  background: "var(--sm-neutral-200)",
  overflow: "hidden",
};

const progressFillStyle: React.CSSProperties = {
  height: "100%",
  borderRadius: "var(--sm-radius-full)",
  background: "var(--sm-brand-500)",
  transition: "width 300ms ease",
};

// Pipeline stages
const stagesContainerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--sm-space-1)",
  marginBottom: "var(--sm-space-6)",
  padding: "var(--sm-space-4)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-lg)",
  background: "var(--sm-surface-card)",
};

const stageRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--sm-space-3)",
  padding: "var(--sm-space-2) 0",
  fontSize: "var(--sm-text-sm)",
};

const stageIconStyle = (status: StageStatus): React.CSSProperties => {
  const base: React.CSSProperties = {
    width: 20,
    height: 20,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
    lineHeight: 1,
  };
  if (status === "done") return { ...base, border: "2px solid var(--sm-success-500)", background: "var(--sm-success-500)", color: "#fff" };
  if (status === "active") return { ...base, border: "2px solid var(--sm-brand-500)", background: "var(--sm-brand-500)", color: "#fff", animation: "pulse 1.5s ease infinite" };
  if (status === "error") return { ...base, border: "2px solid var(--sm-danger-500)", background: "var(--sm-danger-500)", color: "#fff" };
  return { ...base, border: "2px solid var(--sm-neutral-300)" };
};

const stageLabelStyle = (status: StageStatus): React.CSSProperties => {
  if (status === "pending") return { color: "var(--sm-text-tertiary)" };
  if (status === "active") return { color: "var(--sm-text-primary)", fontWeight: 500 };
  return { color: "var(--sm-text-secondary)" };
};

const stageDetailStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-xs)",
  color: "var(--sm-text-tertiary)",
};

const helperTextStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-xs)",
  color: "var(--sm-text-tertiary)",
  textAlign: "center",
};

// Skeleton
const skeletonStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--sm-space-4)",
  animation: "pulse 2s ease infinite",
};

const skeletonBarStyle: React.CSSProperties = {
  height: 8,
  borderRadius: "var(--sm-radius-full)",
  background: "var(--sm-neutral-200)",
  marginBottom: "var(--sm-space-2)",
};

const skeletonRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--sm-space-3)",
  padding: "var(--sm-space-2) 0",
};

const skeletonCircleStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: "50%",
  background: "var(--sm-neutral-200)",
  flexShrink: 0,
};

const skeletonTextStyle: React.CSSProperties = {
  height: 14,
  width: 180,
  borderRadius: 4,
  background: "var(--sm-neutral-200)",
};

// Error
const errorCardStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "var(--sm-space-8) var(--sm-space-4)",
  border: "1px solid #fecaca",
  borderRadius: "var(--sm-radius-xl)",
  background: "#fef2f2",
  marginTop: "var(--sm-space-4)",
};

// Redirect spinner
const spinnerStyle: React.CSSProperties = {
  display: "inline-block",
  width: 24,
  height: 24,
  border: "3px solid var(--sm-neutral-200)",
  borderTopColor: "var(--sm-brand-500)",
  borderRadius: "50%",
  animation: "spin 0.6s linear infinite",
};
