import type { PrismaClient } from "@prisma/client";

export type TraceInput = {
  title: string;
  body?: string;
};

export async function createTraceRecord(db: PrismaClient, input: TraceInput) {
  return db.traceRecord.create({
    data: {
      title: input.title,
      body: input.body?.trim() || null,
    },
  });
}

export async function listTraceRecords(db: PrismaClient) {
  return db.traceRecord.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
