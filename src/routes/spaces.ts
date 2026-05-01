import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { db } from "../lib/db.js";
import { sendApiError } from "../lib/errors.js";
import { createAuthMiddleware } from "../lib/auth.js";
import { isUuid } from "../lib/validation.js";
import type { PaginatedResult, SearchItemsParams } from "../data.js";
import {
  createSpace,
  getSpace,
  listSpaces,
  updateSpace,
  deleteSpace,
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
  getWalkthroughResults,
  getWalkthroughResultItem,
  updateWalkthroughResultItem,
  bulkProcessResults,
  listAliases,
  createAlias,
  deleteAlias,
} from "../data.js";
import { processBatch } from "../lib/processing-orchestrator.js";

export const spacesRouter = Router();

spacesRouter.use(createAuthMiddleware());

function respondPaginated<T>(res: Response, result: PaginatedResult<T>, req: Request) {
  const hasPagination = "cursor" in req.query || "limit" in req.query;
  if (hasPagination) {
    res.status(200).json(result);
  } else {
    res.status(200).json(result.data);
  }
}

function requireUuidParams(...names: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    for (const name of names) {
      const val = req.params[name];
      if (val && !isUuid(val)) {
        sendApiError(res, 400, "BAD_REQUEST", `Invalid ${name} format`);
        return;
      }
    }
    next();
  };
}

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
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : undefined;
  const result = await listSpaces(db, res.locals.tenantId, cursor, limit);
  respondPaginated(res, result, req);
});

spacesRouter.get("/:id", async (req, res) => {
  const space = await getSpace(db, req.params.id, res.locals.tenantId);
  if (!space) {
    sendApiError(res, 404, "NOT_FOUND", "Space not found");
    return;
  }
  res.status(200).json(space);
});

spacesRouter.patch("/:id", requireUuidParams("id"), async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : undefined;
  const description =
    typeof req.body?.description === "string" ? req.body.description : undefined;

  if (name === "" && description === undefined) {
    sendApiError(res, 400, "BAD_REQUEST", "name must not be empty");
    return;
  }

  const space = await updateSpace(db, req.params.id, res.locals.tenantId, {
    name,
    description,
  });
  if (!space) {
    sendApiError(res, 404, "NOT_FOUND", "Space not found");
    return;
  }
  res.status(200).json(space);
});

spacesRouter.delete("/:id", requireUuidParams("id"), async (req, res) => {
  const result = await deleteSpace(db, req.params.id, res.locals.tenantId);
  if (!result) {
    sendApiError(res, 404, "NOT_FOUND", "Space not found");
    return;
  }
  res.status(200).json(result);
});

// ── Walkthroughs ──────────────────────────────────────────────────────────────

spacesRouter.post("/:id/walkthroughs", requireUuidParams("id"), async (req, res) => {
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

  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : undefined;
  const result = await listWalkthroughs(
    db,
    req.params.id,
    res.locals.tenantId,
    cursor,
    limit,
  );
  respondPaginated(res, result, req);
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

spacesRouter.post("/:id/walkthroughs/:walkthroughId/process", requireUuidParams("id", "walkthroughId"), async (req, res) => {
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

// ── Walkthrough Results ────────────────────────────────────────────────────────

spacesRouter.get("/:id/walkthroughs/:walkthroughId/results", async (req, res) => {
  const space = await getSpace(db, req.params.id, res.locals.tenantId);
  if (!space) {
    sendApiError(res, 404, "NOT_FOUND", "Space not found");
    return;
  }

  const results = await getWalkthroughResults(
    db,
    req.params.walkthroughId,
    res.locals.tenantId,
  );
  if (!results || results.spaceId !== req.params.id) {
    sendApiError(res, 404, "NOT_FOUND", "Walkthrough not found in this space");
    return;
  }

  res.status(200).json(results);
});

spacesRouter.post("/:id/walkthroughs/:walkthroughId/results/bulk", requireUuidParams("id", "walkthroughId"), async (req, res) => {
  const space = await getSpace(db, req.params.id, res.locals.tenantId);
  if (!space) {
    sendApiError(res, 404, "NOT_FOUND", "Space not found");
    return;
  }

  const observationIds: string[] = Array.isArray(req.body?.observationIds) ? req.body.observationIds : [];
  const action = req.body?.action;

  if (!Array.isArray(observationIds) || observationIds.length === 0) {
    sendApiError(res, 400, "BAD_REQUEST", "observationIds array is required");
    return;
  }
  if (action !== "accept" && action !== "mark_review") {
    sendApiError(res, 400, "BAD_REQUEST", "action must be 'accept' or 'mark_review'");
    return;
  }

  const result = await bulkProcessResults(db, {
    walkthroughId: req.params.walkthroughId,
    tenantId: res.locals.tenantId,
    observationIds,
    action,
  });

  if (!result) {
    sendApiError(res, 404, "NOT_FOUND", "Walkthrough not found");
    return;
  }

  res.status(200).json(result);
});

// Single item GET + PATCH
spacesRouter.get("/:id/walkthroughs/:walkthroughId/results/:itemId", async (req, res) => {
  const space = await getSpace(db, req.params.id, res.locals.tenantId);
  if (!space) {
    sendApiError(res, 404, "NOT_FOUND", "Space not found");
    return;
  }

  const item = await getWalkthroughResultItem(
    db,
    req.params.walkthroughId,
    req.params.itemId,
    res.locals.tenantId,
  );
  if (!item || item.spaceId !== req.params.id) {
    sendApiError(res, 404, "NOT_FOUND", "Item not found in this walkthrough");
    return;
  }

  res.status(200).json(item);
});

spacesRouter.patch("/:id/walkthroughs/:walkthroughId/results/:itemId", requireUuidParams("id", "walkthroughId", "itemId"), async (req, res) => {
  const space = await getSpace(db, req.params.id, res.locals.tenantId);
  if (!space) {
    sendApiError(res, 404, "NOT_FOUND", "Space not found");
    return;
  }

  const label = typeof req.body?.label === "string" ? req.body.label.trim() : undefined;
  const category = typeof req.body?.category === "string" ? req.body.category.trim() : undefined;
  const zoneId = req.body?.zoneId !== undefined ? (typeof req.body.zoneId === "string" ? req.body.zoneId : null) : undefined;
  const storageLocationId = req.body?.storageLocationId !== undefined
    ? (typeof req.body.storageLocationId === "string" ? req.body.storageLocationId : null)
    : undefined;
  const status = typeof req.body?.status === "string" ? req.body.status : undefined;

  if (label === "" && category === undefined && zoneId === undefined && storageLocationId === undefined && status === undefined) {
    sendApiError(res, 400, "BAD_REQUEST", "At least one field to update is required");
    return;
  }
  if (status !== undefined && !["accepted", "rejected", "pending"].includes(status)) {
    sendApiError(res, 400, "BAD_REQUEST", "status must be accepted, rejected, or pending");
    return;
  }

  const result = await updateWalkthroughResultItem(db, {
    observationId: req.params.itemId,
    walkthroughId: req.params.walkthroughId,
    tenantId: res.locals.tenantId,
    label: label || undefined,
    category: category || undefined,
    zoneId,
    storageLocationId,
    status: status as "accepted" | "rejected" | "pending" | undefined,
  });

  if (!result) {
    sendApiError(res, 404, "NOT_FOUND", "Item not found in this walkthrough");
    return;
  }

  res.status(200).json(result);
});

// ── Inventory ─────────────────────────────────────────────────────────────────

spacesRouter.get("/:id/inventory", async (req, res) => {
  const space = await getSpace(db, req.params.id, res.locals.tenantId);
  if (!space) {
    sendApiError(res, 404, "NOT_FOUND", "Space not found");
    return;
  }

  const name = typeof req.query.name === "string" ? req.query.name : undefined;
  const zoneId = typeof req.query.zoneId === "string" ? req.query.zoneId : undefined;
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const confidenceMin = typeof req.query.confidenceMin === "string" ? parseFloat(req.query.confidenceMin) : undefined;
  const confidenceMax = typeof req.query.confidenceMax === "string" ? parseFloat(req.query.confidenceMax) : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const sort = ["name", "category", "zone", "lastSeen", "confidence"].includes(String(req.query.sort))
    ? req.query.sort as SearchItemsParams["sort"]
    : undefined;
  const order = ["asc", "desc"].includes(String(req.query.order))
    ? req.query.order as SearchItemsParams["order"]
    : undefined;
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : undefined;
  const result = await searchItems(db, {
    spaceId: req.params.id,
    tenantId: res.locals.tenantId,
    name,
    zoneId,
    category,
    confidenceMin,
    confidenceMax,
    status,
    sort,
    order,
    cursor,
    limit,
  });
  respondPaginated(res, result, req);
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
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : undefined;
  const result = await listAliases(db, req.params.itemId, res.locals.tenantId, cursor, limit);
  respondPaginated(res, result, req);
});

spacesRouter.post("/:id/inventory/:itemId/aliases", requireUuidParams("id", "itemId"), async (req, res) => {
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
      sendApiError(res, 409, "CONFLICT", "Alias already exists for this item");
      return;
    }
    throw err;
  }
});

spacesRouter.delete("/:id/inventory/:itemId/aliases/:aliasId", requireUuidParams("id", "itemId", "aliasId"), async (req, res) => {
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

  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : undefined;
  const result = await listRepairs(db, {
    spaceId: req.params.id,
    tenantId: res.locals.tenantId,
    status,
    cursor,
    limit,
  });
  respondPaginated(res, result, req);
});

spacesRouter.post("/:id/repairs", requireUuidParams("id"), async (req, res) => {
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

spacesRouter.patch("/:id/repairs/:issueId", requireUuidParams("id", "issueId"), async (req, res) => {
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

spacesRouter.post("/:id/observations", requireUuidParams("id"), async (req, res) => {
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

spacesRouter.post("/:id/zones", requireUuidParams("id"), async (req, res) => {
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

  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : undefined;
  const result = await listZones(db, req.params.id, res.locals.tenantId, cursor, limit);
  respondPaginated(res, result, req);
});

// ── Storage Locations ──────────────────────────────────────────────────────────

spacesRouter.post("/:id/storage-locations", requireUuidParams("id"), async (req, res) => {
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

  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : undefined;
  const result = await listStorageLocations(
    db,
    req.params.id,
    res.locals.tenantId,
    cursor,
    limit,
  );
  respondPaginated(res, result, req);
});

// ── Media Registration ─────────────────────────────────────────────────────────

spacesRouter.post("/:id/walkthroughs/:wid/media", requireUuidParams("id", "wid"), async (req, res) => {
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
