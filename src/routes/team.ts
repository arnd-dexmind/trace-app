import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db.js";
import { sendApiError } from "../lib/errors.js";
import { createAuthMiddleware } from "../lib/auth.js";
import { sendEmail, invitationTemplate } from "../email/send.js";

export const teamRouter = Router();

teamRouter.use(createAuthMiddleware());

// ── List team members ────────────────────────────────────────────────────────

teamRouter.get("/members", async (req, res) => {
  const userTenants = await db.userTenant.findMany({
    where: { tenantId: res.locals.tenantId },
    include: {
      user: { select: { id: true, email: true, name: true, clerkId: true } },
    },
  });

  res.status(200).json(
    userTenants.map((ut) => ({
      id: ut.id,
      userId: ut.userId,
      email: ut.user.email ?? null,
      name: ut.user.name ?? null,
      role: ut.role,
    })),
  );
});

// ── Create invite ────────────────────────────────────────────────────────────

teamRouter.post("/invites", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    sendApiError(res, 400, "BAD_REQUEST", "Valid email is required");
    return;
  }

  const role = req.body?.role === "owner" ? "owner" : "member";

  // Check for existing pending invite
  const existing = await db.teamInvite.findFirst({
    where: { tenantId: res.locals.tenantId, email, status: "pending" },
  });
  if (existing) {
    sendApiError(res, 409, "CONFLICT", "An invitation has already been sent to this email");
    return;
  }

  const invite = await db.teamInvite.create({
    data: {
      tenantId: res.locals.tenantId,
      inviterUserId: res.locals.userId,
      email,
      role,
      token: randomUUID(),
    },
  });

  // Send invitation email (best-effort)
  getInviterName(res.locals.userId).then((inviterName) => {
    sendEmail({
      to: email,
      subject: `${inviterName} invited you to join PerifEye`,
      html: invitationTemplate({
        inviterName,
        spaceName: "their space",
        inviteUrl: `${process.env.APP_URL || "https://perifeye.com"}/team/accept?token=${invite.token}`,
      }),
    });
  });

  res.status(201).json({
    id: invite.id,
    email: invite.email,
    role: invite.role,
    status: invite.status,
    createdAt: invite.createdAt,
  });
});

// ── List invites ─────────────────────────────────────────────────────────────

teamRouter.get("/invites", async (req, res) => {
  const invites = await db.teamInvite.findMany({
    where: { tenantId: res.locals.tenantId },
    orderBy: { createdAt: "desc" },
  });

  res.status(200).json(
    invites.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      status: inv.status,
      createdAt: inv.createdAt,
      acceptedAt: inv.acceptedAt,
    })),
  );
});

// ── Accept invite (by token — requires auth to associate user) ──────────────

teamRouter.post("/invites/:token/accept", async (req, res) => {
  const invite = await db.teamInvite.findUnique({
    where: { token: req.params.token },
  });

  if (!invite || invite.status !== "pending") {
    sendApiError(res, 404, "NOT_FOUND", "Invite not found or already used");
    return;
  }

  await db.$transaction([
    db.userTenant.create({
      data: {
        userId: res.locals.userId,
        tenantId: invite.tenantId,
        role: invite.role,
      },
    }),
    db.teamInvite.update({
      where: { id: invite.id },
      data: { status: "accepted", acceptedAt: new Date() },
    }),
  ]);

  res.status(200).json({ accepted: true, tenantId: invite.tenantId, role: invite.role });
});

// ── Delete invite ────────────────────────────────────────────────────────────

teamRouter.delete("/invites/:id", async (req, res) => {
  const invite = await db.teamInvite.findFirst({
    where: { id: req.params.id, tenantId: res.locals.tenantId },
  });

  if (!invite) {
    sendApiError(res, 404, "NOT_FOUND", "Invite not found");
    return;
  }

  await db.teamInvite.delete({ where: { id: invite.id } });
  res.status(200).json({ deleted: true });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getInviterName(userId: string): Promise<string> {
  try {
    const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
    return user?.name || user?.email || "Someone";
  } catch {
    return "Someone";
  }
}
