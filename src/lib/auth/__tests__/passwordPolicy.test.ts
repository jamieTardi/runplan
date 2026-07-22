import { describe, expect, it } from "vitest";
import { validatePassword } from "../passwordPolicy";

describe("validatePassword", () => {
  it("accepts a decent password", () => {
    expect(validatePassword("correct-horse-7!")).toBeNull();
    expect(validatePassword("Tr0mbone#run")).toBeNull();
  });

  it("rejects short passwords", () => {
    expect(validatePassword("Ab1!x")).toMatch(/at least 10/);
    expect(validatePassword("Abc123!!!")).toMatch(/at least 10/); // 9 chars
  });

  it("requires a letter, a number and a special character", () => {
    expect(validatePassword("1234567890!!")).toMatch(/letter/);
    expect(validatePassword("abcdefghij!!")).toMatch(/number/);
    expect(validatePassword("abcdefgh1234")).toMatch(/special/);
  });

  it("rejects the obvious classics regardless of punctuation", () => {
    expect(validatePassword("password123!")).toMatch(/too common/);
    expect(validatePassword("Password-123")).toMatch(/too common/);
  });

  it("rejects passwords containing the email local part", () => {
    expect(validatePassword("jamie.tardi99!", "jamie.tardi@gmail.com")).toMatch(/email/);
    expect(validatePassword("unrelated-99!", "jamie.tardi@gmail.com")).toBeNull();
  });
});
