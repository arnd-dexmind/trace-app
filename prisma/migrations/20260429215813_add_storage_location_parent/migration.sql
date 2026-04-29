-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StorageLocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "zoneId" TEXT,
    "parentId" TEXT,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StorageLocation_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StorageLocation_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "SpaceZone" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StorageLocation_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "StorageLocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_StorageLocation" ("createdAt", "description", "id", "name", "spaceId", "tenantId", "updatedAt", "zoneId") SELECT "createdAt", "description", "id", "name", "spaceId", "tenantId", "updatedAt", "zoneId" FROM "StorageLocation";
DROP TABLE "StorageLocation";
ALTER TABLE "new_StorageLocation" RENAME TO "StorageLocation";
CREATE INDEX "StorageLocation_spaceId_idx" ON "StorageLocation"("spaceId");
CREATE INDEX "StorageLocation_zoneId_idx" ON "StorageLocation"("zoneId");
CREATE INDEX "StorageLocation_parentId_idx" ON "StorageLocation"("parentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
