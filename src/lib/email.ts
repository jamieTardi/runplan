import "server-only";
import nodemailer from "nodemailer";

// SMTP config from env — see docs/deployment.md. Password reset silently
// no-ops (with a server log) when unconfigured, so the app runs fine without.

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

function transport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_PORT === "465",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Short operational notification to the site owner (ADMIN_EMAIL). */
export async function sendAdminEmail(subject: string, text: string): Promise<void> {
  const to = process.env.ADMIN_EMAIL;
  if (!to || !isEmailConfigured()) return;
  await transport().sendMail({ from: process.env.SMTP_FROM, to, subject, text });
}

export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
  if (!isEmailConfigured()) {
    console.warn("Verification email skipped — SMTP is not configured.");
    return;
  }
  await transport().sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: "Verify your RunPlan email",
    text: `Welcome to RunPlan! Confirm this email address (link valid for 24 hours):

${verifyUrl}

If you didn't create a RunPlan account, ignore this email.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px">
<h2 style="color:#4f46e5">RunPlan</h2>
<p>Welcome to RunPlan! Confirm this email address:</p>
<p><a href="${verifyUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Verify email</a></p>
<p style="color:#6b7280;font-size:13px">The link is valid for 24 hours. If you didn't create a RunPlan account, ignore this email.</p>
</div>`,
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  if (!isEmailConfigured()) {
    console.warn("Password reset requested but SMTP is not configured (SMTP_HOST/SMTP_FROM).");
    return;
  }
  await transport().sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject: "Reset your RunPlan password",
    text: `Someone (hopefully you) asked to reset the RunPlan password for this address.

Reset it here (link valid for 1 hour):
${resetUrl}

If you didn't ask for this, ignore this email — nothing changes.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px">
<h2 style="color:#4f46e5">RunPlan</h2>
<p>Someone (hopefully you) asked to reset the RunPlan password for this address.</p>
<p><a href="${resetUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Reset password</a></p>
<p style="color:#6b7280;font-size:13px">The link is valid for 1 hour. If you didn't ask for this, ignore this email — nothing changes.</p>
</div>`,
  });
}
