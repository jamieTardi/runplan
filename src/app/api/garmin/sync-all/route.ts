import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { isPro } from "@/lib/billing/plan";
import { listGarminAccounts } from "@/lib/garmin/store";
import { syncGarminForUser } from "@/lib/garmin/sync";

// Internal endpoint for the scheduled sync timer. Authenticated by a shared
// secret header rather than a session, so it can run from cron/systemd.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await listGarminAccounts();
  const results: Array<{ userId: string; scanned?: number; matched?: number; error?: string }> = [];
  for (const account of accounts) {
    const [owner] = await db.select().from(users).where(eq(users.id, account.userId)).limit(1);
    if (!owner || !isPro(owner)) continue; // Garmin sync is a Pro feature
    try {
      const result = await syncGarminForUser(account.userId);
      if (result) results.push({ userId: account.userId, ...result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Garmin sync-all failed for ${account.userId}:`, msg);
      results.push({ userId: account.userId, error: msg });
    }
  }
  return NextResponse.json({ synced: results.length, results });
}
