/**
 * Client heartbeat for the admin panel.
 *
 * POST /api/client/report
 *   Auth: "Authorization: Bearer <session token>" (GitHub device login) or
 *         "x-api-key: <Qronos key>" / bearer key.
 *
 * Qronos CLI and the Qronos Code extension call this on start, on config change
 * and every few minutes while a session is alive. It answers two questions the
 * gateway cannot answer on its own:
 *
 *   - which client is online right now (terminal vs editor)
 *   - which BYOK provider that user configured locally
 *
 * The API key of a BYOK provider never leaves the user's machine. The client
 * sends a masked form (first two + last four) and a sha256 fingerprint instead,
 * which is enough for support and useless if this table leaks.
 */
import type { Express, Request, Response } from "express";
import { findActiveApiKey } from "./db";
import { isClientKind, upsertClientReport, type ClientReport, type ClientReportByok } from "./clientTelemetry";
import { sdk } from "./_core/sdk";

const MAX_BODY_KEYS = 30;
const MAX_BYOK = 8;

function str(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function headerValue(req: Request, name: string): string | undefined {
  const raw = req.headers[name];
  return Array.isArray(raw) ? raw[0] : raw;
}

function bearerToken(req: Request): string | undefined {
  const header = headerValue(req, "authorization");
  if (!header) return undefined;
  const match = /^bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim();
}

/** Accepts a Qronos API key or a signed-in session token. */
async function resolveReporter(req: Request): Promise<number | null> {
  const apiKey = headerValue(req, "x-api-key") ?? bearerToken(req);
  if (apiKey) {
    const key = await findActiveApiKey(apiKey).catch(() => null);
    if (key?.userId) return key.userId;
  }
  const user = await sdk.authenticateRequest(req).catch(() => null);
  if (user?.id) return user.id;
  return null;
}

function sanitizeByok(input: unknown): ClientReportByok[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, MAX_BYOK).flatMap(entry => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Record<string, unknown>;
    const providerId = str(raw.providerId, 64);
    if (!providerId) return [];
    // The masked key is what the user typed first two and last four of; the
    // fingerprint is a hash. Both are checked so a raw key can never be stored
    // by accident.
    const keyMasked = str(raw.keyMasked, 32);
    const safeMasked = keyMasked && keyMasked.length <= 16 ? keyMasked : undefined;
    const fingerprint = str(raw.keyFingerprint, 64);
    return [
      {
        providerId,
        baseUrl: str(raw.baseUrl, 512),
        modelId: str(raw.modelId, 128),
        keyMasked: safeMasked,
        keyFingerprint: fingerprint && /^[a-f0-9]{8,64}$/i.test(fingerprint) ? fingerprint : undefined,
        source: str(raw.source, 16),
      },
    ];
  });
}

function sanitizeReport(body: unknown): ClientReport | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  if (Object.keys(raw).length > MAX_BODY_KEYS) return null;
  if (!isClientKind(raw.client)) return null;
  const device = str(raw.device, 64);
  if (!device) return null;
  const mode = raw.mode === "byok" || raw.mode === "mixed" || raw.mode === "managed" ? raw.mode : undefined;
  return {
    client: raw.client,
    device,
    version: str(raw.version, 32),
    os: str(raw.os, 16),
    arch: str(raw.arch, 16),
    editorVersion: str(raw.editorVersion, 32),
    mode,
    modelId: str(raw.modelId, 128),
    provider: str(raw.provider, 64),
    workspaces: typeof raw.workspaces === "number" ? Math.max(0, Math.min(raw.workspaces, 999)) : undefined,
    byok: sanitizeByok(raw.byok),
  };
}

export function registerClientReportRoutes(app: Express) {
  app.post("/api/client/report", async (req: Request, res: Response) => {
    const userId = await resolveReporter(req);
    if (!userId) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    const report = sanitizeReport(req.body);
    if (!report) {
      res.status(400).json({ ok: false, error: "invalid_report" });
      return;
    }
    try {
      await upsertClientReport(userId, report);
      // A tiny body keeps the heartbeat cheap on a metered connection.
      res.status(200).json({ ok: true, next: 300 });
    } catch (error) {
      console.warn("[clientReport] failed:", error);
      res.status(200).json({ ok: false });
    }
  });
}
