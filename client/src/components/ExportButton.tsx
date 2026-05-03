import { useState, useRef, useEffect } from "react";
import { Button } from "./ui/Button";
import { downloadReport, getSpaceId } from "../api";

interface ExportButtonProps {
  type: "inventory" | "repairs";
  style?: React.CSSProperties;
}

export function ExportButton({ type, style }: ExportButtonProps) {
  const spaceId = getSpaceId();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!spaceId) return null;

  const handleDownload = async (format: "pdf" | "csv") => {
    setOpen(false);
    setLoading(true);
    try {
      await downloadReport(type, format, spaceId);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={loading}
      >
        {loading ? "Exporting..." : <>&#128229; Export</>}
      </Button>
      {open && (
        <div style={dropdownStyle} role="listbox">
          <button style={itemStyle} onClick={() => handleDownload("pdf")}>
            <span style={itemIcon}>&#128196;</span>
            <div>
              <div style={itemLabel}>PDF</div>
              <div style={itemDesc}>Formatted report</div>
            </div>
          </button>
          <button style={itemStyle} onClick={() => handleDownload("csv")}>
            <span style={itemIcon}>&#128202;</span>
            <div>
              <div style={itemLabel}>CSV</div>
              <div style={itemDesc}>Spreadsheet-ready</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  right: 0,
  top: "calc(100% + 4px)",
  zIndex: 100,
  background: "var(--sm-surface-card)",
  border: "1px solid var(--sm-border-default)",
  borderRadius: "var(--sm-radius-lg)",
  boxShadow: "var(--sm-shadow-lg)",
  padding: "var(--sm-space-1)",
  minWidth: 200,
};

const itemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--sm-space-3)",
  width: "100%",
  padding: "var(--sm-space-3) var(--sm-space-3)",
  border: "none",
  background: "none",
  font: "inherit",
  cursor: "pointer",
  borderRadius: "var(--sm-radius-md)",
  color: "var(--sm-text-primary)",
  textAlign: "left",
};

const itemIcon: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: "var(--sm-radius-md)",
  background: "var(--sm-neutral-100)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 18,
  flexShrink: 0,
};

const itemLabel: React.CSSProperties = {
  fontSize: "var(--sm-text-sm)",
  fontWeight: 600,
};

const itemDesc: React.CSSProperties = {
  fontSize: "var(--sm-text-xs)",
  color: "var(--sm-text-tertiary)",
};
