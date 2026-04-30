import type { PrismaClient } from "@prisma/client";
import type { ExtractedFrame } from "./frame-extractor.js";

export interface SceneBundle {
  id: string; // stable identifier for resumability
  frames: ExtractedFrame[];
  estimatedZone: string | null;
  containsOpenContainer: boolean;
  tags: string[];
}

/**
 * Group keyframes into scene bundles.
 *
 * Strategy for MVP: temporal grouping based on frame index and scene-change scores.
 * High scene-change scores indicate potential scene boundaries.
 * Frames close together in time with low scene-change scores belong to the same scene.
 * Large gaps or high scene-change scores start a new scene.
 */
export function segmentScenes(frames: ExtractedFrame[]): SceneBundle[] {
  if (frames.length === 0) return [];

  if (frames.length === 1) {
    return [
      {
        id: `scene-0`,
        frames: [frames[0]],
        estimatedZone: null,
        containsOpenContainer: false,
        tags: [],
      },
    ];
  }

  const bundles: SceneBundle[] = [];
  let currentBundle: ExtractedFrame[] = [frames[0]];
  const SCENE_THRESHOLD = 0.4;

  for (let i = 1; i < frames.length; i++) {
    const prev = frames[i - 1];
    const curr = frames[i];

    // Scene boundary: high scene-change score or large timestamp gap
    const timeGap = prev.timestamp !== null && curr.timestamp !== null
      ? curr.timestamp - prev.timestamp
      : 0;
    const isBoundary =
      curr.sceneScore >= SCENE_THRESHOLD || (timeGap > 5);

    if (isBoundary && currentBundle.length > 0) {
      bundles.push({
        id: `scene-${bundles.length}`,
        frames: [...currentBundle],
        estimatedZone: null,
        containsOpenContainer: false,
        tags: [],
      });
      currentBundle = [];
    }

    currentBundle.push(curr);
  }

  if (currentBundle.length > 0) {
    bundles.push({
      id: `scene-${bundles.length}`,
      frames: [...currentBundle],
      estimatedZone: null,
      containsOpenContainer: false,
      tags: [],
    });
  }

  // Ensure each bundle has at least one frame
  return bundles.filter((b) => b.frames.length > 0);
}

/**
 * Pick representative frames from each bundle for AI analysis.
 * Selects the first frame (highest scene-change score) and middle frame.
 * Limits to max 3 frames per bundle to control API costs.
 */
export function pickRepresentativeFrames(
  bundles: SceneBundle[],
  maxPerBundle = 2,
): Map<string, ExtractedFrame[]> {
  const picks = new Map<string, ExtractedFrame[]>();

  for (const bundle of bundles) {
    const frames = bundle.frames;
    if (frames.length <= maxPerBundle) {
      picks.set(bundle.id, frames);
      continue;
    }

    const selected: ExtractedFrame[] = [];

    // Always include the frame with highest scene-change score (the "entry" frame)
    const sorted = [...frames].sort((a, b) => b.sceneScore - a.sceneScore);
    const topIdx = frames.indexOf(sorted[0]);
    selected.push(frames[topIdx]);

    // Add frames spaced evenly through the bundle
    const remaining = maxPerBundle - 1;
    if (remaining > 0) {
      const step = Math.max(1, Math.floor(frames.length / (remaining + 1)));
      for (let i = step; i < frames.length && selected.length < maxPerBundle; i += step) {
        if (!selected.includes(frames[i])) {
          selected.push(frames[i]);
        }
      }
    }

    picks.set(bundle.id, selected.slice(0, maxPerBundle));
  }

  return picks;
}

/**
 * Load keyframes for a walkthrough and return scene bundles.
 */
export async function buildSceneBundles(
  db: PrismaClient,
  walkthroughId: string,
): Promise<SceneBundle[]> {
  const keyframes = await db.mediaAsset.findMany({
    where: { walkthroughId, type: "keyframe" },
    orderBy: { createdAt: "asc" },
  });

  if (keyframes.length === 0) {
    return [];
  }

  const frames: ExtractedFrame[] = keyframes.map((kf, i) => ({
    path: "", // path not needed once persisted
    url: kf.url,
    timestamp: i,
    sceneScore: 0,
    assetId: kf.id,
  }));

  return segmentScenes(frames);
}
