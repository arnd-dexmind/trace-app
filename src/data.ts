import type { PrismaClient } from "@prisma/client";
import { enqueuePipeline } from "./lib/job-queue.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

export interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
}

async function paginate<T extends { id: string }>(
  findMany: (take: number) => Promise<T[]>,
  cursor?: string,
  limit?: number,
): Promise<PaginatedResult<T>> {
  const take = Math.min(limit && limit > 0 ? limit : DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) + 1;
  const results = await findMany(take);
  const hasMore = results.length >= take;
  const data = results.slice(0, take - 1);
  const nextCursor = hasMore && data.length > 0 ? data[data.length - 1].id : null;
  return { data, nextCursor };
}

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

export async function listSpaces(
  db: PrismaClient,
  tenantId: string,
  cursor?: string,
  limit?: number,
) {
  const result = await paginate(
    (take) =>
      db.space.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
    cursor,
    limit,
  );

  const counts = await Promise.all(
    result.data.map((s) =>
      Promise.all([
        db.inventoryItem.count({ where: { spaceId: s.id, tenantId } }),
        db.spaceZone.count({ where: { spaceId: s.id, tenantId } }),
      ]),
    ),
  );

  const data = result.data.map((s, i) => ({
    ...s,
    itemCount: counts[i][0],
    zoneCount: counts[i][1],
  }));

  return { data, nextCursor: result.nextCursor };
}

export async function updateSpace(
  db: PrismaClient,
  spaceId: string,
  tenantId: string,
  params: { name?: string; description?: string },
) {
  const space = await ensureSpace(db, spaceId, tenantId);
  if (!space) return null;

  return db.space.update({
    where: { id: spaceId },
    data: {
      ...(params.name !== undefined ? { name: params.name } : {}),
      ...(params.description !== undefined ? { description: params.description.trim() || null } : {}),
    },
  });
}

export async function deleteSpace(
  db: PrismaClient,
  spaceId: string,
  tenantId: string,
) {
  const space = await ensureSpace(db, spaceId, tenantId);
  if (!space) return null;

  await db.space.delete({ where: { id: spaceId } });
  return { deleted: true, id: spaceId };
}

// ── Walkthroughs ──────────────────────────────────────────────────────────────

export async function createWalkthrough(
  db: PrismaClient,
  params: { spaceId: string; tenantId: string; metadata?: Record<string, unknown> },
) {
  const walkthrough = await db.walkthrough.create({
    data: {
      spaceId: params.spaceId,
      tenantId: params.tenantId,
      status: "uploaded",
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    },
  });

  // Auto-enqueue the processing pipeline
  await enqueuePipeline(db, {
    walkthroughId: walkthrough.id,
    tenantId: params.tenantId,
  });

  return walkthrough;
}

export async function listWalkthroughs(
  db: PrismaClient,
  spaceId: string,
  tenantId: string,
  cursor?: string,
  limit?: number,
): Promise<PaginatedResult<Awaited<ReturnType<typeof db.walkthrough.findMany>>[number]>> {
  return paginate(
    (take) =>
      db.walkthrough.findMany({
        where: { spaceId, tenantId },
        orderBy: { uploadedAt: "desc" },
        take,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
    cursor,
    limit,
  );
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
  if (wt.status !== "uploaded" && wt.status !== "processing" && wt.status !== "awaiting_review") {
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
  params: { spaceId: string; tenantId: string; name?: string; zoneId?: string; cursor?: string; limit?: number },
): Promise<PaginatedResult<Awaited<ReturnType<typeof db.inventoryItem.findMany>>[number] & { latestLocation: unknown }>> {
  const limit = params.limit;
  const cursor = params.cursor;

  let items: Awaited<ReturnType<typeof db.inventoryItem.findMany>>;

  if (params.name && params.name.trim()) {
    const query = params.name.trim();
    const take = Math.min(limit && limit > 0 ? limit : DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) + 1;

    // Build prefix-aware tsquery: each word gets :* for prefix matching
    const prefixQuery = query
      .split(/\s+/)
      .map((w) => `${w}:*`)
      .join(" & ");

    // Full-text search with ts_rank for ranking — pagination via LIMIT/OFFSET
    const _offset = cursor ? 1 : 0; // simplified: cursor not supported for FTS
    items = await db.$queryRaw`
      SELECT i.id, i."spaceId", i."tenantId", i.name, i.category, i.description, i.quantity, i."createdAt", i."updatedAt",
             ts_rank(i."searchVector", to_tsquery('english', ${prefixQuery})) AS rank
      FROM "InventoryItem" i
      WHERE i."spaceId" = ${params.spaceId}
        AND i."tenantId" = ${params.tenantId}
        AND i."searchVector" @@ to_tsquery('english', ${prefixQuery})
      ORDER BY rank DESC
      LIMIT ${take}
    `;
  } else {
    items = await db.inventoryItem.findMany({
      where: {
        spaceId: params.spaceId,
        tenantId: params.tenantId,
        ...(params.zoneId ? { locationHistory: { some: { zoneId: params.zoneId } } } : {}),
      },
      orderBy: { name: "asc" },
      take: Math.min(limit && limit > 0 ? limit : DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  const hasMore = items.length > Math.min(limit && limit > 0 ? limit : DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const data = items.slice(0, Math.min(limit && limit > 0 ? limit : DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE));
  const nextCursor = hasMore && data.length > 0 ? data[data.length - 1].id : null;

  if (data.length === 0) return { data: [], nextCursor: null };

  const itemIds = data.map((i) => i.id);
  const allHistory = await db.itemLocationHistory.findMany({
    where: { itemId: { in: itemIds } },
    orderBy: { observedAt: "desc" },
    include: {
      zone: { select: { id: true, name: true } },
      storageLocation: { select: { id: true, name: true } },
    },
  });

  const latestByItemId = new Map<string, (typeof allHistory)[number]>();
  for (const h of allHistory) {
    if (!latestByItemId.has(h.itemId)) latestByItemId.set(h.itemId, h);
  }

  return {
    data: data.map((item) => ({
      ...item,
      latestLocation: latestByItemId.get(item.id) ?? null,
    })),
    nextCursor,
  };
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
    include: { observation: { select: { id: true, label: true, confidence: true, keyframeUrl: true } } },
  });

  const repairIssues = await db.repairIssue.findMany({
    where: { itemId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return { ...item, locationHistory, identityLinks, repairIssues };
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
  params: { spaceId: string; tenantId: string; status?: string; cursor?: string; limit?: number },
): Promise<PaginatedResult<Awaited<ReturnType<typeof db.repairIssue.findMany>>[number]>> {
  const where: Record<string, unknown> = {
    spaceId: params.spaceId,
    tenantId: params.tenantId,
  };
  if (params.status) where.status = params.status;

  return paginate(
    (take) =>
      db.repairIssue.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
      }),
    params.cursor,
    params.limit,
  );
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

export async function getRepair(
  db: PrismaClient,
  issueId: string,
  spaceId: string,
  tenantId: string,
) {
  const issue = await db.repairIssue.findUnique({
    where: { id: issueId },
    include: { item: true, repairObservations: { include: { walkthrough: true } } },
  });
  if (!issue || issue.tenantId !== tenantId || issue.spaceId !== spaceId) {
    return null;
  }
  return issue;
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
  cursor?: string,
  limit?: number,
): Promise<PaginatedResult<Awaited<ReturnType<typeof db.spaceZone.findMany>>[number]>> {
  return paginate(
    (take) =>
      db.spaceZone.findMany({
        where: { spaceId, tenantId },
        orderBy: { name: "asc" },
        take,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
    cursor,
    limit,
  );
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
  cursor?: string,
  limit?: number,
): Promise<PaginatedResult<Awaited<ReturnType<typeof db.storageLocation.findMany>>[number]>> {
  return paginate(
    (take) =>
      db.storageLocation.findMany({
        where: { spaceId, tenantId, parentId: null },
        orderBy: { name: "asc" },
        take,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
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
      }),
    cursor,
    limit,
  );
}

// ── Diff ─────────────────────────────────────────────────────────────────────

export async function getWalkthroughDiff(
  db: PrismaClient,
  walkthroughId: string,
  tenantId: string,
) {
  const wt = await db.walkthrough.findUnique({
    where: { id: walkthroughId },
    select: { id: true, metadata: true, tenantId: true, spaceId: true, status: true },
  });
  if (!wt || wt.tenantId !== tenantId) return null;

  const meta = wt.metadata ? JSON.parse(String(wt.metadata)) : {};
  const storedDiff = meta.diff ?? null;

  // Always include current observation state alongside stored diff summary
  const [itemObs, repairObs] = await Promise.all([
    db.itemObservation.findMany({
      where: { walkthroughId },
      include: {
        zone: { select: { id: true, name: true } },
        storageLocation: { select: { id: true, name: true } },
        item: { select: { id: true, name: true } },
      },
    }),
    db.repairObservation.findMany({
      where: { walkthroughId },
      include: { zone: { select: { id: true, name: true } } },
    }),
  ]);

  return {
    walkthroughId: wt.id,
    spaceId: wt.spaceId,
    status: wt.status,
    storedDiff,
    currentState: {
      items: itemObs.map((o) => ({
        id: o.id,
        label: o.label,
        status: o.status,
        itemId: o.itemId,
        itemName: o.item?.name ?? null,
        zoneName: o.zone?.name ?? null,
        storageLocationName: o.storageLocation?.name ?? null,
        confidence: o.confidence,
      })),
      repairs: repairObs.map((r) => ({
        id: r.id,
        label: r.label,
        status: r.status,
        zoneName: r.zone?.name ?? null,
        confidence: r.confidence,
      })),
    },
  };
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

// ── Item Aliases ──────────────────────────────────────────────────────────────

export async function listAliases(
  db: PrismaClient,
  itemId: string,
  tenantId: string,
  cursor?: string,
  limit?: number,
): Promise<PaginatedResult<Awaited<ReturnType<typeof db.itemAlias.findMany>>[number]>> {
  return paginate(
    (take) =>
      db.itemAlias.findMany({
        where: { itemId, tenantId },
        orderBy: { createdAt: "desc" },
        take,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
    cursor,
    limit,
  );
}

export async function createAlias(
  db: PrismaClient,
  params: { itemId: string; tenantId: string; alias: string; source?: string },
) {
  return db.itemAlias.create({
    data: {
      itemId: params.itemId,
      tenantId: params.tenantId,
      alias: params.alias.trim(),
      source: params.source ?? "operator",
    },
  });
}

export async function deleteAlias(
  db: PrismaClient,
  aliasId: string,
  itemId: string,
  tenantId: string,
) {
  const alias = await db.itemAlias.findUnique({ where: { id: aliasId } });
  if (!alias || alias.itemId !== itemId || alias.tenantId !== tenantId) return null;
  await db.itemAlias.delete({ where: { id: aliasId } });
  return alias;
}

/** Fetch all aliases for a set of items, grouped by itemId. */
export async function getAliasesForItems(
  db: PrismaClient,
  itemIds: string[],
  tenantId: string,
): Promise<Map<string, string[]>> {
  if (itemIds.length === 0) return new Map();
  const rows = await db.itemAlias.findMany({
    where: { itemId: { in: itemIds }, tenantId },
    select: { itemId: true, alias: true },
  });
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const aliases = map.get(row.itemId) ?? [];
    aliases.push(row.alias);
    map.set(row.itemId, aliases);
  }
  return map;
}

// ── Walkthrough Results ────────────────────────────────────────────────────────

export interface WalkthroughResults {
  walkthroughId: string;
  spaceId: string;
  status: string;
  summary: {
    total: number;
    new: number;
    matched: number;
    relocated: number;
    missing: number;
  };
  items: WalkthroughResultItem[];
}

export interface WalkthroughResultItem {
  id: string;
  label: string;
  confidence: number | null;
  resultStatus: "new" | "matched" | "relocated" | "missing";
  category: string | null;
  zoneName: string | null;
  storageLocationName: string | null;
  keyframeUrl: string | null;
  itemId: string | null;
  itemName: string | null;
  previousZoneName: string | null;
  frameRef: string | null;
}

export async function getWalkthroughResults(
  db: PrismaClient,
  walkthroughId: string,
  tenantId: string,
): Promise<WalkthroughResults | null> {
  const wt = await db.walkthrough.findUnique({
    where: { id: walkthroughId },
    select: { id: true, spaceId: true, status: true, tenantId: true, metadata: true },
  });
  if (!wt || wt.tenantId !== tenantId) return null;

  const observations = await db.itemObservation.findMany({
    where: { walkthroughId },
    include: {
      zone: { select: { id: true, name: true } },
      storageLocation: { select: { id: true, name: true } },
      item: { select: { id: true, name: true, category: true } },
      identityLinks: {
        include: {
          item: { select: { id: true, name: true, category: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Collect item IDs linked to observations for location comparison
  const linkedItemIds = new Set<string>();
  for (const obs of observations) {
    if (obs.itemId) linkedItemIds.add(obs.itemId);
    for (const link of obs.identityLinks) {
      linkedItemIds.add(link.itemId);
    }
  }

  // Fetch last known location for each linked item (before this walkthrough)
  const prevLocations = new Map<string, { zoneName: string | null }>();
  if (linkedItemIds.size > 0) {
    const history = await db.itemLocationHistory.findMany({
      where: {
        itemId: { in: [...linkedItemIds] },
        sourceObservation: { walkthroughId: { not: walkthroughId } },
      },
      orderBy: { observedAt: "desc" },
      include: { zone: { select: { name: true } } },
    });
    for (const h of history) {
      if (!prevLocations.has(h.itemId)) {
        prevLocations.set(h.itemId, { zoneName: h.zone?.name ?? null });
      }
    }
  }

  // Also check for items that were in previous walkthroughs but missing now
  const prevWalkthrough = await db.walkthrough.findFirst({
    where: { spaceId: wt.spaceId, tenantId, id: { not: walkthroughId } },
    orderBy: { uploadedAt: "desc" },
    select: { id: true },
  });

  let missingItems: WalkthroughResultItem[] = [];
  if (prevWalkthrough) {
    const prevObs = await db.itemObservation.findMany({
      where: { walkthroughId: prevWalkthrough.id, itemId: { not: null } },
      select: { itemId: true, item: { select: { id: true, name: true, category: true } }, zone: { select: { name: true } } },
    });
    const currentItemIds = new Set<string>();
    for (const obs of observations) {
      if (obs.itemId) currentItemIds.add(obs.itemId);
      for (const link of obs.identityLinks) currentItemIds.add(link.itemId);
    }

    const seen = new Set<string>();
    for (const po of prevObs) {
      if (!po.itemId || currentItemIds.has(po.itemId) || seen.has(po.itemId)) continue;
      seen.add(po.itemId);
      missingItems.push({
        id: `missing-${po.itemId}`,
        label: po.item?.name ?? "Unknown Item",
        confidence: null,
        resultStatus: "missing",
        category: po.item?.category ?? null,
        zoneName: po.zone?.name ?? null,
        storageLocationName: null,
        keyframeUrl: null,
        itemId: po.itemId,
        itemName: po.item?.name ?? null,
        previousZoneName: po.zone?.name ?? null,
        frameRef: null,
      });
    }
  }

  const items: WalkthroughResultItem[] = observations.map((obs) => {
    const effectiveItemId = obs.itemId ?? obs.identityLinks[0]?.itemId ?? null;
    const effectiveItemName = obs.item?.name ?? obs.identityLinks[0]?.item.name ?? null;
    const effectiveCategory = obs.item?.category ?? obs.identityLinks[0]?.item.category ?? null;
    const prevLoc = effectiveItemId ? prevLocations.get(effectiveItemId) : null;
    const currentZone = obs.zone?.name ?? null;

    let resultStatus: WalkthroughResultItem["resultStatus"] = "new";
    if (effectiveItemId) {
      if (prevLoc && currentZone && prevLoc.zoneName !== currentZone) {
        resultStatus = "relocated";
      } else {
        resultStatus = "matched";
      }
    }

    const frameRef = extractFrameRef(obs.keyframeUrl);

    return {
      id: obs.id,
      label: obs.label,
      confidence: obs.confidence,
      resultStatus,
      category: effectiveCategory,
      zoneName: currentZone,
      storageLocationName: obs.storageLocation?.name ?? null,
      keyframeUrl: obs.keyframeUrl,
      itemId: effectiveItemId,
      itemName: effectiveItemName,
      previousZoneName: prevLoc?.zoneName ?? null,
      frameRef,
    };
  });

  // Fallback: if no observations and no missing items, return stub data for dev UX
  const allItems = [...items, ...missingItems];

  if (allItems.length === 0) {
    // Return empty results rather than null — the page handles empty state
    return {
      walkthroughId: wt.id,
      spaceId: wt.spaceId,
      status: wt.status,
      summary: { total: 0, new: 0, matched: 0, relocated: 0, missing: 0 },
      items: [],
    };
  }

  const summary = {
    total: allItems.length,
    new: allItems.filter((i) => i.resultStatus === "new").length,
    matched: allItems.filter((i) => i.resultStatus === "matched").length,
    relocated: allItems.filter((i) => i.resultStatus === "relocated").length,
    missing: allItems.filter((i) => i.resultStatus === "missing").length,
  };

  return { walkthroughId: wt.id, spaceId: wt.spaceId, status: wt.status, summary, items: allItems };
}

function extractFrameRef(keyframeUrl: string | null): string | null {
  if (!keyframeUrl) return null;
  const match = keyframeUrl.match(/frame[_-]?(\d+)/i);
  if (match) {
    const frameNum = parseInt(match[1], 10);
    const totalSecs = Math.floor(frameNum / 30);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `Frame ${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}:${String(frameNum % 30).padStart(2, "0")}`;
  }
  return null;
}

export async function bulkProcessResults(
  db: PrismaClient,
  params: {
    walkthroughId: string;
    tenantId: string;
    observationIds: string[];
    action: "accept" | "mark_review";
  },
) {
  const wt = await db.walkthrough.findUnique({ where: { id: params.walkthroughId } });
  if (!wt || wt.tenantId !== params.tenantId) return null;

  const newStatus = params.action === "accept" ? "accepted" : "pending";

  await db.itemObservation.updateMany({
    where: { id: { in: params.observationIds }, walkthroughId: params.walkthroughId },
    data: { status: newStatus },
  });

  // If accepting, also create identity links and location history for unlinked items
  if (params.action === "accept") {
    const observations = await db.itemObservation.findMany({
      where: { id: { in: params.observationIds }, itemId: null },
    });

    for (const obs of observations) {
      // Create a new inventory item for unlinked observations
      const newItem = await db.inventoryItem.create({
        data: {
          spaceId: wt.spaceId,
          tenantId: params.tenantId,
          name: obs.label,
        },
      });

      await db.itemIdentityLink.create({
        data: {
          observationId: obs.id,
          itemId: newItem.id,
          tenantId: params.tenantId,
          matchConfidence: obs.confidence,
        },
      });

      await db.itemLocationHistory.create({
        data: {
          itemId: newItem.id,
          tenantId: params.tenantId,
          zoneId: obs.zoneId,
          storageLocationId: obs.storageLocationId,
          sourceObservationId: obs.id,
          observedAt: new Date(),
        },
      });

      await db.itemObservation.update({
        where: { id: obs.id },
        data: { itemId: newItem.id },
      });
    }
  }

  return { processed: params.observationIds.length, action: params.action };
}

// ── Review ────────────────────────────────────────────────────────────────────

export async function listReviewQueue(
  db: PrismaClient,
  tenantId: string,
  status?: string,
  cursor?: string,
  limit?: number,
): Promise<PaginatedResult<Awaited<ReturnType<typeof db.reviewTask.findMany>>[number]>> {
  return paginate(
    (take) =>
      db.reviewTask.findMany({
        where: { tenantId, status: status || "pending" },
        orderBy: { createdAt: "asc" },
        take,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          walkthrough: {
            select: { id: true, spaceId: true, status: true, uploadedAt: true },
          },
        },
      }),
    cursor,
    limit,
  );
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
        identityLinks: {
          include: {
            item: { select: { id: true, name: true } },
          },
        },
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
