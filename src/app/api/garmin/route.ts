import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserForApi } from "@/lib/auth/api";
import { isPro, upgradeMessage } from "@/lib/billing/plan";
import { beginGarminLogin, GarminError } from "@/lib/garmin/client";
import {
  deleteGarminAccount,
  getGarminAccount,
  setGarminAutoSend,
  upsertGarminAccount,
} from "@/lib/garmin/store";
import { autoSendUpcomingWorkouts } from "@/lib/garmin/autoSend";

export async function GET() {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;

  const account = await getGarminAccount(auth.user.id);
  return NextResponse.json({
    connected: !!account,
    garminUserName: account?.garminUserName ?? null,
    lastSyncAt: account?.lastSyncAt ?? null,
    autoSend: account?.autoSend ?? true,
  });
}

const connectSchema = z.object({
  email: z.string().trim().min(3).max(200),
  password: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;
  if (!isPro(auth.user)) {
    return NextResponse.json({ error: upgradeMessage("Garmin sync"), upgrade: true }, { status: 402 });
  }

  const body = await req.json().catch(() => null);
  const parsed = connectSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    const outcome = await beginGarminLogin(parsed.data.email, parsed.data.password);
    if (outcome.status === "mfa") {
      return NextResponse.json({ mfaRequired: true, mfaToken: outcome.mfaToken });
    }
    await upsertGarminAccount(auth.user.id, outcome.garminUserName, outcome.tokens);
    // Auto-send defaults on: queue the coming week's sessions right away.
    let autoSent = 0;
    try {
      const account = await getGarminAccount(auth.user.id);
      if (account?.autoSend) autoSent = (await autoSendUpcomingWorkouts(auth.user.id)).sent;
    } catch (err) {
      console.error("Post-connect auto-send failed:", err);
    }
    return NextResponse.json({ connected: true, garminUserName: outcome.garminUserName, autoSent });
  } catch (err) {
    if (err instanceof GarminError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Garmin connect failed:", err);
    return NextResponse.json({ error: "Unexpected error talking to Garmin" }, { status: 502 });
  }
}

const settingsSchema = z.object({ autoSend: z.boolean() });

/** Update Garmin preferences (currently just the auto-send toggle). */
export async function PATCH(req: Request) {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;
  if (!isPro(auth.user)) {
    return NextResponse.json({ error: upgradeMessage("Garmin sync"), upgrade: true }, { status: 402 });
  }

  const body = await req.json().catch(() => null);
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const account = await getGarminAccount(auth.user.id);
  if (!account) return NextResponse.json({ error: "Garmin is not connected" }, { status: 400 });

  await setGarminAutoSend(auth.user.id, parsed.data.autoSend);

  // Turning it on shouldn't wait for the next daily sync — send now.
  let autoSent = 0;
  if (parsed.data.autoSend) {
    try {
      autoSent = (await autoSendUpcomingWorkouts(auth.user.id)).sent;
    } catch (err) {
      console.error("Auto-send after enabling failed:", err);
    }
  }
  return NextResponse.json({ autoSend: parsed.data.autoSend, autoSent });
}

export async function DELETE() {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;

  await deleteGarminAccount(auth.user.id);
  return NextResponse.json({ ok: true });
}
