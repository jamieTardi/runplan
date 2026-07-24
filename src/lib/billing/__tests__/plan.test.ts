import { describe, expect, it } from "vitest";
import { FREE_PLAN_WINDOW_DAYS, MAX_PLANS_PER_USER, isPro, planCreationDenial } from "../plan";

describe("isPro", () => {
  it("free is never pro", () => {
    expect(isPro({ plan: "free", planExpiresAt: null })).toBe(false);
    expect(isPro({ plan: "free", planExpiresAt: new Date(Date.now() + 86_400_000) })).toBe(false);
  });

  it("comp is always pro, expiry ignored", () => {
    expect(isPro({ plan: "comp", planExpiresAt: null })).toBe(true);
    expect(isPro({ plan: "comp", planExpiresAt: new Date(0) })).toBe(true);
  });

  it("pro respects the paid-through date", () => {
    expect(isPro({ plan: "pro", planExpiresAt: null })).toBe(true);
    expect(isPro({ plan: "pro", planExpiresAt: new Date(Date.now() + 86_400_000) })).toBe(true);
    expect(isPro({ plan: "pro", planExpiresAt: new Date(Date.now() - 1000) })).toBe(false);
  });
});

describe("planCreationDenial", () => {
  const DAY = 86_400_000;
  const now = new Date("2026-07-24T12:00:00Z");
  const daysAgo = (d: number) => new Date(now.getTime() - d * DAY);
  const freeUser = (signupDaysAgo: number) =>
    ({ plan: "free", planExpiresAt: null, createdAt: daysAgo(signupDaysAgo) }) as const;
  const proUser = { plan: "pro", planExpiresAt: null, createdAt: daysAgo(400) } as const;

  it("new free user with no plans may create", () => {
    expect(planCreationDenial(freeUser(1), { total: 0, active: 0 }, now)).toBeNull();
  });

  it("free user inside the window is allowed right up to day 30", () => {
    expect(planCreationDenial(freeUser(FREE_PLAN_WINDOW_DAYS), { total: 0, active: 0 }, now)).toBeNull();
  });

  it("free user past the window is blocked with an upgrade prompt", () => {
    const denial = planCreationDenial(freeUser(FREE_PLAN_WINDOW_DAYS + 1), { total: 0, active: 0 }, now);
    expect(denial?.code).toBe("free-window-expired");
    expect(denial?.upgrade).toBe(true);
  });

  it("pro user is never window-blocked", () => {
    expect(planCreationDenial(proUser, { total: 3, active: 3 }, now)).toBeNull();
  });

  it("expired pro falls back to free rules", () => {
    const expired = { plan: "pro", planExpiresAt: daysAgo(5), createdAt: daysAgo(400) } as const;
    expect(planCreationDenial(expired, { total: 0, active: 0 }, now)?.code).toBe("free-window-expired");
  });

  it("plan cap applies to everyone, pro included", () => {
    const denial = planCreationDenial(proUser, { total: MAX_PLANS_PER_USER, active: 2 }, now);
    expect(denial?.code).toBe("plan-cap");
    expect(denial?.upgrade).toBe(false);
    expect(planCreationDenial(proUser, { total: MAX_PLANS_PER_USER - 1, active: 2 }, now)).toBeNull();
  });

  it("free user still limited to one active plan inside the window", () => {
    const denial = planCreationDenial(freeUser(5), { total: 1, active: 1 }, now);
    expect(denial?.code).toBe("free-active-limit");
    expect(denial?.upgrade).toBe(true);
    expect(planCreationDenial(freeUser(5), { total: 1, active: 0 }, now)).toBeNull();
  });

  it("window check wins over the cap for lapsed free users", () => {
    const denial = planCreationDenial(freeUser(90), { total: MAX_PLANS_PER_USER, active: 1 }, now);
    expect(denial?.code).toBe("free-window-expired");
  });
});
