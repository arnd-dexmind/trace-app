/*
  Warnings:

  - Added the required column `tenantId` to the `TraceRecord` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TraceRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_TraceRecord" ("body", "createdAt", "id", "title", "updatedAt") SELECT "body", "createdAt", "id", "title", "updatedAt" FROM "TraceRecord";
DROP TABLE "TraceRecord";
ALTER TABLE "new_TraceRecord" RENAME TO "TraceRecord";
CREATE INDEX "TraceRecord_tenantId_createdAt_idx" ON "TraceRecord"("tenantId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
