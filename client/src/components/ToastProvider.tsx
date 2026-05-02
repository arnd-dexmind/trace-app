import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type ToastVariant = "error" | "success" | "info";

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (message: string, variant?: ToastVariant) => void;
  removeToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;
const TOAST_DURATION = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, variant: ToastVariant = "error") => {
      const id = nextId++;
      setToasts((prev) => [...prev.slice(-4), { id, message, variant }]);
      setTimeout(() => removeToast(id), TOAST_DURATION);
    },
    [removeToast],
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div style={toastContainerStyle} role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            style={toastStyle(toast.variant)}
            onClick={() => removeToast(toast.id)}
          >
            <span style={toastIconStyle(toast.variant)}>
              {toast.variant === "success" ? "✓" : toast.variant === "error" ? "✗" : "i"}
            </span>
            <span style={toastMsgStyle}>{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const toastContainerStyle: React.CSSProperties = {
  position: "fixed",
  bottom: "var(--sm-space-4)",
  right: "var(--sm-space-4)",
  zIndex: 9999,
  display: "flex",
  flexDirection: "column",
  gap: "var(--sm-space-2)",
  maxWidth: 380,
};

function toastStyle(variant: ToastVariant): React.CSSProperties {
  const bg =
    variant === "error"
      ? "var(--sm-danger-500)"
      : variant === "success"
        ? "var(--sm-success-500, #16a34a)"
        : "var(--sm-brand-600)";
  return {
    background: bg,
    color: "#fff",
    padding: "var(--sm-space-3) var(--sm-space-4)",
    borderRadius: "var(--sm-radius-md)",
    fontSize: "var(--sm-text-sm)",
    display: "flex",
    alignItems: "center",
    gap: "var(--sm-space-2)",
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    animation: "toastSlideIn 0.25s ease-out",
  };
}

function toastIconStyle(variant: ToastVariant): React.CSSProperties {
  return {
    width: 20,
    height: 20,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.25)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
  };
}

const toastMsgStyle: React.CSSProperties = {
  flex: 1,
  lineHeight: 1.4,
};
