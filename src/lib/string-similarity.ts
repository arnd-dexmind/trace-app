/**
 * String similarity engine with configurable algorithms.
 *
 * Provides Levenshtein distance, normalized similarity scoring, and
 * category-aware similarity. Used as the SimilarityEngine implementation
 * for the entity matching pipeline.
 */

export type SimilarityAlgorithm = "levenshtein" | "jaccard" | "hybrid";

export interface SimilarityOptions {
  algorithm?: SimilarityAlgorithm;
  /** When true, same-category strings get a score boost */
  categoryBoost?: boolean;
}

// ── Levenshtein distance ─────────────────────────────────────────────────────

export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Optimize: use shorter string for the inner loop
  const s1 = a.length >= b.length ? a : b;
  const s2 = a.length >= b.length ? b : a;

  const s2Len = s2.length;
  let prev = Array.from({ length: s2Len + 1 }, (_, i) => i);
  let curr = new Array<number>(s2Len + 1);

  for (let i = 1; i <= s1.length; i++) {
    curr[0] = i;
    const aChar = s1.charCodeAt(i - 1);
    for (let j = 1; j <= s2Len; j++) {
      const cost = aChar === s2.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,       // deletion
        curr[j - 1] + 1,   // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[s2Len];
}

// ── Normalized similarity ─────────────────────────────────────────────────────

export function levenshteinSimilarity(a: string, b: string): number {
  const aNorm = a.trim();
  const bNorm = b.trim();

  if (aNorm.length === 0 && bNorm.length === 0) return 1;
  if (aNorm.length === 0 || bNorm.length === 0) return 0;

  const dist = levenshteinDistance(aNorm, bNorm);
  const maxLen = Math.max(aNorm.length, bNorm.length);
  return 1 - dist / maxLen;
}

export function jaccardSimilarity(a: string, b: string): number {
  const aNorm = a.toLowerCase().trim();
  const bNorm = b.toLowerCase().trim();

  if (aNorm === bNorm) return 1;

  const aTokens = new Set(aNorm.split(/\s+/).filter(Boolean));
  const bTokens = new Set(bNorm.split(/\s+/).filter(Boolean));

  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let intersection = 0;
  for (const t of aTokens) {
    if (bTokens.has(t)) intersection++;
  }

  return intersection / (aTokens.size + bTokens.size - intersection);
}

/**
 * Hybrid similarity: weighted combination of Levenshtein (character-level)
 * and Jaccard (token-level), with a containment bonus.
 */
export function hybridSimilarity(a: string, b: string): number {
  const aNorm = a.toLowerCase().trim();
  const bNorm = b.toLowerCase().trim();

  if (aNorm === bNorm) return 1;
  if (aNorm.length === 0 || bNorm.length === 0) return 0;

  const lev = levenshteinSimilarity(aNorm, bNorm);
  const jac = jaccardSimilarity(aNorm, bNorm);

  // Containment bonus: one is a substring of the other
  const contains = aNorm.includes(bNorm) || bNorm.includes(aNorm) ? 0.15 : 0;

  return Math.min(1, lev * 0.55 + jac * 0.3 + contains);
}

// ── Main entry point ──────────────────────────────────────────────────────────

const ALGORITHM_MAP: Record<SimilarityAlgorithm, (a: string, b: string) => number> = {
  levenshtein: levenshteinSimilarity,
  jaccard: jaccardSimilarity,
  hybrid: hybridSimilarity,
};

/**
 * Compute normalized string similarity (0-1).
 *
 * Supports configurable algorithms via options:
 * - "levenshtein": character-level edit distance
 * - "jaccard": token overlap
 * - "hybrid" (default): weighted combination of both with containment bonus
 */
export function stringSimilarity(
  a: string,
  b: string,
  options: SimilarityOptions = {},
): number {
  const fn = ALGORITHM_MAP[options.algorithm ?? "hybrid"];
  let score = fn(a, b);

  // Category-aware boost: if both strings share a category token, nudge up
  if (options.categoryBoost) {
    const aTokens = new Set(a.toLowerCase().split(/\s+/));
    const bTokens = new Set(b.toLowerCase().split(/\s+/));
    let shared = 0;
    for (const t of aTokens) {
      if (bTokens.has(t)) shared++;
    }
    if (shared > 0) {
      score = Math.min(1, score + 0.1 * shared);
    }
  }

  return Math.round(Math.max(0, Math.min(1, score)) * 1000) / 1000;
}
