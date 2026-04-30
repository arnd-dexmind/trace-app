-- CreateTable
CREATE TABLE "Space" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Space_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Walkthrough" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "metadata" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Walkthrough_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "walkthroughId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaceZone" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaceZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageLocation" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "zoneId" TEXT,
    "parentId" TEXT,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemObservation" (
    "id" TEXT NOT NULL,
    "walkthroughId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT,
    "zoneId" TEXT,
    "storageLocationId" TEXT,
    "label" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "bbox" TEXT,
    "keyframeUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemIdentityLink" (
    "id" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "matchConfidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemIdentityLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemLocationHistory" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "zoneId" TEXT,
    "storageLocationId" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceObservationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemLocationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairIssue" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "itemId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepairIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairObservation" (
    "id" TEXT NOT NULL,
    "walkthroughId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "repairIssueId" TEXT,
    "zoneId" TEXT,
    "label" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "bbox" TEXT,
    "keyframeUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewTask" (
    "id" TEXT NOT NULL,
    "walkthroughId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "assignedTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewAction" (
    "id" TEXT NOT NULL,
    "reviewTaskId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "observationId" TEXT,
    "itemId" TEXT,
    "previousLabel" TEXT,
    "newLabel" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Space_tenantId_idx" ON "Space"("tenantId");

-- CreateIndex
CREATE INDEX "Walkthrough_spaceId_status_idx" ON "Walkthrough"("spaceId", "status");

-- CreateIndex
CREATE INDEX "Walkthrough_tenantId_idx" ON "Walkthrough"("tenantId");

-- CreateIndex
CREATE INDEX "MediaAsset_walkthroughId_idx" ON "MediaAsset"("walkthroughId");

-- CreateIndex
CREATE INDEX "SpaceZone_spaceId_idx" ON "SpaceZone"("spaceId");

-- CreateIndex
CREATE INDEX "StorageLocation_spaceId_idx" ON "StorageLocation"("spaceId");

-- CreateIndex
CREATE INDEX "StorageLocation_zoneId_idx" ON "StorageLocation"("zoneId");

-- CreateIndex
CREATE INDEX "StorageLocation_parentId_idx" ON "StorageLocation"("parentId");

-- CreateIndex
CREATE INDEX "InventoryItem_spaceId_name_idx" ON "InventoryItem"("spaceId", "name");

-- CreateIndex
CREATE INDEX "InventoryItem_tenantId_idx" ON "InventoryItem"("tenantId");

-- CreateIndex
CREATE INDEX "ItemObservation_walkthroughId_idx" ON "ItemObservation"("walkthroughId");

-- CreateIndex
CREATE INDEX "ItemObservation_itemId_idx" ON "ItemObservation"("itemId");

-- CreateIndex
CREATE INDEX "ItemIdentityLink_observationId_idx" ON "ItemIdentityLink"("observationId");

-- CreateIndex
CREATE INDEX "ItemIdentityLink_itemId_idx" ON "ItemIdentityLink"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemIdentityLink_observationId_itemId_key" ON "ItemIdentityLink"("observationId", "itemId");

-- CreateIndex
CREATE INDEX "ItemLocationHistory_itemId_observedAt_idx" ON "ItemLocationHistory"("itemId", "observedAt");

-- CreateIndex
CREATE INDEX "RepairIssue_spaceId_status_idx" ON "RepairIssue"("spaceId", "status");

-- CreateIndex
CREATE INDEX "RepairIssue_tenantId_idx" ON "RepairIssue"("tenantId");

-- CreateIndex
CREATE INDEX "RepairObservation_walkthroughId_idx" ON "RepairObservation"("walkthroughId");

-- CreateIndex
CREATE INDEX "RepairObservation_repairIssueId_idx" ON "RepairObservation"("repairIssueId");

-- CreateIndex
CREATE INDEX "ReviewTask_tenantId_status_idx" ON "ReviewTask"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewTask_walkthroughId_key" ON "ReviewTask"("walkthroughId");

-- CreateIndex
CREATE INDEX "ReviewAction_reviewTaskId_idx" ON "ReviewAction"("reviewTaskId");

-- AddForeignKey
ALTER TABLE "Walkthrough" ADD CONSTRAINT "Walkthrough_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_walkthroughId_fkey" FOREIGN KEY ("walkthroughId") REFERENCES "Walkthrough"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceZone" ADD CONSTRAINT "SpaceZone_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageLocation" ADD CONSTRAINT "StorageLocation_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageLocation" ADD CONSTRAINT "StorageLocation_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "SpaceZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorageLocation" ADD CONSTRAINT "StorageLocation_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "StorageLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemObservation" ADD CONSTRAINT "ItemObservation_walkthroughId_fkey" FOREIGN KEY ("walkthroughId") REFERENCES "Walkthrough"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemObservation" ADD CONSTRAINT "ItemObservation_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemObservation" ADD CONSTRAINT "ItemObservation_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "SpaceZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemObservation" ADD CONSTRAINT "ItemObservation_storageLocationId_fkey" FOREIGN KEY ("storageLocationId") REFERENCES "StorageLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemIdentityLink" ADD CONSTRAINT "ItemIdentityLink_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "ItemObservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemIdentityLink" ADD CONSTRAINT "ItemIdentityLink_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemLocationHistory" ADD CONSTRAINT "ItemLocationHistory_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemLocationHistory" ADD CONSTRAINT "ItemLocationHistory_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "SpaceZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemLocationHistory" ADD CONSTRAINT "ItemLocationHistory_storageLocationId_fkey" FOREIGN KEY ("storageLocationId") REFERENCES "StorageLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemLocationHistory" ADD CONSTRAINT "ItemLocationHistory_sourceObservationId_fkey" FOREIGN KEY ("sourceObservationId") REFERENCES "ItemObservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairIssue" ADD CONSTRAINT "RepairIssue_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairIssue" ADD CONSTRAINT "RepairIssue_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairObservation" ADD CONSTRAINT "RepairObservation_walkthroughId_fkey" FOREIGN KEY ("walkthroughId") REFERENCES "Walkthrough"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairObservation" ADD CONSTRAINT "RepairObservation_repairIssueId_fkey" FOREIGN KEY ("repairIssueId") REFERENCES "RepairIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairObservation" ADD CONSTRAINT "RepairObservation_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "SpaceZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewTask" ADD CONSTRAINT "ReviewTask_walkthroughId_fkey" FOREIGN KEY ("walkthroughId") REFERENCES "Walkthrough"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAction" ADD CONSTRAINT "ReviewAction_reviewTaskId_fkey" FOREIGN KEY ("reviewTaskId") REFERENCES "ReviewTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAction" ADD CONSTRAINT "ReviewAction_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "ItemObservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewAction" ADD CONSTRAINT "ReviewAction_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
