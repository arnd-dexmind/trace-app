import test from "node:test";
import assert from "node:assert/strict";
import { stringSimilarity } from "../src/lib/entity-matcher.js";
import { segmentScenes, pickRepresentativeFrames } from "../src/lib/scene-segmenter.js";
import { computeConfidence, buildConfidenceInput } from "../src/lib/confidence-scorer.js";
import { resolveIdentities, computeResolutionMetrics } from "../src/lib/identity-resolver.js";
import type { ExtractedFrame } from "../src/lib/frame-extractor.js";
import type { SimilarityEngine } from "../src/lib/confidence-scorer.js";
import type { ObservationInput, InventoryCandidate } from "../src/lib/identity-resolver.js";

// ── Entity Matcher: stringSimilarity ────────────────────────────────────────

test("stringSimilarity returns 1 for identical strings", () => {
  assert.equal(stringSimilarity("power drill", "power drill"), 1);
  assert.equal(stringSimilarity("Kitchen Sink", "kitchen sink"), 1);
});

test("stringSimilarity returns high score for similar strings", () => {
  // "cordless drill" vs "power drill" — Jaccard = 1/3 (only "drill" overlaps)
  const score = stringSimilarity("cordless drill", "power drill");
  assert.ok(score >= 0.3, `expected >= 0.3, got ${score}`);
});

test("stringSimilarity returns low score for unrelated strings", () => {
  const score = stringSimilarity("toaster", "lawn mower");
  assert.ok(score < 0.3, `expected < 0.3, got ${score}`);
});

test("stringSimilarity handles empty strings", () => {
  // Identical strings (including both empty) return 1 by the early-exit check
  assert.equal(stringSimilarity("", ""), 1);
  assert.equal(stringSimilarity("", "something"), 0);
  assert.equal(stringSimilarity("something", ""), 0);
});

test("stringSimilarity handles single-token overlap", () => {
  // "red toolbox" vs "blue toolbox" — Jaccard = 1/3
  const score = stringSimilarity("red toolbox", "blue toolbox");
  assert.ok(score >= 0.3, `expected >= 0.3, got ${score}`);
});

test("stringSimilarity substring containment bonus", () => {
  // Hybrid: lev*0.55 + jac*0.3 + contains*0.15 ≈ 0.496 for "drill" vs "cordless drill"
  const score = stringSimilarity("drill", "cordless drill");
  assert.ok(score >= 0.45, `expected >= 0.45, got ${score}`);
});

// ── Scene Segmenter: segmentScenes ──────────────────────────────────────────

function makeFrame(overrides: Partial<ExtractedFrame> = {}): ExtractedFrame {
  return {
    path: "/test/frame.jpg",
    url: "/uploads/test/frame.jpg",
    timestamp: null,
    sceneScore: 0,
    ...overrides,
  };
}

test("segmentScenes returns empty array for empty input", () => {
  assert.deepEqual(segmentScenes([]), []);
});

test("segmentScenes returns single bundle for single frame", () => {
  const bundles = segmentScenes([makeFrame()]);
  assert.equal(bundles.length, 1);
  assert.equal(bundles[0].frames.length, 1);
  assert.equal(bundles[0].id, "scene-0");
});

test("segmentScenes groups frames with low scene-change scores", () => {
  const frames = [
    makeFrame({ timestamp: 0, sceneScore: 0 }),
    makeFrame({ timestamp: 1, sceneScore: 0.1 }),
    makeFrame({ timestamp: 2, sceneScore: 0.2 }),
  ];
  const bundles = segmentScenes(frames);
  assert.equal(bundles.length, 1);
  assert.equal(bundles[0].frames.length, 3);
});

test("segmentScenes splits on high scene-change score", () => {
  const frames = [
    makeFrame({ timestamp: 0, sceneScore: 0.1 }),
    makeFrame({ timestamp: 1, sceneScore: 0.8 }), // high scene change → new bundle
    makeFrame({ timestamp: 2, sceneScore: 0.1 }),
  ];
  const bundles = segmentScenes(frames);
  assert.equal(bundles.length, 2);
  assert.equal(bundles[0].frames.length, 1);
  assert.equal(bundles[1].frames.length, 2);
});

test("segmentScenes splits on large time gap", () => {
  const frames = [
    makeFrame({ timestamp: 0, sceneScore: 0 }),
    makeFrame({ timestamp: 10, sceneScore: 0 }), // 10s gap → new scene
  ];
  const bundles = segmentScenes(frames);
  assert.equal(bundles.length, 2);
});

// ── Scene Segmenter: pickRepresentativeFrames ───────────────────────────────

test("pickRepresentativeFrames returns all frames when under max", () => {
  const bundles = [{ id: "s0", frames: [makeFrame(), makeFrame()], estimatedZone: null, containsOpenContainer: false, tags: [] }];
  const picks = pickRepresentativeFrames(bundles, 3);
  assert.equal(picks.get("s0")?.length, 2);
});

test("pickRepresentativeFrames limits to maxPerBundle", () => {
  const bundles = [{
    id: "s0",
    frames: [
      makeFrame({ sceneScore: 0.9 }),
      makeFrame({ sceneScore: 0.1 }),
      makeFrame({ sceneScore: 0.1 }),
      makeFrame({ sceneScore: 0.1 }),
      makeFrame({ sceneScore: 0.1 }),
    ],
    estimatedZone: null,
    containsOpenContainer: false,
    tags: [],
  }];
  const picks = pickRepresentativeFrames(bundles, 2);
  const selected = picks.get("s0")!;
  assert.equal(selected.length, 2);
  // The highest scene-change frame should be included
  assert.ok(selected.some((f) => f.sceneScore === 0.9));
});

// ── Confidence Scorer: computeConfidence ────────────────────────────────────

const testEngine: SimilarityEngine = {
  nameSimilarity: (a, b) => stringSimilarity(a, b),
};

test("computeConfidence returns high score for perfect match with location + category", () => {
  const result = computeConfidence({
    nameSimilarity: 1,
    categoryMatch: true,
    locationMatch: "exact",
    observationCount: 10,
    timeSinceLastObs: 1,
  });
  assert.ok(result.score >= 0.9, `expected >= 0.9, got ${result.score}`);
  assert.equal(result.factors.name, 0.5);
  assert.equal(result.factors.category, 0.2);
  assert.equal(result.factors.location, 0.2);
});

test("computeConfidence returns low score for weak signals", () => {
  const result = computeConfidence({
    nameSimilarity: 0.2,
    categoryMatch: false,
    locationMatch: "none",
    observationCount: 0,
    timeSinceLastObs: null,
  });
  assert.ok(result.score < 0.3, `expected < 0.3, got ${result.score}`);
});

test("computeConfidence zone location gives half credit", () => {
  const exact = computeConfidence({
    nameSimilarity: 0.8, categoryMatch: false, locationMatch: "exact",
    observationCount: 0, timeSinceLastObs: null,
  });
  const zone = computeConfidence({
    nameSimilarity: 0.8, categoryMatch: false, locationMatch: "zone",
    observationCount: 0, timeSinceLastObs: null,
  });
  const none = computeConfidence({
    nameSimilarity: 0.8, categoryMatch: false, locationMatch: "none",
    observationCount: 0, timeSinceLastObs: null,
  });
  assert.ok(exact.score > zone.score, `exact ${exact.score} > zone ${zone.score}`);
  assert.ok(zone.score > none.score, `zone ${zone.score} > none ${none.score}`);
});

test("computeConfidence recent observation boosts temporal factor", () => {
  const recent = computeConfidence({
    nameSimilarity: 0.7, categoryMatch: false, locationMatch: "none",
    observationCount: 0, timeSinceLastObs: 1,
  });
  const old = computeConfidence({
    nameSimilarity: 0.7, categoryMatch: false, locationMatch: "none",
    observationCount: 0, timeSinceLastObs: 1000,
  });
  assert.ok(recent.score > old.score, `recent ${recent.score} > old ${old.score}`);
});

// ── Confidence Scorer: buildConfidenceInput ─────────────────────────────────

test("buildConfidenceInput detects exact location match", () => {
  const input = buildConfidenceInput(
    { label: "power drill", zoneId: "z1", storageLocationId: "sl1" },
    {
      id: "item-1", name: "power drill", category: "tools",
      lastZoneId: "z2", lastStorageLocationId: "sl1",
      observationCount: 5, lastObservedAt: new Date(),
    },
    testEngine,
  );
  assert.equal(input.locationMatch, "exact");
  assert.equal(input.nameSimilarity, 1);
  assert.equal(input.observationCount, 5);
});

test("buildConfidenceInput detects zone match", () => {
  const input = buildConfidenceInput(
    { label: "power drill", zoneId: "z1", storageLocationId: null },
    {
      id: "item-1", name: "power drill", category: "tools",
      lastZoneId: "z1", lastStorageLocationId: "sl2",
      observationCount: 1, lastObservedAt: null,
    },
    testEngine,
  );
  assert.equal(input.locationMatch, "zone");
});

test("buildConfidenceInput computes timeSinceLastObs", () => {
  const oneHourAgo = new Date(Date.now() - 3600 * 1000);
  const input = buildConfidenceInput(
    { label: "drill", zoneId: null, storageLocationId: null },
    {
      id: "item-3", name: "power drill", category: null,
      lastZoneId: null, lastStorageLocationId: null,
      observationCount: 0, lastObservedAt: oneHourAgo,
    },
    testEngine,
  );
  assert.ok(input.timeSinceLastObs !== null);
  assert.ok(input.timeSinceLastObs! >= 0.9 && input.timeSinceLastObs! <= 1.1,
    `expected ~1 hour, got ${input.timeSinceLastObs}`);
});

// ── Identity Resolver: resolveIdentities ────────────────────────────────────

function makeObs(overrides: Partial<ObservationInput> = {}): ObservationInput {
  return { id: "obs-1", label: "power drill", zoneId: null, storageLocationId: null, ...overrides };
}

let candidateSeq = 0;
function makeCandidate(overrides: Partial<InventoryCandidate> = {}): InventoryCandidate {
  candidateSeq++;
  return {
    id: overrides.id ?? `item-${candidateSeq}`,
    name: "power drill", category: null,
    lastZoneId: null, lastStorageLocationId: null,
    observationCount: 0, lastObservedAt: null,
    ...overrides,
  };
}

test("resolveIdentities classifies strong multi-signal match as matched", () => {
  // Name alone (even exact) only gives ~0.5 — need category + location + temporal to clear 0.75
  const results = resolveIdentities(
    [makeObs({ label: "power drill", zoneId: "z1", storageLocationId: "sl1" })],
    [makeCandidate({
      id: "item-1", name: "power drill", category: "tools",
      lastZoneId: "z1", lastStorageLocationId: "sl1",
      observationCount: 10, lastObservedAt: new Date(),
    })],
    testEngine,
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].classification, "matched");
  assert.equal(results[0].matchedItemId, "item-1");
  assert.ok(results[0].confidence >= 0.75, `expected >= 0.75, got ${results[0].confidence}`);
});

test("resolveIdentities classifies weak match as likely_new", () => {
  const results = resolveIdentities(
    [makeObs({ label: "toaster" })],
    [makeCandidate({ name: "lawn mower" })],
    testEngine,
  );
  assert.equal(results[0].classification, "likely_new");
  assert.equal(results[0].matchedItemId, null);
});

test("resolveIdentities classifies moderate match as ambiguous", () => {
  // hybridSimilarity("tool box", "toolbox") ≈ 0.48 → name factor 0.24
  // + category match "box" → 0.2 = 0.44, falls in 0.4–0.75 ambiguous range
  const results = resolveIdentities(
    [makeObs({ label: "tool box" })],
    [makeCandidate({ name: "toolbox", category: "box" })],
    testEngine,
  );
  assert.equal(results[0].classification, "ambiguous");
});

test("resolveIdentities detects ambiguity with close candidates", () => {
  const results = resolveIdentities(
    [makeObs({ label: "red toolbox" })],
    [
      makeCandidate({ id: "item-1", name: "red toolbox" }),
      makeCandidate({ id: "item-2", name: "blue toolbox" }),
    ],
    testEngine,
  );
  // "red toolbox" matches item-1 exactly (score=1) and item-2 partially.
  // They should be within AMBIGUOUS_MARGIN of each other → ambiguous
  assert.equal(results[0].classification, "ambiguous");
  assert.equal(results[0].candidates.length, 2);
});

test("resolveIdentities empty candidates → likely_new", () => {
  const results = resolveIdentities(
    [makeObs({ label: "hammer" })],
    [],
    testEngine,
  );
  assert.equal(results[0].classification, "likely_new");
  assert.equal(results[0].candidates.length, 0);
  assert.equal(results[0].confidence, 0);
});

test("resolveIdentities returns top 3 candidates for review", () => {
  const results = resolveIdentities(
    [makeObs({ label: "drill" })],
    [
      makeCandidate({ id: "item-1", name: "power drill" }),
      makeCandidate({ id: "item-2", name: "cordless drill" }),
      makeCandidate({ id: "item-3", name: "hand drill" }),
      makeCandidate({ id: "item-4", name: "drill press" }),
    ],
    testEngine,
  );
  assert.equal(results[0].candidates.length, 3);
});

test("resolveIdentities resolves multiple observations", () => {
  const results = resolveIdentities(
    [
      makeObs({ id: "obs-1", label: "power drill", zoneId: "z1", storageLocationId: "sl1" }),
      makeObs({ id: "obs-2", label: "lawn mower" }),
    ],
    [
      makeCandidate({
        id: "item-1", name: "power drill", category: "tools",
        lastZoneId: "z1", lastStorageLocationId: "sl1",
        observationCount: 10, lastObservedAt: new Date(),
      }),
      makeCandidate({ id: "item-2", name: "leaf blower" }),
    ],
    testEngine,
  );
  assert.equal(results.length, 2);
  const drill = results.find((r) => r.observationId === "obs-1")!;
  const mower = results.find((r) => r.observationId === "obs-2")!;
  assert.equal(drill.classification, "matched");
  assert.equal(mower.classification, "likely_new");
});

// ── Identity Resolver: computeResolutionMetrics ─────────────────────────────

test("computeResolutionMetrics aggregates classifications", () => {
  const metrics = computeResolutionMetrics([
    { observationId: "1", observationLabel: "a", classification: "matched", matchedItemId: "i1", matchedItemName: "A", confidence: 0.9, candidates: [] },
    { observationId: "2", observationLabel: "b", classification: "matched", matchedItemId: "i2", matchedItemName: "B", confidence: 0.8, candidates: [] },
    { observationId: "3", observationLabel: "c", classification: "ambiguous", matchedItemId: null, matchedItemName: null, confidence: 0.5, candidates: [] },
    { observationId: "4", observationLabel: "d", classification: "likely_new", matchedItemId: null, matchedItemName: null, confidence: 0.1, candidates: [] },
    { observationId: "5", observationLabel: "e", classification: "likely_new", matchedItemId: null, matchedItemName: null, confidence: 0.05, candidates: [] },
  ]);
  assert.equal(metrics.total, 5);
  assert.equal(metrics.matched, 2);
  assert.equal(metrics.ambiguous, 1);
  assert.equal(metrics.likelyNew, 2);
  assert.ok(metrics.avgConfidence > 0.4 && metrics.avgConfidence < 0.5,
    `expected avg ~0.47, got ${metrics.avgConfidence}`);
});

test("computeResolutionMetrics handles empty results", () => {
  const metrics = computeResolutionMetrics([]);
  assert.equal(metrics.total, 0);
  assert.equal(metrics.matched, 0);
  assert.equal(metrics.avgConfidence, 0);
});
