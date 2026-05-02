// Patch Express 4 Router methods so every route handler is auto-wrapped to
// forward async rejections to next(err). Import once at startup.
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { Router as ExpressRouter } from "express";

type Handler = (req: Request, res: Response, next: NextFunction) => unknown;

function wrapAsync(fn: unknown): Handler {
  if (typeof fn !== "function") return fn as Handler;
  const h = fn as (...args: unknown[]) => unknown;
  return function (this: unknown, req: Request, res: Response, next: NextFunction) {
    try {
      const result = h.apply(this, [req, res, next]);
      if (result instanceof Promise) {
        result.catch(next);
      }
    } catch (err) {
      next(err);
    }
  };
}

const origUse = ExpressRouter.prototype.use;

// Override router.use to auto-wrap all handlers (catches .use() directly)
ExpressRouter.prototype.use = function (this: ReturnType<typeof ExpressRouter>, ...args: unknown[]) {
  const wrapped = args.map((a) => (typeof a === "function" ? wrapAsync(a) : a));
  return origUse.apply(this, wrapped as Parameters<typeof origUse>);
};

// Override router.route so .get/.post/.put/.patch/.delete handlers are also wrapped
const origRoute = ExpressRouter.prototype.route;
ExpressRouter.prototype.route = function (this: ReturnType<typeof ExpressRouter>, path: string) {
  const route = origRoute.call(this, path);
  const methods = ["get", "post", "put", "patch", "delete", "head", "options"] as const;
  for (const method of methods) {
    const orig = route[method] as (...handlers: RequestHandler[]) => typeof route;
    route[method] = function (this: typeof route, ...handlers: RequestHandler[]) {
      return orig.apply(this, handlers.map((h) => wrapAsync(h) as RequestHandler));
    };
  }
  return route;
};

export {};
