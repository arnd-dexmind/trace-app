import type { PrismaClient } from "@prisma/client";
import { dequeue, completeJob, failJob, isLastStage, getJobs } from "./job-queue.js";
import { extractKeyframes } from "./frame-extractor.js";
import { buildSceneBundles, pickRepresentativeFrames } from "./scene-segmenter.js";
import { runMultimodalExtraction } from "./multimodal-extractor.js";
import { matchObservationsToInventoryWithMetrics, matchRepairsToIssues } from "./entity-matcher.js";
import { generateWalkthroughDiff, applyAutoItems } from "./diff-generator.js";

export async function processNextJob(
  db: PrismaClient,
  tenantId: string,
): Promise<{ id: string; stage: string; action: "completed" | "failed" | "dead" } | null> {
  const job = await dequeue(db, tenantId);
  if (!job) return null;

  try {
    await executeStage(db, job.walkthroughId, job.tenantId, job.stage);

    await completeJob(db, job.id);

    if (isLastStage(job.stage as Parameters<typeof isLastStage>[0])) {
      await finalizePipeline(db, job.walkthroughId, job.tenantId);
    }

    await ensureProcessingStatus(db, job.walkthroughId);

    return { id: job.id, stage: job.stage, action: "completed" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const result = await failJob(db, job.id, message);
    if (!result) return { id: job.id, stage: job.stage, action: "failed" };

    if (result.dead) {
      await db.walkthrough.update({
        where: { id: job.walkthroughId },
        data: { status: "failed" },
      });
      return { id: job.id, stage: job.stage, action: "dead" };
    }

    return { id: job.id, stage: job.stage, action: "failed" };
  }
}

export async function processBatch(
  db: PrismaClient,
  tenantId: string,
  maxJobs = 10,
) {
  const results: { id: string; stage: string; action: string }[] = [];

  for (let i = 0; i < maxJobs; i++) {
    const result = await processNextJob(db, tenantId);
    if (!result) break;
    results.push(result);
  }

  return { processed: results.length, results };
}

export async function getWalkthroughProcessingState(
  db: PrismaClient,
  walkthroughId: string,
  tenantId: string,
) {
  const jobs = await getJobs(db, walkthroughId, tenantId);

  const pending = jobs.filter((j) => j.status === "pending" || j.status === "running");
  const dead = jobs.filter((j) => j.status === "dead");
  const completed = jobs.filter((j) => j.status === "completed");

  return {
    total: jobs.length,
    pending: pending.length,
    dead: dead.length,
    completed: completed.length,
    done: pending.length === 0 && dead.length === 0,
    failed: dead.length > 0,
    jobs,
  };
}

// ── Stage implementations ────────────────────────────────────────────────────

async function executeStage(
  db: PrismaClient,
  walkthroughId: string,
  tenantId: string,
  stage: string,
): Promise<void> {
  switch (stage) {
    case "transcoding":
      await stageTranscoding(db, walkthroughId);
      break;
    case "frame_extraction":
      await stageFrameExtraction(db, walkthroughId, tenantId);
      break;
    case "scene_segmentation":
      await stageSceneSegmentation(db, walkthroughId);
      break;
    case "multimodal_extraction":
      await stageMultimodalExtraction(db, walkthroughId, tenantId);
      break;
    case "entity_matching":
      await stageEntityMatching(db, walkthroughId, tenantId);
      break;
    case "diff_generation":
      await stageDiffGeneration(db, walkthroughId, tenantId);
      break;
    case "review_creation":
      // Handled by finalizePipeline — this is a marker stage
      break;
  }
}

async function getWalkthroughSpaceId(db: PrismaClient, walkthroughId: string): Promise<string> {
  const wt = await db.walkthrough.findUnique({
    where: { id: walkthroughId },
    select: { spaceId: true },
  });
  if (!wt) throw new Error(`Walkthrough ${walkthroughId} not found`);
  return wt.spaceId;
}

/** Validate media inputs exist and are processable. */
async function stageTranscoding(db: PrismaClient, walkthroughId: string) {
  const assets = await db.mediaAsset.findMany({
    where: { walkthroughId, type: { in: ["video", "image"] } },
  });

  if (assets.length === 0) {
    console.log(JSON.stringify({
      level: "warn",
      message: "No media assets to process",
      walkthroughId,
      stage: "transcoding",
    }));
  }
}

/** Extract keyframes from video or use uploaded images directly. */
async function stageFrameExtraction(db: PrismaClient, walkthroughId: string, tenantId: string) {
  // Idempotency: skip if keyframes already exist
  const existing = await db.mediaAsset.findMany({
    where: { walkthroughId, type: "keyframe" },
  });
  if (existing.length > 0) {
    console.log(JSON.stringify({
      level: "info",
      message: `Frame extraction already done (${existing.length} keyframes exist)`,
      walkthroughId,
      stage: "frame_extraction",
    }));
    return;
  }

  const result = await extractKeyframes(db, walkthroughId, tenantId);

  // Persist frame metadata for later stages (sceneScore, timestamp)
  if (result.frames.length > 0) {
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
          extractedFrames: result.frames.map((f) => ({
            url: f.url,
            assetId: f.assetId,
            timestamp: f.timestamp,
            sceneScore: f.sceneScore,
          })),
        }),
      },
    });
  }

  console.log(JSON.stringify({
    level: result.error ? "warn" : "info",
    message: result.error
      ? `Frame extraction: ${result.error}`
      : `Extracted ${result.frames.length} frames from ${result.sourceType}`,
    walkthroughId,
    stage: "frame_extraction",
  }));
}

/** Group keyframes into scene bundles. */
async function stageSceneSegmentation(db: PrismaClient, walkthroughId: string) {
  const bundles = await buildSceneBundles(db, walkthroughId);

  if (bundles.length === 0) {
    console.log(JSON.stringify({
      level: "info",
      message: "No scene bundles created (no keyframes available)",
      walkthroughId,
      stage: "scene_segmentation",
    }));
    return;
  }

  // Merge bundle metadata with existing walkthrough metadata
  const wt = await db.walkthrough.findUnique({
    where: { id: walkthroughId },
    select: { metadata: true },
  });
  const existingMeta = wt?.metadata ? JSON.parse(String(wt.metadata)) : {};
  const picks = pickRepresentativeFrames(bundles);

  await db.walkthrough.update({
    where: { id: walkthroughId },
    data: {
      metadata: JSON.stringify({
        ...existingMeta,
        bundleCount: bundles.length,
        bundleIds: bundles.map((b) => b.id),
        representativeFrames: Object.fromEntries(
          Array.from(picks.entries()).map(([id, frames]) => [id, frames.map((f) => f.assetId)]),
        ),
      }),
    },
  });

  console.log(JSON.stringify({
    level: "info",
    message: `Segmented ${bundles.length} scene bundles`,
    walkthroughId,
    stage: "scene_segmentation",
  }));
}

/** Call multimodal vision API to extract items, repairs, and zones. */
async function stageMultimodalExtraction(db: PrismaClient, walkthroughId: string, tenantId: string) {
  // Idempotency: skip if observations already exist for this walkthrough
  const existing = await db.itemObservation.count({ where: { walkthroughId } });
  if (existing > 0) {
    console.log(JSON.stringify({
      level: "info",
      message: `Multimodal extraction already done (${existing} item observations exist)`,
      walkthroughId,
      stage: "multimodal_extraction",
    }));
    return;
  }

  const bundles = await buildSceneBundles(db, walkthroughId);
  if (bundles.length === 0) {
    console.log(JSON.stringify({
      level: "info",
      message: "No scene bundles — skipping multimodal extraction",
      walkthroughId,
      stage: "multimodal_extraction",
    }));
    return;
  }

  const spaceId = await getWalkthroughSpaceId(db, walkthroughId);
  const picks = pickRepresentativeFrames(bundles);

  const result = await runMultimodalExtraction(
    db, walkthroughId, spaceId, tenantId, bundles, picks,
  );

  console.log(JSON.stringify({
    level: result.errors.length > 0 ? "warn" : "info",
    message: `Extracted ${result.itemObservations} items, ${result.repairObservations} repairs`,
    errors: result.errors,
    walkthroughId,
    stage: "multimodal_extraction",
  }));
}

/** Match extracted observations against existing inventory using multi-factor identity resolution. */
async function stageEntityMatching(db: PrismaClient, walkthroughId: string, tenantId: string) {
  const spaceId = await getWalkthroughSpaceId(db, walkthroughId);

  const [{ results: itemResults, metrics }, repairLinked] = await Promise.all([
    matchObservationsToInventoryWithMetrics(db, walkthroughId, spaceId, tenantId),
    matchRepairsToIssues(db, walkthroughId, spaceId, tenantId),
  ]);

  const matchedItems = itemResults.filter((r) => r.matchedItemId !== null).length;

  console.log(JSON.stringify({
    level: "info",
    message: `Identity resolution: ${metrics.matched} matched, ${metrics.ambiguous} ambiguous, ${metrics.likelyNew} likely new (${matchedItems} linked, ${repairLinked} repairs)`,
    walkthroughId,
    stage: "entity_matching",
    identityMetrics: metrics,
  }));
}

/** Generate diff against previous walkthrough, auto-apply high-confidence changes, and store results. */
async function stageDiffGeneration(db: PrismaClient, walkthroughId: string, tenantId: string) {
  const spaceId = await getWalkthroughSpaceId(db, walkthroughId);

  const diff = await generateWalkthroughDiff(db, walkthroughId, spaceId, tenantId);

  // Auto-apply high-confidence unchanged items
  const autoApplied = await applyAutoItems(db, diff, tenantId);

  // Store diff in walkthrough metadata for operator review
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
        diff: {
          summary: diff.summary,
          previousWalkthroughId: diff.previousWalkthroughId,
          generatedAt: new Date().toISOString(),
        },
      }),
    },
  });

  console.log(JSON.stringify({
    level: "info",
    message: `Diff: ${diff.summary.newItems} new, ${diff.summary.movedItems} moved, ${diff.summary.missingItems} missing, ${diff.summary.unchangedItems} unchanged (${autoApplied} auto-applied), ${diff.summary.newRepairs} new repairs, ${diff.summary.resolvedRepairs} resolved repairs`,
    walkthroughId,
    stage: "diff_generation",
  }));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function ensureProcessingStatus(db: PrismaClient, walkthroughId: string) {
  const wt = await db.walkthrough.findUnique({ where: { id: walkthroughId } });
  if (wt && wt.status === "uploaded") {
    await db.walkthrough.update({
      where: { id: walkthroughId },
      data: { status: "processing", processedAt: new Date() },
    });
  }
}

async function finalizePipeline(
  db: PrismaClient,
  walkthroughId: string,
  tenantId: string,
) {
  // Check if all observations are already processed (auto-applied by diff engine)
  const [pendingCount, totalCount] = await Promise.all([
    db.itemObservation.count({ where: { walkthroughId, status: "pending" } }),
    db.itemObservation.count({ where: { walkthroughId } }),
  ]);

  // If no observations exist yet, skip finalization — keep the walkthrough
  // in "processing" so observations can still be ingested.
  if (totalCount === 0) {
    return;
  }

  // All observations have been processed — auto-apply and skip review
  if (pendingCount === 0) {
    await db.reviewTask.updateMany({
      where: { walkthroughId, status: "pending" },
      data: { status: "completed" },
    });
    await db.walkthrough.update({
      where: { id: walkthroughId },
      data: { status: "applied", completedAt: new Date() },
    });
    return;
  }

  await db.reviewTask.upsert({
    where: { walkthroughId },
    create: {
      walkthroughId,
      tenantId,
      status: "pending",
    },
    update: { status: "pending" },
  });

  await db.walkthrough.update({
    where: { id: walkthroughId },
    data: { status: "awaiting_review" },
  });
}
