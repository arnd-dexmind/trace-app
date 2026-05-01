/**
 * Multi-factor confidence scoring for identity resolution.
 *
 * Combines name similarity, category match, location proximity, and
 * temporal signals into a single 0-1 confidence score.
 *
 * The string similarity primitive is provided by the SimilarityEngine
 * interface — currently backed by entity-matcher's stringSimilarity,
 * to be replaced by Casey's engine in TRAAAA-201.
 */

// ── Similarity engine interface ──────────────────────────────────────────────

export interface SimilarityEngine {
  /** Compare two strings and return a 0-1 similarity score.
   *  Third argument is optional — alias-aware engines use candidateId,
   *  raw string engines use SimilarityOptions or nothing. */
  nameSimilarity(a: string, b: string, opts?: string | { candidateId?: string }): number;
}

// ── Input signals ────────────────────────────────────────────────────────────

export type LocationMatch = "exact" | "zone" | "none";

export interface ConfidenceInput {
  /** 0-1 string similarity from the engine */
  nameSimilarity: number;
  /** Whether the observation and candidate item share the same category */
  categoryMatch: boolean;
  /** How closely the observation location matches the item's last known location */
  locationMatch: LocationMatch;
  /** Number of times this item has been observed across all walkthroughs */
  observationCount: number;
  /** Hours since this item was last observed, or null if never */
  timeSinceLastObs: number | null;
}

// ── Result ───────────────────────────────────────────────────────────────────

export interface ConfidenceResult {
  /** 0-1 overall confidence */
  score: number;
  /** Per-factor weighted contributions (sum ≈ score) */
  factors: {
    name: number;
    category: number;
    location: number;
    temporal: number;
  };
}

// ── Weights ──────────────────────────────────────────────────────────────────
// Tunable based on match quality metrics. Name is the dominant signal;
// category and location confirm; temporal prevents drift.

const DEFAULT_WEIGHTS = {
  name: 0.50,
  category: 0.20,
  location: 0.20,
  temporal: 0.10,
};

// ── Scoring ──────────────────────────────────────────────────────────────────

export function computeConfidence(
  input: ConfidenceInput,
  weights: typeof DEFAULT_WEIGHTS = DEFAULT_WEIGHTS,
): ConfidenceResult {
  const nameFactor = input.nameSimilarity * weights.name;

  const categoryFactor = (input.categoryMatch ? 1 : 0) * weights.category;

  const locationScore =
    input.locationMatch === "exact" ? 1 : input.locationMatch === "zone" ? 0.5 : 0;
  const locationFactor = locationScore * weights.location;

  let temporalScore = 0;
  if (input.timeSinceLastObs !== null) {
    if (input.timeSinceLastObs < 24) temporalScore = 1;
    else if (input.timeSinceLastObs < 168) temporalScore = 0.7;
    else if (input.timeSinceLastObs < 720) temporalScore = 0.4;
    else temporalScore = 0.1;
  }
  if (input.observationCount > 5) {
    temporalScore = Math.min(1, temporalScore + 0.2);
  }
  const temporalFactor = temporalScore * weights.temporal;

  const score = Math.min(1, nameFactor + categoryFactor + locationFactor + temporalFactor);

  return {
    score: round3(score),
    factors: {
      name: round3(nameFactor),
      category: round3(categoryFactor),
      location: round3(locationFactor),
      temporal: round3(temporalFactor),
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Build a ConfidenceInput by comparing an observation to a candidate inventory item. */
export function buildConfidenceInput(
  obs: {
    label: string;
    zoneId: string | null;
    storageLocationId: string | null;
  },
  candidate: {
    id: string;
    name: string;
    category: string | null;
    lastZoneId: string | null;
    lastStorageLocationId: string | null;
    observationCount: number;
    lastObservedAt: Date | null;
  },
  engine: SimilarityEngine,
): ConfidenceInput {
  const nameSimilarity = engine.nameSimilarity(obs.label, candidate.name, candidate.id);

  const categoryMatch = Boolean(
    obs.label && candidate.category &&
    obs.label.toLowerCase().includes(candidate.category.toLowerCase()),
  );

  let locationMatch: LocationMatch = "none";
  if (candidate.lastStorageLocationId && obs.storageLocationId === candidate.lastStorageLocationId) {
    locationMatch = "exact";
  } else if (candidate.lastZoneId && obs.zoneId === candidate.lastZoneId) {
    locationMatch = "zone";
  }

  let timeSinceLastObs: number | null = null;
  if (candidate.lastObservedAt) {
    timeSinceLastObs = (Date.now() - candidate.lastObservedAt.getTime()) / (1000 * 60 * 60);
  }

  return {
    nameSimilarity,
    categoryMatch,
    locationMatch,
    observationCount: candidate.observationCount,
    timeSinceLastObs,
  };
}
