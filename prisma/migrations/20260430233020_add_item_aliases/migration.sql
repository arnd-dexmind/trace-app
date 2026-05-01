-- CreateTable
CREATE TABLE "ItemAlias" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'operator',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ItemAlias_itemId_idx" ON "ItemAlias"("itemId");

-- CreateIndex
CREATE INDEX "ItemAlias_tenantId_idx" ON "ItemAlias"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemAlias_itemId_alias_key" ON "ItemAlias"("itemId", "alias");

-- AddForeignKey
ALTER TABLE "ItemAlias" ADD CONSTRAINT "ItemAlias_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
