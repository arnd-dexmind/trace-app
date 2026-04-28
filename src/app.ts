import express from "express";
import { db } from "./lib/db.js";
import { createTraceRecord, listTraceRecords } from "./traces.js";

function renderPage() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>trace-app</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 2rem; max-width: 52rem; }
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
        const res = await fetch('/api/traces');
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
          headers: { 'content-type': 'application/json' },
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

  app.use(express.json());

  app.get("/", (_req, res) => {
    res.type("html").send(renderPage());
  });

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/api/traces", async (_req, res) => {
    const traces = await listTraceRecords(db);
    res.status(200).json(traces);
  });

  app.post("/api/traces", async (req, res) => {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const body = typeof req.body?.body === "string" ? req.body.body : undefined;

    if (!title) {
      res.status(400).json({ error: "title is required" });
      return;
    }

    const trace = await createTraceRecord(db, { title, body });
    res.status(201).json(trace);
  });

  return app;
}
