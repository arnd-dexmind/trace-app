import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db.js";
import { sendApiError } from "../lib/errors.js";
import { createAuthMiddleware } from "../lib/auth.js";

export const sharingRouter = Router();

// Create a share link for a walkthrough (auth required)
sharingRouter.post("/", createAuthMiddleware(), async (req, res) => {
  const walkthroughId = typeof req.body?.walkthroughId === "string" ? req.body.walkthroughId.trim() : "";
  if (!walkthroughId) {
    sendApiError(res, 400, "BAD_REQUEST", "walkthroughId is required");
    return;
  }

  const wt = await db.walkthrough.findUnique({
    where: { id: walkthroughId, tenantId: res.locals.tenantId },
    select: { id: true },
  });
  if (!wt) {
    sendApiError(res, 404, "NOT_FOUND", "Walkthrough not found");
    return;
  }

  const expiresAt = typeof req.body?.expiresInDays === "number" && req.body.expiresInDays > 0
    ? new Date(Date.now() + req.body.expiresInDays * 86400000)
    : null;

  const link = await db.shareLink.create({
    data: {
      walkthroughId,
      tenantId: res.locals.tenantId,
      token: randomUUID(),
      expiresAt,
    },
  });

  res.status(201).json({
    id: link.id,
    token: link.token,
    url: `/share/${link.token}`,
    expiresAt: link.expiresAt?.toISOString() ?? null,
  });
});

// Get shared walkthrough (no auth — public by token)
sharingRouter.get("/:token", async (req, res) => {
  const link = await db.shareLink.findUnique({
    where: { token: req.params.token },
    include: {
      walkthrough: {
        select: {
          id: true,
          spaceId: true,
          status: true,
          uploadedAt: true,
          itemObservations: {
            select: {
              id: true,
              label: true,
              confidence: true,
              keyframeUrl: true,
              zone: { select: { name: true } },
            },
          },
          repairObservations: {
            select: {
              id: true,
              label: true,
              confidence: true,
              keyframeUrl: true,
            },
          },
        },
      },
    },
  });

  if (!link || (link.expiresAt && link.expiresAt < new Date())) {
    sendApiError(res, 404, "NOT_FOUND", "Share link not found or expired");
    return;
  }

  const { walkthrough } = link;
  res.status(200).json({
    walkthroughId: walkthrough.id,
    status: walkthrough.status,
    uploadedAt: walkthrough.uploadedAt,
    items: walkthrough.itemObservations.map((o) => ({
      label: o.label,
      confidence: o.confidence,
      keyframeUrl: o.keyframeUrl,
      zone: o.zone?.name ?? null,
    })),
    repairs: walkthrough.repairObservations.map((o) => ({
      label: o.label,
      confidence: o.confidence,
      keyframeUrl: o.keyframeUrl,
    })),
  });
});
