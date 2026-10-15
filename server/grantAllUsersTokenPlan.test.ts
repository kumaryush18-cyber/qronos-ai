import { describe, expect, it } from "vitest";
import { grantAllUsersTokenPlan } from "./db";

describe("grantAllUsersTokenPlan unit test", () => {
  it("exports grantAllUsersTokenPlan as a callable function", () => {
    expect(typeof grantAllUsersTokenPlan).toBe("function");
  });
});
