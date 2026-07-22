import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserForApi } from "@/lib/auth/api";
import { isPro, upgradeMessage } from "@/lib/billing/plan";
import { beginGarminLogin, GarminError } from "@/lib/garmin/client";
import { deleteGarminAccount, getGarminAccount, upsertGarminAccount } from "@/lib/garmin/store";

export async function GET() {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;

  const account = await getGarminAccount(auth.user.id);
  return NextResponse.json({
    connected: !!account,
    garminUserName: account?.garminUserName ?? null,
    lastSyncAt: account?.lastSyncAt ?? null,
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
    return NextResponse.json({ connected: true, garminUserName: outcome.garminUserName });
  } catch (err) {
    if (err instanceof GarminError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Garmin connect failed:", err);
    return NextResponse.json({ error: "Unexpected error talking to Garmin" }, { status: 502 });
  }
}

export async function DELETE() {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;

  await deleteGarminAccount(auth.user.id);
  return NextResponse.json({ ok: true });
}
