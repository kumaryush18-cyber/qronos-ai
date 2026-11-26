import { describe, expect, it } from "vitest";

import { CLI_LATEST_VERSION, CLI_MIN_VERSION, resolveCliVersionInfo } from "./cliVersionGate";

describe("the version gate", () => {
  it("blocks an install older than the release", () => {
    expect(resolveCliVersionInfo({}).min).toBe(CLI_MIN_VERSION);
    expect(CLI_MIN_VERSION).toBe(CLI_LATEST_VERSION);
  });

  it("answers the same version twice, so the update target is unambiguous", () => {
    const info = resolveCliVersionInfo({});
    expect(info.latest).toBe(info.min);
  });

  it("looks like a real version", () => {
    expect(CLI_LATEST_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("can be relaxed without a release", () => {
    const info = resolveCliVersionInfo({ QRONOS_CLI_MIN_VERSION: "1.0.20", QRONOS_CLI_LATEST_VERSION: "1.0.31" });
    expect(info).toEqual({ min: "1.0.20", latest: "1.0.31" });
  });

  it("refuses a malformed override instead of locking everyone out", () => {
    const info = resolveCliVersionInfo({ QRONOS_CLI_MIN_VERSION: "banana", QRONOS_CLI_LATEST_VERSION: "1.0" });
    expect(info).toEqual({ min: CLI_MIN_VERSION, latest: CLI_LATEST_VERSION });
  });

  it("trims a value that arrived with whitespace", () => {
    expect(resolveCliVersionInfo({ QRONOS_CLI_MIN_VERSION: " 1.0.31 " }).min).toBe("1.0.31");
  });

  it("never returns an empty version", () => {
    const info = resolveCliVersionInfo({ QRONOS_CLI_MIN_VERSION: "", QRONOS_CLI_LATEST_VERSION: "" });
    expect(info.min).toBeTruthy();
    expect(info.latest).toBeTruthy();
  });
});
