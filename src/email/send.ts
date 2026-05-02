import { Resend } from "resend";
import { clerkClient } from "@clerk/express";

const FROM = "PerifEye <noreply@perifeye.app>";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}) {
  if (!resend) {
    console.log(JSON.stringify({
      level: "info",
      message: "Email not sent (RESEND_API_KEY not configured)",
      to: opts.to,
      subject: opts.subject,
    }));
    return { sent: false, reason: "not_configured" };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });

    if (error) {
      console.error(JSON.stringify({
        level: "error",
        message: "Resend API error",
        error,
        to: opts.to,
        subject: opts.subject,
      }));
      return { sent: false, reason: "api_error" };
    }

    return { sent: true, id: data?.id };
  } catch (err) {
    console.error(JSON.stringify({
      level: "error",
      message: "Failed to send email",
      detail: err instanceof Error ? err.message : String(err),
      to: opts.to,
      subject: opts.subject,
    }));
    return { sent: false, reason: "exception" };
  }
}

export async function getUserEmail(clerkId: string): Promise<string | null> {
  try {
    const user = await clerkClient.users.getUser(clerkId);
    return user.primaryEmailAddress?.emailAddress ?? null;
  } catch {
    return null;
  }
}

// ── Templates ──────────────────────────────────────────────────────────

function baseLayout(opts: { preview: string; content: string }) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${opts.preview}</title>
</head>
<body style="font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;background:#FAFAFA;margin:0;padding:0">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAFA;padding:24px 0">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;overflow:hidden;border:1px solid #E4E4E7">
          <tr>
            <td style="padding:32px 40px 8px">
              <p style="font-size:20px;font-weight:700;color:#09090B;margin:0">PerifEye</p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 40px 32px">
              ${opts.content}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 40px;border-top:1px solid #E4E4E7;font-size:12px;color:#A1A1AA">
              PerifEye &middot; AI-powered home inventory from walkthrough videos
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function welcomeTemplate(opts: { name?: string }) {
  const displayName = opts.name || "there";
  return baseLayout({
    preview: `Welcome to PerifEye, ${displayName}!`,
    content: `<h1 style="color:#09090B;font-size:24px;font-weight:700;margin:0 0 16px">Welcome to PerifEye</h1>
<p style="color:#3F3F46;font-size:16px;line-height:24px;margin:0 0 16px">Hi ${displayName},</p>
<p style="color:#3F3F46;font-size:16px;line-height:24px;margin:0 0 16px">Thanks for joining the PerifEye waitlist. We're building the easiest way to create and maintain a searchable home inventory from walkthrough videos.</p>
<p style="color:#3F3F46;font-size:16px;line-height:24px;margin:0 0 16px">We'll let you know as soon as your spot is ready. In the meantime, if you have any questions, just reply to this email.</p>
<p style="color:#71717A;font-size:14px;margin:8px 0 0">&mdash; The PerifEye Team</p>`,
  });
}

export function notificationTemplate(opts: {
  headline?: string;
  body?: string;
  actionLabel?: string;
  actionUrl?: string;
}) {
  return baseLayout({
    preview: opts.headline ?? "PerifEye Notification",
    content: `${opts.headline ? `<h1 style="color:#09090B;font-size:20px;font-weight:600;margin:0 0 12px">${opts.headline}</h1>` : ""}
${opts.body ? `<p style="color:#3F3F46;font-size:16px;line-height:24px;margin:0 0 16px">${opts.body}</p>` : ""}
${opts.actionLabel && opts.actionUrl ? `<div style="text-align:center;margin-top:24px;margin-bottom:12px"><a href="${opts.actionUrl}" style="display:inline-block;background:#09090B;color:#FFFFFF;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none">${opts.actionLabel}</a></div>` : ""}
<p style="color:#A1A1AA;font-size:12px;margin:16px 0 0;border-top:1px solid #E4E4E7;padding-top:12px">You received this notification because you have a PerifEye account.</p>`,
  });
}

export function invitationTemplate(opts: {
  inviterName?: string;
  spaceName: string;
  inviteUrl: string;
}) {
  const inviter = opts.inviterName || "Someone";
  return baseLayout({
    preview: `${inviter} invited you to join ${opts.spaceName} on PerifEye`,
    content: `<h1 style="color:#09090B;font-size:20px;font-weight:600;margin:0 0 12px">You're invited</h1>
<p style="color:#3F3F46;font-size:16px;line-height:24px;margin:0 0 16px">${inviter} has invited you to join <strong>${opts.spaceName}</strong> on PerifEye.</p>
<div style="text-align:center;margin-top:24px;margin-bottom:12px"><a href="${opts.inviteUrl}" style="display:inline-block;background:#09090B;color:#FFFFFF;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none">Accept Invitation</a></div>
<p style="color:#A1A1AA;font-size:12px;margin:16px 0 0;border-top:1px solid #E4E4E7;padding-top:12px">If you weren't expecting this invitation, you can safely ignore this email.</p>`,
  });
}
