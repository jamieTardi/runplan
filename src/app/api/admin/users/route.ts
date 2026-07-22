import { NextResponse } from "next/server";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { garminAccounts, plans, users } from "@/db/schema";
import { requireAdminForApi } from "@/lib/auth/api";

export async function GET() {
  const auth = await requireAdminForApi();
  if (!auth.ok) return auth.response;

  const [rows, planCounts, garminUsers] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        plan: users.plan,
        planExpiresAt: users.planExpiresAt,
        emailVerifiedAt: users.emailVerifiedAt,
        isAdmin: users.isAdmin,
        stripeCustomerId: users.stripeCustomerId,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt)),
    db
      .select({ userId: plans.userId, count: sql<number>`count(*)::int` })
      .from(plans)
      .groupBy(plans.userId),
    db.select({ userId: garminAccounts.userId }).from(garminAccounts),
  ]);

  const countByUser = new Map(planCounts.map((r) => [r.userId, r.count]));
  const garminSet = new Set(garminUsers.map((r) => r.userId));

  return NextResponse.json({
    users: rows.map((u) => ({
      ...u,
      planCount: countByUser.get(u.id) ?? 0,
      garminConnected: garminSet.has(u.id),
    })),
  });
}
