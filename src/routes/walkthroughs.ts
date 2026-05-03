import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../lib/db.js";
import { sendApiError } from "../lib/errors.js";
import { createAuthMiddleware } from "../lib/auth.js";
import {
  listAllWalkthroughs,
  getWalkthroughDetail,
  createWalkthrough,
  updateWalkthroughStatus,
  compareWalkthroughs,
} from "../data.js";

export const walkthroughsRouter = Router();

walkthroughsRouter.use(createAuthMiddleware());

// ── Compare (must be before /:id to avoid route conflict) ────────────────────

walkthroughsRouter.get("/compare", async (req: Request, res: Response) => {
  const baselineId = typeof req.query.baseline === "string" ? req.query.baseline : null;
  const comparisonId = typeof req.query.comparison === "string" ? req.query.comparison : null;

  if (!baselineId || !comparisonId) {
    sendApiError(res, 400, "BAD_REQUEST", "baseline and comparison query params are required");
    return;
  }

  const result = await compareWalkthroughs(db, baselineId, comparisonId, res.locals.tenantId);
  if (!result) {
    sendApiError(res, 404, "NOT_FOUND", "One or both walkthroughs not found");
    return;
  }

  res.status(200).json(result);
});

// ── List ─────────────────────────────────────────────────────────────────────

walkthroughsRouter.get("/", async (req: Request, res: Response) => {
  const spaceId = typeof req.query.spaceId === "string" ? req.query.spaceId : undefined;
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : undefined;

  const result = await listAllWalkthroughs(db, res.locals.tenantId, {
    spaceId,
    cursor,
    limit,
  });

  const hasPagination = "cursor" in req.query || "limit" in req.query;
  if (hasPagination) {
    res.status(200).json(result);
  } else {
    res.status(200).json(result.data);
  }
});

// ── Create ───────────────────────────────────────────────────────────────────

walkthroughsRouter.post("/", async (req: Request, res: Response) => {
  const spaceId = typeof req.body?.spaceId === "string" ? req.body.spaceId.trim() : "";
  if (!spaceId) {
    sendApiError(res, 400, "BAD_REQUEST", "spaceId is required");
    return;
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : undefined;
  const metadata = req.body?.metadata ?? undefined;

  const walkthrough = await createWalkthrough(db, {
    spaceId,
    tenantId: res.locals.tenantId,
    name,
    metadata,
  });
  res.status(201).json(walkthrough);
});

// ── Get Detail ───────────────────────────────────────────────────────────────

walkthroughsRouter.get("/:id", async (req: Request, res: Response) => {
  const wt = await getWalkthroughDetail(db, req.params.id, res.locals.tenantId);
  if (!wt) {
    sendApiError(res, 404, "NOT_FOUND", "Walkthrough not found");
    return;
  }
  res.status(200).json(wt);
});

// ── Update Status ────────────────────────────────────────────────────────────

walkthroughsRouter.patch("/:id", async (req: Request, res: Response) => {
  const status = typeof req.body?.status === "string" ? req.body.status : "";
  if (!["uploaded", "processing", "awaiting_review", "applied", "completed", "failed"].includes(status)) {
    sendApiError(res, 400, "BAD_REQUEST", "Invalid status value");
    return;
  }

  const wt = await updateWalkthroughStatus(db, req.params.id, res.locals.tenantId, status);
  if (!wt) {
    sendApiError(res, 404, "NOT_FOUND", "Walkthrough not found");
    return;
  }
  res.status(200).json(wt);
});
