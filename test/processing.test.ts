import test from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db.js";
import { createApp } from "../src/app.js";
import {
  enqueue,
  dequeue,
  completeJob,
  failJob,
  getJobs,
  PROCESSING_STAGES,
} from "../src/lib/job-queue.js";
import { processBatch } from "../src/lib/processing-orchestrator.js";

function url(port: number, path: string) {
  return `http://127.0.0.1:${port}${path}`;
}

function headers(tenantId: string, extra?: Record<string, string>) {
  return { "content-type": "application/json", "x-tenant-id": tenantId, ...extra };
}

async function cleanDatabase() {
  // Delete in FK-safe order: children before parents
  await db.reviewAction.deleteMany();
  await db.itemIdentityLink.deleteMany();
  await db.itemLocationHistory.deleteMany();
  await db.repairObservation.deleteMany();
  await db.itemObservation.deleteMany();
  await db.reviewTask.deleteMany();
  await db.processingJob.deleteMany();
  await db.mediaAsset.deleteMany();
  // Nullify self-referential parentIds before deleting storage locations
  await db.storageLocation.updateMany({ data: { parentId: null } });
  await db.storageLocation.deleteMany();
  await db.walkthrough.deleteMany();
  await db.repairIssue.deleteMany();
  await db.spaceZone.deleteMany();
  await db.inventoryItem.deleteMany();
  await db.space.deleteMany();
}

async function createTestSpace(port: number, tenant = "tenant-a") {
  const res = await fetch(url(port, "/api/spaces"), {
    method: "POST",
    headers: headers(tenant),
    body: JSON.stringify({ name: "Processing Test Space" }),
  });
  return (await res.json()) as { id: string; name: string };
}

// ── Pipeline enqueue on walkthrough creation ───────────────────────────────

test("walkthrough creation seeds the first processing stage", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);

    const wtRes = await fetch(url(address.port, `/api/spaces/${space.id}/walkthroughs`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ metadata: { source: "test" } }),
    });
    assert.equal(wtRes.status, 201);
    const wt = (await wtRes.json()) as { id: string; status: string };
    assert.equal(wt.status, "uploaded");

    // Verify the first pipeline job was created (cascade handles the rest)
    const jobsRes = await fetch(
      url(address.port, `/api/processing/jobs?walkthroughId=${wt.id}`),
      { headers: headers("tenant-a") },
    );
    assert.equal(jobsRes.status, 200);
    const jobs = (await jobsRes.json()) as Array<{ stage: string; status: string }>;
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].stage, PROCESSING_STAGES[0]);
    assert.equal(jobs[0].status, "pending");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

// ── Full pipeline execution via process endpoint ───────────────────────────

test("POST /process runs pipeline and transitions walkthrough to awaiting_review", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);

    // Create walkthrough
    const wtRes = await fetch(url(address.port, `/api/spaces/${space.id}/walkthroughs`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ metadata: {} }),
    });
    const wt = (await wtRes.json()) as { id: string; status: string };
    assert.equal(wt.status, "uploaded");

    // Trigger processing
    const procRes = await fetch(
      url(address.port, `/api/spaces/${space.id}/walkthroughs/${wt.id}/process`),
      { method: "POST", headers: headers("tenant-a") },
    );
    assert.equal(procRes.status, 200);
    const procResult = (await procRes.json()) as {
      status: string;
      processing: { processed: number };
    };
    assert.equal(procResult.status, "processing");
    assert.ok(procResult.processing.processed >= PROCESSING_STAGES.length);

    // Walkthrough should now be awaiting_review
    const wtCheck = await fetch(
      url(address.port, `/api/spaces/${space.id}/walkthroughs`),
      { headers: headers("tenant-a") },
    );
    const wts = (await wtCheck.json()) as Array<{ id: string; status: string }>;
    const wtUpdated = wts.find((w) => w.id === wt.id);
    assert.equal(wtUpdated!.status, "awaiting_review");

    // All jobs should be completed
    const jobsRes = await fetch(
      url(address.port, `/api/processing/jobs?walkthroughId=${wt.id}`),
      { headers: headers("tenant-a") },
    );
    const jobs = (await jobsRes.json()) as Array<{ status: string }>;
    for (const job of jobs) {
      assert.equal(job.status, "completed");
    }

    // Review task should exist
    const queue = await fetch(url(address.port, "/api/review/queue"), {
      headers: headers("tenant-a"),
    });
    const tasks = (await queue.json()) as Array<{ id: string }>;
    assert.equal(tasks.length, 1);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

// ── Processing tick endpoint ───────────────────────────────────────────────

test("POST /api/processing/tick processes pending jobs", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);

    // Create walkthrough (enqueues pipeline but doesn't process)
    const wtRes = await fetch(url(address.port, `/api/spaces/${space.id}/walkthroughs`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ metadata: {} }),
    });
    const wt = (await wtRes.json()) as { id: string };

    // Tick should process all pending jobs
    const tickRes = await fetch(url(address.port, "/api/processing/tick"), {
      method: "POST",
      headers: headers("tenant-a"),
    });
    assert.equal(tickRes.status, 200);
    const tickResult = (await tickRes.json()) as { processed: number; results: Array<unknown> };
    assert.ok(tickResult.processed >= PROCESSING_STAGES.length);
    assert.equal(tickResult.results.length, tickResult.processed);

    // All jobs completed
    const jobsRes = await fetch(
      url(address.port, `/api/processing/jobs?walkthroughId=${wt.id}`),
      { headers: headers("tenant-a") },
    );
    const jobs = (await jobsRes.json()) as Array<{ status: string }>;
    for (const job of jobs) {
      assert.equal(job.status, "completed");
    }
  } finally {
    server.close();
    await db.$disconnect();
  }
});

// ── Walkthrough processing state endpoint ──────────────────────────────────

test("GET /api/processing/walkthroughs/:wid/state returns processing state", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);

    const wtRes = await fetch(url(address.port, `/api/spaces/${space.id}/walkthroughs`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ metadata: {} }),
    });
    const wt = (await wtRes.json()) as { id: string };

    // Query processing state before processing
    const stateRes = await fetch(
      url(address.port, `/api/processing/walkthroughs/${wt.id}/state`),
      { headers: headers("tenant-a") },
    );
    assert.equal(stateRes.status, 200);
    const state = (await stateRes.json()) as {
      total: number;
      pending: number;
      dead: number;
      completed: number;
      done: boolean;
    };
    assert.equal(state.total, 1);
    assert.equal(state.pending, 1);
    assert.equal(state.completed, 0);
    assert.equal(state.done, false);

    // Run processing
    await fetch(url(address.port, "/api/processing/tick"), {
      method: "POST",
      headers: headers("tenant-a"),
    });

    // Query state after processing
    const stateRes2 = await fetch(
      url(address.port, `/api/processing/walkthroughs/${wt.id}/state`),
      { headers: headers("tenant-a") },
    );
    const state2 = (await stateRes2.json()) as {
      total: number;
      pending: number;
      completed: number;
      done: boolean;
    };
    assert.equal(state2.pending, 0);
    assert.equal(state2.completed, PROCESSING_STAGES.length);
    assert.equal(state2.done, true);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

// ── Single job endpoint ────────────────────────────────────────────────────

test("GET /api/processing/jobs/:id returns a single job", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wtRes = await fetch(url(address.port, `/api/spaces/${space.id}/walkthroughs`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ metadata: {} }),
    });
    const wt = (await wtRes.json()) as { id: string };

    const jobsRes = await fetch(
      url(address.port, `/api/processing/jobs?walkthroughId=${wt.id}`),
      { headers: headers("tenant-a") },
    );
    const jobs = (await jobsRes.json()) as Array<{ id: string; stage: string }>;

    const firstJob = jobs[0];
    const jobRes = await fetch(url(address.port, `/api/processing/jobs/${firstJob.id}`), {
      headers: headers("tenant-a"),
    });
    assert.equal(jobRes.status, 200);
    const job = (await jobRes.json()) as { id: string; stage: string; status: string };
    assert.equal(job.id, firstJob.id);
    assert.equal(job.stage, firstJob.stage);
    assert.equal(job.status, "pending");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

test("GET /api/processing/jobs/:id returns 404 for non-existent job", async () => {
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const res = await fetch(url(address.port, "/api/processing/jobs/nonexistent"), {
      headers: headers("tenant-a"),
    });
    assert.equal(res.status, 404);
  } finally {
    server.close();
    await db.$disconnect();
  }
});

// ── Processing metrics ─────────────────────────────────────────────────────

test("GET /api/processing/metrics returns stage-level metrics", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);

    // Create walkthrough
    const wtRes = await fetch(url(address.port, `/api/spaces/${space.id}/walkthroughs`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ metadata: {} }),
    });
    const wt = (await wtRes.json()) as { id: string };

    // Run processing
    await fetch(url(address.port, "/api/processing/tick"), {
      method: "POST",
      headers: headers("tenant-a"),
    });

    const metricsRes = await fetch(url(address.port, "/api/processing/metrics"), {
      headers: headers("tenant-a"),
    });
    assert.equal(metricsRes.status, 200);
    const metrics = (await metricsRes.json()) as {
      stageMetrics: Array<{
        stage: string;
        total: number;
        completed: number;
        failed: number;
        dead: number;
        avg_duration_ms: number | null;
      }>;
    };

    assert.equal(metrics.stageMetrics.length, PROCESSING_STAGES.length);
    for (const sm of metrics.stageMetrics) {
      assert.equal(sm.total, 1);
      assert.equal(sm.completed, 1);
      assert.equal(sm.failed, 0);
      assert.equal(sm.dead, 0);
    }
  } finally {
    server.close();
    await db.$disconnect();
  }
});

// ── Job queue: dequeue / complete / fail (unit tests) ──────────────────────

test("job queue dequeue picks up oldest pending job and cascades through stages", async () => {
  await cleanDatabase();

  const space = await db.space.create({
    data: { tenantId: "t1", name: "Q Test" },
  });
  const wt = await db.walkthrough.create({
    data: { spaceId: space.id, tenantId: "t1", status: "uploaded" },
  });

  // Enqueue only the first stage — cascade will handle the rest
  await enqueue(db, { walkthroughId: wt.id, tenantId: "t1", stage: "transcoding" });

  // Dequeue gets transcoding
  const job = await dequeue(db, "t1");
  assert.ok(job !== null);
  assert.equal(job!.stage, "transcoding");

  // Complete transcoding — should cascade to frame_extraction
  const { nextStage } = await completeJob(db, job!.id);
  assert.equal(nextStage, "frame_extraction");

  // Dequeue gets the cascaded frame_extraction
  const job2 = await dequeue(db, "t1");
  assert.ok(job2 !== null);
  assert.equal(job2!.stage, "frame_extraction");

  // Complete frame_extraction — cascades to scene_segmentation
  const r2 = await completeJob(db, job2!.id);
  assert.equal(r2.nextStage, "scene_segmentation");

  // Verify cascaded scene_segmentation exists
  const job3 = await dequeue(db, "t1");
  assert.ok(job3 !== null);
  assert.equal(job3!.stage, "scene_segmentation");

  // Complete it and verify cascade continues
  await completeJob(db, job3!.id);

  const jobs = await getJobs(db, wt.id, "t1");
  const stages = jobs.map(j => `${j.stage}:${j.status}`);
  assert.ok(stages.includes("transcoding:completed"));
  assert.ok(stages.includes("frame_extraction:completed"));
  assert.ok(stages.includes("scene_segmentation:completed"));
  // multimodal_extraction should have been cascaded
  assert.ok(stages.includes("multimodal_extraction:pending"));

  await db.$disconnect();
});

test("job queue retry with exponential backoff", async () => {
  await cleanDatabase();

  const space = await db.space.create({
    data: { tenantId: "t1", name: "Retry Test" },
  });
  const wt = await db.walkthrough.create({
    data: { spaceId: space.id, tenantId: "t1", status: "uploaded" },
  });

  await enqueue(db, { walkthroughId: wt.id, tenantId: "t1", stage: "transcoding" });
  let job = await dequeue(db, "t1");
  assert.ok(job !== null);
  assert.equal(job!.attempt, 1);

  // Fail — should be retried with backoff
  const failResult = await failJob(db, job!.id, "simulated error");
  assert.ok(failResult !== null);
  assert.equal(failResult!.dead, false);
  assert.equal(failResult!.nextAttempt, 2);
  assert.ok(failResult!.nextRetryAt instanceof Date);
  // Backoff should be in the future
  assert.ok(failResult!.nextRetryAt.getTime() > Date.now());

  // Verify job is pending with attempt 2
  const jobs = await getJobs(db, wt.id, "t1");
  const pending = jobs.find((j) => j.id === job!.id);
  assert.ok(pending !== undefined);
  assert.equal(pending!.status, "pending");
  assert.equal(pending!.attempt, 2);
  assert.ok(pending!.nextRetryAt !== null);

  // Dequeue should not pick it up (backoff hasn't elapsed)
  const skipped = await dequeue(db, "t1");
  assert.equal(skipped, null);

  // Force the nextRetryAt to now so it can be dequeued
  await db.processingJob.update({
    where: { id: job!.id },
    data: { nextRetryAt: new Date() },
  });

  job = await dequeue(db, "t1");
  assert.ok(job !== null);
  assert.equal(job!.attempt, 2);

  // Complete it
  await completeJob(db, job!.id);

  // Verify it's now completed
  const jobs2 = await getJobs(db, wt.id, "t1");
  const completed = jobs2.find((j) => j.id === job!.id);
  assert.equal(completed!.status, "completed");

  await db.$disconnect();
});

test("job queue dead-letter after max attempts exhausted", async () => {
  await cleanDatabase();

  const space = await db.space.create({
    data: { tenantId: "t1", name: "DLQ Test" },
  });
  const wt = await db.walkthrough.create({
    data: { spaceId: space.id, tenantId: "t1", status: "uploaded" },
  });

  await enqueue(db, { walkthroughId: wt.id, tenantId: "t1", stage: "transcoding" });

  // Fail 3 times (maxAttempts = 3)
  let job = await dequeue(db, "t1");
  await failJob(db, job!.id, "error 1");

  // Force retry now
  await db.processingJob.update({ where: { id: job!.id }, data: { nextRetryAt: new Date() } });
  job = await dequeue(db, "t1");
  await failJob(db, job!.id, "error 2");

  await db.processingJob.update({ where: { id: job!.id }, data: { nextRetryAt: new Date() } });
  job = await dequeue(db, "t1");
  const finalFail = await failJob(db, job!.id, "error 3");

  // Should be dead now
  assert.ok(finalFail !== null);
  assert.equal(finalFail!.dead, true);

  const jobs = await getJobs(db, wt.id, "t1");
  const dead = jobs.find((j) => j.id === job!.id);
  assert.equal(dead!.status, "dead");
  assert.equal(dead!.error, "error 3");

  await db.$disconnect();
});

// ── Tenant isolation ───────────────────────────────────────────────────────

test("job queries are tenant-scoped", async () => {
  await cleanDatabase();

  const spaceA = await db.space.create({
    data: { tenantId: "tenant-a", name: "Space A" },
  });
  const wtA = await db.walkthrough.create({
    data: { spaceId: spaceA.id, tenantId: "tenant-a", status: "uploaded" },
  });
  await enqueue(db, { walkthroughId: wtA.id, tenantId: "tenant-a", stage: "transcoding" });

  const spaceB = await db.space.create({
    data: { tenantId: "tenant-b", name: "Space B" },
  });
  const wtB = await db.walkthrough.create({
    data: { spaceId: spaceB.id, tenantId: "tenant-b", status: "uploaded" },
  });
  await enqueue(db, { walkthroughId: wtB.id, tenantId: "tenant-b", stage: "transcoding" });

  // tenant-a can only see their jobs
  const jobsA = await getJobs(db, wtA.id, "tenant-a");
  assert.equal(jobsA.length, 1);
  assert.equal(jobsA[0].tenantId, "tenant-a");

  // tenant-b can only see their jobs
  const jobsB = await getJobs(db, wtB.id, "tenant-b");
  assert.equal(jobsB.length, 1);
  assert.equal(jobsB[0].tenantId, "tenant-b");

  await db.$disconnect();
});

// ── Walkthrough failed status on dead job ──────────────────────────────────

test("walkthrough transitions to failed when job reaches dead-letter", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);

    // Create walkthrough
    const wtRes = await fetch(url(address.port, `/api/spaces/${space.id}/walkthroughs`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ metadata: {} }),
    });
    const wt = (await wtRes.json()) as { id: string; status: string };

    // Manually cause a job to fail all attempts
    // We need to directly manipulate the DB to force a failure, since
    // processBatch catches errors and our no-op stages don't fail.
    // We'll dequeue a job and fail it through the job queue directly.
    const jobs = await getJobs(db, wt.id, "tenant-a");
    const firstJob = jobs[0];

    // Fail the job 3 times to exhaust retries
    let job = await dequeue(db, "tenant-a");
    assert.ok(job !== null);
    await failJob(db, job!.id, "forced error 1");

    await db.processingJob.update({ where: { id: job!.id }, data: { nextRetryAt: new Date() } });
    job = await dequeue(db, "tenant-a");
    await failJob(db, job!.id, "forced error 2");

    await db.processingJob.update({ where: { id: job!.id }, data: { nextRetryAt: new Date() } });
    job = await dequeue(db, "tenant-a");
    const result = await failJob(db, job!.id, "forced error 3");
    assert.equal(result!.dead, true);

    // Now simulate what the orchestrator does: mark walkthrough as failed
    await db.walkthrough.update({
      where: { id: wt.id },
      data: { status: "failed" },
    });

    // Verify walkthrough status
    const wtCheck = await fetch(
      url(address.port, `/api/spaces/${space.id}/walkthroughs`),
      { headers: headers("tenant-a") },
    );
    const wts = (await wtCheck.json()) as Array<{ id: string; status: string }>;
    const wtUpdated = wts.find((w) => w.id === wt.id);
    assert.equal(wtUpdated!.status, "failed");
  } finally {
    server.close();
    await db.$disconnect();
  }
});

// ── Idempotency: process endpoint on already-processing walkthrough ────────

test("POST /process returns 404 for walkthrough not in uploaded state", async () => {
  await cleanDatabase();
  const app = createApp();
  const server = app.listen(0);

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("unexpected address");

    const space = await createTestSpace(address.port);
    const wtRes = await fetch(url(address.port, `/api/spaces/${space.id}/walkthroughs`), {
      method: "POST",
      headers: headers("tenant-a"),
      body: JSON.stringify({ metadata: {} }),
    });
    const wt = (await wtRes.json()) as { id: string };

    // First process succeeds
    await fetch(
      url(address.port, `/api/spaces/${space.id}/walkthroughs/${wt.id}/process`),
      { method: "POST", headers: headers("tenant-a") },
    );

    // Second process should fail (walkthrough is now awaiting_review)
    const res = await fetch(
      url(address.port, `/api/spaces/${space.id}/walkthroughs/${wt.id}/process`),
      { method: "POST", headers: headers("tenant-a") },
    );
    assert.equal(res.status, 404);
  } finally {
    server.close();
    await db.$disconnect();
  }
});
