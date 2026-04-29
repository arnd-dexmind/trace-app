import type { Request, Response, NextFunction } from "express";

export type ApiErrorCode = "BAD_REQUEST" | "NOT_FOUND" | "INTERNAL_ERROR";

export class ApiError extends Error {
  status: number;
  code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function createRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function sendApiError(
  res: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
) {
  res.status(status).json({
    error: {
      code,
      message,
      requestId: String(res.locals.requestId || ""),
    },
  });
}

export function parseTenantId(raw: string | undefined) {
  const value = (raw || "").trim();
  if (!value) return null;
  if (!/^[a-zA-Z0-9_-]{2,64}$/.test(value)) return null;
  return value;
}

export function requireTenant(req: Request, res: Response, next: NextFunction) {
  const tenantId = parseTenantId(req.header("x-tenant-id"));
  if (!tenantId) {
    sendApiError(res, 400, "BAD_REQUEST", "x-tenant-id header is required");
    return;
  }
  res.locals.tenantId = tenantId;
  next();
}
