import { useState, useCallback, useEffect } from "react";
import { TOUR_STEPS, type TourStep } from "../hooks/useOnboarding";
import { Button } from "./ui/Button";

interface GuidedTourProps {
  currentStep: number;
  onNext: (step: number) => void;
  onDismiss: () => void;
  onFinish: () => void;
}

export function GuidedTour({ currentStep, onNext, onDismiss, onFinish }: GuidedTourProps) {
  const [visible, setVisible] = useState(true);
  const step = TOUR_STEPS[currentStep];

  const handleNext = useCallback(() => {
    if (currentStep >= TOUR_STEPS.length - 1) {
      setVisible(false);
      onFinish();
    } else {
      onNext(currentStep + 1);
    }
  }, [currentStep, onNext, onFinish]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    onDismiss();
  }, [onDismiss]);

  const handleSkip = useCallback(() => {
    setVisible(false);
    onFinish();
  }, [onFinish]);

  // Reset visibility when step changes
  useEffect(() => {
    setVisible(true);
  }, [currentStep]);

  if (!visible || !step) return null;

  return (
    <>
      {/* Backdrop */}
      <div style={backdrop} onClick={handleDismiss} />

      {/* Highlight target */}
      <div style={spotlightStyle} />

      {/* Tooltip */}
      <div style={{ ...tooltipStyle, ...tooltipPosition(step.position) }}>
        <div style={stepBadge}>
          {currentStep + 1} of {TOUR_STEPS.length}
        </div>
        <h3 style={stepTitle}>{step.title}</h3>
        <p style={stepDesc}>{step.description}</p>

        <div style={stepActions}>
          <button onClick={handleSkip} style={skipButton}>
            Skip tour
          </button>
          <div style={{ display: "flex", gap: "var(--sm-space-2)" }}>
            {currentStep > 0 && (
              <Button variant="ghost" size="sm" onClick={() => onNext(currentStep - 1)}>
                Back
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={handleNext}>
              {currentStep < TOUR_STEPS.length - 1 ? "Next" : "Finish"}
            </Button>
          </div>
        </div>

        {/* Progress dots */}
        <div style={dots}>
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                ...dot,
                background: i === currentStep ? "var(--sm-brand-600)" : "var(--sm-border-default)",
                width: i === currentStep ? 20 : 8,
              }}
            />
          ))}
        </div>
      </div>
    </>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.5)",
  zIndex: 1000,
};

const spotlightStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  width: "100%",
  height: 56,
  zIndex: 1001,
  pointerEvents: "none",
};

const tooltipStyle: React.CSSProperties = {
  position: "fixed",
  top: 80,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 1002,
  background: "var(--sm-surface-card)",
  borderRadius: "var(--sm-radius-lg)",
  boxShadow: "var(--sm-shadow-xl)",
  padding: "var(--sm-space-5)",
  maxWidth: 380,
  width: "calc(100% - var(--sm-space-8))",
};

function tooltipPosition(pos: TourStep["position"]): React.CSSProperties {
  switch (pos) {
    case "bottom":
      return { top: 80 };
    case "top":
      return { bottom: 80 };
    case "left":
      return { left: "var(--sm-space-4)", top: "50%", transform: "translateY(-50%)" };
    case "right":
      return { right: "var(--sm-space-4)", top: "50%", transform: "translateY(-50%)" };
    default:
      return { top: 80 };
  }
}

const stepBadge: React.CSSProperties = {
  fontSize: "var(--sm-text-xs)",
  color: "var(--sm-text-tertiary)",
  marginBottom: "var(--sm-space-2)",
};

const stepTitle: React.CSSProperties = {
  fontSize: "var(--sm-text-base)",
  fontWeight: 600,
  margin: "0 0 var(--sm-space-1)",
  color: "var(--sm-text-primary)",
};

const stepDesc: React.CSSProperties = {
  fontSize: "var(--sm-text-sm)",
  color: "var(--sm-text-secondary)",
  margin: 0,
  lineHeight: 1.5,
};

const stepActions: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: "var(--sm-space-4)",
};

const skipButton: React.CSSProperties = {
  background: "none",
  border: "none",
  fontSize: "var(--sm-text-xs)",
  color: "var(--sm-text-tertiary)",
  cursor: "pointer",
  textDecoration: "underline",
  padding: 0,
};

const dots: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  gap: 4,
  marginTop: "var(--sm-space-4)",
};

const dot: React.CSSProperties = {
  height: 8,
  borderRadius: 4,
  transition: "all var(--sm-transition-fast)",
  minWidth: 8,
};
