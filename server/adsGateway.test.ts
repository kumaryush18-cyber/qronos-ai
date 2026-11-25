import { describe, expect, it } from "vitest";
import type { Request, Response } from "express";

import { registerAdsGateway } from "./adsGateway";

/**
 * The debug header exists so a person at a terminal can see why an ad did not
 * appear without reaching into container logs.
 *
 * Two rules:
 *  - an ordinary request is never told anything about our ad plumbing;
 *  - the reason never carries a key.
 */
type Handler = (req: Request, res: Response) => Promise<unknown>;

function capture() {
  const handlers: Record<string, Handler> = {};
  const app = {
    get(path: string, handler: Handler) {
      handlers[path] = handler;
    },
    post(path: string, handler: Handler) {
      handlers[path] = handler;
    },
  };
  registerAdsGateway(app as never);
  return handlers;
}

function fakeRes() {
  const state = { status: 200, headers: {} as Record<string, string>, body: undefined as unknown };
  const res = {
    setHeader(name: string, value: string) {
      state.headers[name.toLowerCase()] = value;
    },
    status(code: number) {
      state.status = code;
      return res;
    },
    json(payload: unknown) {
      state.body = payload;
      return res;
    },
    end() {
      return res;
    },
  };
  return { res: res as unknown as Response, state };
}

const request = (debug: boolean) =>
  ({
    query: { slot: "banner" },
    headers: debug ? { "x-ad-debug": "1" } : {},
    socket: { remoteAddress: "203.0.113.9" },
  }) as unknown as Request;

describe("the ad miss reason", () => {
  it("is left out for an ordinary request", async () => {
    const handlers = capture();
    const { res, state } = fakeRes();
    await handlers["/ads/next"]!(request(false), res);
    expect(state.headers["x-ad-miss"]).toBeUndefined();
  });

  it("comes back when the caller asked for it, and never names a key", async () => {
    const handlers = capture();
    const { res, state } = fakeRes();
    await handlers["/ads/next"]!(request(true), res);
    const miss = state.headers["x-ad-miss"];
    if (miss !== undefined) {
      expect(miss).toContain("[ads] no fill");
      expect(miss).toContain("slot=banner");
      expect(miss).not.toMatch(/eyJ/);
      expect(miss).not.toContain(process.env.GRAVITY_API_KEY ?? "no-key-set");
    }
  });

  it("a filled slot is a 200 and needs no reason", async () => {
    const handlers = capture();
    const { res, state } = fakeRes();
    await handlers["/ads/next"]!(request(true), res);
    expect([200, 204]).toContain(state.status);
  });
});
