import test from "node:test";
import assert from "node:assert/strict";
import { unlinkSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "../src/app.js";

function url(port: number, path: string) {
  return `http://127.0.0.1:${port}${path}`;
}

// ── File upload ────────────────────────────────────────────────────────────

test("POST /api/uploads accepts image file", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const { port } = server.address() as { port: number };

    const form = new FormData();
    form.set("file", new Blob(["fake-jpeg-data"], { type: "image/jpeg" }), "test.jpg");

    const res = await fetch(url(port, "/api/uploads"), {
      method: "POST",
      headers: { "x-tenant-id": "upload-tenant" },
      body: form,
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(typeof body.url, "string");
    assert.match(body.url, /^\/uploads\//);
    assert.equal(body.mimetype, "image/jpeg");
    assert.ok(body.size > 0);

    // Clean up uploaded file
    try { unlinkSync(join(process.cwd(), "uploads", body.key)); } catch { /* ok */ }
  } finally {
    server.close();
  }
});

test("POST /api/uploads accepts PNG file", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const { port } = server.address() as { port: number };

    const form = new FormData();
    form.set("file", new Blob(["fake-png-data"], { type: "image/png" }), "photo.png");

    const res = await fetch(url(port, "/api/uploads"), {
      method: "POST",
      headers: { "x-tenant-id": "upload-tenant" },
      body: form,
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.mimetype, "image/png");

    try { unlinkSync(join(process.cwd(), "uploads", body.key)); } catch { /* ok */ }
  } finally {
    server.close();
  }
});

test("POST /api/uploads returns 400 when no file is attached", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const { port } = server.address() as { port: number };

    const res = await fetch(url(port, "/api/uploads"), {
      method: "POST",
      headers: { "x-tenant-id": "upload-tenant" },
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, "BAD_REQUEST");
  } finally {
    server.close();
  }
});

test("POST /api/uploads rejects disallowed file type", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const { port } = server.address() as { port: number };

    const form = new FormData();
    form.set("file", new Blob(["malicious"], { type: "text/plain" }), "evil.txt");

    const res = await fetch(url(port, "/api/uploads"), {
      method: "POST",
      headers: { "x-tenant-id": "upload-tenant" },
      body: form,
    });

    assert.equal(res.status, 415);
    const body = await res.json();
    assert.equal(body.error.code, "UNSUPPORTED_MEDIA_TYPE");
  } finally {
    server.close();
  }
});

test("POST /api/uploads requires tenant header", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const { port } = server.address() as { port: number };

    const form = new FormData();
    form.set("file", new Blob(["data"], { type: "image/png" }), "img.png");

    const res = await fetch(url(port, "/api/uploads"), {
      method: "POST",
      body: form,
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, "BAD_REQUEST");
  } finally {
    server.close();
  }
});

test("GET /uploads/:filename serves uploaded file", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const { port } = server.address() as { port: number };

    // Upload first
    const form = new FormData();
    form.set("file", new Blob(["hello-world-data"], { type: "image/jpeg" }), "serve-test.jpg");

    const uploadRes = await fetch(url(port, "/api/uploads"), {
      method: "POST",
      headers: { "x-tenant-id": "upload-tenant" },
      body: form,
    });

    assert.equal(uploadRes.status, 201);
    const { url: fileUrl, key: filename } = await uploadRes.json() as { url: string; key: string };

    // Retrieve via static serving
    const getRes = await fetch(url(port, fileUrl));
    assert.equal(getRes.status, 200);
    assert.equal(getRes.headers.get("content-type"), "image/jpeg");
    const data = await getRes.text();
    assert.equal(data, "hello-world-data");

    try { unlinkSync(join(process.cwd(), "uploads", filename)); } catch { /* ok */ }
  } finally {
    server.close();
  }
});
