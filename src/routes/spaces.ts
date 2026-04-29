import { Router } from "express";
import { db } from "../lib/db.js";
import { requireTenant, sendApiError } from "../lib/errors.js";
import {
  createSpace,
  getSpace,
  listSpaces,
  createWalkthrough,
  listWalkthroughs,
  searchItems,
  getItem,
  listRepairs,
  createRepair,
  updateRepairStatus,
  ingestObservations,
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
