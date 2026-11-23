import { describe, expect, it, vi } from "vitest";

import type { Request, Response } from "express";
import {
  FREEPI_POOL_EMPTY_MESSAGE,
  publicTokenPayload,
  registerFreepiCliTokenRoutes,
} from "./freepiCliTokens";

type Captured = { paths: string[]; handler: (req: Request, res: Response) => Promise<unknown> };

function fakeApp(): Captured {
  const captured: Captured = { paths: [], handler: async () => undefined };
  const app = {
    get(path: string | string[], handler: Captured["handler"]) {
      captured.paths.push(...(Array.isArray(path) ? path : [path]));
      captured.handler = handler;
    },
  };
  registerFreepiCliTokenRoutes(app as never, {
    resolveUser: async (req) => (req.headers.authorization === "Bearer good" ? { userId: 7 } : null),
    getPool: async () => [{ token: "eyJ-token-one-value", slot: 0, label: "main" }],
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

const request = (authorization?: string) =>
  ({ headers: authorization ? { authorization } : {} }) as unknown as Request;

describe("registerFreepiCliTokenRoutes", () => {
  it("answers both spellings, with and without /api", () => {
    expect(fakeApp().paths).toEqual(["/freepi/tokens", "/api/cli/freepi/tokens"]);
  });

  it("gives a signed-in user the pool, never cached", async () => {
    const { handler } = fakeApp();
    const { res, state } = fakeRes();
    await handler(request("Bearer good"), res);
    expect(state.status).toBe(200);
    expect(state.headers["Cache-Control"]).toContain("no-store");
    expect(state.body).toEqual({
      count: 1,
      oneRequestPerToken: true,
      tokens: [{ id: "0", label: "main", token: "eyJ-token-one-value" }],
    });
  });

  it("refuses a request with no valid qronos key", async () => {
    const { handler } = fakeApp();
    const { res, state } = fakeRes();
    await handler(request("Bearer wrong"), res);
    expect(state.status).toBe(401);
    expect(state.body).toEqual({ error: "Unauthorized" });
  });

  it("an empty pool is a clear 503 with a sentence, not an empty list", async () => {
    const captured: { handler?: (req: Request, res: Response) => Promise<unknown> } = {};
    registerFreepiCliTokenRoutes(
      {
        get(_path: string | string[], handler: (req: Request, res: Response) => Promise<unknown>) {
          captured.handler = handler;
        },
      } as never,
      { resolveUser: async () => ({ userId: 7 }), getPool: async () => [] },
    );
    const { res, state } = fakeRes();
    await captured.handler!(request("Bearer good"), res);
    expect(state.status).toBe(503);
    expect(state.body).toEqual({ error: FREEPI_POOL_EMPTY_MESSAGE });
  });

  it("a broken pool read is a 503 too, never a crash", async () => {
    const captured: { handler?: (req: Request, res: Response) => Promise<unknown> } = {};
    registerFreepiCliTokenRoutes(
      {
        get(_path: string | string[], handler: (req: Request, res: Response) => Promise<unknown>) {
          captured.handler = handler;
        },
      } as never,
      {
        resolveUser: async () => ({ userId: 7 }),
        getPool: async () => {
          throw new Error("db down");
        },
      },
    );
    const { res, state } = fakeRes();
    await captured.handler!(request("Bearer good"), res);
    expect(state.status).toBe(503);
  });

  it("a key lookup that fails is 503, not 401: the user may be perfectly valid", async () => {
    const captured: { handler?: (req: Request, res: Response) => Promise<unknown> } = {};
    registerFreepiCliTokenRoutes(
      {
        get(_path: string | string[], handler: (req: Request, res: Response) => Promise<unknown>) {
          captured.handler = handler;
        },
      } as never,
      {
        resolveUser: async () => {
          throw new Error("db down");
        },
        getPool: async () => [],
      },
    );
    const { res, state } = fakeRes();
    await captured.handler!(request("Bearer good"), res);
    expect(state.status).toBe(503);
  });
});

describe("publicTokenPayload", () => {
  it("carries a slot id, a label and the token, and nothing else", () => {
    const payload = publicTokenPayload([
      { token: "a-token", slot: 3, label: null },
      { token: "b-token", slot: 5, label: "spare" },
    ]);
    expect(payload.count).toBe(2);
    expect(payload.tokens).toEqual([
      { id: "3", label: null, token: "a-token" },
      { id: "5", label: "spare", token: "b-token" },
    ]);
    expect(Object.keys(payload.tokens[0]!)).toEqual(["id", "label", "token"]);
  });

  it("never includes a fingerprint, a ciphertext or an iv", () => {
    const payload = publicTokenPayload([{ token: "a-token", slot: 0, label: null }]);
    const text = JSON.stringify(payload);
    expect(text).not.toContain("fingerprint");
    expect(text).not.toContain("ciphertext");
    expect(text).not.toContain("authTag");
    expect(text).not.toContain("iv");
  });
});

describe("no token is ever logged", () => {
  it("a successful response writes nothing to the console", async () => {
    const spies = [vi.spyOn(console, "log"), vi.spyOn(console, "info"), vi.spyOn(console, "error")];
    const { handler } = fakeApp();
    const { res } = fakeRes();
    await handler(request("Bearer good"), res);
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});
