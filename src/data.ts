import type { PrismaClient } from "@prisma/client";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function ensureSpace(
  db: PrismaClient,
  spaceId: string,
  tenantId: string,
) {
  const space = await db.space.findUnique({ where: { id: spaceId } });
  if (!space || space.tenantId !== tenantId) return null;
  return space;
}

async function ensureWalkthrough(
  db: PrismaClient,
  walkthroughId: string,
  tenantId: string,
) {
  const wt = await db.walkthrough.findUnique({ where: { id: walkthroughId } });
  if (!wt || wt.tenantId !== tenantId) return null;
  return wt;
}

// ── Spaces ────────────────────────────────────────────────────────────────────

export async function createSpace(
  db: PrismaClient,
  params: { tenantId: string; name: string; description?: string },
) {
  return db.space.create({
    data: {
      tenantId: params.tenantId,
      name: params.name,
      description: params.description?.trim() || null,
    },
  });
}

export async function getSpace(
  db: PrismaClient,
  spaceId: string,
  tenantId: string,
) {
  const space = await ensureSpace(db, spaceId, tenantId);
  if (!space) return null;

  const [itemCount, repairCount] = await Promise.all([
    db.inventoryItem.count({ where: { spaceId, tenantId } }),
    db.repairIssue.count({ where: { spaceId, tenantId } }),
  ]);

  return { ...space, itemCount, repairCount };
}

export async function listSpaces(db: PrismaClient, tenantId: string) {
  return db.space.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

// ── Walkthroughs ──────────────────────────────────────────────────────────────

export async function createWalkthrough(
  db: PrismaClient,
  params: { spaceId: string; tenantId: string; metadata?: Record<string, unknown> },
) {
  return db.walkthrough.create({
    data: {
      spaceId: params.spaceId,
      tenantId: params.tenantId,
      status: "uploaded",
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    },
  });
}

export async function listWalkthroughs(
  db: PrismaClient,
  spaceId: string,
  tenantId: string,
) {
  return db.walkthrough.findMany({
    where: { spaceId, tenantId },
    orderBy: { uploadedAt: "desc" },
    take: 100,
  });
}

export async function getWalkthrough(
  db: PrismaClient,
  walkthroughId: string,
  tenantId: string,
) {
  return ensureWalkthrough(db, walkthroughId, tenantId);
}

export async function startProcessing(
  db: PrismaClient,
  walkthroughId: string,
  tenantId: string,
) {
  const wt = await ensureWalkthrough(db, walkthroughId, tenantId);
  if (!wt) return null;
  if (wt.status !== "uploaded") return null;

  return db.walkthrough.update({
    where: { id: walkthroughId },
    data: { status: "processing", processedAt: new Date() },
  });
}

// ── Observations (Ingestion) ──────────────────────────────────────────────────

export type ObservationItemInput = {
  label: string;
  confidence?: number;
  zoneId?: string;
  storageLocationId?: string;
  bbox?: string;
  keyframeUrl?: string;
};

export type ObservationRepairInput = {
  label: string;
  confidence?: number;
  zoneId?: string;
  bbox?: string;
  keyframeUrl?: string;
};

export async function ingestObservations(
  db: PrismaClient,
  params: {
    walkthroughId: string;
    spaceId: string;
    tenantId: string;
    items?: ObservationItemInput[];
    repairs?: ObservationRepairInput[];
  },
) {
  const wt = await db.walkthrough.findUnique({ where: { id: params.walkthroughId } });
  if (!wt || wt.tenantId !== params.tenantId || wt.spaceId !== params.spaceId) {
    return null;
  }
  if (wt.status !== "uploaded" && wt.status !== "processing") {
    return null;
  }

  const itemObservations =
    params.items && params.items.length > 0
      ? await Promise.all(
          params.items.map((item) =>
            db.itemObservation.create({
              data: {
                walkthroughId: params.walkthroughId,
                tenantId: params.tenantId,
                label: item.label,
                confidence: item.confidence ?? null,
                zoneId: item.zoneId || null,
                storageLocationId: item.storageLocationId || null,
                bbox: item.bbox || null,
                keyframeUrl: item.keyframeUrl || null,
                status: "pending",
              },
            }),
          ),
        )
      : [];

  const repairObservations =
    params.repairs && params.repairs.length > 0
      ? await Promise.all(
          params.repairs.map((rep) =>
            db.repairObservation.create({
              data: {
                walkthroughId: params.walkthroughId,
                tenantId: params.tenantId,
                label: rep.label,
                confidence: rep.confidence ?? null,
                zoneId: rep.zoneId || null,
                bbox: rep.bbox || null,
                keyframeUrl: rep.keyframeUrl || null,
                status: "pending",
              },
            }),
          ),
        )
      : [];

  // Upsert review task — one per walkthrough
  const reviewTask = await db.reviewTask.upsert({
    where: { walkthroughId: params.walkthroughId },
    create: {
      walkthroughId: params.walkthroughId,
      tenantId: params.tenantId,
      status: "pending",
    },
    update: { status: "pending" },
  });

  // Transition walkthrough to awaiting_review
  await db.walkthrough.update({
    where: { id: params.walkthroughId },
    data: { status: "awaiting_review" },
  });

  return { itemObservations, repairObservations, reviewTask };
}

// ── Inventory ─────────────────────────────────────────────────────────────────

export async function searchItems(
  db: PrismaClient,
  params: { spaceId: string; tenantId: string; name?: string; zoneId?: string },
) {
  const where: Record<string, unknown> = {
    spaceId: params.spaceId,
    tenantId: params.tenantId,
  };

  if (params.name) {
    where.name = { contains: params.name };
  }

  if (params.zoneId) {
    where.locationHistory = { some: { zoneId: params.zoneId } };
  }

  return db.inventoryItem.findMany({
    where,
    orderBy: { name: "asc" },
    take: 100,
  });
}

export async function getItem(
  db: PrismaClient,
  itemId: string,
  spaceId: string,
  tenantId: string,
) {
  const item = await db.inventoryItem.findUnique({ where: { id: itemId } });
  if (!item || item.tenantId !== tenantId || item.spaceId !== spaceId) {
    return null;
  }

  const locationHistory = await db.itemLocationHistory.findMany({
    where: { itemId },
    orderBy: { observedAt: "desc" },
    take: 50,
    include: {
      zone: { select: { id: true, name: true } },
      storageLocation: { select: { id: true, name: true } },
    },
  });

  const identityLinks = await db.itemIdentityLink.findMany({
    where: { itemId },
    include: { observation: { select: { id: true, label: true, confidence: true } } },
  });

  return { ...item, locationHistory, identityLinks };
}

export async function createItem(
  db: PrismaClient,
  params: {
    spaceId: string;
    tenantId: string;
    name: string;
    category?: string;
    description?: string;
    quantity?: number;
  },
) {
  return db.inventoryItem.create({
    data: {
      spaceId: params.spaceId,
      tenantId: params.tenantId,
      name: params.name,
      category: params.category?.trim() || null,
      description: params.description?.trim() || null,
      quantity: params.quantity ?? 1,
    },
  });
}

// ── Repairs ───────────────────────────────────────────────────────────────────

export async function listRepairs(
  db: PrismaClient,
  params: { spaceId: string; tenantId: string; status?: string },
) {
  const where: Record<string, unknown> = {
    spaceId: params.spaceId,
    tenantId: params.tenantId,
  };
  if (params.status) where.status = params.status;

  return db.repairIssue.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function createRepair(
  db: PrismaClient,
  params: {
    spaceId: string;
    tenantId: string;
    title: string;
    description?: string;
    severity?: string;
    itemId?: string;
  },
) {
  return db.repairIssue.create({
    data: {
      spaceId: params.spaceId,
      tenantId: params.tenantId,
      title: params.title,
      description: params.description?.trim() || null,
      severity: params.severity || null,
      itemId: params.itemId || null,
      status: "open",
    },
  });
}

export async function updateRepairStatus(
  db: PrismaClient,
  issueId: string,
  spaceId: string,
  tenantId: string,
  status: string,
) {
  const issue = await db.repairIssue.findUnique({ where: { id: issueId } });
  if (!issue || issue.tenantId !== tenantId || issue.spaceId !== spaceId) {
    return null;
  }

  const data: Record<string, unknown> = { status };
  if (status === "resolved") data.resolvedAt = new Date();

  return db.repairIssue.update({ where: { id: issueId }, data });
}

// ── Zones ──────────────────────────────────────────────────────────────────────

export async function createZone(
  db: PrismaClient,
  params: { spaceId: string; tenantId: string; name: string; description?: string },
) {
  return db.spaceZone.create({
    data: {
      spaceId: params.spaceId,
      tenantId: params.tenantId,
      name: params.name,
      description: params.description?.trim() || null,
    },
  });
}

export async function listZones(
  db: PrismaClient,
  spaceId: string,
  tenantId: string,
) {
  return db.spaceZone.findMany({
    where: { spaceId, tenantId },
    orderBy: { name: "asc" },
    take: 100,
  });
}

// ── Storage Locations ──────────────────────────────────────────────────────────

export async function createStorageLocation(
  db: PrismaClient,
  params: {
    spaceId: string;
    tenantId: string;
    name: string;
    description?: string;
    parentId?: string;
    zoneId?: string;
  },
) {
  return db.storageLocation.create({
    data: {
      spaceId: params.spaceId,
      tenantId: params.tenantId,
      name: params.name,
      description: params.description?.trim() || null,
      parentId: params.parentId || null,
      zoneId: params.zoneId || null,
    },
  });
}

export async function listStorageLocations(
  db: PrismaClient,
  spaceId: string,
  tenantId: string,
) {
  return db.storageLocation.findMany({
    where: { spaceId, tenantId, parentId: null },
    orderBy: { name: "asc" },
    take: 100,
    include: {
      zone: { select: { id: true, name: true } },
      children: {
        orderBy: { name: "asc" },
        include: {
          zone: { select: { id: true, name: true } },
          children: {
            orderBy: { name: "asc" },
            include: {
              zone: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
}

// ── Media Assets ───────────────────────────────────────────────────────────────

export async function getMediaAsset(
  db: PrismaClient,
  id: string,
  tenantId: string,
) {
  const asset = await db.mediaAsset.findUnique({
    where: { id },
    include: {
      walkthrough: { select: { id: true, spaceId: true, status: true } },
    },
  });
  if (!asset || asset.tenantId !== tenantId) return null;
  return asset;
}

export async function createMediaAsset(
  db: PrismaClient,
  params: {
    walkthroughId: string;
    tenantId: string;
    type: string;
    url: string;
    thumbnailUrl?: string;
  },
) {
  return db.mediaAsset.create({
    data: {
      walkthroughId: params.walkthroughId,
      tenantId: params.tenantId,
      type: params.type,
      url: params.url,
      thumbnailUrl: params.thumbnailUrl || null,
    },
  });
}

// ── Review ────────────────────────────────────────────────────────────────────

export async function listReviewQueue(
  db: PrismaClient,
  tenantId: string,
  status?: string,
) {
  return db.reviewTask.findMany({
    where: { tenantId, status: status || "pending" },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: {
      walkthrough: {
        select: { id: true, spaceId: true, status: true, uploadedAt: true },
      },
    },
  });
}

export async function getReviewTask(
  db: PrismaClient,
  taskId: string,
  tenantId: string,
) {
  const task = await db.reviewTask.findUnique({
    where: { id: taskId },
    include: {
      walkthrough: { select: { id: true, spaceId: true, status: true } },
      actions: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });
  if (!task || task.tenantId !== tenantId) return null;

  const [itemObservations, repairObservations] = await Promise.all([
    db.itemObservation.findMany({
      where: { walkthroughId: task.walkthroughId },
      include: {
        zone: { select: { id: true, name: true } },
        storageLocation: { select: { id: true, name: true } },
      },
    }),
    db.repairObservation.findMany({
      where: { walkthroughId: task.walkthroughId },
      include: {
        zone: { select: { id: true, name: true } },
      },
    }),
  ]);

  return { ...task, itemObservations, repairObservations };
}

export type ReviewActionInput = {
  actionType: string;
  observationId?: string;
  itemId?: string;
  previousLabel?: string;
  newLabel?: string;
  note?: string;
};

export async function processReviewAction(
  db: PrismaClient,
  params: { taskId: string; tenantId: string } & ReviewActionInput,
) {
  const task = await db.reviewTask.findUnique({
    where: { id: params.taskId },
    include: { walkthrough: true },
  });
  if (!task || task.tenantId !== params.tenantId) return null;

  // Record the action
  const action = await db.reviewAction.create({
    data: {
      reviewTaskId: params.taskId,
      tenantId: params.tenantId,
      actionType: params.actionType,
      observationId: params.observationId || null,
      itemId: params.itemId || null,
      previousLabel: params.previousLabel || null,
      newLabel: params.newLabel || null,
      note: params.note?.trim() || null,
    },
  });

  // Process action effects
  if (params.actionType === "accept" || params.actionType === "merge") {
    const obsId = params.observationId;
    if (!obsId) return { action, error: "observationId required for accept/merge" };

    let targetItemId = params.itemId;

    // If no itemId, create a new InventoryItem from the observation
    if (!targetItemId) {
      const obs = await db.itemObservation.findUnique({ where: { id: obsId } });
      if (!obs) return { action, error: "observation not found" };

      const newItem = await db.inventoryItem.create({
        data: {
          spaceId: task.walkthrough.spaceId,
          tenantId: params.tenantId,
          name: obs.label,
        },
      });
      targetItemId = newItem.id;
    }

    // Link observation to item
    await db.itemIdentityLink.upsert({
      where: {
        observationId_itemId: {
          observationId: obsId,
          itemId: targetItemId,
        },
      },
      create: {
        observationId: obsId,
        itemId: targetItemId,
        tenantId: params.tenantId,
        matchConfidence: null,
      },
      update: {},
    });

    // Record location history
    const obs = await db.itemObservation.findUnique({ where: { id: obsId } });
    if (obs) {
      await db.itemLocationHistory.create({
        data: {
          itemId: targetItemId,
          tenantId: params.tenantId,
          zoneId: obs.zoneId,
          storageLocationId: obs.storageLocationId,
          sourceObservationId: obsId,
          observedAt: new Date(),
        },
      });
    }

    // Update observation status
    await db.itemObservation.update({
      where: { id: obsId },
      data: { status: "accepted", itemId: targetItemId },
    });
  } else if (params.actionType === "reject") {
    if (params.observationId) {
      await db.itemObservation.update({
        where: { id: params.observationId },
        data: { status: "rejected" },
      });
    }
  } else if (params.actionType === "relabel") {
    if (params.observationId && params.newLabel) {
      await db.itemObservation.update({
        where: { id: params.observationId },
        data: { label: params.newLabel },
      });
    }
  }

  // Check if all observations have been processed
  const pendingCount = await db.itemObservation.count({
    where: { walkthroughId: task.walkthroughId, status: "pending" },
  });

  if (pendingCount === 0) {
    await db.walkthrough.update({
      where: { id: task.walkthroughId },
      data: { status: "applied", completedAt: new Date() },
    });
    await db.reviewTask.update({
      where: { id: params.taskId },
      data: { status: "completed" },
    });
  }

  return { action };
}
