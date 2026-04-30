import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { Anthropic } from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { ExtractedFrame } from "./frame-extractor.js";
import type { SceneBundle } from "./scene-segmenter.js";

// ── AI Provider configuration ─────────────────────────────────────────────────

type AIProvider = "anthropic" | "openai";

interface AIConfig {
  provider: AIProvider;
  model: string;
  maxTokens: number;
}

function getAIConfig(): AIConfig {
  const provider = (process.env.AI_PROVIDER || "anthropic") as AIProvider;
  return {
    provider,
    model:
      process.env.AI_MODEL ||
      (provider === "anthropic" ? "claude-sonnet-4-6" : "gpt-4o"),
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || "4096", 10),
  };
}

// ── Structured output types ──────────────────────────────────────────────────

export interface ExtractedContainer {
  label: string;
  state: "open" | "closed" | "unknown";
  confidence: number;
}

export interface ExtractedItem {
  name: string;
  container?: string;
  surface?: string;
  condition: string;
  confidence: number;
  bbox?: { x: number; y: number; width: number; height: number };
}

export interface ExtractedRepair {
  label: string;
  severity: "low" | "medium" | "high";
  description: string;
  confidence: number;
  bbox?: { x: number; y: number; width: number; height: number };
}

interface StructuredResponse {
  zone: string | null;
  zoneConfidence: number;
  containers: ExtractedContainer[];
  items: ExtractedItem[];
  repairs: ExtractedRepair[];
}

// ── Prompt template ──────────────────────────────────────────────────────────

function buildExtractionPrompt(frameCount: number): string {
  return `You are analyzing frames from a home/office walkthrough video for an inventory management system.
Examine these ${frameCount} images carefully and extract structured observations.

## Output Requirements

Return a single JSON object with this exact structure:
{
  "zone": "kitchen" | "garage" | "living room" | "bedroom" | "bathroom" | "office" | "hallway" | "laundry" | "basement" | "attic" | "closet" | "outdoor" | null,
  "zoneConfidence": 0.0-1.0,
  "containers": [
    {"label": "under-sink cabinet", "state": "closed"|"open"|"unknown", "confidence": 0.0-1.0}
  ],
  "items": [
    {
      "name": "power drill",
      "container": "tool cabinet" | null,
      "surface": "workbench" | null,
      "condition": "good" | "worn" | "damaged" | "unknown",
      "confidence": 0.0-1.0,
      "bbox": {"x": 0.0-1.0, "y": 0.0-1.0, "width": 0.0-1.0, "height": 0.0-1.0}
    }
  ],
  "repairs": [
    {
      "label": "cracked window pane",
      "severity": "low"|"medium"|"high",
      "description": "Brief description of what is broken",
      "confidence": 0.0-1.0,
      "bbox": {"x": 0.0-1.0, "y": 0.0-1.0, "width": 0.0-1.0, "height": 0.0-1.0}
    }
  ]
}

## Guidelines

- **Zone**: Guess the room/area. Use null only if completely ambiguous.
- **Containers**: Identify cabinets, drawers, shelves, closets, boxes, tool chests. Note whether each is open or closed. An open container is important — it means items inside may be visible.
- **Items**: List distinct, identifiable objects. Use normalized names (e.g., "cordless drill" not "a black DeWalt drill"). Only include items you can see clearly. Skip generic background objects.
- **Condition**: good = no visible issues, worn = visible wear/tear, damaged = broken or malfunctioning, unknown = can't assess.
- **Repairs**: Report visible damage, leaks, cracks, broken items, maintenance needs. Be specific about what's wrong.
- **Confidence**: 0.9+ = certain, 0.7-0.9 = likely, 0.5-0.7 = plausible, <0.5 = guess.
- **Bounding box**: Normalized coordinates (0.0-1.0) relative to image dimensions. Include only when the item/repair is clearly localized.
- Only return the JSON — no other text.`;
}

// ── Image loading ────────────────────────────────────────────────────────────

function loadImageBase64(frame: ExtractedFrame): { data: string; mediaType: string } {
  const path = join(process.cwd(), frame.url.replace(/^\//, ""));
  const buffer = readFileSync(path);
  const base64 = buffer.toString("base64");
  const ext = frame.url.split(".").pop()?.toLowerCase() ?? "jpg";
  const mediaType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/jpeg";
  return { data: base64, mediaType };
}

// ── Anthropic (Claude Vision) ────────────────────────────────────────────────

async function callClaudeVision(
  frames: ExtractedFrame[],
  config: AIConfig,
): Promise<StructuredResponse> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const images = frames.map((f) => loadImageBase64(f));

  const content: Anthropic.Messages.ContentBlockParam[] = [
    { type: "text", text: buildExtractionPrompt(frames.length) },
    ...images.map((img) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: img.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: img.data,
      },
    })),
  ];

  const msg = await anthropic.messages.create({
    model: config.model,
    max_tokens: config.maxTokens,
    messages: [{ role: "user", content }],
  });

  const text = msg.content
    .filter((c): c is Anthropic.Messages.TextBlock => c.type === "text")
    .map((c) => c.text)
    .join("");

  return parseStructuredResponse(text);
}

// ── OpenAI (GPT-4V) ──────────────────────────────────────────────────────────

async function callOpenAIVision(
  frames: ExtractedFrame[],
  config: AIConfig,
): Promise<StructuredResponse> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const images = frames.map((f) => loadImageBase64(f));

  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: buildExtractionPrompt(frames.length) },
    ...images.map((img) => ({
      type: "image_url" as const,
      image_url: {
        url: `data:${img.mediaType};base64,${img.data}`,
        detail: "high" as const,
      },
    })),
  ];

  const response = await openai.chat.completions.create({
    model: config.model,
    max_tokens: config.maxTokens,
    messages: [{ role: "user", content }],
    response_format: { type: "json_object" },
  });

  const text = response.choices[0]?.message?.content ?? "";
  return parseStructuredResponse(text);
}

// ── Response parsing ─────────────────────────────────────────────────────────

function parseStructuredResponse(text: string): StructuredResponse {
  // Strip markdown code fences if present
  let json = text.trim();
  if (json.startsWith("```")) {
    json = json.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  try {
    const parsed = JSON.parse(json);
    return normalizeResponse(parsed);
  } catch {
    // Try to extract JSON from within the text
    const match = json.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return normalizeResponse(JSON.parse(match[0]));
      } catch {
        // Fall through to empty response
      }
    }
  }

  return { zone: null, zoneConfidence: 0, containers: [], items: [], repairs: [] };
}

function normalizeResponse(raw: Record<string, unknown>): StructuredResponse {
  return {
    zone: typeof raw.zone === "string" ? raw.zone : null,
    zoneConfidence: typeof raw.zoneConfidence === "number" ? Math.max(0, Math.min(1, raw.zoneConfidence)) : 0,
    containers: Array.isArray(raw.containers)
      ? raw.containers.map((c: Record<string, unknown>) => ({
          label: String(c.label || ""),
          state: ["open", "closed"].includes(String(c.state || ""))
            ? (c.state as "open" | "closed")
            : "unknown",
          confidence: typeof c.confidence === "number" ? Math.max(0, Math.min(1, c.confidence)) : 0.5,
        }))
      : [],
    items: Array.isArray(raw.items)
      ? raw.items.map((item: Record<string, unknown>) => ({
          name: String(item.name || ""),
          container: typeof item.container === "string" ? item.container : undefined,
          surface: typeof item.surface === "string" ? item.surface : undefined,
          condition: ["good", "worn", "damaged", "unknown"].includes(String(item.condition || ""))
            ? (item.condition as "good" | "worn" | "damaged" | "unknown")
            : "unknown",
          confidence: typeof item.confidence === "number" ? Math.max(0, Math.min(1, item.confidence)) : 0.5,
          bbox: isValidBbox(item.bbox) ? item.bbox as ExtractedItem["bbox"] : undefined,
        }))
      : [],
    repairs: Array.isArray(raw.repairs)
      ? raw.repairs.map((r: Record<string, unknown>) => ({
          label: String(r.label || ""),
          severity: ["low", "medium", "high"].includes(String(r.severity || ""))
            ? (r.severity as "low" | "medium" | "high")
            : "medium",
          description: typeof r.description === "string" ? r.description : "",
          confidence: typeof r.confidence === "number" ? Math.max(0, Math.min(1, r.confidence)) : 0.5,
          bbox: isValidBbox(r.bbox) ? r.bbox as ExtractedRepair["bbox"] : undefined,
        }))
      : [],
  };
}

function isValidBbox(b: unknown): b is { x: number; y: number; width: number; height: number } {
  if (!b || typeof b !== "object") return false;
  const bb = b as Record<string, unknown>;
  return (
    typeof bb.x === "number" &&
    typeof bb.y === "number" &&
    typeof bb.width === "number" &&
    typeof bb.height === "number"
  );
}

// ── API key validation ───────────────────────────────────────────────────────

function checkAPIKey(provider: AIProvider): string | null {
  if (provider === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
    return "ANTHROPIC_API_KEY not set";
  }
  if (provider === "openai" && !process.env.OPENAI_API_KEY) {
    return "OPENAI_API_KEY not set";
  }
  return null;
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface ExtractionResult {
  bundleId: string;
  zone: string | null;
  zoneConfidence: number;
  containers: ExtractedContainer[];
  items: ExtractedItem[];
  repairs: ExtractedRepair[];
  error?: string;
}

/**
 * Call the configured vision model to extract structured observations from a scene bundle.
 * Each SceneBundle is analyzed independently for resumability.
 */
export async function extractFromBundle(
  bundle: SceneBundle,
  representativeFrames: ExtractedFrame[],
): Promise<ExtractionResult> {
  const config = getAIConfig();
  const keyError = checkAPIKey(config.provider);
  if (keyError) {
    return {
      bundleId: bundle.id,
      zone: null,
      zoneConfidence: 0,
      containers: [],
      items: [],
      repairs: [],
      error: keyError,
    };
  }

  try {
    let response: StructuredResponse;
    if (config.provider === "anthropic") {
      response = await callClaudeVision(representativeFrames, config);
    } else {
      response = await callOpenAIVision(representativeFrames, config);
    }

    return {
      bundleId: bundle.id,
      ...response,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown AI API error";
    return {
      bundleId: bundle.id,
      zone: null,
      zoneConfidence: 0,
      containers: [],
      items: [],
      repairs: [],
      error: message,
    };
  }
}

/**
 * Run multimodal extraction for all scene bundles in a walkthrough.
 * Persists observations to the database.
 */
export async function runMultimodalExtraction(
  db: PrismaClient,
  walkthroughId: string,
  spaceId: string,
  tenantId: string,
  bundles: SceneBundle[],
  representativeFrames: Map<string, ExtractedFrame[]>,
): Promise<{
  itemObservations: number;
  repairObservations: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let itemCount = 0;
  let repairCount = 0;

  // Find or guess zone IDs for matching
  const existingZones = await db.spaceZone.findMany({
    where: { spaceId, tenantId },
    select: { id: true, name: true },
  });

  // Find or guess storage location IDs
  const existingLocations = await db.storageLocation.findMany({
    where: { spaceId, tenantId },
    select: { id: true, name: true },
  });

  for (const bundle of bundles) {
    const frames = representativeFrames.get(bundle.id) ?? bundle.frames.slice(0, 2);
    if (frames.length === 0) continue;

    const result = await extractFromBundle(bundle, frames);

    if (result.error) {
      errors.push(`Bundle ${bundle.id}: ${result.error}`);
      continue;
    }

    // Match zone name to existing zone ID (case-insensitive)
    const matchedZone = result.zone
      ? existingZones.find((z) => z.name.toLowerCase() === result.zone!.toLowerCase())
      : null;

    // Pick the first frame's URL as keyframe evidence
    const keyframeUrl = frames[0]?.url ?? null;

    // Persist item observations
    for (const item of result.items) {
      if (!item.name) continue;

      const matchedLoc = item.container
        ? existingLocations.find((l) => l.name.toLowerCase() === item.container!.toLowerCase())
        : item.surface
          ? existingLocations.find((l) => l.name.toLowerCase() === item.surface!.toLowerCase())
          : null;

      await db.itemObservation.create({
        data: {
          walkthroughId,
          tenantId,
          label: item.name,
          confidence: item.confidence,
          zoneId: matchedZone?.id ?? null,
          storageLocationId: matchedLoc?.id ?? null,
          bbox: item.bbox ? JSON.stringify(item.bbox) : null,
          keyframeUrl,
          status: "pending",
        },
      });
      itemCount++;
    }

    // Persist repair observations
    for (const repair of result.repairs) {
      if (!repair.label) continue;

      await db.repairObservation.create({
        data: {
          walkthroughId,
          tenantId,
          label: repair.label,
          confidence: repair.confidence,
          zoneId: matchedZone?.id ?? null,
          bbox: repair.bbox ? JSON.stringify(repair.bbox) : null,
          keyframeUrl,
          status: "pending",
        },
      });
      repairCount++;
    }
  }

  return { itemObservations: itemCount, repairObservations: repairCount, errors };
}
