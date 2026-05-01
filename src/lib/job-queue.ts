import type { PrismaClient } from "@prisma/client";

// ── Stage definitions ────────────────────────────────────────────────────────

export const PROCESSING_STAGES = [
  "transcoding",
  "frame_extraction",
  "scene_segmentation",
  "multimodal_extraction",
  "entity_matching",
  "diff_generation",
  "review_creation",
] as const;

export type ProcessingStage = (typeof PROCESSING_STAGES)[number];

const NEXT_STAGE: Record<ProcessingStage, ProcessingStage | null> = {
  transcoding: "frame_extraction",
  frame_extraction: "scene_segmentation",
  scene_segmentation: "multimodal_extraction",
  multimodal_extraction: "entity_matching",
  entity_matching: "diff_generation",
  diff_generation: "review_creation",
  review_creation: null,
};

// ── Exponential backoff ──────────────────────────────────────────────────────

const BASE_DELAY_MS = 60_000; // 1 minute

function backoffDelay(attempt: number): Date {
  const ms = BASE_DELAY_MS * Math.pow(2, attempt - 1);
  return new Date(Date.now() + ms);
}

// ── Enqueue ──────────────────────────────────────────────────────────────────

export async function enqueue(
  db: PrismaClient,
  params: { walkthroughId: string; tenantId: string; stage: ProcessingStage },
) {
  return db.processingJob.create({
    data: {
      walkthroughId: params.walkthroughId,
      tenantId: params.tenantId,
      stage: params.stage,
      status: "pending",
    },
  });
}

// ── Enqueue full pipeline ────────────────────────────────────────────────────

export async function enqueuePipeline(
  db: PrismaClient,
  params: { walkthroughId: string; tenantId: string },
) {
  // Only seed the first stage. completeJob cascades through the rest.
  const job = await enqueue(db, { ...params, stage: PROCESSING_STAGES[0] });
  return [job];
}

// ── Dequeue ──────────────────────────────────────────────────────────────────
// Uses SELECT ... FOR UPDATE SKIP LOCKED inside a transaction for safe concurrent dequeue.

export async function dequeue(
  db: PrismaClient,
  tenantId: string,
) {
  const now = new Date();

  return db.$transaction(async (tx) => {
    const jobs = await tx.$queryRaw<
      {
        id: string;
        walkthroughId: string;
        tenantId: string;
        stage: string;
        status: string;
        attempt: number;
        maxAttempts: number;
        nextRetryAt: Date | null;
        error: string | null;
        startedAt: Date | null;
        completedAt: Date | null;
        createdAt: Date;
      }[]
    >`
      SELECT * FROM "ProcessingJob"
      WHERE "tenantId" = ${tenantId}
        AND "status" = 'pending'
        AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= ${now})
      ORDER BY "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;

    if (jobs.length === 0) return null;

    const job = jobs[0];

    await tx.processingJob.update({
      where: { id: job.id },
      data: { status: "running", startedAt: now },
    });

    return job;
  });
}

// ── Complete ─────────────────────────────────────────────────────────────────

export async function completeJob(
  db: PrismaClient,
  jobId: string,
) {
  const job = await db.processingJob.update({
    where: { id: jobId },
    data: { status: "completed", completedAt: new Date() },
  });

  // Enqueue next stage if one exists and no pending/running job for it yet
  const stage = job.stage as ProcessingStage;
  const next = NEXT_STAGE[stage];
  if (next) {
    const existing = await db.processingJob.findFirst({
      where: {
        walkthroughId: job.walkthroughId,
        stage: next,
        status: { in: ["pending", "running"] },
      },
    });
    if (!existing) {
      await enqueue(db, {
        walkthroughId: job.walkthroughId,
        tenantId: job.tenantId,
        stage: next,
      });
    }
  }

  return { job, nextStage: next };
}

// ── Fail with retry ──────────────────────────────────────────────────────────

export async function failJob(
  db: PrismaClient,
  jobId: string,
  error: string,
) {
  const job = await db.processingJob.findUnique({ where: { id: jobId } });
  if (!job) return null;

  const nextAttempt = job.attempt + 1;

  if (nextAttempt <= job.maxAttempts) {
    // Retry with exponential backoff
    const nextRetryAt = backoffDelay(nextAttempt);
    await db.processingJob.update({
      where: { id: jobId },
      data: {
        status: "pending",
        attempt: nextAttempt,
        nextRetryAt,
        error,
      },
    });
    return { dead: false, nextAttempt, nextRetryAt };
  }

  // Dead-letter: exhausted all attempts
  await db.processingJob.update({
    where: { id: jobId },
    data: { status: "dead", error },
  });
  return { dead: true };
}

// ── Queries ──────────────────────────────────────────────────────────────────

export async function getJobs(
  db: PrismaClient,
  walkthroughId: string,
  tenantId: string,
) {
  return db.processingJob.findMany({
    where: { walkthroughId, tenantId },
    orderBy: { createdAt: "asc" },
  });
}

export async function getJob(
  db: PrismaClient,
  jobId: string,
  tenantId: string,
) {
  const job = await db.processingJob.findUnique({ where: { id: jobId } });
  if (!job || job.tenantId !== tenantId) return null;
  return job;
}

// ── Metrics ──────────────────────────────────────────────────────────────────

export async function getProcessingMetrics(
  db: PrismaClient,
  tenantId: string,
) {
  const stageMetrics = await db.$queryRaw<
    {
      stage: string;
      total: bigint;
      completed: bigint;
      failed: bigint;
      dead: bigint;
      avg_duration_ms: number | null;
    }[]
  >`
    SELECT
      "stage",
      COUNT(*)::int AS "total",
      COUNT(*) FILTER (WHERE "status" = 'completed')::int AS "completed",
      COUNT(*) FILTER (WHERE "status" = 'failed')::int AS "failed",
      COUNT(*) FILTER (WHERE "status" = 'dead')::int AS "dead",
      AVG(
        EXTRACT(EPOCH FROM ("completedAt" - "startedAt")) * 1000
      ) FILTER (WHERE "status" = 'completed') AS "avg_duration_ms"
    FROM "ProcessingJob"
    WHERE "tenantId" = ${tenantId}
    GROUP BY "stage"
    ORDER BY "stage"
  `;

  return { stageMetrics };
}

// ── Pipeline helper ──────────────────────────────────────────────────────────

export function isLastStage(stage: ProcessingStage): boolean {
  return NEXT_STAGE[stage] === null;
}

export function getNextStage(stage: ProcessingStage): ProcessingStage | null {
  return NEXT_STAGE[stage];
}
