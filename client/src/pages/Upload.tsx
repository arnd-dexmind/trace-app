import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getSpaceId, setSpaceId, listSpaces, createSpace, listWalkthroughs, createWalkthrough, attachMedia, startProcessing, uploadFile, Space, Walkthrough } from "../api";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";

type UploadState = "idle" | "selected" | "uploading" | "processing" | "error";

interface FileInfo {
  file: File;
  name: string;
  sizeLabel: string;
}

const STATUS_CONFIG: Record<string, { variant: "brand" | "status-monitoring" | "status-open" | "status-resolved"; label: string }> = {
  uploaded: { variant: "brand", label: "Uploaded" },
  processing: { variant: "status-monitoring", label: "Processing" },
  awaiting_review: { variant: "status-open", label: "Awaiting Review" },
  applied: { variant: "status-resolved", label: "Applied" },
};

export function Upload() {
  const spaceId = getSpaceId();
  const navigate = useNavigate();

  // Upload state
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [dragOver, setDragOver] = useState(false);

  // Space state
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [activeSpaceId, setActiveSpaceId] = useState<string>(spaceId || "");
  const [showNewSpace, setShowNewSpace] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [newSpaceDesc, setNewSpaceDesc] = useState("");
  const [creatingSpace, setCreatingSpace] = useState(false);

  // Walkthrough list
  const [walkthroughs, setWalkthroughs] = useState<Walkthrough[]>([]);
  const [loadingWts, setLoadingWts] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // ── Load spaces ────────────────────────────────────────────────────
  const refreshSpaces = useCallback(async () => {
    try {
      const data = await listSpaces();
      setSpaces(data);
      if (!activeSpaceId && data.length > 0) {
        setActiveSpaceId(data[0].id);
        setSpaceId(data[0].id);
      }
    } catch {
      // spaces unavailable
    }
  }, [activeSpaceId]);

  useEffect(() => { refreshSpaces(); }, []);

  // ── Load walkthroughs for active space ─────────────────────────────
  const refreshWalkthroughs = useCallback(async () => {
    if (!activeSpaceId) return;
    setLoadingWts(true);
    try {
      const wts = await listWalkthroughs(activeSpaceId);
      setWalkthroughs(wts);
    } catch {
      // walkthroughs unavailable
    } finally {
      setLoadingWts(false);
    }
  }, [activeSpaceId]);

  useEffect(() => { refreshWalkthroughs(); }, [activeSpaceId]);

  // Poll for status updates while any walkthrough is in a non-terminal state
  useEffect(() => {
    const hasActive = walkthroughs.some((wt) => wt.status !== "applied");
    if (!hasActive) return;

    const interval = setInterval(refreshWalkthroughs, 5000);
    return () => clearInterval(interval);
  }, [walkthroughs, refreshWalkthroughs]);

  // ── Space selection ────────────────────────────────────────────────
  const handleSpaceSelect = (id: string) => {
    setActiveSpaceId(id);
    setSpaceId(id);
  };

  const handleCreateSpace = async () => {
    if (!newSpaceName.trim()) return;
    setCreatingSpace(true);
    try {
      const space = await createSpace({
        name: newSpaceName.trim(),
        description: newSpaceDesc.trim() || undefined,
      });
      setSpaces((prev) => [...prev, space]);
      setActiveSpaceId(space.id);
      setSpaceId(space.id);
      setShowNewSpace(false);
      setNewSpaceName("");
      setNewSpaceDesc("");
    } catch {
      // failed to create space
    } finally {
      setCreatingSpace(false);
    }
  };

  // ── File handling ──────────────────────────────────────────────────
  const handleFile = useCallback((file: File) => {
    setFileInfo({
      file,
      name: file.name,
      sizeLabel: file.size > 1e9
        ? `${(file.size / 1e9).toFixed(1)} GB`
        : `${(file.size / 1e6).toFixed(0)} MB`,
    });
    setUploadState("selected");
    setErrorMessage("");
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const removeFile = () => {
    setFileInfo(null);
    setUploadState("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (photoInputRef.current) photoInputRef.current.value = "";
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const uploadAndProcess = async () => {
    if (!fileInfo || !activeSpaceId) return;

    setUploadState("uploading");
    setProgress(0);
    setProgressLabel("Uploading file…");
    setErrorMessage("");

    try {
      const uploaded = await uploadFile(fileInfo.file);
      setProgress(60);
      setProgressLabel("Creating walkthrough…");

      const walkthrough = await createWalkthrough(activeSpaceId, {
        originalName: fileInfo.file.name,
        size: fileInfo.file.size,
      });

      await attachMedia(activeSpaceId, walkthrough.id, {
        type: "video",
        url: uploaded.url,
      });

      setProgress(80);
      setProgressLabel("Starting AI processing…");

      await startProcessing(activeSpaceId, walkthrough.id);

      refreshWalkthroughs();
      navigate(`/processing/${walkthrough.id}`);
    } catch (e) {
      setUploadState("error");
      setErrorMessage(e instanceof Error ? e.message : "Processing failed");
    }
  };

  // ── Format relative time ───────────────────────────────────────────
  const relativeTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  // ── No spaces at all ───────────────────────────────────────────────
  if (spaces.length === 0 && !showNewSpace) {
    return (
      <div style={shell}>
        <EmptyState
          icon="&#128194;"
          title="No spaces yet"
          description="Create a space to start uploading walkthrough videos for AI processing."
          action={
            <Button variant="primary" size="md" onClick={() => setShowNewSpace(true)}>
              Create Your First Space
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div style={shell}>
      {/* ── Space Selector ── */}
      <div style={spaceSelectorStyle}>
        <label style={labelStyle} htmlFor="upload-space-select">Space</label>
        <div style={{ display: "flex", gap: "var(--sm-space-2)", flex: 1, minWidth: 0 }}>
          <select
            id="upload-space-select"
            value={activeSpaceId}
            onChange={(e) => handleSpaceSelect(e.target.value)}
            style={selectStyle}
          >
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          {!showNewSpace && (
            <Button variant="outline" size="sm" onClick={() => setShowNewSpace(true)}>
              + New
            </Button>
          )}
        </div>
      </div>

      {/* ── New Space Form ── */}
      {showNewSpace && (
        <div style={newSpaceCardStyle}>
          <input
            style={inputStyle}
            placeholder="Space name"
            value={newSpaceName}
            onChange={(e) => setNewSpaceName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreateSpace(); }}
            autoFocus
          />
          <input
            style={inputStyle}
            placeholder="Description (optional)"
            value={newSpaceDesc}
            onChange={(e) => setNewSpaceDesc(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreateSpace(); }}
          />
          <div style={{ display: "flex", gap: "var(--sm-space-2)" }}>
            <Button variant="primary" size="sm" onClick={handleCreateSpace} disabled={!newSpaceName.trim() || creatingSpace}>
              {creatingSpace ? "Creating…" : "Create Space"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setShowNewSpace(false); setNewSpaceName(""); setNewSpaceDesc(""); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* ── Upload Area ── */}
      <div style={{ textAlign: "center" }}>
        {uploadState === "idle" && (
          <>
            <div
              style={dropZoneStyle(dragOver)}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              role="button"
              tabIndex={0}
              aria-label="Drop walkthrough video here or tap to browse"
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
            >
              <div style={{ fontSize: 48, marginBottom: "var(--sm-space-4)", lineHeight: 1 }}>&#128249;</div>
              <p style={{ fontSize: "var(--sm-text-lg)", fontWeight: 600, marginBottom: "var(--sm-space-1)" }}>
                Drop walkthrough video here
              </p>
              <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)" }}>
                or tap to browse files
              </p>
              <p style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)", marginTop: "var(--sm-space-3)" }}>
                MP4, MOV, or image sequence (ZIP) &middot; up to 50 MB
              </p>
            </div>

            {/* Camera capture */}
            <div style={captureDividerStyle} aria-hidden="true">or</div>
            <div className="capture-options" style={{ marginBottom: "var(--sm-space-6)" }}>
              <button
                type="button"
                style={captureBtnStyle}
                onClick={() => photoInputRef.current?.click()}
              >
                <span style={{ fontSize: 32, display: "block" }}>&#128247;</span>
                <span style={captureBtnLabelStyle}>Take Photo</span>
                <span style={captureBtnHintStyle}>Use device camera</span>
              </button>
              <button
                type="button"
                style={captureBtnStyle}
                onClick={() => videoInputRef.current?.click()}
              >
                <span style={{ fontSize: 32, display: "block" }}>&#127909;</span>
                <span style={captureBtnLabelStyle}>Record Video</span>
                <span style={captureBtnHintStyle}>Capture walkthrough</span>
              </button>
            </div>
          </>
        )}

        {uploadState === "selected" && fileInfo && (
          <div style={{ marginBottom: "var(--sm-space-6)" }}>
            <div style={fileCardStyle}>
              <span style={{ fontSize: 24, flexShrink: 0 }}>&#127910;</span>
              <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <div style={fileNameStyle}>{fileInfo.name}</div>
                <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-secondary)" }}>
                  {fileInfo.sizeLabel}
                </div>
              </div>
              <button onClick={removeFile} style={removeBtnStyle} aria-label="Remove file">&times;</button>
            </div>
            <Button variant="primary" size="md" onClick={uploadAndProcess}>
              Start Upload &amp; Processing
            </Button>
          </div>
        )}

        {(uploadState === "uploading" || uploadState === "processing") && (
          <div style={{ marginBottom: "var(--sm-space-6)" }}>
            <div style={progressContainerStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sm-space-2)" }}>
                <span style={{ fontSize: "var(--sm-text-sm)", fontWeight: 500 }}>{progressLabel}</span>
                <span style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)" }}>{Math.round(progress)}%</span>
              </div>
              <div style={progressTrackStyle}>
                <div style={{ ...progressFillStyle, width: `${progress}%` }} />
              </div>
            </div>

            {uploadState === "processing" && (
              <div style={stagesStyle}>
                <Stage icon="&#10003;" status="done" label="Upload complete" />
                <Stage icon="" status="active" label="AI processing in background…" />
                <Stage icon="" status="pending" label="Results available in review queue" />
              </div>
            )}

            <p style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)", marginTop: "var(--sm-space-4)" }}>
              You can leave this page — processing continues in the background.
            </p>
          </div>
        )}

        {uploadState === "error" && (
          <div style={resultCardStyle("error")}>
            <div style={{ fontSize: 32, marginBottom: "var(--sm-space-3)" }}>&#9888;&#65039;</div>
            <h3 style={{ fontSize: "var(--sm-text-lg)", marginBottom: "var(--sm-space-1)" }}>
              Processing Failed
            </h3>
            <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)", marginBottom: "var(--sm-space-4)" }}>
              {errorMessage}
            </p>
            <Button variant="outline" size="md" onClick={() => { setUploadState("selected"); setErrorMessage(""); }}>
              Try Again
            </Button>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/quicktime,application/zip"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {/* ── Walkthrough History ── */}
      <div style={historySectionStyle}>
        <h2 style={{ fontSize: "var(--sm-text-lg)", fontWeight: 600, marginBottom: "var(--sm-space-4)" }}>
          Walkthrough History
        </h2>

        {loadingWts && walkthroughs.length === 0 && (
          <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-tertiary)", textAlign: "center", padding: "var(--sm-space-8) 0" }}>
            Loading…
          </p>
        )}

        {!loadingWts && walkthroughs.length === 0 && (
          <EmptyState
            icon="&#127910;"
            title="No walkthroughs yet"
            description="Upload a video to start analyzing your space with AI."
          />
        )}

        {walkthroughs.length > 0 && (
          <div style={wtsListStyle}>
            {walkthroughs.map((wt) => {
              const config = STATUS_CONFIG[wt.status] || STATUS_CONFIG.uploaded;
              const meta = (wt.metadata as { originalName?: string; size?: number } | null) || {};
              const name = meta.originalName || wt.id.slice(0, 8);
              return (
                <div key={wt.id} style={wtCardStyle}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--sm-space-3)" }}>
                    <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1 }}>&#127910;</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--sm-space-2)", marginBottom: 2 }}>
                        <span style={wtNameStyle}>{name}</span>
                        <Badge variant={config.variant} dot>{config.label}</Badge>
                      </div>
                      <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)" }}>
                        {relativeTime(wt.uploadedAt)}
                        {meta.size ? ` &middot; ${(meta.size / 1e6).toFixed(0)} MB` : ""}
                        {wt.itemObsCount != null ? ` &middot; ${wt.itemObsCount} items` : ""}
                        {wt.repairObsCount != null ? ` &middot; ${wt.repairObsCount} repairs` : ""}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function Stage({ icon, status, label }: { icon: string; status: "done" | "active" | "pending"; label: string }) {
  return (
    <div style={{ display: "flex", gap: "var(--sm-space-3)", padding: "var(--sm-space-2) 0", fontSize: "var(--sm-text-sm)", alignItems: "center" }}>
      <span style={stageIconStyle(status)}>{icon || (status === "active" ? "" : "")}</span>
      <span style={stageTextStyle(status)}>{label}</span>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const shell: React.CSSProperties = {
  maxWidth: 640,
  margin: "0 auto",
  padding: "0 var(--sm-space-4)",
  paddingTop: "var(--sm-space-6)",
  paddingBottom: "var(--sm-space-12)",
};

const labelStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-sm)",
  fontWeight: 500,
  color: "var(--sm-text-secondary)",
  flexShrink: 0,
};

const spaceSelectorStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--sm-space-3)",
  marginBottom: "var(--sm-space-6)",
};

const selectStyle: React.CSSProperties = {
  font: "inherit",
  fontSize: "var(--sm-text-sm)",
  padding: "6px 10px",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-md)",
  background: "var(--sm-surface-card)",
  color: "var(--sm-text-primary)",
  flex: 1,
  minWidth: 0,
};

const inputStyle: React.CSSProperties = {
  font: "inherit",
  fontSize: "var(--sm-text-sm)",
  padding: "6px 10px",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-md)",
  background: "var(--sm-surface-card)",
  color: "var(--sm-text-primary)",
  width: "100%",
  boxSizing: "border-box",
};

const newSpaceCardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--sm-space-2)",
  padding: "var(--sm-space-4)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-md)",
  background: "var(--sm-surface-card)",
  marginBottom: "var(--sm-space-6)",
};

const dropZoneStyle = (dragOver: boolean): React.CSSProperties => ({
  border: `2px dashed ${dragOver ? "var(--sm-brand-400)" : "var(--sm-border-strong)"}`,
  borderRadius: "var(--sm-radius-xl)",
  padding: "var(--sm-space-12) var(--sm-space-6)",
  marginBottom: "var(--sm-space-6)",
  cursor: "pointer",
  transition: "border-color var(--sm-transition-fast), background var(--sm-transition-fast)",
  background: dragOver ? "var(--sm-brand-50)" : "var(--sm-surface-card)",
});

const fileCardStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--sm-space-3)",
  padding: "var(--sm-space-3) var(--sm-space-4)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-md)",
  background: "var(--sm-surface-card)",
  marginBottom: "var(--sm-space-4)",
  textAlign: "left",
};

const fileNameStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-sm)",
  fontWeight: 500,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const removeBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  fontSize: 18,
  color: "var(--sm-text-tertiary)",
  cursor: "pointer",
  padding: "var(--sm-space-1)",
  borderRadius: "var(--sm-radius-sm)",
  lineHeight: 1,
};

const progressContainerStyle: React.CSSProperties = {
  marginBottom: "var(--sm-space-4)",
  textAlign: "left",
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

const stagesStyle: React.CSSProperties = {
  textAlign: "left",
  marginTop: "var(--sm-space-4)",
};

const stageIconStyle = (status: "done" | "active" | "pending"): React.CSSProperties => {
  const base: React.CSSProperties = {
    width: 20,
    height: 20,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    flexShrink: 0,
  };
  if (status === "done") return { ...base, border: "2px solid var(--sm-success-500)", background: "var(--sm-success-500)", color: "#fff" };
  if (status === "active") return { ...base, border: "2px solid var(--sm-brand-500)", background: "var(--sm-brand-500)", color: "#fff" };
  return { ...base, border: "2px solid var(--sm-neutral-300)" };
};

const stageTextStyle = (status: "done" | "active" | "pending"): React.CSSProperties => {
  if (status === "pending") return { color: "var(--sm-text-tertiary)" };
  if (status === "active") return { color: "var(--sm-text-primary)", fontWeight: 500 };
  return { color: "var(--sm-text-secondary)" };
};

const resultCardStyle = (variant: "success" | "error"): React.CSSProperties => ({
  textAlign: "left",
  padding: "var(--sm-space-6)",
  border: `1px solid ${variant === "success" ? "#bbf7d0" : "#fecaca"}`,
  borderRadius: "var(--sm-radius-xl)",
  background: variant === "success" ? "#f0fdf4" : "#fef2f2",
  marginBottom: "var(--sm-space-4)",
});

const historySectionStyle: React.CSSProperties = {
  borderTop: "1px solid var(--sm-border-default)",
  paddingTop: "var(--sm-space-6)",
  marginTop: "var(--sm-space-8)",
};

const wtsListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--sm-space-2)",
};

const wtCardStyle: React.CSSProperties = {
  padding: "var(--sm-space-3) var(--sm-space-4)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-md)",
  background: "var(--sm-surface-card)",
};

const wtNameStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-sm)",
  fontWeight: 500,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const captureDividerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--sm-space-4)",
  marginBottom: "var(--sm-space-6)",
  color: "var(--sm-text-tertiary)",
  fontSize: "var(--sm-text-sm)",
};

const captureBtnStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--sm-space-2)",
  padding: "var(--sm-space-6) var(--sm-space-4)",
  border: "2px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-xl)",
  background: "var(--sm-surface-card)",
  cursor: "pointer",
  transition: "all var(--sm-transition-fast)",
  minHeight: 100,
  textAlign: "center",
  font: "inherit",
};

const captureBtnLabelStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-sm)",
  fontWeight: 500,
  color: "var(--sm-text-primary)",
};

const captureBtnHintStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-xs)",
  color: "var(--sm-text-tertiary)",
};
