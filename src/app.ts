import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { ApiError, createRequestId, sendApiError, requireTenant } from "./lib/errors.js";
import { db } from "./lib/db.js";
import { upload, UPLOADS_DIR } from "./lib/upload.js";
import { getMediaAsset } from "./data.js";
import multer from "multer";
import { spacesRouter } from "./routes/spaces.js";
import { reviewRouter } from "./routes/review.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = join(__dirname, "..", "client", "dist");
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

  app.use(express.json({ limit: "1mb" }));

  app.get("/", (_req, res) => {
    res.type("html").send(renderPage());
  });

  app.get("/api/health", async (_req, res) => {
    try {
      await db.$queryRaw`SELECT 1`;
      res.status(200).json({ status: "ok", db: "connected" });
    } catch {
      res.status(503).json({ status: "degraded", db: "disconnected" });
    }
  });

  app.get("/api/media-assets/:id", requireTenant, async (req, res) => {
    const asset = await getMediaAsset(db, req.params.id, res.locals.tenantId);
    if (!asset) {
      sendApiError(res, 404, "NOT_FOUND", "Media asset not found");
      return;
    }
    res.status(200).json(asset);
  });

  app.use("/uploads", express.static(UPLOADS_DIR));

  app.post("/api/uploads", requireTenant, upload.single("file"), (req, res) => {
    if (!req.file) {
      sendApiError(res, 400, "BAD_REQUEST", "No file provided");
      return;
    }
    res.status(201).json({
      url: `/uploads/${req.file.filename}`,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
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

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        sendApiError(res, 413, "BAD_REQUEST", "File too large (max 50MB)");
        return;
      }
      sendApiError(res, 400, "BAD_REQUEST", err.message);
      return;
    }

    if (err instanceof Error && "type" in err && (err as Record<string, unknown>).type === "entity.too.large") {
      sendApiError(res, 413, "BAD_REQUEST", "Request body too large (max 1MB)");
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
