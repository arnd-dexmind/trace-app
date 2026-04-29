import { Router } from "express";
import { db } from "../lib/db.js";
import { requireTenant, sendApiError } from "../lib/errors.js";
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
  createRepair,
  updateRepairStatus,
  ingestObservations,
  createZone,
  listZones,
  createStorageLocation,
  listStorageLocations,
  createMediaAsset,
} from "../data.js";

export const spacesRouter = Router();

spacesRouter.use(requireTenant);

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
