import express from "express";
import { db, ensureDatabaseReady } from "./lib/db.js";
import { createTraceRecord, listTraceRecords } from "./traces.js";

type ApiErrorCode = "BAD_REQUEST" | "NOT_FOUND" | "INTERNAL_ERROR";

class ApiError extends Error {
  status: number;
  code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function createRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sendApiError(
  res: express.Response,
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

function parseTenantId(raw: string | undefined) {
  const value = (raw || "").trim();
  if (!value) {
    return null;
  }
  if (!/^[a-zA-Z0-9_-]{2,64}$/.test(value)) {
    return null;
  }
  return value;
}

function renderPage() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>trace-app</title>
    <style>
      body { background: #fff; color: #111; font-family: ui-sans-serif, system-ui, sans-serif; margin: 2rem; max-width: 52rem; }
      form { display: grid; gap: 0.5rem; margin-bottom: 1rem; }
      input, textarea, button { font: inherit; padding: 0.5rem; }
      li { margin-bottom: 0.75rem; }
      .muted { color: #666; }
    </style>
  </head>
  <body>
    <h1>Trace Records</h1>
    <form id="trace-form">
      <input id="title" name="title" placeholder="Title" required />
      <textarea id="body" name="body" placeholder="Optional details"></textarea>
      <button type="submit">Create trace</button>
    </form>
    <p class="muted" id="status"></p>
    <ul id="trace-list"></ul>
    <script>
      async function loadTraces() {
        const res = await fetch('/api/traces', {
          headers: { 'x-tenant-id': 'demo' },
        });
        const traces = await res.json();
        const list = document.getElementById('trace-list');
        list.innerHTML = '';
        traces.forEach((trace) => {
          const li = document.createElement('li');
          const body = trace.body ? '<div>' + trace.body + '</div>' : '';
          li.innerHTML =
            '<strong>' + trace.title + '</strong>' +
            body +
            '<div class="muted">' + new Date(trace.createdAt).toLocaleString() + '</div>';
          list.appendChild(li);
        });
      }

      document.getElementById('trace-form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const status = document.getElementById('status');
        status.textContent = 'Saving...';
        const payload = {
          title: document.getElementById('title').value,
          body: document.getElementById('body').value,
        };

        const res = await fetch('/api/traces', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-tenant-id': 'demo' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          status.textContent = 'Failed to create trace';
          return;
        }

        document.getElementById('trace-form').reset();
        status.textContent = 'Trace created';
        await loadTraces();
      });

      loadTraces().catch(() => {
        const status = document.getElementById('status');
        status.textContent = 'Failed to load traces';
      });
    </script>
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

  app.get("/api/traces", async (req, res) => {
    const tenantId = parseTenantId(req.header("x-tenant-id"));
    if (!tenantId) {
      sendApiError(res, 400, "BAD_REQUEST", "x-tenant-id header is required");
      return;
    }

    await ensureDatabaseReady();
    const traces = await listTraceRecords(db, tenantId);
    res.status(200).json(traces);
  });

  app.post("/api/traces", async (req, res) => {
    const tenantId = parseTenantId(req.header("x-tenant-id"));
    if (!tenantId) {
      sendApiError(res, 400, "BAD_REQUEST", "x-tenant-id header is required");
      return;
    }

    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const body = typeof req.body?.body === "string" ? req.body.body : undefined;

    if (!title) {
      sendApiError(res, 400, "BAD_REQUEST", "title is required");
      return;
    }

    await ensureDatabaseReady();
    const trace = await createTraceRecord(db, { tenantId, title, body });
    res.status(201).json(trace);
  });

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
