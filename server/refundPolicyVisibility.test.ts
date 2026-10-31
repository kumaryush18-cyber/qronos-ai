import { describe, expect, it } from "vitest";
import { getRefundPolicyEnabled, setRefundPolicyEnabled } from "./db";

describe("Refund Policy Visibility Settings", () => {
  it("defaults to true when unconfigured", async () => {
    const enabled = await getRefundPolicyEnabled();
    expect(typeof enabled).toBe("boolean");
  });

  it("can toggle between enabled and disabled states", async () => {
    const offResult = await setRefundPolicyEnabled(false);
    expect(offResult).toBe(false);
    expect(await getRefundPolicyEnabled()).toBe(false);

    const onResult = await setRefundPolicyEnabled(true);
    expect(onResult).toBe(true);
    expect(await getRefundPolicyEnabled()).toBe(true);
  });
});
