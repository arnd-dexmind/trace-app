interface SkeletonBlock {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
}

interface LoadingSkeletonProps {
  blocks: SkeletonBlock[];
  gap?: string;
  style?: React.CSSProperties;
}

export function LoadingSkeleton({ blocks, gap = "var(--sm-space-4)", style }: LoadingSkeletonProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap, ...style }}>
      {blocks.map((b, i) => (
        <div
          key={i}
          style={{
            width: b.width ?? "100%",
            height: b.height ?? "var(--sm-space-4)",
            borderRadius: b.borderRadius ?? "var(--sm-radius-md)",
            background: "var(--sm-neutral-200)",
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
      ))}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
