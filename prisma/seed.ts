import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.traceRecord.upsert({
    where: { id: "seed-welcome" },
    update: {},
    create: {
      id: "seed-welcome",
      title: "Welcome trace",
      body: "Initial seed record for local development."
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
