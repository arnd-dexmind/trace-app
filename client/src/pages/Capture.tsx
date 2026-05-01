import { useState, useRef, useCallback } from "react";
import { uploadFile } from "../api";
import { Button } from "../components/ui/Button";

type CaptureState = "idle" | "selected" | "uploading" | "complete" | "error";

interface FileEntry {
  file: File;
  id: string;
  previewUrl: string | null;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  errorMessage?: string;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024;

let _idCounter = 0;
function nextId(): string {
  _idCounter += 1;
  return `f${_idCounter}`;
}

export function Capture() {
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const entries: FileEntry[] = [];
    for (let i = 0; i < incoming.length; i++) {
      const file = incoming[i];
      if (file.size > MAX_FILE_SIZE) {
        setErrorMessage(`${file.name} exceeds 50 MB limit`);
        continue;
      }
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");
      if (!isImage && !isVideo) {
        setErrorMessage(`${file.name} is not a supported image or video format`);
        continue;
      }
      const previewUrl = isImage ? URL.createObjectURL(file) : null;
      entries.push({
        file,
        id: nextId(),
        previewUrl,
        progress: 0,
        status: "pending",
      });
    }
    if (entries.length > 0) {
      setFiles((prev) => [...prev, ...entries]);
      setCaptureState("selected");
      setErrorMessage("");
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    // Reset so the same file can be re-selected
    if (e.target) e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const next = prev.filter((f) => f.id !== id);
      if (next.length === 0) {
        setCaptureState("idle");
      }
      return next;
    });
  };

  const uploadAll = async () => {
    const pending = files.filter((f) => f.status === "pending" || f.status === "error");
    if (pending.length === 0) return;

    setCaptureState("uploading");
    setErrorMessage("");

    for (const entry of pending) {
      setFiles((prev) =>
        prev.map((f) => (f.id === entry.id ? { ...f, status: "uploading", progress: 0, errorMessage: undefined } : f)),
      );

      try {
        await uploadFile(entry.file);
        setFiles((prev) =>
          prev.map((f) => (f.id === entry.id ? { ...f, status: "done", progress: 100 } : f)),
        );
      } catch (err) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === entry.id
              ? { ...f, status: "error", progress: 0, errorMessage: err instanceof Error ? err.message : "Upload failed" }
              : f,
          ),
        );
      }
    }

    // Determine final state
    setFiles((current) => {
      const allDone = current.every((f) => f.status === "done");
      const anyError = current.some((f) => f.status === "error");
      if (allDone) setCaptureState("complete");
      else if (anyError) setCaptureState("error");
      return current;
    });
  };

  const reset = () => {
    files.forEach((f) => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
    setFiles([]);
    setCaptureState("idle");
    setErrorMessage("");
  };

  const sizeLabel = (bytes: number) =>
    bytes > 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${(bytes / 1e6).toFixed(0)} MB`;

  return (
    <div style={shell}>
      <h1 style={titleStyle}>Inventory Capture</h1>
      <p style={subtitleStyle}>
        Upload photos or videos of your space. Drag and drop, browse files, or use your camera.
      </p>

      {/* ── Upload Area ── */}
      {(captureState === "idle" || captureState === "selected") && (
        <div
          style={dropZoneStyle(dragOver)}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          aria-label="Drop photos or videos here, or tap to browse"
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
        >
          <div style={{ fontSize: 48, marginBottom: "var(--sm-space-4)", lineHeight: 1 }}>&#128247;</div>
          <p style={{ fontSize: "var(--sm-text-lg)", fontWeight: 600, marginBottom: "var(--sm-space-1)" }}>
            Drop photos or videos here
          </p>
          <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)" }}>
            or tap to browse files
          </p>
          <p style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)", marginTop: "var(--sm-space-3)" }}>
            JPG, PNG, GIF, WebP, MP4, WebM, MOV &middot; up to 50 MB each
          </p>

          {isTouchDevice() && (
            <div style={{ marginTop: "var(--sm-space-4)" }}>
              <Button
                variant="outline"
                size="md"
                onClick={(e) => { e.stopPropagation(); cameraInputRef.current?.click(); }}
              >
                &#128247; Use Camera
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── File List ── */}
      {files.length > 0 && (
        <div style={fileListStyle}>
          {files.map((entry) => (
            <div key={entry.id} style={fileCardStyle(entry.status)}>
              {/* Thumbnail */}
              {entry.previewUrl ? (
                <img src={entry.previewUrl} alt="" style={thumbnailStyle} />
              ) : (
                <div style={videoPlaceholderStyle}>&#127910;</div>
              )}

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={fileNameStyle}>{entry.file.name}</div>
                <div style={{ fontSize: "var(--sm-text-xs)", color: "var(--sm-text-tertiary)" }}>
                  {sizeLabel(entry.file.size)}
                  {entry.status === "uploading" && ` &middot; Uploading…`}
                  {entry.status === "done" && ` &middot; Uploaded`}
                  {entry.status === "error" && entry.errorMessage && (
                    <span style={{ color: "var(--sm-danger-500)" }}> &middot; {entry.errorMessage}</span>
                  )}
                </div>

                {/* Progress bar */}
                {entry.status === "uploading" && (
                  <div style={progressTrackStyle}>
                    <div style={{ ...progressFillStyle, width: "60%" }} />
                  </div>
                )}
                {entry.status === "done" && (
                  <div style={progressTrackStyle}>
                    <div style={{ ...progressFillStyle, width: "100%", background: "var(--sm-success-500)" }} />
                  </div>
                )}
                {entry.status === "error" && (
                  <div style={progressTrackStyle}>
                    <div style={{ ...progressFillStyle, width: "100%", background: "var(--sm-danger-500)" }} />
                  </div>
                )}
              </div>

              {/* Remove */}
              {entry.status !== "uploading" && (
                <button onClick={() => removeFile(entry.id)} style={removeBtnStyle} aria-label={`Remove ${entry.file.name}`}>
                  &times;
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Actions ── */}
      {captureState === "selected" && (
        <div style={{ display: "flex", gap: "var(--sm-space-3)", justifyContent: "center", marginTop: "var(--sm-space-4)" }}>
          <Button variant="primary" size="md" onClick={uploadAll}>
            Upload {files.length} {files.length === 1 ? "File" : "Files"}
          </Button>
          <Button variant="ghost" size="md" onClick={reset}>
            Clear
          </Button>
        </div>
      )}

      {/* ── Uploading ── */}
      {captureState === "uploading" && (
        <div style={{ textAlign: "center", marginTop: "var(--sm-space-6)" }}>
          <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)" }}>
            Uploading files…
          </p>
        </div>
      )}

      {/* ── Complete ── */}
      {captureState === "complete" && (
        <div style={resultCardStyle("success")}>
          <div style={{ fontSize: 32, marginBottom: "var(--sm-space-3)" }}>&#9989;</div>
          <h3 style={{ fontSize: "var(--sm-text-lg)", marginBottom: "var(--sm-space-1)" }}>
            All Files Uploaded
          </h3>
          <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)", marginBottom: "var(--sm-space-4)" }}>
            {files.length} {files.length === 1 ? "file" : "files"} uploaded successfully.
          </p>
          <Button variant="primary" size="md" onClick={reset}>
            Capture More
          </Button>
        </div>
      )}

      {/* ── Partial Error ── */}
      {captureState === "error" && (
        <div style={resultCardStyle("error")}>
          <div style={{ fontSize: 32, marginBottom: "var(--sm-space-3)" }}>&#9888;&#65039;</div>
          <h3 style={{ fontSize: "var(--sm-text-lg)", marginBottom: "var(--sm-space-1)" }}>
            Some Uploads Failed
          </h3>
          <p style={{ fontSize: "var(--sm-text-sm)", color: "var(--sm-text-secondary)", marginBottom: "var(--sm-space-4)" }}>
            Check the file list above for details. You can remove failed files and retry.
          </p>
          <Button variant="primary" size="md" onClick={uploadAll}>
            Retry Failed
          </Button>
        </div>
      )}

      {/* ── Hidden Inputs ── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
    </div>
  );
}

function isTouchDevice(): boolean {
  return typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);
}

// ── Styles ──────────────────────────────────────────────────────────────

const shell: React.CSSProperties = {
  maxWidth: 640,
  margin: "0 auto",
  padding: "0 var(--sm-space-4)",
  paddingTop: "var(--sm-space-6)",
  paddingBottom: "var(--sm-space-12)",
};

const titleStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-2xl)",
  fontWeight: 600,
  marginBottom: "var(--sm-space-1)",
};

const subtitleStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-sm)",
  color: "var(--sm-text-secondary)",
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
  textAlign: "center",
});

const fileListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--sm-space-2)",
  marginBottom: "var(--sm-space-4)",
};

const fileCardStyle = (status: string): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: "var(--sm-space-3)",
  padding: "var(--sm-space-3) var(--sm-space-4)",
  border: `1px solid ${
    status === "error" ? "#fecaca" : status === "done" ? "#bbf7d0" : "var(--sm-border-default)"
  }`,
  borderRadius: "var(--sm-radius-md)",
  background: status === "error" ? "#fef2f2" : status === "done" ? "#f0fdf4" : "var(--sm-surface-card)",
  textAlign: "left",
});

const thumbnailStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: "var(--sm-radius-md)",
  objectFit: "cover",
  flexShrink: 0,
};

const videoPlaceholderStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: "var(--sm-radius-md)",
  background: "var(--sm-neutral-100)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 24,
  flexShrink: 0,
};

const fileNameStyle: React.CSSProperties = {
  fontSize: "var(--sm-text-sm)",
  fontWeight: 500,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const progressTrackStyle: React.CSSProperties = {
  width: "100%",
  height: 4,
  borderRadius: "var(--sm-radius-full)",
  background: "var(--sm-neutral-200)",
  overflow: "hidden",
  marginTop: "var(--sm-space-1)",
};

const progressFillStyle: React.CSSProperties = {
  height: "100%",
  borderRadius: "var(--sm-radius-full)",
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
  flexShrink: 0,
};

const resultCardStyle = (variant: "success" | "error"): React.CSSProperties => ({
  textAlign: "center",
  padding: "var(--sm-space-6)",
  border: `1px solid ${variant === "success" ? "#bbf7d0" : "#fecaca"}`,
  borderRadius: "var(--sm-radius-xl)",
  background: variant === "success" ? "#f0fdf4" : "#fef2f2",
  marginTop: "var(--sm-space-6)",
});
