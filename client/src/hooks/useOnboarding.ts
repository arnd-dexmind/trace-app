import { useEffect, useState, useCallback } from "react";
import {
  getOnboardingStatus,
  updateTourStep,
  completeTour,
  dismissTour,
  seedSampleData,
  resetOnboarding,
  type OnboardingStatus,
  type SeedResult,
} from "../api";

export interface TourStep {
  target: string;
  title: string;
  description: string;
  position: "top" | "bottom" | "left" | "right";
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: "upload-nav",
    title: "Upload a Walkthrough",
    description: "Record or upload a video walkthrough of your space. The AI will detect items and repair issues automatically.",
    position: "bottom",
  },
  {
    target: "processing-nav",
    title: "Processing Pipeline",
    description: "After uploading, your walkthrough enters the AI processing pipeline. Each stage detects items, identifies changes, and flags repairs.",
    position: "bottom",
  },
  {
    target: "items-nav",
    title: "Inventory",
    description: "Browse your automatically catalogued items. Search by name, category, or browse by zone to find exactly what you need.",
    position: "bottom",
  },
  {
    target: "repairs-nav",
    title: "Repairs",
    description: "Track repair issues detected across walkthroughs. Prioritize, update status, and resolve them as you fix things.",
    position: "bottom",
  },
];

export function useOnboarding() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const s = await getOnboardingStatus();
      setStatus(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load onboarding status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const advanceStep = useCallback(async (step: number) => {
    try {
      const result = await updateTourStep(step);
      setStatus((prev) => prev ? { ...prev, ...result } : null);
    } catch {
      // Silently fail — onboarding is non-critical
    }
  }, []);

  const finishTour = useCallback(async () => {
    try {
      const result = await completeTour();
      setStatus((prev) => prev ? { ...prev, ...result } : null);
    } catch {
      // Silently fail
    }
  }, []);

  const dismiss = useCallback(async () => {
    try {
      const result = await dismissTour();
      setStatus((prev) => prev ? { ...prev, ...result } : null);
    } catch {
      // Silently fail
    }
  }, []);

  const seed = useCallback(async (): Promise<SeedResult | null> => {
    try {
      const result = await seedSampleData();
      setStatus((prev) => prev ? { ...prev, sampleDataSeeded: true } : null);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to seed sample data");
      return null;
    }
  }, []);

  const reset = useCallback(async () => {
    try {
      await resetOnboarding();
      setStatus({
        isFirstRun: true,
        tourCompleted: false,
        tourCurrentStep: 0,
        tourDismissed: false,
        sampleDataSeeded: false,
      });
    } catch {
      // Silently fail
    }
  }, []);

  return {
    status,
    loading,
    error,
    fetchStatus,
    advanceStep,
    finishTour,
    dismiss,
    seed,
    reset,
    steps: TOUR_STEPS,
    showTour: status && !status.tourCompleted && !status.tourDismissed && !status.isFirstRun,
    isFirstRun: status?.isFirstRun ?? false,
  };
}
