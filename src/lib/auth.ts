import type { Request, Response, NextFunction, RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { db } from "./db.js";
import { sendApiError, UserNotFoundError } from "./errors.js";

const CLERK_ENABLED = Boolean(process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY);

function parseTenantId(raw: string | undefined) {
  const value = (raw || "").trim();
  if (!value) return null;
  if (!/^[a-zA-Z0-9_-]{2,64}$/.test(value)) return null;
  return value;
}

async function ensureUser(clerkId: string) {
  const existing = await db.user.findUnique({ where: { clerkId } });
  if (existing) return existing;
  return db.user.create({ data: { clerkId } });
}

async function ensureTenantAccess(userId: string, tenantId: string) {
  const existing = await db.userTenant.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
  });
  if (existing) return true;
  await db.userTenant.create({ data: { userId, tenantId, role: "admin" } });
  return true;
}

export async function requireUser(clerkId: string) {
  const user = await db.user.findUnique({ where: { clerkId } });
  if (!user) throw new UserNotFoundError();
  return user;
}

export function createAuthMiddleware(): RequestHandler {
  if (!CLERK_ENABLED) {
    // Fallback to tenant-only auth for dev/test
    return (req: Request, res: Response, next: NextFunction) => {
      const tenantId = parseTenantId(req.header("x-tenant-id"));
      if (!tenantId) {
        sendApiError(res, 400, "BAD_REQUEST", "x-tenant-id header is required");
        return;
      }
      res.locals.tenantId = tenantId;
      res.locals.userId = "dev-user";
      next();
    };
  }

  return async (req: Request, res: Response, next: NextFunction) => {
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

    try {
      const user = await ensureUser(auth.userId);
      await ensureTenantAccess(user.id, tenantId);

      res.locals.userId = user.id;
      res.locals.clerkId = auth.userId;
      res.locals.tenantId = tenantId;
      next();
    } catch {
      sendApiError(res, 500, "INTERNAL_ERROR", "Auth lookup failed");
    }
  };
}
