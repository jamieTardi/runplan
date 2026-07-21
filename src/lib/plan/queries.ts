import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { plans } from "@/db/schema";

/** All of a user's plans (summary fields), newest first. */
export async function getUserPlans(userId: string) {
  return db
    .select({
      id: plans.id,
      name: plans.name,
      raceType: plans.raceType,
      customDistanceKm: plans.customDistanceKm,
      goalTimeS: plans.goalTimeS,
      raceDate: plans.raceDate,
      status: plans.status,
      createdAt: plans.createdAt,
    })
    .from(plans)
    .where(eq(plans.userId, userId))
    .orderBy(desc(plans.createdAt));
}

/** Load a plan (scoped to the owner) with its weeks and workouts fully nested. */
export async function getPlanDetail(userId: string, planId: string) {
  const plan = await db.query.plans.findFirst({
    where: (p, { and, eq }) => and(eq(p.id, planId), eq(p.userId, userId)),
    with: {
      weeks: {
        orderBy: (w, { asc }) => asc(w.weekIndex),
        with: {
          workouts: { orderBy: (d, { asc }) => asc(d.dow) },
        },
      },
    },
  });
  return plan ?? null;
}

export type PlanDetail = NonNullable<Awaited<ReturnType<typeof getPlanDetail>>>;
