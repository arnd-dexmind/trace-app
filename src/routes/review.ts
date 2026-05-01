import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { db } from "../lib/db.js";
import { sendApiError } from "../lib/errors.js";
import { createAuthMiddleware } from "../lib/auth.js";
import { isUuid } from "../lib/validation.js";
import type { PaginatedResult } from "../data.js";
import {
  listReviewQueue,
  getReviewTask,
  processReviewAction,
  processBulkActions,
} from "../data.js";

export const reviewRouter = Router();

reviewRouter.use(createAuthMiddleware());

function respondPaginated<T>(res: Response, result: PaginatedResult<T>, req: Request) {
  const hasPagination = "cursor" in req.query || "limit" in req.query;
  if (hasPagination) {
    res.status(200).json(result);
  } else {
    res.status(200).json(result.data);
  }
}

function requireUuidParams(...names: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    for (const name of names) {
      const val = req.params[name];
      if (val && !isUuid(val)) {
        sendApiError(res, 400, "BAD_REQUEST", `Invalid ${name} format`);
        return;
      }
    }
    next();
  };
}

// ── Review Queue ──────────────────────────────────────────────────────────────

reviewRouter.get("/queue", async (req, res) => {
  const status =
    typeof req.query.status === "string" ? req.query.status : undefined;
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : undefined;

  const result = await listReviewQueue(db, res.locals.tenantId, status, cursor, limit);
  respondPaginated(res, result, req);
});

reviewRouter.get("/queue/:taskId", async (req, res) => {
  const task = await getReviewTask(db, req.params.taskId, res.locals.tenantId);
  if (!task) {
    sendApiError(res, 404, "NOT_FOUND", "Review task not found");
    return;
  }
  res.status(200).json(task);
});

// ── Review Actions ────────────────────────────────────────────────────────────

const VALID_ACTIONS = ["accept", "reject", "merge", "relabel"];

reviewRouter.post("/:taskId/actions", requireUuidParams("taskId"), async (req, res) => {
  const actionType = req.body?.actionType;
  if (!actionType || !VALID_ACTIONS.includes(actionType)) {
    sendApiError(
      res,
      400,
      "BAD_REQUEST",
      "actionType must be accept, reject, merge, or relabel",
    );
    return;
  }

  if ((actionType === "accept" || actionType === "merge" || actionType === "reject") && !req.body?.observationId) {
    sendApiError(res, 400, "BAD_REQUEST", "observationId is required for this action");
    return;
  }

  if (actionType === "relabel" && !req.body?.newLabel) {
    sendApiError(res, 400, "BAD_REQUEST", "newLabel is required for relabel");
    return;
  }

  const result = await processReviewAction(db, {
    taskId: req.params.taskId,
    tenantId: res.locals.tenantId,
    actionType,
    observationId: req.body?.observationId,
    itemId: req.body?.itemId,
    previousLabel: req.body?.previousLabel,
    newLabel: req.body?.newLabel,
    note: req.body?.note,
  });

  if (!result) {
    sendApiError(res, 404, "NOT_FOUND", "Review task not found");
    return;
  }

  if (result.error) {
    sendApiError(res, 400, "BAD_REQUEST", result.error);
    return;
  }

  res.status(201).json(result.action);
});

// ── Bulk Actions ───────────────────────────────────────────────────────────────

reviewRouter.post("/bulk", async (req, res) => {
  const { itemIds, action } = req.body || {};
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    sendApiError(res, 400, "BAD_REQUEST", "itemIds must be a non-empty array");
    return;
  }
  if (action !== "accept" && action !== "reject") {
    sendApiError(res, 400, "BAD_REQUEST", "action must be accept or reject");
    return;
  }

  const results = await processBulkActions(db, {
    tenantId: res.locals.tenantId,
    itemIds,
    action,
  });

  res.status(200).json({ results });
});
