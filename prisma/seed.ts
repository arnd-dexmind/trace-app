import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const space = await prisma.space.upsert({
    where: { id: "seed-demo-space" },
    update: {},
    create: {
      id: "seed-demo-space",
      tenantId: "demo",
      name: "123 Main Street",
      description: "Demo home for local development",
    },
  });

  const zones = [
    { id: "seed-zone-kitchen", spaceId: space.id, tenantId: "demo", name: "Kitchen" },
    { id: "seed-zone-garage", spaceId: space.id, tenantId: "demo", name: "Garage" },
    { id: "seed-zone-living", spaceId: space.id, tenantId: "demo", name: "Living Room" },
    { id: "seed-zone-primary-bath", spaceId: space.id, tenantId: "demo", name: "Primary Bath" },
  ];

  for (const z of zones) {
    await prisma.spaceZone.upsert({
      where: { id: z.id },
      update: {},
      create: z,
    });
  }

  const items = [
    { id: "seed-item-pliers", spaceId: space.id, tenantId: "demo", name: "Pliers", category: "Tools" },
    { id: "seed-item-paint-roller", spaceId: space.id, tenantId: "demo", name: "Paint Roller", category: "Supplies" },
    { id: "seed-item-passport", spaceId: space.id, tenantId: "demo", name: "Passport Folder", category: "Documents" },
  ];

  for (const item of items) {
    await prisma.inventoryItem.upsert({
      where: { id: item.id },
      update: {},
      create: item,
    });
  }

  console.log("Seed complete: demo space, zones, and inventory items created.");
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
