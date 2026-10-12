import { describe, expect, it } from "vitest";
import { verifyAdminPasscode } from "./adminPasscode";

describe("configured admin passcode", () => {
  it("accepts the supplied server-only passcode and rejects a different value", () => {
    process.env.QRONOS_ADMIN_PASSCODE = "987654";
    expect(verifyAdminPasscode("987654")).toBe(true);
    expect(verifyAdminPasscode("987654x")).toBe(false);
    expect(verifyAdminPasscode("8649")).toBe(false);
  });

  it("fails closed when no admin passcode is configured", () => {
    const orig1 = process.env.QRONOS_ADMIN_PASSCODE;
    const orig2 = process.env.ADMIN_PASSCODE;
    delete process.env.QRONOS_ADMIN_PASSCODE;
    delete process.env.ADMIN_PASSCODE;

    expect(verifyAdminPasscode("8649")).toBe(false);
    expect(verifyAdminPasscode("any_passcode")).toBe(false);

    if (orig1) process.env.QRONOS_ADMIN_PASSCODE = orig1;
    if (orig2) process.env.ADMIN_PASSCODE = orig2;
  });
});
