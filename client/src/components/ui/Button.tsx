import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "success" | "danger" | "outline" | "ghost";
type ButtonSize = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  children: ReactNode;
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: "var(--sm-brand-600)",
    color: "var(--sm-text-inverse)",
    borderColor: "transparent",
  },
  success: {
    background: "var(--sm-success-600)",
    color: "var(--sm-text-inverse)",
    borderColor: "transparent",
  },
  danger: {
    background: "var(--sm-danger-600)",
    color: "var(--sm-text-inverse)",
    borderColor: "transparent",
  },
  outline: {
    background: "var(--sm-surface-card)",
    borderColor: "var(--sm-border-default)",
    color: "var(--sm-text-primary)",
  },
  ghost: {
    background: "transparent",
    borderColor: "transparent",
    color: "var(--sm-text-secondary)",
  },
};

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: {
    fontSize: "var(--sm-text-xs)",
    padding: "var(--sm-space-1) var(--sm-space-3)",
    minHeight: 44,
  },
  md: {
    fontSize: "var(--sm-text-sm)",
    padding: "var(--sm-space-2) var(--sm-space-4)",
    minHeight: 44,
  },
};

export function Button({
  variant = "outline",
  size = "sm",
  block,
  children,
  style,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--sm-space-2)",
        font: "inherit",
        fontWeight: 500,
        borderRadius: "var(--sm-radius-md)",
        border: "1px solid",
        cursor: disabled ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
        transition: "background var(--sm-transition-fast), box-shadow var(--sm-transition-fast)",
        opacity: disabled ? 0.5 : undefined,
        width: block ? "100%" : undefined,
        ...variantStyles[variant],
        ...sizeStyles[size],
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
