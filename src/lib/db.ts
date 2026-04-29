import { PrismaClient } from "@prisma/client";

process.env.DATABASE_URL ||= "file:/tmp/trace-app.db";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

let ready: Promise<void> | undefined;

export function ensureDatabaseReady() {
  ready ??= (async () => {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "TraceRecord" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tenantId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "body" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL
      )
    `);
    await db.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "TraceRecord_tenantId_createdAt_idx"
      ON "TraceRecord"("tenantId", "createdAt")
    `);
  })();

  return ready;
}
