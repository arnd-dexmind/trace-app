import { useState, useEffect, useRef, useCallback } from "react";
import { getProcessingState, type ProcessingJob } from "../api";
import type { ProcessingStatus } from "../components/ui/StatusBadge";

const POLL_INTERVAL = 3000;

export interface ProcessingStatusResult {
  status: ProcessingStatus;
  progress: number;
  jobs: ProcessingJob[];
  elapsed: number;
  error: string | null;
  refresh: () => void;
}

export function useProcessingStatus(walkthroughId: string | undefined): ProcessingStatusResult {
  const [status, setStatus] = useState<ProcessingStatus>("pending");
  const [progress, setProgress] = useState(0);
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const statusRef = useRef<ProcessingStatus>("pending");

  const fetchState = useCallback(async (id: string) => {
    try {
      const state = await getProcessingState(id);
      const latestJobs = state.jobs;
      setJobs(latestJobs);

      const running = latestJobs.filter((j) => j.status === "running").length;
      const completed = latestJobs.filter((j) => j.status === "completed").length;
      const dead = latestJobs.filter((j) => j.status === "dead").length;
      const total = latestJobs.length || 1;

      if (dead > 0) {
        setStatus("failed");
        setProgress(100);
        statusRef.current = "failed";
        return;
      }

      if (state.done) {
        setStatus("completed");
        setProgress(100);
        statusRef.current = "completed";
        return;
      }

      const activeProgress = running > 0 ? (running / total) * 0.3 : 0;
      const doneProgress = completed / total;
      setProgress(Math.round((doneProgress + activeProgress) * 100));

      if (running > 0 || latestJobs.some((j) => j.status === "pending")) {
        setStatus("processing");
        statusRef.current = "processing";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch processing state");
    }
  }, []);

  const refresh = useCallback(() => {
    if (!walkthroughId) return;
    setError(null);
    startedAtRef.current = Date.now();
    setElapsed(0);
    fetchState(walkthroughId);
  }, [walkthroughId, fetchState]);

  useEffect(() => {
    if (!walkthroughId) return;

    startedAtRef.current = Date.now();
    setStatus("pending");
    setProgress(0);
    setJobs([]);
    setError(null);
    setElapsed(0);
    statusRef.current = "pending";

    fetchState(walkthroughId);

    tickRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);

    function poll() {
      if (statusRef.current === "completed" || statusRef.current === "failed") return;
      fetchState(walkthroughId!).then(() => {
        if (statusRef.current === "completed" || statusRef.current === "failed") return;
        pollRef.current = setTimeout(poll, POLL_INTERVAL);
      });
    }

    pollRef.current = setTimeout(poll, POLL_INTERVAL);

    return () => {
      statusRef.current = "completed"; // prevent further polls on cleanup
      if (pollRef.current) clearTimeout(pollRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [walkthroughId, fetchState]);

  return { status, progress, jobs, elapsed, error, refresh };
}
