import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { plans, pushSubscriptions, users, workouts } from "@/db/schema";
import { dailyWorkoutPayload, type PushWorkout } from "@/lib/push/message";
import { isPushConfigured, sendToSubscription } from "@/lib/push/webPush";
import type { Unit } from "@/lib/units";

// Internal endpoint for the daily-notification timer. Authenticated by the
// same shared-secret header as the Garmin sync timer.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isPushConfigured()) {
    return NextResponse.json({ error: "VAPID keys not configured" }, { status: 503 });
  }

  // Workout dates are calendar dates in the user's training timezone; the
  // server may run in UTC, so resolve "today" explicitly (en-CA = yyyy-mm-dd).
  const tz = process.env.PUSH_TZ ?? "Europe/London";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

  const subs = await db.select().from(pushSubscriptions);
  const byUser = new Map<string, typeof subs>();
  for (const sub of subs) {
    const list = byUser.get(sub.userId) ?? [];
    list.push(sub);
    byUser.set(sub.userId, list);
  }

  let notified = 0;
  let sent = 0;
  let pruned = 0;
  for (const [userId, userSubs] of byUser) {
    const [owner] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!owner) continue;

    const rows = await db
      .select({
        type: workouts.type,
        session: workouts.session,
        distanceKm: workouts.distanceKm,
        description: workouts.description,
        paceLowSPerKm: workouts.paceLowSPerKm,
        paceHighSPerKm: workouts.paceHighSPerKm,
        completed: workouts.completed,
        missed: workouts.missed,
      })
      .from(workouts)
      .innerJoin(plans, eq(workouts.planId, plans.id))
      .where(and(eq(plans.userId, userId), eq(plans.status, "active"), eq(workouts.date, today)));

    const todays: PushWorkout[] = rows.filter((w) => w.type !== "rest" && !w.completed && !w.missed);
    const payload = dailyWorkoutPayload(todays, owner.unitPref as Unit);
    if (!payload) continue; // rest day or no active plan — stay quiet

    notified++;
    for (const sub of userSubs) {
      const result = await sendToSubscription(sub, payload);
      if (result === "sent") sent++;
      if (result === "pruned") pruned++;
    }
  }

  return NextResponse.json({ date: today, subscriptions: subs.length, usersNotified: notified, sent, pruned });
}
