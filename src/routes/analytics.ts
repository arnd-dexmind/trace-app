import { Router } from "express";
import { db } from "../lib/db.js";
import { sendApiError } from "../lib/errors.js";
import { createAuthMiddleware } from "../lib/auth.js";
import { getAnalytics } from "../lib/analytics.js";

export const analyticsRouter = Router();

analyticsRouter.use(createAuthMiddleware());

analyticsRouter.get("/", async (req, res) => {
  const daysParam = typeof req.query.days === "string" ? parseInt(req.query.days, 10) : 30;
  const days = [7, 30, 90].includes(daysParam) ? daysParam : 30;

  try {
    const snapshot = await getAnalytics(db, { tenantId: res.locals.tenantId, days });
    res.status(200).json(snapshot);
  } catch (err) {
    console.error(JSON.stringify({
      level: "error",
      requestId: res.locals.requestId,
      message: "Analytics query failed",
      detail: err instanceof Error ? err.message : String(err),
    }));
    sendApiError(res, 500, "INTERNAL_ERROR", "Failed to load analytics");
  }
});
