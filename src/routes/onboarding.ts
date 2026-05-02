import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../lib/db.js";
import { sendApiError } from "../lib/errors.js";
import { createAuthMiddleware } from "../lib/auth.js";

export const onboardingRouter = Router();

onboardingRouter.use(createAuthMiddleware());

function resolveUserId(res: Response): string {
  const locals = res.locals as { userId?: string; tenantId: string };
  return locals.userId || `dev-user-${locals.tenantId}`;
}

// GET /api/onboarding/status — check if first-run, tour state
onboardingRouter.get("/status", async (_req: Request, res: Response) => {
  const tenantId = (res.locals as { tenantId: string }).tenantId;
  const userId = resolveUserId(res);

  const onboarding = await db.userOnboarding.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
  });

  if (!onboarding) {
    res.status(200).json({
      isFirstRun: true,
      tourCompleted: false,
      tourCurrentStep: 0,
      tourDismissed: false,
      sampleDataSeeded: false,
    });
    return;
  }

  res.status(200).json({
    isFirstRun: false,
    tourCompleted: onboarding.tourCompleted,
    tourCurrentStep: onboarding.tourCurrentStep,
    tourDismissed: onboarding.tourDismissed,
    sampleDataSeeded: onboarding.sampleDataSeeded,
  });
});

// POST /api/onboarding/tour/step — update tour step
onboardingRouter.post("/tour/step", async (req: Request, res: Response) => {
  const tenantId = (res.locals as { tenantId: string }).tenantId;
  const userId = resolveUserId(res);
  const step = typeof req.body?.step === "number" ? req.body.step : -1;

  if (step < 0) {
    sendApiError(res, 400, "BAD_REQUEST", "step must be a non-negative number");
    return;
  }

  const record = await db.userOnboarding.upsert({
    where: { userId_tenantId: { userId, tenantId } },
    create: { userId, tenantId, tourCurrentStep: step },
    update: { tourCurrentStep: step },
  });

  res.status(200).json({
    tourCurrentStep: record.tourCurrentStep,
    tourCompleted: record.tourCompleted,
    tourDismissed: record.tourDismissed,
  });
});

// POST /api/onboarding/tour/complete — mark tour complete
onboardingRouter.post("/tour/complete", async (_req: Request, res: Response) => {
  const tenantId = (res.locals as { tenantId: string }).tenantId;
  const userId = resolveUserId(res);

  const record = await db.userOnboarding.upsert({
    where: { userId_tenantId: { userId, tenantId } },
    create: { userId, tenantId, tourCompleted: true, tourCurrentStep: 99 },
    update: { tourCompleted: true, tourCurrentStep: 99, tourDismissed: false },
  });

  res.status(200).json({
    tourCompleted: record.tourCompleted,
    tourCurrentStep: record.tourCurrentStep,
  });
});

// POST /api/onboarding/tour/dismiss — dismiss tour
onboardingRouter.post("/tour/dismiss", async (_req: Request, res: Response) => {
  const tenantId = (res.locals as { tenantId: string }).tenantId;
  const userId = resolveUserId(res);

  const record = await db.userOnboarding.upsert({
    where: { userId_tenantId: { userId, tenantId } },
    create: { userId, tenantId, tourDismissed: true },
    update: { tourDismissed: true },
  });

  res.status(200).json({ tourDismissed: record.tourDismissed });
});

// POST /api/onboarding/reset — reset onboarding (for testing)
onboardingRouter.post("/reset", async (_req: Request, res: Response) => {
  const tenantId = (res.locals as { tenantId: string }).tenantId;
  const userId = resolveUserId(res);

  await db.userOnboarding.upsert({
    where: { userId_tenantId: { userId, tenantId } },
    create: { userId, tenantId, tourCompleted: false, tourCurrentStep: 0, tourDismissed: false, sampleDataSeeded: false },
    update: { tourCompleted: false, tourCurrentStep: 0, tourDismissed: false, sampleDataSeeded: false },
  });

  res.status(200).json({ reset: true });
});

// POST /api/onboarding/seed — generate sample data
onboardingRouter.post("/seed", async (_req: Request, res: Response) => {
  const tenantId = (res.locals as { tenantId: string }).tenantId;
  const userId = resolveUserId(res);

  const existing = await db.userOnboarding.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
  });

  if (existing?.sampleDataSeeded) {
    sendApiError(res, 409, "CONFLICT", "Sample data has already been seeded for this user");
    return;
  }

  // Create a demo space if none exists
  let demoSpace = await db.space.findFirst({
    where: { tenantId, name: "Demo Home" },
  });

  if (!demoSpace) {
    demoSpace = await db.space.create({
      data: {
        tenantId,
        name: "Demo Home",
        description: "Sample data — explore PerifEye with a realistic space. Delete anytime.",
      },
    });
  }

  // Create zones
  const kitchen = await db.spaceZone.upsert({
    where: { id: `demo-kitchen-${demoSpace.id}` },
    create: { id: `demo-kitchen-${demoSpace.id}`, spaceId: demoSpace.id, tenantId, name: "Kitchen", description: "Cooking and food storage area" },
    update: {},
  });

  const garage = await db.spaceZone.upsert({
    where: { id: `demo-garage-${demoSpace.id}` },
    create: { id: `demo-garage-${demoSpace.id}`, spaceId: demoSpace.id, tenantId, name: "Garage", description: "Tools and storage" },
    update: {},
  });

  const bathroom = await db.spaceZone.upsert({
    where: { id: `demo-bathroom-${demoSpace.id}` },
    create: { id: `demo-bathroom-${demoSpace.id}`, spaceId: demoSpace.id, tenantId, name: "Bathroom", description: "Main bathroom" },
    update: {},
  });

  const livingRoom = await db.spaceZone.upsert({
    where: { id: `demo-living-${demoSpace.id}` },
    create: { id: `demo-living-${demoSpace.id}`, spaceId: demoSpace.id, tenantId, name: "Living Room", description: "Main living area" },
    update: {},
  });

  // Create storage locations
  const kitchenCabinet = await db.storageLocation.create({
    data: { spaceId: demoSpace.id, zoneId: kitchen.id, tenantId, name: "Under-sink Cabinet" },
  });
  const kitchenDrawer = await db.storageLocation.create({
    data: { spaceId: demoSpace.id, zoneId: kitchen.id, tenantId, name: "Utensil Drawer" },
  });
  const garageShelf = await db.storageLocation.create({
    data: { spaceId: demoSpace.id, zoneId: garage.id, tenantId, name: "Tool Shelf" },
  });
  const bathroomCabinet = await db.storageLocation.create({
    data: { spaceId: demoSpace.id, zoneId: bathroom.id, tenantId, name: "Medicine Cabinet" },
  });

  // Create demo walkthrough
  await db.walkthrough.create({
    data: {
      spaceId: demoSpace.id,
      tenantId,
      status: "applied",
      metadata: JSON.stringify({ demo: true, fileCount: 1, note: "Auto-generated demo data" }),
      uploadedAt: new Date(),
      processedAt: new Date(),
      completedAt: new Date(),
    },
  });

  // Create inventory items
  const items = [
    { name: "Pliers", category: "Tools", zoneId: garage.id, locationId: garageShelf.id, description: "Standard slip-joint pliers" },
    { name: "Screwdriver Set", category: "Tools", zoneId: garage.id, locationId: garageShelf.id, description: "6-piece Phillips and flathead set" },
    { name: "Hammer", category: "Tools", zoneId: garage.id, locationId: garageShelf.id, description: "16 oz claw hammer" },
    { name: "Dish Soap", category: "Cleaning", zoneId: kitchen.id, locationId: kitchenCabinet.id, description: "Lemon-scented liquid dish soap" },
    { name: "Sponges", category: "Cleaning", zoneId: kitchen.id, locationId: kitchenCabinet.id, description: "Pack of 6 cellulose sponges" },
    { name: "Chef's Knife", category: "Kitchenware", zoneId: kitchen.id, locationId: kitchenDrawer.id, description: "8-inch stainless steel chef's knife" },
    { name: "Measuring Cups", category: "Kitchenware", zoneId: kitchen.id, locationId: kitchenDrawer.id, description: "Nested set of 4 measuring cups" },
    { name: "First Aid Kit", category: "Health", zoneId: bathroom.id, locationId: bathroomCabinet.id, description: "Basic first aid supplies" },
    { name: "Toilet Plunger", category: "Plumbing", zoneId: bathroom.id, locationId: bathroomCabinet.id, description: "Standard rubber plunger" },
    { name: "Power Drill", category: "Tools", zoneId: garage.id, locationId: garageShelf.id, description: "18V cordless drill with battery" },
    { name: "Duct Tape", category: "Supplies", zoneId: garage.id, locationId: garageShelf.id, description: "Heavy-duty silver duct tape, 50 yards" },
    { name: "Flashlight", category: "Tools", zoneId: kitchen.id, locationId: kitchenDrawer.id, description: "LED flashlight, waterproof" },
  ];

  for (const item of items) {
    const created = await db.inventoryItem.create({
      data: {
        spaceId: demoSpace.id,
        tenantId,
        name: item.name,
        category: item.category,
        description: item.description,
      },
    });

    await db.itemLocationHistory.create({
      data: {
        itemId: created.id,
        tenantId,
        zoneId: item.zoneId,
        storageLocationId: item.locationId,
        observedAt: new Date(),
      },
    });
  }

  // Create repair issues
  const repairs = [
    { title: "Leaky faucet in kitchen sink", severity: "medium", description: "Faucet drips every few seconds. Likely needs a new washer or cartridge." },
    { title: "Cracked bathroom tile", severity: "low", description: "One floor tile near the shower has a hairline crack. Monitor for worsening." },
    { title: "Garage door squeaks when opening", severity: "low", description: "Loud squeaking sound from the left hinge. Needs lubrication." },
    { title: "Loose cabinet handle in kitchen", severity: "low", description: "Handle on the corner upper cabinet is loose — screw needs tightening." },
    { title: "Paint peeling on living room ceiling", severity: "medium", description: "Small patch (~6 inches) of paint peeling near the window. Possible moisture issue." },
  ];

  for (const repair of repairs) {
    await db.repairIssue.create({
      data: {
        spaceId: demoSpace.id,
        tenantId,
        title: `[DEMO] ${repair.title}`,
        description: repair.description,
        severity: repair.severity,
        status: "open",
      },
    });
  }

  // Mark sample data as seeded
  await db.userOnboarding.upsert({
    where: { userId_tenantId: { userId, tenantId } },
    create: { userId, tenantId, sampleDataSeeded: true },
    update: { sampleDataSeeded: true },
  });

  res.status(201).json({
    seeded: true,
    spaceId: demoSpace.id,
    spaceName: demoSpace.name,
    itemCount: items.length,
    repairCount: repairs.length,
  });
});
