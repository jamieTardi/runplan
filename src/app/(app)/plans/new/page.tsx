import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { planCreationDenial } from "@/lib/billing/plan";
import { getUserPlans } from "@/lib/plan/queries";
import { PlanBuilder } from "@/components/plan/PlanBuilder";
import { addDaysISO, isoDayOfWeek, todayISO } from "@/lib/plan/dates";

export default async function NewPlanPage() {
  const user = await requireUser();

  const existing = await getUserPlans(user.id);
  const denial = planCreationDenial(user, {
    total: existing.length,
    active: existing.filter((p) => p.status === "active").length,
  });
  if (denial) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Build a training plan</h1>
        <div className="card p-8 mt-6 text-center flex flex-col items-center gap-4">
          <span className="inline-flex items-center justify-center h-14 w-14 rounded-2xl" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}>
            {denial.upgrade ? <Sparkles size={26} /> : <Lock size={26} />}
          </span>
          <p className="text-sm max-w-sm" style={{ color: "var(--muted)" }}>
            {denial.error}
          </p>
          {denial.upgrade ? (
            <Link href="/settings" className="btn btn-primary">
              Upgrade to RunPlan Pro
            </Link>
          ) : (
            <Link href="/" className="btn btn-primary">
              Manage your plans
            </Link>
          )}
        </div>
      </div>
    );
  }

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
