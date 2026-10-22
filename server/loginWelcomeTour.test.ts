import { describe, expect, it } from "vitest";
import { LOGIN_WELCOME_TOUR_STEPS, shouldShowLoginWelcomeTour } from "../client/src/components/LoginWelcomeTour";

describe("LoginWelcomeTour session behavior", () => {
  it("remains disabled so onboarding cards do not pop up for users", () => {
    expect(shouldShowLoginWelcomeTour("any_marker", null)).toBe(false);
    expect(shouldShowLoginWelcomeTour("any_marker", "any_marker")).toBe(false);
  });

  it("retains only the GLM 5.3 and Discord announcement cards definitions for reference", () => {
    const titles = LOGIN_WELCOME_TOUR_STEPS.map(step => step.title);
    expect(titles).toEqual(["GLM 5.3 is available.", "Join the TokenForge Discord."]);
    expect(titles).not.toContain("Claude Fable 5.1 is now live.");
    expect(titles).not.toContain("Qwen 3.8 Max is ready.");
    expect(titles.indexOf("GLM 5.3 is available.")).toBeLessThan(titles.indexOf("Join the TokenForge Discord."));
  });
});

