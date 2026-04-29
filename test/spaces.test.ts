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

async function cleanDatabase() {
  await db.reviewAction.deleteMany();
  await db.itemIdentityLink.deleteMany();
  await db.itemLocationHistory.deleteMany();
  await db.repairObservation.deleteMany();
  await db.itemObservation.deleteMany();
  await db.reviewTask.deleteMany();
  await db.mediaAsset.deleteMany();
  await db.walkthrough.deleteMany();
  await db.repairIssue.deleteMany();
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
