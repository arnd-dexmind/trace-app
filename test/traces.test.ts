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
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "First trace", body: "MVP check" }),
    });

    assert.equal(createResponse.status, 201);

    const listResponse = await fetch(`http://127.0.0.1:${address.port}/api/traces`);
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
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "   " }),
    });

    assert.equal(response.status, 400);
  } finally {
    server.close();
  }
});
