export type ProcessingStatus = "pending" | "processing" | "completed" | "failed";

interface StatusBadgeProps {
  status: ProcessingStatus;
  label?: string;
  size?: "sm" | "md";
}

const sizePx = { sm: 8, md: 12 } as const;

export function StatusBadge({ status, label, size = "sm" }: StatusBadgeProps) {
  const px = sizePx[size];
  const fontSize = size === "sm" ? "var(--sm-text-xs)" : "var(--sm-text-sm)";

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--sm-space-2)" }}>
      <span
        style={{
          display: "inline-block",
          width: px,
          height: px,
          borderRadius: "50%",
          flexShrink: 0,
          ...statusStyles[status],
        }}
      />
      {label && (
        <span style={{ fontSize, fontWeight: 500, color: labelColor[status] }}>
          {label}
        </span>
      )}
    </span>
  );
}

const statusStyles: Record<ProcessingStatus, React.CSSProperties> = {
  pending: {
    background: "var(--sm-neutral-400)",
    animation: "pulse 2s ease infinite",
  },
  processing: {
    background: "transparent",
    border: "2px solid var(--sm-neutral-200)",
    borderTopColor: "var(--sm-brand-500)",
    animation: "spin 0.6s linear infinite",
  },
  completed: {
    background: "var(--sm-success-500)",
  },
  failed: {
    background: "var(--sm-danger-500)",
  },
};

const labelColor: Record<ProcessingStatus, string> = {
  pending: "var(--sm-text-tertiary)",
  processing: "var(--sm-brand-600)",
  completed: "var(--sm-success-600)",
  failed: "var(--sm-danger-600)",
};
