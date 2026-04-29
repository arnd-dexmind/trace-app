import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import { ApiError, createRequestId, sendApiError, requireTenant } from "./lib/errors.js";
import { db } from "./lib/db.js";
import { getMediaAsset } from "./data.js";
import { spacesRouter } from "./routes/spaces.js";
import { reviewRouter } from "./routes/review.js";

const CLIENT_DIST = join(import.meta.dirname, "..", "client", "dist");
const INDEX_PATH = join(CLIENT_DIST, "index.html");

function renderPage() {
  if (existsSync(INDEX_PATH)) {
    return readFileSync(INDEX_PATH, "utf-8");
  }
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Space Memory</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 2rem; max-width: 52rem; }
      .muted { color: #666; }
    </style>
  </head>
  <body>
    <h1>Space Memory</h1>
    <p class="muted">API available at /api/spaces and /api/review</p>
  </body>
</html>`;
}

export function createApp() {
  const app = express();

  app.use((req, res, next) => {
    const requestId = req.header("x-request-id") || createRequestId();
    const startedAt = process.hrtime.bigint();
    res.setHeader("x-request-id", requestId);
    res.locals.requestId = requestId;

    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const log = {
        level: "info",
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
      };
      console.log(JSON.stringify(log));
    });

    next();
  });

  app.use(express.json());

  app.get("/", (_req, res) => {
    res.type("html").send(renderPage());
  });

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/api/media-assets/:id", requireTenant, async (req, res) => {
    const asset = await getMediaAsset(db, req.params.id, res.locals.tenantId);
    if (!asset) {
      sendApiError(res, 404, "NOT_FOUND", "Media asset not found");
      return;
    }
    res.status(200).json(asset);
  });

  app.use("/api/spaces", spacesRouter);
  app.use("/api/review", reviewRouter);

  // Serve React SPA in production
  if (existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));

    // SPA fallback for client-side routes
    const spaRoutes = ["/review", "/items", "/repairs"];
    for (const route of spaRoutes) {
      app.get(route, (_req, res) => {
        res.type("html").send(renderPage());
      });
      app.get(`${route}/*`, (_req, res) => {
        res.type("html").send(renderPage());
      });
    }
  }

  app.use((req, _res, next) => {
    next(new ApiError(404, "NOT_FOUND", `No route for ${req.method} ${req.path}`));
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    void next;
    if (err instanceof ApiError) {
      sendApiError(res, err.status, err.code, err.message);
      return;
    }

    const requestId = String(res.locals.requestId || "");
    console.error(
      JSON.stringify({
        level: "error",
        requestId,
        message: err instanceof Error ? err.message : "Unexpected error",
      }),
    );
    sendApiError(res, 500, "INTERNAL_ERROR", "Internal server error");
  });

  return app;
}
