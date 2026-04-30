import test from "node:test";
import assert from "node:assert/strict";
import {
  levenshteinDistance,
  levenshteinSimilarity,
  jaccardSimilarity,
  hybridSimilarity,
  stringSimilarity,
} from "../src/lib/string-similarity.js";
import { createAliasAwareEngine } from "../src/lib/entity-matcher.js";

// ── Levenshtein distance ─────────────────────────────────────────────────────

test("levenshteinDistance — identical strings", () => {
  assert.equal(levenshteinDistance("hello", "hello"), 0);
});

test("levenshteinDistance — single substitution", () => {
  assert.equal(levenshteinDistance("cat", "bat"), 1);
});

test("levenshteinDistance — single insertion", () => {
  assert.equal(levenshteinDistance("cat", "cats"), 1);
});

test("levenshteinDistance — single deletion", () => {
  assert.equal(levenshteinDistance("cats", "cat"), 1);
});

test("levenshteinDistance — empty strings", () => {
  assert.equal(levenshteinDistance("", ""), 0);
  assert.equal(levenshteinDistance("abc", ""), 3);
  assert.equal(levenshteinDistance("", "abc"), 3);
});

test("levenshteinDistance — completely different", () => {
  assert.equal(levenshteinDistance("abc", "xyz"), 3);
});

test("levenshteinDistance — unicode", () => {
  assert.equal(levenshteinDistance("café", "cafe"), 1);
  assert.equal(levenshteinDistance("こんにちは", "こんにちわ"), 1);
});

test("levenshteinDistance — long strings", () => {
  const a = "a".repeat(1000);
  const b = "a".repeat(999) + "b";
  assert.equal(levenshteinDistance(a, b), 1);
});

// ── Levenshtein similarity ───────────────────────────────────────────────────

test("levenshteinSimilarity — identical", () => {
  assert.equal(levenshteinSimilarity("hello", "hello"), 1);
});

test("levenshteinSimilarity — similar", () => {
  const score = levenshteinSimilarity("power drill", "powr drill");
  assert.ok(score > 0.8, `expected > 0.8, got ${score}`);
});

test("levenshteinSimilarity — different", () => {
  const score = levenshteinSimilarity("hammer", "screwdriver");
  assert.ok(score < 0.3, `expected < 0.3, got ${score}`);
});

test("levenshteinSimilarity — empty strings", () => {
  assert.equal(levenshteinSimilarity("", ""), 1);
  assert.equal(levenshteinSimilarity("abc", ""), 0);
  assert.equal(levenshteinSimilarity("", "abc"), 0);
});

test("levenshteinSimilarity — unicode", () => {
  const score = levenshteinSimilarity("café", "cafè");
  assert.ok(score > 0.7, `expected > 0.7, got ${score}`);
});

// ── Jaccard similarity ───────────────────────────────────────────────────────

test("jaccardSimilarity — identical", () => {
  assert.equal(jaccardSimilarity("power drill", "power drill"), 1);
});

test("jaccardSimilarity — shared tokens", () => {
  const score = jaccardSimilarity("power drill", "power hammer");
  assert.ok(score === 1 / 3, `expected 1/3, got ${score}`);
});

test("jaccardSimilarity — no shared tokens", () => {
  assert.equal(jaccardSimilarity("hammer", "drill"), 0);
});

test("jaccardSimilarity — empty strings", () => {
  assert.equal(jaccardSimilarity("", ""), 1);
  assert.equal(jaccardSimilarity("", "abc"), 0);
});

test("jaccardSimilarity — case insensitive", () => {
  assert.equal(jaccardSimilarity("Power Drill", "power drill"), 1);
});

// ── Hybrid similarity ────────────────────────────────────────────────────────

test("hybridSimilarity — identical", () => {
  assert.equal(hybridSimilarity("power drill", "power drill"), 1);
});

test("hybridSimilarity — containment bonus", () => {
  const score = hybridSimilarity("power drill", "drill");
  assert.ok(score > 0.5, `expected > 0.5, got ${score}`);
});

test("hybridSimilarity — similar with typos", () => {
  const score = hybridSimilarity("power drill", "power dril");
  assert.ok(score > 0.7, `expected > 0.7, got ${score}`);
});

test("hybridSimilarity — completely different", () => {
  const score = hybridSimilarity("hammer", "screwdriver");
  assert.ok(score < 0.3, `expected < 0.3, got ${score}`);
});

// ── Main stringSimilarity entry point ────────────────────────────────────────

test("stringSimilarity — default hybrid algorithm", () => {
  const score = stringSimilarity("power drill", "power drill");
  assert.equal(score, 1);
});

test("stringSimilarity — levenshtein algorithm", () => {
  const score = stringSimilarity("power drill", "powr drill", { algorithm: "levenshtein" });
  assert.ok(score > 0.8, `expected > 0.8, got ${score}`);
});

test("stringSimilarity — jaccard algorithm", () => {
  const score = stringSimilarity("power drill", "power hammer", { algorithm: "jaccard" });
  assert.ok(Math.abs(score - 1 / 3) < 0.001, `expected ~0.333, got ${score}`);
});

test("stringSimilarity — category boost", () => {
  const without = stringSimilarity("power drill", "power hammer");
  const withBoost = stringSimilarity("power drill", "power hammer", { categoryBoost: true });
  assert.ok(withBoost > without, `boosted ${withBoost} > unboosted ${without}`);
});

test("stringSimilarity — clamps to 0-1", () => {
  assert.equal(stringSimilarity("", ""), 1);
  assert.equal(stringSimilarity("abc", ""), 0);
  assert.equal(stringSimilarity("a".repeat(100), "b".repeat(100)), 0);
});

test("stringSimilarity — returns rounded value", () => {
  const score = stringSimilarity("hello", "hello");
  assert.equal(score, 1);
  // Should be 3 decimal places
  assert.equal(String(score).length <= 5, true);
});

// ── Alias-aware engine ───────────────────────────────────────────────────────

test("createAliasAwareEngine — exact alias match returns 1", () => {
  const aliases = new Map([["item-1", ["makita drill", "blue drill"]]]);
  const base = { nameSimilarity: (a: string, b: string) => 0.5 };
  const engine = createAliasAwareEngine(base, aliases);

  const score = engine.nameSimilarity("makita drill", "power drill", "item-1");
  assert.equal(score, 1);
});

test("createAliasAwareEngine — alias match is case insensitive", () => {
  const aliases = new Map([["item-1", ["Makita Drill"]]]);
  const base = { nameSimilarity: () => 0.5 };
  const engine = createAliasAwareEngine(base, aliases);

  const score = engine.nameSimilarity("makita drill", "power drill", "item-1");
  assert.equal(score, 1);
});

test("createAliasAwareEngine — no alias match falls back to fuzzy", () => {
  const aliases = new Map([["item-1", ["makita drill"]]]);
  const base = { nameSimilarity: () => 0.5 };
  const engine = createAliasAwareEngine(base, aliases);

  const score = engine.nameSimilarity("hammer", "power drill", "item-1");
  assert.equal(score, 0.5);
});

test("createAliasAwareEngine — no candidateId skips alias check", () => {
  const aliases = new Map([["item-1", ["makita drill"]]]);
  const base = { nameSimilarity: () => 0.5 };
  const engine = createAliasAwareEngine(base, aliases);

  const score = engine.nameSimilarity("makita drill", "power drill");
  assert.equal(score, 0.5);
});

test("createAliasAwareEngine — item with no aliases falls back", () => {
  const aliases = new Map<string, string[]>();
  const base = { nameSimilarity: () => 0.5 };
  const engine = createAliasAwareEngine(base, aliases);

  const score = engine.nameSimilarity("hammer", "power drill", "item-1");
  assert.equal(score, 0.5);
});

test("createAliasAwareEngine — multiple aliases for same item", () => {
  const aliases = new Map([["item-1", ["makita", "dewalt", "bosch"]]]);
  const base = { nameSimilarity: () => 0.5 };
  const engine = createAliasAwareEngine(base, aliases);

  assert.equal(engine.nameSimilarity("makita", "power drill", "item-1"), 1);
  assert.equal(engine.nameSimilarity("dewalt", "power drill", "item-1"), 1);
  assert.equal(engine.nameSimilarity("bosch", "power drill", "item-1"), 1);
  assert.equal(engine.nameSimilarity("ryobi", "power drill", "item-1"), 0.5);
});

test("createAliasAwareEngine — trims whitespace in alias check", () => {
  const aliases = new Map([["item-1", ["makita drill"]]]);
  const base = { nameSimilarity: () => 0.5 };
  const engine = createAliasAwareEngine(base, aliases);

  const score = engine.nameSimilarity("  makita drill  ", "power drill", "item-1");
  assert.equal(score, 1);
});
