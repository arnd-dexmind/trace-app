import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenantId = "demo";

  // ── Space ──────────────────────────────────────────────────────────────────

  const space = await prisma.space.upsert({
    where: { id: "seed-demo-space" },
    update: {},
    create: {
      id: "seed-demo-space",
      tenantId,
      name: "123 Main Street",
      description: "Demo home for local development",
    },
  });

  // ── Zones ──────────────────────────────────────────────────────────────────

  const zones = [
    { id: "seed-zone-kitchen", name: "Kitchen" },
    { id: "seed-zone-garage", name: "Garage" },
    { id: "seed-zone-living", name: "Living Room" },
    { id: "seed-zone-primary-bath", name: "Primary Bath" },
    { id: "seed-zone-basement", name: "Basement" },
  ];

  for (const z of zones) {
    await prisma.spaceZone.upsert({
      where: { id: z.id },
      update: {},
      create: { id: z.id, spaceId: space.id, tenantId, name: z.name },
    });
  }

  // ── Storage Locations ──────────────────────────────────────────────────────

  const locations = [
    { id: "seed-loc-kitchen-counter", zoneId: "seed-zone-kitchen", name: "Counter" },
    { id: "seed-loc-kitchen-cabinet", zoneId: "seed-zone-kitchen", name: "Under-sink Cabinet" },
    { id: "seed-loc-kitchen-drawer", zoneId: "seed-zone-kitchen", name: "Utensil Drawer" },
    { id: "seed-loc-garage-shelf", zoneId: "seed-zone-garage", name: "Left Shelving Unit" },
    { id: "seed-loc-garage-workbench", zoneId: "seed-zone-garage", name: "Workbench" },
    { id: "seed-loc-living-shelf", zoneId: "seed-zone-living", name: "Bookshelf" },
    { id: "seed-loc-bath-vanity", zoneId: "seed-zone-primary-bath", name: "Vanity" },
    { id: "seed-loc-basement-storage", zoneId: "seed-zone-basement", name: "Storage Shelf" },
  ];

  for (const loc of locations) {
    await prisma.storageLocation.upsert({
      where: { id: loc.id },
      update: {},
      create: { id: loc.id, spaceId: space.id, tenantId, zoneId: loc.zoneId, name: loc.name },
    });
  }

  // ── Canonical items (from prior walkthroughs, already confirmed) ───────────

  const items = [
    { id: "seed-item-pliers", name: "Pliers", category: "Tools" },
    { id: "seed-item-paint-roller", name: "Paint Roller", category: "Supplies" },
    { id: "seed-item-passport", name: "Passport Folder", category: "Documents" },
    { id: "seed-item-drill", name: "Cordless Drill", category: "Tools" },
    { id: "seed-item-fire-ext", name: "Fire Extinguisher", category: "Safety" },
  ];

  for (const item of items) {
    await prisma.inventoryItem.upsert({
      where: { id: item.id },
      update: {},
      create: {
        id: item.id,
        spaceId: space.id,
        tenantId,
        name: item.name,
        category: item.category,
      },
    });
  }

  // ── Prior walkthrough (already applied) ────────────────────────────────────

  const priorWalkthroughId = "seed-wt-prior";
  await prisma.walkthrough.upsert({
    where: { id: priorWalkthroughId },
    update: {},
    create: {
      id: priorWalkthroughId,
      spaceId: space.id,
      tenantId,
      status: "applied",
      processedAt: new Date("2026-04-15T10:00:00Z"),
      completedAt: new Date("2026-04-15T11:00:00Z"),
    },
  });

  // Prior location history — shows items were seen before
  const priorLocations = [
    { itemId: "seed-item-pliers", zoneId: "seed-zone-garage", locationId: "seed-loc-garage-workbench" },
    { itemId: "seed-item-paint-roller", zoneId: "seed-zone-garage", locationId: "seed-loc-garage-shelf" },
    { itemId: "seed-item-drill", zoneId: "seed-zone-garage", locationId: "seed-loc-garage-workbench" },
    { itemId: "seed-item-fire-ext", zoneId: "seed-zone-kitchen", locationId: "seed-loc-kitchen-cabinet" },
  ];

  for (const hist of priorLocations) {
    await prisma.itemLocationHistory.upsert({
      where: { id: `seed-hist-prior-${hist.itemId}` },
      update: {},
      create: {
        id: `seed-hist-prior-${hist.itemId}`,
        itemId: hist.itemId,
        tenantId,
        zoneId: hist.zoneId,
        storageLocationId: hist.locationId,
        observedAt: new Date("2026-04-15T10:30:00Z"),
      },
    });
  }

  // ── Current walkthrough (awaiting review) ──────────────────────────────────

  const currentWalkthroughId = "seed-wt-current";
  await prisma.walkthrough.upsert({
    where: { id: currentWalkthroughId },
    update: {},
    create: {
      id: currentWalkthroughId,
      spaceId: space.id,
      tenantId,
      status: "awaiting_review",
      processedAt: new Date("2026-04-28T14:00:00Z"),
    },
  });

  // Item observations — AI-extracted candidates needing review
  const observations = [
    { id: "seed-obs-pliers", label: "Pliers", zoneId: "seed-zone-garage", locationId: "seed-loc-garage-shelf", confidence: 0.92, itemId: "seed-item-pliers" },
    { id: "seed-obs-drill", label: "Cordless Drill", zoneId: "seed-zone-garage", locationId: "seed-loc-garage-workbench", confidence: 0.88, itemId: "seed-item-drill" },
    { id: "seed-obs-paint", label: "Paint Roller", zoneId: "seed-zone-basement", locationId: "seed-loc-basement-storage", confidence: 0.75, itemId: "seed-item-paint-roller" },
    { id: "seed-obs-unknown", label: "Extension Cord", zoneId: "seed-zone-garage", locationId: "seed-loc-garage-shelf", confidence: 0.65 },
  ];

  for (const obs of observations) {
    await prisma.itemObservation.upsert({
      where: { id: obs.id },
      update: {},
      create: {
        id: obs.id,
        walkthroughId: currentWalkthroughId,
        tenantId,
        label: obs.label,
        confidence: obs.confidence,
        zoneId: obs.zoneId,
        storageLocationId: obs.locationId,
        itemId: obs.itemId || null,
        status: obs.itemId ? "pending" : "pending",
      },
    });
  }

  // Repair observations — AI-detected issues needing review
  const repairObs = [
    { id: "seed-repair-leak", label: "Sink leak under cabinet", zoneId: "seed-zone-kitchen", confidence: 0.81 },
    { id: "seed-repair-crack", label: "Cracked tile", zoneId: "seed-zone-primary-bath", confidence: 0.70 },
  ];

  for (const rep of repairObs) {
    await prisma.repairObservation.upsert({
      where: { id: rep.id },
      update: {},
      create: {
        id: rep.id,
        walkthroughId: currentWalkthroughId,
        tenantId,
        label: rep.label,
        confidence: rep.confidence,
        zoneId: rep.zoneId,
        status: "pending",
      },
    });
  }

  // Review task — operators review this walkthrough's candidates
  await prisma.reviewTask.upsert({
    where: { walkthroughId: currentWalkthroughId },
    update: {},
    create: {
      walkthroughId: currentWalkthroughId,
      tenantId,
      status: "pending",
    },
  });

  // ── Existing repair issue (open, carried forward) ──────────────────────────

  await prisma.repairIssue.upsert({
    where: { id: "seed-repair-gutter" },
    update: {},
    create: {
      id: "seed-repair-gutter",
      spaceId: space.id,
      tenantId,
      title: "Loose gutter section above garage",
      description: "Right-side gutter pulling away from fascia. Noted last walkthrough.",
      severity: "medium",
      status: "open",
    },
  });

  console.log("Seed complete:");
  console.log("  Space: 123 Main Street");
  console.log(`  Zones: ${zones.length}`);
  console.log(`  Storage locations: ${locations.length}`);
  console.log(`  Confirmed items: ${items.length}`);
  console.log("  Prior walkthrough: applied with location history");
  console.log(`  Current walkthrough: awaiting_review (${observations.length} item obs, ${repairObs.length} repair obs)`);
  console.log("  1 review task, 1 open repair issue");
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
