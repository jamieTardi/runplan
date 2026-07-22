import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUserForApi } from "@/lib/auth/api";
import { completeGarminMfa, GarminError } from "@/lib/garmin/client";
import { upsertGarminAccount } from "@/lib/garmin/store";

const schema = z.object({
  mfaToken: z.string().uuid(),
  code: z.string().trim().min(4).max(12),
});

export async function POST(req: Request) {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    const { garminUserName, tokens } = await completeGarminMfa(parsed.data.mfaToken, parsed.data.code);
    await upsertGarminAccount(auth.user.id, garminUserName, tokens);
    return NextResponse.json({ connected: true, garminUserName });
  } catch (err) {
    if (err instanceof GarminError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Garmin MFA failed:", err);
    return NextResponse.json({ error: "Unexpected error talking to Garmin" }, { status: 502 });
  }
}
