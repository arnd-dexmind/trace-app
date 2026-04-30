import type { PrismaClient } from "@prisma/client";

/**
 * Simple fuzzy string matching using token overlap and prefix matching.
 * Returns a score 0-1 indicating how well two strings match.
 */
export function stringSimilarity(a: string, b: string): number {
  const aNorm = a.toLowerCase().trim();
  const bNorm = b.toLowerCase().trim();

  if (aNorm === bNorm) return 1;

  const aTokens = new Set(aNorm.split(/\s+/).filter(Boolean));
  const bTokens = new Set(bNorm.split(/\s+/).filter(Boolean));

  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  // Jaccard similarity of tokens
  let intersection = 0;
  for (const t of aTokens) {
    if (bTokens.has(t)) intersection++;
  }
  const jaccard = intersection / (aTokens.size + bTokens.size - intersection);

  // Prefix bonus: one string contains the other
  const contains = aNorm.includes(bNorm) || bNorm.includes(aNorm) ? 0.3 : 0;

  return Math.min(1, jaccard + contains);
}

const MATCH_THRESHOLD = 0.6;
const HIGH_CONFIDENCE_THRESHOLD = 0.8;

export interface MatchResult {
  observationId: string;
  observationLabel: string;
  matchedItemId: string | null;
  matchedItemName: string | null;
  score: number;
}

/**
 * Match item observations against existing inventory items.
 * Creates ItemIdentityLink records for matches above the threshold.
 */
export async function matchObservationsToInventory(
  db: PrismaClient,
  walkthroughId: string,
  spaceId: string,
  tenantId: string,
): Promise<MatchResult[]> {
  const [observations, inventoryItems] = await Promise.all([
    db.itemObservation.findMany({
      where: { walkthroughId, tenantId, status: "pending" },
      select: { id: true, label: true },
    }),
    db.inventoryItem.findMany({
      where: { spaceId, tenantId },
      select: { id: true, name: true },
    }),
  ]);

  const results: MatchResult[] = [];

  for (const obs of observations) {
    let bestMatch: { id: string; name: string; score: number } | null = null;

    for (const item of inventoryItems) {
      const score = stringSimilarity(obs.label, item.name);
      if (score > (bestMatch?.score ?? 0)) {
        bestMatch = { id: item.id, name: item.name, score };
      }
    }

    if (bestMatch && bestMatch.score >= MATCH_THRESHOLD) {
      await db.itemIdentityLink.upsert({
        where: {
          observationId_itemId: {
            observationId: obs.id,
            itemId: bestMatch.id,
          },
        },
        create: {
          observationId: obs.id,
          itemId: bestMatch.id,
          tenantId,
          matchConfidence: bestMatch.score,
        },
        update: {
          matchConfidence: bestMatch.score,
        },
      });

      // Update observation with matched item
      await db.itemObservation.update({
        where: { id: obs.id },
        data: { itemId: bestMatch.id },
      });

      results.push({
        observationId: obs.id,
        observationLabel: obs.label,
        matchedItemId: bestMatch.id,
        matchedItemName: bestMatch.name,
        score: bestMatch.score,
      });
    } else {
      results.push({
        observationId: obs.id,
        observationLabel: obs.label,
        matchedItemId: null,
        matchedItemName: null,
        score: bestMatch?.score ?? 0,
      });
    }
  }

  return results;
}

/**
 * Match repair observations against existing repair issues.
 * Creates links for strong matches.
 */
export async function matchRepairsToIssues(
  db: PrismaClient,
  walkthroughId: string,
  spaceId: string,
  tenantId: string,
): Promise<number> {
  const [observations, repairIssues] = await Promise.all([
    db.repairObservation.findMany({
      where: { walkthroughId, tenantId },
      select: { id: true, label: true },
    }),
    db.repairIssue.findMany({
      where: { spaceId, tenantId, status: { in: ["open", "in_progress"] } },
      select: { id: true, title: true },
    }),
  ]);

  let linked = 0;

  for (const obs of observations) {
    let bestMatch: { id: string; score: number } | null = null;

    for (const issue of repairIssues) {
      const score = stringSimilarity(obs.label, issue.title);
      if (score > (bestMatch?.score ?? 0)) {
        bestMatch = { id: issue.id, score };
      }
    }

    if (bestMatch && bestMatch.score >= HIGH_CONFIDENCE_THRESHOLD) {
      await db.repairObservation.update({
        where: { id: obs.id },
        data: { repairIssueId: bestMatch.id },
      });
      linked++;
    }
  }

  return linked;
}
