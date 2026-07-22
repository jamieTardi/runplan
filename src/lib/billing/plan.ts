// Pure entitlement logic — no I/O, unit-tested.

export interface PlanFields {
  plan: "free" | "pro" | "comp";
  planExpiresAt: Date | null;
}

/** Pro features: unlimited plans, Garmin sync + detail, FIT export/upload. */
export function isPro(user: PlanFields): boolean {
  if (user.plan === "comp") return true;
  if (user.plan !== "pro") return false;
  // planExpiresAt carries the paid-through date (+grace); null = open-ended.
  return !user.planExpiresAt || user.planExpiresAt.getTime() > Date.now();
}

export const FREE_ACTIVE_PLAN_LIMIT = 1;

export function upgradeMessage(feature: string): string {
  return `${feature} is a RunPlan Pro feature — upgrade in Settings → RunPlan Pro`;
}
