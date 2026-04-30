import type { PrismaClient } from "@prisma/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DiffEntry {
  observationId: string;
  label: string;
  itemId: string | null;
  zoneId: string | null;
  zoneName: string | null;
  storageLocationId: string | null;
  storageLocationName: string | null;
  confidence: number | null;
  changeType: "new" | "moved" | "missing" | "unchanged" | "resolved";
  previousZoneName: string | null;
  previousStorageLocationName: string | null;
  autoApplied: boolean;
  /** Identity resolution classification from entity_matching stage */
  resolutionClass: "matched" | "ambiguous" | "likely_new" | null;
  /** Suggested item IDs from identity resolution (for ambiguous items) */
  suggestedItemIds: string[];
}

export interface WalkthroughDiff {
  items: DiffEntry[];
  repairs: DiffEntry[];
  summary: {
    totalChanges: number;
    newItems: number;
    movedItems: number;
    missingItems: number;
    unchangedItems: number;
    newRepairs: number;
    resolvedRepairs: number;
    autoApplied: number;
  };
  previousWalkthroughId: string | null;
}

// ── Main diff generation ─────────────────────────────────────────────────────

export async function generateWalkthroughDiff(
  db: PrismaClient,
  walkthroughId: string,
  spaceId: string,
  tenantId: string,
): Promise<WalkthroughDiff> {
  const current = await db.walkthrough.findUnique({
    where: { id: walkthroughId },
  });
  if (!current) {
    return emptyDiff();
  }

  const previous = await db.walkthrough.findFirst({
    where: {
      spaceId,
      tenantId,
      status: "applied",
      id: { not: walkthroughId },
    },
    orderBy: { completedAt: "desc" },
  });

  const [currentItems, currentRepairs] = await Promise.all([
    db.itemObservation.findMany({
      where: { walkthroughId, tenantId },
      include: {
        zone: { select: { id: true, name: true } },
        storageLocation: { select: { id: true, name: true } },
        identityLinks: { select: { itemId: true } },
      },
    }),
    db.repairObservation.findMany({
      where: { walkthroughId, tenantId },
      include: { zone: { select: { id: true, name: true } } },
    }),
  ]);

  // First walkthrough — everything is new, nothing to auto-apply
  if (!previous) {
    const items: DiffEntry[] = currentItems.map((i) => itemEntry(i, "new", false));
    const repairs: DiffEntry[] = currentRepairs.map((r) =>
      makeDiffEntry({
        observationId: r.id, label: r.label, itemId: null,
        zoneId: r.zoneId, zoneName: r.zone?.name ?? null,
        storageLocationId: null, storageLocationName: null,
        confidence: r.confidence, changeType: "new",
        previousZoneName: null, previousStorageLocationName: null,
        autoApplied: false, identityLinks: [],
      }),
    );
    return buildResult(items, repairs, null);
  }

  const [prevItems, prevRepairs] = await Promise.all([
    db.itemObservation.findMany({
      where: { walkthroughId: previous.id },
      include: {
        zone: { select: { id: true, name: true } },
        storageLocation: { select: { id: true, name: true } },
      },
    }),
    db.repairObservation.findMany({
      where: { walkthroughId: previous.id },
      include: { zone: { select: { id: true, name: true } } },
    }),
  ]);

  // Build lookup maps for previous observations
  const prevByItemId = new Map<string, (typeof prevItems)[number]>();
  const prevByLabel = new Map<string, (typeof prevItems)[number]>();
  for (const p of prevItems) {
    if (p.itemId) prevByItemId.set(p.itemId, p);
    prevByLabel.set(p.label.toLowerCase(), p);
  }

  const prevRepairByLabel = new Map<string, (typeof prevRepairs)[number]>();
  for (const r of prevRepairs) {
    prevRepairByLabel.set(r.label.toLowerCase(), r);
  }

  const matchedPrevItemIds = new Set<string>();
  const matchedPrevLabels = new Set<string>();

  const items: DiffEntry[] = [];

  for (const curr of currentItems) {
    // Match by itemId first (set during entity_matching), then by label
    const prevById = curr.itemId ? prevByItemId.get(curr.itemId) : undefined;
    const prevByLbl = prevByLabel.get(curr.label.toLowerCase());

    // Prefer itemId match, fall back to label match
    const prev = prevById ?? (prevByLbl && prevByLbl.itemId === curr.itemId ? prevByLbl : null) ?? prevByLbl;

    if (!prev) {
      items.push(itemEntry(curr, "new", false));
      continue;
    }

    // Track matched prev items for missing detection
    if (prev.itemId) matchedPrevItemIds.add(prev.itemId);
    matchedPrevLabels.add(prev.label.toLowerCase());

    const sameZone = curr.zoneId === prev.zoneId;
    const sameStorage = curr.storageLocationId === prev.storageLocationId;
    const isUnchanged = sameZone && sameStorage;

    if (isUnchanged && curr.itemId) {
      items.push(itemEntry(curr, "unchanged", true,
        prev.zone?.name ?? null, prev.storageLocation?.name ?? null));
    } else if (isUnchanged && !curr.itemId) {
      items.push(itemEntry(curr, "unchanged", false,
        prev.zone?.name ?? null, prev.storageLocation?.name ?? null));
    } else {
      items.push(itemEntry(curr, "moved", false,
        prev.zone?.name ?? null, prev.storageLocation?.name ?? null,
        { itemId: curr.itemId ?? prev.itemId }));
    }
  }

  // Missing items: were in previous but not matched by current
  const missingItems: DiffEntry[] = [];
  for (const prev of prevItems) {
    const alreadyMatched =
      (prev.itemId && matchedPrevItemIds.has(prev.itemId)) ||
      matchedPrevLabels.has(prev.label.toLowerCase());
    if (alreadyMatched) continue;

    missingItems.push(itemEntry(
      { ...prev, identityLinks: [] }, "missing", false,
    ));
  }

  // Repair diff
  const repairs: DiffEntry[] = [];
  const matchedPrevRepairLabels = new Set<string>();

  for (const curr of currentRepairs) {
    const prev = prevRepairByLabel.get(curr.label.toLowerCase());
    if (!prev) {
      repairs.push(makeDiffEntry({
        observationId: curr.id, label: curr.label, itemId: null,
        zoneId: curr.zoneId, zoneName: curr.zone?.name ?? null,
        storageLocationId: null, storageLocationName: null,
        confidence: curr.confidence, changeType: "new",
        previousZoneName: null, previousStorageLocationName: null,
        autoApplied: false, identityLinks: [],
      }));
    } else {
      matchedPrevRepairLabels.add(prev.label.toLowerCase());
    }
  }

  // Resolved repairs: were in previous but not in current
  for (const prev of prevRepairs) {
    if (matchedPrevRepairLabels.has(prev.label.toLowerCase())) continue;
    repairs.push(makeDiffEntry({
      observationId: prev.id, label: prev.label, itemId: null,
      zoneId: prev.zoneId, zoneName: prev.zone?.name ?? null,
      storageLocationId: null, storageLocationName: null,
      confidence: prev.confidence, changeType: "resolved",
      previousZoneName: null, previousStorageLocationName: null,
      autoApplied: false, identityLinks: [],
    }));
  }

  return buildResult([...items, ...missingItems], repairs, previous.id);
}

// ── Auto-apply ───────────────────────────────────────────────────────────────

export async function applyAutoItems(
  db: PrismaClient,
  diff: WalkthroughDiff,
  tenantId: string,
): Promise<number> {
  const toApply = diff.items.filter((e) => e.autoApplied);
  if (toApply.length === 0) return 0;

  for (const entry of toApply) {
    const itemId = entry.itemId;
    if (!itemId) continue;

    // Ensure identity link exists
    await db.itemIdentityLink.upsert({
      where: {
        observationId_itemId: {
          observationId: entry.observationId,
          itemId,
        },
      },
      create: {
        observationId: entry.observationId,
        itemId,
        tenantId,
        matchConfidence: entry.confidence ?? null,
      },
      update: {},
    });

    // Record location history
    await db.itemLocationHistory.create({
      data: {
        itemId,
        tenantId,
        zoneId: entry.zoneId,
        storageLocationId: entry.storageLocationId,
        sourceObservationId: entry.observationId,
        observedAt: new Date(),
      },
    });

    // Accept the observation
    await db.itemObservation.update({
      where: { id: entry.observationId },
      data: { status: "accepted", itemId },
    });
  }

  return toApply.length;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function deriveResolution(obs: { itemId: string | null; identityLinks: { itemId: string }[] }): {
  resolutionClass: DiffEntry["resolutionClass"];
  suggestedItemIds: string[];
} {
  if (obs.itemId) {
    return { resolutionClass: "matched", suggestedItemIds: [obs.itemId] };
  }
  if (obs.identityLinks.length > 0) {
    return {
      resolutionClass: "ambiguous",
      suggestedItemIds: obs.identityLinks.map((l) => l.itemId),
    };
  }
  return { resolutionClass: "likely_new", suggestedItemIds: [] };
}

function makeDiffEntry(params: {
  observationId: string;
  label: string;
  itemId: string | null;
  zoneId: string | null;
  zoneName: string | null;
  storageLocationId: string | null;
  storageLocationName: string | null;
  confidence: number | null;
  changeType: DiffEntry["changeType"];
  previousZoneName: string | null;
  previousStorageLocationName: string | null;
  autoApplied: boolean;
  identityLinks: { itemId: string }[];
}): DiffEntry {
  const { resolutionClass, suggestedItemIds } = deriveResolution(params);
  return {
    observationId: params.observationId,
    label: params.label,
    itemId: params.itemId,
    zoneId: params.zoneId,
    zoneName: params.zoneName,
    storageLocationId: params.storageLocationId,
    storageLocationName: params.storageLocationName,
    confidence: params.confidence,
    changeType: params.changeType,
    previousZoneName: params.previousZoneName,
    previousStorageLocationName: params.previousStorageLocationName,
    autoApplied: params.autoApplied,
    resolutionClass,
    suggestedItemIds,
  };
}

/** Extract a DiffEntry from an item observation (which has zone + storageLocation). */
function itemEntry(
  obs: {
    id: string;
    label: string;
    itemId: string | null;
    zoneId: string | null;
    zone?: { id: string; name: string } | null;
    storageLocationId: string | null;
    storageLocation?: { id: string; name: string } | null;
    confidence: number | null;
    identityLinks: { itemId: string }[];
  },
  changeType: DiffEntry["changeType"],
  autoApplied: boolean,
  previousZoneName: string | null = null,
  previousStorageLocationName: string | null = null,
  overrides?: { itemId?: string | null },
): DiffEntry {
  return makeDiffEntry({
    observationId: obs.id,
    label: obs.label,
    itemId: overrides?.itemId !== undefined ? overrides.itemId : obs.itemId,
    zoneId: obs.zoneId,
    zoneName: obs.zone?.name ?? null,
    storageLocationId: obs.storageLocationId,
    storageLocationName: obs.storageLocation?.name ?? null,
    confidence: obs.confidence,
    changeType,
    previousZoneName,
    previousStorageLocationName,
    autoApplied,
    identityLinks: obs.identityLinks,
  });
}

function emptyDiff(): WalkthroughDiff {
  return {
    items: [],
    repairs: [],
    summary: {
      totalChanges: 0,
      newItems: 0,
      movedItems: 0,
      missingItems: 0,
      unchangedItems: 0,
      newRepairs: 0,
      resolvedRepairs: 0,
      autoApplied: 0,
    },
    previousWalkthroughId: null,
  };
}

function buildResult(
  items: DiffEntry[],
  repairs: DiffEntry[],
  previousWalkthroughId: string | null,
): WalkthroughDiff {
  const newItems = items.filter((e) => e.changeType === "new").length;
  const movedItems = items.filter((e) => e.changeType === "moved").length;
  const missingItems = items.filter((e) => e.changeType === "missing").length;
  const unchangedItems = items.filter((e) => e.changeType === "unchanged").length;
  const newRepairs = repairs.filter((e) => e.changeType === "new").length;
  const resolvedRepairs = repairs.filter((e) => e.changeType === "resolved").length;
  const autoApplied = items.filter((e) => e.autoApplied).length;

  return {
    items,
    repairs,
    summary: {
      totalChanges: newItems + movedItems + missingItems + newRepairs + resolvedRepairs,
      newItems,
      movedItems,
      missingItems,
      unchangedItems,
      newRepairs,
      resolvedRepairs,
      autoApplied,
    },
    previousWalkthroughId,
  };
}
