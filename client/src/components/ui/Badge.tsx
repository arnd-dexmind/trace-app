import type { ReactNode } from "react";

type BadgeVariant =
  | "status-open"
  | "status-monitoring"
  | "status-resolved"
  | "severity-high"
  | "severity-medium"
  | "severity-low"
  | "confidence-high"
  | "confidence-medium"
  | "confidence-low"
  | "neutral"
  | "brand";

interface BadgeProps {
  variant?: BadgeVariant;
  dot?: boolean;
  children: ReactNode;
  style?: React.CSSProperties;
}

const variantMap: Record<BadgeVariant, { bg: string; color: string; dotColor?: string }> = {
  "status-open": { bg: "#fef3c7", color: "#92400e", dotColor: "#eab308" },
  "status-monitoring": { bg: "#dbeafe", color: "#1e40af", dotColor: "#3b82f6" },
  "status-resolved": { bg: "#dcfce7", color: "#166534", dotColor: "#22c55e" },
  "severity-high": { bg: "#fee2e2", color: "var(--sm-danger-700)", dotColor: "var(--sm-danger-500)" },
  "severity-medium": { bg: "#fef9c3", color: "var(--sm-warning-600)", dotColor: "var(--sm-warning-400)" },
  "severity-low": { bg: "var(--sm-neutral-100)", color: "var(--sm-text-secondary)" },
  "confidence-high": { bg: "#dcfce7", color: "var(--sm-success-700)", dotColor: "var(--sm-success-500)" },
  "confidence-medium": { bg: "#fef9c3", color: "var(--sm-warning-600)", dotColor: "var(--sm-warning-400)" },
  "confidence-low": { bg: "#fee2e2", color: "var(--sm-danger-700)", dotColor: "var(--sm-danger-500)" },
  neutral: { bg: "var(--sm-neutral-100)", color: "var(--sm-text-secondary)" },
  brand: { bg: "var(--sm-brand-100)", color: "var(--sm-brand-700)" },
};

export function Badge({ variant = "neutral", dot, children, style }: BadgeProps) {
  const v = variantMap[variant];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        fontWeight: 500,
        padding: "2px 8px",
        borderRadius: "var(--sm-radius-full)",
        background: v.bg,
        color: v.color,
        whiteSpace: "nowrap",
        flexShrink: 0,
        ...style,
      }}
    >
      {dot && v.dotColor && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            display: "inline-block",
            background: v.dotColor,
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  );
}
