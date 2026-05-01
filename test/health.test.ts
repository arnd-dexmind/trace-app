import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";

test("GET /api/health returns ok with db connected", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("unexpected server address");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    assert.equal(response.status, 200);

    const body = (await response.json()) as { status: string; db: string };
    assert.equal(body.status, "ok");
    assert.equal(body.db, "connected");
  } finally {
    server.close();
  }
});

test("POST rejects JSON body larger than 1MB", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("unexpected server address");
    }

    // ~1.5MB of data
    const largeBody = JSON.stringify({ data: "x".repeat(1_500_000) });

    const response = await fetch(`http://127.0.0.1:${address.port}/api/spaces`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-tenant-id": "test" },
      body: largeBody,
    });

    assert.equal(response.status, 413);
    const body = await response.json();
    assert.equal(body.error.code, "BAD_REQUEST");
  } finally {
    server.close();
  }
});
