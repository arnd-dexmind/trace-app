import { useEffect, useCallback } from "react";

interface LightboxProps {
  images: { url: string; alt: string }[];
  currentIndex: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export function Lightbox({ images, currentIndex, onClose, onPrev, onNext }: LightboxProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          onPrev();
          break;
        case "ArrowRight":
          onNext();
          break;
      }
    },
    [onClose, onPrev, onNext],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const current = images[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;

  return (
    <div
      style={overlay}
      onClick={onClose}
      role="dialog"
      aria-label="Image lightbox"
    >
      <button
        onClick={onClose}
        style={closeBtn}
        aria-label="Close"
      >
        &times;
      </button>

      {hasPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          style={{ ...navBtn, left: "var(--sm-space-4)" }}
          aria-label="Previous image"
        >
          &#8249;
        </button>
      )}

      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          style={{ ...navBtn, right: "var(--sm-space-4)" }}
          aria-label="Next image"
        >
          &#8250;
        </button>
      )}

      <div style={content} onClick={(e) => e.stopPropagation()}>
        <img
          src={current.url}
          alt={current.alt}
          style={image}
        />
        <div style={caption}>
          {current.alt}
          <span style={{ color: "var(--sm-text-tertiary)", marginLeft: "var(--sm-space-4)" }}>
            {currentIndex + 1} / {images.length}
          </span>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  background: "rgba(0, 0, 0, 0.9)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const content: React.CSSProperties = {
  maxWidth: "90vw",
  maxHeight: "90vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
};

const image: React.CSSProperties = {
  maxWidth: "90vw",
  maxHeight: "80vh",
  objectFit: "contain",
  borderRadius: "var(--sm-radius-lg)",
};

const caption: React.CSSProperties = {
  color: "#fff",
  fontSize: "var(--sm-text-sm)",
  padding: "var(--sm-space-3)",
  textAlign: "center",
};

const closeBtn: React.CSSProperties = {
  position: "absolute",
  top: "var(--sm-space-4)",
  right: "var(--sm-space-4)",
  background: "rgba(255,255,255,0.15)",
  border: "none",
  color: "#fff",
  fontSize: 28,
  width: 44,
  height: 44,
  borderRadius: "var(--sm-radius-full)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1,
};

const navBtn: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  background: "rgba(255,255,255,0.15)",
  border: "none",
  color: "#fff",
  fontSize: 36,
  width: 48,
  height: 48,
  borderRadius: "var(--sm-radius-full)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1,
};
