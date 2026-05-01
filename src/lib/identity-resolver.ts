import type { PrismaClient } from "@prisma/client";
import {
  computeConfidence,
  buildConfidenceInput,
  type SimilarityEngine,
  type ConfidenceResult,
} from "./confidence-scorer.js";

// ── Classification ───────────────────────────────────────────────────────────

export type ResolutionClassification = "matched" | "ambiguous" | "likely_new";

// ── Thresholds ───────────────────────────────────────────────────────────────

const MATCH_THRESHOLD = 0.75;
const AMBIGUOUS_THRESHOLD = 0.4;
/** If the top 2 candidates are within this margin, classify as ambiguous
 *  even if the top score exceeds MATCH_THRESHOLD. */
const AMBIGUOUS_MARGIN = 0.15;
/** Minimum number of candidates to consider for ambiguity check. */
const MIN_CANDIDATES_FOR_AMBIGUITY = 2;

// ── Types ────────────────────────────────────────────────────────────────────

export interface CandidateResult {
  itemId: string;
  itemName: string;
  confidence: number;
  factors: ConfidenceResult["factors"];
}

export interface ResolutionResult {
  observationId: string;
  observationLabel: string;
  classification: ResolutionClassification;
  matchedItemId: string | null;
  matchedItemName: string | null;
  confidence: number;
  candidates: CandidateResult[];
}

export interface ObservationInput {
  id: string;
  label: string;
  zoneId: string | null;
  storageLocationId: string | null;
}

export interface InventoryCandidate {
  id: string;
  name: string;
  category: string | null;
  lastZoneId: string | null;
  lastStorageLocationId: string | null;
  observationCount: number;
  lastObservedAt: Date | null;
}

// ── Resolution ───────────────────────────────────────────────────────────────

export function resolveIdentities(
  observations: ObservationInput[],
  candidates: InventoryCandidate[],
  engine: SimilarityEngine,
): ResolutionResult[] {
  return observations.map((obs) => resolveObservation(obs, candidates, engine));
}

function resolveObservation(
  obs: ObservationInput,
  candidates: InventoryCandidate[],
  engine: SimilarityEngine,
): ResolutionResult {
  if (candidates.length === 0) {
    return {
      observationId: obs.id,
      observationLabel: obs.label,
      classification: "likely_new",
      matchedItemId: null,
      matchedItemName: null,
      confidence: 0,
      candidates: [],
    };
  }

  // Score every candidate
  const scored: CandidateResult[] = candidates.map((c) => {
    const input = buildConfidenceInput(obs, c, engine);
    const result = computeConfidence(input);
    return {
      itemId: c.id,
      itemName: c.name,
      confidence: result.score,
      factors: result.factors,
    };
  });

  // Sort descending by confidence
  scored.sort((a, b) => b.confidence - a.confidence);

  const best = scored[0];
  const secondBest = scored[1];

  // Classification logic
  let classification: ResolutionClassification;

  if (best.confidence >= MATCH_THRESHOLD) {
    // Check for ambiguity: multiple close candidates
    if (
      secondBest &&
      scored.length >= MIN_CANDIDATES_FOR_AMBIGUITY &&
      best.confidence - secondBest.confidence < AMBIGUOUS_MARGIN
    ) {
      classification = "ambiguous";
    } else {
      classification = "matched";
    }
  } else if (best.confidence >= AMBIGUOUS_THRESHOLD) {
    classification = "ambiguous";
  } else {
    classification = "likely_new";
  }

  return {
    observationId: obs.id,
    observationLabel: obs.label,
    classification,
    matchedItemId: classification === "matched" ? best.itemId : null,
    matchedItemName: classification === "matched" ? best.itemName : null,
    confidence: best.confidence,
    candidates: scored.slice(0, 3), // top 3 for review UI
  };
}

// ── DB-backed resolution ─────────────────────────────────────────────────────
// Fetches observations and candidates, runs resolution, persists links.

export async function resolveWalkthroughIdentities(
  db: PrismaClient,
  walkthroughId: string,
  spaceId: string,
  tenantId: string,
  engine: SimilarityEngine,
): Promise<{ results: ResolutionResult[]; metrics: ResolutionMetrics }> {
  const [observations, inventoryItems] = await Promise.all([
    db.itemObservation.findMany({
      where: { walkthroughId, tenantId, status: "pending" },
      select: { id: true, label: true, zoneId: true, storageLocationId: true },
    }),
    db.inventoryItem.findMany({
      where: { spaceId, tenantId },
      select: {
        id: true,
        name: true,
        category: true,
        locationHistory: {
          orderBy: { observedAt: "desc" },
          take: 1,
          select: { zoneId: true, storageLocationId: true },
        },
        _count: { select: { observations: true } },
      },
    }),
  ]);

  // Get last observation time for each candidate
  const itemLastObserved = await getItemLastObservedMap(db, inventoryItems.map((i) => i.id));

  const candidates: InventoryCandidate[] = inventoryItems.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    lastZoneId: item.locationHistory[0]?.zoneId ?? null,
    lastStorageLocationId: item.locationHistory[0]?.storageLocationId ?? null,
    observationCount: item._count.observations,
    lastObservedAt: itemLastObserved.get(item.id) ?? null,
  }));

  const results = resolveIdentities(observations, candidates, engine);

  // Persist links for matched observations
  for (const r of results) {
    if (r.classification === "matched" && r.matchedItemId) {
      await db.itemIdentityLink.upsert({
        where: {
          observationId_itemId: {
            observationId: r.observationId,
            itemId: r.matchedItemId,
          },
        },
        create: {
          observationId: r.observationId,
          itemId: r.matchedItemId,
          tenantId,
          matchConfidence: r.confidence,
        },
        update: {
          matchConfidence: r.confidence,
        },
      });

      await db.itemObservation.update({
        where: { id: r.observationId },
        data: { itemId: r.matchedItemId },
      });
    }

    // For ambiguous: create links for top candidates but don't set itemId
    if (r.classification === "ambiguous") {
      for (const c of r.candidates) {
        await db.itemIdentityLink.upsert({
          where: {
            observationId_itemId: {
              observationId: r.observationId,
              itemId: c.itemId,
            },
          },
          create: {
            observationId: r.observationId,
            itemId: c.itemId,
            tenantId,
            matchConfidence: c.confidence,
          },
          update: {
            matchConfidence: c.confidence,
          },
        });
      }
    }
  }

  const metrics = computeResolutionMetrics(results);

  return { results, metrics };
}

// ── Metrics ──────────────────────────────────────────────────────────────────

export interface ResolutionMetrics {
  total: number;
  matched: number;
  ambiguous: number;
  likelyNew: number;
  avgConfidence: number;
}

export function computeResolutionMetrics(results: ResolutionResult[]): ResolutionMetrics {
  const total = results.length;
  const matched = results.filter((r) => r.classification === "matched").length;
  const ambiguous = results.filter((r) => r.classification === "ambiguous").length;
  const likelyNew = results.filter((r) => r.classification === "likely_new").length;
  const avgConfidence =
    total > 0
      ? Math.round((results.reduce((sum, r) => sum + r.confidence, 0) / total) * 1000) / 1000
      : 0;

  return { total, matched, ambiguous, likelyNew, avgConfidence };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getItemLastObservedMap(
  db: PrismaClient,
  itemIds: string[],
): Promise<Map<string, Date>> {
  if (itemIds.length === 0) return new Map();

  const rows = await db.$queryRaw<{ itemId: string; lastObserved: Date }[]>`
    SELECT "itemId", MAX("observedAt") AS "lastObserved"
    FROM "ItemLocationHistory"
    WHERE "itemId" = ANY(${itemIds})
    GROUP BY "itemId"
  `;

  const map = new Map<string, Date>();
  for (const row of rows) {
    map.set(row.itemId, row.lastObserved);
  }
  return map;
}
