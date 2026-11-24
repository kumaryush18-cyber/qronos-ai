import { describe, expect, it, vi } from "vitest";

import type { Request, Response } from "express";
import {
  FREEPI_POOL_EMPTY_MESSAGE,
  publicTokenPayload,
  registerFreepiCliTokenRoutes,
} from "./freepiCliTokens";
import { FREEPI_POOL_FULL_MESSAGE, saveFreepiCredential } from "./freepiCredentials";

type Handler = (req: Request, res: Response) => Promise<unknown>;
type Captured = { paths: string[]; handler: Handler; postPaths: string[]; postHandler: Handler };

function fakeApp(): Captured {
  const captured: Captured = {
    paths: [],
    handler: async () => undefined,
    postPaths: [],
    postHandler: async () => undefined,
  };
  const app = {
    get(path: string | string[], handler: Handler) {
      captured.paths.push(...(Array.isArray(path) ? path : [path]));
      captured.handler = handler;
    },
    post(path: string | string[], handler: Handler) {
      captured.postPaths.push(...(Array.isArray(path) ? path : [path]));
      captured.postHandler = handler;
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
        get(_path: string | string[], handler: Handler) {
          captured.handler = handler;
        },
        post() {
          // the save route is not exercised here
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
        get(_path: string | string[], handler: Handler) {
          captured.handler = handler;
        },
        post() {
          // the save route is not exercised here
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
        get(_path: string | string[], handler: Handler) {
          captured.handler = handler;
        },
        post() {
          // the save route is not exercised here
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

// ---------------------------------------------------------------------------
// POST /api/cli/freepi/tokens — a login fills the next empty slot
// ---------------------------------------------------------------------------

type SaveCall = { token: string; label?: string | null; userId: number };
type AuditCall = { action: string; metadata?: Record<string, unknown> };

function saveApp(options: {
  saveResult?: Awaited<ReturnType<typeof saveFreepiCredential>> | (() => Promise<never>);
  auditThrows?: boolean;
} = {}) {
  const calls: SaveCall[] = [];
  const audits: AuditCall[] = [];
  const fake: { paths: string[]; handler: Handler; postPaths: string[]; postHandler: Handler } = {
    paths: [],
    handler: async () => undefined,
    postPaths: [],
    postHandler: async () => undefined,
  };
  const app = {
    get(path: string | string[], handler: Handler) {
      fake.paths.push(...(Array.isArray(path) ? path : [path]));
      fake.handler = handler;
    },
    post(path: string | string[], handler: Handler) {
      fake.postPaths.push(...(Array.isArray(path) ? path : [path]));
      fake.postHandler = handler;
    },
  };
  registerFreepiCliTokenRoutes(app as never, {
    resolveUser: async (req) => (req.headers.authorization === "Bearer good" ? { userId: 42 } : null),
    getPool: async () => [],
    save: (async (input: SaveCall) => {
      calls.push(input);
      if (typeof options.saveResult === "function") return options.saveResult();
      return (
        options.saveResult ?? { ok: true as const, slot: 2, fingerprint: "e2632c", duplicate: false }
      );
    }) as never,
    audit: (async (row: AuditCall) => {
      audits.push(row);
      if (options.auditThrows) throw new Error("audit down");
    }) as never,
  });
  return { fake, calls, audits };
}

const bodyRequest = (authorization: string | undefined, body: unknown) =>
  ({ headers: authorization ? { authorization } : {}, body }) as unknown as Request;

describe("POST /api/cli/freepi/tokens", () => {
  it("answers both spellings, with and without /api", () => {
    expect(saveApp().fake.postPaths).toEqual(["/freepi/tokens", "/api/cli/freepi/tokens"]);
  });

  it("saves a valid token and answers only the slot and the six-character tail", async () => {
    const { fake, calls, audits } = saveApp();
    const { res, state } = fakeRes();
    await fake.postHandler(bodyRequest("Bearer good", { token: "eyJ-a-real-length-token", label: "main" }), res);
    expect(state.status).toBe(200);
    expect(state.body).toEqual({ slot: 2, fingerprint: "e2632c", duplicate: false });
    expect(JSON.stringify(state.body)).not.toContain("eyJ-a-real-length-token");
    expect(state.headers["Cache-Control"]).toContain("no-store");
    expect(calls).toEqual([{ token: "eyJ-a-real-length-token", label: "main", userId: 42 }]);
    expect(audits[0]?.action).toBe("provider.freepi.token_autosaved");
    expect(JSON.stringify(audits[0]?.metadata)).not.toContain("eyJ-a-real-length-token");
  });

  it("refuses a request with no valid qronos key and saves nothing", async () => {
    const { fake, calls } = saveApp();
    const { res, state } = fakeRes();
    await fake.postHandler(bodyRequest(undefined, { token: "eyJ-a-real-length-token" }), res);
    expect(state.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("refuses a short token before doing any work", async () => {
    const { fake, calls } = saveApp();
    const { res, state } = fakeRes();
    await fake.postHandler(bodyRequest("Bearer good", { token: "short" }), res);
    expect(state.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("a token free-pi refuses is a 400 with the server's own sentence", async () => {
    const { fake, calls } = saveApp({
      saveResult: async () => {
        throw new Error("free-pi refused this token. It may be expired or copied incorrectly.");
      },
    });
    const { res, state } = fakeRes();
    await fake.postHandler(bodyRequest("Bearer good", { token: "eyJ-a-real-length-token" }), res);
    expect(state.status).toBe(400);
    expect(state.body).toEqual({ error: "free-pi refused this token. It may be expired or copied incorrectly." });
    expect(calls).toHaveLength(1);
  });

  it("a database failure is 503, never 401", async () => {
    const { fake } = saveApp({
      saveResult: async () => {
        throw new Error("Qronos AI database is unavailable");
      },
    });
    const { res, state } = fakeRes();
    await fake.postHandler(bodyRequest("Bearer good", { token: "eyJ-a-real-length-token" }), res);
    expect(state.status).toBe(503);
  });

  it("a full pool is a 409 with one sentence", async () => {
    const { fake, audits } = saveApp({
      saveResult: { ok: false, reason: "full", message: FREEPI_POOL_FULL_MESSAGE },
    });
    const { res, state } = fakeRes();
    await fake.postHandler(bodyRequest("Bearer good", { token: "eyJ-a-real-length-token" }), res);
    expect(state.status).toBe(409);
    expect(state.body).toEqual({ error: FREEPI_POOL_FULL_MESSAGE });
    expect(audits).toEqual([]);
  });

  it("a duplicate answers the slot that already holds it and is not an error", async () => {
    const { fake } = saveApp({
      saveResult: { ok: true, slot: 0, fingerprint: "e2632c", duplicate: true },
    });
    const { res, state } = fakeRes();
    await fake.postHandler(bodyRequest("Bearer good", { token: "eyJ-a-real-length-token" }), res);
    expect(state.status).toBe(200);
    expect(state.body).toEqual({ slot: 0, fingerprint: "e2632c", duplicate: true });
  });

  it("an audit failure never fails a save that already happened", async () => {
    const { fake } = saveApp({ auditThrows: true });
    const { res, state } = fakeRes();
    await fake.postHandler(bodyRequest("Bearer good", { token: "eyJ-a-real-length-token" }), res);
    expect(state.status).toBe(200);
  });

  it("writes nothing to the console", async () => {
    const spies = [vi.spyOn(console, "log"), vi.spyOn(console, "info"), vi.spyOn(console, "error")];
    const { fake } = saveApp();
    const { res } = fakeRes();
    await fake.postHandler(bodyRequest("Bearer good", { token: "eyJ-a-real-length-token" }), res);
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});
