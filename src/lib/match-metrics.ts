import type { PrismaClient } from "@prisma/client";
import type { ResolutionMetrics, ResolutionResult } from "./identity-resolver.js";

/**
 * Persist and log match quality metrics for later refinement of
 * confidence weights and thresholds.
 */

const METRICS_KEY = "identityResolution";

export interface StoredMetrics extends ResolutionMetrics {
  timestamp: string;
  /** Per-classification breakdown of the factors that contributed */
  factorAverages: {
    matched: { name: number; category: number; location: number; temporal: number } | null;
    ambiguous: { name: number; category: number; location: number; temporal: number } | null;
  };
}

/** Per-observation resolution data stored in walkthrough metadata for downstream stages. */
export interface StoredObservationResolution {
  observationId: string;
  classification: string;
  matchedItemId: string | null;
  confidence: number;
  candidateIds: string[];
}

export async function persistMetrics(
  db: PrismaClient,
  walkthroughId: string,
  metrics: ResolutionMetrics,
  factorAverages: StoredMetrics["factorAverages"],
  resolutionResults: ResolutionResult[],
): Promise<void> {
  const stored: StoredMetrics = {
    ...metrics,
    timestamp: new Date().toISOString(),
    factorAverages,
  };

  const observationResults: StoredObservationResolution[] = resolutionResults.map((r) => ({
    observationId: r.observationId,
    classification: r.classification,
    matchedItemId: r.matchedItemId,
    confidence: r.confidence,
    candidateIds: r.candidates.map((c) => c.itemId),
  }));

  // Store in walkthrough metadata
  const wt = await db.walkthrough.findUnique({
    where: { id: walkthroughId },
    select: { metadata: true },
  });
  const existingMeta = wt?.metadata ? JSON.parse(String(wt.metadata)) : {};

  await db.walkthrough.update({
    where: { id: walkthroughId },
    data: {
      metadata: JSON.stringify({
        ...existingMeta,
        [METRICS_KEY]: { ...stored, observations: observationResults },
      }),
    },
  });

  // Structured log for monitoring ingestion
  console.log(JSON.stringify({
    level: metrics.likelyNew > metrics.matched ? "warn" : "info",
    message: `Identity resolution: ${metrics.matched} matched, ${metrics.ambiguous} ambiguous, ${metrics.likelyNew} likely new (avg confidence ${metrics.avgConfidence})`,
    walkthroughId,
    stage: "identity_resolution",
    metrics: stored,
  }));
}

/**
 * Read per-observation resolution data from walkthrough metadata.
 * Returns a map of observationId → resolution info for downstream stages.
 */
export function getResolutionFromMetadata(metadata: unknown): Map<string, StoredObservationResolution> {
  const map = new Map<string, StoredObservationResolution>();
  if (!metadata || typeof metadata !== "string") return map;

  try {
    const meta = JSON.parse(metadata);
    const resolution = meta[METRICS_KEY];
    if (resolution?.observations) {
      for (const obs of resolution.observations) {
        map.set(obs.observationId, obs);
      }
    }
  } catch {
    // Metadata parse failure — return empty map
  }

  return map;
}

/**
 * Aggregate metrics across all walkthroughs for a tenant.
 * Used to track match quality trends and tune thresholds.
 */
export async function getTenantMetrics(
  db: PrismaClient,
  tenantId: string,
): Promise<{
  totalWalkthroughs: number;
  aggregate: { total: number; matched: number; ambiguous: number; likelyNew: number };
  avgConfidence: number;
}> {
  const walkthroughs = await db.walkthrough.findMany({
    where: { tenantId, status: { in: ["applied", "awaiting_review"] } },
    select: { metadata: true },
  });

  let totalObs = 0;
  let totalMatched = 0;
  let totalAmbiguous = 0;
  let totalNew = 0;
  let confidenceSum = 0;
  let metricCount = 0;

  for (const wt of walkthroughs) {
    if (!wt.metadata) continue;
    const meta = JSON.parse(String(wt.metadata));
    const m: StoredMetrics | undefined = meta[METRICS_KEY];
    if (!m) continue;

    totalObs += m.total;
    totalMatched += m.matched;
    totalAmbiguous += m.ambiguous;
    totalNew += m.likelyNew;
    confidenceSum += m.avgConfidence * m.total;
    metricCount += m.total;
  }

  return {
    totalWalkthroughs: walkthroughs.length,
    aggregate: {
      total: totalObs,
      matched: totalMatched,
      ambiguous: totalAmbiguous,
      likelyNew: totalNew,
    },
    avgConfidence: metricCount > 0 ? Math.round((confidenceSum / metricCount) * 1000) / 1000 : 0,
  };
}
