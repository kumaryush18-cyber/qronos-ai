import { beforeEach, describe, expect, it } from "vitest";
import {
  isUnorouterClaudeOpus5Provider,
  UNOROUTER_KEY_COOLDOWN_MS,
} from "./openaiGateway";
import {
  acquireProviderSlotConcurrency,
  getCredentialSlotTelemetry,
  isCredentialSlotEligible,
  recordCredentialSuccess,
  resetProviderCredentialTelemetry,
  setCredentialCooldown,
  type CredentialTelemetryProvider,
} from "./providerCredentialTelemetry";

describe("Unorouter restriction removal", () => {
  const telemetryProvider = "claude-opus-5:provider-1788422197682-23" as CredentialTelemetryProvider;

  beforeEach(() => {
    resetProviderCredentialTelemetry();
  });

  it("accurately identifies Unorouter provider by id, label, or baseUrl", () => {
    expect(isUnorouterClaudeOpus5Provider({ id: "provider-1788422197682-23" })).toBe(true);
    expect(isUnorouterClaudeOpus5Provider({ label: "Unorouter" })).toBe(true);
    expect(isUnorouterClaudeOpus5Provider({ label: "  unorouter opus 5  " })).toBe(true);
    expect(isUnorouterClaudeOpus5Provider({ baseUrl: "https://api.unorouter.com/v1" })).toBe(true);
    expect(isUnorouterClaudeOpus5Provider({ id: "provider-random-123", label: "Custom Provider", baseUrl: "https://custom.ai" })).toBe(false);
  });

  it("cooldown duration constant is 0 ms indicating removal of 1req/min restriction", () => {
    expect(UNOROUTER_KEY_COOLDOWN_MS).toBe(0);
  });

  it("does not apply cooldown when cooldown duration is 0", () => {
    const now = 1_000_000;
    // Slot remains eligible immediately
    setCredentialCooldown(telemetryProvider, 0, UNOROUTER_KEY_COOLDOWN_MS, now);
    expect(isCredentialSlotEligible(telemetryProvider, 0, now)).toBe(true);
  });

  it("allows multiple concurrent requests without artificial 1 req/min blocking", () => {
    const release1 = acquireProviderSlotConcurrency(telemetryProvider, 0);
    const release2 = acquireProviderSlotConcurrency(telemetryProvider, 0);
    release1();
    release2();
  });
});
