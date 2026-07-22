import "server-only";
import { eq } from "drizzle-orm";
import type { IGarminTokens } from "@flow-js/garmin-connect";
import { db } from "@/db";
import { garminAccounts, type GarminAccount } from "@/db/schema";

export async function getGarminAccount(userId: string): Promise<GarminAccount | null> {
  const [row] = await db
    .select()
    .from(garminAccounts)
    .where(eq(garminAccounts.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function upsertGarminAccount(
  userId: string,
  garminUserName: string | null,
  tokens: IGarminTokens,
): Promise<void> {
  await db
    .insert(garminAccounts)
    .values({ userId, garminUserName, tokens })
    .onConflictDoUpdate({
      target: garminAccounts.userId,
      set: { garminUserName, tokens },
    });
}

export async function saveGarminTokens(userId: string, tokens: IGarminTokens): Promise<void> {
  await db.update(garminAccounts).set({ tokens }).where(eq(garminAccounts.userId, userId));
}

export async function markGarminSynced(userId: string, tokens: IGarminTokens): Promise<void> {
  await db
    .update(garminAccounts)
    .set({ tokens, lastSyncAt: new Date() })
    .where(eq(garminAccounts.userId, userId));
}

export async function deleteGarminAccount(userId: string): Promise<void> {
  await db.delete(garminAccounts).where(eq(garminAccounts.userId, userId));
}

/** All connected accounts — used by the scheduled sync-all endpoint. */
export async function listGarminAccounts(): Promise<GarminAccount[]> {
  return db.select().from(garminAccounts);
}
