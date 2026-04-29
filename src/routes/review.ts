import { Router } from "express";
import { db } from "../lib/db.js";
import { requireTenant, sendApiError } from "../lib/errors.js";
import {
  listReviewQueue,
  getReviewTask,
  processReviewAction,
} from "../data.js";

export const reviewRouter = Router();

reviewRouter.use(requireTenant);

// ── Review Queue ──────────────────────────────────────────────────────────────

reviewRouter.get("/queue", async (req, res) => {
  const status =
    typeof req.query.status === "string" ? req.query.status : undefined;

  const tasks = await listReviewQueue(db, res.locals.tenantId, status);
  res.status(200).json(tasks);
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

reviewRouter.post("/:taskId/actions", async (req, res) => {
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
