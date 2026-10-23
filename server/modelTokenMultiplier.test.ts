import { describe, expect, it } from "vitest";
import { getModelTokenMultiplier, getModelTokenMultipliers, setModelTokenMultiplier } from "./db";

describe("Model Token Multipliers", () => {
  it("defaults to 5x for Claude Opus 5 models", async () => {
    const opusMultiplier = await getModelTokenMultiplier("claude-opus-5.5");
    expect(opusMultiplier).toBeGreaterThanOrEqual(1);
  });

  it("defaults to 1x for standard models", async () => {
    const standardMultiplier = await getModelTokenMultiplier("deepseek-v4-pro");
    expect(standardMultiplier).toBe(1);
  });

  it("dynamically updates and persists custom multipliers (e.g. 7x)", async () => {
    const result = await setModelTokenMultiplier("claude-opus-5.5", 7);
    expect(result["claude-opus-5.5"]).toBe(7);

    const updated = await getModelTokenMultiplier("claude-opus-5.5");
    expect(updated).toBe(7);

    // Revert back to 5x for clean state
    await setModelTokenMultiplier("claude-opus-5.5", 5);
    const reverted = await getModelTokenMultiplier("claude-opus-5.5");
    expect(reverted).toBe(5);
  });
});
