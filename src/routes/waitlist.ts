import { Router } from "express";
import { db } from "../lib/db.js";
import { sendApiError } from "../lib/errors.js";

export const waitlistRouter = Router();

// POST /api/waitlist — join waitlist (public)
waitlistRouter.post("/", async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";

  if (!name || !email) {
    sendApiError(res, 400, "BAD_REQUEST", "Name and email are required");
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    sendApiError(res, 400, "BAD_REQUEST", "Invalid email address");
    return;
  }

  const existing = await db.waitlistEntry.findUnique({ where: { email } });
  if (existing) {
    res.status(200).json({ message: "You're already on the waitlist!" });
    return;
  }

  await db.waitlistEntry.create({
    data: {
      name,
      email,
      utmSource: typeof req.body?.utm_source === "string" ? req.body.utm_source.trim() || null : null,
      utmMedium: typeof req.body?.utm_medium === "string" ? req.body.utm_medium.trim() || null : null,
      utmCampaign: typeof req.body?.utm_campaign === "string" ? req.body.utm_campaign.trim() || null : null,
    },
  });

  res.status(201).json({ message: "Thanks! We'll be in touch soon." });
});

// GET /api/waitlist — stats (public, no auth)
waitlistRouter.get("/", async (_req, res) => {
  const count = await db.waitlistEntry.count();
  const entries = await db.waitlistEntry.findMany({
    select: { utmSource: true },
  });

  const channels: Record<string, number> = {};
  for (const e of entries) {
    const src = e.utmSource || "direct";
    channels[src] = (channels[src] || 0) + 1;
  }

  res.status(200).json({ count, channels });
});
