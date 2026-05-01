import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db.js";
import { createApp } from "../src/app.js";

function url(port: number, path: string) {
  return `http://127.0.0.1:${port}${path}`;
}

function headers(tenantId: string, extra?: Record<string, string>) {
  return { "content-type": "application/json", "x-tenant-id": tenantId, ...extra };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createTestSpace(port: number, tenant = "tenant-a") {
  const res = await fetch(url(port, "/api/spaces"), {
    method: "POST",
    headers: headers(tenant),
    body: JSON.stringify({ name: "Test Home", description: "A test space" }),
  });
  return (await res.json()) as { id: string; name: string };
}

async function createTestWalkthrough(port: number, spaceId: string, tenant = "tenant-a") {
  const res = await fetch(url(port, `/api/spaces/${spaceId}/walkthroughs`), {
    method: "POST",
    headers: headers(tenant),
    body: JSON.stringify({ metadata: { source: "upload" } }),
  });
  return (await res.json()) as { id: string; status: string };
}

async function processWalkthrough(port: number, spaceId: string, walkthroughId: string, tenant = "tenant-a") {
  const res = await fetch(url(port, `/api/spaces/${spaceId}/walkthroughs/${walkthroughId}/process`), {
    method: "POST",
    headers: headers(tenant),
  });
  return (await res.json()) as { id: string; status: string; processedAt: string | null };
}

async function cleanDatabase() {
  await db.reviewAction.deleteMany();
  await db.itemIdentityLink.deleteMany();
  await db.itemLocationHistory.deleteMany();
  await db.repairObservation.deleteMany();
  await db.itemObservation.deleteMany();
  await db.itemAlias.deleteMany();
  await db.reviewTask.deleteMany();
  await db.processingJob.deleteMany();
  await db.mediaAsset.deleteMany();
  await db.walkthrough.deleteMany();
  await db.repairIssue.deleteMany();
  await db.storageLocation.updateMany({ data: { parentId: null } });
  await db.storageLocation.deleteMany();
  await db.spaceZone.deleteMany();
  await db.inventoryItem.deleteMany();
  await db.space.deleteMany();
}

// ── Space CRUD ────────────────────────────────────────────────────────────────

test("POST /api/spaces creates a space", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const res = await fetch(url(address.port, "/api/spaces"), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ name: "My Home", description: "Main residence" }),
    });

    assert.equal(res.status, 201);
    const space = (await res.json()) as { id: string; name: string; description: string; tenantId: string };
    assert.ok(space.id.length > 0);
    assert.equal(space.name, "My Home");
    assert.equal(space.description, "Main residence");
    assert.equal(space.tenantId, "tenant-a");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("POST /api/spaces validates name", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const res = await fetch(url(address.port, "/api/spaces"), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ description: "No name" }),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, "BAD_REQUEST");
    assert.ok(body.error.message.includes("name"));
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("GET /api/spaces lists spaces for tenant", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    await createTestSpace(address.port, "tenant-a");
    await createTestSpace(address.port, "tenant-b");

    const resA = await fetch(url(address.port, "/api/spaces"), {
      headers: headers("tenant-a"),
    });
    assert.equal(resA.status, 200);
    const listA = (await resA.json()) as Array<{ name: string }>;
    assert.equal(listA.length, 1);
    assert.equal(listA[0].name, "Test Home");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("GET /api/spaces/:id returns space with counts", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const res = await fetch(url(address.port, `/api/spaces/${space.id}`), {
      headers: headers("tenant-a"),
    });

    assert.equal(res.status, 200);
    const detail = (await res.json()) as { id: string; itemCount: number; repairCount: number };
    assert.equal(detail.id, space.id);
    assert.equal(detail.itemCount, 0);
    assert.equal(detail.repairCount, 0);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("GET /api/spaces/:id returns 404 for unknown space", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const res = await fetch(url(address.port, "/api/spaces/nonexistent"), {
      headers: headers("tenant-a"),
    });
    assert.equal(res.status, 404);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("tenant header is required for space APIs", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const res = await fetch(url(address.port, "/api/spaces"));
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "BAD_REQUEST");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

// ── Walkthroughs ──────────────────────────────────────────────────────────────

test("POST /api/spaces/:id/walkthroughs creates walkthrough", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const res = await fetch(url(address.port, `/api/spaces/${space.id}/walkthroughs`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ metadata: { source: "mobile_upload" } }),
    });

    assert.equal(res.status, 201);
    const wt = (await res.json()) as { id: string; status: string; spaceId: string };
    assert.equal(wt.status, "uploaded");
    assert.equal(wt.spaceId, space.id);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("GET /api/spaces/:id/walkthroughs lists walkthroughs", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    await createTestWalkthrough(address.port, space.id);
    await createTestWalkthrough(address.port, space.id);

    const res = await fetch(url(address.port, `/api/spaces/${space.id}/walkthroughs`), {
      headers: headers("tenant-a"),
    });
    assert.equal(res.status, 200);
    const list = (await res.json()) as Array<{ status: string }>;
    assert.equal(list.length, 2);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

// ── Processing ────────────────────────────────────────────────────────────────

test("POST /api/spaces/:id/walkthroughs/:wid/process transitions uploaded → processing", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);
    assert.equal(wt.status, "uploaded");

    const result = await processWalkthrough(address.port, space.id, wt.id);
    assert.equal(result.status, "processing");
    assert.ok(result.processedAt !== null);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("process endpoint rejects non-uploaded walkthrough", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);

    // Process once
    await processWalkthrough(address.port, space.id, wt.id);

    // Process again — should fail since status is now "processing"
    const res = await fetch(
      url(address.port, `/api/spaces/${space.id}/walkthroughs/${wt.id}/process`),
      { method: "POST", headers: headers("tenant-a") },
    );
    assert.equal(res.status, 404);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

// ── Observations (Ingestion) ──────────────────────────────────────────────────

test("POST /api/spaces/:id/observations ingests items and creates review task", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);

    const res = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt.id,
        items: [
          { label: "ladder", confidence: 0.93, keyframeUrl: "https://example.com/kf1.jpg" },
          { label: "drill", confidence: 0.87 },
        ],
        repairs: [
          { label: "water_stain", confidence: 0.78, zoneId: null },
        ],
      }),
    });

    assert.equal(res.status, 201);
    const result = (await res.json()) as {
      itemObservations: Array<{ label: string; status: string }>;
      repairObservations: Array<{ label: string }>;
      reviewTask: { id: string; status: string };
    };
    assert.equal(result.itemObservations.length, 2);
    assert.equal(result.itemObservations[0].label, "ladder");
    assert.equal(result.itemObservations[0].status, "pending");
    assert.equal(result.repairObservations.length, 1);
    assert.equal(result.repairObservations[0].label, "water_stain");
    assert.equal(result.reviewTask.status, "pending");

    // Verify walkthrough moved to awaiting_review
    const wtRes = await fetch(url(address.port, `/api/spaces/${space.id}/walkthroughs`), {
      headers: headers("tenant-a"),
    });
    const wts = (await wtRes.json()) as Array<{ id: string; status: string }>;
    const updated = wts.find((w) => w.id === wt.id);
    assert.ok(updated);
    assert.equal(updated!.status, "awaiting_review");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

// ── Review Flow ───────────────────────────────────────────────────────────────

test("GET /api/review/queue lists pending review tasks", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);

    await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt.id,
        items: [{ label: "chair", confidence: 0.9 }],
      }),
    });

    const queueRes = await fetch(url(address.port, "/api/review/queue"), {
      headers: headers("tenant-a"),
    });
    assert.equal(queueRes.status, 200);
    const queue = (await queueRes.json()) as Array<{ id: string; status: string }>;
    assert.equal(queue.length, 1);
    assert.equal(queue[0].status, "pending");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("GET /api/review/queue/:taskId returns task with candidates and evidence", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);

    const ingestRes = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt.id,
        items: [{ label: "table", confidence: 0.95 }],
      }),
    });
    const ingested = (await ingestRes.json()) as { reviewTask: { id: string } };

    const taskRes = await fetch(
      url(address.port, `/api/review/queue/${ingested.reviewTask.id}`),
      { headers: headers("tenant-a") },
    );
    assert.equal(taskRes.status, 200);
    const task = (await taskRes.json()) as {
      status: string;
      itemObservations: Array<{ label: string; confidence: number }>;
      repairObservations: Array<unknown>;
    };
    assert.equal(task.status, "pending");
    assert.equal(task.itemObservations.length, 1);
    assert.equal(task.itemObservations[0].label, "table");
    assert.equal(task.itemObservations[0].confidence, 0.95);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("POST /api/review/:taskId/actions accept creates inventory item", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);

    const ingestRes = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt.id,
        items: [{ label: "lamp", confidence: 0.92 }],
      }),
    });
    const ingested = (await ingestRes.json()) as {
      reviewTask: { id: string };
      itemObservations: Array<{ id: string }>;
    };

    // Accept the observation — creates a new inventory item
    const actionRes = await fetch(
      url(address.port, `/api/review/${ingested.reviewTask.id}/actions`),
      {
        method: "POST",
        headers: headers("tenant-a"),
        body: JSON.stringify({
          actionType: "accept",
          observationId: ingested.itemObservations[0].id,
        }),
      },
    );
    assert.equal(actionRes.status, 201);

    // Verify inventory item was created
    const invRes = await fetch(url(address.port, `/api/spaces/${space.id}/inventory`), {
      headers: headers("tenant-a"),
    });
    const items = (await invRes.json()) as Array<{ name: string }>;
    assert.equal(items.length, 1);
    assert.equal(items[0].name, "lamp");

    // Verify walkthrough is now applied
    const wtRes = await fetch(url(address.port, `/api/spaces/${space.id}/walkthroughs`), {
      headers: headers("tenant-a"),
    });
    const wts = (await wtRes.json()) as Array<{ id: string; status: string }>;
    const updated = wts.find((w) => w.id === wt.id);
    assert.equal(updated!.status, "applied");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("POST /api/review/:taskId/actions merge links observation to existing item", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);

    // Create an existing item manually via a first walkthrough + accept
    const wt1 = await createTestWalkthrough(address.port, space.id);
    const ing1 = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt1.id,
        items: [{ label: "sofa", confidence: 0.95 }],
      }),
    });
    const i1 = (await ing1.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string }> };
    await fetch(url(address.port, `/api/review/${i1.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ actionType: "accept", observationId: i1.itemObservations[0].id }),
    });

    // Get the created item
    const invRes = await fetch(url(address.port, `/api/spaces/${space.id}/inventory`), {
      headers: headers("tenant-a"),
    });
    const items = (await invRes.json()) as Array<{ id: string; name: string }>;
    const existingItemId = items[0].id;
    assert.equal(items[0].name, "sofa");

    // Second walkthrough spots the same sofa
    const wt2 = await createTestWalkthrough(address.port, space.id);
    const ing2 = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt2.id,
        items: [{ label: "sofa", confidence: 0.88 }],
      }),
    });
    const i2 = (await ing2.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string }> };

    // Merge — link to existing item
    const mergeRes = await fetch(
      url(address.port, `/api/review/${i2.reviewTask.id}/actions`),
      {
        method: "POST",
        headers: headers("tenant-a"),
        body: JSON.stringify({
          actionType: "merge",
          observationId: i2.itemObservations[0].id,
          itemId: existingItemId,
        }),
      },
    );
    assert.equal(mergeRes.status, 201);

    // Verify no new item created — still one sofa
    const invRes2 = await fetch(url(address.port, `/api/spaces/${space.id}/inventory`), {
      headers: headers("tenant-a"),
    });
    const items2 = (await invRes2.json()) as Array<{ id: string }>;
    assert.equal(items2.length, 1);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("POST /api/review/:taskId/actions relabel changes observation label", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);

    const ingestRes = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt.id,
        items: [{ label: "tab1e", confidence: 0.7 }],
      }),
    });
    const ingested = (await ingestRes.json()) as {
      reviewTask: { id: string };
      itemObservations: Array<{ id: string }>;
    };

    const actionRes = await fetch(
      url(address.port, `/api/review/${ingested.reviewTask.id}/actions`),
      {
        method: "POST",
        headers: headers("tenant-a"),
        body: JSON.stringify({
          actionType: "relabel",
          observationId: ingested.itemObservations[0].id,
          previousLabel: "tab1e",
          newLabel: "table",
        }),
      },
    );
    assert.equal(actionRes.status, 201);

    // Verify label changed
    const taskRes = await fetch(
      url(address.port, `/api/review/queue/${ingested.reviewTask.id}`),
      { headers: headers("tenant-a") },
    );
    const task = (await taskRes.json()) as {
      itemObservations: Array<{ label: string }>;
    };
    assert.equal(task.itemObservations[0].label, "table");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

// ── Review Edge Cases ──────────────────────────────────────────────────────────

test("POST /api/review/:taskId/actions reject sets observation status to rejected", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);

    const ingestRes = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt.id,
        items: [{ label: "broken_chair", confidence: 0.5 }],
      }),
    });
    const ingested = (await ingestRes.json()) as {
      reviewTask: { id: string };
      itemObservations: Array<{ id: string }>;
    };

    const actionRes = await fetch(
      url(address.port, `/api/review/${ingested.reviewTask.id}/actions`),
      {
        method: "POST",
        headers: headers("tenant-a"),
        body: JSON.stringify({
          actionType: "reject",
          observationId: ingested.itemObservations[0].id,
        }),
      },
    );
    assert.equal(actionRes.status, 201);

    // Verify observation is now rejected
    const taskRes = await fetch(
      url(address.port, `/api/review/queue/${ingested.reviewTask.id}`),
      { headers: headers("tenant-a") },
    );
    const task = (await taskRes.json()) as {
      itemObservations: Array<{ id: string; status: string }>;
    };
    assert.equal(task.itemObservations[0].status, "rejected");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("POST /api/review/:taskId/actions duplicate reject on rejected observation succeeds", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);

    const ingestRes = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt.id,
        items: [{ label: "stain", confidence: 0.3 }],
      }),
    });
    const ingested = (await ingestRes.json()) as {
      reviewTask: { id: string };
      itemObservations: Array<{ id: string }>;
    };

    // Reject first time
    await fetch(url(address.port, `/api/review/${ingested.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ actionType: "reject", observationId: ingested.itemObservations[0].id }),
    });

    // Reject second time — should still succeed (idempotent)
    const res = await fetch(url(address.port, `/api/review/${ingested.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ actionType: "reject", observationId: ingested.itemObservations[0].id }),
    });
    assert.equal(res.status, 201);

    const taskRes = await fetch(
      url(address.port, `/api/review/queue/${ingested.reviewTask.id}`),
      { headers: headers("tenant-a") },
    );
    const task = (await taskRes.json()) as {
      itemObservations: Array<{ status: string }>;
    };
    assert.equal(task.itemObservations[0].status, "rejected");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("POST /api/review/:taskId/actions re-accept after reject creates new item", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);

    const ingestRes = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt.id,
        items: [{ label: "reclaimed_wood", confidence: 0.7 }],
      }),
    });
    const ingested = (await ingestRes.json()) as {
      reviewTask: { id: string };
      itemObservations: Array<{ id: string }>;
    };

    // First reject
    await fetch(url(address.port, `/api/review/${ingested.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ actionType: "reject", observationId: ingested.itemObservations[0].id }),
    });

    // Now accept — should create a new item
    const acceptRes = await fetch(
      url(address.port, `/api/review/${ingested.reviewTask.id}/actions`),
      {
        method: "POST",
        headers: headers("tenant-a"),
        body: JSON.stringify({ actionType: "accept", observationId: ingested.itemObservations[0].id }),
      },
    );
    assert.equal(acceptRes.status, 201);

    const invRes = await fetch(url(address.port, `/api/spaces/${space.id}/inventory`), {
      headers: headers("tenant-a"),
    });
    const items = (await invRes.json()) as Array<{ name: string }>;
    assert.equal(items.length, 1);
    assert.equal(items[0].name, "reclaimed_wood");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("POST /api/review/:taskId/actions rejects invalid actionType", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);

    const ingestRes = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt.id,
        items: [{ label: "widget", confidence: 0.8 }],
      }),
    });
    const ingested = (await ingestRes.json()) as { reviewTask: { id: string } };

    const res = await fetch(url(address.port, `/api/review/${ingested.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ actionType: "delete", observationId: "any" }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: { message: string } };
    assert.ok(body.error.message.includes("actionType"));
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("POST /api/review/:taskId/actions requires observationId for accept", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);

    const ingestRes = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt.id,
        items: [{ label: "gadget", confidence: 0.8 }],
      }),
    });
    const ingested = (await ingestRes.json()) as { reviewTask: { id: string } };

    const res = await fetch(url(address.port, `/api/review/${ingested.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ actionType: "accept" }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: { message: string } };
    assert.ok(body.error.message.includes("observationId"));
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("POST /api/review/:taskId/actions requires newLabel for relabel", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);

    const ingestRes = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt.id,
        items: [{ label: "thing", confidence: 0.6 }],
      }),
    });
    const ingested = (await ingestRes.json()) as {
      reviewTask: { id: string };
      itemObservations: Array<{ id: string }>;
    };

    const res = await fetch(url(address.port, `/api/review/${ingested.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        actionType: "relabel",
        observationId: ingested.itemObservations[0].id,
      }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: { message: string } };
    assert.ok(body.error.message.includes("newLabel"));
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("GET /api/review/queue/:taskId returns 404 for non-existent task", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const res = await fetch(url(address.port, "/api/review/queue/nonexistent"), {
      headers: headers("tenant-a"),
    });
    assert.equal(res.status, 404);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("POST /api/review/:taskId/actions returns 404 for non-existent task", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const res = await fetch(url(address.port, "/api/review/nonexistent/actions"), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ actionType: "accept", observationId: "any" }),
    });
    assert.equal(res.status, 404);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("merge without itemId behaves like accept and creates new item", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);

    const ingestRes = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt.id,
        items: [{ label: "duplicate_key", confidence: 0.88 }],
      }),
    });
    const ingested = (await ingestRes.json()) as {
      reviewTask: { id: string };
      itemObservations: Array<{ id: string }>;
    };

    // Merge with no itemId — creates new item like accept
    const res = await fetch(url(address.port, `/api/review/${ingested.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        actionType: "merge",
        observationId: ingested.itemObservations[0].id,
      }),
    });
    assert.equal(res.status, 201);

    const invRes = await fetch(url(address.port, `/api/spaces/${space.id}/inventory`), {
      headers: headers("tenant-a"),
    });
    const items = (await invRes.json()) as Array<{ name: string }>;
    assert.equal(items.length, 1);
    assert.equal(items[0].name, "duplicate_key");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

// ── Repairs ───────────────────────────────────────────────────────────────────

test("POST /api/spaces/:id/repairs creates repair issue", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const res = await fetch(url(address.port, `/api/spaces/${space.id}/repairs`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        title: "Leaky faucet",
        description: "Kitchen sink faucet drips continuously",
        severity: "medium",
      }),
    });

    assert.equal(res.status, 201);
    const repair = (await res.json()) as { id: string; title: string; status: string };
    assert.equal(repair.title, "Leaky faucet");
    assert.equal(repair.status, "open");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("GET /api/spaces/:id/repairs lists repairs with optional status filter", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    await fetch(url(address.port, `/api/spaces/${space.id}/repairs`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ title: "Issue 1", severity: "low" }),
    });
    await fetch(url(address.port, `/api/spaces/${space.id}/repairs`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ title: "Issue 2", severity: "high" }),
    });

    const resAll = await fetch(url(address.port, `/api/spaces/${space.id}/repairs`), {
      headers: headers("tenant-a"),
    });
    const all = (await resAll.json()) as Array<unknown>;
    assert.equal(all.length, 2);

    const resFiltered = await fetch(
      url(address.port, `/api/spaces/${space.id}/repairs?status=open`),
      { headers: headers("tenant-a") },
    );
    const filtered = (await resFiltered.json()) as Array<unknown>;
    assert.equal(filtered.length, 2);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("PATCH /api/spaces/:id/repairs/:issueId updates repair status", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const createRes = await fetch(url(address.port, `/api/spaces/${space.id}/repairs`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ title: "Broken window" }),
    });
    const created = (await createRes.json()) as { id: string };

    const patchRes = await fetch(
      url(address.port, `/api/spaces/${space.id}/repairs/${created.id}`),
      {
        method: "PATCH",
        headers: headers("tenant-a"),
        body: JSON.stringify({ status: "resolved" }),
      },
    );
    assert.equal(patchRes.status, 200);
    const updated = (await patchRes.json()) as { status: string; resolvedAt: string | null };
    assert.equal(updated.status, "resolved");
    assert.ok(updated.resolvedAt !== null);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

// ── Inventory Search ──────────────────────────────────────────────────────────
// ── Repair Status Lifecycle ────────────────────────────────────────────────────

test("PATCH repair status open → in_progress", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const createRes = await fetch(url(address.port, `/api/spaces/${space.id}/repairs`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ title: "Squeaky door" }),
    });
    const created = (await createRes.json()) as { id: string };

    const patchRes = await fetch(
      url(address.port, `/api/spaces/${space.id}/repairs/${created.id}`),
      {
        method: "PATCH",
        headers: headers("tenant-a"),
        body: JSON.stringify({ status: "in_progress" }),
      },
    );
    assert.equal(patchRes.status, 200);
    const updated = (await patchRes.json()) as { status: string };
    assert.equal(updated.status, "in_progress");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("PATCH repair status in_progress → resolved sets resolvedAt", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const createRes = await fetch(url(address.port, `/api/spaces/${space.id}/repairs`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ title: "Cracked tile" }),
    });
    const created = (await createRes.json()) as { id: string };

    await fetch(url(address.port, `/api/spaces/${space.id}/repairs/${created.id}`), {
      method: "PATCH",
      headers: headers("tenant-a"),
      body: JSON.stringify({ status: "in_progress" }),
    });

    const patchRes = await fetch(
      url(address.port, `/api/spaces/${space.id}/repairs/${created.id}`),
      {
        method: "PATCH",
        headers: headers("tenant-a"),
        body: JSON.stringify({ status: "resolved" }),
      },
    );
    assert.equal(patchRes.status, 200);
    const updated = (await patchRes.json()) as { status: string; resolvedAt: string | null };
    assert.equal(updated.status, "resolved");
    assert.ok(updated.resolvedAt !== null);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("PATCH repair status in_progress → open (reopen)", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const createRes = await fetch(url(address.port, `/api/spaces/${space.id}/repairs`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ title: "Loose railing" }),
    });
    const created = (await createRes.json()) as { id: string };

    await fetch(url(address.port, `/api/spaces/${space.id}/repairs/${created.id}`), {
      method: "PATCH",
      headers: headers("tenant-a"),
      body: JSON.stringify({ status: "in_progress" }),
    });

    const patchRes = await fetch(
      url(address.port, `/api/spaces/${space.id}/repairs/${created.id}`),
      {
        method: "PATCH",
        headers: headers("tenant-a"),
        body: JSON.stringify({ status: "open" }),
      },
    );
    assert.equal(patchRes.status, 200);
    const updated = (await patchRes.json()) as { status: string };
    assert.equal(updated.status, "open");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("PATCH repair status resolved → open (reopen)", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const createRes = await fetch(url(address.port, `/api/spaces/${space.id}/repairs`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ title: "Repaired but reopened" }),
    });
    const created = (await createRes.json()) as { id: string };

    await fetch(url(address.port, `/api/spaces/${space.id}/repairs/${created.id}`), {
      method: "PATCH",
      headers: headers("tenant-a"),
      body: JSON.stringify({ status: "resolved" }),
    });

    const patchRes = await fetch(
      url(address.port, `/api/spaces/${space.id}/repairs/${created.id}`),
      {
        method: "PATCH",
        headers: headers("tenant-a"),
        body: JSON.stringify({ status: "open" }),
      },
    );
    assert.equal(patchRes.status, 200);
    const updated = (await patchRes.json()) as { status: string };
    assert.equal(updated.status, "open");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("PATCH repair status rejects invalid status value", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const createRes = await fetch(url(address.port, `/api/spaces/${space.id}/repairs`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ title: "Test repair" }),
    });
    const created = (await createRes.json()) as { id: string };

    const res = await fetch(
      url(address.port, `/api/spaces/${space.id}/repairs/${created.id}`),
      {
        method: "PATCH",
        headers: headers("tenant-a"),
        body: JSON.stringify({ status: "cancelled" }),
      },
    );
    assert.equal(res.status, 400);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("PATCH repair returns 404 for non-existent repair", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const res = await fetch(
      url(address.port, `/api/spaces/${space.id}/repairs/nonexistent`),
      {
        method: "PATCH",
        headers: headers("tenant-a"),
        body: JSON.stringify({ status: "resolved" }),
      },
    );
    assert.equal(res.status, 404);
  } finally {
    server.close();
    await db.$disconnect();
  }
});


test("GET /api/spaces/:id/inventory/:itemId returns item with location history", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);

    const ingestRes = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt.id,
        items: [{ label: "bookshelf", confidence: 0.96 }],
      }),
    });
    const ingested = (await ingestRes.json()) as {
      reviewTask: { id: string };
      itemObservations: Array<{ id: string }>;
    };
    await fetch(url(address.port, `/api/review/${ingested.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ actionType: "accept", observationId: ingested.itemObservations[0].id }),
    });

    // Get item ID from inventory list
    const invList = await fetch(url(address.port, `/api/spaces/${space.id}/inventory`), {
      headers: headers("tenant-a"),
    });
    const items = (await invList.json()) as Array<{ id: string; name: string }>;
    const itemId = items[0].id;

    // Get item detail
    const detailRes = await fetch(
      url(address.port, `/api/spaces/${space.id}/inventory/${itemId}`),
      { headers: headers("tenant-a") },
    );
    assert.equal(detailRes.status, 200);
    const detail = (await detailRes.json()) as {
      name: string;
      locationHistory: Array<unknown>;
      identityLinks: Array<unknown>;
    };
    assert.equal(detail.name, "bookshelf");
    assert.equal(detail.locationHistory.length, 1);
    assert.equal(detail.identityLinks.length, 1);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

// ── Error handling ────────────────────────────────────────────────────────────

test("unknown API routes return structured 404", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const res = await fetch(url(address.port, "/api/does-not-exist"));
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error: { code: string; message: string; requestId: string } };
    assert.equal(body.error.code, "NOT_FOUND");
    assert.ok(body.error.message.includes("No route"));
    assert.ok(body.error.requestId.length > 0);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("health endpoint still works", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const res = await fetch(url(address.port, "/api/health"));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { status: string };
    assert.equal(body.status, "ok");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

// ── End-to-end: full walkthrough lifecycle ────────────────────────────────────

test("full lifecycle: upload → process → review → applied", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    // 1. Create space
    const spaceRes = await fetch(url(address.port, "/api/spaces"), {
      method: "POST",
      headers: headers("tenant-x"),
      body: JSON.stringify({ name: "Warehouse A" }),
    });
    const space = (await spaceRes.json()) as { id: string };

    // 2. Upload walkthrough
    const wtRes = await fetch(url(address.port, `/api/spaces/${space.id}/walkthroughs`), {
      method: "POST",
      headers: headers("tenant-x"),
      body: JSON.stringify({ metadata: { duration: 120, resolution: "1080p" } }),
    });
    const wt = (await wtRes.json()) as { id: string; status: string };
    assert.equal(wt.status, "uploaded");

    // 2b. Start processing (simulates async video extraction)
    const procRes = await fetch(
      url(address.port, `/api/spaces/${space.id}/walkthroughs/${wt.id}/process`),
      { method: "POST", headers: headers("tenant-x") },
    );
    const procWt = (await procRes.json()) as { status: string; processedAt: string };
    assert.equal(procWt.status, "processing");
    assert.ok(procWt.processedAt !== null);

    // 3. Process — ingest observations (simulates extraction)
    const ingRes = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-x"),
      body: JSON.stringify({
        walkthroughId: wt.id,
        items: [
          { label: "forklift", confidence: 0.97 },
          { label: "pallet_jack", confidence: 0.91 },
        ],
        repairs: [
          { label: "ceiling_leak", confidence: 0.85 },
        ],
      }),
    });
    const ingested = (await ingRes.json()) as {
      itemObservations: Array<{ id: string }>;
      repairObservations: Array<unknown>;
      reviewTask: { id: string };
    };
    assert.equal(ingested.itemObservations.length, 2);
    assert.equal(ingested.repairObservations.length, 1);

    // Walkthrough is now awaiting_review
    const wtCheck = await fetch(url(address.port, `/api/spaces/${space.id}/walkthroughs`), {
      headers: headers("tenant-x"),
    });
    const wts = (await wtCheck.json()) as Array<{ id: string; status: string }>;
    const wtUpdated = wts.find((w) => w.id === wt.id);
    assert.equal(wtUpdated!.status, "awaiting_review");

    // Review task exists
    const queue = await fetch(url(address.port, "/api/review/queue"), {
      headers: headers("tenant-x"),
    });
    const tasks = (await queue.json()) as Array<{ id: string }>;
    assert.equal(tasks.length, 1);

    // 4. Review — accept forklift
    await fetch(url(address.port, `/api/review/${ingested.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-x"),
      body: JSON.stringify({
        actionType: "accept",
        observationId: ingested.itemObservations[0].id,
      }),
    });

    // 5. Review — accept pallet_jack
    await fetch(url(address.port, `/api/review/${ingested.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-x"),
      body: JSON.stringify({
        actionType: "accept",
        observationId: ingested.itemObservations[1].id,
      }),
    });

    // Walkthrough is now applied
    const wtFinal = await fetch(url(address.port, `/api/spaces/${space.id}/walkthroughs`), {
      headers: headers("tenant-x"),
    });
    const wtsFinal = (await wtFinal.json()) as Array<{ id: string; status: string }>;
    const wtDone = wtsFinal.find((w) => w.id === wt.id);
    assert.equal(wtDone!.status, "applied");

    // Inventory has both items
    const inv = await fetch(url(address.port, `/api/spaces/${space.id}/inventory`), {
      headers: headers("tenant-x"),
    });
    const items = (await inv.json()) as Array<{ name: string }>;
    assert.equal(items.length, 2);

    // Search by name works
    const search = await fetch(
      url(address.port, `/api/spaces/${space.id}/inventory?name=fork`),
      { headers: headers("tenant-x") },
    );
    const searchResults = (await search.json()) as Array<{ name: string }>;
    assert.equal(searchResults.length, 1);
    assert.equal(searchResults[0].name, "forklift");

    // Repair issue can be created and resolved separately
    const repairRes = await fetch(url(address.port, `/api/spaces/${space.id}/repairs`), {
      method: "POST",
      headers: headers("tenant-x"),
      body: JSON.stringify({ title: "Ceiling leak in section 3", severity: "high" }),
    });
    const repair = (await repairRes.json()) as { id: string; status: string };
    assert.equal(repair.status, "open");

    const patchRes = await fetch(
      url(address.port, `/api/spaces/${space.id}/repairs/${repair.id}`),
      {
        method: "PATCH",
        headers: headers("tenant-x"),
        body: JSON.stringify({ status: "resolved" }),
      },
    );
    const resolved = (await patchRes.json()) as { status: string };
    assert.equal(resolved.status, "resolved");

    // Space shows correct counts
    const spaceDetail = await fetch(url(address.port, `/api/spaces/${space.id}`), {
      headers: headers("tenant-x"),
    });
    const detail = (await spaceDetail.json()) as { itemCount: number; repairCount: number };
    assert.equal(detail.itemCount, 2);
    assert.equal(detail.repairCount, 1);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

// ── Zones ──────────────────────────────────────────────────────────────────────

test("POST /api/spaces/:id/zones creates a zone", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const res = await fetch(url(address.port, `/api/spaces/${space.id}/zones`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ name: "Living Room", description: "Main living area" }),
    });

    assert.equal(res.status, 201);
    const zone = (await res.json()) as { id: string; name: string; description: string; spaceId: string; tenantId: string };
    assert.ok(zone.id.length > 0);
    assert.equal(zone.name, "Living Room");
    assert.equal(zone.description, "Main living area");
    assert.equal(zone.spaceId, space.id);
    assert.equal(zone.tenantId, "tenant-a");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("POST /api/spaces/:id/zones validates name", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const res = await fetch(url(address.port, `/api/spaces/${space.id}/zones`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ description: "No name" }),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "BAD_REQUEST");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("GET /api/spaces/:id/zones lists zones", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    await fetch(url(address.port, `/api/spaces/${space.id}/zones`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ name: "Kitchen" }),
    });
    await fetch(url(address.port, `/api/spaces/${space.id}/zones`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ name: "Garage" }),
    });

    const res = await fetch(url(address.port, `/api/spaces/${space.id}/zones`), {
      headers: headers("tenant-a"),
    });
    assert.equal(res.status, 200);
    const zones = (await res.json()) as Array<{ name: string }>;
    assert.equal(zones.length, 2);
    assert.equal(zones[0].name, "Garage"); // alphabetical
    assert.equal(zones[1].name, "Kitchen");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("GET /api/spaces/:id/zones enforces tenant isolation", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    await fetch(url(address.port, `/api/spaces/${space.id}/zones`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ name: "Zone A" }),
    });

    // tenant-b should not see tenant-a's zones
    const res = await fetch(url(address.port, `/api/spaces/${space.id}/zones`), {
      headers: headers("tenant-b"),
    });
    assert.equal(res.status, 404); // space not visible to tenant-b
  } finally {
    server.close();
    await db.$disconnect();
  }
});

// ── Storage Locations ──────────────────────────────────────────────────────────

test("POST /api/spaces/:id/storage-locations creates a location", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const res = await fetch(url(address.port, `/api/spaces/${space.id}/storage-locations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ name: "Shelf A", description: "Top shelf in kitchen" }),
    });

    assert.equal(res.status, 201);
    const loc = (await res.json()) as { id: string; name: string; description: string; spaceId: string };
    assert.ok(loc.id.length > 0);
    assert.equal(loc.name, "Shelf A");
    assert.equal(loc.description, "Top shelf in kitchen");
    assert.equal(loc.spaceId, space.id);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("POST /api/spaces/:id/storage-locations with zone association", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const zoneRes = await fetch(url(address.port, `/api/spaces/${space.id}/zones`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ name: "Warehouse" }),
    });
    const zone = (await zoneRes.json()) as { id: string };

    const locRes = await fetch(url(address.port, `/api/spaces/${space.id}/storage-locations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ name: "Rack 1", zoneId: zone.id }),
    });

    assert.equal(locRes.status, 201);
    const loc = (await locRes.json()) as { zoneId: string };
    assert.equal(loc.zoneId, zone.id);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("GET /api/spaces/:id/storage-locations returns nested tree", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);

    // Create parent location
    const parentRes = await fetch(url(address.port, `/api/spaces/${space.id}/storage-locations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ name: "Warehouse A" }),
    });
    const parent = (await parentRes.json()) as { id: string };

    // Create child location
    await fetch(url(address.port, `/api/spaces/${space.id}/storage-locations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ name: "Aisle 3", parentId: parent.id }),
    });

    const listRes = await fetch(url(address.port, `/api/spaces/${space.id}/storage-locations`), {
      headers: headers("tenant-a"),
    });
    assert.equal(listRes.status, 200);
    const locations = (await listRes.json()) as Array<{
      name: string;
      children: Array<{ name: string }>;
    }>;
    assert.equal(locations.length, 1); // only root
    assert.equal(locations[0].name, "Warehouse A");
    assert.equal(locations[0].children.length, 1);
    assert.equal(locations[0].children[0].name, "Aisle 3");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("GET /api/spaces/:id/storage-locations includes zone info", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const zoneRes = await fetch(url(address.port, `/api/spaces/${space.id}/zones`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ name: "Section B" }),
    });
    const zone = (await zoneRes.json()) as { id: string; name: string };

    await fetch(url(address.port, `/api/spaces/${space.id}/storage-locations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ name: "Bin 42", zoneId: zone.id }),
    });

    const listRes = await fetch(url(address.port, `/api/spaces/${space.id}/storage-locations`), {
      headers: headers("tenant-a"),
    });
    const locations = (await listRes.json()) as Array<{
      name: string;
      zone: { name: string } | null;
    }>;
    assert.equal(locations.length, 1);
    assert.equal(locations[0].name, "Bin 42");
    assert.ok(locations[0].zone);
    assert.equal(locations[0].zone!.name, "Section B");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

// ── Media Assets ───────────────────────────────────────────────────────────────

test("POST /api/spaces/:id/walkthroughs/:wid/media registers media asset", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);

    const res = await fetch(
      url(address.port, `/api/spaces/${space.id}/walkthroughs/${wt.id}/media`),
      {
        method: "POST",
        headers: headers("tenant-a"),
        body: JSON.stringify({
          type: "image",
          url: "https://example.com/photo1.jpg",
          thumbnailUrl: "https://example.com/photo1_thumb.jpg",
        }),
      },
    );

    assert.equal(res.status, 201);
    const asset = (await res.json()) as {
      id: string;
      type: string;
      url: string;
      thumbnailUrl: string;
      walkthroughId: string;
      tenantId: string;
    };
    assert.ok(asset.id.length > 0);
    assert.equal(asset.type, "image");
    assert.equal(asset.url, "https://example.com/photo1.jpg");
    assert.equal(asset.thumbnailUrl, "https://example.com/photo1_thumb.jpg");
    assert.equal(asset.walkthroughId, wt.id);
    assert.equal(asset.tenantId, "tenant-a");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("GET /api/media-assets/:id returns asset detail", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);

    const createRes = await fetch(
      url(address.port, `/api/spaces/${space.id}/walkthroughs/${wt.id}/media`),
      {
        method: "POST",
        headers: headers("tenant-a"),
        body: JSON.stringify({ type: "video", url: "https://example.com/video.mp4" }),
      },
    );
    const created = (await createRes.json()) as { id: string };

    const res = await fetch(url(address.port, `/api/media-assets/${created.id}`), {
      headers: headers("tenant-a"),
    });
    assert.equal(res.status, 200);
    const asset = (await res.json()) as {
      id: string;
      type: string;
      url: string;
      walkthrough: { id: string; spaceId: string; status: string };
    };
    assert.equal(asset.id, created.id);
    assert.equal(asset.type, "video");
    assert.equal(asset.url, "https://example.com/video.mp4");
    assert.ok(asset.walkthrough);
    assert.equal(asset.walkthrough.id, wt.id);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("GET /api/media-assets/:id enforces tenant isolation", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);

    const createRes = await fetch(
      url(address.port, `/api/spaces/${space.id}/walkthroughs/${wt.id}/media`),
      {
        method: "POST",
        headers: headers("tenant-a"),
        body: JSON.stringify({ type: "image", url: "https://example.com/secret.jpg" }),
      },
    );
    const created = (await createRes.json()) as { id: string };

    // tenant-b should not see tenant-a's media
    const res = await fetch(url(address.port, `/api/media-assets/${created.id}`), {
      headers: headers("tenant-b"),
    });
    assert.equal(res.status, 404);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("GET /api/media-assets/:id returns 404 for non-existent asset", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const res = await fetch(url(address.port, "/api/media-assets/nonexistent"), {
      headers: headers("tenant-a"),
    });
    assert.equal(res.status, 404);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("POST /api/spaces/:id/walkthroughs/:wid/media validates required fields", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);

    const res = await fetch(
      url(address.port, `/api/spaces/${space.id}/walkthroughs/${wt.id}/media`),
      {
        method: "POST",
        headers: headers("tenant-a"),
        body: JSON.stringify({ type: "image" }), // missing url
      },
    );

    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "BAD_REQUEST");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

// ── Tenant Isolation ──────────────────────────────────────────────────────────

test("tenant isolation: cannot access space from another tenant", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port, "tenant-a");

    const res = await fetch(url(address.port, `/api/spaces/${space.id}`), {
      headers: headers("tenant-b"),
    });
    assert.equal(res.status, 404);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("tenant isolation: cannot list walkthroughs of another tenant's space", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port, "tenant-a");

    const res = await fetch(url(address.port, `/api/spaces/${space.id}/walkthroughs`), {
      headers: headers("tenant-b"),
    });
    assert.equal(res.status, 404);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("tenant isolation: cannot create walkthrough in another tenant's space", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port, "tenant-a");

    const res = await fetch(url(address.port, `/api/spaces/${space.id}/walkthroughs`), {
      method: "POST",
      headers: headers("tenant-b"),
      body: JSON.stringify({ metadata: { source: "test" } }),
    });
    assert.equal(res.status, 404);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("tenant isolation: cannot access inventory of another tenant's space", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port, "tenant-a");

    const res = await fetch(url(address.port, `/api/spaces/${space.id}/inventory`), {
      headers: headers("tenant-b"),
    });
    assert.equal(res.status, 404);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("tenant isolation: cannot access repairs of another tenant's space", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port, "tenant-a");

    const res = await fetch(url(address.port, `/api/spaces/${space.id}/repairs`), {
      headers: headers("tenant-b"),
    });
    assert.equal(res.status, 404);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("tenant isolation: review queue scoped to requesting tenant", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const spaceA = await createTestSpace(address.port, "tenant-a");
    const spaceB = await createTestSpace(address.port, "tenant-b");

    const wtA = await createTestWalkthrough(address.port, spaceA.id, "tenant-a");
    const wtB = await createTestWalkthrough(address.port, spaceB.id, "tenant-b");

    await fetch(url(address.port, `/api/spaces/${spaceA.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ walkthroughId: wtA.id, items: [{ label: "itemA", confidence: 0.9 }] }),
    });
    await fetch(url(address.port, `/api/spaces/${spaceB.id}/observations`), {
      method: "POST",
      headers: headers("tenant-b"),
      body: JSON.stringify({ walkthroughId: wtB.id, items: [{ label: "itemB", confidence: 0.9 }] }),
    });

    // tenant-a only sees its own review tasks
    const queueA = await fetch(url(address.port, "/api/review/queue"), {
      headers: headers("tenant-a"),
    });
    const tasksA = (await queueA.json()) as Array<{ id: string }>;
    assert.equal(tasksA.length, 1);

    // tenant-b only sees its own review tasks
    const queueB = await fetch(url(address.port, "/api/review/queue"), {
      headers: headers("tenant-b"),
    });
    const tasksB = (await queueB.json()) as Array<{ id: string }>;
    assert.equal(tasksB.length, 1);

    // The two tasks are different
    assert.notEqual(tasksA[0].id, tasksB[0].id);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("tenant isolation: cannot access review task from another tenant", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port, "tenant-a");
    const wt = await createTestWalkthrough(address.port, space.id, "tenant-a");

    const ingRes = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ walkthroughId: wt.id, items: [{ label: "secret_item", confidence: 0.9 }] }),
    });
    const ingested = (await ingRes.json()) as { reviewTask: { id: string } };

    const res = await fetch(
      url(address.port, `/api/review/queue/${ingested.reviewTask.id}`),
      { headers: headers("tenant-b") },
    );
    assert.equal(res.status, 404);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("tenant isolation: cannot post review action to another tenant's task", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port, "tenant-a");
    const wt = await createTestWalkthrough(address.port, space.id, "tenant-a");

    const ingRes = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ walkthroughId: wt.id, items: [{ label: "locked_item", confidence: 0.9 }] }),
    });
    const ingested = (await ingRes.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string }> };

    const res = await fetch(
      url(address.port, `/api/review/${ingested.reviewTask.id}/actions`),
      {
        method: "POST",
        headers: headers("tenant-b"),
        body: JSON.stringify({ actionType: "accept", observationId: ingested.itemObservations[0].id }),
      },
    );
    assert.equal(res.status, 404);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("tenant isolation: cannot patch repair from another tenant", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port, "tenant-a");
    const createRes = await fetch(url(address.port, `/api/spaces/${space.id}/repairs`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ title: "Tenant A repair" }),
    });
    const repair = (await createRes.json()) as { id: string };

    const res = await fetch(
      url(address.port, `/api/spaces/${space.id}/repairs/${repair.id}`),
      {
        method: "PATCH",
        headers: headers("tenant-b"),
        body: JSON.stringify({ status: "resolved" }),
      },
    );
    assert.equal(res.status, 404);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

// ── Concurrent Walkthrough Processing ─────────────────────────────────────────

test("concurrent walkthroughs on same space produce isolated observations", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);

    // Create two walkthroughs
    const wt1 = await createTestWalkthrough(address.port, space.id);
    const wt2 = await createTestWalkthrough(address.port, space.id);

    // Ingest observations for both
    await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt1.id,
        items: [
          { label: "alpha", confidence: 0.99 },
          { label: "beta", confidence: 0.88 },
        ],
      }),
    });

    await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt2.id,
        items: [
          { label: "gamma", confidence: 0.77 },
        ],
      }),
    });

    // Verify walkthrough statuses are independent
    const wts = await fetch(url(address.port, `/api/spaces/${space.id}/walkthroughs`), {
      headers: headers("tenant-a"),
    });
    const wtsList = (await wts.json()) as Array<{ id: string; status: string }>;

    const wt1Updated = wtsList.find((w: { id: string }) => w.id === wt1.id);
    const wt2Updated = wtsList.find((w: { id: string }) => w.id === wt2.id);
    assert.equal(wt1Updated!.status, "awaiting_review");
    assert.equal(wt2Updated!.status, "awaiting_review");

    // Verify review tasks are separate
    const queue = await fetch(url(address.port, "/api/review/queue"), {
      headers: headers("tenant-a"),
    });
    const tasks = (await queue.json()) as Array<{ id: string; walkthrough: { id: string } }>;
    assert.equal(tasks.length, 2);

    const wtIds = tasks.map((t: { walkthrough: { id: string } }) => t.walkthrough.id).sort();
    assert.ok(wtIds.includes(wt1.id));
    assert.ok(wtIds.includes(wt2.id));
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("concurrent walkthrough processing: accept all items across walkthroughs", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);

    // Walkthrough 1 with items
    const wt1 = await createTestWalkthrough(address.port, space.id);
    const ing1 = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt1.id,
        items: [{ label: "hammer", confidence: 0.95 }],
      }),
    });
    const i1 = (await ing1.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string }> };

    // Walkthrough 2 with items
    const wt2 = await createTestWalkthrough(address.port, space.id);
    const ing2 = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt2.id,
        items: [{ label: "wrench", confidence: 0.91 }],
      }),
    });
    const i2 = (await ing2.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string }> };

    // Accept item from wt1
    await fetch(url(address.port, `/api/review/${i1.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ actionType: "accept", observationId: i1.itemObservations[0].id }),
    });

    // Accept item from wt2
    await fetch(url(address.port, `/api/review/${i2.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ actionType: "accept", observationId: i2.itemObservations[0].id }),
    });

    // Both walkthroughs are now applied
    const wts = await fetch(url(address.port, `/api/spaces/${space.id}/walkthroughs`), {
      headers: headers("tenant-a"),
    });
    const wtsList = (await wts.json()) as Array<{ id: string; status: string }>;
    assert.equal(wtsList.find((w: { id: string }) => w.id === wt1.id)!.status, "applied");
    assert.equal(wtsList.find((w: { id: string }) => w.id === wt2.id)!.status, "applied");

    // Inventory has both items
    const inv = await fetch(url(address.port, `/api/spaces/${space.id}/inventory`), {
      headers: headers("tenant-a"),
    });
    const items = (await inv.json()) as Array<{ name: string }>;
    const names = items.map((it: { name: string }) => it.name).sort();
    assert.deepEqual(names, ["hammer", "wrench"]);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

// ── Additional Coverage Hardening ─────────────────────────────────────────────

test("POST /api/spaces/:id/observations rejects walkthrough that is already applied", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);

    // Ingest + accept to get applied status
    const ingRes = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt.id,
        items: [{ label: "test_item", confidence: 0.9 }],
      }),
    });
    const ing = (await ingRes.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string }> };
    await fetch(url(address.port, `/api/review/${ing.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ actionType: "accept", observationId: ing.itemObservations[0].id }),
    });

    // Walkthrough should now be "applied" — ingest should be rejected
    const res = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt.id,
        items: [{ label: "late_item", confidence: 0.5 }],
      }),
    });
    assert.equal(res.status, 404);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("GET /api/spaces/:id/inventory filters by zoneId", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);

    // Create a zone
    const zoneRes = await fetch(url(address.port, `/api/spaces/${space.id}/zones`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ name: "Zone Alpha" }),
    });
    const zone = (await zoneRes.json()) as { id: string };

    // Create item via walkthrough + accept
    const wt = await createTestWalkthrough(address.port, space.id);
    const ingRes = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt.id,
        items: [{ label: "zoned_item", confidence: 0.95, zoneId: zone.id }],
      }),
    });
    const ing = (await ingRes.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string }> };
    await fetch(url(address.port, `/api/review/${ing.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ actionType: "accept", observationId: ing.itemObservations[0].id }),
    });

    // Search with matching zoneId
    const resMatch = await fetch(
      url(address.port, `/api/spaces/${space.id}/inventory?zoneId=${zone.id}`),
      { headers: headers("tenant-a") },
    );
    const matchItems = (await resMatch.json()) as Array<{ name: string }>;
    assert.equal(matchItems.length, 1);
    assert.equal(matchItems[0].name, "zoned_item");

    // Search with non-matching zoneId
    const resNoMatch = await fetch(
      url(address.port, `/api/spaces/${space.id}/inventory?zoneId=nonexistent`),
      { headers: headers("tenant-a") },
    );
    const noMatchItems = (await resNoMatch.json()) as Array<unknown>;
    assert.equal(noMatchItems.length, 0);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("tenant isolation: cannot access specific inventory item from another tenant", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port, "tenant-a");
    const wt = await createTestWalkthrough(address.port, space.id, "tenant-a");

    const ingRes = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt.id,
        items: [{ label: "exclusive_item", confidence: 0.95 }],
      }),
    });
    const ing = (await ingRes.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string }> };
    await fetch(url(address.port, `/api/review/${ing.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ actionType: "accept", observationId: ing.itemObservations[0].id }),
    });

    // Get item id
    const inv = await fetch(url(address.port, `/api/spaces/${space.id}/inventory`), {
      headers: headers("tenant-a"),
    });
    const items = (await inv.json()) as Array<{ id: string }>;
    const itemId = items[0].id;

    // Cross-tenant access to specific item
    const res = await fetch(
      url(address.port, `/api/spaces/${space.id}/inventory/${itemId}`),
      { headers: headers("tenant-b") },
    );
    assert.equal(res.status, 404);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("POST /api/spaces/:id/observations accepts empty items and repairs arrays", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);

    const res = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt.id,
        items: [],
        repairs: [],
      }),
    });
    assert.equal(res.status, 201);
    const result = (await res.json()) as {
      itemObservations: Array<unknown>;
      repairObservations: Array<unknown>;
      reviewTask: { id: string };
    };
    assert.equal(result.itemObservations.length, 0);
    assert.equal(result.repairObservations.length, 0);
    assert.ok(result.reviewTask.id.length > 0);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("POST /api/spaces/:id/observations with no items or repairs still creates review task", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);

    const res = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ walkthroughId: wt.id }),
    });
    assert.equal(res.status, 201);
    const result = (await res.json()) as { reviewTask: { id: string; status: string } };
    assert.equal(result.reviewTask.status, "pending");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("POST /api/spaces/:id/observations rejects non-existent walkthrough", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);

    const res = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: "nonexistent_walkthrough_id",
        items: [{ label: "orphan", confidence: 0.5 }],
      }),
    });
    assert.equal(res.status, 404);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

// ── Review Action Coverage ─────────────────────────────────────────────────

test("relabel action changes observation label", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);

    const ingRes = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt.id,
        items: [{ label: "misspeled", confidence: 0.7 }],
      }),
    });
    const ing = (await ingRes.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string }> };

    const res = await fetch(url(address.port, `/api/review/${ing.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ actionType: "relabel", observationId: ing.itemObservations[0].id, newLabel: "corrected" }),
    });
    assert.equal(res.status, 201);

    const taskRes = await fetch(url(address.port, `/api/review/queue/${ing.reviewTask.id}`), {
      headers: headers("tenant-a"),
    });
    const task = (await taskRes.json()) as { itemObservations: Array<{ label: string }> };
    assert.equal(task.itemObservations[0].label, "corrected");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("merge into existing item links observation without creating new item", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);

    const wt1 = await createTestWalkthrough(address.port, space.id);
    const ing1 = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ walkthroughId: wt1.id, items: [{ label: "dup_item", confidence: 0.8 }] }),
    });
    const i1 = (await ing1.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string }> };
    await fetch(url(address.port, `/api/review/${i1.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ actionType: "accept", observationId: i1.itemObservations[0].id }),
    });

    const inv = await fetch(url(address.port, `/api/spaces/${space.id}/inventory`), {
      headers: headers("tenant-a"),
    });
    const items = (await inv.json()) as Array<{ id: string; name: string }>;
    assert.equal(items.length, 1);
    const existingItemId = items[0].id;

    const wt2 = await createTestWalkthrough(address.port, space.id);
    const ing2 = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ walkthroughId: wt2.id, items: [{ label: "dup_item_v2", confidence: 0.85 }] }),
    });
    const i2 = (await ing2.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string }> };

    const mergeRes = await fetch(url(address.port, `/api/review/${i2.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ actionType: "merge", observationId: i2.itemObservations[0].id, itemId: existingItemId }),
    });
    assert.equal(mergeRes.status, 201);

    const invAfter = await fetch(url(address.port, `/api/spaces/${space.id}/inventory`), {
      headers: headers("tenant-a"),
    });
    const itemsAfter = (await invAfter.json()) as Array<{ id: string }>;
    assert.equal(itemsAfter.length, 1);

    const detailRes = await fetch(url(address.port, `/api/spaces/${space.id}/inventory/${existingItemId}`), {
      headers: headers("tenant-a"),
    });
    const detail = (await detailRes.json()) as { identityLinks: Array<unknown> };
    assert.equal(detail.identityLinks.length, 2);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("repair observation appears in review task detail", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);

    const ingRes = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt.id,
        repairs: [{ label: "broken_window", confidence: 0.92 }],
      }),
    });
    const ing = (await ingRes.json()) as { reviewTask: { id: string }; repairObservations: Array<{ id: string; label: string }> };
    assert.equal(ing.repairObservations.length, 1);
    assert.equal(ing.repairObservations[0].label, "broken_window");

    const taskRes = await fetch(url(address.port, `/api/review/queue/${ing.reviewTask.id}`), {
      headers: headers("tenant-a"),
    });
    const task = (await taskRes.json()) as { repairObservations: Array<{ label: string }> };
    assert.equal(task.repairObservations.length, 1);
    assert.equal(task.repairObservations[0].label, "broken_window");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("review action with note is recorded", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);

    const ingRes = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ walkthroughId: wt.id, items: [{ label: "noted_item", confidence: 0.6 }] }),
    });
    const ing = (await ingRes.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string }> };

    const res = await fetch(url(address.port, `/api/review/${ing.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        actionType: "accept",
        observationId: ing.itemObservations[0].id,
        note: "Looks like a genuine find",
      }),
    });
    assert.equal(res.status, 201);
    const action = (await res.json()) as { note: string; actionType: string };
    assert.equal(action.note, "Looks like a genuine find");
    assert.equal(action.actionType, "accept");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("walkthrough status transitions: uploaded → processing → awaiting_review → applied", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);
    assert.equal(wt.status, "uploaded");

    // uploaded → processing
    const procRes = await fetch(
      url(address.port, `/api/spaces/${space.id}/walkthroughs/${wt.id}/process`),
      { method: "POST", headers: headers("tenant-a") },
    );
    const procWt = (await procRes.json()) as { status: string };
    assert.equal(procWt.status, "processing");

    // processing + ingest → awaiting_review
    const ingRes = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ walkthroughId: wt.id, items: [{ label: "state_test", confidence: 0.9 }] }),
    });
    const ing = (await ingRes.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string }> };
    const wtsAfterIngest = await fetch(url(address.port, `/api/spaces/${space.id}/walkthroughs`), {
      headers: headers("tenant-a"),
    });
    const wtsAI = (await wtsAfterIngest.json()) as Array<{ id: string; status: string }>;
    assert.equal(wtsAI.find((w) => w.id === wt.id)!.status, "awaiting_review");

    // accept → applied
    await fetch(url(address.port, `/api/review/${ing.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ actionType: "accept", observationId: ing.itemObservations[0].id }),
    });
    const wtsFinal = await fetch(url(address.port, `/api/spaces/${space.id}/walkthroughs`), {
      headers: headers("tenant-a"),
    });
    const wtsF = (await wtsFinal.json()) as Array<{ id: string; status: string }>;
    assert.equal(wtsF.find((w) => w.id === wt.id)!.status, "applied");
  } finally {
    server.close();
    await db.$disconnect();
  }
});
