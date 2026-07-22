import { describe, expect, it } from "vitest";
import { isPro } from "../plan";

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
