import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../lib/db.js";
import { sendApiError } from "../lib/errors.js";
import { createAuthMiddleware } from "../lib/auth.js";
import { compareWalkthroughs } from "../data.js";

export const comparisonRouter = Router();

comparisonRouter.use(createAuthMiddleware());

comparisonRouter.get("/walkthroughs", async (req: Request, res: Response) => {
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
