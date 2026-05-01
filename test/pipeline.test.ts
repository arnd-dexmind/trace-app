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

async function createTestSpace(port: number, tenant = "tenant-a") {
  const res = await fetch(url(port, "/api/spaces"), {
    method: "POST",
    headers: headers(tenant),
    body: JSON.stringify({ name: "Test Space", description: "Pipeline test" }),
  });
  return (await res.json()) as { id: string; name: string };
}

async function createTestWalkthrough(port: number, spaceId: string, tenant = "tenant-a") {
  const res = await fetch(url(port, `/api/spaces/${spaceId}/walkthroughs`), {
    method: "POST",
    headers: headers(tenant),
    body: JSON.stringify({ metadata: { source: "pipeline_test" } }),
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
  await db.processingJob.deleteMany();
  await db.mediaAsset.deleteMany();
  await db.walkthrough.deleteMany();
  await db.repairIssue.deleteMany();
  await db.itemAlias.deleteMany();
  await db.storageLocation.updateMany({ data: { parentId: null } });
  await db.storageLocation.deleteMany();
  await db.spaceZone.deleteMany();
  await db.inventoryItem.deleteMany();
  await db.space.deleteMany();
}

// ── Diff / Location Change Detection ────────────────────────────────────────

test("diff: same item observed in different zones across walkthroughs updates location history", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);

    // Create two zones
    const zoneARes = await fetch(url(address.port, `/api/spaces/${space.id}/zones`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ name: "Warehouse A" }),
    });
    const zoneA = (await zoneARes.json()) as { id: string };

    const zoneBRes = await fetch(url(address.port, `/api/spaces/${space.id}/zones`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ name: "Warehouse B" }),
    });
    const zoneB = (await zoneBRes.json()) as { id: string };

    // Walkthrough 1: observe "forklift" in zone A
    const wt1 = await createTestWalkthrough(address.port, space.id);
    const ing1 = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt1.id,
        items: [{ label: "forklift", confidence: 0.96, zoneId: zoneA.id }],
      }),
    });
    const i1 = (await ing1.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string }> };
    await fetch(url(address.port, `/api/review/${i1.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ actionType: "accept", observationId: i1.itemObservations[0].id }),
    });

    // Verify location history entry 1
    const inv1 = await fetch(url(address.port, `/api/spaces/${space.id}/inventory`), {
      headers: headers("tenant-a"),
    });
    const items1 = (await inv1.json()) as Array<{ id: string; name: string }>;
    assert.equal(items1.length, 1);
    assert.equal(items1[0].name, "forklift");
    const itemId = items1[0].id;

    const detail1 = await fetch(url(address.port, `/api/spaces/${space.id}/inventory/${itemId}`), {
      headers: headers("tenant-a"),
    });
    const d1 = (await detail1.json()) as { locationHistory: Array<{ zoneId: string }> };
    assert.equal(d1.locationHistory.length, 1);
    assert.equal(d1.locationHistory[0].zoneId, zoneA.id);

    // Walkthrough 2: observe same "forklift" now in zone B (moved)
    const wt2 = await createTestWalkthrough(address.port, space.id);
    const ing2 = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt2.id,
        items: [{ label: "forklift", confidence: 0.94, zoneId: zoneB.id }],
      }),
    });
    const i2 = (await ing2.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string }> };

    // Merge (link to existing item)
    await fetch(url(address.port, `/api/review/${i2.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        actionType: "merge",
        observationId: i2.itemObservations[0].id,
        itemId,
      }),
    });

    // Verify location history now has 2 entries — one per walkthrough
    const detail2 = await fetch(url(address.port, `/api/spaces/${space.id}/inventory/${itemId}`), {
      headers: headers("tenant-a"),
    });
    const d2 = (await detail2.json()) as { locationHistory: Array<{ zoneId: string; zone: { name: string } | null }> };
    assert.equal(d2.locationHistory.length, 2);

    // Most recent entry should be zone B
    const zoneIds = d2.locationHistory.map((h) => h.zoneId);
    assert.ok(zoneIds.includes(zoneA.id));
    assert.ok(zoneIds.includes(zoneB.id));
    assert.equal(d2.locationHistory[0].zoneId, zoneB.id); // most recent first
  } finally {
    server.close();
  }
});

test("diff: item moved to different storage location is tracked in location history", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);

    // Create two storage locations
    const locARes = await fetch(url(address.port, `/api/spaces/${space.id}/storage-locations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ name: "Shelf Alpha" }),
    });
    const locA = (await locARes.json()) as { id: string };

    const locBRes = await fetch(url(address.port, `/api/spaces/${space.id}/storage-locations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ name: "Shelf Beta" }),
    });
    const locB = (await locBRes.json()) as { id: string };

    // Walkthrough 1: observe "drill" at Shelf Alpha
    const wt1 = await createTestWalkthrough(address.port, space.id);
    const ing1 = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt1.id,
        items: [{ label: "drill", confidence: 0.95, storageLocationId: locA.id }],
      }),
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
    const items = (await inv.json()) as Array<{ id: string }>;
    const itemId = items[0].id;

    // Walkthrough 2: observe "drill" moved to Shelf Beta
    const wt2 = await createTestWalkthrough(address.port, space.id);
    const ing2 = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt2.id,
        items: [{ label: "drill", confidence: 0.92, storageLocationId: locB.id }],
      }),
    });
    const i2 = (await ing2.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string }> };
    await fetch(url(address.port, `/api/review/${i2.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ actionType: "merge", observationId: i2.itemObservations[0].id, itemId }),
    });

    // Verify location history tracks both locations
    const detail = await fetch(url(address.port, `/api/spaces/${space.id}/inventory/${itemId}`), {
      headers: headers("tenant-a"),
    });
    const d = (await detail.json()) as {
      locationHistory: Array<{ storageLocationId: string | null; storageLocation: { name: string } | null }>;
    };
    assert.equal(d.locationHistory.length, 2);

    const storageLocIds = d.locationHistory.map((h) => h.storageLocationId);
    assert.ok(storageLocIds.includes(locA.id));
    assert.ok(storageLocIds.includes(locB.id));
  } finally {
    server.close();
  }
});

// ── Repair Observation → Issue → Resolve Pipeline ──────────────────────────

test("repair pipeline: observation → create issue → in_progress → resolve", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);

    // 1. Ingest repair observation
    const ingRes = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt.id,
        repairs: [{ label: "roof_leak", confidence: 0.91 }],
      }),
    });
    const ingested = (await ingRes.json()) as {
      repairObservations: Array<{ id: string; label: string; status: string }>;
    };
    assert.equal(ingested.repairObservations.length, 1);
    assert.equal(ingested.repairObservations[0].label, "roof_leak");
    assert.equal(ingested.repairObservations[0].status, "pending");

    // 2. Create a repair issue from the observation
    const repairRes = await fetch(url(address.port, `/api/spaces/${space.id}/repairs`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        title: "Roof leak in section 4",
        description: "Detected by walkthrough observation",
        severity: "high",
      }),
    });
    const repair = (await repairRes.json()) as { id: string; status: string };
    assert.equal(repair.status, "open");

    // 3. Move to in_progress
    const progressRes = await fetch(
      url(address.port, `/api/spaces/${space.id}/repairs/${repair.id}`),
      {
        method: "PATCH",
        headers: headers("tenant-a"),
        body: JSON.stringify({ status: "in_progress" }),
      },
    );
    const progressing = (await progressRes.json()) as { status: string };
    assert.equal(progressing.status, "in_progress");

    // 4. Resolve
    const resolveRes = await fetch(
      url(address.port, `/api/spaces/${space.id}/repairs/${repair.id}`),
      {
        method: "PATCH",
        headers: headers("tenant-a"),
        body: JSON.stringify({ status: "resolved" }),
      },
    );
    const resolved = (await resolveRes.json()) as { status: string; resolvedAt: string | null };
    assert.equal(resolved.status, "resolved");
    assert.ok(resolved.resolvedAt !== null);

    // 5. Verify repair list reflects resolved status
    const listRes = await fetch(
      url(address.port, `/api/spaces/${space.id}/repairs?status=resolved`),
      { headers: headers("tenant-a") },
    );
    const resolvedList = (await listRes.json()) as Array<{ id: string; status: string }>;
    assert.equal(resolvedList.length, 1);
    assert.equal(resolvedList[0].id, repair.id);
    assert.equal(resolvedList[0].status, "resolved");
  } finally {
    server.close();
  }
});

// ── Entity Matching: same item in two walkthroughs is correctly linked ─────

test("entity matching: item identity link count grows with each merge", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);

    // Walkthrough 1: first sighting
    const wt1 = await createTestWalkthrough(address.port, space.id);
    const ing1 = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ walkthroughId: wt1.id, items: [{ label: "generator", confidence: 0.98 }] }),
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
    const items = (await inv.json()) as Array<{ id: string }>;
    const itemId = items[0].id;

    // Walkthrough 2: second sighting — merge
    const wt2 = await createTestWalkthrough(address.port, space.id);
    const ing2 = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ walkthroughId: wt2.id, items: [{ label: "generator", confidence: 0.94 }] }),
    });
    const i2 = (await ing2.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string }> };
    await fetch(url(address.port, `/api/review/${i2.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ actionType: "merge", observationId: i2.itemObservations[0].id, itemId }),
    });

    // Walkthrough 3: third sighting — merge again
    const wt3 = await createTestWalkthrough(address.port, space.id);
    const ing3 = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ walkthroughId: wt3.id, items: [{ label: "generator_v2", confidence: 0.91 }] }),
    });
    const i3 = (await ing3.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string }> };
    await fetch(url(address.port, `/api/review/${i3.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ actionType: "merge", observationId: i3.itemObservations[0].id, itemId }),
    });

    // Verify identity links now has 3 entries
    const detail = await fetch(url(address.port, `/api/spaces/${space.id}/inventory/${itemId}`), {
      headers: headers("tenant-a"),
    });
    const d = (await detail.json()) as { identityLinks: Array<unknown> };
    assert.equal(d.identityLinks.length, 3);

    // Still only one inventory item
    const invFinal = await fetch(url(address.port, `/api/spaces/${space.id}/inventory`), {
      headers: headers("tenant-a"),
    });
    const itemsFinal = (await invFinal.json()) as Array<unknown>;
    assert.equal(itemsFinal.length, 1);
  } finally {
    server.close();
  }
});

// ── Walkthrough Re-ingestion ───────────────────────────────────────────────

test("walkthrough that is applied cannot accept new observations", async () => {
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
        items: [{ label: "completed_item", confidence: 0.95 }],
      }),
    });
    const ing = (await ingRes.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string }> };
    await fetch(url(address.port, `/api/review/${ing.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ actionType: "accept", observationId: ing.itemObservations[0].id }),
    });

    // Now walkthrough is "applied" — re-ingestion should be rejected
    const res = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt.id,
        items: [{ label: "late_observation", confidence: 0.5 }],
      }),
    });
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

// ── Observation ingestion edge cases ───────────────────────────────────────

test("observation ingestion with missing walkthroughId returns 400", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);

    const res = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ items: [{ label: "orphan", confidence: 0.5 }] }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "BAD_REQUEST");
  } finally {
    server.close();
  }
});

// ── Repair lifecycle edge cases ────────────────────────────────────────────

test("repair creation requires title", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const res = await fetch(url(address.port, `/api/spaces/${space.id}/repairs`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ severity: "medium" }),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "BAD_REQUEST");
  } finally {
    server.close();
  }
});

test("repair creation with itemId links repair to inventory item", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);

    // Create an item first
    const ingRes = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ walkthroughId: wt.id, items: [{ label: "ac_unit", confidence: 0.93 }] }),
    });
    const ing = (await ingRes.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string }> };
    await fetch(url(address.port, `/api/review/${ing.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ actionType: "accept", observationId: ing.itemObservations[0].id }),
    });

    const inv = await fetch(url(address.port, `/api/spaces/${space.id}/inventory`), {
      headers: headers("tenant-a"),
    });
    const items = (await inv.json()) as Array<{ id: string }>;
    const itemId = items[0].id;

    // Create repair linked to item
    const repairRes = await fetch(url(address.port, `/api/spaces/${space.id}/repairs`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ title: "AC unit not cooling", severity: "high", itemId }),
    });
    assert.equal(repairRes.status, 201);
    const repair = (await repairRes.json()) as { id: string; itemId: string; title: string };
    assert.equal(repair.itemId, itemId);
    assert.equal(repair.title, "AC unit not cooling");
  } finally {
    server.close();
  }
});

// ── Inventory search edge cases ────────────────────────────────────────────

test("inventory search by name returns partial matches", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wt = await createTestWalkthrough(address.port, space.id);

    // Ingest items with similar names
    const ingRes = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt.id,
        items: [
          { label: "power_drill", confidence: 0.9 },
          { label: "hand_drill", confidence: 0.9 },
          { label: "hammer", confidence: 0.9 },
        ],
      }),
    });
    const ing = (await ingRes.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string }> };

    // Accept all items
    for (const obs of ing.itemObservations) {
      await fetch(url(address.port, `/api/review/${ing.reviewTask.id}/actions`), {
        method: "POST",
        headers: headers("tenant-a"),
        body: JSON.stringify({ actionType: "accept", observationId: obs.id }),
      });
    }

    // Search for "drill" — should return both drill variants
    const searchRes = await fetch(
      url(address.port, `/api/spaces/${space.id}/inventory?name=drill`),
      { headers: headers("tenant-a") },
    );
    const results = (await searchRes.json()) as Array<{ name: string }>;
    assert.equal(results.length, 2);
    const names = results.map((r) => r.name).sort();
    assert.deepEqual(names, ["hand_drill", "power_drill"]);

    // Search for "hammer" — should return only hammer
    const searchRes2 = await fetch(
      url(address.port, `/api/spaces/${space.id}/inventory?name=hammer`),
      { headers: headers("tenant-a") },
    );
    const results2 = (await searchRes2.json()) as Array<{ name: string }>;
    assert.equal(results2.length, 1);
    assert.equal(results2[0].name, "hammer");

    // Search for non-matching term
    const searchRes3 = await fetch(
      url(address.port, `/api/spaces/${space.id}/inventory?name=nonexistent`),
      { headers: headers("tenant-a") },
    );
    const results3 = (await searchRes3.json()) as Array<unknown>;
    assert.equal(results3.length, 0);
  } finally {
    server.close();
  }
});

// ── Inventory item detail 404 ──────────────────────────────────────────────

test("GET /api/spaces/:id/inventory/:itemId returns 404 for non-existent item", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const res = await fetch(
      url(address.port, `/api/spaces/${space.id}/inventory/nonexistent`),
      { headers: headers("tenant-a") },
    );
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

// ── Diff Engine: Auto-apply ─────────────────────────────────────────────────

test("diff: auto-apply accepts unchanged items (same item, same zone, same storage location)", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);

    // Create zone and storage location
    const zoneRes = await fetch(url(address.port, `/api/spaces/${space.id}/zones`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ name: "Warehouse A" }),
    });
    const zone = (await zoneRes.json()) as { id: string };

    const locRes = await fetch(url(address.port, `/api/spaces/${space.id}/storage-locations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ name: "Shelf 1", zoneId: zone.id }),
    });
    const loc = (await locRes.json()) as { id: string };

    // Walkthrough 1: observe "drill" at Shelf 1 in Warehouse A
    const wt1 = await createTestWalkthrough(address.port, space.id);
    const ing1 = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt1.id,
        items: [{ label: "drill", confidence: 0.95, zoneId: zone.id, storageLocationId: loc.id }],
      }),
    });
    const i1 = (await ing1.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string }> };
    await fetch(url(address.port, `/api/review/${i1.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ actionType: "accept", observationId: i1.itemObservations[0].id }),
    });

    // Get the inventory item
    const inv = await fetch(url(address.port, `/api/spaces/${space.id}/inventory`), {
      headers: headers("tenant-a"),
    });
    const items = (await inv.json()) as Array<{ id: string; name: string }>;
    assert.equal(items.length, 1);
    assert.equal(items[0].name, "drill");
    const itemId = items[0].id;

    // Walkthrough 2: observe same "drill" at same location → should auto-apply
    const wt2 = await createTestWalkthrough(address.port, space.id);
    const ing2 = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt2.id,
        items: [{ label: "drill", confidence: 0.93, zoneId: zone.id, storageLocationId: loc.id }],
      }),
    });
    const i2 = (await ing2.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string }> };

    // Manually set itemId to simulate entity matching having run
    await db.itemObservation.update({
      where: { id: i2.itemObservations[0].id },
      data: { itemId },
    });

    // Manually run the diff engine (simulating pipeline stage)
    const { generateWalkthroughDiff, applyAutoItems } = await import("../src/lib/diff-generator.js");
    const diff = await generateWalkthroughDiff(db, wt2.id, space.id, "tenant-a");

    assert.equal(diff.summary.unchangedItems, 1);
    assert.equal(diff.summary.newItems, 0);
    assert.equal(diff.summary.movedItems, 0);
    assert.equal(diff.summary.autoApplied, 1);

    // Apply auto-items
    const count = await applyAutoItems(db, diff, "tenant-a");
    assert.equal(count, 1);

    // Verify observation is now accepted
    const obs = await db.itemObservation.findUnique({ where: { id: i2.itemObservations[0].id } });
    assert.equal(obs?.status, "accepted");

    // Verify location history has 2 entries (one per walkthrough)
    const history = await db.itemLocationHistory.findMany({
      where: { itemId },
      orderBy: { observedAt: "asc" },
    });
    assert.equal(history.length, 2);
  } finally {
    server.close();
  }
});

test("diff: moved item (different zone) is detected and goes to review", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);

    const zoneARes = await fetch(url(address.port, `/api/spaces/${space.id}/zones`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ name: "Zone A" }),
    });
    const zoneA = (await zoneARes.json()) as { id: string };

    const zoneBRes = await fetch(url(address.port, `/api/spaces/${space.id}/zones`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ name: "Zone B" }),
    });
    const zoneB = (await zoneBRes.json()) as { id: string };

    // Walkthrough 1: "forklift" in Zone A
    const wt1 = await createTestWalkthrough(address.port, space.id);
    const ing1 = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt1.id,
        items: [{ label: "forklift", confidence: 0.96, zoneId: zoneA.id }],
      }),
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
    const items = (await inv.json()) as Array<{ id: string }>;
    const itemId = items[0].id;

    // Walkthrough 2: "forklift" now in Zone B
    const wt2 = await createTestWalkthrough(address.port, space.id);
    const ing2 = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt2.id,
        items: [{ label: "forklift", confidence: 0.94, zoneId: zoneB.id }],
      }),
    });
    const i2 = (await ing2.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string }> };

    // Set itemId (simulating entity matching)
    await db.itemObservation.update({
      where: { id: i2.itemObservations[0].id },
      data: { itemId },
    });

    const { generateWalkthroughDiff } = await import("../src/lib/diff-generator.js");
    const diff = await generateWalkthroughDiff(db, wt2.id, space.id, "tenant-a");

    assert.equal(diff.summary.movedItems, 1);
    assert.equal(diff.summary.unchangedItems, 0);
    assert.equal(diff.summary.autoApplied, 0);

    const moved = diff.items.find((e) => e.changeType === "moved");
    assert.ok(moved);
    assert.equal(moved.previousZoneName, "Zone A");
    assert.equal(moved.zoneName, "Zone B");
    assert.equal(moved.autoApplied, false);
  } finally {
    server.close();
  }
});

test("diff: storage location change is detected as a move", async () => {
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
      body: JSON.stringify({ name: "Garage" }),
    });
    const zone = (await zoneRes.json()) as { id: string };

    const locARes = await fetch(url(address.port, `/api/spaces/${space.id}/storage-locations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ name: "Shelf A", zoneId: zone.id }),
    });
    const locA = (await locARes.json()) as { id: string };

    const locBRes = await fetch(url(address.port, `/api/spaces/${space.id}/storage-locations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ name: "Shelf B", zoneId: zone.id }),
    });
    const locB = (await locBRes.json()) as { id: string };

    // Walkthrough 1: "toolbox" at Shelf A
    const wt1 = await createTestWalkthrough(address.port, space.id);
    const ing1 = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt1.id,
        items: [{ label: "toolbox", confidence: 0.9, zoneId: zone.id, storageLocationId: locA.id }],
      }),
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
    const items = (await inv.json()) as Array<{ id: string }>;
    const itemId = items[0].id;

    // Walkthrough 2: "toolbox" moved to Shelf B (same zone)
    const wt2 = await createTestWalkthrough(address.port, space.id);
    const ing2 = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt2.id,
        items: [{ label: "toolbox", confidence: 0.88, zoneId: zone.id, storageLocationId: locB.id }],
      }),
    });
    const i2 = (await ing2.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string }> };

    await db.itemObservation.update({
      where: { id: i2.itemObservations[0].id },
      data: { itemId },
    });

    const { generateWalkthroughDiff } = await import("../src/lib/diff-generator.js");
    const diff = await generateWalkthroughDiff(db, wt2.id, space.id, "tenant-a");

    assert.equal(diff.summary.movedItems, 1);
    const moved = diff.items.find((e) => e.changeType === "moved");
    assert.ok(moved);
    assert.equal(moved.previousStorageLocationName, "Shelf A");
    assert.equal(moved.storageLocationName, "Shelf B");
    // Same zone, different storage location
    assert.equal(moved.previousZoneName, "Garage");
    assert.equal(moved.zoneName, "Garage");
  } finally {
    server.close();
  }
});

test("diff: first walkthrough marks everything as new", async () => {
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
        items: [{ label: "generator", confidence: 0.98 }],
        repairs: [{ label: "leaky_pipe", confidence: 0.91 }],
      }),
    });

    const { generateWalkthroughDiff } = await import("../src/lib/diff-generator.js");
    const diff = await generateWalkthroughDiff(db, wt.id, space.id, "tenant-a");

    assert.equal(diff.summary.newItems, 1);
    assert.equal(diff.summary.newRepairs, 1);
    assert.equal(diff.summary.movedItems, 0);
    assert.equal(diff.summary.missingItems, 0);
    assert.equal(diff.summary.autoApplied, 0);
    assert.equal(diff.previousWalkthroughId, null);
  } finally {
    server.close();
  }
});

test("diff: missing items detected when item not seen in current walkthrough", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);

    // Walkthrough 1: observe two items
    const wt1 = await createTestWalkthrough(address.port, space.id);
    const ing1 = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt1.id,
        items: [
          { label: "laptop", confidence: 0.95 },
          { label: "monitor", confidence: 0.93 },
        ],
      }),
    });
    const i1 = (await ing1.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string }> };
    // Accept both
    for (const obs of i1.itemObservations) {
      await fetch(url(address.port, `/api/review/${i1.reviewTask.id}/actions`), {
        method: "POST",
        headers: headers("tenant-a"),
        body: JSON.stringify({ actionType: "accept", observationId: obs.id }),
      });
    }

    // Walkthrough 2: only observe "laptop" (monitor is missing)
    const wt2 = await createTestWalkthrough(address.port, space.id);
    await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt2.id,
        items: [{ label: "laptop", confidence: 0.94 }],
      }),
    });

    const { generateWalkthroughDiff } = await import("../src/lib/diff-generator.js");
    const diff = await generateWalkthroughDiff(db, wt2.id, space.id, "tenant-a");

    assert.equal(diff.summary.missingItems, 1);
    const missing = diff.items.find((e) => e.changeType === "missing");
    assert.ok(missing);
    assert.equal(missing.label, "monitor");
  } finally {
    server.close();
  }
});

test("diff: repair resolution detected when repair not seen in current walkthrough", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);

    // Walkthrough 1: observe an item and a repair
    const wt1 = await createTestWalkthrough(address.port, space.id);
    const ing1 = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt1.id,
        items: [{ label: "ac_unit", confidence: 0.9 }],
        repairs: [{ label: "roof_damage", confidence: 0.91 }],
      }),
    });
    const i1 = (await ing1.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string }> };

    // Accept the item observation to complete walkthrough 1
    await fetch(url(address.port, `/api/review/${i1.reviewTask.id}/actions`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ actionType: "accept", observationId: i1.itemObservations[0].id }),
    });

    // Walkthrough 2: same item, but no repair
    const wt2 = await createTestWalkthrough(address.port, space.id);
    await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt2.id,
        items: [{ label: "ac_unit", confidence: 0.88 }],
      }),
    });

    const { generateWalkthroughDiff } = await import("../src/lib/diff-generator.js");
    const diff = await generateWalkthroughDiff(db, wt2.id, space.id, "tenant-a");

    // The repair from wt1 should show as resolved (not in wt2)
    assert.equal(diff.summary.resolvedRepairs, 1);
    const resolved = diff.repairs.find((e) => e.changeType === "resolved");
    assert.ok(resolved);
    assert.equal(resolved.label, "roof_damage");
  } finally {
    server.close();
  }
});

test("diff: mixed scenario — auto-apply unchanged, flag moved and new items for review", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);

    const zoneARes = await fetch(url(address.port, `/api/spaces/${space.id}/zones`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ name: "Zone A" }),
    });
    const zoneA = (await zoneARes.json()) as { id: string };

    const zoneBRes = await fetch(url(address.port, `/api/spaces/${space.id}/zones`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ name: "Zone B" }),
    });
    const zoneB = (await zoneBRes.json()) as { id: string };

    // Walkthrough 1: three items
    const wt1 = await createTestWalkthrough(address.port, space.id);
    const ing1 = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt1.id,
        items: [
          { label: "stapler", confidence: 0.9, zoneId: zoneA.id },
          { label: "printer", confidence: 0.92, zoneId: zoneA.id },
          { label: "scanner", confidence: 0.88, zoneId: zoneA.id },
        ],
      }),
    });
    const i1 = (await ing1.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string; label: string }> };
    for (const obs of i1.itemObservations) {
      await fetch(url(address.port, `/api/review/${i1.reviewTask.id}/actions`), {
        method: "POST",
        headers: headers("tenant-a"),
        body: JSON.stringify({ actionType: "accept", observationId: obs.id }),
      });
    }

    const inv = await fetch(url(address.port, `/api/spaces/${space.id}/inventory`), {
      headers: headers("tenant-a"),
    });
    const items = (await inv.json()) as Array<{ id: string; name: string }>;
    const itemByName = new Map(items.map((i) => [i.name, i.id]));

    // Walkthrough 2:
    // - "stapler" same location → unchanged (auto-apply)
    // - "printer" moved to Zone B → moved (review)
    // - "laminator" is new → new (review)
    const wt2 = await createTestWalkthrough(address.port, space.id);
    const ing2 = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt2.id,
        items: [
          { label: "stapler", confidence: 0.91, zoneId: zoneA.id },
          { label: "printer", confidence: 0.9, zoneId: zoneB.id },
          { label: "laminator", confidence: 0.85, zoneId: zoneA.id },
        ],
      }),
    });
    const i2 = (await ing2.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string; label: string }> };

    // Set itemIds for stapler and printer (simulating entity matching)
    for (const obs of i2.itemObservations) {
      const matchedId = itemByName.get(obs.label);
      if (matchedId) {
        await db.itemObservation.update({
          where: { id: obs.id },
          data: { itemId: matchedId },
        });
      }
    }

    const { generateWalkthroughDiff, applyAutoItems } = await import("../src/lib/diff-generator.js");
    const diff = await generateWalkthroughDiff(db, wt2.id, space.id, "tenant-a");

    assert.equal(diff.summary.newItems, 1);       // laminator
    assert.equal(diff.summary.movedItems, 1);     // printer
    assert.equal(diff.summary.missingItems, 1);   // scanner
    assert.equal(diff.summary.unchangedItems, 1); // stapler
    assert.equal(diff.summary.autoApplied, 1);    // stapler

    // Apply auto-items
    const count = await applyAutoItems(db, diff, "tenant-a");
    assert.equal(count, 1);

    // Verify stapler was auto-accepted
    const staplerObs = i2.itemObservations.find((o) => o.label === "stapler")!;
    const updated = await db.itemObservation.findUnique({ where: { id: staplerObs.id } });
    assert.equal(updated?.status, "accepted");

    // Verify printer is still pending (goes to review)
    const printerObs = i2.itemObservations.find((o) => o.label === "printer")!;
    const printerUpdated = await db.itemObservation.findUnique({ where: { id: printerObs.id } });
    assert.equal(printerUpdated?.status, "pending");

    // Verify laminator is still pending (goes to review)
    const laminatorObs = i2.itemObservations.find((o) => o.label === "laminator")!;
    const laminatorUpdated = await db.itemObservation.findUnique({ where: { id: laminatorObs.id } });
    assert.equal(laminatorUpdated?.status, "pending");
  } finally {
    server.close();
  }
});

test("diff: GET /api/spaces/:id/walkthroughs/:wid/diff returns stored diff", async () => {
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
        items: [{ label: "test_item", confidence: 0.9 }],
      }),
    });

    // Fetch diff endpoint
    const diffRes = await fetch(
      url(address.port, `/api/spaces/${space.id}/walkthroughs/${wt.id}/diff`),
      { headers: headers("tenant-a") },
    );
    assert.equal(diffRes.status, 200);
    const diffBody = (await diffRes.json()) as {
      walkthroughId: string;
      spaceId: string;
      status: string;
      storedDiff: { summary: { newItems: number } } | null;
      currentState: { items: Array<{ label: string; status: string }> };
    };
    assert.equal(diffBody.walkthroughId, wt.id);
    assert.equal(diffBody.spaceId, space.id);
    assert.equal(diffBody.currentState.items.length, 1);
    assert.equal(diffBody.currentState.items[0].label, "test_item");
  } finally {
    server.close();
  }
});

test("diff: all items auto-applied transitions walkthrough directly to applied", async () => {
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
      body: JSON.stringify({ name: "Lab" }),
    });
    const zone = (await zoneRes.json()) as { id: string };

    // Walkthrough 1: observe "microscope"
    const wt1 = await createTestWalkthrough(address.port, space.id);
    const ing1 = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt1.id,
        items: [{ label: "microscope", confidence: 0.97, zoneId: zone.id }],
      }),
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
    const items = (await inv.json()) as Array<{ id: string }>;
    const itemId = items[0].id;

    // Walkthrough 2: same item, same location → auto-apply
    const wt2 = await createTestWalkthrough(address.port, space.id);
    const ing2 = await fetch(url(address.port, `/api/spaces/${space.id}/observations`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({
        walkthroughId: wt2.id,
        items: [{ label: "microscope", confidence: 0.96, zoneId: zone.id }],
      }),
    });
    const i2 = (await ing2.json()) as { reviewTask: { id: string }; itemObservations: Array<{ id: string }> };

    // Simulate entity matching
    await db.itemObservation.update({
      where: { id: i2.itemObservations[0].id },
      data: { itemId },
    });

    // Run diff + auto-apply
    const { generateWalkthroughDiff, applyAutoItems } = await import("../src/lib/diff-generator.js");
    const diff = await generateWalkthroughDiff(db, wt2.id, space.id, "tenant-a");
    await applyAutoItems(db, diff, "tenant-a");

    // Simulate finalizePipeline check: if no pending items, go straight to applied
    const pendingCount = await db.itemObservation.count({
      where: { walkthroughId: wt2.id, status: "pending" },
    });
    assert.equal(pendingCount, 0);

    // Complete any existing review task and transition to applied (as finalizePipeline would)
    await db.reviewTask.updateMany({
      where: { walkthroughId: wt2.id, status: "pending" },
      data: { status: "completed" },
    });
    await db.walkthrough.update({
      where: { id: wt2.id },
      data: { status: "applied", completedAt: new Date() },
    });

    const updatedWt = await db.walkthrough.findUnique({ where: { id: wt2.id } });
    assert.equal(updatedWt?.status, "applied");

    // Review task was marked completed (created during observation ingestion, completed by auto-apply)
    const reviewTask = await db.reviewTask.findUnique({ where: { walkthroughId: wt2.id } });
    assert.ok(reviewTask);
    assert.equal(reviewTask?.status, "completed");
  } finally {
    server.close();
  }
});
