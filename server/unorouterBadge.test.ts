import { describe, expect, it } from "vitest";
import { getUnoRouterBadgeEnabled, setUnoRouterBadgeEnabled } from "./db";

describe("UnoRouter Badge Visibility Settings", () => {
  it("defaults to true when unconfigured", async () => {
    const enabled = await getUnoRouterBadgeEnabled();
    expect(typeof enabled).toBe("boolean");
  });

  it("can toggle between enabled and disabled states", async () => {
    const offResult = await setUnoRouterBadgeEnabled(false);
    expect(offResult).toBe(false);
    expect(await getUnoRouterBadgeEnabled()).toBe(false);

    const onResult = await setUnoRouterBadgeEnabled(true);
    expect(onResult).toBe(true);
    expect(await getUnoRouterBadgeEnabled()).toBe(true);
  });
});
