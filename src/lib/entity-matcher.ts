import type { PrismaClient } from "@prisma/client";
import { resolveWalkthroughIdentities } from "./identity-resolver.js";
import { persistMetrics } from "./match-metrics.js";
import type { SimilarityEngine } from "./confidence-scorer.js";
import type { ResolutionResult, ResolutionMetrics } from "./identity-resolver.js";
import { stringSimilarity } from "./string-similarity.js";

export { stringSimilarity } from "./string-similarity.js";

const HIGH_CONFIDENCE_THRESHOLD = 0.8;

// ── Alias-aware similarity engine ────────────────────────────────────────────

/**
 * Wrap a SimilarityEngine with alias-aware matching.
 * Checks candidate aliases before falling back to fuzzy comparison.
 */
export function createAliasAwareEngine(
  baseEngine: SimilarityEngine,
  aliasesByItemId: Map<string, string[]>,
): SimilarityEngine {
  return {
    nameSimilarity(obsLabel: string, candidateName: string, opts?: string | { candidateId?: string }): number {
      const candidateId = typeof opts === "string" ? opts : opts?.candidateId;
      if (candidateId) {
        const aliases = aliasesByItemId.get(candidateId);
        if (aliases) {
          const obsNorm = obsLabel.toLowerCase().trim();
          for (const alias of aliases) {
            if (alias.toLowerCase().trim() === obsNorm) return 1;
          }
        }
      }
      return baseEngine.nameSimilarity(obsLabel, candidateName);
    },
  };
}

// ── Similarity engine adapter ────────────────────────────────────────────────

const defaultEngine: SimilarityEngine = {
  nameSimilarity: (a, b) => stringSimilarity(a, b),
};

// ── Match result types ───────────────────────────────────────────────────────

export interface MatchResult {
  observationId: string;
  observationLabel: string;
  matchedItemId: string | null;
  matchedItemName: string | null;
  score: number;
}

/**
 * Match item observations against existing inventory items using the
 * multi-factor identity resolution pipeline with alias-aware matching.
 *
 * Creates ItemIdentityLink records for matched and ambiguous observations.
 */
export async function matchObservationsToInventory(
  db: PrismaClient,
  walkthroughId: string,
  spaceId: string,
  tenantId: string,
): Promise<MatchResult[]> {
  const aliases = await loadAliasesForSpace(db, spaceId, tenantId);
  const engine = createAliasAwareEngine(defaultEngine, aliases);
  const { results } = await resolveWalkthroughIdentities(
    db, walkthroughId, spaceId, tenantId, engine,
  );
  return resolutionToMatchResults(results);
}

/**
 * Enhanced matching that also persists metrics to walkthrough metadata.
 * Call this from the pipeline orchestrator.
 */
export async function matchObservationsToInventoryWithMetrics(
  db: PrismaClient,
  walkthroughId: string,
  spaceId: string,
  tenantId: string,
): Promise<{ results: MatchResult[]; metrics: ResolutionMetrics }> {
  const aliases = await loadAliasesForSpace(db, spaceId, tenantId);
  const engine = createAliasAwareEngine(defaultEngine, aliases);
  const { results: resolutionResults, metrics } = await resolveWalkthroughIdentities(
    db, walkthroughId, spaceId, tenantId, engine,
  );

  const factorAverages = computeFactorAverages(resolutionResults);

  await persistMetrics(db, walkthroughId, metrics, factorAverages, resolutionResults);

  return { results: resolutionToMatchResults(resolutionResults), metrics };
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

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loadAliasesForSpace(
  db: PrismaClient,
  walkthroughIdOrSpaceId: string,
  tenantId: string,
): Promise<Map<string, string[]>> {
  // Determine spaceId from the walkthrough
  const wt = await db.walkthrough.findUnique({
    where: { id: walkthroughIdOrSpaceId },
    select: { spaceId: true },
  });
  const spaceId = wt?.spaceId ?? walkthroughIdOrSpaceId;

  const items = await db.inventoryItem.findMany({
    where: { spaceId, tenantId },
    select: { id: true },
  });

  if (items.length === 0) return new Map();

  const rows = await db.itemAlias.findMany({
    where: { itemId: { in: items.map((i) => i.id) } },
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

function resolutionToMatchResults(resolutions: ResolutionResult[]): MatchResult[] {
  return resolutions.map((r) => ({
    observationId: r.observationId,
    observationLabel: r.observationLabel,
    matchedItemId: r.matchedItemId,
    matchedItemName: r.matchedItemName,
    score: r.confidence,
  }));
}

function computeFactorAverages(results: ResolutionResult[]) {
  const matched = results.filter((r) => r.classification === "matched");
  const ambiguous = results.filter((r) => r.classification === "ambiguous");

  const avg = (list: ResolutionResult[]) => {
    if (list.length === 0) return null;
    const bests = list.map((r) => r.candidates[0]?.factors).filter(Boolean);
    if (bests.length === 0) return null;
    return {
      name: round3(bests.reduce((s, f) => s + f!.name, 0) / bests.length),
      category: round3(bests.reduce((s, f) => s + f!.category, 0) / bests.length),
      location: round3(bests.reduce((s, f) => s + f!.location, 0) / bests.length),
      temporal: round3(bests.reduce((s, f) => s + f!.temporal, 0) / bests.length),
    };
  };

  return { matched: avg(matched), ambiguous: avg(ambiguous) };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
