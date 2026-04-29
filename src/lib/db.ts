import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

let _db: PrismaClient | null = null;

function getDb(): PrismaClient {
  if (_db) return _db;
  _db = globalForPrisma.prisma ?? new PrismaClient({ log: ["warn", "error"] });
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = _db;
  }
  return _db;
}

export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getDb();
    return (client as unknown as Record<string | symbol, unknown>)[prop];
  },
});
