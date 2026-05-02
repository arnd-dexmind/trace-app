-- CreateTable
CREATE TABLE "UserOnboarding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tourCompleted" BOOLEAN NOT NULL DEFAULT false,
    "tourCurrentStep" INTEGER NOT NULL DEFAULT 0,
    "tourDismissed" BOOLEAN NOT NULL DEFAULT false,
    "sampleDataSeeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserOnboarding_userId_tenantId_key" ON "UserOnboarding"("userId", "tenantId");
