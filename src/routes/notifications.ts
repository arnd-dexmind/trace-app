import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db } from "../lib/db.js";
import { sendApiError, withErrorTracking } from "../lib/errors.js";
import { requireUser } from "../lib/auth.js";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getNotificationPreferences,
  updateNotificationPreferences,
} from "../data.js";

export const notificationsRouter = Router();

const CLERK_ENABLED = Boolean(process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY);

function parseTenantId(raw: string | undefined) {
  const value = (raw || "").trim();
  if (!value) return null;
  if (!/^[a-zA-Z0-9_-]{2,64}$/.test(value)) return null;
  return value;
}

const notificationAuth: Router = Router();

if (!CLERK_ENABLED) {
  notificationAuth.use((req: Request, res: Response, next: NextFunction) => {
    const tenantId = parseTenantId(req.header("x-tenant-id"));
    if (!tenantId) {
      sendApiError(res, 400, "BAD_REQUEST", "x-tenant-id header is required");
      return;
    }
    res.locals.tenantId = tenantId;
    res.locals.userId = "dev-user";
    next();
  });
} else {
  notificationAuth.use(
    withErrorTracking(async (req: Request, res: Response, next: NextFunction) => {
      const auth = getAuth(req);
      if (!auth.userId) {
        sendApiError(res, 401, "BAD_REQUEST", "Authentication required");
        return;
      }
      const tenantId = parseTenantId(req.header("x-tenant-id"));
      if (!tenantId) {
        sendApiError(res, 400, "BAD_REQUEST", "x-tenant-id header is required");
        return;
      }
      const user = await requireUser(auth.userId);
      res.locals.userId = user.id;
      res.locals.clerkId = auth.userId;
      res.locals.tenantId = tenantId;
      next();
    }),
  );
}

notificationsRouter.use(notificationAuth);

// GET /api/notifications
notificationsRouter.get(
  "/",
  withErrorTracking(async (req, res) => {
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : undefined;
    const result = await getNotifications(db, res.locals.userId, res.locals.tenantId, cursor, limit);
    const hasPagination = "cursor" in req.query || "limit" in req.query;
    if (hasPagination) {
      res.status(200).json(result);
    } else {
      res.status(200).json(result.data);
    }
  }),
);

// PATCH /api/notifications/:id/read
notificationsRouter.patch(
  "/:id/read",
  withErrorTracking(async (req, res) => {
    const updated = await markNotificationRead(db, req.params.id, res.locals.userId);
    if (!updated) {
      sendApiError(res, 404, "NOT_FOUND", "Notification not found");
      return;
    }
    res.status(200).json(updated);
  }),
);

// PATCH /api/notifications/read-all
notificationsRouter.patch(
  "/read-all",
  withErrorTracking(async (req, res) => {
    const count = await markAllNotificationsRead(db, res.locals.userId);
    res.status(200).json({ markedRead: count });
  }),
);

// GET /api/notifications/preferences
notificationsRouter.get(
  "/preferences",
  withErrorTracking(async (req, res) => {
    const prefs = await getNotificationPreferences(db, res.locals.userId, res.locals.tenantId);
    res.status(200).json(prefs);
  }),
);

// PUT /api/notifications/preferences
notificationsRouter.put(
  "/preferences",
  withErrorTracking(async (req, res) => {
    const body = req.body || {};
    const updates: Record<string, boolean> = {};
    const allowed = ["inApp", "email", "walkthroughComplete", "newIssue", "issueResolved"];
    for (const key of allowed) {
      if (typeof body[key] === "boolean") updates[key] = body[key];
    }
    if (Object.keys(updates).length === 0) {
      sendApiError(res, 400, "BAD_REQUEST", "At least one preference field is required");
      return;
    }
    const prefs = await updateNotificationPreferences(db, res.locals.userId, res.locals.tenantId, updates);
    res.status(200).json(prefs);
  }),
);
