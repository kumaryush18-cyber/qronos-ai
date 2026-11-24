import { beforeEach, describe, expect, it } from "vitest";

import type { Request, Response } from "express";
import { registerFreepiRoutingRoutes } from "./freepiRoutingRoute";
import { normalizeRoutingEvent, recentRoutingEvents, resetRoutingEvents } from "./freepiRouting";

type Handler = (req: Request, res: Response) => Promise<unknown>;

function fakeApp() {
  const captured = { gets: [] as string[], posts: [] as string[], getHandler: undefined as Handler | undefined, postHandler: undefined as Handler | undefined };
  const app = {
    get(path: string, handler: Handler) {
      captured.gets.push(path);
      captured.getHandler = handler;
    },
    post(path: string, handler: Handler) {
      captured.posts.push(path);
      captured.postHandler = handler;
    },
  };
  registerFreepiRoutingRoutes(app as never, {
    resolveUser: async (req) => (req.headers.authorization === "Bearer good" ? { userId: 7 } : null),
  });
  return captured;
}

function fakeRes() {
  const state = { status: 200, body: undefined as unknown, headers: {} as Record<string, string> };
  const res = {
    setHeader(name: string, value: string) {
      state.headers[name] = value;
    },
    status(code: number) {
      state.status = code;
      return res;
    },
    json(payload: unknown) {
      state.body = payload;
      return res;
    },
  };
  return { res: res as unknown as Response, state };
}

const BODY = {
  key: "srv-2",
  slot: 1,
  model: "particle",
  status: 200,
  ms: 1200,
  inputTokens: 412,
  outputTokens: 588,
};

const request = (authorization?: string, body?: unknown) =>
  ({ headers: authorization ? { authorization } : {}, body }) as unknown as Request;

beforeEach(() => resetRoutingEvents());

describe("registerFreepiRoutingRoutes", () => {
  it("answers both spellings, with and without /api, for both verbs", () => {
    const app = fakeApp();
    expect(app.posts.sort()).toEqual(["/api/cli/freepi/routing", "/cli/freepi/routing"]);
    expect(app.gets.sort()).toEqual(["/api/cli/freepi/routing", "/cli/freepi/routing"]);
  });

  it("no key is a 401 and stores nothing", async () => {
    const app = fakeApp();
    const { res, state } = fakeRes();
    await app.postHandler!(request(undefined, BODY), res);
    expect(state.status).toBe(401);
    expect(recentRoutingEvents()).toEqual([]);
  });

  it("a good event is accepted with a 202 and a small reply", async () => {
    const app = fakeApp();
    const { res, state } = fakeRes();
    await app.postHandler!(request("Bearer good", BODY), res);
    expect(state.status).toBe(202);
    expect(state.body).toEqual({ ok: true });
    expect(state.headers["Cache-Control"]).toContain("no-store");
  });

  it("a body that is not an event is a 400 and stores nothing", async () => {
    const app = fakeApp();
    const { res, state } = fakeRes();
    await app.postHandler!(request("Bearer good", { model: "" }), res);
    expect(state.status).toBe(400);
    expect(recentRoutingEvents()).toEqual([]);
  });

  it("the read side returns the newest events and the window size", async () => {
    const app = fakeApp();
    await app.postHandler!(request("Bearer good", BODY), fakeRes().res);
    await app.postHandler!(request("Bearer good", { ...BODY, model: "deepseek-v4-flash" }), fakeRes().res);
    const { res, state } = fakeRes();
    await app.getHandler!(request("Bearer good"), res);
    const body = state.body as { events: Array<{ model: string }>; windowSize: number; total: number };
    expect(state.status).toBe(200);
    expect(body.events[0]!.model).toBe("deepseek-v4-flash");
    expect(body.windowSize).toBe(20);
    expect(body.total).toBe(2);
  });

  it("the read side refuses a stranger too", async () => {
    const app = fakeApp();
    const { res, state } = fakeRes();
    await app.getHandler!(request(undefined), res);
    expect(state.status).toBe(401);
  });

  it("the reply never contains a token, even when the body tried to smuggle one", async () => {
    const app = fakeApp();
    await app.postHandler!(request("Bearer good", { ...BODY, token: "eyJ-secret" }), fakeRes().res);
    const { res, state } = fakeRes();
    await app.getHandler!(request("Bearer good"), res);
    expect(JSON.stringify(state.body)).not.toContain("eyJ");
  });
});

describe("an arrival time is stamped by the server", () => {
  it("never by the caller", () => {
    const event = normalizeRoutingEvent({ ...BODY, at: "1999-01-01T00:00:00.000Z" }, Date.parse("2026-11-24T04:00:00.000Z"));
    expect(event?.at).toBe("2026-11-24T04:00:00.000Z");
  });
});
