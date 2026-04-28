import type { PrismaClient } from "@prisma/client";

export type TraceInput = {
  tenantId: string;
  title: string;
  body?: string;
};

export async function createTraceRecord(db: PrismaClient, input: TraceInput) {
  return db.traceRecord.create({
    data: {
      tenantId: input.tenantId,
      title: input.title,
      body: input.body?.trim() || null,
    },
  });
}

export async function listTraceRecords(db: PrismaClient, tenantId: string) {
  return db.traceRecord.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
