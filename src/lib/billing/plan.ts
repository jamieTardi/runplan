// Pure entitlement logic — no I/O, unit-tested.

export interface PlanFields {
  plan: "free" | "pro" | "comp";
  planExpiresAt: Date | null;
}

/** Pro features: plan creation beyond the free month, Garmin sync + detail, FIT export/upload. */
export function isPro(user: PlanFields, now: Date = new Date()): boolean {
  if (user.plan === "comp") return true;
  if (user.plan !== "pro") return false;
  // planExpiresAt carries the paid-through date (+grace); null = open-ended.
  return !user.planExpiresAt || user.planExpiresAt.getTime() > now.getTime();
}

export const FREE_ACTIVE_PLAN_LIMIT = 1;

/** Free accounts can create plans only within this window after signup. */
export const FREE_PLAN_WINDOW_DAYS = 30;

/** Hard cap on stored plans per account (anti-spam) — applies to Pro too. */
export const MAX_PLANS_PER_USER = 10;

export interface PlanCreationUser extends PlanFields {
  createdAt: Date;
}

export interface PlanCreationDenial {
  code: "free-window-expired" | "plan-cap" | "free-active-limit";
  error: string;
  /** true = fixed by upgrading (402); false = fixed by deleting plans (403). */
  upgrade: boolean;
}

/** Why this user may not create a plan right now, or null if they may. */
export function planCreationDenial(
  user: PlanCreationUser,
  counts: { total: number; active: number },
  now: Date = new Date(),
): PlanCreationDenial | null {
  const pro = isPro(user, now);
  if (!pro && now.getTime() - user.createdAt.getTime() > FREE_PLAN_WINDOW_DAYS * 86_400_000) {
    return {
      code: "free-window-expired",
      error:
        "Your free month of plan building has ended — upgrade to RunPlan Pro to keep creating plans",
      upgrade: true,
    };
  }
  if (counts.total >= MAX_PLANS_PER_USER) {
    return {
      code: "plan-cap",
      error: `Accounts can keep up to ${MAX_PLANS_PER_USER} plans — delete an old one to make room`,
      upgrade: false,
    };
  }
  if (!pro && counts.active >= FREE_ACTIVE_PLAN_LIMIT) {
    return {
      code: "free-active-limit",
      error:
        "Free accounts have one active plan — archive it first, or upgrade to RunPlan Pro",
      upgrade: true,
    };
  }
  return null;
}

export function upgradeMessage(feature: string): string {
  return `${feature} is a RunPlan Pro feature — upgrade in Settings → RunPlan Pro`;
}
