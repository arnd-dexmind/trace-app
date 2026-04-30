import type { PrismaClient } from "@prisma/client";

export interface WalkthroughDiff {
  newItems: { label: string; observationId: string }[];
  movedItems: { itemId: string; itemName: string; fromZone: string | null; toZone: string | null }[];
  missingItems: { itemId: string; itemName: string; lastZone: string | null }[];
  newRepairs: { label: string; observationId: string }[];
}

/**
 * Compare the current walkthrough's observations against the previous walkthrough
 * to generate a diff of changes.
 *
 * For MVP: simple comparison based on item labels and zones.
 * A "move" is detected when the same item was observed in a different zone.
 * "Missing" items are those that were present in the prior walkthrough but not this one.
 */
export async function generateWalkthroughDiff(
  db: PrismaClient,
  walkthroughId: string,
  spaceId: string,
  tenantId: string,
): Promise<WalkthroughDiff> {
  // Get the current walkthrough
  const current = await db.walkthrough.findUnique({
    where: { id: walkthroughId },
  });
  if (!current) {
    return { newItems: [], movedItems: [], missingItems: [], newRepairs: [] };
  }

  // Get the previous completed walkthrough for this space
  const previous = await db.walkthrough.findFirst({
    where: {
      spaceId,
      tenantId,
      status: "applied",
      id: { not: walkthroughId },
    },
    orderBy: { completedAt: "desc" },
  });

  // Current observations
  const [currentItems, currentRepairs] = await Promise.all([
    db.itemObservation.findMany({
      where: { walkthroughId, tenantId },
      include: { zone: { select: { id: true, name: true } } },
    }),
    db.repairObservation.findMany({
      where: { walkthroughId, tenantId },
    }),
  ]);

  // If no previous walkthrough, everything is new
  if (!previous) {
    return {
      newItems: currentItems.map((i) => ({ label: i.label, observationId: i.id })),
      movedItems: [],
      missingItems: [],
      newRepairs: currentRepairs.map((r) => ({ label: r.label, observationId: r.id })),
    };
  }

  // Get previous observations
  const [prevItems, prevRepairs] = await Promise.all([
    db.itemObservation.findMany({
      where: { walkthroughId: previous.id },
      include: { zone: { select: { id: true, name: true } } },
    }),
    db.repairObservation.findMany({
      where: { walkthroughId: previous.id },
    }),
  ]);

  // Normalize labels for comparison
  const prevItemLabels = new Set(prevItems.map((i) => i.label.toLowerCase()));
  const prevRepairLabels = new Set(prevRepairs.map((r) => r.label.toLowerCase()));
  const currentItemLabels = new Set(currentItems.map((i) => i.label.toLowerCase()));

  // New items: present now but not in previous
  const newItems = currentItems
    .filter((i) => !prevItemLabels.has(i.label.toLowerCase()))
    .map((i) => ({ label: i.label, observationId: i.id }));

  // Missing items: were present in previous but not now
  const missingItems = prevItems
    .filter((i) => !currentItemLabels.has(i.label.toLowerCase()))
    .map((i) => ({
      itemId: i.itemId || i.id,
      itemName: i.label,
      lastZone: i.zone?.name ?? null,
    }));

  // Moved items: same item, different zone
  const movedItems: WalkthroughDiff["movedItems"] = [];
  for (const prev of prevItems) {
    const curr = currentItems.find(
      (c) => c.label.toLowerCase() === prev.label.toLowerCase() && c.zoneId !== prev.zoneId,
    );
    if (curr && prev.itemId) {
      movedItems.push({
        itemId: prev.itemId,
        itemName: prev.label,
        fromZone: prev.zone?.name ?? null,
        toZone: curr.zone?.name ?? null,
      });
    }
  }

  // New repairs
  const newRepairs = currentRepairs
    .filter((r) => !prevRepairLabels.has(r.label.toLowerCase()))
    .map((r) => ({ label: r.label, observationId: r.id }));

  // Record location history for moved items
  for (const move of movedItems) {
    const currObs = currentItems.find(
      (c) => c.label.toLowerCase() === move.itemName.toLowerCase(),
    );
    if (currObs) {
      await db.itemLocationHistory.create({
        data: {
          itemId: move.itemId,
          tenantId,
          zoneId: currObs.zoneId,
          storageLocationId: currObs.storageLocationId,
          sourceObservationId: currObs.id,
          observedAt: new Date(),
        },
      });
    }
  }

  return { newItems, movedItems, missingItems, newRepairs };
}
