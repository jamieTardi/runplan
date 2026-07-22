import { NextResponse } from "next/server";
import { requireUserForApi } from "@/lib/auth/api";
import { isPro, upgradeMessage } from "@/lib/billing/plan";
import { GarminError } from "@/lib/garmin/client";
import { syncGarminForUser } from "@/lib/garmin/sync";

export async function POST() {
  const auth = await requireUserForApi();
  if (!auth.ok) return auth.response;
  if (!isPro(auth.user)) {
    return NextResponse.json({ error: upgradeMessage("Garmin sync"), upgrade: true }, { status: 402 });
  }

  try {
    const result = await syncGarminForUser(auth.user.id);
    if (!result) return NextResponse.json({ error: "Garmin is not connected" }, { status: 400 });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof GarminError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    console.error("Garmin sync failed:", err);
    return NextResponse.json({ error: "Unexpected error during Garmin sync" }, { status: 502 });
  }
}
