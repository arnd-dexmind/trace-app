import type { Response, Request, NextFunction, RequestHandler } from "express";
import { ValidationError } from "./validation.js";

export type ApiErrorCode = "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT" | "NOT_IMPLEMENTED" | "INTERNAL_ERROR" | "UNSUPPORTED_MEDIA_TYPE";

export class UserNotFoundError extends Error {
  constructor() {
    super("User not found");
    this.name = "UserNotFoundError";
  }
}

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

export function withErrorTracking(handler: RequestHandler): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res, next);
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        sendApiError(res, 401, "NOT_FOUND", "User not found");
        return;
      }
      if (err instanceof ValidationError) {
        sendApiError(res, 400, "BAD_REQUEST", `${err.field} ${err.detail}`);
        return;
      }
      next(err);
    }
  };
}
