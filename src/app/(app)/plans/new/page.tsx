import { requireUser } from "@/lib/auth";
import { PlanBuilder } from "@/components/plan/PlanBuilder";
import { addDaysISO, isoDayOfWeek, todayISO } from "@/lib/plan/dates";

export default async function NewPlanPage() {
  const user = await requireUser();
  const today = todayISO();
  // Default to a Sunday roughly 18 weeks out.
  let raceDate = addDaysISO(today, 18 * 7);
  const dow = isoDayOfWeek(raceDate);
  if (dow !== 7) raceDate = addDaysISO(raceDate, 7 - dow);

  return (
    <div>
      <h1 className="text-2xl font-bold">Build a training plan</h1>
      <p className="mt-1 mb-6" style={{ color: "var(--muted)" }}>
        Enter your goal and we&apos;ll generate a periodised, science-based plan.
      </p>
      <PlanBuilder unit={user.unitPref} todayISO={today} defaultRaceDateISO={raceDate} />
    </div>
  );
}
