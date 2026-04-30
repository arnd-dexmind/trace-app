-- Create ProcessingJob table
CREATE TABLE "ProcessingJob" (
    "id" TEXT NOT NULL,
    "walkthroughId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextRetryAt" TIMESTAMP(3),
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessingJob_pkey" PRIMARY KEY ("id")
);

-- Index for dequeuing pending jobs ordered by creation time
CREATE INDEX "ProcessingJob_status_createdAt_idx" ON "ProcessingJob"("status", "createdAt");

-- Index for looking up jobs by walkthrough
CREATE INDEX "ProcessingJob_walkthroughId_idx" ON "ProcessingJob"("walkthroughId");

-- Index for tenant-scoped queries
CREATE INDEX "ProcessingJob_tenantId_status_idx" ON "ProcessingJob"("tenantId", "status");

-- Foreign key to Walkthrough
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_walkthroughId_fkey" FOREIGN KEY ("walkthroughId") REFERENCES "Walkthrough"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
