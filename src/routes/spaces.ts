import { Router } from "express";
import { db } from "../lib/db.js";
import { sendApiError } from "../lib/errors.js";
import { createAuthMiddleware } from "../lib/auth.js";
import {
  createSpace,
  getSpace,
  listSpaces,
  createWalkthrough,
  listWalkthroughs,
  getWalkthrough,
  startProcessing,
  searchItems,
  getItem,
  listRepairs,
  getRepair,
  createRepair,
  updateRepairStatus,
  ingestObservations,
  createZone,
  listZones,
  createStorageLocation,
  listStorageLocations,
  createMediaAsset,
  getWalkthroughDiff,
  listAliases,
  createAlias,
  deleteAlias,
} from "../data.js";
import { processBatch } from "../lib/processing-orchestrator.js";

export const spacesRouter = Router();

spacesRouter.use(createAuthMiddleware());

// ── Spaces ────────────────────────────────────────────────────────────────────

spacesRouter.post("/", async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) {
    sendApiError(res, 400, "BAD_REQUEST", "name is required");
    return;
  }

  const description =
    typeof req.body?.description === "string" ? req.body.description : undefined;

  const space = await createSpace(db, {
    tenantId: res.locals.tenantId,
    name,
    description,
  });
  res.status(201).json(space);
});

spacesRouter.get("/", async (req, res) => {
  const spaces = await listSpaces(db, res.locals.tenantId);
  res.status(200).json(spaces);
});

spacesRouter.get("/:id", async (req, res) => {
  const space = await getSpace(db, req.params.id, res.locals.tenantId);
  if (!space) {
    sendApiError(res, 404, "NOT_FOUND", "Space not found");
    return;
  }
  res.status(200).json(space);
});

// ── Walkthroughs ──────────────────────────────────────────────────────────────

spacesRouter.post("/:id/walkthroughs", async (req, res) => {
  const space = await getSpace(db, req.params.id, res.locals.tenantId);
  if (!space) {
    sendApiError(res, 404, "NOT_FOUND", "Space not found");
    return;
  }

  const metadata = req.body?.metadata ?? undefined;

  const walkthrough = await createWalkthrough(db, {
    spaceId: req.params.id,
    tenantId: res.locals.tenantId,
    metadata,
  });
  res.status(201).json(walkthrough);
});

spacesRouter.get("/:id/walkthroughs", async (req, res) => {
  const space = await getSpace(db, req.params.id, res.locals.tenantId);
  if (!space) {
    sendApiError(res, 404, "NOT_FOUND", "Space not found");
    return;
  }

  const walkthroughs = await listWalkthroughs(
    db,
    req.params.id,
    res.locals.tenantId,
  );
  res.status(200).json(walkthroughs);
});

spacesRouter.get("/:id/walkthroughs/:walkthroughId", async (req, res) => {
  const space = await getSpace(db, req.params.id, res.locals.tenantId);
  if (!space) {
    sendApiError(res, 404, "NOT_FOUND", "Space not found");
    return;
  }

  const wt = await getWalkthrough(db, req.params.walkthroughId, res.locals.tenantId);
  if (!wt || wt.spaceId !== req.params.id) {
    sendApiError(res, 404, "NOT_FOUND", "Walkthrough not found in this space");
    return;
  }

  const mediaAssets = await db.mediaAsset.findMany({
    where: { walkthroughId: wt.id, tenantId: res.locals.tenantId },
    orderBy: { createdAt: "desc" },
  });

  const jobs = await db.processingJob.findMany({
    where: { walkthroughId: wt.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const [itemObsCount, repairObsCount] = await Promise.all([
    db.itemObservation.count({ where: { walkthroughId: wt.id } }),
    db.repairObservation.count({ where: { walkthroughId: wt.id } }),
  ]);

  res.status(200).json({ ...wt, mediaAssets, jobs, itemObsCount, repairObsCount });
});

spacesRouter.get("/:id/walkthroughs/:walkthroughId/diff", async (req, res) => {
  const space = await getSpace(db, req.params.id, res.locals.tenantId);
  if (!space) {
    sendApiError(res, 404, "NOT_FOUND", "Space not found");
    return;
  }

  const diff = await getWalkthroughDiff(
    db,
    req.params.walkthroughId,
    res.locals.tenantId,
  );
  if (!diff || diff.spaceId !== req.params.id) {
    sendApiError(res, 404, "NOT_FOUND", "Walkthrough not found in this space");
    return;
  }

  res.status(200).json(diff);
});

spacesRouter.post("/:id/walkthroughs/:walkthroughId/process", async (req, res) => {
  void req.body;
  const result = await startProcessing(
    db,
    req.params.walkthroughId,
    res.locals.tenantId,
  );
  if (!result) {
    sendApiError(res, 404, "NOT_FOUND", "Walkthrough not found or not in uploaded state");
    return;
  }

  // Trigger processing pipeline
  const procResult = await processBatch(db, res.locals.tenantId);

  res.status(200).json({ ...result, processing: procResult });
});

// ── Inventory ─────────────────────────────────────────────────────────────────

spacesRouter.get("/:id/inventory", async (req, res) => {
  const space = await getSpace(db, req.params.id, res.locals.tenantId);
  if (!space) {
    sendApiError(res, 404, "NOT_FOUND", "Space not found");
    return;
  }

  const name = typeof req.query.name === "string" ? req.query.name : undefined;
  const zoneId =
    typeof req.query.zoneId === "string" ? req.query.zoneId : undefined;

  const items = await searchItems(db, {
    spaceId: req.params.id,
    tenantId: res.locals.tenantId,
    name,
    zoneId,
  });
  res.status(200).json(items);
});

spacesRouter.get("/:id/inventory/:itemId", async (req, res) => {
  const item = await getItem(
    db,
    req.params.itemId,
    req.params.id,
    res.locals.tenantId,
  );
  if (!item) {
    sendApiError(res, 404, "NOT_FOUND", "Item not found");
    return;
  }
  res.status(200).json(item);
});

// ── Item Aliases ──────────────────────────────────────────────────────────────

spacesRouter.get("/:id/inventory/:itemId/aliases", async (req, res) => {
  const item = await getItem(
    db,
    req.params.itemId,
    req.params.id,
    res.locals.tenantId,
  );
  if (!item) {
    sendApiError(res, 404, "NOT_FOUND", "Item not found");
    return;
  }
  const aliases = await listAliases(db, req.params.itemId, res.locals.tenantId);
  res.status(200).json(aliases);
});

spacesRouter.post("/:id/inventory/:itemId/aliases", async (req, res) => {
  const item = await getItem(
    db,
    req.params.itemId,
    req.params.id,
    res.locals.tenantId,
  );
  if (!item) {
    sendApiError(res, 404, "NOT_FOUND", "Item not found");
    return;
  }

  const alias = typeof req.body?.alias === "string" ? req.body.alias.trim() : "";
  if (!alias) {
    sendApiError(res, 400, "BAD_REQUEST", "alias is required");
    return;
  }

  const source = typeof req.body?.source === "string" ? req.body.source : undefined;
  if (source && !["operator", "system"].includes(source)) {
    sendApiError(res, 400, "BAD_REQUEST", "source must be operator or system");
    return;
  }

  try {
    const created = await createAlias(db, {
      itemId: req.params.itemId,
      tenantId: res.locals.tenantId,
      alias,
      source,
    });
    res.status(201).json(created);
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as Record<string, unknown>).code === "P2002"
    ) {
      sendApiError(res, 409, "BAD_REQUEST", "Alias already exists for this item");
      return;
    }
    throw err;
  }
});

spacesRouter.delete("/:id/inventory/:itemId/aliases/:aliasId", async (req, res) => {
  const item = await getItem(
    db,
    req.params.itemId,
    req.params.id,
    res.locals.tenantId,
  );
  if (!item) {
    sendApiError(res, 404, "NOT_FOUND", "Item not found");
    return;
  }

  const deleted = await deleteAlias(
    db,
    req.params.aliasId,
    req.params.itemId,
    res.locals.tenantId,
  );
  if (!deleted) {
    sendApiError(res, 404, "NOT_FOUND", "Alias not found for this item");
    return;
  }

  res.status(200).json({ deleted: true, id: deleted.id });
});

// ── Repairs ───────────────────────────────────────────────────────────────────

spacesRouter.get("/:id/repairs", async (req, res) => {
  const space = await getSpace(db, req.params.id, res.locals.tenantId);
  if (!space) {
    sendApiError(res, 404, "NOT_FOUND", "Space not found");
    return;
  }

  const status =
    typeof req.query.status === "string" ? req.query.status : undefined;

  const repairs = await listRepairs(db, {
    spaceId: req.params.id,
    tenantId: res.locals.tenantId,
    status,
  });
  res.status(200).json(repairs);
});

spacesRouter.post("/:id/repairs", async (req, res) => {
  const space = await getSpace(db, req.params.id, res.locals.tenantId);
  if (!space) {
    sendApiError(res, 404, "NOT_FOUND", "Space not found");
    return;
  }

  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (!title) {
    sendApiError(res, 400, "BAD_REQUEST", "title is required");
    return;
  }

  const repair = await createRepair(db, {
    spaceId: req.params.id,
    tenantId: res.locals.tenantId,
    title,
    description:
      typeof req.body?.description === "string"
        ? req.body.description
        : undefined,
    severity:
      typeof req.body?.severity === "string" ? req.body.severity : undefined,
    itemId: typeof req.body?.itemId === "string" ? req.body.itemId : undefined,
  });
  res.status(201).json(repair);
});

spacesRouter.get("/:id/repairs/:issueId", async (req, res) => {
  const repair = await getRepair(
    db,
    req.params.issueId,
    req.params.id,
    res.locals.tenantId,
  );
  if (!repair) {
    sendApiError(res, 404, "NOT_FOUND", "Repair issue not found");
    return;
  }
  res.status(200).json(repair);
});

spacesRouter.patch("/:id/repairs/:issueId", async (req, res) => {
  const status = typeof req.body?.status === "string" ? req.body.status : "";
  if (!["open", "in_progress", "resolved"].includes(status)) {
    sendApiError(res, 400, "BAD_REQUEST", "status must be open, in_progress, or resolved");
    return;
  }

  const repair = await updateRepairStatus(
    db,
    req.params.issueId,
    req.params.id,
    res.locals.tenantId,
    status,
  );
  if (!repair) {
    sendApiError(res, 404, "NOT_FOUND", "Repair issue not found");
    return;
  }
  res.status(200).json(repair);
});

// ── Observations ──────────────────────────────────────────────────────────────

spacesRouter.post("/:id/observations", async (req, res) => {
  const space = await getSpace(db, req.params.id, res.locals.tenantId);
  if (!space) {
    sendApiError(res, 404, "NOT_FOUND", "Space not found");
    return;
  }

  const walkthroughId = req.body?.walkthroughId;
  if (!walkthroughId || typeof walkthroughId !== "string") {
    sendApiError(res, 400, "BAD_REQUEST", "walkthroughId is required");
    return;
  }

  const result = await ingestObservations(db, {
    walkthroughId,
    spaceId: req.params.id,
    tenantId: res.locals.tenantId,
    items: Array.isArray(req.body?.items) ? req.body.items : undefined,
    repairs: Array.isArray(req.body?.repairs) ? req.body.repairs : undefined,
  });

  if (!result) {
    sendApiError(res, 404, "NOT_FOUND", "Walkthrough not found in this space");
    return;
  }

  res.status(201).json(result);
});

// ── Zones ──────────────────────────────────────────────────────────────────────

spacesRouter.post("/:id/zones", async (req, res) => {
  const space = await getSpace(db, req.params.id, res.locals.tenantId);
  if (!space) {
    sendApiError(res, 404, "NOT_FOUND", "Space not found");
    return;
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) {
    sendApiError(res, 400, "BAD_REQUEST", "name is required");
    return;
  }

  const zone = await createZone(db, {
    spaceId: req.params.id,
    tenantId: res.locals.tenantId,
    name,
    description:
      typeof req.body?.description === "string"
        ? req.body.description
        : undefined,
  });
  res.status(201).json(zone);
});

spacesRouter.get("/:id/zones", async (req, res) => {
  const space = await getSpace(db, req.params.id, res.locals.tenantId);
  if (!space) {
    sendApiError(res, 404, "NOT_FOUND", "Space not found");
    return;
  }

  const zones = await listZones(db, req.params.id, res.locals.tenantId);
  res.status(200).json(zones);
});

// ── Storage Locations ──────────────────────────────────────────────────────────

spacesRouter.post("/:id/storage-locations", async (req, res) => {
  const space = await getSpace(db, req.params.id, res.locals.tenantId);
  if (!space) {
    sendApiError(res, 404, "NOT_FOUND", "Space not found");
    return;
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) {
    sendApiError(res, 400, "BAD_REQUEST", "name is required");
    return;
  }

  const loc = await createStorageLocation(db, {
    spaceId: req.params.id,
    tenantId: res.locals.tenantId,
    name,
    description:
      typeof req.body?.description === "string"
        ? req.body.description
        : undefined,
    parentId:
      typeof req.body?.parentId === "string" ? req.body.parentId : undefined,
    zoneId:
      typeof req.body?.zoneId === "string" ? req.body.zoneId : undefined,
  });
  res.status(201).json(loc);
});

spacesRouter.get("/:id/storage-locations", async (req, res) => {
  const space = await getSpace(db, req.params.id, res.locals.tenantId);
  if (!space) {
    sendApiError(res, 404, "NOT_FOUND", "Space not found");
    return;
  }

  const locations = await listStorageLocations(
    db,
    req.params.id,
    res.locals.tenantId,
  );
  res.status(200).json(locations);
});

// ── Media Registration ─────────────────────────────────────────────────────────

spacesRouter.post("/:id/walkthroughs/:wid/media", async (req, res) => {
  const space = await getSpace(db, req.params.id, res.locals.tenantId);
  if (!space) {
    sendApiError(res, 404, "NOT_FOUND", "Space not found");
    return;
  }

  const wt = await getWalkthrough(db, req.params.wid, res.locals.tenantId);
  if (!wt || wt.spaceId !== req.params.id) {
    sendApiError(res, 404, "NOT_FOUND", "Walkthrough not found in this space");
    return;
  }

  const type = typeof req.body?.type === "string" ? req.body.type.trim() : "";
  const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  if (!type || !url) {
    sendApiError(res, 400, "BAD_REQUEST", "type and url are required");
    return;
  }

  const asset = await createMediaAsset(db, {
    walkthroughId: req.params.wid,
    tenantId: res.locals.tenantId,
    type,
    url,
    thumbnailUrl:
      typeof req.body?.thumbnailUrl === "string"
        ? req.body.thumbnailUrl
        : undefined,
  });
  res.status(201).json(asset);
});
