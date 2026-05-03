import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "../lib/db.js";
import { sendApiError } from "../lib/errors.js";
import { createAuthMiddleware } from "../lib/auth.js";

export const settingsRouter = Router();
const requireAuth = createAuthMiddleware();
settingsRouter.use(requireAuth);

const CLERK_ENABLED = Boolean(process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY);

// GET /api/settings/profile
settingsRouter.get("/profile", async (req, res) => {
  const user = await db.user.findUnique({ where: { id: res.locals.userId } });
  if (!user) {
    sendApiError(res, 404, "NOT_FOUND", "User not found");
    return;
  }
  res.status(200).json(user);
});

// PUT /api/settings/profile
settingsRouter.put("/profile", async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : undefined;
  if (name !== undefined && name.length === 0) {
    sendApiError(res, 400, "BAD_REQUEST", "Name cannot be empty");
    return;
  }
  const data: Record<string, string> = {};
  if (name !== undefined) data.name = name;

  if (Object.keys(data).length === 0) {
    sendApiError(res, 400, "BAD_REQUEST", "No updatable fields provided");
    return;
  }

  const user = await db.user.update({ where: { id: res.locals.userId }, data });
  res.status(200).json(user);
});

// GET /api/settings/sessions
settingsRouter.get("/sessions", async (req, res) => {
  if (!CLERK_ENABLED) {
    res.status(200).json([]);
    return;
  }
  try {
    const clerk = getAuth(req);
    const clerkClient = (await import("@clerk/express")).clerkClient;
    const sessions = await clerkClient.sessions.getSessionList({ userId: clerk.userId! });
    res.status(200).json(
      sessions.data.map((s) => ({
        id: s.id,
        status: s.status,
        lastActiveAt: s.lastActiveAt,
        createdAt: s.createdAt,
        browser: null,
        os: null,
        current: s.id === clerk.sessionId,
      })),
    );
  } catch {
    sendApiError(res, 500, "INTERNAL_ERROR", "Failed to fetch sessions");
  }
});
