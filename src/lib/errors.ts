import type { Response } from "express";

export type ApiErrorCode = "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT" | "NOT_IMPLEMENTED" | "INTERNAL_ERROR";

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
