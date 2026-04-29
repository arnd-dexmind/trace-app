import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db.js";
import { createApp } from "../src/app.js";

test("POST /api/traces and GET /api/traces", async () => {
  await db.traceRecord.deleteMany();

  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("unexpected server address");
    }

    const createResponse = await fetch(`http://127.0.0.1:${address.port}/api/traces`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-tenant-id": "tenant-a" },
      body: JSON.stringify({ title: "First trace", body: "MVP check" }),
    });

    assert.equal(createResponse.status, 201);

    const listResponse = await fetch(`http://127.0.0.1:${address.port}/api/traces`, {
      headers: { "x-tenant-id": "tenant-a" },
    });
    assert.equal(listResponse.status, 200);

    const items = (await listResponse.json()) as Array<{ title: string; body: string | null }>;
    assert.equal(items.length, 1);
    assert.equal(items[0].title, "First trace");
    assert.equal(items[0].body, "MVP check");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("POST /api/traces validates title", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("unexpected server address");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/api/traces`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-tenant-id": "tenant-a" },
      body: JSON.stringify({ title: "   " }),
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as {
      error: { code: string; message: string; requestId: string };
    };
    assert.equal(payload.error.code, "BAD_REQUEST");
    assert.equal(payload.error.message, "title is required");
    assert.ok(payload.error.requestId.length > 0);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("tenant header is required for traces APIs", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("unexpected server address");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/api/traces`);
    assert.equal(response.status, 400);
    const payload = (await response.json()) as {
      error: { code: string; message: string; requestId: string };
    };
    assert.equal(payload.error.code, "BAD_REQUEST");
    assert.equal(payload.error.message, "x-tenant-id header is required");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("tenants are isolated in list responses", async () => {
  await db.traceRecord.deleteMany();

  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("unexpected server address");
    }

    await fetch(`http://127.0.0.1:${address.port}/api/traces`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-tenant-id": "tenant-a" },
      body: JSON.stringify({ title: "Tenant A trace" }),
    });

    await fetch(`http://127.0.0.1:${address.port}/api/traces`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-tenant-id": "tenant-b" },
      body: JSON.stringify({ title: "Tenant B trace" }),
    });

    const listResponse = await fetch(`http://127.0.0.1:${address.port}/api/traces`, {
      headers: { "x-tenant-id": "tenant-a" },
    });
    assert.equal(listResponse.status, 200);
    const items = (await listResponse.json()) as Array<{ title: string }>;
    assert.equal(items.length, 1);
    assert.equal(items[0].title, "Tenant A trace");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("unknown API routes return structured 404", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("unexpected server address");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/api/does-not-exist`);
    assert.equal(response.status, 404);
    const payload = (await response.json()) as {
      error: { code: string; message: string; requestId: string };
    };
    assert.equal(payload.error.code, "NOT_FOUND");
    assert.ok(payload.error.message.includes("No route"));
    assert.ok(payload.error.requestId.length > 0);
  } finally {
    server.close();
    await db.$disconnect();
  }
});
