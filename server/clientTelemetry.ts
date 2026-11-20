/**
 * Client telemetry for the admin panel.
 *
 * Kept in its own module so the very large db.ts stays readable. The queries
 * answer three questions per client kind ("cli" = Qronos CLI, "code" = Qronos
 * Code extension):
 *
 *   1. who is active right now            -> client_sessions.lastSeen
 *   2. what are they doing on the gateway -> usage_events (managed traffic)
 *   3. which BYOK provider do they use    -> client_byok_configs
 *
 * BYOK traffic never reaches this server, so (1) and (3) can only come from the
 * client heartbeat; (2) covers the managed path.
 */
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, getRecentLiveRequests } from "./db";
import {
  clientByokConfigs,
  clientSessions,
  usageEvents,
  users,
} from "../drizzle/schema";

export type ClientKind = "cli" | "code";
export type ClientMode = "managed" | "byok" | "mixed";

const KINDS: ClientKind[] = ["cli", "code"];

export function isClientKind(value: unknown): value is ClientKind {
  return value === "cli" || value === "code";
}

function num(value: unknown): number {
  return Number(value ?? 0) || 0;
}

function cutoffOf(minutes: number): Date {
  return new Date(Date.now() - Math.max(1, Math.min(minutes, 60 * 24 * 90)) * 60_000);
}

export interface ClientReportByok {
  providerId: string;
  baseUrl?: string;
  modelId?: string;
  keyMasked?: string;
  keyFingerprint?: string;
  source?: string;
}

export interface ClientReport {
  client: ClientKind;
  device: string;
  version?: string;
  os?: string;
  arch?: string;
  editorVersion?: string;
  mode?: ClientMode;
  modelId?: string;
  provider?: string;
  workspaces?: number;
  byok?: ClientReportByok[];
}

/** Store one heartbeat. A row per user + machine is updated in place. */
export async function upsertClientReport(userId: number, report: ClientReport): Promise<void> {
  const db = await getDb();
  if (!db || !isClientKind(report.client)) return;
  const now = new Date();
  const clamp = (value: string | undefined, max: number) => (value ? value.slice(0, max) : undefined);

  await db
    .insert(clientSessions)
    .values({
      userId,
      device: clamp(report.device, 64) ?? "unknown",
      client: report.client,
      version: clamp(report.version, 32),
      os: clamp(report.os, 16),
      arch: clamp(report.arch, 16),
      editorVersion: clamp(report.editorVersion, 32),
      mode: clamp(report.mode, 8),
      modelId: clamp(report.modelId, 128),
      provider: clamp(report.provider, 64),
      workspaces: typeof report.workspaces === "number" ? report.workspaces : undefined,
      lastSeen: now,
    })
    .onDuplicateKeyUpdate({
      set: {
        client: report.client,
        version: clamp(report.version, 32),
        os: clamp(report.os, 16),
        arch: clamp(report.arch, 16),
        editorVersion: clamp(report.editorVersion, 32),
        mode: clamp(report.mode, 8),
        modelId: clamp(report.modelId, 128),
        provider: clamp(report.provider, 64),
        workspaces: typeof report.workspaces === "number" ? report.workspaces : undefined,
        lastSeen: now,
      },
    })
    .catch(err => console.warn("[clientReport] session upsert failed:", err));

  const entries = (report.byok ?? []).slice(0, 8);
  for (const entry of entries) {
    const providerId = clamp(entry.providerId, 64);
    if (!providerId) continue;
    await db
      .insert(clientByokConfigs)
      .values({
        userId,
        device: clamp(report.device, 64) ?? "unknown",
        client: report.client,
        providerId,
        baseUrl: clamp(entry.baseUrl, 512),
        modelId: clamp(entry.modelId, 128),
        keyMasked: clamp(entry.keyMasked, 32),
        keyFingerprint: clamp(entry.keyFingerprint, 64),
        source: clamp(entry.source, 16),
        enabled: true,
        lastSeen: now,
      })
      .onDuplicateKeyUpdate({
        set: {
          client: report.client,
          baseUrl: clamp(entry.baseUrl, 512),
          modelId: clamp(entry.modelId, 128),
          keyMasked: clamp(entry.keyMasked, 32),
          keyFingerprint: clamp(entry.keyFingerprint, 64),
          source: clamp(entry.source, 16),
          enabled: true,
          lastSeen: now,
        },
      })
      .catch(err => console.warn("[clientReport] byok upsert failed:", err));
  }
}

export interface ClientOverview {
  client: ClientKind;
  windowMinutes: number;
  activeNow: number;
  activeDevices: number;
  activeUsers: number;
  requests: number;
  tokens: number;
  errors: number;
  byokUsers: number;
}

export async function getClientOverview(client: ClientKind, windowMinutes = 15): Promise<ClientOverview> {
  const empty: ClientOverview = {
    client,
    windowMinutes,
    activeNow: 0,
    activeDevices: 0,
    activeUsers: 0,
    requests: 0,
    tokens: 0,
    errors: 0,
    byokUsers: 0,
  };
  const db = await getDb();
  if (!db) return empty;
  const cutoff = cutoffOf(windowMinutes);
  const nowCutoff = cutoffOf(15);

  const [presence] = await db
    .select({
      users: sql<number>`count(distinct ${clientSessions.userId})`,
      devices: sql<number>`count(*)`,
      online: sql<number>`count(distinct case when ${clientSessions.lastSeen} >= ${nowCutoff} then ${clientSessions.userId} end)`,
    })
    .from(clientSessions)
    .where(and(eq(clientSessions.client, client), gte(clientSessions.lastSeen, cutoff)));

  const [traffic] = await db
    .select({
      users: sql<number>`count(distinct ${usageEvents.userId})`,
      requests: sql<number>`count(*)`,
      tokens: sql<number>`coalesce(sum(${usageEvents.totalTokens}), 0)`,
      errors: sql<number>`coalesce(sum(case when ${usageEvents.status} <> 'success' then 1 else 0 end), 0)`,
    })
    .from(usageEvents)
    .where(and(eq(usageEvents.client, client), gte(usageEvents.createdAt, cutoff)));

  const [byok] = await db
    .select({ users: sql<number>`count(distinct ${clientByokConfigs.userId})` })
    .from(clientByokConfigs)
    .where(and(eq(clientByokConfigs.client, client), gte(clientByokConfigs.lastSeen, cutoff)));

  return {
    client,
    windowMinutes,
    activeNow: num(presence?.online),
    activeDevices: num(presence?.devices),
    activeUsers: Math.max(num(presence?.users), num(traffic?.users)),
    requests: num(traffic?.requests),
    tokens: num(traffic?.tokens),
    errors: num(traffic?.errors),
    byokUsers: num(byok?.users),
  };
}

export interface ClientUserRow {
  userId: number;
  name: string | null;
  email: string | null;
  tier: string | null;
  version: string | null;
  editorVersion: string | null;
  os: string | null;
  mode: string | null;
  modelId: string | null;
  provider: string | null;
  devices: number;
  lastSeen: string | null;
  requests: number;
  tokens: number;
  errors: number;
  byokProviders: string[];
}

export async function getClientUsers(
  client: ClientKind,
  windowMinutes = 1440,
  limit = 100,
): Promise<ClientUserRow[]> {
  const db = await getDb();
  if (!db) return [];
  const cutoff = cutoffOf(windowMinutes);
  const bounded = Math.max(1, Math.min(limit, 500));

  const presence = await db
    .select({
      userId: clientSessions.userId,
      version: sql<string | null>`max(${clientSessions.version})`,
      editorVersion: sql<string | null>`max(${clientSessions.editorVersion})`,
      os: sql<string | null>`max(${clientSessions.os})`,
      mode: sql<string | null>`max(${clientSessions.mode})`,
      modelId: sql<string | null>`max(${clientSessions.modelId})`,
      provider: sql<string | null>`max(${clientSessions.provider})`,
      devices: sql<number>`count(*)`,
      lastSeen: sql<Date | null>`max(${clientSessions.lastSeen})`,
    })
    .from(clientSessions)
    .where(and(eq(clientSessions.client, client), gte(clientSessions.lastSeen, cutoff)))
    .groupBy(clientSessions.userId)
    .orderBy(desc(sql`max(${clientSessions.lastSeen})`))
    .limit(bounded);

  const usage = await db
    .select({
      userId: usageEvents.userId,
      requests: sql<number>`count(*)`,
      tokens: sql<number>`coalesce(sum(${usageEvents.totalTokens}), 0)`,
      errors: sql<number>`coalesce(sum(case when ${usageEvents.status} <> 'success' then 1 else 0 end), 0)`,
      lastAt: sql<Date | null>`max(${usageEvents.createdAt})`,
    })
    .from(usageEvents)
    .where(and(eq(usageEvents.client, client), gte(usageEvents.createdAt, cutoff)))
    .groupBy(usageEvents.userId);

  const ids = new Set<number>();
  for (const row of presence) ids.add(row.userId);
  for (const row of usage) ids.add(row.userId);
  if (ids.size === 0) return [];
  const idList = Array.from(ids).slice(0, bounded);

  const [profiles, byokRows] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email, tier: users.tier })
      .from(users)
      .where(inArray(users.id, idList)),
    db
      .select({ userId: clientByokConfigs.userId, providerId: clientByokConfigs.providerId })
      .from(clientByokConfigs)
      .where(and(eq(clientByokConfigs.client, client), inArray(clientByokConfigs.userId, idList))),
  ]);

  const profileById = new Map(profiles.map(row => [row.id, row]));
  const usageById = new Map(usage.map(row => [row.userId, row]));
  const presenceById = new Map(presence.map(row => [row.userId, row]));
  const byokById = new Map<number, string[]>();
  for (const row of byokRows) {
    const list = byokById.get(row.userId) ?? [];
    if (!list.includes(row.providerId)) list.push(row.providerId);
    byokById.set(row.userId, list);
  }

  const latest = (a?: Date | null, b?: Date | null) => {
    if (!a) return b ?? null;
    if (!b) return a;
    return a > b ? a : b;
  };

  return idList
    .map(userId => {
      const p = presenceById.get(userId);
      const u = usageById.get(userId);
      const profile = profileById.get(userId);
      const seen = latest(p?.lastSeen ?? null, u?.lastAt ?? null);
      return {
        userId,
        name: profile?.name ?? null,
        email: profile?.email ?? null,
        tier: profile?.tier ?? null,
        version: p?.version ?? null,
        editorVersion: p?.editorVersion ?? null,
        os: p?.os ?? null,
        mode: p?.mode ?? (u ? "managed" : null),
        modelId: p?.modelId ?? null,
        provider: p?.provider ?? null,
        devices: num(p?.devices),
        lastSeen: seen ? new Date(seen).toISOString() : null,
        requests: num(u?.requests),
        tokens: num(u?.tokens),
        errors: num(u?.errors),
        byokProviders: byokById.get(userId) ?? [],
      };
    })
    .sort((a, b) => (b.lastSeen ?? "").localeCompare(a.lastSeen ?? ""));
}

export async function getClientModelMix(
  client: ClientKind,
  windowMinutes = 1440,
): Promise<Array<{ modelId: string; users: number; requests: number; tokens: number }>> {
  const db = await getDb();
  if (!db) return [];
  const cutoff = cutoffOf(windowMinutes);
  const rows = await db
    .select({
      modelId: usageEvents.modelId,
      users: sql<number>`count(distinct ${usageEvents.userId})`,
      requests: sql<number>`count(*)`,
      tokens: sql<number>`coalesce(sum(${usageEvents.totalTokens}), 0)`,
    })
    .from(usageEvents)
    .where(and(eq(usageEvents.client, client), gte(usageEvents.createdAt, cutoff)))
    .groupBy(usageEvents.modelId)
    .orderBy(desc(sql`count(*)`))
    .limit(25);
  return rows.map(row => ({
    modelId: row.modelId,
    users: num(row.users),
    requests: num(row.requests),
    tokens: num(row.tokens),
  }));
}

export interface ClientByokRow {
  id: number;
  userId: number;
  name: string | null;
  email: string | null;
  client: string;
  providerId: string;
  baseUrl: string | null;
  modelId: string | null;
  keyMasked: string | null;
  keyFingerprint: string | null;
  source: string | null;
  device: string;
  enabled: boolean;
  firstSeen: string | null;
  lastSeen: string | null;
}

export async function getClientByokConfigs(client?: ClientKind, limit = 200): Promise<ClientByokRow[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: clientByokConfigs.id,
      userId: clientByokConfigs.userId,
      name: users.name,
      email: users.email,
      client: clientByokConfigs.client,
      providerId: clientByokConfigs.providerId,
      baseUrl: clientByokConfigs.baseUrl,
      modelId: clientByokConfigs.modelId,
      keyMasked: clientByokConfigs.keyMasked,
      keyFingerprint: clientByokConfigs.keyFingerprint,
      source: clientByokConfigs.source,
      device: clientByokConfigs.device,
      enabled: clientByokConfigs.enabled,
      firstSeen: clientByokConfigs.firstSeen,
      lastSeen: clientByokConfigs.lastSeen,
    })
    .from(clientByokConfigs)
    .leftJoin(users, eq(clientByokConfigs.userId, users.id))
    .where(client ? eq(clientByokConfigs.client, client) : undefined)
    .orderBy(desc(clientByokConfigs.lastSeen))
    .limit(Math.max(1, Math.min(limit, 500)));

  return rows.map(row => ({
    ...row,
    firstSeen: row.firstSeen ? new Date(row.firstSeen).toISOString() : null,
    lastSeen: row.lastSeen ? new Date(row.lastSeen).toISOString() : null,
  }));
}

export async function getUserClientDetail(userId: number) {
  const db = await getDb();
  if (!db) return { sessions: [], byok: [], recent: [] };
  const sessions = await db
    .select()
    .from(clientSessions)
    .where(eq(clientSessions.userId, userId))
    .orderBy(desc(clientSessions.lastSeen))
    .limit(20);
  const byok = await db
    .select()
    .from(clientByokConfigs)
    .where(eq(clientByokConfigs.userId, userId))
    .orderBy(desc(clientByokConfigs.lastSeen))
    .limit(20);
  const recent = await getRecentLiveRequests(30, userId);
  return { sessions, byok, recent };
}

/** Drop heartbeat rows for machines that have not reported in `days` days. */
export async function pruneClientTelemetry(days = 90): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const cutoff = new Date(Date.now() - Math.max(1, days) * 86_400_000);
  const sessions = await db.delete(clientSessions).where(sql`${clientSessions.lastSeen} < ${cutoff}`);
  const byok = await db.delete(clientByokConfigs).where(sql`${clientByokConfigs.lastSeen} < ${cutoff}`);
  const count = Number((sessions as any)?.[0]?.affectedRows ?? 0) + Number((byok as any)?.[0]?.affectedRows ?? 0);
  return count;
}

export const CLIENT_KINDS = KINDS;
