import type { PrismaClient } from "@prisma/client";

export interface AnalyticsParams {
  tenantId: string;
  days: number;
}

export interface ProcessingStats {
  total: number;
  completed: number;
  failed: number;
  avgDurationMs: number | null;
  byDay: { date: string; count: number }[];
}

export interface EngagementStats {
  totalItems: number;
  itemsTracked: { date: string; count: number }[];
  repairsOpened: number;
  repairsResolved: number;
  repairsBySeverity: { severity: string; count: number }[];
  walkthroughsPerUser: { userId: string; count: number }[];
  activeUsers: { dau: number; wau: number; mau: number };
}

export interface InventoryBreakdown {
  categories: { category: string; count: number }[];
  itemsPerSpace: { spaceName: string; count: number }[];
}

export interface AnalyticsSnapshot {
  processing: ProcessingStats;
  engagement: EngagementStats;
  inventory: InventoryBreakdown;
}

export interface SpaceOverview {
  totalItems: number;
  totalRepairs: number;
  totalZones: number;
  totalWalkthroughs: number;
}

export async function getAnalytics(
  db: PrismaClient,
  params: AnalyticsParams,
): Promise<AnalyticsSnapshot> {
  const cutoff = new Date(Date.now() - params.days * 86400000).toISOString();

  const [processing, engagement, inventory] = await Promise.all([
    getProcessingStats(db, params.tenantId, cutoff),
    getEngagementStats(db, params.tenantId, cutoff),
    getInventoryBreakdown(db, params.tenantId),
  ]);

  return { processing, engagement, inventory };
}

async function getProcessingStats(
  db: PrismaClient,
  tenantId: string,
  cutoff: string,
): Promise<ProcessingStats> {
  const rows = await db.$queryRawUnsafe<
    { date: string; count: bigint; avg_ms: number | null }[]
  >(
    `SELECT
       DATE("uploadedAt") AS date,
       COUNT(*)::int AS count,
       AVG(EXTRACT(EPOCH FROM ("completedAt" - "uploadedAt")) * 1000) AS avg_ms
     FROM "Walkthrough"
     WHERE "tenantId" = $1 AND "uploadedAt" >= $2::timestamp
     GROUP BY DATE("uploadedAt")
     ORDER BY date`,
    tenantId,
    cutoff,
  );

  // Aggregate summary stats from the daily rows
  let total = 0;
  let completed = 0;

  const byDay = rows.map((r) => {
    const count = Number(r.count);
    total += count;
    return { date: r.date, count };
  });

  const statusRows = await db.$queryRawUnsafe<
    { status: string; count: bigint }[]
  >(
    `SELECT status, COUNT(*)::int AS count
     FROM "Walkthrough"
     WHERE "tenantId" = $1 AND "uploadedAt" >= $2::timestamp
     GROUP BY status`,
    tenantId,
    cutoff,
  );

  for (const r of statusRows) {
    if (r.status === "applied" || r.status === "awaiting_review") {
      completed += Number(r.count);
    }
  }

  const failedCount = statusRows.filter((r) => r.status === "failed").reduce((s, r) => s + Number(r.count), 0);

  // Compute average duration from completed walkthroughs
  const durRows = await db.$queryRawUnsafe<
    { avg_ms: number | null }[]
  >(
    `SELECT AVG(EXTRACT(EPOCH FROM ("completedAt" - "uploadedAt")) * 1000)::float AS avg_ms
     FROM "Walkthrough"
     WHERE "tenantId" = $1 AND "completedAt" IS NOT NULL AND "uploadedAt" >= $2::timestamp`,
    tenantId,
    cutoff,
  );

  return {
    total,
    completed,
    failed: failedCount,
    avgDurationMs: durRows[0]?.avg_ms ?? null,
    byDay,
  };
}

async function getEngagementStats(
  db: PrismaClient,
  tenantId: string,
  cutoff: string,
): Promise<EngagementStats> {
  // Total items and items tracked per day (via observations)
  const [totalItems, itemsPerDay, repairCounts, severityBreakdown, wuPerUser, activeUsers] =
    await Promise.all([
      db.inventoryItem.count({ where: { tenantId } }),

      db.$queryRawUnsafe<{ date: string; count: bigint }[]>(
        `SELECT DATE("createdAt") AS date, COUNT(*)::int AS count
         FROM "ItemObservation"
         WHERE "tenantId" = $1 AND "createdAt" >= $2::timestamp
         GROUP BY DATE("createdAt")
         ORDER BY date`,
        tenantId,
        cutoff,
      ),

      db.$queryRawUnsafe<{ status: string; count: bigint }[]>(
        `SELECT status, COUNT(*)::int AS count
         FROM "RepairIssue"
         WHERE "tenantId" = $1 AND "createdAt" >= $2::timestamp
         GROUP BY status`,
        tenantId,
        cutoff,
      ),

      db.$queryRawUnsafe<{ severity: string; count: bigint }[]>(
        `SELECT COALESCE(severity, 'unspecified') AS severity, COUNT(*)::int AS count
         FROM "RepairIssue"
         WHERE "tenantId" = $1 AND "createdAt" >= $2::timestamp
         GROUP BY severity
         ORDER BY count DESC`,
        tenantId,
        cutoff,
      ),

      db.$queryRawUnsafe<{ user_id: string; count: bigint }[]>(
        `SELECT wt."tenantId" AS user_id, COUNT(*)::int AS count
         FROM "Walkthrough" wt
         WHERE wt."tenantId" = $1 AND wt."uploadedAt" >= $2::timestamp
         GROUP BY wt."tenantId"
         ORDER BY count DESC`,
        tenantId,
        cutoff,
      ),

      getActiveUsers(db, tenantId),
    ]);

  const repairsOpened = repairCounts
    .filter((r) => r.status === "open")
    .reduce((s, r) => s + Number(r.count), 0);
  const repairsResolved = repairCounts
    .filter((r) => r.status === "resolved")
    .reduce((s, r) => s + Number(r.count), 0);

  return {
    totalItems,
    itemsTracked: itemsPerDay.map((r) => ({ date: r.date, count: Number(r.count) })),
    repairsOpened,
    repairsResolved,
    repairsBySeverity: severityBreakdown.map((r) => ({
      severity: r.severity,
      count: Number(r.count),
    })),
    walkthroughsPerUser: wuPerUser.map((r) => ({
      userId: r.user_id,
      count: Number(r.count),
    })),
    activeUsers,
  };
}

async function getActiveUsers(
  db: PrismaClient,
  tenantId: string,
): Promise<{ dau: number; wau: number; mau: number }> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 86400000).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

  const [dauRow, wauRow, mauRow] = await Promise.all([
    db.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(DISTINCT "userId")::int AS count
       FROM "UserTenant"
       WHERE "tenantId" = $1 AND "tenantId" IN (
         SELECT "tenantId" FROM "Walkthrough" WHERE "uploadedAt" >= $2::timestamp
       )`,
      tenantId,
      dayAgo,
    ),
    db.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(DISTINCT "userId")::int AS count
       FROM "UserTenant"
       WHERE "tenantId" = $1 AND "tenantId" IN (
         SELECT "tenantId" FROM "Walkthrough" WHERE "uploadedAt" >= $2::timestamp
       )`,
      tenantId,
      weekAgo,
    ),
    db.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(DISTINCT "userId")::int AS count
       FROM "UserTenant"
       WHERE "tenantId" = $1 AND "tenantId" IN (
         SELECT "tenantId" FROM "Walkthrough" WHERE "uploadedAt" >= $2::timestamp
       )`,
      tenantId,
      monthAgo,
    ),
  ]);

  return {
    dau: Number(dauRow[0]?.count ?? 0),
    wau: Number(wauRow[0]?.count ?? 0),
    mau: Number(mauRow[0]?.count ?? 0),
  };
}

async function getInventoryBreakdown(
  db: PrismaClient,
  tenantId: string,
): Promise<InventoryBreakdown> {
  const [catRows, spaceRows] = await Promise.all([
    db.$queryRawUnsafe<{ category: string; count: bigint }[]>(
      `SELECT COALESCE(category, 'uncategorized') AS category, COUNT(*)::int AS count
       FROM "InventoryItem"
       WHERE "tenantId" = $1
       GROUP BY category
       ORDER BY count DESC`,
      tenantId,
    ),
    db.$queryRawUnsafe<{ name: string; count: bigint }[]>(
      `SELECT s.name, COUNT(ii.id)::int AS count
       FROM "InventoryItem" ii
       JOIN "Space" s ON s.id = ii."spaceId"
       WHERE ii."tenantId" = $1
       GROUP BY s.name
       ORDER BY count DESC`,
      tenantId,
    ),
  ]);

  return {
    categories: catRows.map((r) => ({ category: r.category, count: Number(r.count) })),
    itemsPerSpace: spaceRows.map((r) => ({ spaceName: r.name, count: Number(r.count) })),
  };
}

export async function getSpaceOverview(
  db: PrismaClient,
  tenantId: string,
  spaceId: string,
): Promise<SpaceOverview> {
  const [totalItems, totalRepairs, totalZones, totalWalkthroughs] = await Promise.all([
    db.inventoryItem.count({ where: { tenantId, spaceId } }),
    db.repairIssue.count({ where: { tenantId, spaceId } }),
    db.spaceZone.count({ where: { tenantId, spaceId } }),
    db.walkthrough.count({ where: { tenantId, spaceId } }),
  ]);

  return { totalItems, totalRepairs, totalZones, totalWalkthroughs };
}
