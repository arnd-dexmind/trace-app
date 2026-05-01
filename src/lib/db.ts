import { PrismaClient } from "@prisma/client";

process.env.DATABASE_URL ||= "file:/tmp/trace-app.db";

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
  get(_target, prop, receiver) {
    const client = getDb();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];

    // Intercept $disconnect to reset the singleton so subsequent
    // accesses re-create the client (needed for test isolation).
    if (prop === "$disconnect") {
      return async () => {
        await (client as PrismaClient).$disconnect();
        _db = null;
      };
    }

    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});
