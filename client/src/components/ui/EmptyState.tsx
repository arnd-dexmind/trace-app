import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: string;
  title?: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon = "&#128269;", title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "var(--sm-space-16) var(--sm-space-4)",
        color: "var(--sm-text-tertiary)",
      }}
    >
      <div
        style={{ fontSize: 48, marginBottom: "var(--sm-space-4)", lineHeight: 1 }}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: icon }}
      />
      {title && (
        <p style={{ fontSize: "var(--sm-text-base)", fontWeight: 500, color: "var(--sm-text-secondary)", marginBottom: "var(--sm-space-2)" }}>
          {title}
        </p>
      )}
      {description && (
        <p style={{ fontSize: "var(--sm-text-sm)", maxWidth: 320, margin: "0 auto" }}>
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: "var(--sm-space-6)" }}>{action}</div>}
    </div>
  );
}
