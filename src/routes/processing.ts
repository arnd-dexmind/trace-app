import { Router } from "express";
import { db } from "../lib/db.js";
import { sendApiError } from "../lib/errors.js";
import { createAuthMiddleware } from "../lib/auth.js";
import { getJobs, getJob, getProcessingMetrics } from "../lib/job-queue.js";
import { processBatch, getWalkthroughProcessingState } from "../lib/processing-orchestrator.js";

export const processingRouter = Router();

processingRouter.use(createAuthMiddleware());

// ── Job listing ──────────────────────────────────────────────────────────────

processingRouter.get("/jobs", async (req, res) => {
  const walkthroughId =
    typeof req.query.walkthroughId === "string" ? req.query.walkthroughId : undefined;

  if (!walkthroughId) {
    sendApiError(res, 400, "BAD_REQUEST", "walkthroughId query param is required");
    return;
  }

  const jobs = await getJobs(db, walkthroughId, res.locals.tenantId);
  res.status(200).json(jobs);
});

// ── Single job ───────────────────────────────────────────────────────────────

processingRouter.get("/jobs/:id", async (req, res) => {
  const job = await getJob(db, req.params.id, res.locals.tenantId);
  if (!job) {
    sendApiError(res, 404, "NOT_FOUND", "Job not found");
    return;
  }
  res.status(200).json(job);
});

// ── Walkthrough processing state ─────────────────────────────────────────────

processingRouter.get("/walkthroughs/:walkthroughId/state", async (req, res) => {
  const state = await getWalkthroughProcessingState(
    db,
    req.params.walkthroughId,
    res.locals.tenantId,
  );
  res.status(200).json(state);
});

// ── Process tick (triggered by cron or manual invocation) ────────────────────

processingRouter.post("/tick", async (req, res) => {
  void req.body;
  const result = await processBatch(db, res.locals.tenantId);
  res.status(200).json(result);
});

// ── Metrics ──────────────────────────────────────────────────────────────────

processingRouter.get("/metrics", async (req, res) => {
  void req.query;
  const metrics = await getProcessingMetrics(db, res.locals.tenantId);
  res.status(200).json(metrics);
});
