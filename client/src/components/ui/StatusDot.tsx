type StatusDotVariant = "success" | "warning" | "danger" | "neutral";

interface StatusDotProps {
  variant?: StatusDotVariant;
  size?: number;
  style?: React.CSSProperties;
}

const colorMap: Record<StatusDotVariant, string> = {
  success: "var(--sm-success-500)",
  warning: "var(--sm-warning-400)",
  danger: "var(--sm-danger-500)",
  neutral: "var(--sm-neutral-400)",
};

export function StatusDot({ variant = "neutral", size = 8, style }: StatusDotProps) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "inline-block",
        background: colorMap[variant],
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
