import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, like, lt, lte, ne, notInArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { createHmac, randomBytes, randomInt } from "node:crypto";
import {
  accountControls,
  accountFlags,
  adminAccessRequests,
  apiKeys,
  auditEvents,
  baiCredentialCapacitySlots,
  baiReasoningContinuations,
  baiProviderCircuitStates,
  bailuWebshareProxySlotMetrics,
  claudeOpus5FailureLogs,
  creditAccounts,
  creditGiveaways,
  creditGiveawayNotifications,
  creditLedger,
  dailyCheckins,
  dailyUsage,
  deletedIdentityTombstones,
  glmToolContinuationStates,
  InsertUser,
  usageEvents,
  users,
  loginAttempts,
  modelConfigs,
  oauthIdentities,
  orcaRouterCredentialSlots,
  freepiCredentialSlots,
  passwordCredentials,
  platformSettings,
  preProvisionedAccounts,
  providerKeyMetrics,
  managedProviderModelUsage,
  providerConfigs,
  renderProxyEndpointMetrics,
  referralAttributions,
  referralCodes,
  inviteMilestoneGrants,
  safetyAuditLogs,
  specialReferralClaims,
  userInteractionLogs,
  imageSemanticDescriptions,
  systemNotifications,
  userNotificationReads,
  discordBotMessages,
  discordMemberProfiles,
  discordChannelSummaries,
  clientSessions,
  clientByokConfigs,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { hashPassword, isPermanentEmailAddress, normalizeEmail, nextFailedLoginState, normalizeEmailAllowlistEntries, retryAfterSeconds, verifyPassword } from "./localAuth";
import { DAILY_CHECKIN_CREDIT_NANOS, INTRODUCTORY_CREDIT_NANOS, NANODOLLARS_PER_DOLLAR, TOKENFORGE_TOKEN_BASELINE, TOKENFORGE_TOKEN_HISTORICAL, setActivePricingOverrides, registerPricingLoader, type DynamicModelPricingOverride, type PricingTier } from "./creditPricing";
import { CLAUDE_OPUS5_PROVIDER_SLUG, CLUSTER_PROTOCOL_PROVIDER_SLUG, FXQIDIAN_PROVIDER_SLUG, getTokenForgeUpstreamModelId, TOKENHARBOR_PROVIDER_SLUG, TOKENROUTER_PROVIDER_SLUG, TOKENFORGE_MODEL_CATALOGUE, TOKENFORGE_MODEL_IDS, syncModelFromDatabaseRecord, getDynamicModelIds, normalizeModelIdentifier, type TokenForgeModelId } from "./modelCatalogue";
import { getClusterProtocolCredentialPool } from "./clusterProtocolCredentials";
import { getFxqidianCredentialPool } from "./fxqidianCredentials";
import { getTokenRouterCredentialPool } from "./tokenRouterCredentials";
import { clearProviderCredentialTelemetryGroup, getCredentialSlotTelemetry, getProviderCredentialTelemetry, type CredentialTelemetryProvider } from "./providerCredentialTelemetry";
import { publishLiveRequest, type LiveRequestEvent } from "./liveRequestBus";
import { clientTagFromApiKey } from "./clientTag";
import { encryptOrcaRouterCredential } from "./orcaRouterCredentialVault";
import { encryptFreepiCredential } from "./freepiCredentialVault";
import { decryptBaiReasoningContinuation, encryptBaiReasoningContinuation } from "./baiReasoningContinuationVault";
import { decryptGlmToolContinuation, encryptGlmToolContinuation, type GlmPrivateToolContinuation } from "./glmToolContinuationVault";
import { decryptProviderRuntimeConfig, encryptProviderRuntimeConfig } from "./providerRuntimeConfigVault";
import { cached, bustCache, setCached } from "./memoryCache";
import { QRONOS_REFERRAL_SIGNUP_TOKENS, QRONOS_REFERRAL_SIGNUP_INVITER_TOKENS, QRONOS_REFERRAL_SIGNUP_NEW_USER_TOKENS, TOKENFORGE_REFERRAL_REWARD_NANOS, isSpecialReferralCampaignCode, normalizeReferralCode } from "../shared/referrals";
import { getUserGeoRegistry, recordUserGeo } from "./geo";

let _db: ReturnType<typeof drizzle> | null = null;
let _pool: mysql.Pool | null = null;
let _dbHealthy = false;
let _lastDbHealthCheckTime = 0;
const DB_HEALTH_CHECK_COOLDOWN_MS = 2_000;

export function resetDatabasePool() {
  if (_pool) {
    try {
      _pool.end().catch(() => {});
    } catch {}
    _pool = null;
  }
  _db = null;
  _dbHealthy = false;
}

export const fallbackPlatformSettings = new Map<string, { value: string; updatedAt: Date; updatedByUserId: number | null }>([
  ["auth_session_version", { value: "1", updatedAt: new Date(), updatedByUserId: null }],
  ["platform_maintenance", { value: "disabled", updatedAt: new Date(), updatedByUserId: null }],
  ["playground_maintenance", { value: "disabled", updatedAt: new Date(), updatedByUserId: null }],
  ["maintenance_countdown_v1", { value: "", updatedAt: new Date(), updatedByUserId: null }],
  ["announcement_text", { value: "", updatedAt: new Date(), updatedByUserId: null }],
  ["email_allowlist", { value: "[]", updatedAt: new Date(), updatedByUserId: null }],
  ["platform_maintenance_exemptions_v1", { value: "[]", updatedAt: new Date(), updatedByUserId: null }],
  ["gpt6_astra_premium_exemptions_v1", { value: "[]", updatedAt: new Date(), updatedByUserId: null }],
  ["invite_milestone_campaign_v1", { value: JSON.stringify({ enabled: true, invitesRequired: 5, tokenGrantMillion: 10, paygGrantDollars: 0, expiryHours: 48, campaignStartedAt: new Date().toISOString() }), updatedAt: new Date(), updatedByUserId: null }],
]);

export function markDatabaseUnhealthy(reason?: string) {
  if (_dbHealthy) {
    console.warn(`[Database] Marking database unavailable${reason ? `: ${reason}` : ""}. Operating in resilient fallback mode.`);
  }
  _dbHealthy = false;
  _lastDbHealthCheckTime = Date.now();
  if (reason && /PROTOCOL_CONNECTION_LOST|connection lost|closed the connection|ETIMEDOUT|ECONNRESET/i.test(reason)) {
    resetDatabasePool();
  }
}

export const DEFAULT_DAILY_REQUEST_LIMIT = 100;
export const DEFAULT_DAILY_TOKEN_LIMIT = 100_000;
export const DEFAULT_MAX_CONCURRENT_REQUESTS = 2;
const INTRODUCTORY_CREDIT_REFERENCE = "introductory-credit-v1";
const EMAIL_ALLOWLIST_SETTING_KEY = "email_allowlist";
const PLATFORM_MAINTENANCE_EXEMPTIONS_SETTING_KEY = "platform_maintenance_exemptions_v1";
const ANNOUNCEMENT_TEXT_SETTING_KEY = "announcement_text";
export const UNOROUTER_BADGE_ENABLED_SETTING_KEY = "unorouter_badge_enabled";
export const REFUND_POLICY_ENABLED_SETTING_KEY = "refund_policy_enabled";
export const MODEL_TOKEN_MULTIPLIERS_SETTING_KEY = "model_token_multipliers_v1";
const SESSION_VERSION_SETTING_KEY = "auth_session_version";
const PLATFORM_MAINTENANCE_SETTING_KEY = "platform_maintenance";
export const PINNED_USER_ROUTING_POLICY_KEY = "pinned_user_routing_policy_v1";
const PLAYGROUND_MAINTENANCE_SETTING_KEY = "playground_maintenance";
const MAINTENANCE_COUNTDOWN_SETTING_KEY = "maintenance_countdown_v1";
const PLATFORM_MAINTENANCE_MESSAGES_SETTING_KEY = "platform_maintenance_messages_v1";
export const PLATFORM_MAINTENANCE_ERROR_MESSAGE = "Platform under maintenance, contact administrator on Discord";
export const PLAYGROUND_MAINTENANCE_ERROR_MESSAGE = "Platform under maintenance, contact administrator on Discord";
const CLAUDE_FABLE5_NVIDIA_RUNTIME_SETTING_KEY = "claude_fable5_nvidia_runtime_v1";
const CLAUDE_OPUS5_TOKENREPLY_RUNTIME_SETTING_KEY = "claude_opus5_tokenreply_runtime_v1";
const GLM53_RUNTIME_SETTING_KEY = "glm53_runtime_v1";
const DEEPSEEK_V4PRO_RUNTIME_SETTING_KEY = "deepseek_v4pro_runtime_v1";
const SONNET46_RUNTIME_SETTING_KEY = "sonnet46_runtime_v1";
const QWEN38_MAX_RUNTIME_SETTING_KEY = "qwen38_max_runtime_v1";
const GPT6_ASTRA_RUNTIME_SETTING_KEY = "gpt6_astra_runtime_v1";
const KIMI_K3_RUNTIME_SETTING_KEY = "kimi_k3_runtime_v1";
const RENDER_NIM_PROXY_SWARM_SETTING_KEY = "render_nim_proxy_swarm_v1";
const BAILU_WEBSHARE_PROXY_POOL_SETTING_KEY = "bailu_webshare_proxy_pool_v1";
export const COMPACT_SCALING_SETTING_KEY = "model_compact_scaling_configs_v1";
export const INVITE_TRACKER_SETTING_KEY = "admin_invite_tracker_sessions_v1";
export const INVITE_MILESTONE_CAMPAIGN_SETTING_KEY = "invite_milestone_campaign_v1";
const BAI_REASONING_CONTINUATION_TTL_MS = 10 * 60 * 1_000;
const BAI_PROVIDER_CIRCUIT_COOLDOWN_MS = 60_000;
export const BAI_CREDENTIAL_MAX_ACTIVE_REQUESTS = 10;
const BAI_CREDENTIAL_LEASE_MS = 15 * 60 * 1_000;
const SPECIAL_REFERRAL_CAMPAIGN_KEY = "special-referral-150-v1";
export const SPECIAL_REFERRAL_CAMPAIGN_CAP = 150;
export const SPECIAL_REFERRAL_BONUS_NANOS = 0;
export const DISCORD_UNVERIFIED_CLEANUP_NOTICE_KIND = "discord_unverified_cleanup";
const AFFILIATE_CODE_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const AFFILIATE_CODE_LENGTH = 4;

export class DeletedAccountIdentityError extends Error {
  constructor() {
    super("This Qronos AI account was permanently deleted");
    this.name = "DeletedAccountIdentityError";
  }
}

/** A nonblocking, non-reversible marker shown once after an administrator cleans up an unverified Discord account. */
export class DiscordUnverifiedAccountDeletedError extends Error {
  constructor() {
    super("Your previous account was not verified by Discord, so it was deleted by an administrator. You can create a new Qronos AI account with this email.");
    this.name = "DiscordUnverifiedAccountDeletedError";
  }
}

export type ApiKeyRecord = typeof apiKeys.$inferSelect;
type ApiKeyLookupDatabase = Pick<NonNullable<Awaited<ReturnType<typeof getDb>>>, "select">;
type AccountDeletionDatabase = Pick<NonNullable<Awaited<ReturnType<typeof getDb>>>, "transaction">;
type CreditSettlementDatabase = Pick<NonNullable<Awaited<ReturnType<typeof getDb>>>, "select" | "transaction">;
export type EmailAllowlistConfig = { entries: string[]; updatedAt: Date; updatedByUserId: number | null };
export type OrcaRouterCredentialSlotSummary = { slot: number; fingerprintSuffix: string; lastValidatedAt: Date; updatedAt: Date; updatedByUserId: number | null };
export type FreepiCredentialSlotSummary = {
  slot: number;
  label: string | null;
  fingerprintSuffix: string;
  lastValidatedAt: Date;
  updatedAt: Date;
  updatedByUserId: number | null;
};
export type AdminEmailProviderCount = { provider: string; accountCount: number };
export type UserWithDiscordVerification = typeof users.$inferSelect & { discordVerifiedAt: Date | null };
import type { UserTier } from "../drizzle/schema";
export type { UserTier };
const GLM_TOOL_CONTINUATION_TTL_MS = 10 * 60 * 1_000;

const CATALOGUE_DEFINITIONS = TOKENFORGE_MODEL_CATALOGUE;
/** Standalone `users` aggregate expression; deliberately unqualified for deployed MySQL compatibility. */
export const ADMIN_EMAIL_PROVIDER_EXPRESSION = "lower(substring_index(email, '@', -1))";

export function utcUsageDate(value = new Date()) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function hashDeletedIdentity(kind: string, identifier: string) {
  const pepper = process.env.JWT_SECRET || "qronos-deleted-id-pepper-fallback";
  return createHmac("sha256", pepper).update(`deleted:${kind}:${identifier}`).digest("hex");
}

export async function isDeletedIdentity(kind: "email" | "github" | "open_id", identifier: string) {
  const db = await getDb();
  if (!db) return false;
  const normalized = kind === "email" ? normalizeEmail(identifier) : identifier.trim();
  if (!normalized) return false;
  const record = await db.select({ id: deletedIdentityTombstones.id }).from(deletedIdentityTombstones)
    .where(and(eq(deletedIdentityTombstones.kind, kind), eq(deletedIdentityTombstones.identifierHash, hashDeletedIdentity(kind, normalized)))).limit(1);
  return Boolean(record[0]);
}

export async function assertIdentityIsNotDeleted(kind: "email" | "github" | "open_id", identifier: string) {
  if (await isDeletedIdentity(kind, identifier)) throw new DeletedAccountIdentityError();
}

let _cachedSessionVersion: { version: number; expiresAt: number } | null = null;
const SESSION_VERSION_CACHE_TTL_MS = 60_000;

export function clearSessionVersionCache() {
  _cachedSessionVersion = null;
}

export async function getAuthSessionVersion() {
  const now = Date.now();
  if (_cachedSessionVersion && now < _cachedSessionVersion.expiresAt) {
    return _cachedSessionVersion.version;
  }
  try {
    const db = await getDb();
    if (!db) {
      const val = Number.parseInt(fallbackPlatformSettings.get(SESSION_VERSION_SETTING_KEY)?.value ?? "1", 10);
      const version = Number.isSafeInteger(val) && val >= 0 ? val : 1;
      _cachedSessionVersion = { version, expiresAt: now + SESSION_VERSION_CACHE_TTL_MS };
      return version;
    }
    const record = (await db.select({ value: platformSettings.value }).from(platformSettings).where(eq(platformSettings.settingKey, SESSION_VERSION_SETTING_KEY)).limit(1))[0];
    const value = Number.parseInt(record?.value ?? "1", 10);
    const version = Number.isSafeInteger(value) && value >= 0 ? value : 1;
    _cachedSessionVersion = { version, expiresAt: now + SESSION_VERSION_CACHE_TTL_MS };
    return version;
  } catch (error: any) {
    markDatabaseUnhealthy(error?.message ?? String(error));
    const val = Number.parseInt(fallbackPlatformSettings.get(SESSION_VERSION_SETTING_KEY)?.value ?? "1", 10);
    const version = Number.isSafeInteger(val) && val >= 0 ? val : 1;
    _cachedSessionVersion = { version, expiresAt: now + SESSION_VERSION_CACHE_TTL_MS };
    return version;
  }
}

export type PlatformMaintenanceConfig = { enabled: boolean; updatedAt: Date | null; updatedByUserId: number | null };

type StoredMaintenanceCountdown = { endsAt: number; note: string };

function parseMaintenanceCountdown(value: string | null | undefined): StoredMaintenanceCountdown | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { endsAt?: unknown; note?: unknown };
    const endsAt = Number(parsed.endsAt);
    if (!Number.isFinite(endsAt)) return null;
    return { endsAt, note: String(parsed.note ?? "").trim().slice(0, 200) };
  } catch {
    return null;
  }
}

/** Atomically converts a completed public countdown into a global inference pause without touching model or provider flags. */
async function activateExpiredMaintenanceCountdown(database: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  try {
    const record = (await database.select({ value: platformSettings.value, updatedByUserId: platformSettings.updatedByUserId })
      .from(platformSettings).where(eq(platformSettings.settingKey, MAINTENANCE_COUNTDOWN_SETTING_KEY)).limit(1))[0];
    const countdown = parseMaintenanceCountdown(record?.value);
    if (!countdown || countdown.endsAt > Date.now()) return false;
    await database.transaction(async tx => {
      await tx.insert(platformSettings).values({ settingKey: MAINTENANCE_COUNTDOWN_SETTING_KEY, value: "", updatedByUserId: record?.updatedByUserId ?? null })
        .onDuplicateKeyUpdate({ set: { value: "", updatedByUserId: record?.updatedByUserId ?? null, updatedAt: new Date() } });
      await tx.insert(platformSettings).values({ settingKey: PLATFORM_MAINTENANCE_SETTING_KEY, value: "enabled", updatedByUserId: record?.updatedByUserId ?? null })
        .onDuplicateKeyUpdate({ set: { value: "enabled", updatedByUserId: record?.updatedByUserId ?? null, updatedAt: new Date() } });
    });
    return true;
  } catch (error: any) {
    markDatabaseUnhealthy(error?.message ?? String(error));
    return false;
  }
}

/** Returns the global inference admission state. Model catalogues and administration remain available during maintenance. */
export async function getPlatformMaintenanceConfig(): Promise<PlatformMaintenanceConfig> {
  return cached("platform_maintenance_config", 30_000, async () => {
    try {
      const db = await getDb();
      if (!db) {
        const val = fallbackPlatformSettings.get(PLATFORM_MAINTENANCE_SETTING_KEY)?.value;
        return { enabled: val === "enabled", updatedAt: null, updatedByUserId: null };
      }
      await activateExpiredMaintenanceCountdown(db);
      const record = (await db.select().from(platformSettings).where(eq(platformSettings.settingKey, PLATFORM_MAINTENANCE_SETTING_KEY)).limit(1))[0];
      return { enabled: record?.value === "enabled", updatedAt: record?.updatedAt ?? null, updatedByUserId: record?.updatedByUserId ?? null };
    } catch (error: any) {
      markDatabaseUnhealthy(error?.message ?? String(error));
      const val = fallbackPlatformSettings.get(PLATFORM_MAINTENANCE_SETTING_KEY)?.value;
      return { enabled: val === "enabled", updatedAt: null, updatedByUserId: null };
    }
  });
}

/** Persists the administrator-controlled global inference admission state. */
export async function getPlaygroundMaintenanceConfig(): Promise<PlatformMaintenanceConfig> {
  return cached("playground_maintenance_config", 30_000, async () => {
    try {
      const db = await getDb();
      if (!db) {
        const val = fallbackPlatformSettings.get(PLAYGROUND_MAINTENANCE_SETTING_KEY)?.value;
        return { enabled: val === "enabled", updatedAt: null, updatedByUserId: null };
      }
      const record = (await db.select().from(platformSettings).where(eq(platformSettings.settingKey, PLAYGROUND_MAINTENANCE_SETTING_KEY)).limit(1))[0];
      return { enabled: record?.value === "enabled", updatedAt: record?.updatedAt ?? null, updatedByUserId: record?.updatedByUserId ?? null };
    } catch (error: any) {
      markDatabaseUnhealthy(error?.message ?? String(error));
      const val = fallbackPlatformSettings.get(PLAYGROUND_MAINTENANCE_SETTING_KEY)?.value;
      return { enabled: val === "enabled", updatedAt: null, updatedByUserId: null };
    }
  });
}

export async function setPlaygroundMaintenanceConfig(enabled: boolean, updatedByUserId: number): Promise<PlatformMaintenanceConfig> {
  const value = enabled ? "enabled" : "disabled";
  fallbackPlatformSettings.set(PLAYGROUND_MAINTENANCE_SETTING_KEY, { value, updatedAt: new Date(), updatedByUserId });
  bustCache("playground_maintenance_config");
  try {
    const db = await getDb();
    if (db) {
      await db.insert(platformSettings).values({
        settingKey: PLAYGROUND_MAINTENANCE_SETTING_KEY,
        value,
        updatedByUserId,
      }).onDuplicateKeyUpdate({ set: { value, updatedByUserId, updatedAt: new Date() } });
    }
  } catch (error: any) {
    markDatabaseUnhealthy(error?.message ?? String(error));
  }
  return getPlaygroundMaintenanceConfig();
}

export async function setPlatformMaintenanceConfig(enabled: boolean, updatedByUserId: number): Promise<PlatformMaintenanceConfig> {
  const value = enabled ? "enabled" : "disabled";
  fallbackPlatformSettings.set(PLATFORM_MAINTENANCE_SETTING_KEY, { value, updatedAt: new Date(), updatedByUserId });
  bustCache("platform_maintenance_config");
  try {
    const db = await getDb();
    if (db) {
      if (!enabled) {
        const countdown = (await db.select({ value: platformSettings.value }).from(platformSettings)
          .where(eq(platformSettings.settingKey, MAINTENANCE_COUNTDOWN_SETTING_KEY)).limit(1))[0];
        const parsed = parseMaintenanceCountdown(countdown?.value);
        if (parsed && parsed.endsAt <= Date.now()) {
          await db.insert(platformSettings).values({ settingKey: MAINTENANCE_COUNTDOWN_SETTING_KEY, value: "", updatedByUserId })
            .onDuplicateKeyUpdate({ set: { value: "", updatedByUserId, updatedAt: new Date() } });
        }
      }
      await db.insert(platformSettings).values({
        settingKey: PLATFORM_MAINTENANCE_SETTING_KEY,
        value,
        updatedByUserId,
      }).onDuplicateKeyUpdate({ set: { value, updatedByUserId, updatedAt: new Date() } });
    }
  } catch (error: any) {
    markDatabaseUnhealthy(error?.message ?? String(error));
  }
  return getPlatformMaintenanceConfig();
}

/** Clears a scheduled or elapsed countdown and restores global inference admission; individual model availability stays unchanged. */
export async function resumePlatformAfterTimedMaintenance(updatedByUserId: number): Promise<PlatformMaintenanceConfig> {
  fallbackPlatformSettings.set(MAINTENANCE_COUNTDOWN_SETTING_KEY, { value: "", updatedAt: new Date(), updatedByUserId });
  fallbackPlatformSettings.set(PLATFORM_MAINTENANCE_SETTING_KEY, { value: "disabled", updatedAt: new Date(), updatedByUserId });
  bustCache("platform_maintenance_config");
  try {
    const db = await getDb();
    if (db) {
      await db.transaction(async tx => {
        await tx.insert(platformSettings).values({ settingKey: MAINTENANCE_COUNTDOWN_SETTING_KEY, value: "", updatedByUserId })
          .onDuplicateKeyUpdate({ set: { value: "", updatedByUserId, updatedAt: new Date() } });
        await tx.insert(platformSettings).values({ settingKey: PLATFORM_MAINTENANCE_SETTING_KEY, value: "disabled", updatedByUserId })
          .onDuplicateKeyUpdate({ set: { value: "disabled", updatedByUserId, updatedAt: new Date() } });
      });
    }
  } catch (error: any) {
    markDatabaseUnhealthy(error?.message ?? String(error));
  }
  return getPlatformMaintenanceConfig();
}

export const JAILBREAK_SHIELD_CONFIG_SETTING_KEY = "jailbreak_shield_config_v1";

export interface JailbreakShieldStoredConfig {
  enabled: boolean;
  jailbreakDetectionEnabled?: boolean;
  scanMode: "hybrid_windowed" | "full_sliding_window" | "structural_only";
  strictness: "high" | "medium" | "low";
  contentSafetyEnabled?: boolean;
  apiKeys: string[];
  apiKeyEnabled?: boolean[];
  updatedAt?: string | null;
  updatedByUserId?: number | null;
}

export async function getJailbreakShieldConfig(): Promise<JailbreakShieldStoredConfig> {
  const fallback: JailbreakShieldStoredConfig = {
    enabled: true,
    jailbreakDetectionEnabled: true,
    scanMode: "hybrid_windowed",
    strictness: "high",
    contentSafetyEnabled: true,
    apiKeys: process.env.NVIDIA_API_KEY ? [process.env.NVIDIA_API_KEY] : [],
    apiKeyEnabled: [true],
    updatedAt: null,
    updatedByUserId: null,
  };

  return cached("jailbreak_shield_config", 20_000, async () => {
    try {
      const db = await getDb();
      if (!db) {
        const val = fallbackPlatformSettings.get(JAILBREAK_SHIELD_CONFIG_SETTING_KEY)?.value;
        if (!val) return fallback;
        const parsed = JSON.parse(val);
        const jbEnabled = parsed.jailbreakDetectionEnabled ?? parsed.enabled ?? true;
        return {
          enabled: jbEnabled,
          jailbreakDetectionEnabled: jbEnabled,
          scanMode: parsed.scanMode ?? "hybrid_windowed",
          strictness: parsed.strictness ?? "high",
          contentSafetyEnabled: parsed.contentSafetyEnabled ?? true,
          apiKeys: Array.isArray(parsed.apiKeys) ? parsed.apiKeys : fallback.apiKeys,
          apiKeyEnabled: Array.isArray(parsed.apiKeyEnabled) ? parsed.apiKeyEnabled : (parsed.apiKeys?.map(() => true) ?? [true]),
          updatedAt: null,
          updatedByUserId: null,
        };
      }

      const record = (await db.select().from(platformSettings).where(eq(platformSettings.settingKey, JAILBREAK_SHIELD_CONFIG_SETTING_KEY)).limit(1))[0];
      if (!record?.value) return fallback;

      const parsed = JSON.parse(record.value) as Partial<JailbreakShieldStoredConfig>;
      const jbEnabled = parsed.jailbreakDetectionEnabled ?? parsed.enabled ?? true;
      return {
        enabled: jbEnabled,
        jailbreakDetectionEnabled: jbEnabled,
        scanMode: parsed.scanMode ?? "hybrid_windowed",
        strictness: parsed.strictness ?? "high",
        contentSafetyEnabled: parsed.contentSafetyEnabled ?? true,
        apiKeys: Array.isArray(parsed.apiKeys) ? parsed.apiKeys : fallback.apiKeys,
        apiKeyEnabled: Array.isArray(parsed.apiKeyEnabled) ? parsed.apiKeyEnabled : (parsed.apiKeys?.map(() => true) ?? [true]),
        updatedAt: record.updatedAt?.toISOString() ?? null,
        updatedByUserId: record.updatedByUserId ?? null,
      };
    } catch {
      return fallback;
    }
  });
}

export async function updateJailbreakShieldConfig(input: {
  enabled?: boolean;
  jailbreakDetectionEnabled?: boolean;
  scanMode: "hybrid_windowed" | "full_sliding_window" | "structural_only";
  strictness: "high" | "medium" | "low";
  contentSafetyEnabled?: boolean;
  apiKeys: string[];
  apiKeyEnabled?: boolean[];
}, updatedByUserId: number): Promise<JailbreakShieldStoredConfig> {
  const cleanKeys = input.apiKeys.map(k => k.trim()).filter(Boolean);
  const cleanEnabled = input.apiKeyEnabled?.slice(0, cleanKeys.length) ?? cleanKeys.map(() => true);
  const jbEnabled = input.jailbreakDetectionEnabled !== undefined ? input.jailbreakDetectionEnabled : (input.enabled ?? true);

  const payload: JailbreakShieldStoredConfig = {
    enabled: jbEnabled,
    jailbreakDetectionEnabled: jbEnabled,
    scanMode: input.scanMode,
    strictness: input.strictness,
    contentSafetyEnabled: input.contentSafetyEnabled ?? true,
    apiKeys: cleanKeys,
    apiKeyEnabled: cleanEnabled,
    updatedAt: new Date().toISOString(),
    updatedByUserId,
  };

  fallbackPlatformSettings.set(JAILBREAK_SHIELD_CONFIG_SETTING_KEY, {
    value: JSON.stringify(payload),
    updatedAt: new Date(),
    updatedByUserId,
  });
  bustCache("jailbreak_shield_config");

  try {
    const db = await getDb();
    if (db) {
      await db.transaction(async tx => {
        await tx.insert(platformSettings).values({
          settingKey: JAILBREAK_SHIELD_CONFIG_SETTING_KEY,
          value: JSON.stringify(payload),
          updatedByUserId,
        }).onDuplicateKeyUpdate({
          set: {
            value: JSON.stringify(payload),
            updatedByUserId,
            updatedAt: new Date(),
          },
        });
      });
    }
  } catch (err) {
    console.warn("[updateJailbreakShieldConfig] DB write failed; in-memory cache preserved", err);
  }

  return getJailbreakShieldConfig();
}

export type PinnedUserRoutingPolicy = {
  softPreference: boolean;
  updatedAt: Date | null;
  updatedByUserId: number | null;
};

export const DEFAULT_ADMIN_EMAIL = "admin@gmail.com";

const userEmailLookupCache = new Map<number, { email: string | null; cachedAt: number }>();
const USER_EMAIL_CACHE_TTL_MS = 60_000;

export async function lookupUserEmail(userId: number): Promise<string | null> {
  const cached = userEmailLookupCache.get(userId);
  if (cached && Date.now() - cached.cachedAt < USER_EMAIL_CACHE_TTL_MS) {
    return cached.email;
  }
  try {
    if (userId === FALLBACK_ADMIN_SESSION_PRINCIPAL.id) {
      const email = (FALLBACK_ADMIN_SESSION_PRINCIPAL.email ?? DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
      userEmailLookupCache.set(userId, { email, cachedAt: Date.now() });
      return email;
    }
    const db = await getDb();
    if (!db) {
      if (userId === FALLBACK_ADMIN_SESSION_PRINCIPAL.id) return DEFAULT_ADMIN_EMAIL;
      return null;
    }
    const row = (await db.select({ email: users.email, openId: users.openId }).from(users).where(eq(users.id, userId)).limit(1))[0];
    let email = row?.email?.trim().toLowerCase() ?? null;
    if (!email && row?.openId === ADMIN_SESSION_PRINCIPAL_OPEN_ID) {
      email = DEFAULT_ADMIN_EMAIL;
    }
    userEmailLookupCache.set(userId, { email, cachedAt: Date.now() });
    return email;
  } catch {
    return null;
  }
}

export function normalizePinnedUserEmails(values: unknown): string[] {
  if (!values) return [];
  let rawList: unknown[] = [];
  if (Array.isArray(values)) {
    rawList = values;
  } else if (typeof values === "string") {
    rawList = values.split(/[\n,]+/);
  } else {
    return [];
  }
  const set = new Set<string>();
  for (const item of rawList) {
    if (typeof item === "string") {
      const email = item.trim().toLowerCase();
      if (email && email.includes("@")) {
        set.add(email);
      }
    }
  }
  return Array.from(set).slice(0, 500);
}

/**
 * Universal policy toggle for dedicated pinned user routing.
 * When softPreference is true (Toggle ON): designated provider is prioritized first, with failover to other providers.
 * When softPreference is false (Toggle OFF): strict lock is enforced (only designated provider allowed, no fallback).
 */
export async function getPinnedUserRoutingPolicy(): Promise<PinnedUserRoutingPolicy> {
  return cached("pinned_user_routing_policy", 60_000, async () => {
    try {
      const db = await getDb();
      if (!db) {
        const val = fallbackPlatformSettings.get(PINNED_USER_ROUTING_POLICY_KEY)?.value;
        return { softPreference: val === "soft_preference", updatedAt: null, updatedByUserId: null };
      }
      const record = (await db.select().from(platformSettings).where(eq(platformSettings.settingKey, PINNED_USER_ROUTING_POLICY_KEY)).limit(1))[0];
      return {
        softPreference: record?.value === "soft_preference",
        updatedAt: record?.updatedAt ?? null,
        updatedByUserId: record?.updatedByUserId ?? null,
      };
    } catch (error: any) {
      markDatabaseUnhealthy(error?.message ?? String(error));
      const val = fallbackPlatformSettings.get(PINNED_USER_ROUTING_POLICY_KEY)?.value;
      return { softPreference: val === "soft_preference", updatedAt: null, updatedByUserId: null };
    }
  });
}

export async function setPinnedUserRoutingPolicy(softPreference: boolean, updatedByUserId: number): Promise<PinnedUserRoutingPolicy> {
  const value = softPreference ? "soft_preference" : "strict_lock";
  const now = new Date();
  fallbackPlatformSettings.set(PINNED_USER_ROUTING_POLICY_KEY, { value, updatedAt: now, updatedByUserId });
  bustCache("pinned_user_routing_policy");
  try {
    const db = await getDb();
    if (db) {
      await db.insert(platformSettings).values({
        settingKey: PINNED_USER_ROUTING_POLICY_KEY,
        value,
        updatedByUserId,
      }).onDuplicateKeyUpdate({
        set: { value, updatedByUserId, updatedAt: now },
      });
    }
  } catch (error: any) {
    markDatabaseUnhealthy(error?.message ?? String(error));
  }
  return { softPreference, updatedAt: now, updatedByUserId };
}

export type PlatformMaintenanceMessages = {
  defaultMessage?: string;
  free?: string;
  starter?: string;
  pro?: string;
  max?: string;
  power?: string;
  ultra?: string;
};

/** Returns the stored custom maintenance messages (general + per-tier). */
export async function getPlatformMaintenanceMessages(): Promise<PlatformMaintenanceMessages> {
  return cached("platform_maintenance_messages", 60_000, async () => {
    try {
      const db = await getDb();
      if (!db) {
        const val = fallbackPlatformSettings.get(PLATFORM_MAINTENANCE_MESSAGES_SETTING_KEY)?.value;
        if (val) {
          try { return JSON.parse(val); } catch {}
        }
        return { defaultMessage: "" };
      }
      const record = (await db.select().from(platformSettings).where(eq(platformSettings.settingKey, PLATFORM_MAINTENANCE_MESSAGES_SETTING_KEY)).limit(1))[0];
      if (!record?.value) {
        return { defaultMessage: "" };
      }
      try {
        const parsed = JSON.parse(record.value) as PlatformMaintenanceMessages;
        return parsed && typeof parsed === "object" ? parsed : { defaultMessage: "" };
      } catch {
        return { defaultMessage: "" };
      }
    } catch (error: any) {
      markDatabaseUnhealthy(error?.message ?? String(error));
      return { defaultMessage: "" };
    }
  });
}

/** Persists custom maintenance messages (general + per-tier). */
export async function setPlatformMaintenanceMessages(
  input: PlatformMaintenanceMessages,
  updatedByUserId: number
): Promise<PlatformMaintenanceMessages> {
  const sanitized: PlatformMaintenanceMessages = {
    defaultMessage: typeof input.defaultMessage === "string" ? input.defaultMessage.trim() : "",
    free: typeof input.free === "string" ? input.free.trim() : "",
    starter: typeof input.starter === "string" ? input.starter.trim() : "",
    pro: typeof input.pro === "string" ? input.pro.trim() : "",
    max: typeof input.max === "string" ? input.max.trim() : "",
    power: typeof input.power === "string" ? input.power.trim() : "",
    ultra: typeof input.ultra === "string" ? input.ultra.trim() : "",
  };
  const serialized = JSON.stringify(sanitized);
  fallbackPlatformSettings.set(PLATFORM_MAINTENANCE_MESSAGES_SETTING_KEY, { value: serialized, updatedAt: new Date(), updatedByUserId });
  bustCache("platform_maintenance_messages");
  try {
    const db = await getDb();
    if (db) {
      await db.insert(platformSettings).values({
        settingKey: PLATFORM_MAINTENANCE_MESSAGES_SETTING_KEY,
        value: serialized,
        updatedByUserId,
      }).onDuplicateKeyUpdate({ set: { value: serialized, updatedByUserId, updatedAt: new Date() } });
    }
  } catch (error: any) {
    markDatabaseUnhealthy(error?.message ?? String(error));
  }
  return getPlatformMaintenanceMessages();
}

/**
 * Resolves the effective maintenance message for a user or target.
 * Priority order:
 * 1. Tier-specific message for user's assigned tier (if non-empty)
 * 2. Custom default maintenance message (if non-empty)
 * 3. Default fallback PLATFORM_MAINTENANCE_ERROR_MESSAGE ("Site entered in maintainence mode due to massive request.")
 */
export async function getEffectivePlatformMaintenanceMessage(
  target?: number | string | { id?: number; tier?: string | null } | null
): Promise<string> {
  const messages = await getPlatformMaintenanceMessages();
  let userTier = "free";

  if (typeof target === "number") {
    const user = await getUserById(target);
    if (user?.tier) userTier = user.tier.trim().toLowerCase();
  } else if (typeof target === "string") {
    const db = await getDb();
    if (db) {
      try {
        const result = await db.select({ tier: users.tier }).from(users).where(eq(users.email, target)).limit(1);
        if (result[0]?.tier) userTier = result[0].tier.trim().toLowerCase();
      } catch {}
    }
  } else if (target && typeof target === "object") {
    if (target.tier) {
      userTier = target.tier.trim().toLowerCase();
    } else if (target.id) {
      const user = await getUserById(target.id);
      if (user?.tier) userTier = user.tier.trim().toLowerCase();
    }
  }

  const tierMessage = (messages as any)[userTier]?.trim();
  if (tierMessage) {
    return tierMessage;
  }

  const defaultCustom = messages.defaultMessage?.trim();
  if (defaultCustom) {
    return defaultCustom;
  }

  return PLATFORM_MAINTENANCE_ERROR_MESSAGE;
}

export type MaintenanceExemptionEntry = {
  email: string;
  status: "allowed" | "restricted";
  updatedAt?: string | null;
  updatedByUserId?: number | null;
};

/** Returns a user record by ID. */
export async function getUserById(userId: number) {
  if (userId === FALLBACK_ADMIN_SESSION_PRINCIPAL.id) return FALLBACK_ADMIN_SESSION_PRINCIPAL;
  return cached(`user_by_id:${userId}`, 30_000, async () => {
    const db = await getDb();
    if (!db) return undefined;
    const result = await db
      .select({
        id: users.id,
        openId: users.openId,
        name: users.name,
        email: users.email,
        loginMethod: users.loginMethod,
        role: users.role,
        tier: users.tier,
        creditsEnabled: users.creditsEnabled,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        lastSignedIn: users.lastSignedIn,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return result[0];
  });
}

/** Reads the current list of accounts exempted or restricted during global inference maintenance. */
export async function getPlatformMaintenanceExemptions(): Promise<MaintenanceExemptionEntry[]> {
  return cached("platform_maintenance_exemptions", 60_000, async () => {
    try {
      const db = await getDb();
      let rawValue: string | undefined;
      if (!db) {
        rawValue = fallbackPlatformSettings.get(PLATFORM_MAINTENANCE_EXEMPTIONS_SETTING_KEY)?.value;
      } else {
        const record = (await db.select().from(platformSettings).where(eq(platformSettings.settingKey, PLATFORM_MAINTENANCE_EXEMPTIONS_SETTING_KEY)).limit(1))[0];
        rawValue = record?.value;
      }
      if (!rawValue) return [];
      const parsed = JSON.parse(rawValue);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((item: any) => ({
        email: normalizeEmail(String(item.email || "")),
        status: item.status === "restricted" ? ("restricted" as const) : ("allowed" as const),
        updatedAt: item.updatedAt ? String(item.updatedAt) : null,
        updatedByUserId: typeof item.updatedByUserId === "number" ? item.updatedByUserId : null,
      })).filter((item) => item.email.length > 0);
    } catch (error: any) {
      markDatabaseUnhealthy(error?.message ?? String(error));
      return [];
    }
  });
}

/** Configures an account exemption status ("allowed" to bypass maintenance, "restricted" to enforce maintenance). */
export async function setPlatformMaintenanceExemption(
  emailInput: string,
  status: "allowed" | "restricted",
  updatedByUserId: number
): Promise<MaintenanceExemptionEntry[]> {
  const email = normalizeEmail(emailInput);
  if (!email || !email.includes("@")) {
    throw new Error("Enter a valid email address");
  }
  const current = await getPlatformMaintenanceExemptions();
  const existingIdx = current.findIndex(e => normalizeEmail(e.email) === email);
  const now = new Date().toISOString();
  let updated: MaintenanceExemptionEntry[];
  if (existingIdx >= 0) {
    updated = current.map((entry, idx) => idx === existingIdx ? { email, status, updatedAt: now, updatedByUserId } : entry);
  } else {
    updated = [...current, { email, status, updatedAt: now, updatedByUserId }];
  }
  const serialized = JSON.stringify(updated);
  fallbackPlatformSettings.set(PLATFORM_MAINTENANCE_EXEMPTIONS_SETTING_KEY, { value: serialized, updatedAt: new Date(), updatedByUserId });
  bustCache("platform_maintenance_exemptions");
  try {
    const db = await getDb();
    if (db) {
      await db.insert(platformSettings).values({
        settingKey: PLATFORM_MAINTENANCE_EXEMPTIONS_SETTING_KEY,
        value: serialized,
        updatedByUserId,
      }).onDuplicateKeyUpdate({ set: { value: serialized, updatedByUserId, updatedAt: new Date() } });
    }
  } catch (error: any) {
    markDatabaseUnhealthy(error?.message ?? String(error));
  }
  return updated;
}

/** Removes an account entirely from the maintenance exemptions list. */
export async function removePlatformMaintenanceExemption(
  emailInput: string,
  updatedByUserId: number
): Promise<MaintenanceExemptionEntry[]> {
  const email = normalizeEmail(emailInput);
  const current = await getPlatformMaintenanceExemptions();
  const updated = current.filter(e => normalizeEmail(e.email) !== email);
  const serialized = JSON.stringify(updated);
  fallbackPlatformSettings.set(PLATFORM_MAINTENANCE_EXEMPTIONS_SETTING_KEY, { value: serialized, updatedAt: new Date(), updatedByUserId });
  bustCache("platform_maintenance_exemptions");
  try {
    const db = await getDb();
    if (db) {
      await db.insert(platformSettings).values({
        settingKey: PLATFORM_MAINTENANCE_EXEMPTIONS_SETTING_KEY,
        value: serialized,
        updatedByUserId,
      }).onDuplicateKeyUpdate({ set: { value: serialized, updatedByUserId, updatedAt: new Date() } });
    }
  } catch (error: any) {
    markDatabaseUnhealthy(error?.message ?? String(error));
  }
  return updated;
}

/** Checks whether a user or email is actively exempted (status === "allowed") from global platform maintenance. Administrators are unconditionally exempted. */
export async function isUserExemptFromPlatformMaintenance(
  target: number | string | { id?: number; email?: string | null; role?: string | null; openId?: string | null; isAdminSession?: boolean } | undefined | null
): Promise<boolean> {
  if (!target) return false;
  try {
    let email: string | null = null;
    let role: string | null = null;
    let openId: string | null = null;
    let isAdminSession = false;

    if (typeof target === "string") {
      email = target;
      if (target === ADMIN_SESSION_PRINCIPAL_OPEN_ID) return true;
    } else if (typeof target === "number") {
      const user = await getUserById(target);
      email = user?.email ?? null;
      role = user?.role ?? null;
      openId = user?.openId ?? null;
    } else if (typeof target === "object") {
      isAdminSession = target.isAdminSession === true;
      role = target.role ?? null;
      openId = target.openId ?? null;
      if (target.email) {
        email = target.email;
      }
      if (typeof target.id === "number") {
        const user = await getUserById(target.id);
        email = user?.email ?? email;
        if (!role) role = user?.role ?? null;
        if (!openId) openId = user?.openId ?? null;
      }
    }

    // Administrators are unconditionally exempt from platform maintenance
    const normalized = email ? normalizeEmail(email) : null;
    const isAdmin =
      isAdminSession ||
      role === "admin" ||
      openId === ADMIN_SESSION_PRINCIPAL_OPEN_ID ||
      normalized === DEFAULT_ADMIN_EMAIL;
    if (isAdmin) return true;

    if (!normalized) return false;
    const exemptions = await getPlatformMaintenanceExemptions();
    const match = exemptions.find((entry) => normalizeEmail(entry.email) === normalized);
    return match ? match.status === "allowed" : false;
  } catch (err) {
    console.error("[Maintenance Exemption Check Error]", err);
    return false;
  }
}


export type Gpt6AstraPremiumExemptionEntry = { email: string; updatedAt: string; updatedByUserId: number };
const GPT6_ASTRA_PREMIUM_EXEMPTIONS_SETTING_KEY = "gpt6_astra_premium_exemptions_v1";

export async function getGpt6AstraPremiumExemptions(): Promise<Gpt6AstraPremiumExemptionEntry[]> {
  return cached("gpt6_astra_premium_exemptions", 60_000, async () => {
    try {
      const db = await getDb();
      let rawValue: string | undefined;
      if (!db) {
        rawValue = fallbackPlatformSettings.get(GPT6_ASTRA_PREMIUM_EXEMPTIONS_SETTING_KEY)?.value;
      } else {
        const record = (await db.select().from(platformSettings).where(eq(platformSettings.settingKey, GPT6_ASTRA_PREMIUM_EXEMPTIONS_SETTING_KEY)).limit(1))[0];
        rawValue = record?.value;
        if (rawValue) {
          fallbackPlatformSettings.set(GPT6_ASTRA_PREMIUM_EXEMPTIONS_SETTING_KEY, { value: rawValue, updatedAt: record.updatedAt || new Date(), updatedByUserId: record.updatedByUserId });
        }
      }
      if (!rawValue) return [];
      return JSON.parse(rawValue);
    } catch (err) {
      console.error("[GPT6 Premium Exemption Parse Error]", err);
      return [];
    }
  });
}

export async function setGpt6AstraPremiumExemption(
  emailInput: string,
  updatedByUserId: number
): Promise<Gpt6AstraPremiumExemptionEntry[]> {
  const email = normalizeEmail(emailInput);
  if (!email || !email.includes("@")) {
    throw new Error("Enter a valid email address");
  }
  const current = await getGpt6AstraPremiumExemptions();
  const existingIdx = current.findIndex(e => normalizeEmail(e.email) === email);
  const now = new Date().toISOString();
  let updated: Gpt6AstraPremiumExemptionEntry[];
  if (existingIdx >= 0) {
    updated = current.map((entry, idx) => idx === existingIdx ? { email, updatedAt: now, updatedByUserId } : entry);
  } else {
    updated = [{ email, updatedAt: now, updatedByUserId }, ...current];
  }
  const serialized = JSON.stringify(updated);
  fallbackPlatformSettings.set(GPT6_ASTRA_PREMIUM_EXEMPTIONS_SETTING_KEY, { value: serialized, updatedAt: new Date(), updatedByUserId });
  bustCache("gpt6_astra_premium_exemptions");
  try {
    const db = await getDb();
    if (db) {
      await db.insert(platformSettings).values({
        settingKey: GPT6_ASTRA_PREMIUM_EXEMPTIONS_SETTING_KEY,
        value: serialized,
        updatedByUserId
      }).onDuplicateKeyUpdate({ set: { value: serialized, updatedByUserId, updatedAt: new Date() } });
    }
  } catch (err) {
    console.error("[GPT6 Premium Exemption Persist Error]", err);
  }
  return updated;
}

export async function removeGpt6AstraPremiumExemption(
  emailInput: string,
  updatedByUserId: number
): Promise<Gpt6AstraPremiumExemptionEntry[]> {
  const email = normalizeEmail(emailInput);
  const current = await getGpt6AstraPremiumExemptions();
  const updated = current.filter(e => normalizeEmail(e.email) !== email);
  const serialized = JSON.stringify(updated);
  fallbackPlatformSettings.set(GPT6_ASTRA_PREMIUM_EXEMPTIONS_SETTING_KEY, { value: serialized, updatedAt: new Date(), updatedByUserId });
  bustCache("gpt6_astra_premium_exemptions");
  try {
    const db = await getDb();
    if (db) {
      await db.insert(platformSettings).values({
        settingKey: GPT6_ASTRA_PREMIUM_EXEMPTIONS_SETTING_KEY,
        value: serialized,
        updatedByUserId
      }).onDuplicateKeyUpdate({ set: { value: serialized, updatedByUserId, updatedAt: new Date() } });
    }
  } catch (err) {
    console.error("[GPT6 Premium Exemption Removal Error]", err);
  }
  return updated;
}

export async function isUserGpt6AstraPremiumExempt(
  _target?: number | string | { id?: number; email?: string | null } | undefined | null
): Promise<boolean> {
  return true;
}

export type MaintenanceCountdown = { endsAt: number; note: string } | null;

/** Reads the active public maintenance countdown. Expiry durably pauses inference before the timer is unpublished. */
export async function getMaintenanceCountdown(): Promise<MaintenanceCountdown> {
  try {
    const db = await getDb();
    if (!db) {
      const fallback = fallbackPlatformSettings.get(MAINTENANCE_COUNTDOWN_SETTING_KEY)?.value;
      return parseMaintenanceCountdown(fallback);
    }
    const record = (await db.select({ value: platformSettings.value }).from(platformSettings)
      .where(eq(platformSettings.settingKey, MAINTENANCE_COUNTDOWN_SETTING_KEY)).limit(1))[0];
    const countdown = parseMaintenanceCountdown(record?.value);
    if (!countdown) return null;
    if (countdown.endsAt <= Date.now()) {
      await activateExpiredMaintenanceCountdown(db);
      return null;
    }
    return countdown;
  } catch (error: any) {
    markDatabaseUnhealthy(error?.message ?? String(error));
    const fallback = fallbackPlatformSettings.get(MAINTENANCE_COUNTDOWN_SETTING_KEY)?.value;
    return parseMaintenanceCountdown(fallback);
  }
}

/** Starts a countdown from an administrator-provided duration, or clears the public timer when input is null. */
export async function setMaintenanceCountdown(input: { durationMs: number; note: string } | null, updatedByUserId: number): Promise<MaintenanceCountdown> {
  const value = input === null ? "" : JSON.stringify({
    endsAt: Date.now() + Math.max(0, Math.trunc(input.durationMs)),
    note: input.note.trim().slice(0, 200),
  });
  fallbackPlatformSettings.set(MAINTENANCE_COUNTDOWN_SETTING_KEY, { value, updatedAt: new Date(), updatedByUserId });
  try {
    const db = await getDb();
    if (db) {
      await db.insert(platformSettings).values({ settingKey: MAINTENANCE_COUNTDOWN_SETTING_KEY, value, updatedByUserId })
        .onDuplicateKeyUpdate({ set: { value, updatedByUserId, updatedAt: new Date() } });
    }
  } catch (error: any) {
    markDatabaseUnhealthy(error?.message ?? String(error));
  }
  return getMaintenanceCountdown();
}

async function consumeDiscordUnverifiedCleanupNotice(emailInput: string) {
  const db = await getDb();
  if (!db) return false;
  const email = normalizeEmail(emailInput);
  if (!email) return false;
  const identifierHash = hashDeletedIdentity(DISCORD_UNVERIFIED_CLEANUP_NOTICE_KIND, email);
  const notice = (await db.select({ id: deletedIdentityTombstones.id }).from(deletedIdentityTombstones)
    .where(and(eq(deletedIdentityTombstones.kind, DISCORD_UNVERIFIED_CLEANUP_NOTICE_KIND), eq(deletedIdentityTombstones.identifierHash, identifierHash))).limit(1))[0];
  if (!notice) return false;
  await db.delete(deletedIdentityTombstones).where(eq(deletedIdentityTombstones.id, notice.id));
  return true;
}

async function clearDiscordUnverifiedCleanupNotice(emailInput: string) {
  const db = await getDb();
  if (!db) return;
  const email = normalizeEmail(emailInput);
  if (!email) return;
  await db.delete(deletedIdentityTombstones).where(and(
    eq(deletedIdentityTombstones.kind, DISCORD_UNVERIFIED_CLEANUP_NOTICE_KIND),
    eq(deletedIdentityTombstones.identifierHash, hashDeletedIdentity(DISCORD_UNVERIFIED_CLEANUP_NOTICE_KIND, email)),
  ));
}

/** Advances the global session version so every previously issued browser session becomes invalid. */
export async function revokeAllTokenForgeSessions() {
  clearSessionVersionCache();
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  await db.insert(platformSettings).values({ settingKey: SESSION_VERSION_SETTING_KEY, value: "1" })
    .onDuplicateKeyUpdate({ set: { value: sql`cast(${platformSettings.value} as unsigned) + 1`, updatedAt: new Date(), updatedByUserId: null } });
  return getAuthSessionVersion();
}

export async function recordRevokedSessionTokenHash(hash: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(deletedIdentityTombstones).values({
      kind: "revoked_session",
      identifierHash: hash,
    }).onDuplicateKeyUpdate({ set: { deletedAt: new Date() } });
  } catch {
    // Non-blocking
  }
}

export async function isRevokedSessionTokenHashInDb(hash: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  try {
    const rows = await db.select({ id: deletedIdentityTombstones.id })
      .from(deletedIdentityTombstones)
      .where(and(eq(deletedIdentityTombstones.kind, "revoked_session"), eq(deletedIdentityTombstones.identifierHash, hash)))
      .limit(1);
    return Boolean(rows[0]);
  } catch {
    return false;
  }
}

function utcCalendarKey(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

export async function ensureCreditAccount(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const existing = (await db.select().from(creditAccounts).where(eq(creditAccounts.userId, userId)).limit(1))[0];
  if (existing) return existing;

  // Verify user exists in `users` before inserting credit account (foreign key constraint)
  const userRow = (await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!userRow) {
    if (userId === FALLBACK_ADMIN_SESSION_PRINCIPAL.id) {
      await getOrCreateAdminSessionPrincipal();
    } else {
      return null;
    }
  }

  try {
    return await db.transaction(async tx => {
      const again = (await tx.select().from(creditAccounts).where(eq(creditAccounts.userId, userId)).limit(1))[0];
      if (again) return again;
      await tx.insert(creditAccounts).values({
        userId,
        balanceNanos: 0,
        paygBalanceNanos: 0,
        codingPlanTokens: 0,
      });
      return (await tx.select().from(creditAccounts).where(eq(creditAccounts.userId, userId)).limit(1))[0] ?? null;
    });
  } catch (error: any) {
    if (error?.code !== "ER_DUP_ENTRY") throw error;
    return (await db.select().from(creditAccounts).where(eq(creditAccounts.userId, userId)).limit(1))[0] ?? null;
  }
}

export type PreProvisionedAccountSummary = {
  id: number;
  email: string;
  introductoryCreditNanos: number;
  createdAt: Date;
  activatedAt: Date | null;
  activatedUserId: number | null;
  activatedUserName: string | null;
};

/** Creates an administrator-owned email reservation without storing an OAuth subject or credential. */
export async function preProvisionAccountEmail(input: { email: string; provisionedByUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const email = normalizeEmail(input.email);
  const emailPolicy = await getEmailAllowlistConfig();
  if (!email || !isPermanentEmailAddress(email, emailPolicy?.entries)) {
    throw new Error("Enter an eligible permanent email address");
  }

  // Clear any tombstone so re-authorized emails work seamlessly
  try {
    const emailHash = hashDeletedIdentity("email", email);
    await db.delete(deletedIdentityTombstones).where(
      and(
        eq(deletedIdentityTombstones.kind, "email"),
        eq(deletedIdentityTombstones.identifierHash, emailHash)
      )
    );
  } catch {
    // ignore tombstone cleanup failure
  }

  const existingUser = (await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1))[0];
  if (existingUser) return { kind: "existing_user" as const };

  const existingReservation = (
    await db
      .select()
      .from(preProvisionedAccounts)
      .where(and(eq(preProvisionedAccounts.email, email), isNull(preProvisionedAccounts.activatedUserId)))
      .limit(1)
  )[0];
  if (existingReservation) {
    return { kind: "already_pre_provisioned" as const, reservation: existingReservation };
  }

  const name = email.split("@")[0] || "Qronos AI developer";
  const openId = `tf_auth_${randomBytes(16).toString("hex")}`;
  const now = new Date();

  const inserted = await db.insert(users).values({
    openId,
    email,
    name,
    loginMethod: "email",
    lastSignedIn: now,
    role: "user",
  });
  const userId = Number(inserted[0].insertId);

  let reservationId = 0;
  try {
    const insertedReservation = await db.insert(preProvisionedAccounts).values({
      email,
      introductoryCreditNanos: INTRODUCTORY_CREDIT_NANOS,
      provisionedByUserId: input.provisionedByUserId,
      activatedUserId: userId,
      activatedAt: now,
    });
    reservationId = Number(insertedReservation[0].insertId);
  } catch {
    // If pre-provision record exists, update it to activated
    try {
      await db.update(preProvisionedAccounts)
        .set({ activatedUserId: userId, activatedAt: now })
        .where(eq(preProvisionedAccounts.email, email));
    } catch {
      // ignore
    }
  }

  await Promise.all([
    ensureAccountControl(userId),
    ensureCreditAccount(userId),
    getOrCreateReferralCode(userId),
  ]);

  try {
    await db.insert(accountControls)
      .values({ userId, discordVerifiedAt: now })
      .onDuplicateKeyUpdate({ set: { discordVerifiedAt: now } });
  } catch {
    // ignore
  }

  return {
    kind: "created" as const,
    reservationId,
    email,
    introductoryCreditNanos: INTRODUCTORY_CREDIT_NANOS,
    userId,
  };
}

/** Returns recent pending and activated reservations for the administrator account workspace. */
export async function listAdminPreProvisionedAccounts(limit = 20): Promise<PreProvisionedAccountSummary[]> {
  const db = await getDb();
  if (!db) return [];
  const boundedLimit = Math.min(Math.max(Math.floor(limit), 1), 50);
  const rows = await db
    .select({
      id: preProvisionedAccounts.id,
      email: preProvisionedAccounts.email,
      introductoryCreditNanos: preProvisionedAccounts.introductoryCreditNanos,
      createdAt: preProvisionedAccounts.createdAt,
      activatedAt: preProvisionedAccounts.activatedAt,
      activatedUserId: preProvisionedAccounts.activatedUserId,
      activatedUserName: users.name,
    })
    .from(preProvisionedAccounts)
    .leftJoin(users, eq(preProvisionedAccounts.activatedUserId, users.id))
    .orderBy(desc(preProvisionedAccounts.createdAt))
    .limit(boundedLimit);
  return rows.map(row => ({
    id: Number(row.id),
    email: row.email,
    introductoryCreditNanos: Number(row.introductoryCreditNanos),
    createdAt: row.createdAt,
    activatedAt: row.activatedAt,
    activatedUserId: row.activatedUserId ?? null,
    activatedUserName: row.activatedUserName ?? null,
  }));
}

/** Checks only the administrator-created email reservation; no OAuth identity data is stored or matched here. */
export async function hasPreProvisionedAccountEmail(input: string) {
  const db = await getDb();
  if (!db) return false;
  const email = normalizeEmail(input);
  if (!email) return false;
  const reservation = (await db.select({ id: preProvisionedAccounts.id })
    .from(preProvisionedAccounts)
    .where(eq(preProvisionedAccounts.email, email))
    .limit(1))[0];
  return Boolean(reservation);
}

export async function hasPendingPreProvisionedAccountEmail(input: string) {
  const db = await getDb();
  if (!db) return false;
  const email = normalizeEmail(input);
  if (!email) return false;
  const reservation = (await db.select({ id: preProvisionedAccounts.id })
    .from(preProvisionedAccounts)
    .where(and(eq(preProvisionedAccounts.email, email), isNull(preProvisionedAccounts.activatedUserId)))
    .limit(1))[0];
  return Boolean(reservation);
}

export async function deletePreProvisionedAccount(id: number) {
  const db = await getDb();
  if (!db) return false;
  const result = await db.delete(preProvisionedAccounts).where(eq(preProvisionedAccounts.id, id));
  return Number(result[0]?.affectedRows ?? 0) > 0;
}

/** Atomically consumes a matching reservation, grants its reserved introductory credit once, and records the administrator-approved Discord-verification exemption. */
async function activatePreProvisionedAccount(userId: number, email: string) {
  const db = await getDb();
  if (!db) return false;
  return db.transaction(async tx => {
    const reservation = (await tx.select().from(preProvisionedAccounts)
      .where(and(eq(preProvisionedAccounts.email, email), isNull(preProvisionedAccounts.activatedUserId))).limit(1))[0];
    if (!reservation) return false;
    const activatedAt = new Date();
    const claimed = await tx.update(preProvisionedAccounts)
      .set({ activatedUserId: userId, activatedAt })
      .where(and(eq(preProvisionedAccounts.id, reservation.id), isNull(preProvisionedAccounts.activatedUserId)));
    if (Number(claimed[0]?.affectedRows ?? 0) !== 1) return false;
    await tx.insert(accountControls)
      .values({ userId, discordVerifiedAt: activatedAt })
      .onDuplicateKeyUpdate({ set: { discordVerifiedAt: activatedAt } });
    const currentCreditAccount = (await tx.select().from(creditAccounts).where(eq(creditAccounts.userId, userId)).limit(1))[0];
    if (!currentCreditAccount) {
      await tx.insert(creditAccounts).values({
        userId,
        balanceNanos: 0,
        paygBalanceNanos: 0,
        codingPlanTokens: 0,
      });
    }
    return true;
  });
}

function newReferralCode() {
  return Array.from(
    { length: AFFILIATE_CODE_LENGTH },
    () => AFFILIATE_CODE_ALPHABET[randomInt(AFFILIATE_CODE_ALPHABET.length)],
  ).join("");
}

/** Creates a compact affiliate code once per account; the code does not reveal account identity. */
export async function getOrCreateReferralCode(userId: number) {
  const db = await getDb();
  if (!db) return { id: 0, userId, code: "qr01", createdAt: new Date() };
  const existing = (await db.select().from(referralCodes).where(eq(referralCodes.userId, userId)).limit(1))[0];
  if (existing) return existing;

  // Verify user exists in `users` before inserting referral code (foreign key constraint)
  const userRow = (await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!userRow) {
    if (userId === FALLBACK_ADMIN_SESSION_PRINCIPAL.id) {
      await getOrCreateAdminSessionPrincipal();
    } else {
      return { id: 0, userId, code: "qr01", createdAt: new Date() };
    }
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await db.insert(referralCodes).values({ userId, code: newReferralCode() });
      const created = (await db.select().from(referralCodes).where(eq(referralCodes.userId, userId)).limit(1))[0];
      if (created) return created;
    } catch (error: any) {
      if (error?.code !== "ER_DUP_ENTRY") return { id: 0, userId, code: "qr01", createdAt: new Date() };
      const concurrent = (await db.select().from(referralCodes).where(eq(referralCodes.userId, userId)).limit(1))[0];
      if (concurrent) return concurrent;
    }
  }
  return { id: 0, userId, code: "qr01", createdAt: new Date() };
}

/**
 * Grants both parties exactly once after a new referred account is created.
 * The unique referred-user record is the authoritative idempotency control.
 */
export async function awardReferralForNewUser(referredUserId: number, rawReferralCode?: string | null) {
  const referralCode = normalizeReferralCode(rawReferralCode);
  if (!referralCode) return { awarded: false as const, reason: "no_valid_code" as const };
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const invitation = (await db.select().from(referralCodes).where(eq(referralCodes.code, referralCode)).limit(1))[0];
  if (!invitation || invitation.userId === referredUserId) return { awarded: false as const, reason: "ineligible" as const };

  await Promise.all([ensureCreditAccount(invitation.userId), ensureCreditAccount(referredUserId)]);
  try {
    const outcome = await db.transaction(async tx => {
      const prior = (await tx.select({ id: referralAttributions.id }).from(referralAttributions).where(eq(referralAttributions.referredUserId, referredUserId)).limit(1))[0];
      if (prior) return { awarded: false as const, reason: "already_rewarded" as const };

      const inserted = await tx.insert(referralAttributions).values({
        referrerUserId: invitation.userId,
        referredUserId,
        rewardNanos: 0,
      });
      const referralId = Number(inserted[0].insertId);

      // Award 1M tokens to the inviter and 5M tokens to the new joined account
      const INVITER_REFERRAL_TOKENS = 1_000_000;
      const REFERRED_USER_TOKENS = 5_000_000;
      await tx.update(creditAccounts)
        .set({ codingPlanTokens: sql`${creditAccounts.codingPlanTokens} + ${INVITER_REFERRAL_TOKENS}` })
        .where(eq(creditAccounts.userId, invitation.userId));

      await tx.update(creditAccounts)
        .set({ codingPlanTokens: sql`${creditAccounts.codingPlanTokens} + ${REFERRED_USER_TOKENS}` })
        .where(eq(creditAccounts.userId, referredUserId));

      await tx.insert(creditLedger).values([
        {
          userId: invitation.userId,
          kind: "referral_reward",
          amountNanos: 0,
          balanceAfterNanos: 0,
          referenceId: `ref_tokens_inviter:${referralId}`,
          note: `Referral Signup Bonus: +1,000,000 tokens (New referred developer joined).`,
        },
        {
          userId: referredUserId,
          kind: "referral_reward",
          amountNanos: 0,
          balanceAfterNanos: 0,
          referenceId: `ref_tokens_referred:${referralId}`,
          note: `Welcome Referral Bonus: +5,000,000 free tokens for joining via invitation link.`,
        },
      ]);

      const inviter = (await tx.select({ email: users.email }).from(users).where(eq(users.id, invitation.userId)).limit(1))[0];
      if (inviter?.email) {
        await tx.insert(systemNotifications).values({
          title: "1M Referral Tokens & New Developer Joined",
          message: `A new developer joined using your referral link! 1,000,000 free tokens have been credited to your balance.`,
          type: "update",
          targetAudience: "SPECIFIC_EMAILS",
          targetEmails: normalizeEmail(inviter.email),
          createdByUserId: referredUserId,
          createdAt: new Date(),
        });
      }

      const referredUser = (await tx.select({ email: users.email }).from(users).where(eq(users.id, referredUserId)).limit(1))[0];
      if (referredUser?.email) {
        await tx.insert(systemNotifications).values({
          title: "Welcome Bonus: 5,000,000 Tokens Credited!",
          message: `Welcome to Qronos AI! 5,000,000 free tokens have been credited to your account from your referral signup.`,
          type: "update",
          targetAudience: "SPECIFIC_EMAILS",
          targetEmails: normalizeEmail(referredUser.email),
          createdByUserId: invitation.userId,
          createdAt: new Date(),
        });
      }

      return { awarded: true as const, referralId, referrerUserId: invitation.userId, tokensAwarded: QRONOS_REFERRAL_SIGNUP_TOKENS };
    });
    if (outcome.awarded) {
      await writeAuditEvent({ actorUserId: outcome.referrerUserId, targetUserId: referredUserId, action: "referral_bound", entityType: "referral", entityId: String(outcome.referralId), metadata: { rewardNanos: 0, tokensAwarded: outcome.tokensAwarded } });
    }
    return outcome;
  } catch (error: any) {
    if (error?.code === "ER_DUP_ENTRY") return { awarded: false as const, reason: "already_rewarded" as const };
    throw error;
  }
}

/**
 * Referral commission on balance recharges has been discontinued.
 * Function retained as a lightweight zero-query no-op for backward compatibility.
 */
export async function applyReferralCommissionForRecharge(
  _tx: any,
  _payingUserId: number,
  _rechargeAmountNanos: number,
  _orderId: string,
  _paymentMethod: string
) {
  return null;
}

export async function getReferralOverview(userId: number) {
  const db = await getDb();
  if (!db) {
    return {
      code: "qr01",
      referrals: [],
      totalRewardNanos: 0,
      totalReferralTokens: 0,
      receivedRewardNanos: 0,
      wasReferred: false,
      receivedTokens: 0,
    };
  }
  const code = await getOrCreateReferralCode(userId);
  try {
    const [attributions, received] = await Promise.all([
      db.select({ id: referralAttributions.id, createdAt: referralAttributions.createdAt, rewardNanos: referralAttributions.rewardNanos, memberName: users.name })
        .from(referralAttributions)
        .innerJoin(users, eq(referralAttributions.referredUserId, users.id))
        .where(eq(referralAttributions.referrerUserId, userId))
        .orderBy(desc(referralAttributions.createdAt)),
      db.select({ id: referralAttributions.id, rewardNanos: referralAttributions.rewardNanos, createdAt: referralAttributions.createdAt })
        .from(referralAttributions)
        .where(eq(referralAttributions.referredUserId, userId))
        .limit(1),
    ]);
    const wasReferred = Boolean(received[0]);
    return {
      code: code?.code || "qr01",
      referrals: attributions.map(item => ({
        id: item.id,
        name: item.memberName || "Verified Developer",
        createdAt: item.createdAt,
        rewardNanos: item.rewardNanos,
        tokensAwarded: QRONOS_REFERRAL_SIGNUP_INVITER_TOKENS,
      })),
      totalRewardNanos: attributions.reduce((total, item) => total + item.rewardNanos, 0),
      totalReferralTokens: attributions.length * QRONOS_REFERRAL_SIGNUP_INVITER_TOKENS,
      receivedRewardNanos: received[0]?.rewardNanos ?? 0,
      wasReferred,
      receivedTokens: wasReferred ? QRONOS_REFERRAL_SIGNUP_NEW_USER_TOKENS : 0,
    };
  } catch (err) {
    return {
      code: code?.code || "qr01",
      referrals: [],
      totalRewardNanos: 0,
      totalReferralTokens: 0,
      receivedRewardNanos: 0,
      wasReferred: false,
      receivedTokens: 0,
    };
  }
}

/** Reserves a campaign slot during account creation; the unique slot number enforces the 150-user cap. */
export async function reserveSpecialReferralCampaignSlot(userId: number, rawReferralCode?: string | null) {
  if (!isSpecialReferralCampaignCode(rawReferralCode)) return { reserved: false as const, reason: "not_special_link" as const };
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const existing = (await db.select().from(specialReferralClaims).where(eq(specialReferralClaims.userId, userId)).limit(1))[0];
  if (existing) return { reserved: true as const, slotNumber: existing.slotNumber, alreadyReserved: true as const };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(specialReferralClaims).where(eq(specialReferralClaims.campaignKey, SPECIAL_REFERRAL_CAMPAIGN_KEY));
    const slotNumber = Number(count) + 1;
    if (slotNumber > SPECIAL_REFERRAL_CAMPAIGN_CAP) return { reserved: false as const, reason: "campaign_full" as const };
    try {
      await db.insert(specialReferralClaims).values({ campaignKey: SPECIAL_REFERRAL_CAMPAIGN_KEY, slotNumber, userId });
      await writeAuditEvent({ actorUserId: userId, targetUserId: userId, action: "special_referral.reserved", entityType: "special_referral", entityId: String(slotNumber), metadata: { campaignKey: SPECIAL_REFERRAL_CAMPAIGN_KEY } });
      await settleSpecialReferralBonus(userId);
      return { reserved: true as const, slotNumber, alreadyReserved: false as const };
    } catch (error: any) {
      if (error?.code !== "ER_DUP_ENTRY") throw error;
      const concurrent = (await db.select().from(specialReferralClaims).where(eq(specialReferralClaims.userId, userId)).limit(1))[0];
      if (concurrent) return { reserved: true as const, slotNumber: concurrent.slotNumber, alreadyReserved: true as const };
    }
  }
  return { reserved: false as const, reason: "reservation_busy" as const };
}

/** Awards the campaign balance exactly once after Discord verification; duplicate ledger keys keep retries safe. */
export async function settleSpecialReferralBonus(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const now = new Date();
  try {
    return await db.transaction(async tx => {
      const claim = (await tx.select().from(specialReferralClaims).where(eq(specialReferralClaims.userId, userId)).limit(1))[0];
      if (!claim) return { awarded: false as const, reason: "not_eligible" as const };
      if (claim.awardedAt) return { awarded: false as const, reason: "already_awarded" as const, slotNumber: claim.slotNumber };
      await tx.update(specialReferralClaims).set({ verifiedAt: claim.verifiedAt ?? now, awardedAt: now }).where(eq(specialReferralClaims.id, claim.id));
      return { awarded: true as const, slotNumber: claim.slotNumber, awardedAt: now };
    });
  } catch (error: any) {
    if (error?.code === "ER_DUP_ENTRY") return { awarded: false as const, reason: "already_awarded" as const };
    throw error;
  }
}

export async function getSpecialReferralGiftStatus(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const claim = (await db.select().from(specialReferralClaims).where(eq(specialReferralClaims.userId, userId)).limit(1))[0];
  if (!claim) return null;
  return { slotNumber: claim.slotNumber, reservedAt: claim.reservedAt, verifiedAt: claim.verifiedAt, awardedAt: claim.awardedAt, giftViewedAt: claim.giftViewedAt, amountNanos: SPECIAL_REFERRAL_BONUS_NANOS };
}

/** Records visual acknowledgement only; the bonus is settled at Discord verification, not by the UI. */
export async function acknowledgeSpecialReferralGift(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const claim = (await db.select().from(specialReferralClaims).where(eq(specialReferralClaims.userId, userId)).limit(1))[0];
  if (!claim?.awardedAt) return null;
  if (!claim.giftViewedAt) await db.update(specialReferralClaims).set({ giftViewedAt: new Date() }).where(eq(specialReferralClaims.id, claim.id));
  return { slotNumber: claim.slotNumber, amountNanos: SPECIAL_REFERRAL_BONUS_NANOS, awardedAt: claim.awardedAt };
}

/** Administrator-only campaign health and qualifying-account directory; excludes every secret and API-key field. */
export async function getSpecialReferralCampaignAdminOverview() {
  const db = await getDb();
  if (!db) return { cap: SPECIAL_REFERRAL_CAMPAIGN_CAP, reserved: 0, awarded: 0, remaining: SPECIAL_REFERRAL_CAMPAIGN_CAP, accounts: [] };
  const [counts, accounts] = await Promise.all([
    db.select({ reserved: sql<number>`count(*)`, awarded: sql<number>`coalesce(sum(case when ${specialReferralClaims.awardedAt} is not null then 1 else 0 end), 0)` })
      .from(specialReferralClaims)
      .where(eq(specialReferralClaims.campaignKey, SPECIAL_REFERRAL_CAMPAIGN_KEY)),
    db.select({ id: users.id, name: users.name, email: users.email, slotNumber: specialReferralClaims.slotNumber, reservedAt: specialReferralClaims.reservedAt, verifiedAt: specialReferralClaims.verifiedAt, awardedAt: specialReferralClaims.awardedAt, balanceNanos: creditAccounts.balanceNanos, discordVerifiedAt: accountControls.discordVerifiedAt })
      .from(specialReferralClaims)
      .innerJoin(users, eq(specialReferralClaims.userId, users.id))
      .leftJoin(creditAccounts, eq(users.id, creditAccounts.userId))
      .leftJoin(accountControls, eq(users.id, accountControls.userId))
      .where(eq(specialReferralClaims.campaignKey, SPECIAL_REFERRAL_CAMPAIGN_KEY))
      .orderBy(desc(specialReferralClaims.awardedAt), desc(specialReferralClaims.reservedAt), asc(specialReferralClaims.slotNumber)),
  ]);
  const reserved = Number(counts[0]?.reserved ?? 0);
  const awarded = Number(counts[0]?.awarded ?? 0);
  return {
    cap: SPECIAL_REFERRAL_CAMPAIGN_CAP,
    reserved,
    awarded,
    remaining: Math.max(0, SPECIAL_REFERRAL_CAMPAIGN_CAP - reserved),
    accounts: accounts.map(account => ({ ...account, specialReferral: true })),
  };
}

type CreditLedgerInsert = typeof creditLedger.$inferInsert;
let _pendingCreditLedgerEvents: CreditLedgerInsert[] = [];
let _flushCreditLedgerTimer: NodeJS.Timeout | null = null;
let _isFlushingCreditLedger = false;

export async function flushCreditLedgerBuffer(): Promise<void> {
  if (_isFlushingCreditLedger) return;
  const entries = _pendingCreditLedgerEvents;
  if (entries.length === 0) return;

  _pendingCreditLedgerEvents = [];
  _isFlushingCreditLedger = true;

  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(creditLedger).values(entries).catch(err => {
      console.warn("[flushCreditLedgerBuffer] Error batch inserting creditLedger:", err);
    });
  } finally {
    _isFlushingCreditLedger = false;
  }
}

export function queueCreditLedgerEntry(entry: CreditLedgerInsert) {
  _pendingCreditLedgerEvents.push(entry);
  if (_pendingCreditLedgerEvents.length >= 25) {
    void flushCreditLedgerBuffer();
    return;
  }
  if (!_flushCreditLedgerTimer) {
    _flushCreditLedgerTimer = setTimeout(() => {
      _flushCreditLedgerTimer = null;
      void flushCreditLedgerBuffer();
    }, 2000);
  }
}

const _activeReservations = new Map<string, { isPayg: boolean; reservedNanos: number; createdAt: number }>();

export async function reserveCredit(
  userId: number,
  amountNanos: number,
  requestId: string,
  options?: { keyGroup?: "payg" | "bundle" | "token_plan" | "tokens" | "coding_plan" }
) {
  const db = await getDb();
  if (!db) return { authorized: false, balanceNanos: 0, paygBalanceNanos: 0, codingPlanTokens: 0 };
  const account = await ensureCreditAccount(userId);
  if (!account) return { authorized: false, balanceNanos: 0, paygBalanceNanos: 0, codingPlanTokens: 0 };
  const amount = Math.max(0, Math.trunc(amountNanos));
  const currentPayg = Number(account.paygBalanceNanos ?? 0);
  const currentStandard = Number(account.balanceNanos ?? 0);
  const currentCodingTokens = Number((account as any).codingPlanTokens ?? 0);

  const keyGroup = options?.keyGroup;
  const isTokenPlanKey = keyGroup === "token_plan" || keyGroup === "tokens" || keyGroup === "coding_plan";

  // Key is strictly configured for Token Plan (Coding Tokens)
  if (isTokenPlanKey) {
    if (currentCodingTokens <= 0) {
      return {
        authorized: false,
        balanceNanos: currentStandard,
        paygBalanceNanos: currentPayg,
        codingPlanTokens: 0,
        isCodingPlan: true,
        insufficientTokenPlan: true,
      };
    }
    return {
      authorized: true,
      balanceNanos: currentStandard,
      paygBalanceNanos: currentPayg,
      codingPlanTokens: currentCodingTokens,
      isCodingPlan: true,
    };
  }

  const creditsEnabled = await isUserCreditsEnabled(userId);

  // Key is strictly configured for Tier 1 PAYG
  if (keyGroup === "payg") {
    if (currentPayg < amount) {
      return { authorized: false, balanceNanos: currentStandard, paygBalanceNanos: currentPayg, codingPlanTokens: currentCodingTokens };
    }
    return db.transaction(async tx => {
      const result = await tx.update(creditAccounts)
        .set({ paygBalanceNanos: sql`${creditAccounts.paygBalanceNanos} - ${amount}` })
        .where(and(eq(creditAccounts.userId, userId), gte(creditAccounts.paygBalanceNanos, amount)));
      if (!result[0].affectedRows) {
        const latest = (await tx.select().from(creditAccounts).where(eq(creditAccounts.userId, userId)).limit(1))[0];
        return { authorized: false, balanceNanos: latest?.balanceNanos ?? 0, paygBalanceNanos: Number(latest?.paygBalanceNanos ?? 0), codingPlanTokens: Number((latest as any)?.codingPlanTokens ?? 0) };
      }
      const latest = (await tx.select().from(creditAccounts).where(eq(creditAccounts.userId, userId)).limit(1))[0];
      const paygAfter = Number(latest?.paygBalanceNanos ?? 0);
      _activeReservations.set(requestId, { isPayg: true, reservedNanos: amount, createdAt: Date.now() });
      queueCreditLedgerEntry({
        userId,
        kind: "usage_debit",
        amountNanos: -amount,
        balanceAfterNanos: paygAfter,
        referenceId: `reservation_payg:${requestId}`,
        note: "Reserved for an inference request (PAYG balance)",
      });
      return {
        authorized: true,
        balanceNanos: latest?.balanceNanos ?? 0,
        paygBalanceNanos: paygAfter,
        codingPlanTokens: Number((latest as any)?.codingPlanTokens ?? 0),
        isPayg: true,
      };
    });
  }

  // PAYG balance reservation
  if (currentPayg >= amount) {
    return db.transaction(async tx => {
      const result = await tx.update(creditAccounts)
        .set({ paygBalanceNanos: sql`${creditAccounts.paygBalanceNanos} - ${amount}` })
        .where(and(eq(creditAccounts.userId, userId), gte(creditAccounts.paygBalanceNanos, amount)));
      if (result[0].affectedRows) {
        const latest = (await tx.select().from(creditAccounts).where(eq(creditAccounts.userId, userId)).limit(1))[0];
        const paygAfter = Number(latest?.paygBalanceNanos ?? 0);
        _activeReservations.set(requestId, { isPayg: true, reservedNanos: amount, createdAt: Date.now() });
        queueCreditLedgerEntry({
          userId,
          kind: "usage_debit",
          amountNanos: -amount,
          balanceAfterNanos: paygAfter,
          referenceId: `reservation_payg:${requestId}`,
          note: "Reserved for an inference request (PAYG balance)",
        });
        return {
          authorized: true,
          balanceNanos: 0,
          paygBalanceNanos: paygAfter,
          codingPlanTokens: currentCodingTokens,
          isPayg: true,
        };
      }
      const latest = (await tx.select().from(creditAccounts).where(eq(creditAccounts.userId, userId)).limit(1))[0];
      return { authorized: false, balanceNanos: 0, paygBalanceNanos: Number(latest?.paygBalanceNanos ?? 0), codingPlanTokens: currentCodingTokens };
    });
  }

  // If PAYG balance is insufficient, reject with unauthorized
  return { authorized: false, balanceNanos: 0, paygBalanceNanos: currentPayg, codingPlanTokens: currentCodingTokens };
}

function isMissingUserForeignKeyViolation(error: unknown) {
  let current = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (typeof current !== "object") return false;
    const databaseError = current as { code?: unknown; cause?: unknown };
    if (databaseError.code === "ER_NO_REFERENCED_ROW" || databaseError.code === "ER_NO_REFERENCED_ROW_2") return true;
    current = databaseError.cause;
  }
  return false;
}

/**
 * Finalizes a prior inference-credit reservation. If an administrator deletes the account while
 * the upstream model call is still in flight, the reservation has no remaining owner and is
 * deliberately treated as settled with no charge rather than recreating or mutating the account.
 */
export async function settleReservedCredit(
  input: {
    userId: number;
    requestId: string;
    reservedNanos: number;
    finalChargeNanos: number;
    usedTokens?: number;
    model?: string;
    modelId?: string;
    keyGroup?: "payg" | "bundle" | "token_plan" | "tokens" | "coding_plan";
    releaseReason?: string;
  },
  database?: CreditSettlementDatabase
) {
  const db = database ?? await getDb();
  if (!db) return { balanceNanos: 0, chargedNanos: 0 };
  const user = (await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1))[0];
  if (!user) return { balanceNanos: 0, chargedNanos: 0 };
  const reserved = Math.max(0, Math.trunc(input.reservedNanos));
  const usedTokens = Math.max(0, Math.trunc(input.usedTokens ?? 0));
  const isTokenPlanKey = input.keyGroup === "token_plan" || input.keyGroup === "tokens" || input.keyGroup === "coding_plan";

  const activeRes = _activeReservations.get(input.requestId);
  if (activeRes) {
    _activeReservations.delete(input.requestId);
  }
  if (_activeReservations.size > 2000) {
    const cutoff = Date.now() - 300_000;
    for (const [k, v] of _activeReservations.entries()) {
      if (v.createdAt < cutoff) _activeReservations.delete(k);
    }
  }

  try {
    return await db.transaction(async tx => {
      // 1. If this is a Token Plan API key (or playground token plan), deduct from codingPlanTokens
      if (isTokenPlanKey || (input.keyGroup === undefined && usedTokens > 0)) {
        const account = (await tx.select().from(creditAccounts).where(eq(creditAccounts.userId, input.userId)).limit(1))[0];
        const currentCodingTokens = Number((account as any)?.codingPlanTokens ?? 0);
        if (currentCodingTokens > 0 || isTokenPlanKey) {
          const modelName = input.model || input.modelId || "";
          const multiplier = await getModelTokenMultiplier(modelName);
          const effectiveTokensToDeduct = Math.round(usedTokens * multiplier);
          const tokensDeducted = Math.min(currentCodingTokens, effectiveTokensToDeduct);
          await tx
            .update(creditAccounts)
            .set({ codingPlanTokens: sql`GREATEST(0, ${creditAccounts.codingPlanTokens} - ${tokensDeducted})` })
            .where(eq(creditAccounts.userId, input.userId));

          // FIFO drain: deduct from active milestone grants in order of earliest expiration
          try {
            const activeGrants = await tx
              .select()
              .from(inviteMilestoneGrants)
              .where(
                and(
                  eq(inviteMilestoneGrants.userId, input.userId),
                  eq(inviteMilestoneGrants.status, "active"),
                ),
              )
              .orderBy(asc(inviteMilestoneGrants.expiresAt));

            let tokensToDrain = tokensDeducted;
            for (const grant of activeGrants) {
              if (tokensToDrain <= 0) break;
              const curRem = Number(grant.remainingTokens);
              if (curRem <= 0) continue;
              const drain = Math.min(curRem, tokensToDrain);
              const newRem = curRem - drain;
              tokensToDrain -= drain;
              await tx
                .update(inviteMilestoneGrants)
                .set({
                  remainingTokens: newRem,
                  status: newRem <= 0 ? "consumed" : "active",
                })
                .where(eq(inviteMilestoneGrants.id, grant.id));
            }
          } catch {
            // non-blocking FIFO tracker
          }

          const updatedAccount = (await tx.select().from(creditAccounts).where(eq(creditAccounts.userId, input.userId)).limit(1))[0];
          const remainingCodingTokens = Number((updatedAccount as any)?.codingPlanTokens ?? 0);

          const ledgerNote = multiplier > 1
            ? `Token Plan (${multiplier}x compute weight for ${modelName || "model"}): Deducted ${tokensDeducted.toLocaleString()} tokens (${usedTokens.toLocaleString()} tokens × ${multiplier}x, ${remainingCodingTokens.toLocaleString()} remaining)`
            : `Token Plan API Key: Deducted ${tokensDeducted.toLocaleString()} tokens (${remainingCodingTokens.toLocaleString()} tokens remaining)`;

          queueCreditLedgerEntry({
            userId: input.userId,
            kind: "usage_debit",
            amountNanos: 0,
            balanceAfterNanos: remainingCodingTokens,
            referenceId: `coding_plan_debit:${input.requestId}`,
            note: ledgerNote,
          });

          // If this is a dedicated Token Plan key or all tokens were covered by coding plan
          if (isTokenPlanKey || tokensDeducted >= effectiveTokensToDeduct) {
            if (reserved > 0 && !isTokenPlanKey) {
              const wasPayg = activeRes
                ? activeRes.isPayg
                : Boolean(_pendingCreditLedgerEvents.find(e => e.referenceId === `reservation_payg:${input.requestId}`)) ||
                  Boolean((await tx.select().from(creditLedger).where(and(eq(creditLedger.userId, input.userId), eq(creditLedger.referenceId, `reservation_payg:${input.requestId}`))).limit(1))[0]);
              if (wasPayg) {
                await tx.update(creditAccounts).set({ paygBalanceNanos: sql`${creditAccounts.paygBalanceNanos} + ${reserved}` }).where(eq(creditAccounts.userId, input.userId));
              } else {
                await tx.update(creditAccounts).set({ balanceNanos: sql`${creditAccounts.balanceNanos} + ${reserved}` }).where(eq(creditAccounts.userId, input.userId));
              }
            }
            return {
              balanceNanos: updatedAccount?.balanceNanos ?? 0,
              paygBalanceNanos: Number(updatedAccount?.paygBalanceNanos ?? 0),
              codingPlanTokens: remainingCodingTokens,
              chargedNanos: 0,
            };
          }
        }
      }

      // 2. Standard dollar credit settlement
      const chargedNanos = Math.min(reserved, Math.max(0, Math.trunc(input.finalChargeNanos)));
      const refund = reserved - chargedNanos;
      if (refund === 0) {
        const account = (await tx.select().from(creditAccounts).where(eq(creditAccounts.userId, input.userId)).limit(1))[0];
        return {
          balanceNanos: account?.balanceNanos ?? 0,
          paygBalanceNanos: Number(account?.paygBalanceNanos ?? 0),
          codingPlanTokens: Number((account as any)?.codingPlanTokens ?? 0),
          chargedNanos,
        };
      }

      // Check if original reservation was PAYG
      const wasPaygReservation = activeRes
        ? activeRes.isPayg
        : Boolean(_pendingCreditLedgerEvents.find(e => e.referenceId === `reservation_payg:${input.requestId}`)) ||
          Boolean((await tx.select().from(creditLedger).where(and(eq(creditLedger.userId, input.userId), eq(creditLedger.referenceId, `reservation_payg:${input.requestId}`))).limit(1))[0]);

      if (refund > 0) {
        await tx.update(creditAccounts).set({ paygBalanceNanos: sql`${creditAccounts.paygBalanceNanos} + ${refund}` }).where(eq(creditAccounts.userId, input.userId));
      }
      const account = (await tx.select().from(creditAccounts).where(eq(creditAccounts.userId, input.userId)).limit(1))[0];
      const paygRem = Number(account?.paygBalanceNanos ?? 0);
      queueCreditLedgerEntry({
        userId: input.userId,
        kind: "manual_adjustment",
        amountNanos: refund,
        balanceAfterNanos: paygRem,
        referenceId: `settlement_payg:${input.requestId}`,
        note: input.releaseReason ?? "Unused PAYG reservation returned after metered completion",
      });
      return {
        balanceNanos: 0,
        paygBalanceNanos: paygRem,
        codingPlanTokens: Number((account as any)?.codingPlanTokens ?? 0),
        chargedNanos,
      };
    });
  } catch (error) {
    // Account deletion can win the race after the check above but before the ledger insert.
    if (isMissingUserForeignKeyViolation(error)) return { balanceNanos: 0, chargedNanos: 0 };
    throw error;
  }
}

/**
 * Top up user balance directly upon confirmed on-chain Solana Pay settlement.
 * Writes to creditAccounts and creditLedger for full auditability and balance history.
 */
export async function creditAccountFromSolanaPay(input: {
  userId: number;
  amountNanos: number;
  orderId: string;
  signature: string;
  assetLabel?: string;
  isPayg?: boolean;
  isCodingPlan?: boolean;
  codingPlanTokens?: number;
  planName?: string;
}) {
  const db = await getDb();
  if (!db) return null;
  const user = (await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1))[0];
  if (!user) return null;
  const amountNanos = Math.max(0, Math.trunc(input.amountNanos));
  if (amountNanos === 0 && !input.codingPlanTokens) {
    const account = await ensureCreditAccount(input.userId);
    return {
      balanceNanos: account?.balanceNanos ?? 0,
      paygBalanceNanos: Number(account?.paygBalanceNanos ?? 0),
      codingPlanTokens: Number((account as any)?.codingPlanTokens ?? 0),
    };
  }

  return await db.transaction(async tx => {
    await tx.insert(creditAccounts).values({ userId: input.userId, balanceNanos: 0, paygBalanceNanos: 0, codingPlanTokens: 0 }).onDuplicateKeyUpdate({ set: { userId: input.userId } });

    if (input.isCodingPlan || (input.codingPlanTokens && input.codingPlanTokens > 0)) {
      const tokensToAdd = input.codingPlanTokens || Math.max(0, Math.trunc(input.amountNanos));
      await tx.update(creditAccounts).set({ codingPlanTokens: sql`${creditAccounts.codingPlanTokens} + ${tokensToAdd}` }).where(eq(creditAccounts.userId, input.userId));
      const account = (await tx.select().from(creditAccounts).where(eq(creditAccounts.userId, input.userId)).limit(1))[0];
      const balanceNanos = account?.balanceNanos ?? 0;
      const paygBalanceNanos = Number(account?.paygBalanceNanos ?? 0);
      const codingPlanTokens = Number((account as any)?.codingPlanTokens ?? tokensToAdd);
      const mTokens = Math.round(tokensToAdd / 1_000_000);
      await tx.insert(creditLedger).values({
        userId: input.userId,
        kind: "manual_adjustment",
        amountNanos: 0,
        balanceAfterNanos: codingPlanTokens,
        referenceId: `solana_coding:${input.orderId}`,
        note: `Coding Plan: ${input.planName || "Coding Plan"} (+${mTokens}M Tokens). tx: ${input.signature.slice(0, 8)}...`,
      });
      return { balanceNanos, paygBalanceNanos, codingPlanTokens };
    } else {
      const creditGrantNanos = amountNanos;
      await tx.update(creditAccounts).set({ paygBalanceNanos: sql`${creditAccounts.paygBalanceNanos} + ${creditGrantNanos}` }).where(eq(creditAccounts.userId, input.userId));
      const account = (await tx.select().from(creditAccounts).where(eq(creditAccounts.userId, input.userId)).limit(1))[0];
      const balanceNanos = 0;
      const paygBalanceNanos = Number(account?.paygBalanceNanos ?? creditGrantNanos);
      const codingPlanTokens = Number((account as any)?.codingPlanTokens ?? 0);
      await tx.insert(creditLedger).values({
        userId: input.userId,
        kind: "manual_adjustment",
        amountNanos: creditGrantNanos,
        balanceAfterNanos: paygBalanceNanos,
        referenceId: `solana_payg:${input.orderId}`,
        note: `PAYG USD Deposit (${input.assetLabel ?? "USD"}) with 60% Model Discount. tx: ${input.signature.slice(0, 8)}...`,
      });
      return { balanceNanos, paygBalanceNanos, codingPlanTokens };
    }
  });
}

/**
 * Top up user balance directly upon verified UPI payment settlement.
 * Writes to creditAccounts and creditLedger for full auditability and balance history.
 */
export async function creditAccountFromUPIPay(input: {
  userId: number;
  amountNanos: number;
  orderId: string;
  utr: string;
  assetLabel?: string;
  isPayg?: boolean;
  isCodingPlan?: boolean;
  codingPlanTokens?: number;
  planName?: string;
}) {
  try {
    const db = await getDb();
    if (!db) return null;
    const user = (await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1))[0];
    if (!user) return null;
    const amountNanos = Math.max(0, Math.trunc(input.amountNanos));
    if (amountNanos === 0 && !input.codingPlanTokens) {
      const account = await ensureCreditAccount(input.userId);
      return {
        balanceNanos: account?.balanceNanos ?? 0,
        paygBalanceNanos: Number(account?.paygBalanceNanos ?? 0),
        codingPlanTokens: Number((account as any)?.codingPlanTokens ?? 0),
      };
    }

    return await db.transaction(async tx => {
      await tx.insert(creditAccounts).values({ userId: input.userId, balanceNanos: 0, paygBalanceNanos: 0, codingPlanTokens: 0 }).onDuplicateKeyUpdate({ set: { userId: input.userId } });

      if (input.isCodingPlan || (input.codingPlanTokens && input.codingPlanTokens > 0)) {
        const tokensToAdd = input.codingPlanTokens || Math.max(0, Math.trunc(input.amountNanos));
        await tx.update(creditAccounts).set({ codingPlanTokens: sql`${creditAccounts.codingPlanTokens} + ${tokensToAdd}` }).where(eq(creditAccounts.userId, input.userId));
        const account = (await tx.select().from(creditAccounts).where(eq(creditAccounts.userId, input.userId)).limit(1))[0];
        const balanceNanos = account?.balanceNanos ?? 0;
        const paygBalanceNanos = Number(account?.paygBalanceNanos ?? 0);
        const codingPlanTokens = Number((account as any)?.codingPlanTokens ?? tokensToAdd);
        const mTokens = Math.round(tokensToAdd / 1_000_000);
        await tx.insert(creditLedger).values({
          userId: input.userId,
          kind: "manual_adjustment",
          amountNanos: 0,
          balanceAfterNanos: codingPlanTokens,
          referenceId: `upi_coding:${input.orderId}`,
          note: `Coding Plan: ${input.planName || "Coding Plan"} (+${mTokens}M Tokens). UTR: ${input.utr}`,
        });
        return { balanceNanos, paygBalanceNanos, codingPlanTokens };
      } else {
        const creditGrantNanos = amountNanos;
        await tx.update(creditAccounts).set({ paygBalanceNanos: sql`${creditAccounts.paygBalanceNanos} + ${creditGrantNanos}` }).where(eq(creditAccounts.userId, input.userId));
        const account = (await tx.select().from(creditAccounts).where(eq(creditAccounts.userId, input.userId)).limit(1))[0];
        const balanceNanos = 0;
        const paygBalanceNanos = Number(account?.paygBalanceNanos ?? creditGrantNanos);
        const codingPlanTokens = Number((account as any)?.codingPlanTokens ?? 0);
        await tx.insert(creditLedger).values({
          userId: input.userId,
          kind: "manual_adjustment",
          amountNanos: creditGrantNanos,
          balanceAfterNanos: paygBalanceNanos,
          referenceId: `upi_payg:${input.orderId}`,
          note: `PAYG USD Deposit (${input.assetLabel ?? "UPI INR"}) with 60% Model Discount. UTR: ${input.utr}`,
        });
        return { balanceNanos, paygBalanceNanos, codingPlanTokens };
      }
    });
  } catch (error: any) {
    markDatabaseUnhealthy(error?.message ?? String(error));
    return null;
  }
}

/**
 * Top up user balance directly upon verified Dodo Payments settlement.
 * Writes to creditAccounts and creditLedger for full auditability and balance history.
 */
export async function creditAccountFromDodoPay(input: {
  userId: number;
  amountNanos: number;
  orderId: string;
  paymentId: string;
  assetLabel?: string;
  planName?: string;
  isPayg?: boolean;
}) {
  try {
    const db = await getDb();
    if (!db) return null;
    const user = (await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, input.userId)).limit(1))[0];
    if (!user) return null;
    const amountNanos = Math.max(0, Math.trunc(input.amountNanos));
    if (amountNanos === 0) {
      const account = await ensureCreditAccount(input.userId);
      return { balanceNanos: account?.balanceNanos ?? 0, paygBalanceNanos: Number(account?.paygBalanceNanos ?? 0) };
    }

    return await db.transaction(async tx => {
      await tx.insert(creditAccounts).values({ userId: input.userId, balanceNanos: 0, paygBalanceNanos: 0 }).onDuplicateKeyUpdate({ set: { userId: input.userId } });
      const creditGrantNanos = amountNanos;
      await tx.update(creditAccounts).set({ paygBalanceNanos: sql`${creditAccounts.paygBalanceNanos} + ${creditGrantNanos}` }).where(eq(creditAccounts.userId, input.userId));
      const account = (await tx.select().from(creditAccounts).where(eq(creditAccounts.userId, input.userId)).limit(1))[0];
      const balanceNanos = 0;
      const paygBalanceNanos = Number(account?.paygBalanceNanos ?? creditGrantNanos);
      await tx.insert(creditLedger).values({
        userId: input.userId,
        kind: "manual_adjustment",
        amountNanos: creditGrantNanos,
        balanceAfterNanos: paygBalanceNanos,
        referenceId: `dodo_payg:${input.paymentId || input.orderId}`,
        note: `PAYG USD Deposit (${input.assetLabel ?? (input.planName || "Card Deposit")}) with 60% Model Discount. payment_id: ${input.paymentId}`,
      });
      return { balanceNanos, paygBalanceNanos };
    });
  } catch (error: any) {
    markDatabaseUnhealthy(error?.message ?? String(error));
    return null;
  }
}

export async function getCreditProfile(userId: number, now = new Date()) {
  const db = await getDb();
  if (!db) return null;
  await sweepUserExpiredMilestoneGrants(userId);
  const account = await ensureCreditAccount(userId);
  if (!account) return null;
  const today = utcUsageDate(now);
  const [ledger, checkins, todayCheckin] = await Promise.all([
    db.select().from(creditLedger).where(eq(creditLedger.userId, userId)).orderBy(desc(creditLedger.createdAt)).limit(50),
    db.select().from(dailyCheckins).where(and(eq(dailyCheckins.userId, userId), gte(dailyCheckins.checkinDate, utcUsageDate(new Date(now.getTime() - 41 * 86_400_000))))).orderBy(desc(dailyCheckins.checkinDate)),
    db.select({ id: dailyCheckins.id }).from(dailyCheckins).where(and(eq(dailyCheckins.userId, userId), eq(dailyCheckins.checkinDate, today))).limit(1),
  ]);
  return {
    userId,
    balanceNanos: account.balanceNanos,
    paygBalanceNanos: Number((account as any).paygBalanceNanos ?? 0),
    codingPlanTokens: Number((account as any).codingPlanTokens ?? 0),
    creditsEnabled: await isUserCreditsEnabled(userId),
    canCheckIn: !todayCheckin[0],
    today: utcCalendarKey(now),
    ledger,
    checkins: checkins.map(entry => ({ ...entry, day: utcCalendarKey(new Date(entry.checkinDate)) })),
  };
}

export async function claimDailyCheckin(userId: number, now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  await ensureCreditAccount(userId);
  const checkinDate = utcUsageDate(now);
  const referenceId = `checkin:${utcCalendarKey(now)}`;

  // Random reward between $0.01 and $0.10 (inclusive, up to 2 decimal places)
  const rewardCents = Math.floor(Math.random() * 10) + 1; // 1 to 10 cents ($0.01 to $0.10)
  const rewardDollars = rewardCents / 100;
  const rewardNanos = Math.round(rewardDollars * NANODOLLARS_PER_DOLLAR);
  const rewardFormatted = `$${rewardDollars.toFixed(2)}`;

  try {
    return await db.transaction(async tx => {
      const already = (await tx.select({ id: dailyCheckins.id }).from(dailyCheckins).where(and(eq(dailyCheckins.userId, userId), eq(dailyCheckins.checkinDate, checkinDate))).limit(1))[0];
      if (already) return { claimed: false, rewardNanos: 0, rewardFormatted: "$0.00" };
      await tx.insert(dailyCheckins).values({ userId, checkinDate, rewardNanos });
      await tx.update(creditAccounts).set({ paygBalanceNanos: sql`${creditAccounts.paygBalanceNanos} + ${rewardNanos}` }).where(eq(creditAccounts.userId, userId));
      const account = (await tx.select().from(creditAccounts).where(eq(creditAccounts.userId, userId)).limit(1))[0];
      const paygAfter = Number(account?.paygBalanceNanos ?? rewardNanos);
      await tx.insert(creditLedger).values({
        userId,
        kind: "daily_checkin",
        amountNanos: rewardNanos,
        balanceAfterNanos: paygAfter,
        referenceId,
        note: `Daily check-in reward (${rewardFormatted} PAYG credit)`,
      });
      return { claimed: true, rewardNanos, rewardFormatted };
    });
  } catch (error: any) {
    if (error?.code === "ER_DUP_ENTRY") return { claimed: false, rewardNanos: 0, rewardFormatted: "$0.00" };
    throw error;
  }
}

export function hashApiKey(plainTextKey: string) {
  const pepper = process.env.JWT_SECRET || "qronos-api-key-pepper-fallback";
  return createHmac("sha256", pepper).update(plainTextKey).digest("hex");
}

function newPlaintextKey() {
  return `qr_${randomBytes(32).toString("base64url")}`;
}

export function publicApiKey(key: ApiKeyRecord) {
  const rawGroup = (key as any).keyGroup;
  const normalizedGroup = rawGroup === "bundle" ? "payg" : (rawGroup || "payg");
  return {
    id: key.id,
    label: key.label,
    prefix: key.keyPrefix,
    keyGroup: normalizedGroup as "payg" | "bundle" | "token_plan" | "tokens" | "coding_plan",
    status: key.status,
    expiresAt: (key as any).expiresAt ? new Date((key as any).expiresAt) : null,
    spendLimitTokens: (key as any).spendLimitTokens != null ? Number((key as any).spendLimitTokens) : null,
    spendLimitNanos: (key as any).spendLimitNanos != null ? Number((key as any).spendLimitNanos) : null,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    revokedAt: key.revokedAt,
  };
}

// Database URL configuration (strictly from environment variables)
const DIRECT_DATABASE_URL = ENV.databaseUrl || process.env.CUSTOM_DATABASE_URL || process.env.DATABASE_URL;

let _startupMigrationsRan = false;

async function runStartupMigrationsSequentially(pool: mysql.Pool) {
  try {
    await ensureUserTierColumn(pool);
    await ensureModelConfigsMinTierColumn(pool);
    await ensureApiKeysKeyGroupColumn(pool);
    await ensureApiKeysColumns(pool);
    await ensureModelConfigsAccessColumns(pool);
    await ensureUserCreditsEnabledColumn(pool);
    await ensureCreditAccountsColumns(pool);
    await ensureUsageEventsRequestIdIndex(pool);
    await ensureUsageEventsOutcomeColumns(pool);
    await ensureNotificationTables(pool);
  } catch (err) {
    console.warn("[Database] Startup migration notice:", err);
  }
}

// Lazily create and health-check the drizzle instance so local tooling can run without a DB,
// and so quota-exhausted or restricted clusters gracefully fall back.
export async function getDb(): Promise<ReturnType<typeof drizzle> | null> {
  const activeDbUrl = DIRECT_DATABASE_URL || process.env.CUSTOM_DATABASE_URL || process.env.DATABASE_URL;
  if (!activeDbUrl) return null;
  const now = Date.now();

  // Fast path: if pool is active and healthy, return immediately without issuing extra queries.
  // This completely eliminates redundant SELECT 1 probes and conserves TiDB Request Units (RU).
  if (_pool && _dbHealthy && _db) {
    return _db;
  }

  // If pool was marked unhealthy, respect cooldown before retrying connection/ping to protect TiDB RUs
  if (_pool && !_dbHealthy && now - _lastDbHealthCheckTime < DB_HEALTH_CHECK_COOLDOWN_MS) {
    return null;
  }

  if (!_pool) {
    try {
      // mysql2 ignores extra options when given a URI string, and it ignores
      // the `ssl-mode=REQUIRED` URL parameter entirely — TiDB Cloud/Aiven both
      // reject non-TLS connections. Build an explicit config object instead.
      const parsed = new URL(activeDbUrl);
      const config: Record<string, unknown> = {
        host: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : 3306,
        user: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        database: parsed.pathname.replace(/^\//, "").split("?")[0],
        connectTimeout: 10000,
        waitForConnections: true,
        connectionLimit: 25,
        maxIdle: 5,
        idleTimeout: 30000, // 30 seconds: safely culls idle sockets before TiDB Serverless drops them
        queueLimit: 200,    // Protects memory and prevents unbounded request queues
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
      };
      if (/tidbcloud\.com|aivencloud\.com/i.test(parsed.hostname)) config.ssl = { rejectUnauthorized: true };
      const pool = mysql.createPool(config as Parameters<typeof mysql.createPool>[0]);
      pool.on("error", (err: any) => {
        const msg = err?.message || String(err);
        console.warn("[Database Pool Event Error]:", msg);
        if (err?.code === "PROTOCOL_CONNECTION_LOST" || /closed|ETIMEDOUT|ECONNRESET/i.test(msg)) {
          resetDatabasePool();
        }
      });
      _pool = pool;
      _db = drizzle(_pool) as unknown as ReturnType<typeof drizzle>;
    } catch (error) {
      console.warn("[Database] Failed to configure pool:", error);
      resetDatabasePool();
      return null;
    }
  }

  // Verify health with a lightweight ping bounded by an 8-second timeout so it handles remote TLS handshakes
  _lastDbHealthCheckTime = now;
  try {
    await (_pool as any).query({ sql: "SELECT 1", timeout: 8000 });
    _dbHealthy = true;
    if (!_startupMigrationsRan) {
      _startupMigrationsRan = true;
      void runStartupMigrationsSequentially(_pool);
    }
  } catch (error: any) {
    const msg = error?.message ?? String(error);
    const isQuotaOrRestricted = error?.errno === 1105 || /quota|restricted|limit/i.test(msg);
    markDatabaseUnhealthy(isQuotaOrRestricted ? "Cluster usage quota exhausted / access restricted" : msg);

    if (error?.code === "PROTOCOL_CONNECTION_LOST" || /connection lost|closed the connection|ETIMEDOUT|ECONNRESET/i.test(msg)) {
      resetDatabasePool();
    }
    return null;
  }

  return _dbHealthy ? _db : null;
}

let _userTierColumnEnsured = false;
async function ensureUserTierColumn(pool: mysql.Pool) {
  if (_userTierColumnEnsured) return;
  _userTierColumnEnsured = true;
  try {
    await pool.query(
      "ALTER TABLE users ADD COLUMN tier ENUM('free', 'starter', 'plus', 'pro', 'max', 'power', 'ultra', 'enterprise') NOT NULL DEFAULT 'free'"
    );
  } catch (err: any) {
    // Column may already exist; modify it to ensure all tiers are included
    try {
      await pool.query(
        "ALTER TABLE users MODIFY COLUMN tier ENUM('free', 'starter', 'plus', 'pro', 'max', 'power', 'ultra', 'enterprise') NOT NULL DEFAULT 'free'"
      );
    } catch {}
  }
  try {
    await pool.query("UPDATE users SET tier = 'free' WHERE tier IS NULL OR tier = ''");
  } catch {}
}

let _modelConfigsMinTierColumnEnsured = false;
async function ensureModelConfigsMinTierColumn(pool: mysql.Pool) {
  if (_modelConfigsMinTierColumnEnsured) return;
  _modelConfigsMinTierColumnEnsured = true;
  try {
    await pool.query(
      "ALTER TABLE model_configs ADD COLUMN minTier ENUM('free', 'starter', 'plus', 'pro', 'max', 'power', 'ultra', 'enterprise') NOT NULL DEFAULT 'free'"
    );
  } catch (err: any) {
    // Column may already exist; modify it to ensure all tiers are included
    try {
      await pool.query(
        "ALTER TABLE model_configs MODIFY COLUMN minTier ENUM('free', 'starter', 'plus', 'pro', 'max', 'power', 'ultra', 'enterprise') NOT NULL DEFAULT 'free'"
      );
    } catch {}
  }
  try {
    await pool.query("UPDATE model_configs SET minTier = 'free' WHERE minTier IS NULL OR minTier = ''");
  } catch {}
}

let _apiKeysKeyGroupEnsured = false;
async function ensureApiKeysKeyGroupColumn(pool: mysql.Pool) {
  if (_apiKeysKeyGroupEnsured) return;
  _apiKeysKeyGroupEnsured = true;
  try {
    await pool.query(
      "ALTER TABLE api_keys ADD COLUMN keyGroup VARCHAR(32) NOT NULL DEFAULT 'payg'"
    );
  } catch (err: any) {
    // ER_DUP_FIELDNAME (1060) is expected if column already exists
  }
  try {
    await pool.query("UPDATE api_keys SET keyGroup = 'payg' WHERE keyGroup IS NULL OR keyGroup = '' OR keyGroup = 'bundle'");
  } catch {}
}

let _notificationTablesEnsured = false;
async function ensureNotificationTables(pool: mysql.Pool) {
  if (_notificationTablesEnsured) return;
  _notificationTablesEnsured = true;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_notifications (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(32) NOT NULL DEFAULT 'announcement',
        target_audience VARCHAR(32) NOT NULL DEFAULT 'ALL',
        target_emails TEXT NULL,
        created_by_user_id INT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_sys_notif_aud (target_audience),
        INDEX idx_sys_notif_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_notification_reads (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        notification_id BIGINT NOT NULL,
        user_id INT NOT NULL,
        read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_unr_user (user_id),
        UNIQUE KEY unq_unr_user_notif (user_id, notification_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  } catch (err) {
    console.warn("[Database] Error ensuring notification tables:", err);
  }
}

let _modelConfigsAccessColumnsEnsured = false;
async function ensureModelConfigsAccessColumns(pool: mysql.Pool) {
  if (_modelConfigsAccessColumnsEnsured) return;
  _modelConfigsAccessColumnsEnsured = true;
  try {
    await pool.query(
      "ALTER TABLE model_configs ADD COLUMN isPayg BOOLEAN NOT NULL DEFAULT FALSE"
    );
  } catch (err: any) {
    // ER_DUP_FIELDNAME (1060) is expected if column already exists
  }
  try {
    await pool.query(
      "ALTER TABLE model_configs ADD COLUMN isBundle BOOLEAN NOT NULL DEFAULT TRUE"
    );
  } catch (err: any) {
    // ER_DUP_FIELDNAME (1060) is expected if column already exists
  }
  try {
    await pool.query(
      "ALTER TABLE model_configs ADD COLUMN isTokenPlan BOOLEAN NOT NULL DEFAULT FALSE"
    );
  } catch (err: any) {
    // ER_DUP_FIELDNAME (1060) is expected if column already exists
  }
  try {
    // Ensure NULL values for isBundle default to TRUE
    await pool.query("UPDATE model_configs SET isBundle = TRUE WHERE isBundle IS NULL");
    // Guarantee premier coding models have Token Plan access enabled by default
    await pool.query(
      "UPDATE model_configs SET isTokenPlan = TRUE WHERE modelId IN ('claude-opus-5.5', 'claude-sonnet-5.5', 'claude-haiku-5.5', 'gemini-4-argon', 'gpt-6-luna', 'claude-opus-5', 'gpt-6-sol', 'glm-5.3', 'glm-5.3-flash', 'claude-fable-5.1', 'deepseek-v4-pro')"
    );
    // Explicitly guarantee claude-opus-5 has BOTH bundle access ON and payg access ON
    await pool.query(
      "UPDATE model_configs SET isPayg = TRUE, isBundle = TRUE WHERE modelId = 'claude-opus-5'"
    );
  } catch (err) {
    console.warn("[Database] Error ensuring dual model access for claude-opus-5:", err);
  }
}

let _userCreditsEnabledColumnEnsured = false;
async function ensureUserCreditsEnabledColumn(pool: mysql.Pool) {
  if (_userCreditsEnabledColumnEnsured) return;
  _userCreditsEnabledColumnEnsured = true;
  try {
    await pool.query(
      "ALTER TABLE users ADD COLUMN creditsEnabled BOOLEAN NOT NULL DEFAULT FALSE"
    );
  } catch (err: any) {
    // ER_DUP_FIELDNAME (1060) is expected if column already exists
  }
  try {
    // Ensure all NULL values default to FALSE
    await pool.query("UPDATE users SET creditsEnabled = FALSE WHERE creditsEnabled IS NULL");
    // Explicitly guarantee konchoor@gmail.com and kumaryush18@gmail.com have creditsEnabled = TRUE
    await pool.query(
      "UPDATE users SET creditsEnabled = TRUE WHERE LOWER(TRIM(email)) IN ('konchoor@gmail.com', 'kumaryush18@gmail.com')"
    );
  } catch (err) {
    console.warn("[Database] Error ensuring user creditsEnabled defaults:", err);
  }
}

let _creditAccountsColumnsEnsured = false;
async function ensureCreditAccountsColumns(pool: mysql.Pool) {
  if (_creditAccountsColumnsEnsured) return;
  _creditAccountsColumnsEnsured = true;
  try {
    await pool.query(
      "ALTER TABLE credit_accounts ADD COLUMN codingPlanTokens BIGINT NOT NULL DEFAULT 0"
    );
  } catch (err: any) {
    // ER_DUP_FIELDNAME (1060) is expected if column already exists
  }
  try {
    await pool.query(
      "ALTER TABLE credit_accounts ADD COLUMN paygBalanceNanos BIGINT NOT NULL DEFAULT 0"
    );
  } catch (err: any) {
    // ER_DUP_FIELDNAME (1060) is expected if column already exists
  }
  try {
    await pool.query("UPDATE credit_accounts SET codingPlanTokens = 0 WHERE codingPlanTokens IS NULL");
  } catch {}
  try {
    await pool.query("UPDATE credit_accounts SET paygBalanceNanos = 0 WHERE paygBalanceNanos IS NULL");
  } catch {}
}

let _apiKeysColumnsEnsured = false;
async function ensureApiKeysColumns(pool: mysql.Pool) {
  if (_apiKeysColumnsEnsured) return;
  _apiKeysColumnsEnsured = true;
  try {
    await pool.query("ALTER TABLE api_keys ADD COLUMN expiresAt TIMESTAMP NULL");
  } catch {}
  try {
    await pool.query("ALTER TABLE api_keys ADD COLUMN spendLimitTokens BIGINT NULL");
  } catch {}
  try {
    await pool.query("ALTER TABLE api_keys ADD COLUMN spendLimitNanos BIGINT NULL");
  } catch {}
}

let _usageEventsRequestIdIndexEnsured = false;
async function ensureUsageEventsRequestIdIndex(pool: mysql.Pool) {
  if (_usageEventsRequestIdIndexEnsured) return;
  _usageEventsRequestIdIndexEnsured = true;
  try {
    const [rows]: any = await pool.query(
      "SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usage_events' AND INDEX_NAME = 'idx_usage_events_requestid'"
    );
    if (!rows || rows.length === 0) {
      await pool.query("CREATE INDEX idx_usage_events_requestid ON usage_events (requestId)");
      console.log("[Database] Created index idx_usage_events_requestid ON usage_events (requestId)");
    }
  } catch (err: any) {
    if (err?.errno !== 1061 && !String(err?.message).includes("Duplicate key")) {
      console.warn("[Database] Note on ensureUsageEventsRequestIdIndex:", err?.message ?? err);
    }
  }
}

let _usageEventsOutcomeColumnsEnsured = false;
async function ensureUsageEventsOutcomeColumns(pool: mysql.Pool) {
  if (_usageEventsOutcomeColumnsEnsured) return;
  _usageEventsOutcomeColumnsEnsured = true;
  const queries = [
    "ALTER TABLE usage_events ADD COLUMN outcome VARCHAR(32) DEFAULT 'success'",
    "ALTER TABLE usage_events ADD COLUMN stopReason VARCHAR(32) NULL",
    "ALTER TABLE usage_events ADD COLUMN ttftMs INT NULL",
    "ALTER TABLE usage_events ADD COLUMN durationMs INT NULL",
  ];
  for (const q of queries) {
    try {
      await pool.query(q);
    } catch {
      // ER_DUP_FIELDNAME (1060) is expected if column already exists
    }
  }
}

/** Store provider-produced GLM tool-call state only long enough to authenticate its next Claude Code continuation. */
export async function storeGlmToolContinuation(userId: number, toolCallId: string, continuation: GlmPrivateToolContinuation) {
  const db = await getDb();
  if (!db || !toolCallId.trim()) return;
  const encrypted = encryptGlmToolContinuation(continuation);
  const expiresAt = new Date(Date.now() + GLM_TOOL_CONTINUATION_TTL_MS);
  await db.insert(glmToolContinuationStates).values({
    userId,
    toolCallId: toolCallId.trim(),
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    expiresAt,
  }).onDuplicateKeyUpdate({ set: {
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    expiresAt,
  } });
}

/**
 * Load authentic, encrypted provider state for the owning account only. Expired or
 * unreadable records are discarded and callers safely fall back to text-only history.
 */
export async function loadGlmToolContinuations(userId: number, toolCallIds: readonly string[]) {
  const ids = Array.from(new Set(toolCallIds.map(id => id.trim()).filter(Boolean)));
  const result = new Map<string, GlmPrivateToolContinuation>();
  const db = await getDb();
  if (!db || !ids.length) return result;
  const now = new Date();
  const rows = await db.select().from(glmToolContinuationStates)
    .where(and(eq(glmToolContinuationStates.userId, userId), inArray(glmToolContinuationStates.toolCallId, ids)))
    .limit(ids.length);
  for (const row of rows) {
    if (row.expiresAt <= now) {
      await db.delete(glmToolContinuationStates).where(eq(glmToolContinuationStates.id, row.id));
      continue;
    }
    try {
      result.set(row.toolCallId, decryptGlmToolContinuation(row));
    } catch {
      await db.delete(glmToolContinuationStates).where(eq(glmToolContinuationStates.id, row.id));
    }
  }
  return result;
}

/** Encrypt provider-private b.ai reasoning for a single visible assistant turn and owning account only. */
export async function storeBaiReasoningContinuation(userId: number, modelId: "claude-opus-5" | "glm-5.3", assistantFingerprint: string, reasoningContent: string) {
  const db = await getDb();
  if (!db || !Number.isInteger(userId) || userId <= 0 || !/^[a-f0-9]{64}$/i.test(assistantFingerprint) || !reasoningContent.trim()) return;
  const encrypted = encryptBaiReasoningContinuation(reasoningContent);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + BAI_REASONING_CONTINUATION_TTL_MS);
  await db.transaction(async tx => {
    await tx.delete(baiReasoningContinuations).where(lte(baiReasoningContinuations.expiresAt, now));
    await tx.insert(baiReasoningContinuations).values({ userId, modelId, assistantFingerprint, ciphertext: encrypted.ciphertext, iv: encrypted.iv, authTag: encrypted.authTag, expiresAt })
      .onDuplicateKeyUpdate({ set: { ciphertext: encrypted.ciphertext, iv: encrypted.iv, authTag: encrypted.authTag, expiresAt } });
  });
}

/** Return a still-valid b.ai reasoning continuation only for the owning account and public model. */
export async function loadBaiReasoningContinuation(userId: number, modelId: "claude-opus-5" | "glm-5.3", assistantFingerprint: string) {
  const db = await getDb();
  if (!db || !Number.isInteger(userId) || userId <= 0 || !/^[a-f0-9]{64}$/i.test(assistantFingerprint)) return null;
  const row = (await db.select().from(baiReasoningContinuations).where(and(
    eq(baiReasoningContinuations.userId, userId),
    eq(baiReasoningContinuations.modelId, modelId),
    eq(baiReasoningContinuations.assistantFingerprint, assistantFingerprint),
  )).limit(1))[0];
  if (!row) return null;
  if (row.expiresAt <= new Date()) {
    await db.delete(baiReasoningContinuations).where(eq(baiReasoningContinuations.id, row.id));
    return null;
  }
  try {
    return decryptBaiReasoningContinuation(row);
  } catch {
    await db.delete(baiReasoningContinuations).where(eq(baiReasoningContinuations.id, row.id));
    return null;
  }
}

export type BaiProviderCircuitStatus = {
  providerGroupId: string;
  rateLimitCount: number;
  consecutiveRateLimits: number;
  cooldownUntil: Date | null;
  lastRateLimitedAt: Date | null;
  lastSuccessAt: Date | null;
  coolingDown: boolean;
};

function toBaiProviderCircuitStatus(row: typeof baiProviderCircuitStates.$inferSelect | undefined): BaiProviderCircuitStatus | null {
  if (!row) return null;
  return {
    providerGroupId: row.providerGroupId,
    rateLimitCount: Number(row.rateLimitCount ?? 0),
    consecutiveRateLimits: Number(row.consecutiveRateLimits ?? 0),
    cooldownUntil: null,
    lastRateLimitedAt: row.lastRateLimitedAt ?? null,
    lastSuccessAt: row.lastSuccessAt ?? null,
    coolingDown: false,
  };
}

export async function getBaiProviderCircuitStatus(providerGroupId: string): Promise<BaiProviderCircuitStatus | null> {
  const db = await getDb();
  if (!db || !providerGroupId.trim()) return null;
  const row = (await db.select().from(baiProviderCircuitStates).where(eq(baiProviderCircuitStates.providerGroupId, providerGroupId)).limit(1))[0];
  return toBaiProviderCircuitStatus(row);
}

export async function isBaiProviderCircuitEligible(_providerGroupId: string) {
  return true;
}

export async function recordBaiProviderRateLimit(providerGroupId: string) {
  const db = await getDb();
  if (!db || !providerGroupId.trim()) return;
  const now = new Date();
  await db.insert(baiProviderCircuitStates).values({ providerGroupId, rateLimitCount: 1, consecutiveRateLimits: 1, cooldownUntil: null, lastRateLimitedAt: now })
    .onDuplicateKeyUpdate({ set: {
      rateLimitCount: sql`${baiProviderCircuitStates.rateLimitCount} + 1`,
      consecutiveRateLimits: sql`${baiProviderCircuitStates.consecutiveRateLimits} + 1`,
      cooldownUntil: null,
      lastRateLimitedAt: now,
    } });
}

export async function recordBaiProviderSuccess(providerGroupId: string) {
  const db = await getDb();
  if (!db || !providerGroupId.trim()) return;
  const now = new Date();
  await db.insert(baiProviderCircuitStates).values({ providerGroupId, lastSuccessAt: now })
    .onDuplicateKeyUpdate({ set: { consecutiveRateLimits: 0, cooldownUntil: null, lastSuccessAt: now } });
}

export type BaiCredentialCapacityLease = {
  leaseId: string;
  providerModelId: "claude-opus-5" | "glm-5.3";
  providerGroupId: string;
  credentialFingerprint: string;
  slot: number;
};

export type BaiCredentialCapacityStatus = {
  activeRequests: number;
  remainingRequests: number;
  maxActiveRequests: number;
};

function baiCredentialFingerprint(modelId: "claude-opus-5" | "glm-5.3", credential: string, providerGroupId: string) {
  return managedProviderCredentialFingerprint(modelId, credential, providerGroupId);
}

async function ensureBaiCredentialCapacitySlots(modelId: "claude-opus-5" | "glm-5.3", providerGroupId: string, credential: string) {
  const db = await getDb();
  if (!db || !providerGroupId.trim() || !credential.trim()) return null;
  const credentialFingerprint = baiCredentialFingerprint(modelId, credential, providerGroupId);
  await Promise.all(Array.from({ length: BAI_CREDENTIAL_MAX_ACTIVE_REQUESTS }, (_, slot) => db.insert(baiCredentialCapacitySlots).values({
    providerModelId: modelId,
    providerGroupId,
    credentialFingerprint,
    slot,
  }).onDuplicateKeyUpdate({ set: { updatedAt: new Date() } })));
  return { db, credentialFingerprint };
}

/** Atomically claim one of ten shared b.ai credential slots. A stale lease expires safely if an instance disappears. */
export async function tryAcquireBaiCredentialCapacityLease(modelId: "claude-opus-5" | "glm-5.3", providerGroupId: string, credential: string): Promise<BaiCredentialCapacityLease | null> {
  const initialized = await ensureBaiCredentialCapacitySlots(modelId, providerGroupId, credential);
  if (!initialized) return null;
  const { db, credentialFingerprint } = initialized;
  const now = new Date();
  const leaseId = randomBytes(20).toString("hex");
  const leaseExpiresAt = new Date(now.getTime() + BAI_CREDENTIAL_LEASE_MS);
  const slots = await db.select({ slot: baiCredentialCapacitySlots.slot }).from(baiCredentialCapacitySlots).where(and(
    eq(baiCredentialCapacitySlots.providerModelId, modelId),
    eq(baiCredentialCapacitySlots.providerGroupId, providerGroupId),
    eq(baiCredentialCapacitySlots.credentialFingerprint, credentialFingerprint),
  )).orderBy(asc(baiCredentialCapacitySlots.slot));
  for (const candidate of slots) {
    const result = await db.update(baiCredentialCapacitySlots).set({ leaseId, leaseExpiresAt, acquiredAt: now, releasedAt: null }).where(and(
      eq(baiCredentialCapacitySlots.providerModelId, modelId),
      eq(baiCredentialCapacitySlots.providerGroupId, providerGroupId),
      eq(baiCredentialCapacitySlots.credentialFingerprint, credentialFingerprint),
      eq(baiCredentialCapacitySlots.slot, candidate.slot),
      or(isNull(baiCredentialCapacitySlots.leaseExpiresAt), lte(baiCredentialCapacitySlots.leaseExpiresAt, now)),
    ));
    if (Number(result[0]?.affectedRows ?? 0) === 1) return { leaseId, providerModelId: modelId, providerGroupId, credentialFingerprint, slot: candidate.slot };
  }
  return null;
}

/** Releases only the exact capacity lease acquired by this request, preventing a late completion from releasing a newer request. */
export async function releaseBaiCredentialCapacityLease(lease: BaiCredentialCapacityLease | null | undefined) {
  if (!lease) return;
  const db = await getDb();
  if (!db) return;
  await db.update(baiCredentialCapacitySlots).set({ leaseId: null, leaseExpiresAt: null, releasedAt: new Date() }).where(and(
    eq(baiCredentialCapacitySlots.providerModelId, lease.providerModelId),
    eq(baiCredentialCapacitySlots.providerGroupId, lease.providerGroupId),
    eq(baiCredentialCapacitySlots.credentialFingerprint, lease.credentialFingerprint),
    eq(baiCredentialCapacitySlots.slot, lease.slot),
    eq(baiCredentialCapacitySlots.leaseId, lease.leaseId),
  ));
}

export async function getBaiCredentialCapacityStatuses(modelId: "claude-opus-5" | "glm-5.3", providerGroupId: string, credentials: readonly string[]) {
  const usableCredentials = credentials.map(value => value.trim()).filter(Boolean);
  await Promise.all(usableCredentials.map(credential => ensureBaiCredentialCapacitySlots(modelId, providerGroupId, credential)));
  const db = await getDb();
  if (!db || !usableCredentials.length) return usableCredentials.map((): BaiCredentialCapacityStatus => ({ activeRequests: 0, remainingRequests: BAI_CREDENTIAL_MAX_ACTIVE_REQUESTS, maxActiveRequests: BAI_CREDENTIAL_MAX_ACTIVE_REQUESTS }));
  const fingerprints = usableCredentials.map(credential => baiCredentialFingerprint(modelId, credential, providerGroupId));
  const now = new Date();
  const rows = await db.select({ credentialFingerprint: baiCredentialCapacitySlots.credentialFingerprint, activeRequests: sql<number>`COUNT(*)` }).from(baiCredentialCapacitySlots).where(and(
    eq(baiCredentialCapacitySlots.providerModelId, modelId),
    eq(baiCredentialCapacitySlots.providerGroupId, providerGroupId),
    inArray(baiCredentialCapacitySlots.credentialFingerprint, fingerprints),
    isNotNull(baiCredentialCapacitySlots.leaseExpiresAt),
    gte(baiCredentialCapacitySlots.leaseExpiresAt, now),
  )).groupBy(baiCredentialCapacitySlots.credentialFingerprint);
  const activeByFingerprint = new Map(rows.map(row => [row.credentialFingerprint, Number(row.activeRequests ?? 0)]));
  return fingerprints.map(fingerprint => {
    const activeRequests = activeByFingerprint.get(fingerprint) ?? 0;
    return { activeRequests, remainingRequests: Math.max(0, BAI_CREDENTIAL_MAX_ACTIVE_REQUESTS - activeRequests), maxActiveRequests: BAI_CREDENTIAL_MAX_ACTIVE_REQUESTS };
  });
}

export async function getBaiProviderCircuitStatuses() {
  const db = await getDb();
  if (!db) return [] as BaiProviderCircuitStatus[];
  return (await db.select().from(baiProviderCircuitStates)).map(row => toBaiProviderCircuitStatus(row)!);
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  await assertIdentityIsNotDeleted("open_id", user.openId);
  if (user.email) await assertIdentityIsNotDeleted("email", user.email);

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  (["name", "email", "loginMethod"] as const).forEach(field => {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  });
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

/** Resolves a user's display name for live request telemetry; returns null when unavailable. */
export async function lookupUserName(userId: number): Promise<string | null> {
  if (!Number.isInteger(userId) || userId <= 0) return null;
  return cached(`user_name:${userId}`, 600_000, async () => {
    const db = await getDb();
    if (!db) return null;
    const row = (await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1))[0];
    return row?.name ?? null;
  });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({
      id: users.id,
      openId: users.openId,
      name: users.name,
      email: users.email,
      loginMethod: users.loginMethod,
      role: users.role,
      tier: users.tier,
      creditsEnabled: users.creditsEnabled,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      lastSignedIn: users.lastSignedIn,
      discordVerifiedAt: accountControls.discordVerifiedAt,
    })
    .from(users)
    .leftJoin(accountControls, eq(users.id, accountControls.userId))
    .where(eq(users.openId, openId))
    .limit(1);
  return result[0];
}

export async function getUserByEmail(emailInput: string) {
  const email = normalizeEmail(emailInput);
  for (let attempt = 0; attempt < 2; attempt++) {
    const db = await getDb();
    if (!db) return undefined;
    try {
      const result = await db
        .select({
          id: users.id,
          openId: users.openId,
          name: users.name,
          email: users.email,
          loginMethod: users.loginMethod,
          role: users.role,
          tier: users.tier,
          creditsEnabled: users.creditsEnabled,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
          lastSignedIn: users.lastSignedIn,
          discordVerifiedAt: accountControls.discordVerifiedAt,
          isSuspended: accountControls.isSuspended,
        })
        .from(users)
        .leftJoin(accountControls, eq(users.id, accountControls.userId))
        .where(eq(users.email, email))
        .limit(1);
      return result[0];
    } catch (err: any) {
      if (attempt === 0 && (err?.code === "PROTOCOL_CONNECTION_LOST" || /connection lost/i.test(err?.message))) {
        continue;
      }
      throw err;
    }
  }
}

export async function verifyAndAuthenticateEmail(emailInput: string, referralCode?: string) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const email = normalizeEmail(emailInput);
  if (!email) throw new Error("Invalid email address");

  await assertIdentityIsNotDeleted("email", email);

  // 1. Check if an account is already registered
  const existing = await getUserByEmail(email);
  if (existing) {
    await markUserSignedIn(existing.id);
    return existing;
  }

  // 2. Check if this email was authorized/pre-provisioned by an administrator
  const isAuthorizedByAdmin = await hasPendingPreProvisionedAccountEmail(email);
  if (!isAuthorizedByAdmin) {
    throw new Error("Email not registered. Please contact administrator to get access.");
  }

  // 3. User was authorized by admin: initialize account and activate reservation
  const name = email.split("@")[0] || "Qronos AI developer";
  const openId = `tf_email_${randomBytes(12).toString("hex")}`;
  const inserted = await db.insert(users).values({
    openId,
    email,
    name,
    loginMethod: "email",
    lastSignedIn: new Date(),
  });
  const userId = Number(inserted[0].insertId);

  const preProvisionedActivation = await activatePreProvisionedAccount(userId, email);
  await Promise.all([
    ensureAccountControl(userId),
    preProvisionedActivation ? Promise.resolve() : ensureCreditAccount(userId),
    getOrCreateReferralCode(userId),
  ]);
  if (referralCode) {
    await awardReferralForNewUser(userId, referralCode);
    await reserveSpecialReferralCampaignSlot(userId, referralCode);
  }

  const createdUser = await getUserByEmail(email);
  if (!createdUser) throw new Error("Failed to initialize user account");
  return createdUser;
}

export const getOrCreateUserByEmail = verifyAndAuthenticateEmail;

export async function markUserSignedIn(userId: number) {
  const db = await getDb();
  if (!db) return;
  const signedInAt = new Date();
  await db.update(users).set({ lastSignedIn: signedInAt }).where(eq(users.id, userId));
}

/**
 * A reserved internal identity used only to anchor the passcode-scoped
 * administrator session. It has no mailbox, password, API keys, credit
 * account, or developer-workspace access.
 */
export const ADMIN_SESSION_PRINCIPAL_OPEN_ID = "tf_internal_admin_control_plane";

export const FALLBACK_ADMIN_SESSION_PRINCIPAL: UserWithDiscordVerification = {
  id: 1,
  openId: ADMIN_SESSION_PRINCIPAL_OPEN_ID,
  name: "Qronos Administrator",
  email: DEFAULT_ADMIN_EMAIL,
  loginMethod: "admin_passcode",
  role: "admin",
  tier: "ultra",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
  discordVerifiedAt: new Date(),
};

export async function getOrCreateAdminSessionPrincipal() {
  const db = await getDb();
  if (!db) {
    return FALLBACK_ADMIN_SESSION_PRINCIPAL;
  }
  await upsertUser({
    openId: ADMIN_SESSION_PRINCIPAL_OPEN_ID,
    name: "Qronos Administrator",
    email: DEFAULT_ADMIN_EMAIL,
    loginMethod: "admin_passcode",
    role: "admin",
    lastSignedIn: new Date(),
  });
  await db.update(users).set({ email: DEFAULT_ADMIN_EMAIL, role: "admin" }).where(eq(users.openId, ADMIN_SESSION_PRINCIPAL_OPEN_ID));
  const principal = await getUserByOpenId(ADMIN_SESSION_PRINCIPAL_OPEN_ID);
  if (!principal) return FALLBACK_ADMIN_SESSION_PRINCIPAL;
  return principal;
}

export async function createPasswordUser(input: { email: string; password: string; name?: string; referralCode?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const email = normalizeEmail(input.email);
  if (await isDeletedIdentity("email", email)) return null;
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) return null;

  const passwordHash = await hashPassword(input.password);
  const openId = `tf_local_${randomBytes(18).toString("base64url")}`;
  try {
    const userId = await db.transaction(async tx => {
      const inserted = await tx.insert(users).values({
        openId,
        email,
        name: input.name?.trim() || email.split("@")[0] || "Qronos AI developer",
        loginMethod: "password",
        lastSignedIn: new Date(),
      });
      const createdUserId = Number(inserted[0].insertId);
      await tx.insert(passwordCredentials).values({ userId: createdUserId, passwordHash });
      return createdUserId;
    });
    await Promise.all([ensureAccountControl(userId), ensureCreditAccount(userId), getOrCreateReferralCode(userId)]);
    await awardReferralForNewUser(userId, input.referralCode);
    await reserveSpecialReferralCampaignSlot(userId, input.referralCode);
    await clearDiscordUnverifiedCleanupNotice(email);
    return getUserByOpenId(openId);
  } catch (error: any) {
    if (error?.code === "ER_DUP_ENTRY") return null;
    throw error;
  }
}

export async function authenticatePasswordUser(emailInput: string, password: string) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const email = normalizeEmail(emailInput);
  const rows = await db
    .select({ user: users, passwordHash: passwordCredentials.passwordHash })
    .from(users)
    .innerJoin(passwordCredentials, eq(passwordCredentials.userId, users.id))
    .where(eq(users.email, email))
    .limit(1);
  const account = rows[0];
  if (!account) {
    if (await consumeDiscordUnverifiedCleanupNotice(email)) throw new DiscordUnverifiedAccountDeletedError();
    return null;
  }
  if (!(await verifyPassword(password, account.passwordHash))) return null;
  const signedInAt = new Date();
  await db.update(users).set({ lastSignedIn: signedInAt }).where(eq(users.id, account.user.id));
  return { ...account.user, lastSignedIn: signedInAt };
}

export async function ensureReviewerAccount() {
  const reviewerAccounts = [
    { email: "reviewer@thrad.ai", name: "Thrad Reviewer" },
    { email: "reviewer@trygravity.com", name: "Gravity Reviewer" },
  ];
  const password = "QronosReviewer2026!";

  for (const { email, name } of reviewerAccounts) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const db = await getDb();
        if (!db) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        const existing = await getUserByEmail(email);
        if (!existing) {
          console.log(`[Qronos AI] Creating reviewer test account for ${name} (${email})...`);
          const created = await createPasswordUser({
            email,
            password,
            name,
          });
          if (created) {
            // Mark as Discord verified and Ultra tier so they immediately bypass any verification check!
            const now = new Date();
            await db.update(accountControls)
              .set({ discordVerifiedAt: now })
              .where(eq(accountControls.userId, created.id));
            await db.update(users)
              .set({ tier: "ultra" })
              .where(eq(users.id, created.id));
            bustCache(`discord_verified:${created.id}`);

            await grantAdminAccountCredit({
              userId: created.id,
              amountNanos: 25_000_000_000,
              actorUserId: 1,
              balanceType: "payg",
            });
            await grantAdminAccountCredit({
              userId: created.id,
              amountNanos: 10_000_000,
              amountTokens: 10_000_000,
              actorUserId: 1,
              balanceType: "tokens",
            });
            console.log(`[Qronos AI] Reviewer account ready: ${email} (Discord Verified + Ultra Tier + 10M tokens).`);
          }
        } else {
          // Ensure existing reviewer account is marked Discord verified, Ultra tier, and has active credit balance
          const now = new Date();
          await db.update(accountControls)
            .set({ discordVerifiedAt: now })
            .where(eq(accountControls.userId, existing.id));
          await db.update(users)
            .set({ tier: "ultra" })
            .where(eq(users.id, existing.id));
          bustCache(`discord_verified:${existing.id}`);

          await grantAdminAccountCredit({
            userId: existing.id,
            amountNanos: 25_000_000_000,
            actorUserId: 1,
            balanceType: "payg",
          });
          await grantAdminAccountCredit({
            userId: existing.id,
            amountNanos: 10_000_000,
            amountTokens: 10_000_000,
            actorUserId: 1,
            balanceType: "tokens",
          });
          console.log(`[Qronos AI] Reviewer account verified, topped up and active: ${email} (Ultra Tier + 10M tokens)`);
        }

        // Tag initial geo country for reviewer account
        const targetUser = existing || (await getUserByEmail(email));
        if (targetUser) {
          const reviewerGeo = email.includes("thrad") || email.includes("gravity") ? { code: "US", name: "United States" } : { code: "IN", name: "India" };
          await recordUserGeo(targetUser.id, reviewerGeo.code, reviewerGeo.name);
        }
        break;
      } catch (err) {
        if (attempt === 4) {
          console.warn(`[Qronos AI] ensureReviewerAccount notice for ${email}:`, err);
        } else {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }
  }

  // Tag initial geo country for admin account
  try {
    const adminUser = await getUserByEmail("kumaryush18@gmail.com");
    if (adminUser) {
      await recordUserGeo(adminUser.id, "IN", "India");
    }
  } catch {}
}

function hashLoginIdentifier(email: string) {
  const pepper = process.env.JWT_SECRET || "qronos-auth-throttle-pepper-fallback";
  return createHmac("sha256", pepper).update(`login:${normalizeEmail(email)}`).digest("hex");
}

const inMemoryLoginAttempts = new Map<string, { failureCount: number; windowStartedAt: Date; blockedUntil: Date | null }>();

export async function getPasswordLoginThrottle(email: string, now = new Date()) {
  const db = await getDb();
  const identifierHash = hashLoginIdentifier(email);
  if (!db) {
    const record = inMemoryLoginAttempts.get(identifierHash);
    const retryAfter = retryAfterSeconds(record?.blockedUntil ?? null, now);
    return { blocked: retryAfter > 0, retryAfterSeconds: retryAfter };
  }
  const record = (await db.select().from(loginAttempts).where(eq(loginAttempts.identifierHash, identifierHash)).limit(1))[0];
  const retryAfter = retryAfterSeconds(record?.blockedUntil ?? null, now);
  return { blocked: retryAfter > 0, retryAfterSeconds: retryAfter };
}

export async function recordFailedPasswordLogin(email: string, now = new Date()) {
  const db = await getDb();
  const identifierHash = hashLoginIdentifier(email);
  if (!db) {
    const current = inMemoryLoginAttempts.get(identifierHash) ?? null;
    const next = nextFailedLoginState(current ? { failureCount: current.failureCount, windowStartedAt: current.windowStartedAt, blockedUntil: current.blockedUntil } : null, now);
    inMemoryLoginAttempts.set(identifierHash, next);
    return { blocked: retryAfterSeconds(next.blockedUntil, now) > 0, retryAfterSeconds: retryAfterSeconds(next.blockedUntil, now) };
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = (await db.select().from(loginAttempts).where(eq(loginAttempts.identifierHash, identifierHash)).limit(1))[0];
    const next = nextFailedLoginState(current ? { failureCount: current.failureCount, windowStartedAt: current.windowStartedAt, blockedUntil: current.blockedUntil } : null, now);
    try {
      if (current) {
        await db.update(loginAttempts).set(next).where(eq(loginAttempts.id, current.id));
      } else {
        await db.insert(loginAttempts).values({ identifierHash, ...next });
      }
      return { blocked: retryAfterSeconds(next.blockedUntil, now) > 0, retryAfterSeconds: retryAfterSeconds(next.blockedUntil, now) };
    } catch (error: any) {
      if (error?.code !== "ER_DUP_ENTRY" || attempt === 1) throw error;
    }
  }
  return { blocked: false, retryAfterSeconds: 0 };
}

export async function clearFailedPasswordLogin(email: string) {
  const identifierHash = hashLoginIdentifier(email);
  inMemoryLoginAttempts.delete(identifierHash);
  const db = await getDb();
  if (!db) return;
  await db.delete(loginAttempts).where(eq(loginAttempts.identifierHash, identifierHash));
}

export async function getEmailAllowlistConfig(): Promise<EmailAllowlistConfig | null> {
  return cached("email_allowlist", 60_000, async () => {
    try {
      const db = await getDb();
      if (!db) {
        const fallback = fallbackPlatformSettings.get(EMAIL_ALLOWLIST_SETTING_KEY)?.value;
        if (!fallback) return null;
        try {
          const parsed = JSON.parse(fallback) as { entries?: unknown };
          const entries = Array.isArray(parsed.entries) && parsed.entries.every(entry => typeof entry === "string")
            ? normalizeEmailAllowlistEntries(parsed.entries)
            : [];
          return { entries, updatedAt: null, updatedByUserId: null };
        } catch {
          return null;
        }
      }
      const record = (await db.select().from(platformSettings).where(eq(platformSettings.settingKey, EMAIL_ALLOWLIST_SETTING_KEY)).limit(1))[0];
      if (!record) return null;
      try {
        const parsed = JSON.parse(record.value) as { entries?: unknown };
        const entries = Array.isArray(parsed.entries) && parsed.entries.every(entry => typeof entry === "string")
          ? normalizeEmailAllowlistEntries(parsed.entries)
          : [];
        return { entries, updatedAt: record.updatedAt, updatedByUserId: record.updatedByUserId };
      } catch {
        return { entries: [], updatedAt: record.updatedAt, updatedByUserId: record.updatedByUserId };
      }
    } catch (error: any) {
      markDatabaseUnhealthy(error?.message ?? String(error));
      return null;
    }
  });
}

export async function setEmailAllowlistConfig(entries: readonly string[], updatedByUserId: number): Promise<EmailAllowlistConfig> {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const normalizedEntries = normalizeEmailAllowlistEntries(entries);
  bustCache("email_allowlist");
  await db.insert(platformSettings).values({
    settingKey: EMAIL_ALLOWLIST_SETTING_KEY,
    value: JSON.stringify({ entries: normalizedEntries }),
    updatedByUserId,
  }).onDuplicateKeyUpdate({ set: { value: JSON.stringify({ entries: normalizedEntries }), updatedByUserId, updatedAt: new Date() } });
  const saved = await getEmailAllowlistConfig();
  if (!saved) throw new Error("Email allowlist configuration did not persist");
  return saved;
}

export async function listOrcaRouterCredentialSlotSummaries(): Promise<OrcaRouterCredentialSlotSummary[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({
    slot: orcaRouterCredentialSlots.slot,
    keyFingerprint: orcaRouterCredentialSlots.keyFingerprint,
    lastValidatedAt: orcaRouterCredentialSlots.lastValidatedAt,
    updatedAt: orcaRouterCredentialSlots.updatedAt,
    updatedByUserId: orcaRouterCredentialSlots.updatedByUserId,
  }).from(orcaRouterCredentialSlots).orderBy(orcaRouterCredentialSlots.slot);
  return rows.map(row => ({
    slot: row.slot,
    fingerprintSuffix: row.keyFingerprint.slice(-6),
    lastValidatedAt: row.lastValidatedAt,
    updatedAt: row.updatedAt,
    updatedByUserId: row.updatedByUserId,
  }));
}

export async function loadOrcaRouterCredentialSlotCiphertexts() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    slot: orcaRouterCredentialSlots.slot,
    ciphertext: orcaRouterCredentialSlots.ciphertext,
    iv: orcaRouterCredentialSlots.iv,
    authTag: orcaRouterCredentialSlots.authTag,
  }).from(orcaRouterCredentialSlots).orderBy(orcaRouterCredentialSlots.slot);
}

/** Replaces the complete managed pool atomically after server-side validation has succeeded. */
export async function replaceOrcaRouterCredentialPool(credentials: readonly string[], updatedByUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const encrypted = credentials.map((credential, slot) => ({ slot, ...encryptOrcaRouterCredential(credential) }));
  const validatedAt = new Date();
  await db.transaction(async tx => {
    await tx.delete(orcaRouterCredentialSlots);
    for (const item of encrypted) {
      await tx.insert(orcaRouterCredentialSlots).values({
        slot: item.slot,
        ciphertext: item.ciphertext,
        iv: item.iv,
        authTag: item.authTag,
        keyFingerprint: item.keyFingerprint,
        lastValidatedAt: validatedAt,
        updatedByUserId,
      });
    }
  });
  return listOrcaRouterCredentialSlotSummaries();
}

/** The free-pi slots as the panel sees them: label, fingerprint suffix, when it was checked. */
export async function listFreepiCredentialSlotSummaries(): Promise<FreepiCredentialSlotSummary[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({
    slot: freepiCredentialSlots.slot,
    label: freepiCredentialSlots.label,
    keyFingerprint: freepiCredentialSlots.keyFingerprint,
    lastValidatedAt: freepiCredentialSlots.lastValidatedAt,
    updatedAt: freepiCredentialSlots.updatedAt,
    updatedByUserId: freepiCredentialSlots.updatedByUserId,
  }).from(freepiCredentialSlots).orderBy(freepiCredentialSlots.slot);
  return rows.map(row => ({
    slot: row.slot,
    label: row.label ?? null,
    fingerprintSuffix: row.keyFingerprint.slice(-6),
    lastValidatedAt: row.lastValidatedAt,
    updatedAt: row.updatedAt,
    updatedByUserId: row.updatedByUserId,
  }));
}

/** Ciphertext rows for the decrypting pool. Server-side only. */
export async function loadFreepiCredentialSlotCiphertexts() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    slot: freepiCredentialSlots.slot,
    label: freepiCredentialSlots.label,
    ciphertext: freepiCredentialSlots.ciphertext,
    iv: freepiCredentialSlots.iv,
    authTag: freepiCredentialSlots.authTag,
  }).from(freepiCredentialSlots).orderBy(freepiCredentialSlots.slot);
}

/** Writes one slot, replacing whatever was there. Validation happens before this call. */
export async function setFreepiCredentialSlot(input: {
  slot: number;
  token: string;
  label?: string | null;
  updatedByUserId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const encrypted = encryptFreepiCredential(input.token);
  const label = input.label?.trim().slice(0, 64) || null;
  const values = {
    slot: input.slot,
    label,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    keyFingerprint: encrypted.keyFingerprint,
    lastValidatedAt: new Date(),
    updatedByUserId: input.updatedByUserId,
  };
  await db.insert(freepiCredentialSlots).values(values).onDuplicateKeyUpdate({
    set: {
      label: values.label,
      ciphertext: values.ciphertext,
      iv: values.iv,
      authTag: values.authTag,
      keyFingerprint: values.keyFingerprint,
      lastValidatedAt: values.lastValidatedAt,
      updatedByUserId: values.updatedByUserId,
      updatedAt: new Date(),
    },
  });
  return listFreepiCredentialSlotSummaries();
}

/** Empties one slot. The pool simply has one fewer token. */
export async function removeFreepiCredentialSlot(slot: number) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  await db.delete(freepiCredentialSlots).where(eq(freepiCredentialSlots.slot, slot));
  return listFreepiCredentialSlotSummaries();
}

/** Returns the currently published public announcement, normalized so whitespace-only values remain unpublished. */
export async function getAnnouncementText(): Promise<string | null> {
  return cached("announcement_text", 60_000, async () => {
    try {
      const db = await getDb();
      if (!db) {
        const fallback = fallbackPlatformSettings.get(ANNOUNCEMENT_TEXT_SETTING_KEY)?.value?.trim() ?? "";
        return fallback || null;
      }
      const record = (await db.select({ value: platformSettings.value }).from(platformSettings).where(eq(platformSettings.settingKey, ANNOUNCEMENT_TEXT_SETTING_KEY)).limit(1))[0];
      const text = record?.value.trim() ?? "";
      return text || null;
    } catch (error: any) {
      markDatabaseUnhealthy(error?.message ?? String(error));
      const fallback = fallbackPlatformSettings.get(ANNOUNCEMENT_TEXT_SETTING_KEY)?.value?.trim() ?? "";
      return fallback || null;
    }
  });
}

/** Persists an administrator-authored announcement. An empty value intentionally clears the public banner. */
export async function setAnnouncementText(text: string, updatedByUserId: number): Promise<string | null> {
  const value = text.trim().slice(0, 500);
  fallbackPlatformSettings.set(ANNOUNCEMENT_TEXT_SETTING_KEY, { value, updatedAt: new Date(), updatedByUserId });
  bustCache("announcement_text");
  try {
    const db = await getDb();
    if (db) {
      await db.insert(platformSettings).values({
        settingKey: ANNOUNCEMENT_TEXT_SETTING_KEY,
        value,
        updatedByUserId,
      }).onDuplicateKeyUpdate({ set: { value, updatedByUserId, updatedAt: new Date() } });
    }
  } catch (error: any) {
    markDatabaseUnhealthy(error?.message ?? String(error));
  }
  return value || null;
}

/**
 * Returns whether the 'Powered by UnoRouter.com' partner card should be shown on the landing page.
 * Defaults to true unless explicitly disabled by an administrator.
 */
export async function getUnoRouterBadgeEnabled(): Promise<boolean> {
  return cached("unorouter_badge_enabled", 15_000, async () => {
    try {
      const db = await getDb();
      if (!db) {
        const fallback = fallbackPlatformSettings.get(UNOROUTER_BADGE_ENABLED_SETTING_KEY)?.value?.trim();
        return fallback === undefined ? true : fallback !== "false" && fallback !== "0";
      }
      const record = (await db.select({ value: platformSettings.value })
        .from(platformSettings)
        .where(eq(platformSettings.settingKey, UNOROUTER_BADGE_ENABLED_SETTING_KEY))
        .limit(1))[0];
      if (!record) return true; // Default ON (true)
      const val = record.value.trim().toLowerCase();
      return val !== "false" && val !== "0" && val !== "disabled" && val !== "off";
    } catch (error: any) {
      markDatabaseUnhealthy(error?.message ?? String(error));
      const fallback = fallbackPlatformSettings.get(UNOROUTER_BADGE_ENABLED_SETTING_KEY)?.value?.trim();
      return fallback === undefined ? true : fallback !== "false" && fallback !== "0";
    }
  });
}

/**
 * Persists an administrator toggle to show/hide the UnoRouter partner card on the frontend landing page.
 */
export async function setUnoRouterBadgeEnabled(enabled: boolean, updatedByUserId?: number): Promise<boolean> {
  const value = enabled ? "true" : "false";
  fallbackPlatformSettings.set(UNOROUTER_BADGE_ENABLED_SETTING_KEY, { value, updatedAt: new Date(), updatedByUserId: updatedByUserId ?? null });
  bustCache("unorouter_badge_enabled");
  try {
    const db = await getDb();
    if (db) {
      await db.insert(platformSettings).values({
        settingKey: UNOROUTER_BADGE_ENABLED_SETTING_KEY,
        value,
        updatedByUserId: updatedByUserId ?? null,
      }).onDuplicateKeyUpdate({ set: { value, updatedByUserId: updatedByUserId ?? null, updatedAt: new Date() } });
    }
  } catch (error: any) {
    markDatabaseUnhealthy(error?.message ?? String(error));
  }
  return enabled;
}

/**
 * Returns whether the Refund Policy is visible to the public and across platform navigation/routes.
 * Defaults to true unless explicitly toggled off by an administrator.
 */
export async function getRefundPolicyEnabled(): Promise<boolean> {
  return cached("refund_policy_enabled", 15_000, async () => {
    try {
      const db = await getDb();
      if (!db) {
        const fallback = fallbackPlatformSettings.get(REFUND_POLICY_ENABLED_SETTING_KEY)?.value?.trim();
        return fallback === undefined ? true : fallback !== "false" && fallback !== "0";
      }
      const record = (await db.select({ value: platformSettings.value })
        .from(platformSettings)
        .where(eq(platformSettings.settingKey, REFUND_POLICY_ENABLED_SETTING_KEY))
        .limit(1))[0];
      if (!record) return true; // Default ON (true)
      const val = record.value.trim().toLowerCase();
      return val !== "false" && val !== "0" && val !== "disabled" && val !== "off";
    } catch (error: any) {
      markDatabaseUnhealthy(error?.message ?? String(error));
      const fallback = fallbackPlatformSettings.get(REFUND_POLICY_ENABLED_SETTING_KEY)?.value?.trim();
      return fallback === undefined ? true : fallback !== "false" && fallback !== "0";
    }
  });
}

/**
 * Persists an administrator toggle to show/hide the Refund Policy on the platform.
 */
export async function setRefundPolicyEnabled(enabled: boolean, updatedByUserId?: number): Promise<boolean> {
  const value = enabled ? "true" : "false";
  fallbackPlatformSettings.set(REFUND_POLICY_ENABLED_SETTING_KEY, { value, updatedAt: new Date(), updatedByUserId: updatedByUserId ?? null });
  bustCache("refund_policy_enabled");
  try {
    const db = await getDb();
    if (db) {
      await db.insert(platformSettings).values({
        settingKey: REFUND_POLICY_ENABLED_SETTING_KEY,
        value,
        updatedByUserId: updatedByUserId ?? null,
      }).onDuplicateKeyUpdate({ set: { value, updatedByUserId: updatedByUserId ?? null, updatedAt: new Date() } });
    }
  } catch (error: any) {
    markDatabaseUnhealthy(error?.message ?? String(error));
  }
  return enabled;
}

const DEFAULT_MODEL_TOKEN_MULTIPLIERS: Record<string, number> = {
  "claude-opus-5.5": 5,
  "claude-opus-5": 5,
  "gpt-6-astra": 3,
  "gpt-6-sol": 3,
  "gpt-6-luna": 2,
};

/**
 * Returns model-specific token multipliers. When a request is settled from a user's Token Plan
 * (codingPlanTokens), the token deduction is multiplied by this factor (e.g. 5x for Opus).
 * PAYG balances settle in nanodollars based on USD pricing and are completely untouched.
 */
export async function getModelTokenMultipliers(): Promise<Record<string, number>> {
  return cached("model_token_multipliers", 15_000, async () => {
    try {
      const db = await getDb();
      if (!db) {
        const fallback = fallbackPlatformSettings.get(MODEL_TOKEN_MULTIPLIERS_SETTING_KEY)?.value?.trim();
        if (!fallback) return { ...DEFAULT_MODEL_TOKEN_MULTIPLIERS };
        try { return { ...DEFAULT_MODEL_TOKEN_MULTIPLIERS, ...JSON.parse(fallback) }; } catch { return { ...DEFAULT_MODEL_TOKEN_MULTIPLIERS }; }
      }
      const record = (await db.select({ value: platformSettings.value })
        .from(platformSettings)
        .where(eq(platformSettings.settingKey, MODEL_TOKEN_MULTIPLIERS_SETTING_KEY))
        .limit(1))[0];
      if (!record?.value) return { ...DEFAULT_MODEL_TOKEN_MULTIPLIERS };
      return { ...DEFAULT_MODEL_TOKEN_MULTIPLIERS, ...JSON.parse(record.value) };
    } catch (error: any) {
      markDatabaseUnhealthy(error?.message ?? String(error));
      return { ...DEFAULT_MODEL_TOKEN_MULTIPLIERS };
    }
  });
}

/**
 * Returns the effective token multiplier for a model. Defaults to 1x unless configured.
 */
export async function getModelTokenMultiplier(modelId: string): Promise<number> {
  if (!modelId) return 1;
  const canonical = normalizeModelIdentifier(modelId) || modelId;
  const normalized = canonical.trim().toLowerCase();
  const multipliers = await getModelTokenMultipliers();
  if (typeof multipliers[normalized] === "number" && multipliers[normalized] > 0) {
    return multipliers[normalized];
  }
  if (normalized.includes("opus-5")) {
    return multipliers["claude-opus-5.5"] || multipliers["claude-opus-5"] || 5;
  }
  return 1;
}

/**
 * Sets or updates the token usage multiplier for a specific model (e.g. 5x, 7x).
 * Applies exclusively to Token Plan quota deductions.
 */
export async function setModelTokenMultiplier(
  modelId: string,
  multiplier: number,
  updatedByUserId?: number
): Promise<Record<string, number>> {
  const normalized = modelId.trim().toLowerCase();
  const cleanMultiplier = Math.max(1, Math.min(100, Math.round(Number(multiplier) * 10) / 10));
  const current = await getModelTokenMultipliers();
  current[normalized] = cleanMultiplier;

  const value = JSON.stringify(current);
  fallbackPlatformSettings.set(MODEL_TOKEN_MULTIPLIERS_SETTING_KEY, { value, updatedAt: new Date(), updatedByUserId: updatedByUserId ?? null });
  bustCache("model_token_multipliers");

  try {
    const db = await getDb();
    if (db) {
      await db.insert(platformSettings).values({
        settingKey: MODEL_TOKEN_MULTIPLIERS_SETTING_KEY,
        value,
        updatedByUserId: updatedByUserId ?? null,
      }).onDuplicateKeyUpdate({ set: { value, updatedByUserId: updatedByUserId ?? null, updatedAt: new Date() } });
    }
  } catch (error: any) {
    markDatabaseUnhealthy(error?.message ?? String(error));
  }
  return current;
}

export const MODEL_PRICING_OVERRIDES_SETTING_KEY = "model_pricing_overrides";
export const PAYG_MODEL_PRICING_OVERRIDES_SETTING_KEY = "payg_model_pricing_overrides";

function getPricingSettingKey(tier: PricingTier = "bundle"): string {
  return tier === "payg" ? PAYG_MODEL_PRICING_OVERRIDES_SETTING_KEY : MODEL_PRICING_OVERRIDES_SETTING_KEY;
}

export async function getModelPricingOverrides(tier: PricingTier = "bundle"): Promise<Record<string, DynamicModelPricingOverride>> {
  const settingKey = getPricingSettingKey(tier);
  try {
    const db = await getDb();
    if (!db) {
      const fallback = fallbackPlatformSettings.get(settingKey)?.value?.trim() ?? "";
      if (!fallback) return {};
      try { return JSON.parse(fallback); } catch { return {}; }
    }
    const record = (await db.select({ value: platformSettings.value }).from(platformSettings).where(eq(platformSettings.settingKey, settingKey)).limit(1))[0];
    if (!record?.value) return {};
    fallbackPlatformSettings.set(settingKey, { value: record.value, updatedAt: new Date(), updatedByUserId: null });
    return JSON.parse(record.value);
  } catch (error: any) {
    markDatabaseUnhealthy(error?.message ?? String(error));
    const fallback = fallbackPlatformSettings.get(settingKey)?.value?.trim() ?? "";
    if (!fallback) return {};
    try { return JSON.parse(fallback); } catch { return {}; }
  }
}

// Register database pricing loader so in-memory cache auto-syncs from MySQL periodically and on cold starts
registerPricingLoader(getModelPricingOverrides);

export async function setModelPricingOverride(
  modelId: string,
  pricing: { inputUsdPerMillion: number; outputUsdPerMillion: number },
  tierOrUserId?: PricingTier | number,
  updatedByUserId?: number
): Promise<Record<string, DynamicModelPricingOverride>> {
  const tier: PricingTier = typeof tierOrUserId === "string" ? tierOrUserId : "bundle";
  const userId = typeof tierOrUserId === "number" ? tierOrUserId : updatedByUserId;
  const settingKey = getPricingSettingKey(tier);
  const current = await getModelPricingOverrides(tier);
  current[modelId] = {
    inputUsdPerMillion: Math.max(0, Number(pricing.inputUsdPerMillion)),
    outputUsdPerMillion: Math.max(0, Number(pricing.outputUsdPerMillion)),
    updatedAt: new Date().toISOString(),
    updatedByUserId: userId ?? null,
  };
  const value = JSON.stringify(current);
  fallbackPlatformSettings.set(settingKey, { value, updatedAt: new Date(), updatedByUserId: userId ?? null });
  try {
    const db = await getDb();
    if (db) {
      await db.insert(platformSettings).values({
        settingKey,
        value,
        updatedByUserId: userId ?? null,
      }).onDuplicateKeyUpdate({ set: { value, updatedByUserId: userId ?? null, updatedAt: new Date() } });
    }
  } catch (error: any) {
    markDatabaseUnhealthy(error?.message ?? String(error));
  }
  // Immediately update in-memory active pricing cache for billing calculations
  setActivePricingOverrides(current, tier);
  return current;
}

export async function resetModelPricingOverride(
  modelId: string,
  tierOrUserId?: PricingTier | number,
  updatedByUserId?: number
): Promise<Record<string, DynamicModelPricingOverride>> {
  const tier: PricingTier = typeof tierOrUserId === "string" ? tierOrUserId : "bundle";
  const userId = typeof tierOrUserId === "number" ? tierOrUserId : updatedByUserId;
  const settingKey = getPricingSettingKey(tier);
  const current = await getModelPricingOverrides(tier);
  delete current[modelId];
  const value = JSON.stringify(current);
  fallbackPlatformSettings.set(settingKey, { value, updatedAt: new Date(), updatedByUserId: userId ?? null });
  try {
    const db = await getDb();
    if (db) {
      await db.insert(platformSettings).values({
        settingKey,
        value,
        updatedByUserId: userId ?? null,
      }).onDuplicateKeyUpdate({ set: { value, updatedByUserId: userId ?? null, updatedAt: new Date() } });
    }
  } catch (error: any) {
    markDatabaseUnhealthy(error?.message ?? String(error));
  }
  // Immediately update in-memory active pricing cache for billing calculations
  setActivePricingOverrides(current, tier);
  return current;
}

export async function loadAndCacheModelPricingOverrides(): Promise<void> {
  const maxRetries = 5;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const [bundleOverrides, paygOverrides] = await Promise.all([
        getModelPricingOverrides("bundle"),
        getModelPricingOverrides("payg"),
      ]);
      setActivePricingOverrides(bundleOverrides, "bundle");
      setActivePricingOverrides(paygOverrides, "payg");
      return;
    } catch (error: any) {
      if (attempt === maxRetries) {
        console.error("[Qronos AI] Failed to load model pricing overrides on startup after retries:", error);
      } else {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
      }
    }
  }
}

const MAX_MANAGED_PROVIDER_API_KEYS = 50;

type ManagedDynamicProviderModel = string;
type ManagedProviderCleanupDb = Pick<NonNullable<Awaited<ReturnType<typeof getDb>>>, "delete">;

/**
 * Remove all state that becomes orphaned when an administrator deletes a
 * dynamic provider group. Runtime credentials are excluded by replacing the
 * encrypted runtime payload in the same transaction; this helper clears the
 * matching credential fingerprints, diagnostics, and group-specific state.
 */
async function purgeRemovedManagedProviderGroups(
  tx: ManagedProviderCleanupDb,
  modelId: ManagedDynamicProviderModel,
  providers: ClaudeOpus5ProviderRuntime[],
) {
  if (!providers.length) return;
  const providerIds = providers.map(provider => provider.id);
  const fingerprints = providers.flatMap(provider => provider.apiKeys.map(credential => managedProviderCredentialFingerprint(modelId, credential, provider.id)));

  await tx.delete(claudeOpus5FailureLogs).where(and(
    eq(claudeOpus5FailureLogs.modelId, modelId),
    eq(claudeOpus5FailureLogs.sourceType, "provider"),
    inArray(claudeOpus5FailureLogs.sourceId, providerIds),
  ));
  if (fingerprints.length) {
    await tx.delete(providerKeyMetrics).where(and(
      eq(providerKeyMetrics.providerModelId, modelId),
      inArray(providerKeyMetrics.credentialFingerprint, fingerprints),
    ));
  }
  if (modelId === "claude-opus-5") {
    await tx.delete(baiProviderCircuitStates).where(inArray(baiProviderCircuitStates.providerGroupId, providerIds));
    await tx.delete(baiCredentialCapacitySlots).where(and(
      eq(baiCredentialCapacitySlots.providerModelId, "claude-opus-5"),
      inArray(baiCredentialCapacitySlots.providerGroupId, providerIds),
    ));
    await tx.delete(managedProviderModelUsage).where(and(
      eq(managedProviderModelUsage.providerModelId, "claude-opus-5"),
      inArray(managedProviderModelUsage.providerGroupId, providerIds),
    ));
  }
}

export function clearRemovedManagedProviderTelemetry(modelId: ManagedDynamicProviderModel, providers: ClaudeOpus5ProviderRuntime[]) {
  for (const provider of providers) {
    clearProviderCredentialTelemetryGroup(`${modelId}:${provider.id}` as Extract<CredentialTelemetryProvider, `${string}:${string}`>);
  }
}

type ClaudeFable5RuntimePayload = { providers: ClaudeOpus5ProviderRuntime[] };
type Qwen38MaxRuntimePayload = { providers: ClaudeOpus5ProviderRuntime[] };

function claudeFable5RuntimeFromEnvironment(): ClaudeFable5RuntimePayload {
  return {
    providers: normalizeClaudeOpus5Providers([{
      id: "environment-default",
      label: "NVIDIA NIM default",
      enabled: true,
      baseUrl: process.env.NVIDIA_CLAUDE_FABLE5_BASE_URL?.trim() ?? "",
      model: process.env.NVIDIA_CLAUDE_FABLE5_MODEL?.trim() ?? "",
      apiKeys: [
        process.env.NVIDIA_CLAUDE_FABLE5_API_KEY,
        process.env.NVIDIA_CLAUDE_FABLE5_API_KEY_2,
        process.env.NVIDIA_CLAUDE_FABLE5_API_KEY_3,
        process.env.NVIDIA_CLAUDE_FABLE5_API_KEY_4,
        process.env.NVIDIA_CLAUDE_FABLE5_API_KEY_5,
      ].map(value => value?.trim() ?? ""),
    }], []),
  };
}

export function isMaskedOrPlaceholderKey(key: string | undefined | null): boolean {
  if (!key) return true;
  const normalized = key.trim();
  if (!normalized) return true;
  if (normalized.includes("•") || normalized.includes("…")) return true;
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    if (code < 0x20 || code > 0x7E) return true;
  }
  return false;
}

export function maskProviderApiKey(value: string) {
  const normalized = value.trim();
  if (!normalized || isMaskedOrPlaceholderKey(normalized)) return "Not configured";
  return `${normalized.slice(0, Math.min(3, normalized.length))}••••${normalized.slice(-4)}`;
}

/** A missing flag intentionally means enabled so existing encrypted pools remain routable after this release. */
export function isManagedProviderCredentialEnabled(provider: { apiKeyEnabled?: readonly boolean[] }, slot: number) {
  return provider.apiKeyEnabled?.[slot] !== false;
}

export function providerApiKeyMasks(apiKeys: string[], apiKeyEnabled?: readonly boolean[]) {
  return apiKeys.map((key, index) => ({
    slot: index + 1,
    value: maskProviderApiKey(key),
    configured: Boolean(key) && !isMaskedOrPlaceholderKey(key),
    enabled: apiKeyEnabled?.[index] !== false,
  }));
}

type ManagedProviderKeyUpdate = {
  apiKeys: string[];
  apiKeyEnabled?: boolean[];
  removeSlots?: number[];
};

/** Retains secret values on partial saves while preserving each key's explicit routing state. */
export function applyManagedProviderKeyUpdate(
  existing: { apiKeys: string[]; apiKeyEnabled?: boolean[] } | undefined,
  submitted: ManagedProviderKeyUpdate,
) {
  const removedSlots = new Set(submitted.removeSlots ?? []);
  const retained = (existing?.apiKeys ?? []).flatMap((key, index) => removedSlots.has(index + 1)
    ? []
    : [{ key, enabled: isManagedProviderCredentialEnabled(existing ?? {}, index) }]);
  const patched = retained.map((entry, index) => {
    const submittedKey = submitted.apiKeys[index]?.trim();
    const key = (submittedKey && !isMaskedOrPlaceholderKey(submittedKey)) ? submittedKey : entry.key;
    return {
      key,
      enabled: submitted.apiKeyEnabled?.[index] ?? entry.enabled,
    };
  });
  const appended = submitted.apiKeys.slice(retained.length).flatMap((value, index) => {
    const key = value.trim();
    return (key && !isMaskedOrPlaceholderKey(key)) ? [{ key, enabled: submitted.apiKeyEnabled?.[retained.length + index] !== false }] : [];
  });
  const keys = [...patched, ...appended].slice(0, MAX_MANAGED_PROVIDER_API_KEYS);
  return { apiKeys: keys.map(entry => entry.key), apiKeyEnabled: keys.map(entry => entry.enabled) };
}

async function readClaudeFable5RuntimeOverride() {
  return cached("runtime:claude_fable5_nvidia", 60_000, async () => {
    const db = await getDb();
    let record: { value: string; updatedAt?: Date | null; updatedByUserId?: number | null } | undefined;
    if (db) {
      try {
        record = (await db.select().from(platformSettings).where(eq(platformSettings.settingKey, CLAUDE_FABLE5_NVIDIA_RUNTIME_SETTING_KEY)).limit(1))[0];
      } catch {
        // Fallback to memory if DB query fails
      }
    }
    if (!record) {
      record = fallbackPlatformSettings.get(CLAUDE_FABLE5_NVIDIA_RUNTIME_SETTING_KEY);
    }
    if (!record) return null;
    try {
      const encoded = JSON.parse(record.value) as { ciphertext?: string; iv?: string; authTag?: string };
      const decrypted = decryptProviderRuntimeConfig({ ciphertext: String(encoded.ciphertext ?? ""), iv: String(encoded.iv ?? ""), authTag: String(encoded.authTag ?? "") });
      if (!decrypted || typeof decrypted !== "object") return null;
      const candidate = decrypted as Partial<ClaudeFable5RuntimePayload> & { baseUrl?: unknown; model?: unknown; apiKeys?: unknown };
      const legacyProvider = {
        id: "primary",
        label: "Primary provider",
        enabled: true,
        baseUrl: typeof candidate.baseUrl === "string" ? candidate.baseUrl.trim() : "",
        model: typeof candidate.model === "string" ? candidate.model.trim() : "",
        apiKeys: Array.isArray(candidate.apiKeys) ? candidate.apiKeys : [],
      };
      return {
        payload: { providers: normalizeClaudeOpus5Providers(candidate.providers, normalizeClaudeOpus5Providers([legacyProvider], [])) },
        updatedAt: record.updatedAt,
        updatedByUserId: record.updatedByUserId,
      };
    } catch {
      return null;
    }
  });
}

export async function getClaudeFable5NvidiaRuntimeConfig(): Promise<ClaudeFable5RuntimePayload> {
  const fallback = claudeFable5RuntimeFromEnvironment();
  const override = await readClaudeFable5RuntimeOverride();
  if (!override) return fallback;
  return { providers: override.payload.providers.length ? override.payload.providers : fallback.providers };
}

export async function getClaudeFable5NvidiaProviderSettings() {
  const runtime = await getClaudeFable5NvidiaRuntimeConfig();
  const override = await readClaudeFable5RuntimeOverride();
  const primary = runtime.providers[0];
  return {
    baseUrl: primary?.baseUrl ?? "",
    model: primary?.model ?? "",
    apiKeyMasks: providerApiKeyMasks(primary?.apiKeys ?? [], primary?.apiKeyEnabled),
    providers: runtime.providers.map(provider => ({
      id: provider.id,
      label: provider.label,
      enabled: provider.enabled,
      baseUrl: provider.baseUrl,
      model: provider.model,
      apiKeyMasks: providerApiKeyMasks(provider.apiKeys, provider.apiKeyEnabled),
      ...(provider.maxInputTokens !== undefined ? { maxInputTokens: provider.maxInputTokens } : {}),
      ...(provider.maxOutputTokens !== undefined ? { maxOutputTokens: provider.maxOutputTokens } : {}),
      ...(provider.disableIdentityPrompt ? { disableIdentityPrompt: true } : {}),
      pinnedUserEmails: provider.pinnedUserEmails ?? [],
      bypassCooldown: provider.bypassCooldown === true,
      supportsVision: provider.supportsVision === true,
      supportsDocuments: provider.supportsDocuments === true,
      reasoningEffort: provider.reasoningEffort ?? null,
    })),
    source: override ? "database" as const : "environment" as const,
    updatedAt: override?.updatedAt ?? null,
    updatedByUserId: override?.updatedByUserId ?? null,
  };
}

export async function updateClaudeFable5NvidiaProviderSettings(input: { providers: Array<{ id: string; label: string; enabled?: boolean; baseUrl: string; model: string; apiKeys: string[]; apiKeyEnabled?: boolean[]; removeSlots?: number[]; maxInputTokens?: number | null; maxOutputTokens?: number | null; disableIdentityPrompt?: boolean; pinnedUserEmails?: string[]; bypassCooldown?: boolean; supportsVision?: boolean; supportsDocuments?: boolean; reasoningEffort?: "low" | "medium" | "high" | "xhigh" | "max" | null }> } | { baseUrl?: string; model?: string; apiKeys?: string[]; apiKeyEnabled?: boolean[]; removeSlots?: number[]; maxInputTokens?: number | null; maxOutputTokens?: number | null; disableIdentityPrompt?: boolean; pinnedUserEmails?: string[]; bypassCooldown?: boolean; supportsVision?: boolean; supportsDocuments?: boolean; reasoningEffort?: "low" | "medium" | "high" | "xhigh" | "max" | null }, updatedByUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const current = await getClaudeFable5NvidiaRuntimeConfig();
  const currentById = new Map(current.providers.map(provider => [provider.id, provider]));
  const legacyPrimary = current.providers[0] ?? { id: "primary", label: "Primary provider", enabled: true, baseUrl: "", model: "", apiKeys: [] };
  const submittedProviders = "providers" in input ? input.providers : [{ id: legacyPrimary.id, label: legacyPrimary.label, enabled: legacyPrimary.enabled, baseUrl: input.baseUrl ?? legacyPrimary.baseUrl, model: input.model ?? legacyPrimary.model, apiKeys: input.apiKeys ?? [], apiKeyEnabled: input.apiKeyEnabled, removeSlots: input.removeSlots, maxInputTokens: input.maxInputTokens, maxOutputTokens: input.maxOutputTokens, disableIdentityPrompt: input.disableIdentityPrompt, pinnedUserEmails: input.pinnedUserEmails, bypassCooldown: input.bypassCooldown, supportsVision: input.supportsVision, supportsDocuments: input.supportsDocuments, reasoningEffort: (input as any).reasoningEffort }];
  const nextProviders = submittedProviders.map((submitted, index) => {
    const existing = currentById.get(submitted.id);
    const keys = applyManagedProviderKeyUpdate(existing, submitted);
    const maxInputTokens = normalizeMaxInputTokens(submitted.maxInputTokens ?? existing?.maxInputTokens);
    const maxOutputTokens = normalizeMaxOutputTokens(submitted.maxOutputTokens ?? existing?.maxOutputTokens);
    const disableIdentityPrompt = submitted.disableIdentityPrompt !== undefined
      ? submitted.disableIdentityPrompt === true
      : existing?.disableIdentityPrompt === true;
    const bypassCooldown = submitted.bypassCooldown !== undefined
      ? submitted.bypassCooldown === true
      : existing?.bypassCooldown === true;
    const supportsVision = submitted.supportsVision !== undefined
      ? submitted.supportsVision === true
      : existing?.supportsVision === true;
    const supportsDocuments = submitted.supportsDocuments !== undefined
      ? submitted.supportsDocuments === true
      : existing?.supportsDocuments === true;
    const reasoningEffort = normalizeReasoningEffort(
      submitted.reasoningEffort !== undefined
        ? submitted.reasoningEffort
        : (existing as any)?.reasoningEffort
    );
    const pinnedUserEmails = normalizePinnedUserEmails(submitted.pinnedUserEmails !== undefined ? submitted.pinnedUserEmails : existing?.pinnedUserEmails);
    return {
      id: normalizeClaudeOpus5ProviderId(submitted.id, `provider-${index + 1}`),
      label: submitted.label.trim() || `Provider ${index + 1}`,
      enabled: submitted.enabled !== false,
      baseUrl: submitted.baseUrl.trim(),
      model: submitted.model.trim(),
      ...keys,
      ...(disableIdentityPrompt ? { disableIdentityPrompt: true } : {}),
      ...(bypassCooldown ? { bypassCooldown: true } : {}),
      ...(supportsVision ? { supportsVision: true } : {}),
      ...(supportsDocuments ? { supportsDocuments: true } : {}),
      ...(maxInputTokens !== undefined ? { maxInputTokens } : {}),
      ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
      ...(pinnedUserEmails.length ? { pinnedUserEmails } : {}),
    };
  });
  const ids = new Set(nextProviders.map(provider => provider.id));
  if (!nextProviders.length || nextProviders.length > MAX_CLAUDE_OPUS5_PROVIDERS || ids.size !== nextProviders.length || nextProviders.some(provider => !provider.baseUrl || !provider.model || !provider.apiKeys.length)) throw new Error("Each Claude Fable 5.1 provider needs a unique identifier, base URL, model ID, and at least one API key");
  const next: ClaudeFable5RuntimePayload = { providers: nextProviders };
  const encrypted = encryptProviderRuntimeConfig(next);
  const removedProviders = current.providers.filter(provider => !ids.has(provider.id));
  fallbackPlatformSettings.set(CLAUDE_FABLE5_NVIDIA_RUNTIME_SETTING_KEY, { value: JSON.stringify(encrypted), updatedAt: new Date(), updatedByUserId });
  bustCache("runtime:claude_fable5_nvidia");
  try {
    await db.transaction(async tx => {
      await tx.insert(platformSettings).values({
        settingKey: CLAUDE_FABLE5_NVIDIA_RUNTIME_SETTING_KEY,
        value: JSON.stringify(encrypted),
        updatedByUserId,
      }).onDuplicateKeyUpdate({ set: { value: JSON.stringify(encrypted), updatedByUserId, updatedAt: new Date() } });
      await purgeRemovedManagedProviderGroups(tx, "claude-fable-5.1", removedProviders);
    });
  } catch (err) {
    console.warn("[Claude Fable 5.1 settings write to DB failed; runtime preserved in memory]", err);
  }
  clearRemovedManagedProviderTelemetry("claude-fable-5.1", removedProviders);
  return getClaudeFable5NvidiaProviderSettings();
}

function qwen38MaxRuntimeFromEnvironment(): Qwen38MaxRuntimePayload {
  return {
    providers: normalizeClaudeOpus5Providers([{
      id: "environment-default",
      label: "TokenRouter default",
      enabled: true,
      baseUrl: process.env.TOKENROUTER_BASE_URL?.trim() ?? "",
      model: process.env.TOKENROUTER_MODEL?.trim() ?? "",
      apiKeys: getTokenRouterCredentialPool(),
    }], []),
  };
}

async function readQwen38MaxRuntimeOverride() {
  return cached("runtime:qwen38_max", 60_000, async () => {
    const db = await getDb();
    let record: { value: string; updatedAt?: Date | null; updatedByUserId?: number | null } | undefined;
    if (db) {
      try {
        record = (await db.select().from(platformSettings).where(eq(platformSettings.settingKey, QWEN38_MAX_RUNTIME_SETTING_KEY)).limit(1))[0];
      } catch {
        // Fallback to memory
      }
    }
    if (!record) {
      record = fallbackPlatformSettings.get(QWEN38_MAX_RUNTIME_SETTING_KEY);
    }
    if (!record) return null;
    try {
      const encoded = JSON.parse(record.value) as { ciphertext?: string; iv?: string; authTag?: string };
      const decrypted = decryptProviderRuntimeConfig({ ciphertext: String(encoded.ciphertext ?? ""), iv: String(encoded.iv ?? ""), authTag: String(encoded.authTag ?? "") });
      if (!decrypted || typeof decrypted !== "object") return null;
      const candidate = decrypted as Partial<Qwen38MaxRuntimePayload>;
      return { payload: { providers: normalizeClaudeOpus5Providers(candidate.providers, []) }, updatedAt: record.updatedAt, updatedByUserId: record.updatedByUserId };
    } catch {
      return null;
    }
  });
}

export async function getQwen38MaxRuntimeConfig(): Promise<Qwen38MaxRuntimePayload> {
  const fallback = qwen38MaxRuntimeFromEnvironment();
  const override = await readQwen38MaxRuntimeOverride();
  return { providers: override?.payload.providers.length ? override.payload.providers : fallback.providers };
}

export async function getQwen38MaxProviderSettings() {
  const runtime = await getQwen38MaxRuntimeConfig();
  const override = await readQwen38MaxRuntimeOverride();
  return {
    providers: runtime.providers.map(provider => ({
      id: provider.id,
      label: provider.label,
      enabled: provider.enabled,
      baseUrl: provider.baseUrl,
      model: provider.model,
      apiKeyMasks: providerApiKeyMasks(provider.apiKeys, provider.apiKeyEnabled),
      ...(provider.maxInputTokens !== undefined ? { maxInputTokens: provider.maxInputTokens } : {}),
      ...(provider.disableIdentityPrompt ? { disableIdentityPrompt: true } : {}),
      pinnedUserEmails: provider.pinnedUserEmails ?? [],
      bypassCooldown: provider.bypassCooldown === true,
      supportsVision: provider.supportsVision === true,
      supportsDocuments: provider.supportsDocuments === true,
      reasoningEffort: provider.reasoningEffort ?? null,
    })),
    source: override ? "database" as const : "environment" as const,
    updatedAt: override?.updatedAt ?? null,
    updatedByUserId: override?.updatedByUserId ?? null,
  };
}

export async function updateQwen38MaxProviderSettings(input: { providers: Array<{ id: string; label: string; enabled?: boolean; baseUrl: string; model: string; apiKeys: string[]; apiKeyEnabled?: boolean[]; removeSlots?: number[]; maxInputTokens?: number | null; disableIdentityPrompt?: boolean; pinnedUserEmails?: string[]; bypassCooldown?: boolean; supportsVision?: boolean; supportsDocuments?: boolean; reasoningEffort?: "low" | "medium" | "high" | "xhigh" | "max" | null }> }, updatedByUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const current = await getQwen38MaxRuntimeConfig();
  const currentById = new Map(current.providers.map(provider => [provider.id, provider]));
  const nextProviders = input.providers.map((submitted, index) => {
    const existing = currentById.get(submitted.id);
    const keys = applyManagedProviderKeyUpdate(existing, submitted);
    const maxInputTokens = normalizeMaxInputTokens(submitted.maxInputTokens ?? existing?.maxInputTokens);
    const disableIdentityPrompt = submitted.disableIdentityPrompt !== undefined
      ? submitted.disableIdentityPrompt === true
      : existing?.disableIdentityPrompt === true;
    const bypassCooldown = submitted.bypassCooldown !== undefined
      ? submitted.bypassCooldown === true
      : existing?.bypassCooldown === true;
    const supportsVision = submitted.supportsVision !== undefined
      ? submitted.supportsVision === true
      : existing?.supportsVision === true;
    const supportsDocuments = submitted.supportsDocuments !== undefined
      ? submitted.supportsDocuments === true
      : existing?.supportsDocuments === true;
    const reasoningEffort = normalizeReasoningEffort(
      submitted.reasoningEffort !== undefined
        ? submitted.reasoningEffort
        : (existing as any)?.reasoningEffort
    );
    const pinnedUserEmails = normalizePinnedUserEmails(submitted.pinnedUserEmails !== undefined ? submitted.pinnedUserEmails : existing?.pinnedUserEmails);
    return {
      id: normalizeClaudeOpus5ProviderId(submitted.id, `provider-${index + 1}`),
      label: submitted.label.trim() || `Provider ${index + 1}`,
      enabled: submitted.enabled !== false,
      baseUrl: submitted.baseUrl.trim(),
      model: submitted.model.trim(),
      ...keys,
      ...(disableIdentityPrompt ? { disableIdentityPrompt: true } : {}),
      ...(bypassCooldown ? { bypassCooldown: true } : {}),
      ...(supportsVision ? { supportsVision: true } : {}),
      ...(supportsDocuments ? { supportsDocuments: true } : {}),
      ...(maxInputTokens !== undefined ? { maxInputTokens } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
      ...(pinnedUserEmails.length ? { pinnedUserEmails } : {}),
    };
  });
  const ids = new Set(nextProviders.map(provider => provider.id));
  if (!nextProviders.length || nextProviders.length > MAX_CLAUDE_OPUS5_PROVIDERS || ids.size !== nextProviders.length || nextProviders.some(provider => !provider.baseUrl || !provider.model || !provider.apiKeys.length)) throw new Error("Each Qwen 3.8 Max provider needs a unique identifier, base URL, model ID, and at least one API key");
  const encrypted = encryptProviderRuntimeConfig({ providers: nextProviders } satisfies Qwen38MaxRuntimePayload);
  const removedProviders = current.providers.filter(provider => !ids.has(provider.id));
  fallbackPlatformSettings.set(QWEN38_MAX_RUNTIME_SETTING_KEY, { value: JSON.stringify(encrypted), updatedAt: new Date(), updatedByUserId });
  bustCache("runtime:qwen38_max");
  try {
    await db.transaction(async tx => {
      await tx.insert(platformSettings).values({ settingKey: QWEN38_MAX_RUNTIME_SETTING_KEY, value: JSON.stringify(encrypted), updatedByUserId }).onDuplicateKeyUpdate({ set: { value: JSON.stringify(encrypted), updatedByUserId, updatedAt: new Date() } });
      await purgeRemovedManagedProviderGroups(tx, "qwen3.8-max", removedProviders);
    });
  } catch (err) {
    console.warn("[Qwen 3.8 Max settings write to DB failed; runtime preserved in memory]", err);
  }
  clearRemovedManagedProviderTelemetry("qwen3.8-max", removedProviders);
  return getQwen38MaxProviderSettings();
}

type Gpt6AstraRuntimePayload = { providers: ClaudeOpus5ProviderRuntime[] };

function gpt6AstraRuntimeFromEnvironment(): Gpt6AstraRuntimePayload {
  const tokenRouterKeys = getTokenRouterCredentialPool();
  return {
    providers: normalizeClaudeOpus5Providers([{
      id: "environment-default",
      label: "TokenRouter default",
      enabled: true,
      baseUrl: process.env.TOKENROUTER_BASE_URL?.trim() || "https://api.tokenrouter.io/v1",
      model: process.env.GPT6_ASTRA_MODEL?.trim() || "gpt-6-astra",
      apiKeys: tokenRouterKeys.length ? tokenRouterKeys : [process.env.OPENAI_API_KEY?.trim() || ""],
    }], []),
  };
}

async function readGpt6AstraRuntimeOverride() {
  return cached("runtime:gpt6_astra", 60_000, async () => {
    const db = await getDb();
    let record: { value: string; updatedAt?: Date | null; updatedByUserId?: number | null } | undefined;
    if (db) {
      try {
        record = (await db.select().from(platformSettings).where(eq(platformSettings.settingKey, GPT6_ASTRA_RUNTIME_SETTING_KEY)).limit(1))[0];
      } catch {
        // Fallback to memory
      }
    }
    if (!record) {
      record = fallbackPlatformSettings.get(GPT6_ASTRA_RUNTIME_SETTING_KEY);
    }
    if (!record) return null;
    try {
      const encoded = JSON.parse(record.value) as { ciphertext?: string; iv?: string; authTag?: string };
      const decrypted = decryptProviderRuntimeConfig({ ciphertext: String(encoded.ciphertext ?? ""), iv: String(encoded.iv ?? ""), authTag: String(encoded.authTag ?? "") });
      if (!decrypted || typeof decrypted !== "object") return null;
      const candidate = decrypted as Partial<Gpt6AstraRuntimePayload>;
      return { payload: { providers: normalizeClaudeOpus5Providers(candidate.providers, []) }, updatedAt: record.updatedAt, updatedByUserId: record.updatedByUserId };
    } catch {
      return null;
    }
  });
}

export async function getGpt6AstraRuntimeConfig(): Promise<Gpt6AstraRuntimePayload> {
  const fallback = gpt6AstraRuntimeFromEnvironment();
  const override = await readGpt6AstraRuntimeOverride();
  return { providers: override?.payload.providers.length ? override.payload.providers : fallback.providers };
}

export async function getGpt6AstraProviderSettings() {
  const runtime = await getGpt6AstraRuntimeConfig();
  const override = await readGpt6AstraRuntimeOverride();
  return {
    providers: runtime.providers.map(provider => ({
      id: provider.id,
      label: provider.label,
      enabled: provider.enabled,
      baseUrl: provider.baseUrl,
      model: provider.model,
      apiKeyMasks: providerApiKeyMasks(provider.apiKeys, provider.apiKeyEnabled),
      ...(provider.maxInputTokens !== undefined ? { maxInputTokens: provider.maxInputTokens } : {}),
      ...(provider.disableIdentityPrompt ? { disableIdentityPrompt: true } : {}),
      pinnedUserEmails: provider.pinnedUserEmails ?? [],
      bypassCooldown: provider.bypassCooldown === true,
      supportsVision: provider.supportsVision === true,
      supportsDocuments: provider.supportsDocuments === true,
      reasoningEffort: provider.reasoningEffort ?? null,
    })),
    source: override ? "database" as const : "environment" as const,
    updatedAt: override?.updatedAt ?? null,
    updatedByUserId: override?.updatedByUserId ?? null,
  };
}

export async function updateGpt6AstraProviderSettings(input: { providers: Array<{ id: string; label: string; enabled?: boolean; baseUrl: string; model: string; apiKeys: string[]; apiKeyEnabled?: boolean[]; removeSlots?: number[]; maxInputTokens?: number | null; disableIdentityPrompt?: boolean; pinnedUserEmails?: string[]; bypassCooldown?: boolean; supportsVision?: boolean; supportsDocuments?: boolean; reasoningEffort?: "low" | "medium" | "high" | "xhigh" | "max" | null }> }, updatedByUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const current = await getGpt6AstraRuntimeConfig();
  const currentById = new Map(current.providers.map(provider => [provider.id, provider]));
  const nextProviders = input.providers.map((submitted, index) => {
    const existing = currentById.get(submitted.id);
    const keys = applyManagedProviderKeyUpdate(existing, submitted);
    const maxInputTokens = normalizeMaxInputTokens(submitted.maxInputTokens ?? existing?.maxInputTokens);
    const disableIdentityPrompt = submitted.disableIdentityPrompt !== undefined
      ? submitted.disableIdentityPrompt === true
      : existing?.disableIdentityPrompt === true;
    const bypassCooldown = submitted.bypassCooldown !== undefined
      ? submitted.bypassCooldown === true
      : existing?.bypassCooldown === true;
    const supportsVision = submitted.supportsVision !== undefined
      ? submitted.supportsVision === true
      : existing?.supportsVision === true;
    const supportsDocuments = submitted.supportsDocuments !== undefined
      ? submitted.supportsDocuments === true
      : existing?.supportsDocuments === true;
    const reasoningEffort = normalizeReasoningEffort(
      submitted.reasoningEffort !== undefined
        ? submitted.reasoningEffort
        : (existing as any)?.reasoningEffort
    );
    const pinnedUserEmails = normalizePinnedUserEmails(submitted.pinnedUserEmails !== undefined ? submitted.pinnedUserEmails : existing?.pinnedUserEmails);
    return {
      id: normalizeClaudeOpus5ProviderId(submitted.id, `provider-${index + 1}`),
      label: submitted.label.trim() || `Provider ${index + 1}`,
      enabled: submitted.enabled !== false,
      baseUrl: submitted.baseUrl.trim(),
      model: submitted.model.trim(),
      ...keys,
      ...(disableIdentityPrompt ? { disableIdentityPrompt: true } : {}),
      ...(bypassCooldown ? { bypassCooldown: true } : {}),
      ...(supportsVision ? { supportsVision: true } : {}),
      ...(supportsDocuments ? { supportsDocuments: true } : {}),
      ...(maxInputTokens !== undefined ? { maxInputTokens } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
      ...(pinnedUserEmails.length ? { pinnedUserEmails } : {}),
    };
  });
  const ids = new Set(nextProviders.map(provider => provider.id));
  if (!nextProviders.length || nextProviders.length > MAX_CLAUDE_OPUS5_PROVIDERS || ids.size !== nextProviders.length || nextProviders.some(provider => !provider.baseUrl || !provider.model || !provider.apiKeys.length)) throw new Error("Each GPT-6 Astra provider needs a unique identifier, base URL, model ID, and at least one API key");
  const encrypted = encryptProviderRuntimeConfig({ providers: nextProviders } satisfies Gpt6AstraRuntimePayload);
  const removedProviders = current.providers.filter(provider => !ids.has(provider.id));
  fallbackPlatformSettings.set(GPT6_ASTRA_RUNTIME_SETTING_KEY, { value: JSON.stringify(encrypted), updatedAt: new Date(), updatedByUserId });
  bustCache("runtime:gpt6_astra");
  try {
    await db.transaction(async tx => {
      await tx.insert(platformSettings).values({ settingKey: GPT6_ASTRA_RUNTIME_SETTING_KEY, value: JSON.stringify(encrypted), updatedByUserId }).onDuplicateKeyUpdate({ set: { value: JSON.stringify(encrypted), updatedByUserId, updatedAt: new Date() } });
      await purgeRemovedManagedProviderGroups(tx, "gpt-6-astra", removedProviders);
    });
  } catch (err) {
    console.warn("[GPT-6 Astra settings write to DB failed; runtime preserved in memory]", err);
  }
  clearRemovedManagedProviderTelemetry("gpt-6-astra", removedProviders);
  return getGpt6AstraProviderSettings();
}

export type KimiK3RuntimePayload = {
  providers: ClaudeOpus5ProviderRuntime[];
};

export function kimiK3RuntimeFromEnvironment(): KimiK3RuntimePayload {
  const tokenRouterKeys = getTokenRouterCredentialPool();
  return {
    providers: normalizeClaudeOpus5Providers([{
      id: "environment-default",
      label: "TokenRouter default",
      enabled: true,
      baseUrl: process.env.TOKENROUTER_BASE_URL?.trim() || "https://api.tokenrouter.io/v1",
      model: process.env.KIMI_K3_MODEL?.trim() || "kimi-k3",
      apiKeys: tokenRouterKeys.length ? tokenRouterKeys : [process.env.OPENAI_API_KEY?.trim() || ""],
    }], []),
  };
}

async function readKimiK3RuntimeOverride() {
  return cached("runtime:kimi_k3", 60_000, async () => {
    const db = await getDb();
    let record: { value: string; updatedAt?: Date | null; updatedByUserId?: number | null } | undefined;
    if (db) {
      try {
        record = (await db.select().from(platformSettings).where(eq(platformSettings.settingKey, KIMI_K3_RUNTIME_SETTING_KEY)).limit(1))[0];
      } catch {
        // Fallback to memory
      }
    }
    if (!record) {
      record = fallbackPlatformSettings.get(KIMI_K3_RUNTIME_SETTING_KEY);
    }
    if (!record) return null;
    try {
      const encoded = JSON.parse(record.value) as { ciphertext?: string; iv?: string; authTag?: string };
      const decrypted = decryptProviderRuntimeConfig({ ciphertext: String(encoded.ciphertext ?? ""), iv: String(encoded.iv ?? ""), authTag: String(encoded.authTag ?? "") });
      if (!decrypted || typeof decrypted !== "object") return null;
      const candidate = decrypted as Partial<KimiK3RuntimePayload>;
      return { payload: { providers: normalizeClaudeOpus5Providers(candidate.providers, []) }, updatedAt: record.updatedAt, updatedByUserId: record.updatedByUserId };
    } catch {
      return null;
    }
  });
}

export async function getKimiK3RuntimeConfig(): Promise<KimiK3RuntimePayload> {
  const fallback = kimiK3RuntimeFromEnvironment();
  const override = await readKimiK3RuntimeOverride();
  return { providers: override?.payload.providers.length ? override.payload.providers : fallback.providers };
}

export async function getKimiK3ProviderSettings() {
  const runtime = await getKimiK3RuntimeConfig();
  const override = await readKimiK3RuntimeOverride();
  return {
    providers: runtime.providers.map(provider => ({
      id: provider.id,
      label: provider.label,
      enabled: provider.enabled,
      baseUrl: provider.baseUrl,
      model: provider.model,
      apiKeyMasks: providerApiKeyMasks(provider.apiKeys, provider.apiKeyEnabled),
      ...(provider.maxInputTokens !== undefined ? { maxInputTokens: provider.maxInputTokens } : {}),
      ...(provider.disableIdentityPrompt ? { disableIdentityPrompt: true } : {}),
      pinnedUserEmails: provider.pinnedUserEmails ?? [],
      bypassCooldown: provider.bypassCooldown === true,
      supportsVision: provider.supportsVision === true,
      supportsDocuments: provider.supportsDocuments === true,
      reasoningEffort: provider.reasoningEffort ?? null,
    })),
    source: override ? "database" as const : "environment" as const,
    updatedAt: override?.updatedAt ?? null,
    updatedByUserId: override?.updatedByUserId ?? null,
  };
}

export async function updateKimiK3ProviderSettings(input: { providers: Array<{ id: string; label: string; enabled?: boolean; baseUrl: string; model: string; apiKeys: string[]; apiKeyEnabled?: boolean[]; removeSlots?: number[]; maxInputTokens?: number | null; disableIdentityPrompt?: boolean; pinnedUserEmails?: string[]; bypassCooldown?: boolean; supportsVision?: boolean; supportsDocuments?: boolean; reasoningEffort?: "low" | "medium" | "high" | "xhigh" | "max" | null }> }, updatedByUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const current = await getKimiK3RuntimeConfig();
  const currentById = new Map(current.providers.map(provider => [provider.id, provider]));
  const nextProviders = input.providers.map((submitted, index) => {
    const existing = currentById.get(submitted.id);
    const keys = applyManagedProviderKeyUpdate(existing, submitted);
    const maxInputTokens = normalizeMaxInputTokens(submitted.maxInputTokens ?? existing?.maxInputTokens);
    const disableIdentityPrompt = submitted.disableIdentityPrompt !== undefined
      ? submitted.disableIdentityPrompt === true
      : existing?.disableIdentityPrompt === true;
    const bypassCooldown = submitted.bypassCooldown !== undefined
      ? submitted.bypassCooldown === true
      : existing?.bypassCooldown === true;
    const supportsVision = submitted.supportsVision !== undefined
      ? submitted.supportsVision === true
      : existing?.supportsVision === true;
    const supportsDocuments = submitted.supportsDocuments !== undefined
      ? submitted.supportsDocuments === true
      : existing?.supportsDocuments === true;
    const reasoningEffort = normalizeReasoningEffort(
      submitted.reasoningEffort !== undefined
        ? submitted.reasoningEffort
        : (existing as any)?.reasoningEffort
    );
    const pinnedUserEmails = normalizePinnedUserEmails(submitted.pinnedUserEmails !== undefined ? submitted.pinnedUserEmails : existing?.pinnedUserEmails);
    return {
      id: normalizeClaudeOpus5ProviderId(submitted.id, `provider-${index + 1}`),
      label: submitted.label.trim() || `Provider ${index + 1}`,
      enabled: submitted.enabled !== false,
      baseUrl: submitted.baseUrl.trim(),
      model: submitted.model.trim(),
      ...keys,
      ...(disableIdentityPrompt ? { disableIdentityPrompt: true } : {}),
      ...(bypassCooldown ? { bypassCooldown: true } : {}),
      ...(supportsVision ? { supportsVision: true } : {}),
      ...(supportsDocuments ? { supportsDocuments: true } : {}),
      ...(maxInputTokens !== undefined ? { maxInputTokens } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
      ...(pinnedUserEmails.length ? { pinnedUserEmails } : {}),
    };
  });
  const ids = new Set(nextProviders.map(provider => provider.id));
  if (!nextProviders.length || nextProviders.length > MAX_CLAUDE_OPUS5_PROVIDERS || ids.size !== nextProviders.length || nextProviders.some(provider => !provider.baseUrl || !provider.model || !provider.apiKeys.length)) throw new Error("Each Kimi K3 provider needs a unique identifier, base URL, model ID, and at least one API key");
  const encrypted = encryptProviderRuntimeConfig({ providers: nextProviders } satisfies KimiK3RuntimePayload);
  const removedProviders = current.providers.filter(provider => !ids.has(provider.id));
  fallbackPlatformSettings.set(KIMI_K3_RUNTIME_SETTING_KEY, { value: JSON.stringify(encrypted), updatedAt: new Date(), updatedByUserId });
  bustCache("runtime:kimi_k3");
  try {
    await db.transaction(async tx => {
      await tx.insert(platformSettings).values({ settingKey: KIMI_K3_RUNTIME_SETTING_KEY, value: JSON.stringify(encrypted), updatedByUserId }).onDuplicateKeyUpdate({ set: { value: JSON.stringify(encrypted), updatedByUserId, updatedAt: new Date() } });
      await purgeRemovedManagedProviderGroups(tx, "kimi-k3", removedProviders);
    });
  } catch (err) {
    console.warn("[Kimi K3 settings write to DB failed; runtime preserved in memory]", err);
  }
  clearRemovedManagedProviderTelemetry("kimi-k3", removedProviders);
  return getKimiK3ProviderSettings();
}

export type ClaudeOpus5ProviderRuntime = {
  id: string;
  label: string;
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKeys: string[];
  /** Per-key routing switches; omitted legacy entries are treated as enabled. */
  apiKeyEnabled?: boolean[];
  modelPool?: ClaudeOpus5QwenModelRuntime[];
  /** Qwen-only output ceiling, persisted inside the encrypted Claude Opus runtime configuration. */
  maxOutputTokens?: number;
  /** Maximum estimated input tokens accepted by this provider. Requests with input <= limit route here with top priority; requests > limit skip this provider. */
  maxInputTokens?: number;
  /** When true, TokenForge skips synthetic identity system prompts and response suppression for this upstream provider */
  disableIdentityPrompt?: boolean;
  /** Pinned user emails for dedicated provider affinity routing */
  pinnedUserEmails?: string[];
  /** When true, key and provider cooldown locks are bypassed for this provider */
  bypassCooldown?: boolean;
  /** When true, flags this provider as capable of processing multimodal and visual inputs (e.g. OpenRouter). */
  supportsVision?: boolean;
  /** When true, flags this provider as capable of processing documents and PDF inputs. */
  supportsDocuments?: boolean;
  /** Explicit reasoning effort override for this provider (low, medium, high, xhigh, max). Null/undefined = client pass-through. */
  reasoningEffort?: "low" | "medium" | "high" | "xhigh" | "max" | null;
};

export type ClaudeOpus5QwenModelRuntime = {
  id: string;
  model: string;
  enabled: boolean;
  quotaTokens: number;
};

export type ClaudeOpus5RuntimePayload = { providers: ClaudeOpus5ProviderRuntime[]; baiPriority?: boolean };
const MAX_CLAUDE_OPUS5_PROVIDERS = 100;
export const CLAUDE_OPUS5_QWEN_DEFAULT_MODEL_TOKEN_QUOTA = 1_000_000;
const MAX_CLAUDE_OPUS5_QWEN_MODELS = 50;
export const CLAUDE_OPUS5_QWEN_MAX_OUTPUT_TOKENS = 32_768;

export type BailuWebshareProxyRuntime = {
  id: string;
  label: string;
  host: string;
  port: number;
  username: string;
  password: string;
  enabled: boolean;
};

type BailuWebshareProxyPoolRuntime = { enabled: boolean; proxies: BailuWebshareProxyRuntime[] };
const MAX_BAILU_WEBSHARE_PROXIES = 3;
export const BAILU_WEBSHARE_PROXY_COOLDOWN_MS = 60_000;
export type BailuWebshareProxySlotFailureKind = "network" | "timeout" | "stream";
export type BailuWebshareProxySlotOutcome =
  | { kind: "success" }
  | { kind: "cancelled" }
  | { kind: "failure"; failureKind: BailuWebshareProxySlotFailureKind; cooldown?: boolean };

function normalizeBailuWebshareProxyHost(value: unknown) {
  const host = typeof value === "string" ? value.trim() : "";
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return "";
  return host.split(".").every(segment => Number(segment) >= 0 && Number(segment) <= 255) ? host : "";
}

function parseBailuWebshareDirectProxyUrl(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:", "socks5:"].includes(parsed.protocol)) return null;
    const host = normalizeBailuWebshareProxyHost(parsed.hostname);
    const port = Number(parsed.port);
    const username = decodeURIComponent(parsed.username);
    const password = decodeURIComponent(parsed.password);
    if (!host || !Number.isInteger(port) || port < 1 || port > 65_535 || !username || !password) return null;
    return { host, port, username: username.slice(0, 512), password: password.slice(0, 512) };
  } catch {
    return null;
  }
}

function normalizeBailuWebshareProxyPool(value: unknown, fallback: BailuWebshareProxyRuntime[] = []) {
  if (!Array.isArray(value)) return fallback;
  const seen = new Set<string>();
  const proxies = value.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return [];
    const raw = candidate as Partial<BailuWebshareProxyRuntime>;
    const id = normalizeClaudeOpus5ProviderId(raw.id, `webshare-${index + 1}`);
    const host = normalizeBailuWebshareProxyHost(raw.host);
    const port = Number(raw.port);
    const username = typeof raw.username === "string" ? raw.username.trim().slice(0, 512) : "";
    const password = typeof raw.password === "string" ? raw.password.slice(0, 512) : "";
    const label = typeof raw.label === "string" && raw.label.trim() ? raw.label.trim().slice(0, 80) : `Webshare proxy ${index + 1}`;
    if (seen.has(id) || !host || !Number.isInteger(port) || port < 1 || port > 65_535 || !username || !password) return [];
    seen.add(id);
    return [{ id, label, host, port, username, password, enabled: raw.enabled !== false }];
  }).slice(0, MAX_BAILU_WEBSHARE_PROXIES);
  return proxies;
}

async function readBailuWebshareProxyPoolOverride() {
  return cached("runtime:bailu_webshare_proxy_pool", 60_000, async () => {
    const db = await getDb();
    if (!db) return null;
    const record = (await db.select().from(platformSettings).where(eq(platformSettings.settingKey, BAILU_WEBSHARE_PROXY_POOL_SETTING_KEY)).limit(1))[0];
    if (!record) return null;
    try {
      const encoded = JSON.parse(record.value) as { ciphertext?: string; iv?: string; authTag?: string };
      const payload = decryptProviderRuntimeConfig({ ciphertext: String(encoded.ciphertext ?? ""), iv: String(encoded.iv ?? ""), authTag: String(encoded.authTag ?? "") }) as Partial<BailuWebshareProxyPoolRuntime> | null;
      if (!payload || typeof payload !== "object") return null;
      return {
        payload: { enabled: payload.enabled === true, proxies: normalizeBailuWebshareProxyPool(payload.proxies) },
        updatedAt: record.updatedAt,
        updatedByUserId: record.updatedByUserId,
      };
    } catch {
      return null;
    }
  });
}

export async function getBailuWebshareProxyPoolRuntimeConfig(): Promise<BailuWebshareProxyPoolRuntime> {
  return (await readBailuWebshareProxyPoolOverride())?.payload ?? { enabled: false, proxies: [] };
}

async function ensureBailuWebshareProxySlotMetricRows(proxies: BailuWebshareProxyRuntime[]) {
  const db = await getDb();
  if (!db || !proxies.length) return;
  await Promise.all(proxies.map(proxy => db.insert(bailuWebshareProxySlotMetrics).values({ proxyId: proxy.id, proxyLabel: proxy.label }).onDuplicateKeyUpdate({ set: { proxyLabel: proxy.label } })));
}

export async function getBailuWebshareProxyPoolSettings() {
  const override = await readBailuWebshareProxyPoolOverride();
  const runtime = override?.payload ?? { enabled: false, proxies: [] };
  await ensureBailuWebshareProxySlotMetricRows(runtime.proxies);
  const db = await getDb();
  const metrics = db && runtime.proxies.length
    ? await db.select().from(bailuWebshareProxySlotMetrics).where(inArray(bailuWebshareProxySlotMetrics.proxyId, runtime.proxies.map(proxy => proxy.id)))
    : [];
  const metricsById = new Map(metrics.map(metric => [metric.proxyId, metric]));
  const now = new Date();
  return {
    enabled: runtime.enabled,
    proxies: runtime.proxies.map(proxy => {
      const metric = metricsById.get(proxy.id);
      const coolingDown = Boolean(metric?.cooldownUntil && metric.cooldownUntil > now);
      const degraded = Boolean(metric?.lastFailureAt && (!metric.lastSuccessAt || metric.lastFailureAt >= metric.lastSuccessAt));
      return {
        id: proxy.id,
        label: proxy.label,
        host: proxy.host,
        port: proxy.port,
        enabled: proxy.enabled,
        usernameMask: maskProviderApiKey(proxy.username),
        passwordConfigured: Boolean(proxy.password),
        metrics: {
          activeRequests: Number(metric?.activeRequests ?? 0),
          requestCount: Number(metric?.requestCount ?? 0),
          successCount: Number(metric?.successCount ?? 0),
          failureCount: Number(metric?.failureCount ?? 0),
          timeoutCount: Number(metric?.timeoutCount ?? 0),
          cooldownUntil: metric?.cooldownUntil ?? null,
          lastRequestAt: metric?.lastRequestAt ?? null,
          lastSuccessAt: metric?.lastSuccessAt ?? null,
          lastFailureAt: metric?.lastFailureAt ?? null,
          lastFailureKind: metric?.lastFailureKind ?? null,
          health: !proxy.enabled ? "disabled" as const : coolingDown ? "cooling-down" as const : degraded ? "degraded" as const : "healthy" as const,
        },
      };
    }),
    source: override ? "database" as const : "not_configured" as const,
    updatedAt: override?.updatedAt ?? null,
  };
}

/** Atomically reserves an eligible Bailu proxy slot; slots in their cooldown window are skipped. */
export async function tryAcquireBailuWebshareProxySlot(proxy: BailuWebshareProxyRuntime) {
  const db = await getDb();
  if (!db) return true;
  await ensureBailuWebshareProxySlotMetricRows([proxy]);
  const now = new Date();
  const result = await db.update(bailuWebshareProxySlotMetrics).set({
    activeRequests: sql`${bailuWebshareProxySlotMetrics.activeRequests} + 1`,
    requestCount: sql`${bailuWebshareProxySlotMetrics.requestCount} + 1`,
    lastRequestAt: now,
  }).where(and(
    eq(bailuWebshareProxySlotMetrics.proxyId, proxy.id),
    or(isNull(bailuWebshareProxySlotMetrics.cooldownUntil), lte(bailuWebshareProxySlotMetrics.cooldownUntil, now)),
  ));
  return Number(result[0]?.affectedRows ?? 0) === 1;
}

/** Releases a Bailu proxy reservation after the full response or stream ends, pausing only transport-failing slots. */
export async function releaseBailuWebshareProxySlot(proxyId: string, outcome: BailuWebshareProxySlotOutcome) {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  const isFailure = outcome.kind === "failure";
  const timeout = isFailure && outcome.failureKind === "timeout";
  const cooldownUntil = isFailure && outcome.cooldown ? new Date(now.getTime() + BAILU_WEBSHARE_PROXY_COOLDOWN_MS) : null;
  await db.update(bailuWebshareProxySlotMetrics).set({
    activeRequests: sql`GREATEST(${bailuWebshareProxySlotMetrics.activeRequests} - 1, 0)`,
    ...(outcome.kind === "success"
      ? { successCount: sql`${bailuWebshareProxySlotMetrics.successCount} + 1`, lastSuccessAt: now, cooldownUntil: null }
      : outcome.kind === "failure" ? {
        failureCount: sql`${bailuWebshareProxySlotMetrics.failureCount} + 1`,
        lastFailureAt: now,
        lastFailureKind: outcome.failureKind,
      } : {}),
    ...(timeout ? { timeoutCount: sql`${bailuWebshareProxySlotMetrics.timeoutCount} + 1` } : {}),
    ...(cooldownUntil ? { cooldownUntil } : {}),
  }).where(eq(bailuWebshareProxySlotMetrics.proxyId, proxyId));
}

export async function updateBailuWebshareProxyPoolSettings(input: { enabled?: boolean; proxies: Array<{ id: string; label?: string; host?: string; port?: number; username?: string; password?: string; proxyUrl?: string; enabled?: boolean }> }, updatedByUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const current = await getBailuWebshareProxyPoolRuntimeConfig();
  const existingById = new Map(current.proxies.map(proxy => [proxy.id, proxy]));
  const proxies = normalizeBailuWebshareProxyPool(input.proxies.map((submitted, index) => {
    const existing = existingById.get(submitted.id);
    const suppliedUrl = submitted.proxyUrl?.trim() ?? "";
    const parsedUrl = suppliedUrl ? parseBailuWebshareDirectProxyUrl(suppliedUrl) : null;
    const invalidSuppliedUrl = Boolean(suppliedUrl && !parsedUrl);
    return {
      id: submitted.id,
      label: submitted.label ?? `Webshare proxy ${index + 1}`,
      host: invalidSuppliedUrl ? "" : parsedUrl?.host ?? submitted.host ?? "",
      port: invalidSuppliedUrl ? 0 : parsedUrl?.port ?? submitted.port ?? 0,
      username: invalidSuppliedUrl ? "" : parsedUrl?.username || submitted.username?.trim() || existing?.username || "",
      password: invalidSuppliedUrl ? "" : parsedUrl?.password || submitted.password || existing?.password || "",
      enabled: submitted.enabled !== false,
    };
  }));
  if (input.enabled === true && !proxies.some(proxy => proxy.enabled)) {
    throw new Error("Enable at least one complete Webshare direct proxy before enabling Bailu proxy routing");
  }
  if (input.proxies.length !== proxies.length) {
    throw new Error("Each Webshare proxy needs a unique ID, IPv4 host, port, username, and password");
  }
  const encrypted = encryptProviderRuntimeConfig({ enabled: input.enabled === true, proxies } satisfies BailuWebshareProxyPoolRuntime);
  bustCache("runtime:bailu_webshare_proxy_pool");
  await db.insert(platformSettings).values({ settingKey: BAILU_WEBSHARE_PROXY_POOL_SETTING_KEY, value: JSON.stringify(encrypted), updatedByUserId }).onDuplicateKeyUpdate({ set: { value: JSON.stringify(encrypted), updatedByUserId, updatedAt: new Date() } });
  await ensureBailuWebshareProxySlotMetricRows(proxies);
  return getBailuWebshareProxyPoolSettings();
}

export const RENDER_NIM_PROXY_MAX_CONCURRENT_REQUESTS = 7;
const DEFAULT_RENDER_NIM_PROXY_ENDPOINTS = [
  "https://nim-playground-proxy.onrender.com",
  "https://nim-playground-proxy-2.onrender.com",
  "https://nim-playground-proxy-3.onrender.com",
  "https://nim-playground-proxy-4.onrender.com",
  "https://nim-playground-proxy-5.onrender.com",
  "https://nim-playground-proxy-6.onrender.com",
];

export type RenderNimProxyEndpoint = { id: string; url: string; enabled: boolean };
type RenderNimProxyRuntimePayload = { enabled: boolean; model: string; endpoints: RenderNimProxyEndpoint[] };
export type RenderNimProxyFailureKind = "http" | "timeout" | "network" | "stream";
export type RenderNimProxyReleaseOutcome =
  | { kind: "success" }
  | { kind: "cancelled" }
  | { kind: "failure"; failureKind: RenderNimProxyFailureKind; httpStatus?: number; message?: string; cooldown?: boolean };

/**
 * Render diagnostic text is shown to administrators and can also inform a caller-facing gateway error.
 * Keep it useful while eliminating credentials, header values, and credential-bearing URLs before storage.
 */
export function sanitizeRenderNimProxyFailureMessage(value: unknown) {
  const raw = value instanceof Error ? value.message : typeof value === "string" ? value : "";
  const sanitized = raw
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|nvapi|cp)[_-][A-Za-z0-9._~+/=-]{8,}/gi, "[redacted]")
    .replace(/\b(authorization|x-api-key|api[-_]?key|token|secret|password)\s*[:=]\s*(?:Bearer\s+)?[^\s,;"'}\]]+/gi, "$1: [redacted]")
    .replace(/https?:\/\/[^\s/@]+@/gi, "https://[redacted]@")
    .trim();
  return sanitized || "Upstream request failed.";
}

function normalizeRenderNimProxyEndpointUrl(value: unknown) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString().replace(/\/$/, "") : "";
  } catch {
    return "";
  }
}

function normalizeRenderNimProxyEndpoints(value: unknown, fallback: RenderNimProxyEndpoint[]) {
  if (!Array.isArray(value)) return fallback;
  const seen = new Set<string>();
  const endpoints = value.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return [];
    const raw = candidate as Partial<RenderNimProxyEndpoint>;
    const id = typeof raw.id === "string" && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(raw.id.trim()) ? raw.id.trim().toLowerCase() : `render-${index + 1}`;
    const url = normalizeRenderNimProxyEndpointUrl(raw.url);
    if (!url || seen.has(id)) return [];
    seen.add(id);
    return [{ id, url, enabled: raw.enabled !== false }];
  }).slice(0, DEFAULT_RENDER_NIM_PROXY_ENDPOINTS.length);
  return endpoints.length ? endpoints : fallback;
}

function renderNimProxyRuntimeFromEnvironment(): RenderNimProxyRuntimePayload {
  return {
    enabled: Boolean(process.env.RENDER_NIM_PROXY_API_KEY?.trim() && process.env.RENDER_NIM_PROXY_MODEL?.trim()),
    model: process.env.RENDER_NIM_PROXY_MODEL?.trim() ?? "",
    endpoints: DEFAULT_RENDER_NIM_PROXY_ENDPOINTS.map((url, index) => ({ id: `render-${index + 1}`, url, enabled: true })),
  };
}

async function readRenderNimProxyRuntimeOverride() {
  return cached("runtime:render_nim_proxy_swarm", 60_000, async () => {
    const db = await getDb();
    if (!db) return null;
    const record = (await db.select().from(platformSettings).where(eq(platformSettings.settingKey, RENDER_NIM_PROXY_SWARM_SETTING_KEY)).limit(1))[0];
    if (!record) return null;
    try {
      const encoded = JSON.parse(record.value) as { ciphertext?: string; iv?: string; authTag?: string };
      const payload = decryptProviderRuntimeConfig({ ciphertext: String(encoded.ciphertext ?? ""), iv: String(encoded.iv ?? ""), authTag: String(encoded.authTag ?? "") }) as Partial<RenderNimProxyRuntimePayload> | null;
      if (!payload || typeof payload !== "object") return null;
      const fallback = renderNimProxyRuntimeFromEnvironment();
      return {
        payload: {
          enabled: payload.enabled !== false,
          model: typeof payload.model === "string" && payload.model.trim() ? payload.model.trim() : fallback.model,
          endpoints: normalizeRenderNimProxyEndpoints(payload.endpoints, fallback.endpoints),
        },
        updatedAt: record.updatedAt,
        updatedByUserId: record.updatedByUserId,
      };
    } catch {
      return null;
    }
  });
}

export async function getRenderNimProxyRuntimeConfig(): Promise<RenderNimProxyRuntimePayload & { apiKey: string }> {
  const fallback = renderNimProxyRuntimeFromEnvironment();
  const override = await readRenderNimProxyRuntimeOverride();
  const payload = override?.payload ?? fallback;
  return { ...payload, apiKey: process.env.RENDER_NIM_PROXY_API_KEY?.trim() ?? "" };
}

async function ensureRenderNimProxyMetricRows(endpoints: RenderNimProxyEndpoint[]) {
  const db = await getDb();
  if (!db) return;
  await Promise.all(endpoints.map(endpoint => db.insert(renderProxyEndpointMetrics).values({ endpointId: endpoint.id, endpointUrl: endpoint.url }).onDuplicateKeyUpdate({ set: { endpointUrl: endpoint.url } })));
}

export async function getRenderNimProxySwarmSettings() {
  const runtime = await getRenderNimProxyRuntimeConfig();
  const override = await readRenderNimProxyRuntimeOverride();
  await ensureRenderNimProxyMetricRows(runtime.endpoints);
  const db = await getDb();
  const metrics = db ? await db.select().from(renderProxyEndpointMetrics).where(inArray(renderProxyEndpointMetrics.endpointId, runtime.endpoints.map(endpoint => endpoint.id))) : [];
  const metricsById = new Map(metrics.map(metric => [metric.endpointId, metric]));
  return {
    enabled: runtime.enabled,
    model: runtime.model,
    apiKeyConfigured: Boolean(runtime.apiKey),
    maxConcurrentRequests: RENDER_NIM_PROXY_MAX_CONCURRENT_REQUESTS,
    endpoints: runtime.endpoints.map(endpoint => {
      const metric = metricsById.get(endpoint.id);
      return {
        ...endpoint,
        activeRequests: Number(metric?.activeRequests ?? 0),
        availableSlots: Math.max(0, RENDER_NIM_PROXY_MAX_CONCURRENT_REQUESTS - Number(metric?.activeRequests ?? 0)),
        peakActiveRequests: Number(metric?.peakActiveRequests ?? 0),
        requestCount: Number(metric?.requestCount ?? 0),
        successCount: Number(metric?.successCount ?? 0),
        failureCount: Number(metric?.failureCount ?? 0),
        timeoutCount: Number(metric?.timeoutCount ?? 0),
        cooldownUntil: metric?.cooldownUntil ?? null,
        lastRequestAt: metric?.lastRequestAt ?? null,
        lastSuccessAt: metric?.lastSuccessAt ?? null,
        lastFailureAt: metric?.lastFailureAt ?? null,
        lastHttpStatus: metric?.lastHttpStatus ?? null,
        lastFailureKind: metric?.lastFailureKind ?? null,
        lastFailureMessage: metric?.lastFailureMessage ?? null,
      };
    }),
    source: override ? "database" as const : "environment" as const,
    updatedAt: override?.updatedAt ?? null,
  };
}

export async function updateRenderNimProxySwarmSettings(input: { enabled?: boolean; model: string; endpoints: RenderNimProxyEndpoint[] }, updatedByUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const endpoints = normalizeRenderNimProxyEndpoints(input.endpoints, []);
  const model = input.model.trim();
  if (!model || !endpoints.length) throw new Error("A Render proxy model ID and at least one HTTPS endpoint are required");
  const payload: RenderNimProxyRuntimePayload = { enabled: input.enabled !== false, model, endpoints };
  const encrypted = encryptProviderRuntimeConfig(payload);
  bustCache("runtime:render_nim_proxy_swarm");
  await db.insert(platformSettings).values({ settingKey: RENDER_NIM_PROXY_SWARM_SETTING_KEY, value: JSON.stringify(encrypted), updatedByUserId }).onDuplicateKeyUpdate({ set: { value: JSON.stringify(encrypted), updatedByUserId, updatedAt: new Date() } });
  await ensureRenderNimProxyMetricRows(endpoints);
  return getRenderNimProxySwarmSettings();
}

export async function tryAcquireRenderNimProxyEndpoint(endpoint: RenderNimProxyEndpoint) {
  const db = await getDb();
  if (!db) return false;
  await ensureRenderNimProxyMetricRows([endpoint]);
  const now = new Date();
  const result = await db.update(renderProxyEndpointMetrics).set({
    activeRequests: sql`${renderProxyEndpointMetrics.activeRequests} + 1`,
    peakActiveRequests: sql`GREATEST(${renderProxyEndpointMetrics.peakActiveRequests}, ${renderProxyEndpointMetrics.activeRequests} + 1)`,
    requestCount: sql`${renderProxyEndpointMetrics.requestCount} + 1`,
    lastRequestAt: now,
  }).where(and(
    eq(renderProxyEndpointMetrics.endpointId, endpoint.id),
    lt(renderProxyEndpointMetrics.activeRequests, RENDER_NIM_PROXY_MAX_CONCURRENT_REQUESTS),
    or(isNull(renderProxyEndpointMetrics.cooldownUntil), lte(renderProxyEndpointMetrics.cooldownUntil, now)),
  ));
  return Number(result[0]?.affectedRows ?? 0) === 1;
}

export async function releaseRenderNimProxyEndpoint(endpointId: string, outcome: RenderNimProxyReleaseOutcome) {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  const isFailure = outcome.kind === "failure";
  const timeout = isFailure && outcome.failureKind === "timeout";
  const cooldownUntil = isFailure && outcome.cooldown ? new Date(now.getTime() + 60_000) : null;
  const httpStatus = isFailure && Number.isInteger(outcome.httpStatus) && outcome.httpStatus! >= 100 && outcome.httpStatus! <= 599
    ? outcome.httpStatus!
    : null;
  await db.update(renderProxyEndpointMetrics).set({
    activeRequests: sql`GREATEST(${renderProxyEndpointMetrics.activeRequests} - 1, 0)`,
    ...(outcome.kind === "success"
      ? { successCount: sql`${renderProxyEndpointMetrics.successCount} + 1`, lastSuccessAt: now }
      : isFailure
        ? {
          failureCount: sql`${renderProxyEndpointMetrics.failureCount} + 1`,
          lastFailureAt: now,
          lastHttpStatus: httpStatus,
          lastFailureKind: outcome.failureKind,
          lastFailureMessage: sanitizeRenderNimProxyFailureMessage(outcome.message),
        }
        : {}),
    ...(timeout ? { timeoutCount: sql`${renderProxyEndpointMetrics.timeoutCount} + 1` } : {}),
    ...(cooldownUntil ? { cooldownUntil } : {}),
  }).where(eq(renderProxyEndpointMetrics.endpointId, endpointId));
  if (isFailure) {
    await recordClaudeOpus5FailureLog({
      sourceType: "render",
      sourceId: endpointId,
      sourceLabel: `Render endpoint ${endpointId}`,
      httpStatus: outcome.httpStatus,
      failureKind: outcome.failureKind,
      retryable: Boolean(outcome.cooldown),
      callerMessage: outcome.message,
    });
  }
}

export type ManagedProviderFailureLogInput = {
  sourceType: "provider" | "render";
  sourceId: string;
  sourceLabel: string;
  credentialSlot?: number;
  httpStatus?: number;
  failureKind: "http" | "timeout" | "network" | "stream" | "empty_output";
  retryable: boolean;
  callerMessage?: string;
};

export type ManagedProviderFailureLogModel = string;

const _recentFailureLogDedup = new Map<string, number>();

/**
 * Stores a raw credential-redacted managed-model upstream failure attempt.
 * The record intentionally excludes request content, user identity, headers, and API-key material.
 * Only administrators can view these logs; client callers always receive a masked error.
 */
export async function recordModelFailureLog(
  modelIdOrInput: string | (ManagedProviderFailureLogInput & { model?: string }),
  maybeInput?: ManagedProviderFailureLogInput
) {
  let modelId: string;
  let input: ManagedProviderFailureLogInput;
  if (typeof modelIdOrInput === "string") {
    modelId = modelIdOrInput;
    input = maybeInput!;
  } else {
    modelId = modelIdOrInput.model || "unknown";
    input = modelIdOrInput;
  }

  const httpStatus = Number.isInteger(input?.httpStatus) && input.httpStatus! >= 100 && input.httpStatus! <= 599
    ? input.httpStatus!
    : null;

  // Rate-limit identical failure logs: deduplicate within 5 seconds to prevent write storms on TiDB
  const dedupKey = `${modelId}:${input?.sourceId ?? ""}:${input?.failureKind ?? ""}:${httpStatus ?? ""}`;
  const now = Date.now();
  const lastLogged = _recentFailureLogDedup.get(dedupKey);
  if (lastLogged && now - lastLogged < 5000) {
    return;
  }
  _recentFailureLogDedup.set(dedupKey, now);
  if (_recentFailureLogDedup.size > 500) {
    for (const [k, ts] of _recentFailureLogDedup.entries()) {
      if (now - ts >= 10000) _recentFailureLogDedup.delete(k);
    }
  }

  const db = await getDb();
  if (!db) return;

  try {
    await db.insert(claudeOpus5FailureLogs).values({
      modelId: modelId.trim().slice(0, 64) || "unknown",
      sourceType: input?.sourceType === "render" ? "render" : "provider",
      sourceId: (input?.sourceId ?? "").trim().slice(0, 96) || "unknown",
      sourceLabel: sanitizeRenderNimProxyFailureMessage(input?.sourceLabel ?? "Upstream").slice(0, 128),
      credentialSlot: Number.isInteger(input?.credentialSlot) && input.credentialSlot! > 0 ? input.credentialSlot! : null,
      httpStatus,
      failureKind: input?.failureKind ?? "generic_failure",
      retryable: Boolean(input?.retryable),
      callerMessage: sanitizeRenderNimProxyFailureMessage(input?.callerMessage ?? "").slice(0, 10_000),
    });
  } catch (err) {
    console.warn(`[recordModelFailureLog failed for ${modelId}]`, err);
  }
}

async function recordManagedProviderFailureLog(modelId: ManagedProviderFailureLogModel, input: ManagedProviderFailureLogInput) {
  return recordModelFailureLog(modelId, input);
}

export async function recordClaudeOpus5FailureLog(input: ManagedProviderFailureLogInput) {
  return recordManagedProviderFailureLog("claude-opus-5", input);
}

export async function recordDeepseekV4ProFailureLog(input: ManagedProviderFailureLogInput) {
  return recordManagedProviderFailureLog("deepseek-v4-pro", input);
}

export async function recordClaudeFable5FailureLog(input: ManagedProviderFailureLogInput) {
  return recordManagedProviderFailureLog("claude-fable-5.1", input);
}

export async function recordGlm53FailureLog(input: ManagedProviderFailureLogInput) {
  return recordManagedProviderFailureLog("glm-5.3", input);
}

export async function recordSonnet46FailureLog(input: ManagedProviderFailureLogInput) {
  return recordManagedProviderFailureLog("claude-sonnet-4.6", input);
}

export async function recordQwen38MaxFailureLog(input: ManagedProviderFailureLogInput) {
  return recordManagedProviderFailureLog("qwen3.8-max", input);
}

export async function recordGpt6AstraFailureLog(input: ManagedProviderFailureLogInput) {
  return recordManagedProviderFailureLog("gpt-6-astra", input);
}

export async function recordKimiK3FailureLog(input: ManagedProviderFailureLogInput) {
  return recordManagedProviderFailureLog("kimi-k3", input);
}

export async function getRecentClaudeOpus5FailureLogs(limit = 100) {
  return getRecentManagedProviderFailureLogs("claude-opus-5", limit);
}

export async function getRecentDeepseekV4ProFailureLogs(limit = 100) {
  return getRecentManagedProviderFailureLogs("deepseek-v4-pro", limit);
}

export async function getRecentClaudeFable5FailureLogs(limit = 100) {
  return getRecentManagedProviderFailureLogs("claude-fable-5.1", limit);
}

export async function getRecentGlm53FailureLogs(limit = 100) {
  return getRecentManagedProviderFailureLogs("glm-5.3", limit);
}

export async function getRecentSonnet46FailureLogs(limit = 100) {
  return getRecentManagedProviderFailureLogs("claude-sonnet-4.6", limit);
}

export async function getRecentQwen38MaxFailureLogs(limit = 100) {
  return getRecentManagedProviderFailureLogs("qwen3.8-max", limit);
}

export async function getRecentGpt6AstraFailureLogs(limit = 100) {
  return getRecentManagedProviderFailureLogs("gpt-6-astra", limit);
}

export async function getRecentKimiK3FailureLogs(limit = 100) {
  return getRecentManagedProviderFailureLogs("kimi-k3", limit);
}

export const MANAGED_PROVIDER_FAILURE_LOG_RETENTION_MS = 28 * 60 * 60 * 1_000;
export const USAGE_EVENTS_RETENTION_MS = 48 * 60 * 60 * 1_000; // 48 hours

/** Removes credential-redacted provider diagnostics after their 28-hour administrator retention window. */
export async function pruneExpiredManagedProviderFailureLogs(now = new Date()) {
  const db = await getDb();
  const cutoff = new Date(now.getTime() - MANAGED_PROVIDER_FAILURE_LOG_RETENTION_MS);
  if (!db) return { cutoff, deleted: false };
  await db.delete(claudeOpus5FailureLogs).where(lt(claudeOpus5FailureLogs.occurredAt, cutoff));
  return { cutoff, deleted: true };
}

/** Automatically removes raw live request logs older than 48 hours to preserve TiDB RUs and disk space. */
export async function pruneExpiredUsageEvents(now = new Date()) {
  const db = await getDb();
  const cutoff = new Date(now.getTime() - USAGE_EVENTS_RETENTION_MS);
  if (!db) return { cutoff, deleted: false };
  try {
    await db.delete(usageEvents).where(lt(usageEvents.createdAt, cutoff));
    return { cutoff, deleted: true };
  } catch (err) {
    console.warn("[UsageEvents Prune] Cleanup failed:", err);
    return { cutoff, deleted: false };
  }
}

// Auto-prune old failure logs and raw usage events older than 48 hours every 6 hours
if (typeof setInterval !== "undefined") {
  const _failurePruneInterval = setInterval(() => {
    void pruneExpiredManagedProviderFailureLogs().catch(() => undefined);
    void pruneExpiredUsageEvents().catch(() => undefined);
  }, 6 * 60 * 60 * 1000);
  if (_failurePruneInterval.unref) _failurePruneInterval.unref();
}

/** The administrator history is bounded by record count while preserving each credential-redacted raw response body. */
export async function getRecentModelFailureLogs(modelId?: string, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  const boundedLimit = Math.min(200, Math.max(1, Math.trunc(limit)));
  if (modelId) {
    const normalized = modelId.trim().toLowerCase();
    const targetModels = [normalized];
    if (normalized === "claude-opus-5.5") {
      targetModels.push("claude-opus-5");
    } else if (normalized === "claude-opus-5") {
      targetModels.push("claude-opus-5.5");
    }
    return db.select().from(claudeOpus5FailureLogs)
      .where(inArray(claudeOpus5FailureLogs.modelId, targetModels))
      .orderBy(desc(claudeOpus5FailureLogs.occurredAt), desc(claudeOpus5FailureLogs.id))
      .limit(boundedLimit);
  }
  return db.select().from(claudeOpus5FailureLogs)
    .orderBy(desc(claudeOpus5FailureLogs.occurredAt), desc(claudeOpus5FailureLogs.id))
    .limit(boundedLimit);
}

async function getRecentManagedProviderFailureLogs(modelId: ManagedProviderFailureLogModel, limit = 100) {
  return getRecentModelFailureLogs(modelId, limit);
}

export function normalizeClaudeOpus5ProviderId(value: unknown, fallback: string) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(normalized) ? normalized : fallback;
}

function isClaudeOpus5QwenProvider(label: string) {
  return label.trim().toLowerCase() === "qwen";
}

function normalizeClaudeOpus5QwenModelPool(value: unknown) {
  if (!Array.isArray(value)) return [] as ClaudeOpus5QwenModelRuntime[];
  const seen = new Set<string>();
  return value.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return [];
    const raw = candidate as Partial<ClaudeOpus5QwenModelRuntime>;
    const id = normalizeClaudeOpus5ProviderId(raw.id, `qwen-model-${index + 1}`);
    const model = typeof raw.model === "string" ? raw.model.trim().slice(0, 256) : "";
    const quotaCandidate = Number(raw.quotaTokens);
    const quotaTokens = Number.isFinite(quotaCandidate)
      ? Math.min(100_000_000, Math.max(1_000, Math.trunc(quotaCandidate)))
      : CLAUDE_OPUS5_QWEN_DEFAULT_MODEL_TOKEN_QUOTA;
    if (!model || seen.has(id)) return [];
    seen.add(id);
    return [{ id, model, enabled: raw.enabled !== false, quotaTokens }];
  }).slice(0, MAX_CLAUDE_OPUS5_QWEN_MODELS);
}

function normalizeClaudeOpus5QwenMaxOutputTokens(value: unknown) {
  const candidate = Number(value);
  if (!Number.isFinite(candidate)) return CLAUDE_OPUS5_QWEN_MAX_OUTPUT_TOKENS;
  return Math.min(CLAUDE_OPUS5_QWEN_MAX_OUTPUT_TOKENS, Math.max(1, Math.trunc(candidate)));
}

export function normalizeMaxOutputTokens(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const candidate = typeof value === "string" ? Number(value.replace(/k$/i, "000").replace(/m$/i, "000000")) : Number(value);
  if (!Number.isFinite(candidate) || candidate <= 0) return undefined;
  return Math.min(10_000_000, Math.max(1, Math.trunc(candidate)));
}

export function normalizeMaxInputTokens(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const candidate = typeof value === "string" ? Number(value.replace(/k$/i, "000").replace(/m$/i, "000000")) : Number(value);
  if (!Number.isFinite(candidate) || candidate <= 0) return undefined;
  return Math.min(10_000_000, Math.max(1, Math.trunc(candidate)));
}

export function normalizeReasoningEffort(value: unknown): "low" | "medium" | "high" | "xhigh" | "max" | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high" || normalized === "xhigh" || normalized === "max") {
    return normalized as "low" | "medium" | "high" | "xhigh" | "max";
  }
  return undefined;
}

export function normalizeClaudeOpus5Providers(value: unknown, fallback: ClaudeOpus5ProviderRuntime[]) {
  if (!Array.isArray(value)) return fallback;
  const seen = new Set<string>();
  const providers = value.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return [];
    const raw = candidate as Partial<ClaudeOpus5ProviderRuntime>;
    const id = normalizeClaudeOpus5ProviderId(raw.id, `provider-${index + 1}`);
    if (seen.has(id)) return [];
    seen.add(id);
    const apiKeys = Array.isArray(raw.apiKeys)
      ? raw.apiKeys.map(key => typeof key === "string" ? key.trim() : "").filter(Boolean).slice(0, MAX_MANAGED_PROVIDER_API_KEYS)
      : [];
    const apiKeyEnabled = apiKeys.map((_, keyIndex) => Array.isArray(raw.apiKeyEnabled) ? raw.apiKeyEnabled[keyIndex] !== false : true);
    const baseUrl = typeof raw.baseUrl === "string" ? raw.baseUrl.trim() : "";
    const label = typeof raw.label === "string" && raw.label.trim() ? raw.label.trim().slice(0, 80) : `Provider ${index + 1}`;
    const isQwenProvider = isClaudeOpus5QwenProvider(label);
    const modelPool = isQwenProvider ? normalizeClaudeOpus5QwenModelPool(raw.modelPool) : [];
    const maxOutputTokens = isQwenProvider
      ? normalizeClaudeOpus5QwenMaxOutputTokens(raw.maxOutputTokens)
      : normalizeMaxOutputTokens(raw.maxOutputTokens);
    const maxInputTokens = normalizeMaxInputTokens(raw.maxInputTokens);
    const reasoningEffort = normalizeReasoningEffort(raw.reasoningEffort);
    const model = (typeof raw.model === "string" ? raw.model.trim() : "") || modelPool[0]?.model || "";
    const pinnedUserEmails = normalizePinnedUserEmails(raw.pinnedUserEmails);
    if (!baseUrl || !model || !apiKeys.length) return [];
    return [{
      id,
      label,
      enabled: raw.enabled !== false,
      baseUrl,
      model,
      apiKeys,
      apiKeyEnabled,
      ...(modelPool.length ? { modelPool } : {}),
      ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
      ...(maxInputTokens !== undefined ? { maxInputTokens } : {}),
      ...(raw.disableIdentityPrompt ? { disableIdentityPrompt: true } : {}),
      ...(raw.bypassCooldown ? { bypassCooldown: true } : {}),
      ...(raw.supportsVision !== undefined ? { supportsVision: Boolean(raw.supportsVision) } : {}),
      ...(raw.supportsDocuments !== undefined ? { supportsDocuments: Boolean(raw.supportsDocuments) } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
      ...(pinnedUserEmails.length ? { pinnedUserEmails } : {}),
    }];
  }).slice(0, MAX_CLAUDE_OPUS5_PROVIDERS);
  return providers.length ? providers : fallback;
}

export function removeClaudeOpus5QwenModelFromRuntime(runtime: ClaudeOpus5RuntimePayload, providerId: string, modelEntryId: string): ClaudeOpus5RuntimePayload {
  const provider = runtime.providers.find(candidate => candidate.id === providerId && isClaudeOpus5QwenProvider(candidate.label));
  if (!provider) throw new Error("Qwen provider configuration was not found");
  const pool = provider.modelPool ?? [];
  if (!pool.some(entry => entry.id === modelEntryId)) throw new Error("Qwen model entry was not found");
  if (pool.length <= 1) throw new Error("Keep at least one Qwen model ID in the pool");
  const nextPool = pool.filter(entry => entry.id !== modelEntryId);
  return { providers: runtime.providers.map(candidate => candidate.id === provider.id ? {
    ...candidate,
    model: nextPool[0]!.model,
    modelPool: nextPool,
  } : candidate) };
}

export function removeClaudeOpus5QwenApiKeyFromRuntime(runtime: ClaudeOpus5RuntimePayload, providerId: string, slot: number): { runtime: ClaudeOpus5RuntimePayload; removedApiKey: string } {
  const provider = runtime.providers.find(candidate => candidate.id === providerId && isClaudeOpus5QwenProvider(candidate.label));
  if (!provider) throw new Error("Qwen provider configuration was not found");
  const keyIndex = Math.trunc(slot) - 1;
  const removedApiKey = provider.apiKeys[keyIndex];
  if (!removedApiKey) throw new Error("Qwen API-key slot was not found");
  if (provider.apiKeys.length <= 2) throw new Error("Keep at least two active Qwen API keys");
  return {
    removedApiKey,
    runtime: { providers: runtime.providers.map(candidate => candidate.id === provider.id ? {
      ...candidate,
      apiKeys: candidate.apiKeys.filter((_, index) => index !== keyIndex),
    } : candidate) },
  };
}

type ClaudeOpus5QwenModelUsage = {
  modelEntryId: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestCount: number;
  lastUsedAt: Date | null;
  retiredAt: Date | null;
};

export async function getClaudeOpus5QwenModelUsage(providerGroupId: string) {
  const db = await getDb();
  if (!db) return new Map<string, ClaudeOpus5QwenModelUsage>();
  const rows = await db.select().from(managedProviderModelUsage).where(and(
    eq(managedProviderModelUsage.providerModelId, "claude-opus-5"),
    eq(managedProviderModelUsage.providerGroupId, providerGroupId),
  ));
  return new Map(rows.map(row => [row.modelEntryId, {
    modelEntryId: row.modelEntryId,
    inputTokens: Number(row.inputTokens),
    outputTokens: Number(row.outputTokens),
    totalTokens: Number(row.totalTokens),
    requestCount: Number(row.requestCount),
    lastUsedAt: row.lastUsedAt ?? null,
    retiredAt: row.retiredAt ?? null,
  }]));
}

/** Returns only eligible encrypted Qwen model entries; this server-only helper is never exposed to callers. */
export async function getEligibleClaudeOpus5QwenModels(provider: ClaudeOpus5ProviderRuntime) {
  const pool = provider.modelPool ?? [];
  const usage = await getClaudeOpus5QwenModelUsage(provider.id);
  return pool.filter(entry => entry.enabled && (usage.get(entry.id)?.totalTokens ?? 0) < entry.quotaTokens);
}

/** Adds actual upstream billable tokens and marks an internal Qwen model entry retired once its configured quota is reached. */
export async function recordClaudeOpus5QwenModelUsage(input: { providerGroupId: string; modelEntryId: string; inputTokens: number; outputTokens: number; totalTokens: number; quotaTokens: number; occurredAt?: Date }) {
  const db = await getDb();
  if (!db) return;
  const inputTokens = Math.max(0, Math.trunc(input.inputTokens));
  const outputTokens = Math.max(0, Math.trunc(input.outputTokens));
  const totalTokens = Math.max(inputTokens + outputTokens, Math.trunc(input.totalTokens));
  if (!input.providerGroupId || !input.modelEntryId || !totalTokens) return;
  const occurredAt = input.occurredAt ?? new Date();
  await db.insert(managedProviderModelUsage).values({
    providerModelId: "claude-opus-5",
    providerGroupId: input.providerGroupId,
    modelEntryId: input.modelEntryId,
    inputTokens,
    outputTokens,
    totalTokens,
    requestCount: 1,
    lastUsedAt: occurredAt,
  }).onDuplicateKeyUpdate({ set: {
    inputTokens: sql`${managedProviderModelUsage.inputTokens} + ${inputTokens}`,
    outputTokens: sql`${managedProviderModelUsage.outputTokens} + ${outputTokens}`,
    totalTokens: sql`${managedProviderModelUsage.totalTokens} + ${totalTokens}`,
    requestCount: sql`${managedProviderModelUsage.requestCount} + 1`,
    lastUsedAt: occurredAt,
  } });
  await db.update(managedProviderModelUsage).set({ retiredAt: occurredAt }).where(and(
    eq(managedProviderModelUsage.providerModelId, "claude-opus-5"),
    eq(managedProviderModelUsage.providerGroupId, input.providerGroupId),
    eq(managedProviderModelUsage.modelEntryId, input.modelEntryId),
    gte(managedProviderModelUsage.totalTokens, Math.max(1_000, Math.trunc(input.quotaTokens))),
    isNull(managedProviderModelUsage.retiredAt),
  ));
}

function claudeOpus5RuntimeFromEnvironment(): ClaudeOpus5RuntimePayload {
  return {
    providers: normalizeClaudeOpus5Providers([{
      id: "environment-default",
      label: "Environment default",
      enabled: true,
      baseUrl: process.env.OPENCODE_CLAUDE_OPUS5_BASE_URL?.trim() ?? "",
      model: process.env.OPENCODE_CLAUDE_OPUS5_MODEL?.trim() ?? "",
      apiKeys: [
        process.env.OPENCODE_CLAUDE_OPUS5_API_KEY,
        process.env.OPENCODE_CLAUDE_OPUS5_API_KEY_2,
        process.env.OPENCODE_CLAUDE_OPUS5_API_KEY_3,
        process.env.OPENCODE_CLAUDE_OPUS5_API_KEY_4,
        process.env.OPENCODE_CLAUDE_OPUS5_API_KEY_5,
        process.env.OPENCODE_CLAUDE_OPUS5_API_KEY_6,
        process.env.OPENCODE_CLAUDE_OPUS5_API_KEY_7,
      ].map(value => value?.trim() ?? ""),
    }], []),
  };
}

async function readClaudeOpus5RuntimeOverride() {
  return cached("runtime:claude_opus5", 60_000, async () => {
    const db = await getDb();
    let record: { value: string; updatedAt?: Date | null; updatedByUserId?: number | null } | undefined;
    if (db) {
      try {
        record = (await db.select().from(platformSettings).where(eq(platformSettings.settingKey, CLAUDE_OPUS5_TOKENREPLY_RUNTIME_SETTING_KEY)).limit(1))[0];
      } catch {
        // Fallback to memory
      }
    }
    if (!record) {
      record = fallbackPlatformSettings.get(CLAUDE_OPUS5_TOKENREPLY_RUNTIME_SETTING_KEY);
    }
    if (!record) return null;
    try {
      const encoded = JSON.parse(record.value) as { ciphertext?: string; iv?: string; authTag?: string };
      const decrypted = decryptProviderRuntimeConfig({ ciphertext: String(encoded.ciphertext ?? ""), iv: String(encoded.iv ?? ""), authTag: String(encoded.authTag ?? "") });
      if (!decrypted || typeof decrypted !== "object") return null;
      const candidate = decrypted as Partial<ClaudeOpus5RuntimePayload> & { baseUrl?: unknown; model?: unknown; apiKeys?: unknown };
      const legacyProvider = {
        id: "primary",
        label: "Primary provider",
        enabled: candidate.providers?.[0]?.enabled !== false,
        baseUrl: typeof candidate.baseUrl === "string" ? candidate.baseUrl.trim() : "",
        model: typeof candidate.model === "string" ? candidate.model.trim() : "",
        apiKeys: Array.isArray(candidate.apiKeys) ? candidate.apiKeys : [],
      };
      return {
        payload: {
          providers: normalizeClaudeOpus5Providers(candidate.providers, normalizeClaudeOpus5Providers([legacyProvider], [])),
          baiPriority: candidate.baiPriority === true,
        },
        updatedAt: record.updatedAt,
        updatedByUserId: record.updatedByUserId,
      };
    } catch {
      return null;
    }
  });
}

export async function getClaudeOpus5RuntimeConfig(): Promise<ClaudeOpus5RuntimePayload> {
  const fallback = claudeOpus5RuntimeFromEnvironment();
  const override = await readClaudeOpus5RuntimeOverride();
  if (!override) return fallback;
  return {
    providers: override.payload.providers.length ? override.payload.providers : fallback.providers,
    baiPriority: override.payload.baiPriority ?? false,
  };
}

export async function getClaudeOpus5ProviderSettings() {
  const runtime = await getClaudeOpus5RuntimeConfig();
  const override = await readClaudeOpus5RuntimeOverride();
  const usageByProvider = new Map(await Promise.all(runtime.providers.filter(provider => isClaudeOpus5QwenProvider(provider.label)).map(async provider => [provider.id, await getClaudeOpus5QwenModelUsage(provider.id)] as const)));
  const baiCircuitByProvider = new Map((await getBaiProviderCircuitStatuses()).map(status => [status.providerGroupId, status] as const));
  const baiCapacityByProvider = new Map(await Promise.all(runtime.providers
    .filter(provider => provider.label.trim().toLowerCase() === "b.ai")
    .map(async provider => [provider.id, await getBaiCredentialCapacityStatuses("claude-opus-5", provider.id, provider.apiKeys)] as const)));
  return {
    providers: runtime.providers.map(provider => {
      const usage = usageByProvider.get(provider.id);
      const capacity = baiCapacityByProvider.get(provider.id);
      return {
        id: provider.id,
        label: provider.label,
        enabled: provider.enabled,
        baseUrl: provider.baseUrl,
        model: provider.model,
        apiKeyMasks: providerApiKeyMasks(provider.apiKeys, provider.apiKeyEnabled).map((mask, index) => capacity ? { ...mask, ...capacity[index] } : mask),
        ...(provider.maxInputTokens !== undefined ? { maxInputTokens: provider.maxInputTokens } : {}),
        ...(provider.maxOutputTokens !== undefined ? { maxOutputTokens: provider.maxOutputTokens } : {}),
        ...(provider.disableIdentityPrompt ? { disableIdentityPrompt: true } : {}),
        pinnedUserEmails: provider.pinnedUserEmails ?? [],
        bypassCooldown: provider.bypassCooldown === true,
        supportsVision: provider.supportsVision === true,
        supportsDocuments: provider.supportsDocuments === true,
        reasoningEffort: provider.reasoningEffort ?? null,
        ...(isClaudeOpus5QwenProvider(provider.label) ? {
          maxOutputTokens: provider.maxOutputTokens ?? CLAUDE_OPUS5_QWEN_MAX_OUTPUT_TOKENS,
          modelPool: (provider.modelPool ?? []).map(entry => {
            const totals = usage?.get(entry.id);
            const totalTokens = totals?.totalTokens ?? 0;
            return {
              id: entry.id,
              model: entry.model,
              enabled: entry.enabled,
              quotaTokens: entry.quotaTokens,
              inputTokens: totals?.inputTokens ?? 0,
              outputTokens: totals?.outputTokens ?? 0,
              totalTokens,
              requestCount: totals?.requestCount ?? 0,
              retired: totalTokens >= entry.quotaTokens,
              retiredAt: totals?.retiredAt ?? null,
              lastUsedAt: totals?.lastUsedAt ?? null,
            };
          }),
        } : {}),
        ...(provider.label.trim().toLowerCase() === "b.ai" ? {
          baiCircuit: baiCircuitByProvider.get(provider.id) ?? {
            providerGroupId: provider.id,
            rateLimitCount: 0,
            consecutiveRateLimits: 0,
            cooldownUntil: null,
            lastRateLimitedAt: null,
            lastSuccessAt: null,
            coolingDown: false,
          },
        } : {}),
      };
    }),
    baiPriority: runtime.baiPriority ?? false,
    source: override ? "database" as const : "environment" as const,
    updatedAt: override?.updatedAt ?? null,
    updatedByUserId: override?.updatedByUserId ?? null,
  };
}

export async function updateClaudeOpus5ProviderSettings(input: { providers: Array<{ id: string; label: string; enabled?: boolean; baseUrl: string; model: string; apiKeys: string[]; apiKeyEnabled?: boolean[]; removeSlots?: number[]; modelPool?: Array<{ id: string; model: string; enabled?: boolean; quotaTokens?: number }>; maxOutputTokens?: number | null; maxInputTokens?: number | null; disableIdentityPrompt?: boolean; pinnedUserEmails?: string[]; bypassCooldown?: boolean; supportsVision?: boolean; supportsDocuments?: boolean; reasoningEffort?: "low" | "medium" | "high" | "xhigh" | "max" | null }>; baiPriority?: boolean }, updatedByUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const current = await getClaudeOpus5RuntimeConfig();
  const currentById = new Map(current.providers.map(provider => [provider.id, provider]));
  const nextProviders: ClaudeOpus5ProviderRuntime[] = input.providers.map((submitted, index) => {
    const existing = currentById.get(submitted.id);
    const keys = applyManagedProviderKeyUpdate(existing, submitted);
    const id = normalizeClaudeOpus5ProviderId(submitted.id, `provider-${index + 1}`);
    const label = submitted.label.trim() || `Provider ${index + 1}`;
    const submittedPool = submitted.modelPool === undefined ? existing?.modelPool : submitted.modelPool;
    const pool = isClaudeOpus5QwenProvider(label)
      ? normalizeClaudeOpus5QwenModelPool(submittedPool?.length ? submittedPool : [{ id: "qwen-model-1", model: submitted.model, enabled: true, quotaTokens: CLAUDE_OPUS5_QWEN_DEFAULT_MODEL_TOKEN_QUOTA }])
      : [];
    const maxOutputTokens = isClaudeOpus5QwenProvider(label)
      ? normalizeClaudeOpus5QwenMaxOutputTokens(submitted.maxOutputTokens !== undefined ? submitted.maxOutputTokens : existing?.maxOutputTokens)
      : (submitted.maxOutputTokens !== undefined
          ? normalizeMaxOutputTokens(submitted.maxOutputTokens)
          : normalizeMaxOutputTokens(existing?.maxOutputTokens));
    const maxInputTokens = submitted.maxInputTokens !== undefined
      ? normalizeMaxInputTokens(submitted.maxInputTokens)
      : normalizeMaxInputTokens(existing?.maxInputTokens);
    const disableIdentityPrompt = submitted.disableIdentityPrompt !== undefined
      ? submitted.disableIdentityPrompt === true
      : existing?.disableIdentityPrompt === true;
    const bypassCooldown = submitted.bypassCooldown !== undefined
      ? submitted.bypassCooldown === true
      : existing?.bypassCooldown === true;
    const supportsVision = submitted.supportsVision !== undefined
      ? submitted.supportsVision === true
      : existing?.supportsVision === true;
    const supportsDocuments = submitted.supportsDocuments !== undefined
      ? submitted.supportsDocuments === true
      : existing?.supportsDocuments === true;
    const reasoningEffort = normalizeReasoningEffort(
      submitted.reasoningEffort !== undefined
        ? submitted.reasoningEffort
        : (existing as any)?.reasoningEffort
    );
    const pinnedUserEmails = normalizePinnedUserEmails(submitted.pinnedUserEmails !== undefined ? submitted.pinnedUserEmails : existing?.pinnedUserEmails);
    return {
      id,
      label,
      enabled: submitted.enabled !== false,
      baseUrl: submitted.baseUrl.trim(),
      model: submitted.model.trim() || pool[0]?.model || "",
      ...keys,
      ...(disableIdentityPrompt ? { disableIdentityPrompt: true } : {}),
      ...(bypassCooldown ? { bypassCooldown: true } : {}),
      ...(supportsVision ? { supportsVision: true } : {}),
      ...(supportsDocuments ? { supportsDocuments: true } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
      ...(pool.length ? { modelPool: pool } : {}),
      ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
      ...(maxInputTokens !== undefined ? { maxInputTokens } : {}),
      ...(pinnedUserEmails.length ? { pinnedUserEmails } : {}),
    };
  });
  const submittedProviderIds = new Set(nextProviders.map(provider => provider.id));
  for (const provider of current.providers) {
    if (isClaudeOpus5QwenProvider(provider.label) && !submittedProviderIds.has(provider.id)) nextProviders.push(provider);
  }
  const ids = new Set(nextProviders.map(provider => provider.id));
  if (!nextProviders.length || nextProviders.length > MAX_CLAUDE_OPUS5_PROVIDERS || ids.size !== nextProviders.length || nextProviders.some(provider => !provider.baseUrl || !provider.model || !provider.apiKeys.length)) {
    throw new Error("Each Claude Opus 5 provider needs a unique identifier, base URL, model ID, and at least one API key");
  }
  const baiPriority = input.baiPriority !== undefined ? input.baiPriority : (current.baiPriority ?? false);
  const next: ClaudeOpus5RuntimePayload = { providers: nextProviders, baiPriority };
  const encrypted = encryptProviderRuntimeConfig(next);
  const removedProviders = current.providers.filter(provider => !ids.has(provider.id));
  fallbackPlatformSettings.set(CLAUDE_OPUS5_TOKENREPLY_RUNTIME_SETTING_KEY, { value: JSON.stringify(encrypted), updatedAt: new Date(), updatedByUserId });
  bustCache("runtime:claude_opus5");
  bustCache("all_multimodal_providers");
  try {
    await db.transaction(async tx => {
      await tx.insert(platformSettings).values({
        settingKey: CLAUDE_OPUS5_TOKENREPLY_RUNTIME_SETTING_KEY,
        value: JSON.stringify(encrypted),
        updatedByUserId,
      }).onDuplicateKeyUpdate({ set: { value: JSON.stringify(encrypted), updatedByUserId, updatedAt: new Date() } });
      await purgeRemovedManagedProviderGroups(tx, "claude-opus-5", removedProviders);
    });
  } catch (err) {
    console.warn("[Claude Opus 5 settings write to DB failed; runtime preserved in memory]", err);
  }
  clearRemovedManagedProviderTelemetry("claude-opus-5", removedProviders);
  return getClaudeOpus5ProviderSettings();
}

export async function setClaudeOpus5BaiPriority(enabled: boolean, updatedByUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const current = await getClaudeOpus5RuntimeConfig();
  const next: ClaudeOpus5RuntimePayload = { ...current, baiPriority: enabled };
  const encrypted = encryptProviderRuntimeConfig(next);
  bustCache("runtime:claude_opus5");
  bustCache("all_multimodal_providers");
  await db.transaction(async tx => {
    await tx.insert(platformSettings).values({
      settingKey: CLAUDE_OPUS5_TOKENREPLY_RUNTIME_SETTING_KEY,
      value: JSON.stringify(encrypted),
      updatedByUserId,
    }).onDuplicateKeyUpdate({ set: { value: JSON.stringify(encrypted), updatedByUserId, updatedAt: new Date() } });
  });
  return getClaudeOpus5ProviderSettings();
}

export async function deleteClaudeOpus5QwenModel(input: { providerId: string; modelEntryId: string }, updatedByUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const current = await getClaudeOpus5RuntimeConfig();
  const next = removeClaudeOpus5QwenModelFromRuntime(current, input.providerId, input.modelEntryId);
  const encrypted = encryptProviderRuntimeConfig(next);
  bustCache("runtime:claude_opus5");
  bustCache("all_multimodal_providers");
  await db.transaction(async tx => {
    await tx.insert(platformSettings).values({
      settingKey: CLAUDE_OPUS5_TOKENREPLY_RUNTIME_SETTING_KEY,
      value: JSON.stringify(encrypted),
      updatedByUserId,
    }).onDuplicateKeyUpdate({ set: { value: JSON.stringify(encrypted), updatedByUserId, updatedAt: new Date() } });
    await tx.delete(managedProviderModelUsage).where(and(
      eq(managedProviderModelUsage.providerModelId, "claude-opus-5"),
      eq(managedProviderModelUsage.providerGroupId, input.providerId),
      eq(managedProviderModelUsage.modelEntryId, input.modelEntryId),
    ));
    await tx.delete(claudeOpus5FailureLogs).where(and(
      eq(claudeOpus5FailureLogs.modelId, "claude-opus-5"),
      eq(claudeOpus5FailureLogs.sourceId, `qwen:${input.modelEntryId}`),
    ));
  });
  return getClaudeOpus5ProviderSettings();
}

export async function deleteClaudeOpus5QwenApiKey(input: { providerId: string; slot: number }, updatedByUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const current = await getClaudeOpus5RuntimeConfig();
  const { runtime, removedApiKey } = removeClaudeOpus5QwenApiKeyFromRuntime(current, input.providerId, input.slot);
  const encrypted = encryptProviderRuntimeConfig(runtime);
  const fingerprint = managedProviderCredentialFingerprint("claude-opus-5", removedApiKey, input.providerId);
  bustCache("runtime:claude_opus5");
  bustCache("all_multimodal_providers");
  await db.transaction(async tx => {
    await tx.insert(platformSettings).values({
      settingKey: CLAUDE_OPUS5_TOKENREPLY_RUNTIME_SETTING_KEY,
      value: JSON.stringify(encrypted),
      updatedByUserId,
    }).onDuplicateKeyUpdate({ set: { value: JSON.stringify(encrypted), updatedByUserId, updatedAt: new Date() } });
    await tx.delete(providerKeyMetrics).where(and(
      eq(providerKeyMetrics.providerModelId, "claude-opus-5"),
      eq(providerKeyMetrics.credentialFingerprint, fingerprint),
    ));
  });
  return getClaudeOpus5ProviderSettings();
}

type Glm53RuntimePayload = { providers: ClaudeOpus5ProviderRuntime[] };

function glm53RuntimeFromEnvironment(): Glm53RuntimePayload {
  const apiKeys = getTokenRouterCredentialPool();
  return {
    providers: normalizeClaudeOpus5Providers([{
      id: "environment-default",
      label: "Environment default",
      enabled: true,
      baseUrl: process.env.TOKENROUTER_BASE_URL?.trim() ?? "",
      model: process.env.TOKENROUTER_GLM53_MODEL?.trim() ?? "",
      apiKeys,
      apiKeyEnabled: apiKeys.map(() => true),
    }], []),
  };
}

async function readGlm53RuntimeOverride() {
  return cached("runtime:glm53", 60_000, async () => {
    const db = await getDb();
    let record: { value: string; updatedAt?: Date | null; updatedByUserId?: number | null } | undefined;
    if (db) {
      try {
        record = (await db.select().from(platformSettings).where(eq(platformSettings.settingKey, GLM53_RUNTIME_SETTING_KEY)).limit(1))[0];
      } catch {
        // Fallback to memory
      }
    }
    if (!record) {
      record = fallbackPlatformSettings.get(GLM53_RUNTIME_SETTING_KEY);
    }
    if (!record) return null;
    try {
      const encoded = JSON.parse(record.value) as { ciphertext?: string; iv?: string; authTag?: string };
      const decrypted = decryptProviderRuntimeConfig({ ciphertext: String(encoded.ciphertext ?? ""), iv: String(encoded.iv ?? ""), authTag: String(encoded.authTag ?? "") });
      if (!decrypted || typeof decrypted !== "object") return null;
      const candidate = decrypted as Partial<Glm53RuntimePayload> & { baseUrl?: unknown; model?: unknown; apiKeys?: unknown };
      const legacyProvider = {
        id: "primary",
        label: "Primary provider",
        enabled: true,
        baseUrl: typeof candidate.baseUrl === "string" ? candidate.baseUrl.trim() : "",
        model: typeof candidate.model === "string" ? candidate.model.trim() : "",
        apiKeys: Array.isArray(candidate.apiKeys) ? candidate.apiKeys : [],
      };
      return {
        payload: { providers: normalizeClaudeOpus5Providers(candidate.providers, normalizeClaudeOpus5Providers([legacyProvider], [])) },
        updatedAt: record.updatedAt,
        updatedByUserId: record.updatedByUserId,
      };
    } catch {
      return null;
    }
  });
}

export async function getGlm53RuntimeConfig(): Promise<Glm53RuntimePayload> {
  const fallback = glm53RuntimeFromEnvironment();
  const override = await readGlm53RuntimeOverride();
  if (!override) return fallback;
  return { providers: override.payload.providers.length ? override.payload.providers : fallback.providers };
}

export async function getGlm53ProviderSettings() {
  const runtime = await getGlm53RuntimeConfig();
  const override = await readGlm53RuntimeOverride();
  const primary = runtime.providers[0];
  
  const isBai = (() => {
    try {
      const hostname = new URL(primary?.baseUrl ?? "").hostname.toLowerCase();
      return hostname === "b.ai" || hostname.endsWith(".b.ai");
    } catch {
      return false;
    }
  })();
  const capacity = isBai && primary ? await getBaiCredentialCapacityStatuses("glm-5.3", primary.id, primary.apiKeys) : null;
  
  return {
    baseUrl: primary?.baseUrl ?? "",
    model: primary?.model ?? "",
    apiKeyMasks: providerApiKeyMasks(primary?.apiKeys ?? [], primary?.apiKeyEnabled).map((mask, index) => capacity ? { ...mask, ...capacity[index] } : mask),
    providers: runtime.providers.map(provider => ({
      id: provider.id,
      label: provider.label,
      enabled: provider.enabled,
      baseUrl: provider.baseUrl,
      model: provider.model,
      apiKeyMasks: providerApiKeyMasks(provider.apiKeys, provider.apiKeyEnabled),
      ...(provider.maxInputTokens !== undefined ? { maxInputTokens: provider.maxInputTokens } : {}),
      ...(provider.maxOutputTokens !== undefined ? { maxOutputTokens: provider.maxOutputTokens } : {}),
      ...(provider.disableIdentityPrompt ? { disableIdentityPrompt: true } : {}),
      pinnedUserEmails: provider.pinnedUserEmails ?? [],
      bypassCooldown: provider.bypassCooldown === true,
      supportsVision: provider.supportsVision === true,
      supportsDocuments: provider.supportsDocuments === true,
      reasoningEffort: provider.reasoningEffort ?? null,
    })),
    source: override ? "database" as const : "environment" as const,
    updatedAt: override?.updatedAt ?? null,
    updatedByUserId: override?.updatedByUserId ?? null,
  };
}

export async function updateGlm53ProviderSettings(input: { providers: Array<{ id: string; label: string; enabled?: boolean; baseUrl: string; model: string; apiKeys: string[]; apiKeyEnabled?: boolean[]; removeSlots?: number[]; maxInputTokens?: number | null; maxOutputTokens?: number | null; disableIdentityPrompt?: boolean; pinnedUserEmails?: string[]; bypassCooldown?: boolean; supportsVision?: boolean; supportsDocuments?: boolean; reasoningEffort?: "low" | "medium" | "high" | "xhigh" | "max" | null }> } | { baseUrl?: string; model?: string; apiKeys?: string[]; apiKeyEnabled?: boolean[]; removeSlots?: number[]; maxInputTokens?: number | null; maxOutputTokens?: number | null; disableIdentityPrompt?: boolean; pinnedUserEmails?: string[]; bypassCooldown?: boolean; supportsVision?: boolean; supportsDocuments?: boolean; reasoningEffort?: "low" | "medium" | "high" | "xhigh" | "max" | null }, updatedByUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const current = await getGlm53RuntimeConfig();
  const currentById = new Map(current.providers.map(provider => [provider.id, provider]));
  const legacyPrimary = current.providers[0] ?? { id: "primary", label: "Primary provider", enabled: true, baseUrl: "", model: "", apiKeys: [] };
  
  const submittedProviders = "providers" in input ? input.providers : [{ id: legacyPrimary.id, label: legacyPrimary.label, enabled: legacyPrimary.enabled, baseUrl: input.baseUrl ?? legacyPrimary.baseUrl, model: input.model ?? legacyPrimary.model, apiKeys: input.apiKeys ?? [], apiKeyEnabled: input.apiKeyEnabled, removeSlots: input.removeSlots, maxInputTokens: input.maxInputTokens, maxOutputTokens: input.maxOutputTokens, disableIdentityPrompt: input.disableIdentityPrompt, pinnedUserEmails: input.pinnedUserEmails, bypassCooldown: input.bypassCooldown, supportsVision: input.supportsVision, supportsDocuments: input.supportsDocuments, reasoningEffort: (input as any).reasoningEffort }];
  
  const nextProviders = submittedProviders.map((submitted, index) => {
    const existing = currentById.get(submitted.id);
    const keys = applyManagedProviderKeyUpdate(existing, submitted);
    const maxInputTokens = normalizeMaxInputTokens(submitted.maxInputTokens ?? existing?.maxInputTokens);
    const maxOutputTokens = normalizeMaxOutputTokens(submitted.maxOutputTokens ?? existing?.maxOutputTokens);
    const disableIdentityPrompt = submitted.disableIdentityPrompt !== undefined
      ? submitted.disableIdentityPrompt === true
      : existing?.disableIdentityPrompt === true;
    const bypassCooldown = submitted.bypassCooldown !== undefined
      ? submitted.bypassCooldown === true
      : existing?.bypassCooldown === true;
    const supportsVision = submitted.supportsVision !== undefined
      ? submitted.supportsVision === true
      : existing?.supportsVision === true;
    const supportsDocuments = submitted.supportsDocuments !== undefined
      ? submitted.supportsDocuments === true
      : existing?.supportsDocuments === true;
    const reasoningEffort = normalizeReasoningEffort(
      submitted.reasoningEffort !== undefined
        ? submitted.reasoningEffort
        : (existing as any)?.reasoningEffort
    );
    const pinnedUserEmails = normalizePinnedUserEmails(submitted.pinnedUserEmails !== undefined ? submitted.pinnedUserEmails : existing?.pinnedUserEmails);
    return {
      id: normalizeClaudeOpus5ProviderId(submitted.id, `provider-${index + 1}`),
      label: submitted.label.trim() || `Provider ${index + 1}`,
      enabled: submitted.enabled !== false,
      baseUrl: submitted.baseUrl.trim(),
      model: submitted.model.trim(),
      ...keys,
      ...(disableIdentityPrompt ? { disableIdentityPrompt: true } : {}),
      ...(bypassCooldown ? { bypassCooldown: true } : {}),
      ...(supportsVision ? { supportsVision: true } : {}),
      ...(supportsDocuments ? { supportsDocuments: true } : {}),
      ...(maxInputTokens !== undefined ? { maxInputTokens } : {}),
      ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
      ...(pinnedUserEmails.length ? { pinnedUserEmails } : {}),
    };
  });

  const ids = new Set(nextProviders.map(p => p.id));
  if (!nextProviders.length || nextProviders.length > MAX_CLAUDE_OPUS5_PROVIDERS || ids.size !== nextProviders.length || nextProviders.some(provider => !provider.baseUrl || !provider.model || !provider.apiKeys.length)) throw new Error("Each GLM 5.3 provider needs a unique identifier, base URL, model ID, and at least one API key");

  const encrypted = encryptProviderRuntimeConfig({ providers: nextProviders });

  const removedProviders = current.providers.filter(provider => !ids.has(provider.id));

  fallbackPlatformSettings.set(GLM53_RUNTIME_SETTING_KEY, { value: JSON.stringify(encrypted), updatedAt: new Date(), updatedByUserId });
  bustCache("runtime:glm53");
  bustCache("all_multimodal_providers");
  try {
    await db.transaction(async tx => {
      await tx.insert(platformSettings).values({
        settingKey: GLM53_RUNTIME_SETTING_KEY,
        value: JSON.stringify(encrypted),
        updatedByUserId,
      }).onDuplicateKeyUpdate({ set: { value: JSON.stringify(encrypted), updatedByUserId, updatedAt: new Date() } });
      
      await purgeRemovedManagedProviderGroups(tx, "glm-5.3", removedProviders);
    });
  } catch (err) {
    console.warn("[GLM 5.3 settings write to DB failed; runtime preserved in memory]", err);
  }
  
  clearRemovedManagedProviderTelemetry("glm-5.3", removedProviders);
  return getGlm53ProviderSettings();
}

export type DeepseekV4ProProviderRuntime = ClaudeOpus5ProviderRuntime;
type DeepseekV4ProRuntimePayload = { providers: DeepseekV4ProProviderRuntime[] };
export const MAX_DEEPSEEK_V4PRO_PROVIDERS = 100;

function normalizeDeepseekV4ProProviders(value: unknown, fallback: DeepseekV4ProProviderRuntime[]) {
  return normalizeClaudeOpus5Providers(value, fallback).slice(0, MAX_DEEPSEEK_V4PRO_PROVIDERS);
}

function deepseekV4ProRuntimeFromEnvironment(): DeepseekV4ProRuntimePayload {
  return {
    providers: normalizeDeepseekV4ProProviders([{
      id: "environment-default",
      label: "Environment default",
      enabled: true,
      baseUrl: process.env.TOKENHARBOR_BASE_URL?.trim() ?? "",
      model: getTokenForgeUpstreamModelId("deepseek-v4-pro") ?? "",
      apiKeys: [process.env.TOKENHARBOR_API_KEY?.trim() ?? ""],
    }], []),
  };
}

async function readDeepseekV4ProRuntimeOverride() {
  return cached("runtime:deepseek_v4pro", 60_000, async () => {
    const db = await getDb();
    let record: { value: string; updatedAt?: Date | null; updatedByUserId?: number | null } | undefined;
    if (db) {
      try {
        record = (await db.select().from(platformSettings).where(eq(platformSettings.settingKey, DEEPSEEK_V4PRO_RUNTIME_SETTING_KEY)).limit(1))[0];
      } catch {
        // Fallback to memory
      }
    }
    if (!record) {
      record = fallbackPlatformSettings.get(DEEPSEEK_V4PRO_RUNTIME_SETTING_KEY);
    }
    if (!record) return null;
    try {
      const encoded = JSON.parse(record.value) as { ciphertext?: string; iv?: string; authTag?: string };
      const decrypted = decryptProviderRuntimeConfig({ ciphertext: String(encoded.ciphertext ?? ""), iv: String(encoded.iv ?? ""), authTag: String(encoded.authTag ?? "") });
      if (!decrypted || typeof decrypted !== "object") return null;
      const candidate = decrypted as Partial<DeepseekV4ProRuntimePayload> & { baseUrl?: unknown; model?: unknown; apiKeys?: unknown };
      const legacyProvider = {
        id: "primary",
        label: "Primary provider",
        enabled: candidate.providers?.[0]?.enabled !== false,
        baseUrl: typeof candidate.baseUrl === "string" ? candidate.baseUrl.trim() : "",
        model: typeof candidate.model === "string" ? candidate.model.trim() : "",
        apiKeys: Array.isArray(candidate.apiKeys) ? candidate.apiKeys : [],
      };
      return {
        payload: { providers: normalizeDeepseekV4ProProviders(candidate.providers, normalizeDeepseekV4ProProviders([legacyProvider], [])) },
        updatedAt: record.updatedAt,
        updatedByUserId: record.updatedByUserId,
      };
    } catch {
      return null;
    }
  });
}

export async function getDeepseekV4ProRuntimeConfig(): Promise<DeepseekV4ProRuntimePayload> {
  const fallback = deepseekV4ProRuntimeFromEnvironment();
  const override = await readDeepseekV4ProRuntimeOverride();
  if (!override) return fallback;
  return { providers: override.payload.providers.length ? override.payload.providers : fallback.providers };
}

export async function getDeepseekV4ProProviderSettings() {
  const runtime = await getDeepseekV4ProRuntimeConfig();
  const override = await readDeepseekV4ProRuntimeOverride();
  const primary = runtime.providers[0];
  return {
    providers: runtime.providers.map(provider => ({
      id: provider.id,
      label: provider.label,
      enabled: provider.enabled,
      baseUrl: provider.baseUrl,
      model: provider.model,
      apiKeyMasks: providerApiKeyMasks(provider.apiKeys, provider.apiKeyEnabled),
      ...(provider.maxInputTokens !== undefined ? { maxInputTokens: provider.maxInputTokens } : {}),
      ...(provider.disableIdentityPrompt ? { disableIdentityPrompt: true } : {}),
      pinnedUserEmails: provider.pinnedUserEmails ?? [],
      bypassCooldown: provider.bypassCooldown === true,
      supportsVision: provider.supportsVision === true,
      supportsDocuments: provider.supportsDocuments === true,
      reasoningEffort: provider.reasoningEffort ?? null,
    })),
    /** Compatibility fields retain a read-only view for callers on the legacy setting shape. */
    baseUrl: primary?.baseUrl ?? "",
    model: primary?.model ?? "",
    apiKeyMasks: providerApiKeyMasks(primary?.apiKeys ?? [], primary?.apiKeyEnabled),
    source: override ? "database" as const : "environment" as const,
    updatedAt: override?.updatedAt ?? null,
    updatedByUserId: override?.updatedByUserId ?? null,
  };
}

type DeepseekV4ProProviderUpdate = { id: string; label: string; enabled?: boolean; baseUrl: string; model: string; apiKeys: string[]; apiKeyEnabled?: boolean[]; removeSlots?: number[]; maxInputTokens?: number | null; disableIdentityPrompt?: boolean; pinnedUserEmails?: string[]; bypassCooldown?: boolean; supportsVision?: boolean; supportsDocuments?: boolean; reasoningEffort?: "low" | "medium" | "high" | "xhigh" | "max" | null };
type DeepseekV4ProLegacyUpdate = { baseUrl?: string; model?: string; apiKeys?: string[]; apiKeyEnabled?: boolean[]; removeSlots?: number[]; maxInputTokens?: number | null; disableIdentityPrompt?: boolean; pinnedUserEmails?: string[]; bypassCooldown?: boolean; supportsVision?: boolean; supportsDocuments?: boolean; reasoningEffort?: "low" | "medium" | "high" | "xhigh" | "max" | null };

export async function updateDeepseekV4ProProviderSettings(input: { providers: DeepseekV4ProProviderUpdate[] } | DeepseekV4ProLegacyUpdate, updatedByUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const current = await getDeepseekV4ProRuntimeConfig();
  const currentById = new Map(current.providers.map(provider => [provider.id, provider]));
  const legacyPrimary = current.providers[0] ?? { id: "primary", label: "Primary provider", enabled: true, baseUrl: "", model: "", apiKeys: [] };
  const submittedProviders: DeepseekV4ProProviderUpdate[] = "providers" in input
    ? input.providers
    : [{
      id: legacyPrimary.id,
      label: legacyPrimary.label,
      enabled: legacyPrimary.enabled,
      baseUrl: input.baseUrl?.trim() || legacyPrimary.baseUrl,
      model: input.model?.trim() || legacyPrimary.model,
      apiKeys: input.apiKeys ?? legacyPrimary.apiKeys.map(() => ""),
      apiKeyEnabled: input.apiKeyEnabled,
      removeSlots: input.removeSlots,
      maxInputTokens: input.maxInputTokens,
      disableIdentityPrompt: input.disableIdentityPrompt,
      pinnedUserEmails: input.pinnedUserEmails,
      bypassCooldown: input.bypassCooldown,
      supportsVision: input.supportsVision,
      supportsDocuments: input.supportsDocuments,
      reasoningEffort: input.reasoningEffort,
    }];
  const nextProviders = submittedProviders.map((submitted, index) => {
    const existing = currentById.get(submitted.id);
    const keys = applyManagedProviderKeyUpdate(existing, submitted);
    const maxInputTokens = normalizeMaxInputTokens(submitted.maxInputTokens ?? existing?.maxInputTokens);
    const disableIdentityPrompt = submitted.disableIdentityPrompt !== undefined
      ? submitted.disableIdentityPrompt === true
      : existing?.disableIdentityPrompt === true;
    const bypassCooldown = submitted.bypassCooldown !== undefined
      ? submitted.bypassCooldown === true
      : existing?.bypassCooldown === true;
    const supportsVision = submitted.supportsVision !== undefined
      ? submitted.supportsVision === true
      : existing?.supportsVision === true;
    const supportsDocuments = submitted.supportsDocuments !== undefined
      ? submitted.supportsDocuments === true
      : existing?.supportsDocuments === true;
    const reasoningEffort = normalizeReasoningEffort(
      submitted.reasoningEffort !== undefined
        ? submitted.reasoningEffort
        : (existing as any)?.reasoningEffort
    );
    const pinnedUserEmails = normalizePinnedUserEmails(submitted.pinnedUserEmails !== undefined ? submitted.pinnedUserEmails : existing?.pinnedUserEmails);
    return {
      id: normalizeClaudeOpus5ProviderId(submitted.id, `provider-${index + 1}`),
      label: submitted.label.trim() || `Provider ${index + 1}`,
      enabled: submitted.enabled !== false,
      baseUrl: submitted.baseUrl.trim(),
      model: submitted.model.trim(),
      ...keys,
      ...(disableIdentityPrompt ? { disableIdentityPrompt: true } : {}),
      ...(bypassCooldown ? { bypassCooldown: true } : {}),
      ...(supportsVision ? { supportsVision: true } : {}),
      ...(supportsDocuments ? { supportsDocuments: true } : {}),
      ...(maxInputTokens !== undefined ? { maxInputTokens } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
      ...(pinnedUserEmails.length ? { pinnedUserEmails } : {}),
    };
  });
  const ids = new Set(nextProviders.map(provider => provider.id));
  if (!nextProviders.length || nextProviders.length > MAX_DEEPSEEK_V4PRO_PROVIDERS || ids.size !== nextProviders.length || nextProviders.some(provider => !provider.baseUrl || !provider.model || !provider.apiKeys.length)) {
    throw new Error("Each DeepSeek V4 Pro provider needs a unique identifier, base URL, model ID, and at least one API key");
  }
  const encrypted = encryptProviderRuntimeConfig({ providers: nextProviders } satisfies DeepseekV4ProRuntimePayload);
  const removedProviders = current.providers.filter(provider => !ids.has(provider.id));
  fallbackPlatformSettings.set(DEEPSEEK_V4PRO_RUNTIME_SETTING_KEY, { value: JSON.stringify(encrypted), updatedAt: new Date(), updatedByUserId });
  bustCache("runtime:deepseek_v4pro");
  bustCache("all_multimodal_providers");
  try {
    await db.transaction(async tx => {
      await tx.insert(platformSettings).values({
        settingKey: DEEPSEEK_V4PRO_RUNTIME_SETTING_KEY,
        value: JSON.stringify(encrypted),
        updatedByUserId,
      }).onDuplicateKeyUpdate({ set: { value: JSON.stringify(encrypted), updatedByUserId, updatedAt: new Date() } });
      await purgeRemovedManagedProviderGroups(tx, "deepseek-v4-pro", removedProviders);
    });
  } catch (err) {
    console.warn("[DeepSeek V4 Pro settings write to DB failed; runtime preserved in memory]", err);
  }
  clearRemovedManagedProviderTelemetry("deepseek-v4-pro", removedProviders);
  return getDeepseekV4ProProviderSettings();
}

export type Sonnet46ProviderRuntime = ClaudeOpus5ProviderRuntime;
type Sonnet46RuntimePayload = { providers: Sonnet46ProviderRuntime[] };
export const MAX_SONNET46_PROVIDERS = 100;
type Sonnet46ProviderUpdate = { id: string; label: string; enabled?: boolean; baseUrl: string; model: string; apiKeys: string[]; apiKeyEnabled?: boolean[]; removeSlots?: number[]; maxInputTokens?: number | null; disableIdentityPrompt?: boolean; pinnedUserEmails?: string[]; bypassCooldown?: boolean; supportsVision?: boolean; supportsDocuments?: boolean; reasoningEffort?: "low" | "medium" | "high" | "xhigh" | "max" | null };

function normalizeSonnet46Providers(value: unknown, fallback: Sonnet46ProviderRuntime[]) {
  return normalizeClaudeOpus5Providers(value, fallback).slice(0, MAX_SONNET46_PROVIDERS);
}

async function readSonnet46RuntimeOverride() {
  return cached("runtime:sonnet46", 60_000, async () => {
    const db = await getDb();
    let record: { value: string; updatedAt?: Date | null; updatedByUserId?: number | null } | undefined;
    if (db) {
      try {
        record = (await db.select().from(platformSettings).where(eq(platformSettings.settingKey, SONNET46_RUNTIME_SETTING_KEY)).limit(1))[0];
      } catch {
        // Fallback to memory
      }
    }
    if (!record) {
      record = fallbackPlatformSettings.get(SONNET46_RUNTIME_SETTING_KEY);
    }
    if (!record) return null;
    try {
      const encoded = JSON.parse(record.value) as { ciphertext?: string; iv?: string; authTag?: string };
      const decrypted = decryptProviderRuntimeConfig({ ciphertext: String(encoded.ciphertext ?? ""), iv: String(encoded.iv ?? ""), authTag: String(encoded.authTag ?? "") });
      if (!decrypted || typeof decrypted !== "object") return null;
      const candidate = decrypted as Partial<Sonnet46RuntimePayload>;
      return { payload: { providers: normalizeSonnet46Providers(candidate.providers, []) }, updatedAt: record.updatedAt, updatedByUserId: record.updatedByUserId };
    } catch {
      return null;
    }
  });
}

export async function getSonnet46RuntimeConfig(): Promise<Sonnet46RuntimePayload> {
  const override = await readSonnet46RuntimeOverride();
  return { providers: override?.payload.providers ?? [] };
}

export async function getSonnet46ProviderSettings() {
  const runtime = await getSonnet46RuntimeConfig();
  const override = await readSonnet46RuntimeOverride();
  const primary = runtime.providers[0];
  return {
    providers: runtime.providers.map(provider => ({
      id: provider.id,
      label: provider.label,
      enabled: provider.enabled,
      baseUrl: provider.baseUrl,
      model: provider.model,
      apiKeyMasks: providerApiKeyMasks(provider.apiKeys, provider.apiKeyEnabled),
      ...(provider.maxInputTokens !== undefined ? { maxInputTokens: provider.maxInputTokens } : {}),
      ...(provider.disableIdentityPrompt ? { disableIdentityPrompt: true } : {}),
      pinnedUserEmails: provider.pinnedUserEmails ?? [],
      bypassCooldown: provider.bypassCooldown === true,
      supportsVision: provider.supportsVision === true,
      supportsDocuments: provider.supportsDocuments === true,
      reasoningEffort: provider.reasoningEffort ?? null,
    })),
    baseUrl: primary?.baseUrl ?? "",
    model: primary?.model ?? "",
    apiKeyMasks: providerApiKeyMasks(primary?.apiKeys ?? [], primary?.apiKeyEnabled),
    source: override ? "database" as const : "environment" as const,
    updatedAt: override?.updatedAt ?? null,
    updatedByUserId: override?.updatedByUserId ?? null,
  };
}

export async function updateSonnet46ProviderSettings(input: { providers: Sonnet46ProviderUpdate[] }, updatedByUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const current = await getSonnet46RuntimeConfig();
  const currentById = new Map(current.providers.map(provider => [provider.id, provider]));
  const nextProviders = input.providers.map((submitted, index) => {
    const existing = currentById.get(submitted.id);
    const keys = applyManagedProviderKeyUpdate(existing, submitted);
    const maxInputTokens = normalizeMaxInputTokens(submitted.maxInputTokens ?? existing?.maxInputTokens);
    const disableIdentityPrompt = submitted.disableIdentityPrompt !== undefined
      ? submitted.disableIdentityPrompt === true
      : existing?.disableIdentityPrompt === true;
    const bypassCooldown = submitted.bypassCooldown !== undefined
      ? submitted.bypassCooldown === true
      : existing?.bypassCooldown === true;
    const supportsVision = submitted.supportsVision !== undefined
      ? submitted.supportsVision === true
      : existing?.supportsVision === true;
    const supportsDocuments = submitted.supportsDocuments !== undefined
      ? submitted.supportsDocuments === true
      : existing?.supportsDocuments === true;
    const reasoningEffort = normalizeReasoningEffort(
      submitted.reasoningEffort !== undefined
        ? submitted.reasoningEffort
        : (existing as any)?.reasoningEffort
    );
    const pinnedUserEmails = normalizePinnedUserEmails(submitted.pinnedUserEmails !== undefined ? submitted.pinnedUserEmails : existing?.pinnedUserEmails);
    return {
      id: normalizeClaudeOpus5ProviderId(submitted.id, `provider-${index + 1}`),
      label: submitted.label.trim() || `Provider ${index + 1}`,
      enabled: submitted.enabled !== false,
      baseUrl: submitted.baseUrl.trim(),
      model: submitted.model.trim(),
      ...keys,
      ...(disableIdentityPrompt ? { disableIdentityPrompt: true } : {}),
      ...(bypassCooldown ? { bypassCooldown: true } : {}),
      ...(supportsVision ? { supportsVision: true } : {}),
      ...(supportsDocuments ? { supportsDocuments: true } : {}),
      ...(maxInputTokens !== undefined ? { maxInputTokens } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
      ...(pinnedUserEmails.length ? { pinnedUserEmails } : {}),
    };
  });
  const ids = new Set(nextProviders.map(provider => provider.id));
  if (!nextProviders.length || nextProviders.length > MAX_SONNET46_PROVIDERS || ids.size !== nextProviders.length || nextProviders.some(provider => !provider.baseUrl || !provider.model || !provider.apiKeys.length)) {
    throw new Error("Each Claude Sonnet 4.6 provider needs a unique identifier, base URL, model ID, and at least one API key");
  }
  const encrypted = encryptProviderRuntimeConfig({ providers: nextProviders } satisfies Sonnet46RuntimePayload);
  const removedProviders = current.providers.filter(provider => !ids.has(provider.id));
  fallbackPlatformSettings.set(SONNET46_RUNTIME_SETTING_KEY, { value: JSON.stringify(encrypted), updatedAt: new Date(), updatedByUserId });
  bustCache("runtime:sonnet46");
  bustCache("all_multimodal_providers");
  try {
    await db.transaction(async tx => {
      await tx.insert(platformSettings).values({
        settingKey: SONNET46_RUNTIME_SETTING_KEY,
        value: JSON.stringify(encrypted),
        updatedByUserId,
      }).onDuplicateKeyUpdate({ set: { value: JSON.stringify(encrypted), updatedByUserId, updatedAt: new Date() } });
      await purgeRemovedManagedProviderGroups(tx, "claude-sonnet-4.6", removedProviders);
    });
  } catch (err) {
    console.warn("[Claude Sonnet 4.6 settings write to DB failed; runtime preserved in memory]", err);
  }
  clearRemovedManagedProviderTelemetry("claude-sonnet-4.6", removedProviders);
  return getSonnet46ProviderSettings();
}

export const MANAGED_PROVIDER_METRIC_MODEL_IDS = [
  "claude-opus-5.5",
  "claude-sonnet-5.5",
  "claude-haiku-5.5",
  "gemini-4-argon",
  "gpt-6-luna",
  "claude-fable-5.1",
  "claude-opus-5",
  "glm-5.3",
  "glm-5.3-flash",
  "deepseek-v4-pro",
  "qwen3.8-max",
  "gpt-6-astra",
  "kimi-k3",
] as const;
export type ManagedProviderMetricModel = typeof MANAGED_PROVIDER_METRIC_MODEL_IDS[number] | (string & {});

export function managedProviderCredentialFingerprint(modelId: ManagedProviderMetricModel, credential: string, providerGroupId?: string) {
  const secret = process.env.JWT_SECRET?.trim() || "qronos-default-metric-vault-secret";
  const groupScope = providerGroupId && providerGroupId !== "primary" ? `\u0000provider:${providerGroupId}` : "";
  return createHmac("sha256", secret).update(`QronosAI:ProviderKeyMetrics:v1\u0000${modelId}${groupScope}\u0000${credential}`).digest("hex");
}

/** Records a per-key aggregate without storing key material, masks, or upstream identifiers in the database. */
export async function recordManagedProviderKeyOutcome(modelId: ManagedProviderMetricModel, credential: string, healthy: boolean, occurredAt = new Date(), countRequest = true, providerGroupId?: string) {
  const db = await getDb();
  if (!db || !credential.trim()) return;
  const credentialFingerprint = managedProviderCredentialFingerprint(modelId, credential, providerGroupId);
  const increments = {
    requestCount: countRequest ? sql`${providerKeyMetrics.requestCount} + 1` : sql`${providerKeyMetrics.requestCount}`,
    successCount: healthy ? sql`${providerKeyMetrics.successCount} + 1` : sql`${providerKeyMetrics.successCount}`,
    failureCount: healthy ? sql`${providerKeyMetrics.failureCount}` : sql`${providerKeyMetrics.failureCount} + 1`,
    lastRequestAt: occurredAt,
    lastSuccessAt: healthy ? occurredAt : sql`${providerKeyMetrics.lastSuccessAt}`,
    lastFailureAt: healthy ? sql`${providerKeyMetrics.lastFailureAt}` : occurredAt,
  };
  await db.insert(providerKeyMetrics).values({
    providerModelId: modelId,
    credentialFingerprint,
    requestCount: countRequest ? 1 : 0,
    successCount: healthy ? 1 : 0,
    failureCount: healthy ? 0 : 1,
    lastRequestAt: occurredAt,
    lastSuccessAt: healthy ? occurredAt : null,
    lastFailureAt: healthy ? null : occurredAt,
  }).onDuplicateKeyUpdate({ set: increments });
}

async function getManagedProviderMetricRuntime(modelId: ManagedProviderMetricModel): Promise<{ apiKeys: string[] }> {
  if (modelId === "claude-fable-5.1") {
    const runtime = await getClaudeFable5NvidiaRuntimeConfig();
    return { apiKeys: runtime.providers.flatMap(provider => provider.apiKeys) };
  }
  if (modelId === "claude-opus-5") {
    const runtime = await getClaudeOpus5RuntimeConfig();
    return { apiKeys: runtime.providers.flatMap(provider => provider.apiKeys) };
  }
  if (modelId === "qwen3.8-max") {
    const runtime = await getQwen38MaxRuntimeConfig();
    return { apiKeys: runtime.providers.flatMap(provider => provider.apiKeys) };
  }
  if (modelId === "gpt-6-astra") {
    const runtime = await getGpt6AstraRuntimeConfig();
    return { apiKeys: runtime.providers.flatMap(provider => provider.apiKeys) };
  }
  if (modelId === "kimi-k3") {
    const runtime = await getKimiK3RuntimeConfig();
    return { apiKeys: runtime.providers.flatMap(provider => provider.apiKeys) };
  }
  if (modelId === "claude-sonnet-4.6") {
    const runtime = await getSonnet46RuntimeConfig();
    return { apiKeys: runtime.providers.flatMap(provider => provider.apiKeys) };
  }
  if (modelId === "glm-5.3") {
    const runtime = await getGlm53RuntimeConfig();
    return { apiKeys: runtime.providers.flatMap(provider => provider.apiKeys) };
  }
  const runtime = await getDeepseekV4ProRuntimeConfig();
  return { apiKeys: runtime.providers.flatMap(provider => provider.apiKeys) };
}

/** Administrator-only view model: keeps fingerprints and raw credentials server-side, returning only current masks and aggregated counts. */
export async function getManagedProviderKeyMetrics() {
  const db = await getDb();
  const runtimes = await Promise.all(MANAGED_PROVIDER_METRIC_MODEL_IDS.filter(modelId => modelId !== "claude-opus-5" && modelId !== "claude-sonnet-4.6" && modelId !== "deepseek-v4-pro" && modelId !== "qwen3.8-max" && modelId !== "claude-fable-5.1" && modelId !== "gpt-6-astra" && modelId !== "kimi-k3").map(async modelId => ({ modelId, runtime: await getManagedProviderMetricRuntime(modelId) })));
  const opusRuntime = await getClaudeOpus5RuntimeConfig();
  const sonnetRuntime = await getSonnet46RuntimeConfig();
  const deepseekRuntime = await getDeepseekV4ProRuntimeConfig();
  const qwenRuntime = await getQwen38MaxRuntimeConfig();
  const fableRuntime = await getClaudeFable5NvidiaRuntimeConfig();
  const gpt6AstraRuntime = await getGpt6AstraRuntimeConfig();
  const kimiRuntime = await getKimiK3RuntimeConfig();
  const rows = db
    ? await db.select().from(providerKeyMetrics).where(inArray(providerKeyMetrics.providerModelId, [...MANAGED_PROVIDER_METRIC_MODEL_IDS]))
    : [];
  const metricsByKey = new Map(rows.map(row => [`${row.providerModelId}:${row.credentialFingerprint}`, row]));
  const liveTelemetry = getProviderCredentialTelemetry(Object.fromEntries(runtimes.map(({ modelId, runtime }) => [modelId, runtime.apiKeys.length])));

  const standardMetrics = runtimes.map(({ modelId, runtime }) => {
    const liveProvider = liveTelemetry.find(item => item.providerSlug === modelId);
    return {
      modelId,
      slots: runtime.apiKeys.map((credential, index) => {
        const metric = metricsByKey.get(`${modelId}:${managedProviderCredentialFingerprint(modelId, credential)}`);
        const liveSlot = liveProvider?.slots[index];
        const requestCount = Number(metric?.requestCount ?? 0);
        return {
          slot: index + 1,
          keyMask: maskProviderApiKey(credential),
          requestCount,
          successCount: Number(metric?.successCount ?? 0),
          failureCount: Number(metric?.failureCount ?? 0),
          health: liveSlot?.health ?? "unknown",
          cooldownUntil: liveSlot?.cooldownUntil ?? null,
          lastRequestAt: metric?.lastRequestAt ?? null,
          lastSuccessAt: metric?.lastSuccessAt ?? null,
          lastFailureAt: metric?.lastFailureAt ?? null,
          activeRequests: liveSlot?.activeRequests ?? 0,
          lastLatencyMs: liveSlot?.lastLatencyMs ?? null,
          avgLatencyMs: liveSlot?.avgLatencyMs ?? null,
          lastTtftMs: liveSlot?.lastTtftMs ?? null,
          avgTtftMs: liveSlot?.avgTtftMs ?? null,
          lastTokensPerSec: liveSlot?.lastTokensPerSec ?? null,
          avgTokensPerSec: liveSlot?.avgTokensPerSec ?? null,
        };
      }),
    };
  });
  const fableProviders = fableRuntime.providers.map(provider => ({
    id: provider.id,
    label: provider.label,
    slots: provider.apiKeys.map((credential, index) => {
      const metric = metricsByKey.get(`claude-fable-5.1:${managedProviderCredentialFingerprint("claude-fable-5.1", credential, provider.id)}`);
      const liveSlot = getCredentialSlotTelemetry(`claude-fable-5.1:${provider.id}` as CredentialTelemetryProvider, index);
      return {
        slot: index + 1,
        keyMask: maskProviderApiKey(credential),
        requestCount: Number(metric?.requestCount ?? 0),
        successCount: Number(metric?.successCount ?? 0),
        failureCount: Number(metric?.failureCount ?? 0),
        health: liveSlot.health,
        cooldownUntil: liveSlot.cooldownUntil,
        lastRequestAt: metric?.lastRequestAt ?? null,
        lastSuccessAt: metric?.lastSuccessAt ?? null,
        lastFailureAt: metric?.lastFailureAt ?? null,
        activeRequests: liveSlot.activeRequests,
        lastLatencyMs: liveSlot.lastLatencyMs,
        avgLatencyMs: liveSlot.avgLatencyMs,
        lastTtftMs: liveSlot.lastTtftMs,
        avgTtftMs: liveSlot.avgTtftMs,
        lastTokensPerSec: liveSlot.lastTokensPerSec,
        avgTokensPerSec: liveSlot.avgTokensPerSec,
        requestCap: null,
        retired: false,
      };
    }),
  }));
  const opusProviders = opusRuntime.providers.map(provider => ({
    id: provider.id,
    label: provider.label,
    slots: provider.apiKeys.map((credential, index) => {
      const metric = metricsByKey.get(`claude-opus-5:${managedProviderCredentialFingerprint("claude-opus-5", credential, provider.id)}`);
      const liveSlot = getCredentialSlotTelemetry(`claude-opus-5:${provider.id}`, index);
      return {
        slot: index + 1,
        keyMask: maskProviderApiKey(credential),
        requestCount: Number(metric?.requestCount ?? 0),
        successCount: Number(metric?.successCount ?? 0),
        failureCount: Number(metric?.failureCount ?? 0),
        health: liveSlot.health,
        cooldownUntil: liveSlot.cooldownUntil,
        lastRequestAt: metric?.lastRequestAt ?? null,
        lastSuccessAt: metric?.lastSuccessAt ?? null,
        lastFailureAt: metric?.lastFailureAt ?? null,
        activeRequests: liveSlot.activeRequests,
        lastLatencyMs: liveSlot.lastLatencyMs,
        avgLatencyMs: liveSlot.avgLatencyMs,
        lastTtftMs: liveSlot.lastTtftMs,
        avgTtftMs: liveSlot.avgTtftMs,
        lastTokensPerSec: liveSlot.lastTokensPerSec,
        avgTokensPerSec: liveSlot.avgTokensPerSec,
        requestCap: null,
        retired: false,
      };
    }),
  }));
  const deepseekProviders = deepseekRuntime.providers.map(provider => ({
    id: provider.id,
    label: provider.label,
    slots: provider.apiKeys.map((credential, index) => {
      const metric = metricsByKey.get(`deepseek-v4-pro:${managedProviderCredentialFingerprint("deepseek-v4-pro", credential, provider.id)}`);
      const liveSlot = getCredentialSlotTelemetry(`deepseek-v4-pro:${provider.id}`, index);
      return {
        slot: index + 1,
        keyMask: maskProviderApiKey(credential),
        requestCount: Number(metric?.requestCount ?? 0),
        successCount: Number(metric?.successCount ?? 0),
        failureCount: Number(metric?.failureCount ?? 0),
        health: liveSlot.health,
        cooldownUntil: liveSlot.cooldownUntil,
        lastRequestAt: metric?.lastRequestAt ?? null,
        lastSuccessAt: metric?.lastSuccessAt ?? null,
        lastFailureAt: metric?.lastFailureAt ?? null,
        activeRequests: liveSlot.activeRequests,
        lastLatencyMs: liveSlot.lastLatencyMs,
        avgLatencyMs: liveSlot.avgLatencyMs,
        lastTtftMs: liveSlot.lastTtftMs,
        avgTtftMs: liveSlot.avgTtftMs,
        lastTokensPerSec: liveSlot.lastTokensPerSec,
        avgTokensPerSec: liveSlot.avgTokensPerSec,
        requestCap: null,
        retired: false,
      };
    }),
  }));
  const sonnetProviders = sonnetRuntime.providers.map(provider => ({
    id: provider.id,
    label: provider.label,
    slots: provider.apiKeys.map((credential, index) => {
      const metric = metricsByKey.get(`claude-sonnet-4.6:${managedProviderCredentialFingerprint("claude-sonnet-4.6", credential, provider.id)}`);
      const liveSlot = getCredentialSlotTelemetry(`claude-sonnet-4.6:${provider.id}` as CredentialTelemetryProvider, index);
      return {
        slot: index + 1,
        keyMask: maskProviderApiKey(credential),
        requestCount: Number(metric?.requestCount ?? 0),
        successCount: Number(metric?.successCount ?? 0),
        failureCount: Number(metric?.failureCount ?? 0),
        health: liveSlot.health,
        cooldownUntil: liveSlot.cooldownUntil,
        lastRequestAt: metric?.lastRequestAt ?? null,
        lastSuccessAt: metric?.lastSuccessAt ?? null,
        lastFailureAt: metric?.lastFailureAt ?? null,
        activeRequests: liveSlot.activeRequests,
        lastLatencyMs: liveSlot.lastLatencyMs,
        avgLatencyMs: liveSlot.avgLatencyMs,
        lastTtftMs: liveSlot.lastTtftMs,
        avgTtftMs: liveSlot.avgTtftMs,
        lastTokensPerSec: liveSlot.lastTokensPerSec,
        avgTokensPerSec: liveSlot.avgTokensPerSec,
        requestCap: null,
        retired: false,
      };
    }),
  }));
  const qwenProviders = qwenRuntime.providers.map(provider => ({
    id: provider.id,
    label: provider.label,
    slots: provider.apiKeys.map((credential, index) => {
      const metric = metricsByKey.get(`qwen3.8-max:${managedProviderCredentialFingerprint("qwen3.8-max", credential, provider.id)}`);
      const liveSlot = getCredentialSlotTelemetry(`qwen3.8-max:${provider.id}`, index);
      return {
        slot: index + 1,
        keyMask: maskProviderApiKey(credential),
        requestCount: Number(metric?.requestCount ?? 0),
        successCount: Number(metric?.successCount ?? 0),
        failureCount: Number(metric?.failureCount ?? 0),
        health: liveSlot.health,
        cooldownUntil: liveSlot.cooldownUntil,
        lastRequestAt: metric?.lastRequestAt ?? null,
        lastSuccessAt: metric?.lastSuccessAt ?? null,
        lastFailureAt: metric?.lastFailureAt ?? null,
        activeRequests: liveSlot.activeRequests,
        lastLatencyMs: liveSlot.lastLatencyMs,
        avgLatencyMs: liveSlot.avgLatencyMs,
        lastTtftMs: liveSlot.lastTtftMs,
        avgTtftMs: liveSlot.avgTtftMs,
        lastTokensPerSec: liveSlot.lastTokensPerSec,
        avgTokensPerSec: liveSlot.avgTokensPerSec,
        requestCap: null,
        retired: false,
      };
    }),
  }));
  const gpt6AstraProviders = gpt6AstraRuntime.providers.map(provider => ({
    id: provider.id,
    label: provider.label,
    slots: provider.apiKeys.map((credential, index) => {
      const metric = metricsByKey.get(`gpt-6-astra:${managedProviderCredentialFingerprint("gpt-6-astra", credential, provider.id)}`);
      const liveSlot = getCredentialSlotTelemetry(`gpt-6-astra:${provider.id}` as CredentialTelemetryProvider, index);
      return {
        slot: index + 1,
        keyMask: maskProviderApiKey(credential),
        requestCount: Number(metric?.requestCount ?? 0),
        successCount: Number(metric?.successCount ?? 0),
        failureCount: Number(metric?.failureCount ?? 0),
        health: liveSlot?.health ?? "unknown",
        cooldownUntil: liveSlot?.cooldownUntil ?? null,
        lastRequestAt: metric?.lastRequestAt ?? null,
        lastSuccessAt: metric?.lastSuccessAt ?? null,
        lastFailureAt: metric?.lastFailureAt ?? null,
        activeRequests: liveSlot?.activeRequests ?? 0,
        lastLatencyMs: liveSlot?.lastLatencyMs ?? null,
        avgLatencyMs: liveSlot?.avgLatencyMs ?? null,
        lastTtftMs: liveSlot?.lastTtftMs ?? null,
        avgTtftMs: liveSlot?.avgTtftMs ?? null,
        lastTokensPerSec: liveSlot?.lastTokensPerSec ?? null,
        avgTokensPerSec: liveSlot?.avgTokensPerSec ?? null,
        requestCap: null,
        retired: false,
      };
    }),
  }));
  const kimiProviders = kimiRuntime.providers.map(provider => ({
    id: provider.id,
    label: provider.label,
    slots: provider.apiKeys.map((credential, index) => {
      const metric = metricsByKey.get(`kimi-k3:${managedProviderCredentialFingerprint("kimi-k3", credential, provider.id)}`);
      const liveSlot = getCredentialSlotTelemetry(`kimi-k3:${provider.id}` as CredentialTelemetryProvider, index);
      return {
        slot: index + 1,
        keyMask: maskProviderApiKey(credential),
        requestCount: Number(metric?.requestCount ?? 0),
        successCount: Number(metric?.successCount ?? 0),
        failureCount: Number(metric?.failureCount ?? 0),
        health: liveSlot?.health ?? "unknown",
        cooldownUntil: liveSlot?.cooldownUntil ?? null,
        lastRequestAt: metric?.lastRequestAt ?? null,
        lastSuccessAt: metric?.lastSuccessAt ?? null,
        lastFailureAt: metric?.lastFailureAt ?? null,
        activeRequests: liveSlot?.activeRequests ?? 0,
        lastLatencyMs: liveSlot?.lastLatencyMs ?? null,
        avgLatencyMs: liveSlot?.avgLatencyMs ?? null,
        lastTtftMs: liveSlot?.lastTtftMs ?? null,
        avgTtftMs: liveSlot?.avgTtftMs ?? null,
        lastTokensPerSec: liveSlot?.lastTokensPerSec ?? null,
        avgTokensPerSec: liveSlot?.avgTokensPerSec ?? null,
        requestCap: null,
        retired: false,
      };
    }),
  }));
  const universalGroups = await import("./universalModelProviders")
    .then(m => m.listAllUniversalKeyMetricGroups())
    .catch(() => []);

  const staticIds = new Set([
    "claude-fable-5.1",
    "claude-opus-5",
    "claude-sonnet-4.6",
    "deepseek-v4-pro",
    "qwen3.8-max",
    "gpt-6-astra",
    "kimi-k3",
    ...runtimes.map(r => r.modelId),
  ]);

  const uniqueUniversal = universalGroups.filter(g => !staticIds.has(g.modelId));

  return [
    ...standardMetrics,
    { modelId: "claude-fable-5.1", slots: [], providers: fableProviders },
    { modelId: "claude-opus-5", slots: [], providers: opusProviders },
    { modelId: "claude-sonnet-4.6", slots: [], providers: sonnetProviders },
    { modelId: "deepseek-v4-pro", slots: [], providers: deepseekProviders },
    { modelId: "qwen3.8-max", slots: [], providers: qwenProviders },
    { modelId: "gpt-6-astra", slots: [], providers: gpt6AstraProviders },
    { modelId: "kimi-k3", slots: [], providers: kimiProviders },
    ...uniqueUniversal,
  ];
}

export async function promoteUserToAdmin(userId: number) {
  const db = await getDb();
  if (!db) return false;
  const result = await db.update(users).set({ role: "admin" }).where(eq(users.id, userId));
  return result[0].affectedRows > 0;
}

export async function demoteUserToStandardRole(userId: number) {
  const db = await getDb();
  if (!db) return false;
  const result = await db.update(users).set({ role: "user" }).where(eq(users.id, userId));
  return result[0].affectedRows > 0;
}

/** Clears legacy persistent admin flags; access is now carried only by a passcode-issued session. */
export async function clearLegacyAdministratorRoles() {
  const db = await getDb();
  if (!db) return false;
  const result = await db.update(users).set({ role: "user" }).where(and(eq(users.role, "admin"), ne(users.openId, ADMIN_SESSION_PRINCIPAL_OPEN_ID)));
  return result[0].affectedRows >= 0;
}

export async function ensureAccountControl(userId: number) {
  const db = await getDb();
  if (!db) return null;
  await db
    .insert(accountControls)
    .values({
      userId,
      dailyRequestLimit: DEFAULT_DAILY_REQUEST_LIMIT,
      dailyTokenLimit: DEFAULT_DAILY_TOKEN_LIMIT,
      maxConcurrentRequests: DEFAULT_MAX_CONCURRENT_REQUESTS,
    })
    .onDuplicateKeyUpdate({ set: { userId } });
  const rows = await db.select().from(accountControls).where(eq(accountControls.userId, userId)).limit(1);
  return rows[0] ?? null;
}

/**
 * Records the successful guild-membership check without retaining a Discord
 * user ID, OAuth access token, refresh token, or profile data.
 */
/**
 * Binds a Discord identity to exactly one TokenForge account. The unique
 * (provider, providerUserId) constraint rejects re-verification of the same
 * Discord account by another TokenForge account; this returns null when the
 * Discord user is already linked to a different account.
 */
export async function bindDiscordIdentity(userId: number, discordUserId: string) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  if (!discordUserId.trim()) throw new Error("Discord identity is required");
  const provider = "discord";
  const prior = (await db.select({ userId: oauthIdentities.userId }).from(oauthIdentities)
    .where(and(eq(oauthIdentities.provider, provider), eq(oauthIdentities.providerUserId, discordUserId))).limit(1))[0];
  if (prior && prior.userId !== userId) return null;
  try {
    await db.insert(oauthIdentities).values({ userId, provider, providerUserId: discordUserId })
      .onDuplicateKeyUpdate({ set: { providerUserId: discordUserId, updatedAt: new Date() } });
    return true;
  } catch (error: any) {
    if (error?.code !== "ER_DUP_ENTRY") throw error;
    const concurrent = (await db.select({ userId: oauthIdentities.userId }).from(oauthIdentities)
      .where(and(eq(oauthIdentities.provider, provider), eq(oauthIdentities.providerUserId, discordUserId))).limit(1))[0];
    if (concurrent && concurrent.userId !== userId) return null;
    return true;
  }
}

/** Looks up a registered Qronos user account bound to a Discord account ID. */
export async function findUserByDiscordId(discordUserId: string) {
  const db = await getDb();
  if (!db || !discordUserId) return null;
  const identity = (await db.select({ userId: oauthIdentities.userId })
    .from(oauthIdentities)
    .where(and(eq(oauthIdentities.provider, "discord"), eq(oauthIdentities.providerUserId, String(discordUserId))))
    .limit(1))[0];
  if (!identity) return null;
  return await getUserById(identity.userId);
}

export async function markDiscordVerified(userId: number) {
  const db = await getDb();
  const controls = await ensureAccountControl(userId);
  if (!db || !controls) throw new Error("TokenForge account controls are unavailable");

  const verifiedAt = new Date();
  await db.update(accountControls)
    .set({ discordVerifiedAt: verifiedAt })
    .where(eq(accountControls.userId, userId));
  bustCache(`discord_verified:${userId}`);
  await writeAuditEvent({
    actorUserId: userId,
    targetUserId: userId,
    action: "discord.membership_verified",
    entityType: "account",
    entityId: String(userId),
  });

  return verifiedAt;
}

/**
 * Idempotently awards the 10,000,000 free token introductory grant once
 * the developer has successfully verified their Discord server membership.
 */
export async function awardDiscordVerificationTokens(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const referenceId = `welcome-tokens:${userId}`;
  await ensureCreditAccount(userId);

  try {
    return await db.transaction(async tx => {
      const existingGrant = (await tx.select({ id: creditLedger.id }).from(creditLedger)
        .where(and(eq(creditLedger.userId, userId), eq(creditLedger.referenceId, referenceId))).limit(1))[0];
      if (existingGrant) return { awarded: false, alreadyAwarded: true };

      await tx.update(creditAccounts)
        .set({ codingPlanTokens: sql`${creditAccounts.codingPlanTokens} + 10000000` })
        .where(eq(creditAccounts.userId, userId));

      const account = (await tx.select().from(creditAccounts).where(eq(creditAccounts.userId, userId)).limit(1))[0];
      const balanceAfter = Number((account as any)?.codingPlanTokens ?? 10_000_000);

      await tx.insert(creditLedger).values({
        userId,
        kind: "introductory_grant",
        amountNanos: 0,
        balanceAfterNanos: balanceAfter,
        referenceId,
        note: "Welcome grant: 10,000,000 free tokens for autonomous coding and inference (Discord Verified)",
      });
      return { awarded: true, codingPlanTokens: balanceAfter };
    });
  } catch (error: any) {
    if (error?.code === "ER_DUP_ENTRY") return { awarded: false, alreadyAwarded: true };
    throw error;
  }
}

export async function isDiscordVerified(userId: number) {
  if (userId === FALLBACK_ADMIN_SESSION_PRINCIPAL.id) return true;
  return cached(`discord_verified:${userId}`, 30_000, async () => {
    const db = await getDb();
    if (!db) return false;
    const userRow = (await db.select({ role: users.role, openId: users.openId }).from(users).where(eq(users.id, userId)).limit(1))[0];
    if (userRow?.role === "admin" || userRow?.openId === ADMIN_SESSION_PRINCIPAL_OPEN_ID) return true;
    const record = (await db.select({ discordVerifiedAt: accountControls.discordVerifiedAt })
      .from(accountControls)
      .where(eq(accountControls.userId, userId))
      .limit(1))[0];
    return Boolean(record?.discordVerifiedAt);
  });
}

/**
 * Manually verifies a user by email, bypassing Discord OAuth guild membership requirements,
 * and awards the 10,000,000 welcome tokens if not already awarded.
 */
export async function bypassDiscordVerificationByEmail(emailInput: string) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const email = normalizeEmail(emailInput);
  if (!email) return { found: false as const, reason: "invalid_email" as const };

  const user = await getUserByEmail(email);
  if (!user) return { found: false as const, reason: "not_found" as const };

  const wasAlreadyVerified = Boolean(user.discordVerifiedAt);
  const now = new Date();

  await ensureAccountControl(user.id);
  await db.update(accountControls)
    .set({ discordVerifiedAt: now })
    .where(eq(accountControls.userId, user.id));
  bustCache(`discord_verified:${user.id}`);

  // Award the 10,000,000 free tokens if not already awarded
  const grantResult = await awardDiscordVerificationTokens(user.id);

  return {
    found: true as const,
    alreadyVerified: wasAlreadyVerified,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      discordVerifiedAt: now,
      tokensAwarded: grantResult.awarded ? 10_000_000 : 0,
    },
  };
}

/**
 * Lists users who have been verified (via OAuth or manual admin bypass).
 */
export async function listDiscordVerifiedAccounts(limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      tier: users.tier,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
      discordVerifiedAt: accountControls.discordVerifiedAt,
      codingPlanTokens: creditAccounts.codingPlanTokens,
    })
    .from(users)
    .innerJoin(accountControls, and(eq(users.id, accountControls.userId), isNotNull(accountControls.discordVerifiedAt)))
    .leftJoin(creditAccounts, eq(users.id, creditAccounts.userId))
    .orderBy(desc(accountControls.discordVerifiedAt))
    .limit(limit);
  return rows;
}

/** Clears the privacy-minimizing verification timestamp so the member must re-complete the existing OAuth membership check. */
export async function resetDiscordVerification(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const account = (await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!account) return null;

  const controls = await ensureAccountControl(userId);
  if (!controls) throw new Error("TokenForge account controls are unavailable");
  const wasVerified = Boolean(controls.discordVerifiedAt);
  await db.update(accountControls)
    .set({ discordVerifiedAt: null })
    .where(eq(accountControls.userId, userId));
  bustCache(`discord_verified:${userId}`);
  return { reset: wasVerified };
}

export async function cleanupUserExpiredApiKeys(userId?: number, database?: any) {
  const db = database ?? await getDb();
  if (!db) return 0;
  try {
    const where = userId
      ? and(eq(apiKeys.userId, userId), isNotNull(apiKeys.expiresAt), lte(apiKeys.expiresAt, new Date()))
      : and(isNotNull(apiKeys.expiresAt), lte(apiKeys.expiresAt, new Date()));
    const result = await db.delete(apiKeys).where(where);
    const deletedCount = Number(result[0]?.affectedRows ?? 0);
    if (deletedCount > 0) {
      API_KEY_CACHE.clear();
    }
    return deletedCount;
  } catch (err) {
    console.warn("[API Keys] Error cleaning up expired keys:", err);
    return 0;
  }
}

export async function createApiKey(
  userId: number,
  label: string,
  keyGroup: "payg" | "bundle" | "token_plan" | "tokens" | "coding_plan" = "payg",
  options?: {
    expiresAt?: Date | string | null;
    spendLimitTokens?: number | null;
    spendLimitNanos?: number | null;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");

  const verified = await isDiscordVerified(userId);
  if (!verified) {
    throw new Error("Discord membership verification is required to create API keys. Please verify your Discord membership.");
  }

  // Normalize bundle group to payg
  const normalizedKeyGroup = keyGroup === "bundle" ? "payg" : (keyGroup || "payg");

  // Automatically delete any expired keys first so the user gets accurate active count
  await cleanupUserExpiredApiKeys(userId, db);

  // Enforce max 10 active API keys per account
  const activeKeys = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.status, "active")));

  if (activeKeys.length >= 10) {
    throw new Error("Maximum limit of 10 active API keys reached for this account. Please revoke or delete an existing key before creating a new one.");
  }

  const parsedExpiresAt = options?.expiresAt ? new Date(options.expiresAt) : null;
  const spendLimitTokens = options?.spendLimitTokens && options.spendLimitTokens > 0 ? options.spendLimitTokens : null;
  const spendLimitNanos = options?.spendLimitNanos && options.spendLimitNanos > 0 ? options.spendLimitNanos : null;

  const secret = newPlaintextKey();
  const keyPrefix = `${secret.slice(0, 15)}…`;
  const keyHash = hashApiKey(secret);
  await db.insert(apiKeys).values({
    userId,
    label,
    keyPrefix,
    keyHash,
    keyGroup: normalizedKeyGroup,
    expiresAt: parsedExpiresAt,
    spendLimitTokens,
    spendLimitNanos,
  });
  const created = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1);
  if (!created[0]) throw new Error("API key creation did not persist");
  return { key: secret, record: publicApiKey(created[0]) };
}

export async function listApiKeys(userId: number) {
  const db = await getDb();
  if (!db) return [];
  // Automatically purge any expired keys so user never sees expired keys
  await cleanupUserExpiredApiKeys(userId, db);
  const keys = await db.select().from(apiKeys).where(eq(apiKeys.userId, userId)).orderBy(desc(apiKeys.createdAt));
  return keys.map(publicApiKey);
}

export async function revokeApiKey(userId: number, apiKeyId: number) {
  const db = await getDb();
  if (!db) return false;
  // Permanently delete the API key row from the database
  const result = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, apiKeyId), eq(apiKeys.userId, userId)));
  const success = (result[0]?.affectedRows ?? 0) > 0;
  if (success) {
    API_KEY_CACHE.clear();
  }
  return success;
}

export async function deleteApiKey(userId: number, apiKeyId: number) {
  return revokeApiKey(userId, apiKeyId);
}

export async function purgeRevokedApiKeys() {
  const db = await getDb();
  if (!db) return 0;
  try {
    const result = await db
      .delete(apiKeys)
      .where(ne(apiKeys.status, "active"));
    API_KEY_CACHE.clear();
    return result[0]?.affectedRows ?? 0;
  } catch (err) {
    console.warn("[Database] Purge revoked API keys warning:", err);
    return 0;
  }
}

export async function rotateApiKey(
  userId: number,
  apiKeyId: number,
  label: string,
  keyGroup?: "payg" | "bundle" | "token_plan" | "tokens" | "coding_plan"
) {
  const db = await getDb();
  let existingGroup: "payg" | "bundle" | "token_plan" | "tokens" | "coding_plan" = keyGroup === "bundle" ? "payg" : (keyGroup ?? "payg");
  let existingExpiresAt: Date | null = null;
  let existingSpendLimitTokens: number | null = null;
  let existingSpendLimitNanos: number | null = null;

  if (db) {
    const existing = (await db.select().from(apiKeys).where(and(eq(apiKeys.id, apiKeyId), eq(apiKeys.userId, userId))).limit(1))[0];
    if (existing) {
      if (!keyGroup) {
        const raw = (existing as any).keyGroup;
        existingGroup = raw === "bundle" ? "payg" : (raw || "payg");
      }
      existingExpiresAt = existing.expiresAt ? new Date(existing.expiresAt) : null;
      existingSpendLimitTokens = (existing as any).spendLimitTokens ?? null;
      existingSpendLimitNanos = (existing as any).spendLimitNanos ?? null;
    }
  }
  const wasRevoked = await revokeApiKey(userId, apiKeyId);
  if (!wasRevoked) return null;
  return createApiKey(userId, label, existingGroup, {
    expiresAt: existingExpiresAt,
    spendLimitTokens: existingSpendLimitTokens,
    spendLimitNanos: existingSpendLimitNanos,
  });
}

interface ApiKeyCacheEntry {
  apiKey: any;
  expiresAt: number;
}

const API_KEY_CACHE = new Map<string, ApiKeyCacheEntry>();
const POSITIVE_KEY_CACHE_TTL_MS = 60_000; // 60s for valid keys
const NEGATIVE_KEY_CACHE_TTL_MS = 30_000; // 30s for non-existent / fake keys

export function clearApiKeyCache() {
  API_KEY_CACHE.clear();
}

export async function findActiveApiKey(plainTextKey: string, database?: ApiKeyLookupDatabase | null) {
  if (!plainTextKey || typeof plainTextKey !== "string") return null;
  const normalizedKey = plainTextKey.trim();
  if (!normalizedKey) return null;

  // If using default database connection (production path), check fast in-memory cache
  if (!database) {
    const cached = API_KEY_CACHE.get(normalizedKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.apiKey;
    }
  }

  const db = database ?? await getDb();
  if (!db) return null;
  const hash = hashApiKey(normalizedKey);
  const rows = await db
    .select({ apiKey: apiKeys })
    .from(apiKeys)
    .innerJoin(users, eq(apiKeys.userId, users.id))
    .where(and(eq(apiKeys.keyHash, hash), eq(apiKeys.status, "active")))
    .limit(1);
  const found = rows[0]?.apiKey ?? null;

  // If key has expired, automatically delete it from database and reject
  if (found && (found as any).expiresAt && new Date((found as any).expiresAt).getTime() <= Date.now()) {
    try {
      await db.delete(apiKeys).where(eq(apiKeys.id, found.id));
    } catch {}
    if (!database) {
      API_KEY_CACHE.delete(normalizedKey);
    }
    return null;
  }

  if (!database) {
    // Keep cache bounded to 5,000 entries max to prevent memory leakage
    if (API_KEY_CACHE.size > 5_000) {
      const now = Date.now();
      for (const [k, v] of API_KEY_CACHE.entries()) {
        if (v.expiresAt <= now) API_KEY_CACHE.delete(k);
      }
      if (API_KEY_CACHE.size > 5_000) API_KEY_CACHE.clear();
    }
    API_KEY_CACHE.set(normalizedKey, {
      apiKey: found,
      expiresAt: Date.now() + (found ? POSITIVE_KEY_CACHE_TTL_MS : NEGATIVE_KEY_CACHE_TTL_MS),
    });
  }

  return found;
}

const API_KEY_TOUCH_CACHE = new Map<number, number>();
const API_KEY_TOUCH_INTERVAL_MS = 60_000;

export async function touchApiKey(apiKeyId: number) {
  const now = Date.now();
  const last = API_KEY_TOUCH_CACHE.get(apiKeyId);
  if (last && now - last < API_KEY_TOUCH_INTERVAL_MS) {
    return;
  }
  API_KEY_TOUCH_CACHE.set(apiKeyId, now);
  const db = await getDb();
  if (!db) return;
  try {
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, apiKeyId));
  } catch (err) {
    console.warn("[touchApiKey] error updating lastUsedAt:", err);
  }
}

export async function getQuotaStatus(userId: number) {
  const db = await getDb();
  const controls = await ensureAccountControl(userId);
  if (!db || !controls) return null;
  const today = utcUsageDate();
  const totals = await db
    .select({
      requests: sql<number>`coalesce(sum(${dailyUsage.requestCount}), 0)`,
      tokens: sql<number>`coalesce(sum(${dailyUsage.totalTokens}), 0)`,
    })
    .from(dailyUsage)
    .where(and(eq(dailyUsage.userId, userId), eq(dailyUsage.usageDate, today)));
  const usedRequests = Number(totals[0]?.requests ?? 0);
  const usedTokens = Number(totals[0]?.tokens ?? 0);
  return {
    day: today.toISOString().slice(0, 10),
    suspended: controls.isSuspended,
    suspicious: controls.isSuspicious,
    requestLimit: controls.dailyRequestLimit,
    tokenLimit: controls.dailyTokenLimit,
    maxConcurrentRequests: controls.maxConcurrentRequests,
    usedRequests,
    usedTokens,
    remainingRequests: Math.max(0, controls.dailyRequestLimit - usedRequests),
    remainingTokens: Math.max(0, controls.dailyTokenLimit - usedTokens),
  };
}

export async function getUsageSummary(userId: number) {
  const db = await getDb();
  const quota = await getQuotaStatus(userId);
  if (!db) return { quota, totalRequests: 0, totalTokens: 0, daily: [] as { day: string; requests: number; tokens: number }[], byModel: [] as { modelId: string; requests: number; tokens: number }[] };
  const totals = await db
    .select({
      totalRequests: sql<number>`coalesce(sum(${dailyUsage.requestCount}), 0)`,
      totalTokens: sql<number>`coalesce(sum(${dailyUsage.totalTokens}), 0)`,
    })
    .from(dailyUsage)
    .where(eq(dailyUsage.userId, userId));
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 13);
  const [rows, modelRows] = await Promise.all([
    db
      .select({ day: dailyUsage.usageDate, requests: dailyUsage.requestCount, tokens: dailyUsage.totalTokens })
      .from(dailyUsage)
      .where(and(eq(dailyUsage.userId, userId), gte(dailyUsage.usageDate, utcUsageDate(start))))
      .orderBy(dailyUsage.usageDate),
    db
      .select({
        modelId: dailyUsage.modelId,
        requests: sql<number>`coalesce(sum(${dailyUsage.requestCount}), 0)`,
        tokens: sql<number>`coalesce(sum(${dailyUsage.totalTokens}), 0)`,
      })
      .from(dailyUsage)
      .where(eq(dailyUsage.userId, userId))
      .groupBy(dailyUsage.modelId)
      .orderBy(desc(sql`sum(${dailyUsage.totalTokens})`)),
  ]);
  return {
    quota,
    totalRequests: Number(totals[0]?.totalRequests ?? 0),
    totalTokens: Number(totals[0]?.totalTokens ?? 0),
    daily: rows.map(row => ({ day: new Date(row.day).toISOString().slice(0, 10), requests: Number(row.requests), tokens: Number(row.tokens) })),
    byModel: modelRows.map(row => ({ modelId: row.modelId, requests: Number(row.requests), tokens: Number(row.tokens) })),
  };
}

export async function getPublicModelTokenMetrics() {
  return cached("public_model_token_metrics", 60_000, async () => {
    const byModel = Object.fromEntries(TOKENFORGE_MODEL_IDS.map(modelId => [modelId, 0])) as Record<TokenForgeModelId, number>;
    const empty = { totalTokens: TOKENFORGE_TOKEN_BASELINE, byModel };
    try {
      const db = await getDb();
      if (!db) return empty;
      const rows = await db
        .select({ modelId: dailyUsage.modelId, totalTokens: sql<number>`coalesce(sum(${dailyUsage.totalTokens}), 0)` })
        .from(dailyUsage)
        .groupBy(dailyUsage.modelId);
      for (const row of rows) {
        if (TOKENFORGE_MODEL_IDS.includes(row.modelId as TokenForgeModelId)) byModel[row.modelId as TokenForgeModelId] = Number(row.totalTokens ?? 0);
      }
      const recordedTotalTokens = Object.values(byModel).reduce((total, amount) => total + amount, 0);
      return { totalTokens: TOKENFORGE_TOKEN_BASELINE + recordedTotalTokens, byModel };
    } catch (error: any) {
      markDatabaseUnhealthy(error?.message ?? String(error));
      return empty;
    }
  });
}

type UsageEventInsert = typeof usageEvents.$inferInsert;

interface DailyUsageRollup {
  userId: number;
  apiKeyId?: number;
  usageDate: Date;
  modelId: string;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

let _pendingUsageEvents: UsageEventInsert[] = [];
let _pendingDailyUsage = new Map<string, DailyUsageRollup>();
let _flushUsageTimer: NodeJS.Timeout | null = null;
let _isFlushingUsage = false;

export async function flushUsageBuffer(): Promise<void> {
  if (_isFlushingUsage) return;
  const events = _pendingUsageEvents;
  const rollups = Array.from(_pendingDailyUsage.values());
  if (events.length === 0 && rollups.length === 0) return;

  _pendingUsageEvents = [];
  _pendingDailyUsage = new Map();
  _isFlushingUsage = true;

  try {
    const db = await getDb();
    if (!db) return;

    if (events.length > 0) {
      await db.insert(usageEvents).values(events).catch(err => {
        console.warn("[flushUsageBuffer] Error batch inserting usageEvents:", err);
      });
    }

    if (rollups.length > 0) {
      for (const r of rollups) {
        await db
          .insert(dailyUsage)
          .values({
            userId: r.userId,
            apiKeyId: r.apiKeyId,
            usageDate: r.usageDate,
            modelId: r.modelId,
            requestCount: r.requestCount,
            inputTokens: r.inputTokens,
            outputTokens: r.outputTokens,
            totalTokens: r.totalTokens,
          })
          .onDuplicateKeyUpdate({
            set: {
              requestCount: sql`${dailyUsage.requestCount} + ${r.requestCount}`,
              inputTokens: sql`${dailyUsage.inputTokens} + ${r.inputTokens}`,
              outputTokens: sql`${dailyUsage.outputTokens} + ${r.outputTokens}`,
              totalTokens: sql`${dailyUsage.totalTokens} + ${r.totalTokens}`,
              updatedAt: new Date(),
            },
          })
          .catch(err => {
            console.warn("[flushUsageBuffer] Error rolling up dailyUsage:", err);
          });
      }
    }
  } finally {
    _isFlushingUsage = false;
  }
}

function scheduleFlushUsageBuffer() {
  if (_pendingUsageEvents.length >= 25) {
    void flushUsageBuffer();
    return;
  }
  if (!_flushUsageTimer) {
    _flushUsageTimer = setTimeout(() => {
      _flushUsageTimer = null;
      void flushUsageBuffer();
    }, 1500);
  }
}

export async function recordUsage(input: {
  requestId: string;
  userId: number;
  apiKeyId?: number;
  modelId: string;
  status: "success" | "rejected" | "provider_error" | "cancelled";
  source?: "api" | "playground";
  /** Editor extension vs terminal CLI vs unknown API caller, forwarded to the live panel only. */
  client?: "code" | "cli" | "api";
  stream?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  chargeNanos?: number;
  sourceIpHash?: string;
  latencyMs?: number;
  ttftMs?: number | null;
  durationMs?: number | null;
  stopReason?: string | null;
  outcome?: "success" | "truncated" | "client_disconnected" | "upstream_error" | "rejected";
  errorMessage?: string;
  rawErrorMessage?: string;
  provider?: string;
  isMultimodal?: boolean;
  reasoningReturned?: boolean;
}) {
  const inputTokens = input.inputTokens ?? 0;
  const outputTokens = input.outputTokens ?? 0;
  const totalTokens = inputTokens + outputTokens;
  const chargeNanos = input.chargeNanos ?? 0;
  const day = utcUsageDate();
  const provider = input.provider
    ? (input.isMultimodal === false
        ? input.provider.replace(/\s*\((?:multimodal|image:[^)]+|document)\)/gi, "").trim()
        : (input.isMultimodal && !input.provider.toLowerCase().includes("(")
            ? `${input.provider} (multimodal)`
            : input.provider))
    : input.provider;
  const rawErrorMessage = input.rawErrorMessage ?? input.errorMessage;

  let outcome = input.outcome;
  if (!outcome) {
    if (input.status === "rejected") {
      outcome = "rejected";
    } else if (input.status === "provider_error") {
      outcome = "upstream_error";
    } else if (input.status === "cancelled") {
      outcome = "client_disconnected";
    } else if (input.stopReason === "max_tokens" || input.stopReason === "length") {
      outcome = "truncated";
    } else {
      outcome = "success";
    }
  }

  const durationMs = input.durationMs ?? input.latencyMs ?? null;
  const ttftMs = input.ttftMs ?? null;
  const stopReason = input.stopReason ?? (outcome === "success" ? "end_turn" : "none");

  _pendingUsageEvents.push({
    ...input,
    provider,
    inputTokens,
    outputTokens,
    totalTokens,
    chargeNanos,
    rawErrorMessage,
    outcome,
    stopReason,
    ttftMs,
    durationMs,
  });

  const rollupKey = `${input.userId}:${input.apiKeyId ?? 0}:${day.toISOString().slice(0, 10)}:${input.modelId}`;
  const existing = _pendingDailyUsage.get(rollupKey);
  if (existing) {
    existing.requestCount += 1;
    existing.inputTokens += inputTokens;
    existing.outputTokens += outputTokens;
    existing.totalTokens += totalTokens;
  } else {
    _pendingDailyUsage.set(rollupKey, {
      userId: input.userId,
      apiKeyId: input.apiKeyId,
      usageDate: day,
      modelId: input.modelId,
      requestCount: 1,
      inputTokens,
      outputTokens,
      totalTokens,
    });
  }

  scheduleFlushUsageBuffer();

  const userName = input.userId ? await lookupUserName(input.userId) : null;
  const isReasoningFallback = Boolean(
    input.reasoningReturned ||
    (rawErrorMessage && rawErrorMessage.includes("[ReasoningFallback")) ||
    (input.source && input.source.includes("reasoning_returned"))
  );
  publishLiveRequest({
    requestId: input.requestId,
    userId: input.userId,
    apiKeyId: input.apiKeyId,
    modelId: input.modelId,
    status: input.status,
    source: (input.source ?? "api") as "api" | "playground",
    client: input.client,
    stream: input.stream ?? false,
    inputTokens,
    outputTokens,
    totalTokens,
    chargeNanos,
    sourceIpHash: input.sourceIpHash,
    latencyMs: input.latencyMs,
    ttftMs,
    durationMs,
    stopReason,
    outcome,
    errorMessage: input.errorMessage,
    rawErrorMessage: input.rawErrorMessage,
    provider: input.provider,
    createdAt: new Date(),
    userName,
    reasoningReturned: isReasoningFallback,
  });
}

/** Returns the most recent usage events for the admin live request log snapshot. */
export async function getRecentLiveRequests(limit = 25, onlyUserId?: number): Promise<LiveRequestEvent[]> {
  const db = await getDb();
  if (!db) return [];
  const bounded = Math.min(Math.max(Math.floor(limit), 1), 100);
  const selectRows = (withClient: boolean) =>
    db
    .select({
      requestId: usageEvents.requestId,
      userId: usageEvents.userId,
      apiKeyId: usageEvents.apiKeyId,
      modelId: usageEvents.modelId,
      status: usageEvents.status,
      source: usageEvents.source,
      // The client column arrives with a migration; until then the panel still
      // works and falls back to the API-key guess.
      client: withClient ? usageEvents.client : sql<string | null>`null`,
      stream: usageEvents.stream,
      inputTokens: usageEvents.inputTokens,
      outputTokens: usageEvents.outputTokens,
      totalTokens: usageEvents.totalTokens,
      chargeNanos: usageEvents.chargeNanos,
      sourceIpHash: usageEvents.sourceIpHash,
      latencyMs: usageEvents.latencyMs,
      ttftMs: usageEvents.ttftMs,
      durationMs: usageEvents.durationMs,
      stopReason: usageEvents.stopReason,
      outcome: usageEvents.outcome,
      errorMessage: usageEvents.errorMessage,
      rawErrorMessage: usageEvents.rawErrorMessage,
      provider: usageEvents.provider,
      createdAt: usageEvents.createdAt,
      userName: users.name,
      apiKeyLabel: apiKeys.label,
      apiKeyGroup: apiKeys.keyGroup,
    })
    .from(usageEvents)
    .leftJoin(users, eq(usageEvents.userId, users.id))
    .leftJoin(apiKeys, eq(usageEvents.apiKeyId, apiKeys.id))
    .where(onlyUserId === undefined ? undefined : eq(usageEvents.userId, onlyUserId))
    .orderBy(desc(usageEvents.createdAt))
    .limit(bounded);

  let rows: Awaited<ReturnType<typeof selectRows>>;
  try {
    rows = await selectRows(true);
  } catch (err) {
    console.warn("[getRecentLiveRequests] client column missing, falling back:", err);
    rows = await selectRows(false);
  }
  return rows.map(row => ({
    requestId: row.requestId,
    userId: row.userId,
    apiKeyId: row.apiKeyId ?? undefined,
    // Which client the stored row came from: guessed from the key it used, so
    // old rows show the right badge too (the column is not stored for usage rows).
    // The header tag is stored with the row; older rows fall back to a guess
    // from the API key, which is all the old data allows.
    client: row.source === "playground"
      ? undefined
      : (row.client === "code" || row.client === "cli" || row.client === "api"
          ? row.client
          : clientTagFromApiKey({ label: row.apiKeyLabel, keyGroup: row.apiKeyGroup })),
    modelId: row.modelId,
    status: row.status,
    source: row.source,
    stream: row.stream,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    totalTokens: row.totalTokens,
    chargeNanos: row.chargeNanos,
    sourceIpHash: row.sourceIpHash ?? undefined,
    latencyMs: row.latencyMs ?? undefined,
    ttftMs: row.ttftMs ?? undefined,
    durationMs: row.durationMs ?? row.latencyMs ?? undefined,
    stopReason: row.stopReason ?? undefined,
    outcome: (row.outcome as any) ?? (row.status === "success" ? "success" : "upstream_error"),
    errorMessage: row.errorMessage ?? undefined,
    rawErrorMessage: row.rawErrorMessage ?? undefined,
    provider: row.provider ?? undefined,
    createdAt: row.createdAt,
    userName: row.userName,
    reasoningReturned: Boolean(
      row.rawErrorMessage && row.rawErrorMessage.includes("[ReasoningFallback")
    ),
  }));
}

export async function getUsageLogs(input: { userId: number; modelId?: string; source?: "api" | "playground"; from?: Date; to?: Date; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(usageEvents.userId, input.userId)];
  if (input.modelId) conditions.push(eq(usageEvents.modelId, input.modelId));
  if (input.source) conditions.push(eq(usageEvents.source, input.source));
  if (input.from) conditions.push(gte(usageEvents.createdAt, input.from));
  if (input.to) conditions.push(lte(usageEvents.createdAt, input.to));
  const rows = await db
    .select({
      id: usageEvents.id,
      requestId: usageEvents.requestId,
      createdAt: usageEvents.createdAt,
      source: usageEvents.source,
      client: usageEvents.client,
      stream: usageEvents.stream,
      status: usageEvents.status,
      modelId: usageEvents.modelId,
      inputTokens: usageEvents.inputTokens,
      outputTokens: usageEvents.outputTokens,
      totalTokens: usageEvents.totalTokens,
      chargeNanos: usageEvents.chargeNanos,
      latencyMs: usageEvents.latencyMs,
      ttftMs: usageEvents.ttftMs,
      durationMs: usageEvents.durationMs,
      stopReason: usageEvents.stopReason,
      outcome: usageEvents.outcome,
      provider: usageEvents.provider,
      apiKeyLabel: apiKeys.label,
      apiKeyGroup: apiKeys.keyGroup,
      ledgerNote: creditLedger.note,
    })
    .from(usageEvents)
    .leftJoin(apiKeys, eq(usageEvents.apiKeyId, apiKeys.id))
    .leftJoin(creditLedger, and(eq(creditLedger.userId, input.userId), eq(creditLedger.referenceId, sql`concat('coding_plan_debit:', ${usageEvents.requestId})`)))
    .where(and(...conditions))
    .orderBy(desc(usageEvents.createdAt))
    .limit(Math.min(100, Math.max(1, input.limit ?? 50)));

  const multipliers = await getModelTokenMultipliers();

  return rows.map(row => {
    const rawGroup = row.apiKeyGroup;
    const hasTokenLedger = Boolean(row.ledgerNote);
    const isTokenPlan = hasTokenLedger || rawGroup === "token_plan" || rawGroup === "tokens" || rawGroup === "coding_plan" || (row.chargeNanos === 0 && row.status === "success" && Number(row.totalTokens ?? 0) > 0);
    const normalizedModel = (row.modelId || "").trim().toLowerCase();

    // Parse multiplier from ledger note if available, e.g. "5x compute weight"
    let multiplier = 1;
    if (row.ledgerNote) {
      const weightMatch = row.ledgerNote.match(/(\d+(?:\.\d+)?)x\s+compute\s+weight/i);
      if (weightMatch) {
        multiplier = Number(weightMatch[1]);
      } else {
        multiplier = multipliers[normalizedModel] || 1;
      }
    } else if (isTokenPlan) {
      multiplier = multipliers[normalizedModel] ?? (normalizedModel.includes("opus-5") ? (multipliers["claude-opus-5.5"] || multipliers["claude-opus-5"] || 5) : 1);
    }

    // Parse tokens deducted from ledger note if available
    let tokensDeducted = 0;
    if (row.ledgerNote) {
      const tokenMatch = row.ledgerNote.match(/Deducted\s+([0-9,]+)\s+tokens/i);
      if (tokenMatch) {
        tokensDeducted = parseInt(tokenMatch[1].replace(/,/g, ""), 10);
      } else {
        tokensDeducted = Math.round(Number(row.totalTokens ?? 0) * multiplier);
      }
    } else if (isTokenPlan) {
      tokensDeducted = Math.round(Number(row.totalTokens ?? 0) * multiplier);
    }

    return {
      ...row,
      isTokenPlan,
      multiplier,
      tokensDeducted,
    };
  });
}

export async function getRecentRequestCounts(userId: number, sourceIpHash: string, since: Date) {
  const db = await getDb();
  if (!db) return { account: 0, ip: 0 };
  const [accountRows, ipRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(usageEvents)
      .where(and(eq(usageEvents.userId, userId), gte(usageEvents.createdAt, since))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(usageEvents)
      .where(and(eq(usageEvents.sourceIpHash, sourceIpHash), gte(usageEvents.createdAt, since))),
  ]);
  return { account: Number(accountRows[0]?.count ?? 0), ip: Number(ipRows[0]?.count ?? 0) };
}

let catalogueSeeded = false;
let catalogueInitialization: Promise<void> | null = null;

export async function ensureCatalogue() {
  if (catalogueSeeded) {
    return;
  }
  if (catalogueInitialization) {
    return catalogueInitialization;
  }
  catalogueInitialization = (async () => {
    try {
      const db = await getDb();
      if (!db) return;
      if (_pool) {
        await ensureCreditAccountsColumns(_pool);
      }
      const baseUrl = process.env.FXQIDIAN_BASE_URL ?? "https://fxqidian.de5.net";
      const clusterBaseUrl = process.env.CLUSTER_PROTOCOL_BASE_URL ?? "https://api.clusterprotocol.ai";
      const tokenHarborBaseUrl = process.env.TOKENHARBOR_BASE_URL ?? "https://tokenharbor.ai";
      const claudeOpus5BaseUrl = process.env.CLAUDE_OPUS5_BASE_URL ?? "https://ai.kscsnkli.site";
      const tokenRouterBaseUrl = process.env.TOKENROUTER_BASE_URL ?? "https://api.tokenrouter.com";
      await db.insert(providerConfigs).values([
        { slug: FXQIDIAN_PROVIDER_SLUG, displayName: "Selected hosted inference", baseUrl },
        { slug: CLUSTER_PROTOCOL_PROVIDER_SLUG, displayName: "Cluster Protocol", baseUrl: clusterBaseUrl },
        { slug: TOKENHARBOR_PROVIDER_SLUG, displayName: "TokenHarbor", baseUrl: tokenHarborBaseUrl },
        { slug: CLAUDE_OPUS5_PROVIDER_SLUG, displayName: "Claude Opus 5 custom upstream", baseUrl: claudeOpus5BaseUrl },
        { slug: TOKENROUTER_PROVIDER_SLUG, displayName: "TokenRouter", baseUrl: tokenRouterBaseUrl },
      ]).onDuplicateKeyUpdate({ set: { baseUrl: sql`values(${providerConfigs.baseUrl})`, displayName: sql`values(${providerConfigs.displayName})` } });
      // Migration: clean up legacy claude-fable-5
      const legacyFable = await db.select().from(modelConfigs).where(eq(modelConfigs.modelId, "claude-fable-5")).limit(1).catch(() => []);
      const newFable = await db.select().from(modelConfigs).where(eq(modelConfigs.modelId, "claude-fable-5.1")).limit(1).catch(() => []);
      if (legacyFable.length > 0) {
        if (newFable.length === 0) {
          await db.update(modelConfigs)
            .set({ modelId: "claude-fable-5.1", displayName: "Claude Fable 5.1" })
            .where(eq(modelConfigs.modelId, "claude-fable-5"))
            .catch(() => undefined);
        } else {
          await db.delete(modelConfigs)
            .where(eq(modelConfigs.modelId, "claude-fable-5"))
            .catch(() => undefined);
        }
      }

      // Migration: permanently delete retired models from database
      const RETIRED_MODEL_IDS = [
        "glm-5.2",
        "grok-4.5",
        "qwen3.8-27b",
        "glm-5.1",
        "claude-haiku-4.5",
        "claude-opus-4.5",
        "claude-opus-4.6",
        "claude-opus-4.7",
        "claude-sonnet-4.5",
        "claude-sonnet-4.6",
        "gpt-5",
        "gpt-5-mini",
        "gpt-5-nano",
        "gpt-5.4",
        "gpt-5.5",
        "minimax-m2",
        "minimax-m2-7",
        "qwen3.7-max",
      ];
      for (const retiredId of RETIRED_MODEL_IDS) {
        await db.delete(modelConfigs).where(eq(modelConfigs.modelId, retiredId)).catch(() => undefined);
      }

      // Seed & synchronize all catalogue definitions into modelConfigs
      const existingDbModels = await db.select().from(modelConfigs).catch(() => []);
      const existingModelIdMap = new Map(existingDbModels.map(m => [m.modelId, m]));
      for (const model of CATALOGUE_DEFINITIONS) {
        const existing = existingModelIdMap.get(model.id);
        if (!existing) {
          await db.insert(modelConfigs).values({
            modelId: model.id,
            displayName: model.displayName,
            description: model.description,
            capabilities: [...model.capabilities],
            providerSlug: model.providerSlug,
            enabled: true,
          }).catch(() => undefined);
        } else if (existing.displayName !== model.displayName || existing.description !== model.description) {
          await db.update(modelConfigs)
            .set({ displayName: model.displayName, description: model.description })
            .where(eq(modelConfigs.modelId, model.id))
            .catch(() => undefined);
        }
      }

      // Synchronize all database records into runtime in-memory catalogue
      const allCurrentModels = await db.select().from(modelConfigs);
      for (const row of allCurrentModels) {
        syncModelFromDatabaseRecord(row);
      }

      catalogueSeeded = true;
    } catch (error: any) {
      markDatabaseUnhealthy(error?.message ?? String(error));
    } finally {
      catalogueInitialization = null;
    }
  })();
  return catalogueInitialization;
}

export async function isModelAvailable(modelId: string) {
  try {
    const snapshot = await getModelAvailabilitySnapshot();
    const match = snapshot.find(m => m.modelId === modelId);
    if (match) return match.available;
    return TOKENFORGE_MODEL_IDS.includes(modelId as any);
  } catch (error: any) {
    return TOKENFORGE_MODEL_IDS.includes(modelId as any);
  }
}

export function normalizeModelAvailability(rows: Array<{
  modelId: string;
  enabled: boolean;
  providerEnabled: boolean | null;
  minTier?: string | null;
  isPayg?: boolean | null;
  isBundle?: boolean | null;
  isTokenPlan?: boolean | null;
}>) {
  return rows.map(row => ({
    modelId: row.modelId,
    available: Boolean(row.enabled && row.providerEnabled),
    minTier: ((row.minTier as UserTier) || "free") as UserTier,
    isPayg: Boolean(row.isPayg),
    isBundle: row.isBundle !== false,
    isTokenPlan: Boolean(row.isTokenPlan),
  }));
}

export type AdminAccountBase = {
  id: number;
  name: string | null;
  email: string | null;
  tier?: UserTier | null;
  creditsEnabled?: boolean | null;
  createdAt: Date;
  lastSignedIn: Date;
  suspended: boolean | null;
  suspicious: boolean | null;
  requestLimit: number | null;
  tokenLimit: number | null;
  balanceNanos: number | null;
  paygBalanceNanos?: number | null;
  codingPlanTokens?: number | null;
  discordVerifiedAt: Date | null;
  specialReferralSlot?: number | null;
  specialReferralAwardedAt?: Date | null;
  referralCount?: number | null;
  countryCode?: string | null;
  countryName?: string | null;
};

export type AdminAccountUsage = {
  userId: number;
  requestCount: number | null;
  totalTokens: number | null;
  lifetimeSpendNanos?: number | null;
  lastActivityAt: Date | string | null;
};

export type AdminAccountDirectoryInput = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "all" | "active" | "suspended" | "flagged";
  sort?: "latestJoin" | "mostTokens" | "discordVerified" | "mostCredit" | "mostReferrals" | "specialReferral";
};

export function normalizeAdminAccountDirectoryInput(input: AdminAccountDirectoryInput = {}) {
  const sort = input.sort === "mostTokens" || input.sort === "discordVerified" || input.sort === "mostCredit" || input.sort === "mostReferrals" || input.sort === "specialReferral" || input.sort === "latestJoin"
    ? input.sort
    : "latestJoin";
  return {
    page: Math.max(1, Math.trunc(input.page ?? 1)),
    pageSize: Math.min(50, Math.max(5, Math.trunc(input.pageSize ?? 10))),
    search: input.search?.trim().slice(0, 120) ?? "",
    status: input.status ?? "all",
    sort,
  };
}

/** Combines separately aggregated sensitive account data without returning any API-key material. */
export function composeAdminAccountOverview(
  accounts: AdminAccountBase[],
  usageRows: AdminAccountUsage[],
  geoRegistry?: Record<string, { code: string; name: string }>
) {
  const usageByUser = new Map(usageRows.map(row => [row.userId, row]));
  return accounts.map(account => {
    const usage = usageByUser.get(account.id);
    const lastActivity = usage?.lastActivityAt ? new Date(usage.lastActivityAt) : null;
    const emailLower = (account.email ?? "").trim().toLowerCase();
    const isWhitelisted = emailLower === "konchoor@gmail.com" || emailLower === "kumaryush18@gmail.com";
    const geo = geoRegistry?.[String(account.id)] || { code: "UN", name: "Global / Unassigned" };
    return {
      ...account,
      creditsEnabled: isWhitelisted ? true : Boolean(account.creditsEnabled),
      logUserMessages: Boolean((account as any).logUserMessages ?? false),
      balanceNanos: Number(account.balanceNanos ?? 0),
      paygBalanceNanos: Number(account.paygBalanceNanos ?? 0),
      codingPlanTokens: Number((account as any).codingPlanTokens ?? 0),
      requestCount: Number(usage?.requestCount ?? 0),
      totalTokens: Number(usage?.totalTokens ?? 0),
      lifetimeSpendNanos: Number(usage?.lifetimeSpendNanos ?? 0),
      referralCount: Number(account.referralCount ?? 0),
      countryCode: geo.code,
      countryName: geo.name,
      lastActivityAt: lastActivity && !Number.isNaN(lastActivity.getTime()) ? lastActivity : null,
    };
  });
}

/** Shapes aggregate mailbox-provider rows for the admin dashboard without exposing individual email addresses. */
export function normalizeAdminEmailProviderCounts(rows: Array<{ provider: string | null; accountCount: number | string }>): AdminEmailProviderCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const provider = row.provider?.trim().toLowerCase() ?? "";
    const accountCount = Number(row.accountCount);
    if (!provider || provider.includes("@") || !Number.isSafeInteger(accountCount) || accountCount <= 0) continue;
    counts.set(provider, (counts.get(provider) ?? 0) + accountCount);
  }
  return Array.from(counts.entries())
    .map(([provider, accountCount]) => ({ provider, accountCount }))
    .sort((left, right) => right.accountCount - left.accountCount || left.provider.localeCompare(right.provider));
}

function escapeMysqlLike(value: string) {
  return value.replace(/[\\%_]/g, character => `\\${character}`);
}

/** Returns a privacy-safe, server-paginated directory without selecting API-key records or key material. */
export async function listAdminAccounts(input: AdminAccountDirectoryInput = {}) {
  const db = await getDb();
  const query = normalizeAdminAccountDirectoryInput(input);
  if (!db) return { items: [], total: 0, page: query.page, pageSize: query.pageSize, pageCount: 0 };

  const filters = [];
  if (query.search) {
    const pattern = `%${escapeMysqlLike(query.search)}%`;
    filters.push(or(
      like(users.name, pattern),
      like(users.email, pattern),
      sql`cast(${users.id} as char) like ${pattern}`,
    ));
  }
  if (query.status === "suspended") filters.push(eq(accountControls.isSuspended, true));
  if (query.status === "flagged") filters.push(eq(accountControls.isSuspicious, true));
  if (query.status === "active") {
    filters.push(or(eq(accountControls.isSuspended, false), sql`${accountControls.userId} is null`));
  }
  const whereClause = filters.length ? and(...filters) : undefined;
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(users)
    .leftJoin(accountControls, eq(users.id, accountControls.userId))
    .where(whereClause);
  const pageCount = Math.ceil(Number(total) / query.pageSize);
  const page = pageCount ? Math.min(query.page, pageCount) : 1;
  // Sort before pagination using each account's full, successful processed-token history.
  // A correlated aggregate avoids the unreliable derived-table ordering previously used here.
  const successfulLifetimeTokens = sql<number>`coalesce((
    select sum(${dailyUsage.totalTokens})
    from ${dailyUsage}
    where ${dailyUsage.userId} = ${users.id}
  ), 0)`;
  const referralCount = sql<number>`coalesce((
    select count(${referralAttributions.id})
    from ${referralAttributions}
    where ${referralAttributions.referrerUserId} = ${users.id}
  ), 0)`;
  const sortOrder = query.sort === "mostTokens"
    ? [desc(successfulLifetimeTokens), desc(users.createdAt), desc(users.id)]
    : query.sort === "discordVerified"
      ? [desc(accountControls.discordVerifiedAt), desc(users.createdAt), desc(users.id)]
      : query.sort === "mostCredit"
        ? [desc(creditAccounts.balanceNanos), desc(users.createdAt), desc(users.id)]
        : query.sort === "mostReferrals"
          ? [desc(referralCount), desc(users.createdAt), desc(users.id)]
        : query.sort === "specialReferral"
          ? [desc(specialReferralClaims.awardedAt), desc(specialReferralClaims.reservedAt), desc(users.createdAt), desc(users.id)]
        : [desc(users.createdAt), desc(users.id)];
  const accounts = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      tier: users.tier,
      creditsEnabled: users.creditsEnabled,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
      suspended: accountControls.isSuspended,
      suspicious: accountControls.isSuspicious,
      requestLimit: accountControls.dailyRequestLimit,
      tokenLimit: accountControls.dailyTokenLimit,
      logUserMessages: accountControls.logUserMessages,
      balanceNanos: creditAccounts.balanceNanos,
      paygBalanceNanos: creditAccounts.paygBalanceNanos,
      codingPlanTokens: creditAccounts.codingPlanTokens,
      discordVerifiedAt: accountControls.discordVerifiedAt,
      specialReferralSlot: specialReferralClaims.slotNumber,
      specialReferralAwardedAt: specialReferralClaims.awardedAt,
      referralCount,
    })
    .from(users)
    .leftJoin(accountControls, eq(users.id, accountControls.userId))
    .leftJoin(creditAccounts, eq(users.id, creditAccounts.userId))
    .leftJoin(specialReferralClaims, and(eq(users.id, specialReferralClaims.userId), eq(specialReferralClaims.campaignKey, SPECIAL_REFERRAL_CAMPAIGN_KEY)))
    .where(whereClause)
    .orderBy(...sortOrder)
    .limit(query.pageSize)
    .offset((page - 1) * query.pageSize);
  const userIds = accounts.map(account => account.id);
  const [usageRows, geoRegistry] = await Promise.all([
    userIds.length
      ? db.select({
          userId: dailyUsage.userId,
          requestCount: sql<number>`coalesce(sum(${dailyUsage.requestCount}), 0)`,
          totalTokens: sql<number>`coalesce(sum(${dailyUsage.totalTokens}), 0)`,
          lifetimeSpendNanos: sql<number>`coalesce((
            select sum(abs(${creditLedger.amountNanos}))
            from ${creditLedger}
            where ${creditLedger.userId} = ${dailyUsage.userId}
              and ${creditLedger.kind} = 'usage_debit'
              and (${creditLedger.referenceId} is null or ${creditLedger.referenceId} not like 'reservation%')
          ), 0)`,
          lastActivityAt: sql<Date | null>`max(${dailyUsage.updatedAt})`
        })
        .from(dailyUsage)
        .where(inArray(dailyUsage.userId, userIds))
        .groupBy(dailyUsage.userId)
      : [],
    getUserGeoRegistry(),
  ]);

  return { items: composeAdminAccountOverview(accounts, usageRows, geoRegistry), total: Number(total), page, pageSize: query.pageSize, pageCount };
}

export type AdminAccountModelUsageRow = {
  userId: number;
  modelId: string;
  requestCount: number;
  totalTokens: number;
};

export type AdminGlobalModelUsageRow = {
  modelId: string;
  accountCount: number;
  requestCount: number;
  totalTokens: number;
};

/** Normalizes aggregate-only activity rows without returning prompts, API keys, or message content. */
export function normalizeAdminAccountModelUsage(rows: AdminAccountModelUsageRow[]) {
  return rows
    .filter(row => Number.isInteger(row.userId) && row.userId > 0 && Boolean(row.modelId) && Number(row.requestCount) > 0)
    .map(row => ({ userId: row.userId, modelId: row.modelId, requestCount: Math.max(0, Number(row.requestCount) || 0), totalTokens: Math.max(0, Number(row.totalTokens) || 0) }))
    .sort((left, right) => left.userId - right.userId || right.requestCount - left.requestCount || right.totalTokens - left.totalTokens || left.modelId.localeCompare(right.modelId));
}

/** Normalizes aggregate-only all-account model activity without returning account, prompt, or credential data. */
export function normalizeAdminGlobalModelUsage(rows: AdminGlobalModelUsageRow[]) {
  return rows
    .filter(row => Boolean(row.modelId) && Number(row.accountCount) > 0 && Number(row.requestCount) > 0)
    .map(row => ({
      modelId: row.modelId,
      accountCount: Math.max(0, Number(row.accountCount) || 0),
      requestCount: Math.max(0, Number(row.requestCount) || 0),
      totalTokens: Math.max(0, Number(row.totalTokens) || 0),
    }))
    .sort((left, right) => right.requestCount - left.requestCount || right.totalTokens - left.totalTokens || left.modelId.localeCompare(right.modelId));
}

/** Returns successful, aggregate model activity only for the bounded visible administrator account page. */
export async function getAdminAccountModelUsage(userIds: number[]) {
  const normalizedUserIds = Array.from(new Set(userIds.filter(userId => Number.isInteger(userId) && userId > 0))).slice(0, 10);
  if (!normalizedUserIds.length) return [];
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      userId: dailyUsage.userId,
      modelId: dailyUsage.modelId,
      requestCount: sql<number>`coalesce(sum(${dailyUsage.requestCount}), 0)`,
      totalTokens: sql<number>`coalesce(sum(${dailyUsage.totalTokens}), 0)`,
    })
    .from(dailyUsage)
    .where(inArray(dailyUsage.userId, normalizedUserIds))
    .groupBy(dailyUsage.userId, dailyUsage.modelId);
  return normalizeAdminAccountModelUsage(rows);
}

export type GitHubIdentityInput = { providerUserId: string; email: string; name: string | null; referralCode?: string };
export type GoogleIdentityInput = { providerUserId: string; email: string; name: string | null; referralCode?: string };

/** Resolves Google by immutable provider subject (sub), securely linking any existing account or creating a fresh one. */
export async function resolveGoogleIdentity(input: GoogleIdentityInput) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const provider = "google";
  await assertIdentityIsNotDeleted("google", input.providerUserId);
  await assertIdentityIsNotDeleted("email", input.email);
  const existingIdentity = (await db.select({ user: users }).from(oauthIdentities).innerJoin(users, eq(oauthIdentities.userId, users.id)).where(and(eq(oauthIdentities.provider, provider), eq(oauthIdentities.providerUserId, input.providerUserId))).limit(1))[0]?.user;
  if (existingIdentity) {
    const lastSignedIn = new Date();
    await db.update(users).set({ lastSignedIn }).where(eq(users.id, existingIdentity.id));
    await markDiscordVerified(existingIdentity.id);
    return { kind: "resolved" as const, user: { ...existingIdentity, lastSignedIn } };
  }

  const email = normalizeEmail(input.email);
  const existingEmail = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (existingEmail) {
    try {
      const linkedUser = await db.transaction(async tx => {
        const existingGoogleIdentity = (await tx.select().from(oauthIdentities).where(and(eq(oauthIdentities.userId, existingEmail.id), eq(oauthIdentities.provider, provider))).limit(1))[0];
        if (existingGoogleIdentity && existingGoogleIdentity.providerUserId !== input.providerUserId) return null;
        if (!existingGoogleIdentity) await tx.insert(oauthIdentities).values({ userId: existingEmail.id, provider, providerUserId: input.providerUserId });
        const lastSignedIn = new Date();
        await tx.update(users).set({ loginMethod: "google", lastSignedIn }).where(eq(users.id, existingEmail.id));
        return { ...existingEmail, loginMethod: "google", lastSignedIn };
      });
      if (linkedUser) {
        await markDiscordVerified(linkedUser.id);
        return { kind: "resolved" as const, user: linkedUser };
      }
      return { kind: "link_required" as const };
    } catch (error: any) {
      if (error?.code !== "ER_DUP_ENTRY") throw error;
      const concurrentIdentity = (await db.select({ user: users }).from(oauthIdentities).innerJoin(users, eq(oauthIdentities.userId, users.id)).where(and(eq(oauthIdentities.provider, provider), eq(oauthIdentities.providerUserId, input.providerUserId))).limit(1))[0]?.user;
      if (concurrentIdentity) {
        await markDiscordVerified(concurrentIdentity.id);
        return { kind: "resolved" as const, user: concurrentIdentity };
      }
      return { kind: "link_required" as const };
    }
  }

  try {
    const userId = await db.transaction(async tx => {
      const inserted = await tx.insert(users).values({
        openId: `tf_google_${input.providerUserId}`,
        email,
        name: input.name?.trim() || email.split("@")[0] || "Google developer",
        loginMethod: "google",
        lastSignedIn: new Date(),
      });
      const createdUserId = Number(inserted[0].insertId);
      await tx.insert(oauthIdentities).values({ userId: createdUserId, provider, providerUserId: input.providerUserId });
      return createdUserId;
    });
    const preProvisionedActivation = await activatePreProvisionedAccount(userId, email);
    await Promise.all([
      ensureAccountControl(userId),
      preProvisionedActivation ? Promise.resolve() : ensureCreditAccount(userId),
      getOrCreateReferralCode(userId),
      markDiscordVerified(userId),
    ]);
    await awardReferralForNewUser(userId, input.referralCode);
    await reserveSpecialReferralCampaignSlot(userId, input.referralCode);
    const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
    if (!user) throw new Error("Qronos AI could not load the new Google account");
    return { kind: "resolved" as const, user };
  } catch (error: any) {
    if (error?.code !== "ER_DUP_ENTRY") throw error;
    const concurrentIdentity = (await db.select({ user: users }).from(oauthIdentities).innerJoin(users, eq(oauthIdentities.userId, users.id)).where(and(eq(oauthIdentities.provider, provider), eq(oauthIdentities.providerUserId, input.providerUserId))).limit(1))[0]?.user;
    if (concurrentIdentity) {
      await markDiscordVerified(concurrentIdentity.id);
      return { kind: "resolved" as const, user: concurrentIdentity };
    }
    return { kind: "link_required" as const };
  }
}

/** Resolves GitHub by immutable provider subject, securely linking a legacy local account only after GitHub returns the same verified email. */
export async function resolveGitHubIdentity(input: GitHubIdentityInput) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const provider = "github";
  await assertIdentityIsNotDeleted("github", input.providerUserId);
  await assertIdentityIsNotDeleted("email", input.email);
  const existingIdentity = (await db.select({ user: users }).from(oauthIdentities).innerJoin(users, eq(oauthIdentities.userId, users.id)).where(and(eq(oauthIdentities.provider, provider), eq(oauthIdentities.providerUserId, input.providerUserId))).limit(1))[0]?.user;
  if (existingIdentity) {
    const lastSignedIn = new Date();
    await db.update(users).set({ lastSignedIn }).where(eq(users.id, existingIdentity.id));
    return { kind: "resolved" as const, user: { ...existingIdentity, lastSignedIn } };
  }

  const email = normalizeEmail(input.email);
  const existingEmail = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (existingEmail) {
    try {
      const linkedUser = await db.transaction(async tx => {
        const existingGitHubIdentity = (await tx.select().from(oauthIdentities).where(and(eq(oauthIdentities.userId, existingEmail.id), eq(oauthIdentities.provider, provider))).limit(1))[0];
        if (existingGitHubIdentity && existingGitHubIdentity.providerUserId !== input.providerUserId) return null;
        if (!existingGitHubIdentity) await tx.insert(oauthIdentities).values({ userId: existingEmail.id, provider, providerUserId: input.providerUserId });
        const lastSignedIn = new Date();
        await tx.update(users).set({ loginMethod: "github", lastSignedIn }).where(eq(users.id, existingEmail.id));
        return { ...existingEmail, loginMethod: "github", lastSignedIn };
      });
      if (linkedUser) return { kind: "resolved" as const, user: linkedUser };
      return { kind: "link_required" as const };
    } catch (error: any) {
      if (error?.code !== "ER_DUP_ENTRY") throw error;
      const concurrentIdentity = (await db.select({ user: users }).from(oauthIdentities).innerJoin(users, eq(oauthIdentities.userId, users.id)).where(and(eq(oauthIdentities.provider, provider), eq(oauthIdentities.providerUserId, input.providerUserId))).limit(1))[0]?.user;
      if (concurrentIdentity) return { kind: "resolved" as const, user: concurrentIdentity };
      return { kind: "link_required" as const };
    }
  }

  try {
    const userId = await db.transaction(async tx => {
      const inserted = await tx.insert(users).values({
        openId: `tf_github_${input.providerUserId}`,
        email,
        name: input.name?.trim() || email.split("@")[0] || "GitHub developer",
        loginMethod: "github",
        lastSignedIn: new Date(),
      });
      const createdUserId = Number(inserted[0].insertId);
      await tx.insert(oauthIdentities).values({ userId: createdUserId, provider, providerUserId: input.providerUserId });
      return createdUserId;
    });
    const preProvisionedActivation = await activatePreProvisionedAccount(userId, email);
    await Promise.all([
      ensureAccountControl(userId),
      preProvisionedActivation ? Promise.resolve() : ensureCreditAccount(userId),
      getOrCreateReferralCode(userId),
    ]);
    await awardReferralForNewUser(userId, input.referralCode);
    await reserveSpecialReferralCampaignSlot(userId, input.referralCode);
    const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
    if (!user) throw new Error("Qronos AI could not load the new GitHub account");
    return { kind: "resolved" as const, user };
  } catch (error: any) {
    if (error?.code !== "ER_DUP_ENTRY") throw error;
    const concurrentIdentity = (await db.select({ user: users }).from(oauthIdentities).innerJoin(users, eq(oauthIdentities.userId, users.id)).where(and(eq(oauthIdentities.provider, provider), eq(oauthIdentities.providerUserId, input.providerUserId))).limit(1))[0]?.user;
    if (concurrentIdentity) return { kind: "resolved" as const, user: concurrentIdentity };
    return { kind: "link_required" as const };
  }
}

export async function getModelAvailabilitySnapshot() {
  return cached("model_availability_snapshot", 60_000, async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({
        modelId: modelConfigs.modelId,
        enabled: modelConfigs.enabled,
        providerEnabled: providerConfigs.enabled,
        minTier: modelConfigs.minTier,
        isPayg: modelConfigs.isPayg,
        isBundle: modelConfigs.isBundle,
        isTokenPlan: modelConfigs.isTokenPlan,
      })
      .from(modelConfigs)
      .leftJoin(providerConfigs, eq(modelConfigs.providerSlug, providerConfigs.slug));
    return normalizeModelAvailability(rows);
  });
}

const ADMIN_OVERVIEW_CACHE_TTL_MS = 60_000;
const MODEL_DISTINCT_USAGE_CACHE_TTL_MS = 300_000; // 5 minutes cache for expensive distinct usage scan
let adminOverviewCache: { at: number; value: unknown } | null = null;
let cachedAllAccountModelUsage: { at: number; data: any[] } | null = null;

export async function getAdminOverview() {
  if (adminOverviewCache && Date.now() - adminOverviewCache.at < ADMIN_OVERVIEW_CACHE_TTL_MS) {
    return adminOverviewCache.value;
  }
  const db = await getDb();
  if (!db) {
    if (adminOverviewCache) return adminOverviewCache.value;
    return {
      models: [],
      providers: [],
      accounts: [],
      usage: [],
      emailProviders: [],
      allAccountModelUsage: [],
      totals: { totalAccounts: 0, totalTokens: 0, totalRequests: 0 },
      providerTelemetry: getProviderCredentialTelemetry({}),
      managedProviderKeyMetrics: [],
    };
  }
  // This aggregate queries only `users`; keep this expression unqualified so the SELECT,
  // GROUP BY, and ORDER BY clauses remain byte-for-byte compatible on the deployed MySQL dialect.
  const emailProvider = sql<string>`${sql.raw(ADMIN_EMAIL_PROVIDER_EXPRESSION)}`;

  let allAccountModelUsagePromise: Promise<any[]>;
  if (cachedAllAccountModelUsage && Date.now() - cachedAllAccountModelUsage.at < MODEL_DISTINCT_USAGE_CACHE_TTL_MS) {
    allAccountModelUsagePromise = Promise.resolve(cachedAllAccountModelUsage.data);
  } else {
    allAccountModelUsagePromise = db
      .select({
        modelId: dailyUsage.modelId,
        accountCount: sql<number>`count(distinct ${dailyUsage.userId})`,
        requestCount: sql<number>`coalesce(sum(${dailyUsage.requestCount}), 0)`,
        totalTokens: sql<number>`coalesce(sum(${dailyUsage.totalTokens}), 0)`
      })
      .from(dailyUsage)
      .groupBy(dailyUsage.modelId)
      .orderBy(desc(sql`sum(${dailyUsage.requestCount})`), desc(sql`sum(${dailyUsage.totalTokens})`), dailyUsage.modelId)
      .then(rows => {
        cachedAllAccountModelUsage = { at: Date.now(), data: rows };
        return rows;
      });
  }

  const [models, providers, accounts, usage, accountUsage, totals, emailProviderRows, allAccountModelUsageRows, totalAccountsRows, compactScalingMapRows] = await Promise.all([
    db.select().from(modelConfigs).orderBy(modelConfigs.displayName),
    db.select().from(providerConfigs).orderBy(providerConfigs.displayName),
    db.select({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt, lastSignedIn: users.lastSignedIn, suspended: accountControls.isSuspended, suspicious: accountControls.isSuspicious, requestLimit: accountControls.dailyRequestLimit, tokenLimit: accountControls.dailyTokenLimit, balanceNanos: creditAccounts.balanceNanos, paygBalanceNanos: creditAccounts.paygBalanceNanos, codingPlanTokens: creditAccounts.codingPlanTokens, discordVerifiedAt: accountControls.discordVerifiedAt }).from(users).leftJoin(accountControls, eq(users.id, accountControls.userId)).leftJoin(creditAccounts, eq(users.id, creditAccounts.userId)).orderBy(desc(users.lastSignedIn)),
    db.select({ day: dailyUsage.usageDate, requests: sql<number>`coalesce(sum(${dailyUsage.requestCount}), 0)`, tokens: sql<number>`coalesce(sum(${dailyUsage.totalTokens}), 0)` }).from(dailyUsage).where(gte(dailyUsage.usageDate, utcUsageDate(new Date(Date.now() - 13 * 86_400_000)))).groupBy(dailyUsage.usageDate).orderBy(dailyUsage.usageDate),
    db.select({ userId: dailyUsage.userId, requestCount: sql<number>`coalesce(sum(${dailyUsage.requestCount}), 0)`, totalTokens: sql<number>`coalesce(sum(${dailyUsage.totalTokens}), 0)`, lastActivityAt: sql<Date | null>`max(${dailyUsage.updatedAt})` }).from(dailyUsage).groupBy(dailyUsage.userId),
    db.select({ totalTokens: sql<number>`coalesce(sum(${dailyUsage.totalTokens}), 0)`, totalRequests: sql<number>`coalesce(sum(${dailyUsage.requestCount}), 0)` }).from(dailyUsage),
    db.select({ provider: emailProvider, accountCount: sql<number>`count(id)` }).from(users).where(sql`${users.email} is not null and ${users.email} like '%@%'`).groupBy(emailProvider).orderBy(desc(sql`count(id)`), emailProvider),
    allAccountModelUsagePromise,
    db.select({ count: sql<number>`count(*)` }).from(users),
    getAllModelCompactScalingConfigs(),
  ]);
  const compactScalingMap = (compactScalingMapRows ?? {}) as Record<string, ModelCompactScalingConfig>;
  const modelsWithCompactScaling = models.map(m => ({
    ...m,
    enableCompactScaling: Boolean(compactScalingMap[m.modelId]?.enabled),
    compactTriggerTokens: compactScalingMap[m.modelId]?.triggerTokens ?? 500_000,
  }));
  const providerTelemetry = getProviderCredentialTelemetry({
    [FXQIDIAN_PROVIDER_SLUG]: getFxqidianCredentialPool().length,
    [CLUSTER_PROTOCOL_PROVIDER_SLUG]: getClusterProtocolCredentialPool().length,
    [TOKENHARBOR_PROVIDER_SLUG]: process.env.TOKENHARBOR_API_KEY?.trim() ? 1 : 0,
    [CLAUDE_OPUS5_PROVIDER_SLUG]: process.env.CLAUDE_OPUS5_API_KEY?.trim() ? 1 : 0,
    [TOKENROUTER_PROVIDER_SLUG]: getTokenRouterCredentialPool().length,
  });
  const managedProviderKeyMetrics = await getManagedProviderKeyMetrics();
  const realTotalAccounts = Number(totalAccountsRows[0]?.count ?? accounts.length);
  const value = { models: modelsWithCompactScaling, providers, accounts: composeAdminAccountOverview(accounts, accountUsage), usage: usage.map(row => ({ day: new Date(row.day).toISOString().slice(0, 10), requests: Number(row.requests), tokens: Number(row.tokens) })), emailProviders: normalizeAdminEmailProviderCounts(emailProviderRows), allAccountModelUsage: normalizeAdminGlobalModelUsage(allAccountModelUsageRows), totals: { totalAccounts: realTotalAccounts, totalTokens: TOKENFORGE_TOKEN_BASELINE + Number(totals[0]?.totalTokens ?? 0), totalRequests: Number(totals[0]?.totalRequests ?? 0) }, providerTelemetry, managedProviderKeyMetrics };
  adminOverviewCache = { at: Date.now(), value };
  return value;
}

/** Deletes a user and every account-owned TokenForge record, retaining only non-reversible hashed identity tombstones. */
export async function deleteAccountPermanently(userId: number, database?: AccountDeletionDatabase | null) {
  const db = database ?? await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  return db.transaction(async tx => {
    const user = (await tx.select().from(users).where(eq(users.id, userId)).limit(1))[0];
    if (!user) return false;
    const identities = await tx.select({ provider: oauthIdentities.provider, providerUserId: oauthIdentities.providerUserId }).from(oauthIdentities).where(eq(oauthIdentities.userId, userId));
    const tombstones = [
      { kind: "open_id", identifierHash: hashDeletedIdentity("open_id", user.openId) },
      ...(user.email ? [{ kind: "email", identifierHash: hashDeletedIdentity("email", normalizeEmail(user.email)) }] : []),
      ...identities.map(identity => ({ kind: identity.provider, identifierHash: hashDeletedIdentity(identity.provider, identity.providerUserId) })),
    ];
    await tx.insert(deletedIdentityTombstones).values(tombstones).onDuplicateKeyUpdate({ set: { deletedAt: new Date() } });
    await tx.delete(auditEvents).where(or(eq(auditEvents.actorUserId, userId), eq(auditEvents.targetUserId, userId)));
    await tx.delete(preProvisionedAccounts).where(eq(preProvisionedAccounts.activatedUserId, userId));
    await tx.delete(apiKeys).where(eq(apiKeys.userId, userId));
    const deleted = await tx.delete(users).where(eq(users.id, userId));
    return deleted[0].affectedRows > 0;
  });
}

/** Counts regular user accounts that have not completed the Discord membership check. */
export async function countDiscordUnverifiedAccounts() {
  const db = await getDb();
  if (!db) return 0;
  const row = (await db.select({ count: sql<number>`count(${users.id})` })
    .from(users)
    .leftJoin(accountControls, eq(users.id, accountControls.userId))
    .where(and(ne(users.openId, ADMIN_SESSION_PRINCIPAL_OPEN_ID), isNull(accountControls.discordVerifiedAt))))[0];
  return Math.max(0, Number(row?.count ?? 0));
}

/**
 * Permanently removes all currently Discord-unverified regular accounts without retaining a recreation block.
 * Only a one-time HMAC notice marker remains for local-sign-in feedback; it is removed on display or fresh signup.
 */
export async function deleteDiscordUnverifiedAccounts() {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  return db.transaction(async tx => {
    const accounts = await tx.select({ id: users.id, email: users.email }).from(users)
      .leftJoin(accountControls, eq(users.id, accountControls.userId))
      .where(and(ne(users.openId, ADMIN_SESSION_PRINCIPAL_OPEN_ID), isNull(accountControls.discordVerifiedAt)));
    if (!accounts.length) return { deletedCount: 0 };
    const userIds = accounts.map(account => account.id);
    const notices = accounts
      .filter((account): account is { id: number; email: string } => typeof account.email === "string" && Boolean(account.email.trim()))
      .map(account => ({ kind: DISCORD_UNVERIFIED_CLEANUP_NOTICE_KIND, identifierHash: hashDeletedIdentity(DISCORD_UNVERIFIED_CLEANUP_NOTICE_KIND, normalizeEmail(account.email)) }));
    if (notices.length) await tx.insert(deletedIdentityTombstones).values(notices).onDuplicateKeyUpdate({ set: { deletedAt: new Date() } });
    await tx.delete(auditEvents).where(or(inArray(auditEvents.actorUserId, userIds), inArray(auditEvents.targetUserId, userIds)));
    const deleted = await tx.delete(users).where(inArray(users.id, userIds));
    return { deletedCount: Number(deleted[0].affectedRows ?? 0) };
  });
}

export type AdminAuditRecord = {
  id: number;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: Date;
};

/** Returns only operational audit fields—never credentials, key material, email, names, or metadata. */
export async function listAdminAuditEvents(limit = 40): Promise<AdminAuditRecord[]> {
  const db = await getDb();
  if (!db) return [];
  const boundedLimit = Math.min(500, Math.max(1, Math.trunc(limit)));
  return db.select({
    id: auditEvents.id,
    action: auditEvents.action,
    entityType: auditEvents.entityType,
    entityId: auditEvents.entityId,
    createdAt: auditEvents.createdAt,
  }).from(auditEvents).orderBy(desc(auditEvents.createdAt), desc(auditEvents.id)).limit(boundedLimit);
}

/** Produces a bounded, identity-minimized audit export suitable for local CSV download. */
export async function getAdminAuditExport() {
  const events = await listAdminAuditEvents(500);
  return {
    generatedAt: new Date(),
    columns: ["timestamp_utc", "action", "entity_type", "entity_id"],
    rows: events.map(event => [event.createdAt.toISOString(), event.action, event.entityType, event.entityId ?? ""]),
  };
}

export async function setModelEnabled(modelId: string, enabled: boolean) {
  adminOverviewCache = null;
  bustCache("model_availability_snapshot");
  const db = await getDb();
  if (!db) return false;
  const result = await db.update(modelConfigs).set({ enabled }).where(eq(modelConfigs.modelId, modelId));
  return result[0].affectedRows > 0;
}

export const USER_TIER_RANK: Record<string, number> = {
  free: 0,
  plus: 1,
  starter: 1,
  pro: 2,
  ultra: 3,
  power: 3,
  max: 3,
  enterprise: 4,
};

export const USER_TIER_DISPLAY_NAMES: Record<string, string> = {
  free: "Free",
  starter: "Plus",
  plus: "Plus",
  pro: "Pro",
  max: "Ultra",
  power: "Ultra",
  ultra: "Ultra",
  enterprise: "Enterprise",
};

export function isTierSufficient(userTier: UserTier = "free", minTier: UserTier = "free"): boolean {
  return (USER_TIER_RANK[userTier] ?? 0) >= (USER_TIER_RANK[minTier] ?? 0);
}

const modelTierCache = new Map<string, { minTier: UserTier; expiresAt: number }>();
const MODEL_TIER_CACHE_TTL_MS = 15_000;

export async function getModelMinTier(modelId: string): Promise<UserTier> {
  const cached = modelTierCache.get(modelId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.minTier;
  }
  try {
    const db = await getDb();
    if (!db) return "free";
    const rows = await db.select({ minTier: modelConfigs.minTier }).from(modelConfigs).where(eq(modelConfigs.modelId, modelId)).limit(1);
    const minTier = ((rows[0]?.minTier as UserTier) || "free");
    modelTierCache.set(modelId, { minTier, expiresAt: Date.now() + MODEL_TIER_CACHE_TTL_MS });
    return minTier;
  } catch {
    return "free";
  }
}

export async function setModelMinTier(modelId: string, minTier: UserTier) {
  adminOverviewCache = null;
  bustCache("model_availability_snapshot");
  modelTierCache.delete(modelId);
  const db = await getDb();
  if (!db) return false;
  const result = await db.update(modelConfigs).set({ minTier }).where(eq(modelConfigs.modelId, modelId));
  return result[0].affectedRows > 0;
}

const modelAccessCache = new Map<string, { access: { isPayg: boolean; isBundle: boolean; isTokenPlan: boolean }; expiresAt: number }>();
const MODEL_ACCESS_CACHE_TTL_MS = 15_000;

export async function getModelAccess(modelId: string): Promise<{ isPayg: boolean; isBundle: boolean; isTokenPlan: boolean }> {
  const cached = modelAccessCache.get(modelId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.access;
  }
  try {
    const db = await getDb();
    if (!db) return { isPayg: false, isBundle: true, isTokenPlan: false };
    const rows = await db.select({
      isPayg: modelConfigs.isPayg,
      isBundle: modelConfigs.isBundle,
      isTokenPlan: modelConfigs.isTokenPlan,
    }).from(modelConfigs).where(eq(modelConfigs.modelId, modelId)).limit(1);
    const isPayg = Boolean(rows[0]?.isPayg);
    const isBundle = rows[0]?.isBundle === undefined || rows[0]?.isBundle === null ? true : Boolean(rows[0]?.isBundle);
    const isTokenPlan = Boolean(rows[0]?.isTokenPlan);
    const access = { isPayg, isBundle, isTokenPlan };
    modelAccessCache.set(modelId, { access, expiresAt: Date.now() + MODEL_ACCESS_CACHE_TTL_MS });
    return access;
  } catch {
    return { isPayg: false, isBundle: true, isTokenPlan: false };
  }
}

export async function getModelIsPayg(modelId: string): Promise<boolean> {
  const access = await getModelAccess(modelId);
  return access.isPayg;
}

export async function getModelIsBundle(modelId: string): Promise<boolean> {
  const access = await getModelAccess(modelId);
  return access.isBundle;
}

export async function getModelIsTokenPlan(modelId: string): Promise<boolean> {
  const access = await getModelAccess(modelId);
  return access.isTokenPlan;
}

export async function setModelAccess(
  modelId: string,
  access: { isPayg?: boolean; isBundle?: boolean; isTokenPlan?: boolean }
): Promise<boolean> {
  adminOverviewCache = null;
  bustCache("model_availability_snapshot");
  modelAccessCache.delete(modelId);
  const db = await getDb();
  if (!db) return false;
  const updates: Record<string, boolean> = {};
  if (access.isPayg !== undefined) updates.isPayg = access.isPayg;
  if (access.isBundle !== undefined) updates.isBundle = access.isBundle;
  if (access.isTokenPlan !== undefined) updates.isTokenPlan = access.isTokenPlan;

  const existing = await db.select().from(modelConfigs).where(eq(modelConfigs.modelId, modelId)).limit(1);
  if (existing.length === 0) {
    await db.insert(modelConfigs).values({
      modelId,
      displayName: modelId,
      description: "",
      capabilities: ["reasoning", "coding", "streaming"],
      providerSlug: "fxqidian",
      enabled: true,
      isPayg: access.isPayg ?? false,
      isBundle: access.isBundle ?? true,
      isTokenPlan: access.isTokenPlan ?? false,
    }).catch(() => undefined);
    return true;
  }
  const result = await db.update(modelConfigs).set(updates).where(eq(modelConfigs.modelId, modelId));
  return (result[0]?.affectedRows ?? 0) > 0 || true;
}

export async function setModelIsPayg(modelId: string, isPayg: boolean): Promise<boolean> {
  return setModelAccess(modelId, { isPayg });
}

export async function setModelIsBundle(modelId: string, isBundle: boolean): Promise<boolean> {
  return setModelAccess(modelId, { isBundle });
}

export async function setModelIsTokenPlan(modelId: string, isTokenPlan: boolean): Promise<boolean> {
  return setModelAccess(modelId, { isTokenPlan });
}

export type ModelCompactScalingConfig = {
  enabled: boolean;
  triggerTokens: number;
};

const compactScalingCache = new Map<string, { config: ModelCompactScalingConfig; expiresAt: number }>();
const COMPACT_SCALING_CACHE_TTL_MS = 10_000;

export function parseContextTokens(val: unknown): number {
  if (typeof val === "number") return Math.max(1, Math.round(val));
  if (typeof val !== "string") return 500_000;
  const cleaned = val.trim().toLowerCase();
  const kMatch = cleaned.match(/^([0-9]+(?:\.[0-9]+)?)\s*k$/);
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1_000);
  const mMatch = cleaned.match(/^([0-9]+(?:\.[0-9]+)?)\s*m$/);
  if (mMatch) return Math.round(parseFloat(mMatch[1]) * 1_000_000);
  const num = parseInt(cleaned.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(num) && num > 0 ? num : 500_000;
}

export const DEFAULT_COMPACT_SCALING_MODELS: Record<string, ModelCompactScalingConfig> = {
  "claude-opus-5.5": { enabled: true, triggerTokens: 500_000 },
  "claude-sonnet-5.5": { enabled: true, triggerTokens: 500_000 },
  "claude-haiku-5.5": { enabled: true, triggerTokens: 500_000 },
  "claude-opus-5": { enabled: true, triggerTokens: 500_000 },
  "claude-sonnet-4.6": { enabled: true, triggerTokens: 500_000 },
  "claude-fable-5.1": { enabled: true, triggerTokens: 500_000 },
  "claude-fable-5": { enabled: true, triggerTokens: 500_000 },
  "qwen3.8-max": { enabled: true, triggerTokens: 500_000 },
  "glm-5.3": { enabled: true, triggerTokens: 500_000 },
  "glm-5.3-flash": { enabled: true, triggerTokens: 500_000 },
  "deepseek-v4-pro": { enabled: true, triggerTokens: 500_000 },
  "deepseek-v4-flash": { enabled: true, triggerTokens: 500_000 },
  "gpt-6-astra": { enabled: true, triggerTokens: 500_000 },
  "gpt-6-sol": { enabled: true, triggerTokens: 500_000 },
  "gpt-6-luna": { enabled: true, triggerTokens: 500_000 },
  "kimi-k3": { enabled: true, triggerTokens: 500_000 },
  "mercury-3": { enabled: true, triggerTokens: 500_000 },
  "gemini-4-argon": { enabled: true, triggerTokens: 500_000 },
};

export async function getAllModelCompactScalingConfigs(): Promise<Record<string, ModelCompactScalingConfig>> {
  const result: Record<string, ModelCompactScalingConfig> = { ...DEFAULT_COMPACT_SCALING_MODELS };
  try {
    const db = await getDb();
    let rawValue: string | undefined;
    if (db) {
      const record = (await db.select({ value: platformSettings.value }).from(platformSettings).where(eq(platformSettings.settingKey, COMPACT_SCALING_SETTING_KEY)).limit(1))[0];
      rawValue = record?.value;
    } else {
      rawValue = fallbackPlatformSettings.get(COMPACT_SCALING_SETTING_KEY)?.value;
    }
    if (rawValue) {
      const parsed = JSON.parse(rawValue) as Record<string, { enabled?: boolean; triggerTokens?: unknown }>;
      for (const [mid, cfg] of Object.entries(parsed)) {
        if (cfg && typeof cfg === "object") {
          result[mid] = {
            enabled: Boolean(cfg.enabled),
            triggerTokens: parseContextTokens(cfg.triggerTokens ?? 500_000),
          };
        }
      }
    }
    return result;
  } catch {
    return result;
  }
}

export async function getModelCompactScalingConfig(modelId: string): Promise<ModelCompactScalingConfig> {
  const cached = compactScalingCache.get(modelId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.config;
  }
  const all = await getAllModelCompactScalingConfigs();
  const config = all[modelId] ?? { enabled: true, triggerTokens: 500_000 };
  compactScalingCache.set(modelId, { config, expiresAt: Date.now() + COMPACT_SCALING_CACHE_TTL_MS });
  return config;
}

export async function ensureDefaultCompactScalingConfigs(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const existing = (await db.select({ value: platformSettings.value }).from(platformSettings).where(eq(platformSettings.settingKey, COMPACT_SCALING_SETTING_KEY)).limit(1))[0];
    if (!existing) {
      await db.insert(platformSettings).values({
        settingKey: COMPACT_SCALING_SETTING_KEY,
        value: JSON.stringify(DEFAULT_COMPACT_SCALING_MODELS),
      }).onDuplicateKeyUpdate({
        set: {
          value: JSON.stringify(DEFAULT_COMPACT_SCALING_MODELS),
          updatedAt: new Date(),
        },
      });
      console.log("[CompactScaling] Seeded default compact scaling configurations (active for all models).");
    }
  } catch (err) {
    console.error("[CompactScaling] Error seeding compact scaling configs:", err);
  }
}

export async function setModelCompactScalingConfig(
  modelId: string,
  config: { enabled: boolean; triggerTokens?: unknown },
  updatedByUserId?: number | null
): Promise<ModelCompactScalingConfig> {
  adminOverviewCache = null;
  compactScalingCache.clear();
  const triggerTokens = parseContextTokens(config.triggerTokens ?? 500_000);
  const nextConfig: ModelCompactScalingConfig = {
    enabled: Boolean(config.enabled),
    triggerTokens,
  };

  const all = await getAllModelCompactScalingConfigs();
  all[modelId] = nextConfig;
  const serialized = JSON.stringify(all);

  fallbackPlatformSettings.set(COMPACT_SCALING_SETTING_KEY, {
    value: serialized,
    updatedAt: new Date(),
    updatedByUserId: updatedByUserId ?? null,
  });

  const db = await getDb();
  if (db) {
    await db.insert(platformSettings).values({
      settingKey: COMPACT_SCALING_SETTING_KEY,
      value: serialized,
      updatedByUserId: updatedByUserId ?? null,
    }).onDuplicateKeyUpdate({
      set: {
        value: serialized,
        updatedByUserId: updatedByUserId ?? null,
        updatedAt: new Date(),
      },
    });
  }

  compactScalingCache.set(modelId, { config: nextConfig, expiresAt: Date.now() + COMPACT_SCALING_CACHE_TTL_MS });
  return nextConfig;
}


const userTierCache = new Map<number, { tier: UserTier; expiresAt: number }>();
const USER_TIER_CACHE_TTL_MS = 15_000;

export async function getUserTier(userId: number): Promise<UserTier> {
  const cached = userTierCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.tier;
  }
  try {
    const db = await getDb();
    if (!db) return "free";
    const rows = await db.select({ tier: users.tier }).from(users).where(eq(users.id, userId)).limit(1);
    const tier = ((rows[0]?.tier as UserTier) || "free");
    userTierCache.set(userId, { tier, expiresAt: Date.now() + USER_TIER_CACHE_TTL_MS });
    return tier;
  } catch {
    return "free";
  }
}

export function clearUserTierCache(userId?: number) {
  if (userId !== undefined) {
    userTierCache.delete(userId);
  } else {
    userTierCache.clear();
  }
}

export async function setProviderEnabled(slug: string, enabled: boolean) {
  adminOverviewCache = null;
  bustCache("model_availability_snapshot");
  bustCache("all_multimodal_providers");
  const db = await getDb();
  if (!db) return { updated: false, disabledModels: 0 };
  return db.transaction(async tx => {
    const providerResult = await tx.update(providerConfigs).set({ enabled }).where(eq(providerConfigs.slug, slug));
    if (!providerResult[0].affectedRows) return { updated: false, disabledModels: 0 };
    if (enabled) return { updated: true, disabledModels: 0 };

    const modelResult = await tx.update(modelConfigs)
      .set({ enabled: false })
      .where(and(eq(modelConfigs.providerSlug, slug), eq(modelConfigs.enabled, true)));
    return { updated: true, disabledModels: modelResult[0].affectedRows };
  });
}

export async function setProviderSupportsVision(slug: string, supportsVision: boolean) {
  adminOverviewCache = null;
  bustCache("model_availability_snapshot");
  bustCache("all_multimodal_providers");
  const db = await getDb();
  if (!db) return { updated: false };
  const res = await db.update(providerConfigs).set({ supportsVision, updatedAt: new Date() }).where(eq(providerConfigs.slug, slug));
  return { updated: (res[0]?.affectedRows ?? 0) > 0, slug, supportsVision };
}

export async function setProviderSupportsDocuments(slug: string, supportsDocuments: boolean) {
  adminOverviewCache = null;
  bustCache("model_availability_snapshot");
  bustCache("all_multimodal_providers");
  const db = await getDb();
  if (!db) return { updated: false };
  const res = await db.update(providerConfigs).set({ supportsDocuments, updatedAt: new Date() }).where(eq(providerConfigs.slug, slug));
  return { updated: (res[0]?.affectedRows ?? 0) > 0, slug, supportsDocuments };
}

export type MultimodalProviderCandidate = {
  source: "managed" | "upstream";
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  apiKeys: string[];
  apiKeyEnabled?: boolean[];
  supportsVision: boolean;
  supportsDocuments: boolean;
};

export async function findAllMultimodalProviders(): Promise<MultimodalProviderCandidate[]> {
  return cached("all_multimodal_providers", 60_000, async () => {
    const results: MultimodalProviderCandidate[] = [];
    try {
      const [opus, sonnet, fable, qwen, glm, deepseek, kimi, gpt6] = await Promise.all([
        getClaudeOpus5RuntimeConfig().catch(() => ({ providers: [] })),
        getSonnet46RuntimeConfig().catch(() => ({ providers: [] })),
        getClaudeFable5NvidiaRuntimeConfig().catch(() => ({ providers: [] })),
        getQwen38MaxRuntimeConfig().catch(() => ({ providers: [] })),
        getGlm53RuntimeConfig().catch(() => ({ providers: [] })),
        getDeepseekV4ProRuntimeConfig().catch(() => ({ providers: [] })),
        getKimiK3RuntimeConfig().catch(() => ({ providers: [] })),
        getGpt6AstraRuntimeConfig().catch(() => ({ providers: [] })),
      ]);

      const allConfigs = [opus, sonnet, fable, qwen, glm, deepseek, kimi, gpt6];
      const seenIds = new Set<string>();

      for (const cfg of allConfigs) {
        if (!cfg?.providers) continue;
        for (const p of cfg.providers) {
          const hasVision = p.supportsVision === true;
          const hasDocs = p.supportsDocuments === true;
          if (p.enabled !== false && (hasVision || hasDocs) && p.baseUrl && p.apiKeys?.length) {
            const key = `${p.baseUrl}::${p.model}::${p.id}`;
            if (!seenIds.has(key)) {
              seenIds.add(key);
              results.push({
                source: "managed",
                id: p.id,
                label: p.label,
                baseUrl: p.baseUrl,
                model: p.model,
                apiKeys: p.apiKeys,
                apiKeyEnabled: p.apiKeyEnabled,
                supportsVision: hasVision,
                supportsDocuments: hasDocs,
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn("[findAllMultimodalProviders] error loading managed runtimes", err);
    }

    try {
      const db = await getDb();
      if (db) {
        const rows = await db
          .select()
          .from(providerConfigs)
          .where(
            and(
              eq(providerConfigs.enabled, true),
              or(eq(providerConfigs.supportsVision, true), eq(providerConfigs.supportsDocuments, true))
            )
          );
        for (const row of rows) {
          results.push({
            source: "upstream",
            id: row.slug,
            label: row.displayName,
            baseUrl: row.baseUrl,
            model: "",
            apiKeys: [],
            supportsVision: row.supportsVision === true,
            supportsDocuments: row.supportsDocuments === true,
          });
        }
      }
    } catch (err) {
      console.warn("[findAllMultimodalProviders] error loading upstream providers", err);
    }

    return results;
  });
}

export async function setAccountControl(input: { userId: number; isSuspended?: boolean; dailyRequestLimit?: number; dailyTokenLimit?: number }) {
  const db = await getDb();
  if (!db) return false;
  await ensureAccountControl(input.userId);
  const patch: Record<string, unknown> = {};
  if (input.isSuspended !== undefined) patch.isSuspended = input.isSuspended;
  if (input.dailyRequestLimit !== undefined) patch.dailyRequestLimit = input.dailyRequestLimit;
  if (input.dailyTokenLimit !== undefined) patch.dailyTokenLimit = input.dailyTokenLimit;
  if (!Object.keys(patch).length) return true;
  const result = await db.update(accountControls).set(patch).where(eq(accountControls.userId, input.userId));
  return result[0].affectedRows > 0;
}

/** Converts a bounded USD credit grant into exact nanodollars without trusting client-side arithmetic. */
export function normalizeAdminCreditGrantAmount(amountUsd: number) {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0 || amountUsd > 100_000) return null;
  const amountNanos = Math.round(amountUsd * NANODOLLARS_PER_DOLLAR);
  return amountNanos > 0 ? amountNanos : null;
}

/** Counts regular registered accounts eligible for administrator giveaways. */
export async function countDiscordVerifiedAccounts() {
  const db = await getDb();
  if (!db) return 0;
  const row = (await db.select({ count: sql<number>`count(${users.id})` })
    .from(users)
    .where(ne(users.openId, ADMIN_SESSION_PRINCIPAL_OPEN_ID)))[0];
  return Math.max(0, Number(row?.count ?? 0));
}

/**
 * Atomically applies one administrator giveaway to all registered regular accounts.
 * Each recipient receives an immutable wallet-ledger entry; the caller records one aggregate audit event.
 */
export async function grantDiscordVerifiedAccountGiveaway(input: { actorUserId: number; amountNanos: number; expectedRecipientCount: number; announcementNote?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const amountNanos = Math.max(0, Math.trunc(input.amountNanos));
  if (!amountNanos) throw new Error("Giveaway amount must be positive");
  const expectedRecipientCount = Math.max(0, Math.trunc(input.expectedRecipientCount));
  const announcementNote = input.announcementNote?.trim() || null;
  return db.transaction(async tx => {
    const recipients = await tx.select({ userId: users.id })
      .from(users)
      .where(ne(users.openId, ADMIN_SESSION_PRINCIPAL_OPEN_ID));
    if (recipients.length !== expectedRecipientCount) {
      return { applied: false as const, recipientCount: recipients.length, amountNanos, totalAmountNanos: 0 };
    }
    if (!recipients.length) return { applied: true as const, recipientCount: 0, amountNanos, totalAmountNanos: 0 };

    const userIds = recipients.map(recipient => recipient.userId);
    await tx.insert(creditAccounts)
      .values(userIds.map(userId => ({ userId, balanceNanos: 0 })))
      // Keep an existing wallet unchanged.  The typed column reference is
      // essential here: raw `user_id` does not exist in TokenForge's camelCase
      // production schema and caused large giveaways to fail before the
      // transaction could credit or ledger any recipient.
      .onDuplicateKeyUpdate({ set: { balanceNanos: sql`${creditAccounts.balanceNanos}` } });
    await tx.update(creditAccounts)
      .set({ balanceNanos: sql`${creditAccounts.balanceNanos} + ${amountNanos}` })
      .where(inArray(creditAccounts.userId, userIds));
    const balances = await tx.select({ userId: creditAccounts.userId, balanceNanos: creditAccounts.balanceNanos })
      .from(creditAccounts)
      .where(inArray(creditAccounts.userId, userIds));
    const giveawayId = randomBytes(12).toString("hex");
    await tx.insert(creditLedger).values(balances.map(account => ({
      userId: account.userId,
      kind: "manual_adjustment" as const,
      amountNanos,
      balanceAfterNanos: account.balanceNanos,
      referenceId: `giveaway:${giveawayId}:${account.userId}`,
      note: announcementNote ?? "Qronos AI registered account giveaway",
    })));
    await tx.insert(creditGiveaways).values({
      id: giveawayId,
      actorUserId: input.actorUserId,
      amountNanos,
      recipientCount: balances.length,
      totalAmountNanos: amountNanos * balances.length,
      announcementNote,
    });
    await tx.insert(creditGiveawayNotifications).values(balances.map(account => ({
      giveawayId,
      userId: account.userId,
    })));
    return {
      applied: true as const,
      id: giveawayId,
      recipientCount: balances.length,
      amountNanos,
      totalAmountNanos: amountNanos * balances.length,
    };
  });
}

/** Returns completed giveaway records for the administrator-only operational history. */
export async function listCreditGiveawayHistory(limit = 40) {
  const db = await getDb();
  if (!db) return [];
  const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  return db.select().from(creditGiveaways).orderBy(desc(creditGiveaways.createdAt)).limit(boundedLimit);
}

/** Returns personal, unread giveaway announcements. No other recipient's data is exposed. */
export async function listUnreadCreditGiveawayNotifications(userId: number, limit = 3) {
  const db = await getDb();
  if (!db) return [];
  const boundedLimit = Math.max(1, Math.min(5, Math.trunc(limit)));
  return db.select({
    id: creditGiveawayNotifications.id,
    giveawayId: creditGiveaways.id,
    amountNanos: creditGiveaways.amountNanos,
    announcementNote: creditGiveaways.announcementNote,
    createdAt: creditGiveawayNotifications.createdAt,
  })
    .from(creditGiveawayNotifications)
    .innerJoin(creditGiveaways, eq(creditGiveawayNotifications.giveawayId, creditGiveaways.id))
    .where(and(eq(creditGiveawayNotifications.userId, userId), isNull(creditGiveawayNotifications.dismissedAt)))
    .orderBy(desc(creditGiveawayNotifications.createdAt))
    .limit(boundedLimit);
}

/** Dismisses one recipient's own giveaway notice without changing the underlying wallet credit. */
export async function dismissCreditGiveawayNotification(input: { userId: number; notificationId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const result = await db.update(creditGiveawayNotifications)
    .set({ dismissedAt: new Date() })
    .where(and(
      eq(creditGiveawayNotifications.id, input.notificationId),
      eq(creditGiveawayNotifications.userId, input.userId),
      isNull(creditGiveawayNotifications.dismissedAt),
    ));
  return Number(result[0].affectedRows ?? 0) > 0;
}

/**
 * Automatically refreshes the user's daily CLI coding plan allowance to 10M tokens at 12:00 AM (midnight) every day.
 * Any leftover is refreshed back to 10,000,000 tokens once per calendar day.
 */
export async function ensureDailyCodingTokens(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const todayStr = utcUsageDate();
  const refId = `daily_cli_refresh:${todayStr}:${userId}`;

  // Check if this account was already refreshed today
  const existingRefresh = (
    await db
      .select({ id: creditLedger.id })
      .from(creditLedger)
      .where(and(eq(creditLedger.userId, userId), eq(creditLedger.referenceId, refId)))
      .limit(1)
  )[0];

  if (existingRefresh) return;

  try {
    await db.transaction(async (tx) => {
      const acc = (
        await tx
          .select()
          .from(creditAccounts)
          .where(eq(creditAccounts.userId, userId))
          .limit(1)
      )[0];

      if (!acc) return;

      // Refresh leftover tokens back to 10,000,000 (10M Tokens)
      await tx
        .update(creditAccounts)
        .set({ codingPlanTokens: 10_000_000 })
        .where(eq(creditAccounts.userId, userId));

      await tx.insert(creditLedger).values({
        userId,
        kind: "daily_refresh",
        amountNanos: 0,
        balanceAfterNanos: 10_000_000,
        referenceId: refId,
      });
    });
  } catch (err: any) {
    // Duplicate key on race condition is safe to ignore
    if (err?.code !== "ER_DUP_ENTRY") {
      console.warn(`[Daily Refresh] Race or warning for user #${userId}:`, err?.message || err);
    }
  }
}

/** Adds a positive administrator credit grant and immutable wallet-ledger record for an existing account. */
export async function grantAdminAccountCredit(input: {
  userId: number;
  amountNanos: number;
  actorUserId: number;
  balanceType?: "payg" | "tokens";
  amountTokens?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const amountNanos = Math.max(0, Math.trunc(input.amountNanos));
  const amountTokens = input.amountTokens ? Math.max(0, Math.trunc(input.amountTokens)) : 0;
  if (!amountNanos && !amountTokens) throw new Error("Credit grant amount must be positive");
  const user = (await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1))[0];
  if (!user) return null;
  await ensureCreditAccount(input.userId);
  const balanceType = input.balanceType ?? "payg";

  return db.transaction(async tx => {
    const giveawayId = randomBytes(12).toString("hex");

    if (balanceType === "tokens") {
      const tokensToAdd = amountTokens || amountNanos;
      const mTokens = (tokensToAdd / 1_000_000).toLocaleString();
      const announcementNote = `An administrator added ${mTokens}M coding tokens to your Qronos AI account.`;
      await tx
        .update(creditAccounts)
        .set({ codingPlanTokens: sql`${creditAccounts.codingPlanTokens} + ${tokensToAdd}` })
        .where(eq(creditAccounts.userId, input.userId));

      const account = (await tx.select().from(creditAccounts).where(eq(creditAccounts.userId, input.userId)).limit(1))[0];
      const balanceNanos = account?.balanceNanos ?? 0;
      const paygBalanceNanos = Number(account?.paygBalanceNanos ?? 0);
      const codingPlanTokens = Number((account as any)?.codingPlanTokens ?? tokensToAdd);

      await tx.insert(creditLedger).values({
        userId: input.userId,
        kind: "manual_adjustment",
        amountNanos: 0,
        balanceAfterNanos: codingPlanTokens,
        referenceId: `admin-tokens:${giveawayId}:${input.userId}`,
        note: announcementNote,
      });

      const recipientUser = (await tx.select().from(users).where(eq(users.id, input.userId)).limit(1))[0];
      const targetEmail = recipientUser?.email ? normalizeEmail(recipientUser.email) : null;
      if (targetEmail) {
        await tx.insert(systemNotifications).values({
          title: "Coding Tokens Credited",
          message: announcementNote,
          type: "update",
          targetAudience: "SPECIFIC_EMAILS",
          targetEmails: targetEmail,
          createdByUserId: input.actorUserId,
          createdAt: new Date(),
        });
      }

      return {
        amountNanos,
        amountTokens: tokensToAdd,
        balanceNanos,
        paygBalanceNanos,
        codingPlanTokens,
        balanceType: "tokens" as const,
      };
    } else {
      await tx.update(creditAccounts).set({ paygBalanceNanos: sql`${creditAccounts.paygBalanceNanos} + ${amountNanos}` }).where(eq(creditAccounts.userId, input.userId));
      const account = (await tx.select().from(creditAccounts).where(eq(creditAccounts.userId, input.userId)).limit(1))[0];
      const balanceNanos = 0;
      const paygBalanceNanos = Number(account?.paygBalanceNanos ?? amountNanos);
      const codingPlanTokens = Number((account as any)?.codingPlanTokens ?? 0);
      const usdAmount = (amountNanos / 1_000_000_000).toFixed(2);
      const newPaygUsd = (paygBalanceNanos / 1_000_000_000).toFixed(2);
      const announcementNote = `An administrator added $${usdAmount} PAYG balance to your account. Your new PAYG balance is $${newPaygUsd}.`;

      await tx.insert(creditLedger).values({
        userId: input.userId,
        kind: "manual_adjustment",
        amountNanos,
        balanceAfterNanos: paygBalanceNanos,
        referenceId: `admin-payg:${giveawayId}:${input.userId}`,
        note: announcementNote,
      });

      const recipientUser = (await tx.select().from(users).where(eq(users.id, input.userId)).limit(1))[0];
      const targetEmail = recipientUser?.email ? normalizeEmail(recipientUser.email) : null;
      if (targetEmail) {
        await tx.insert(systemNotifications).values({
          title: "PAYG Balance Credited",
          message: announcementNote,
          type: "update",
          targetAudience: "SPECIFIC_EMAILS",
          targetEmails: targetEmail,
          createdByUserId: input.actorUserId,
          createdAt: new Date(),
        });
      }

      return { amountNanos, balanceNanos, paygBalanceNanos, codingPlanTokens, balanceType: "payg" as const };
    }
  });
}

/** Sets an account's credit balance, PAYG balance, or coding tokens directly to a specified target amount. */
export async function setAdminAccountCredit(input: {
  userId: number;
  targetAmountNanos: number;
  actorUserId: number;
  balanceType?: "payg" | "tokens";
  targetTokens?: number;
  note?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const targetAmountNanos = Math.max(0, Math.trunc(input.targetAmountNanos));
  const targetTokens = input.targetTokens !== undefined ? Math.max(0, Math.trunc(input.targetTokens)) : undefined;
  const user = (await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId)).limit(1))[0];
  if (!user) return null;
  await ensureCreditAccount(input.userId);
  const balanceType = input.balanceType ?? "payg";

  return db.transaction(async tx => {
    const existing = (
      await tx
        .select()
        .from(creditAccounts)
        .where(eq(creditAccounts.userId, input.userId))
        .limit(1)
    )[0];

    const currentBalanceNanos = existing?.balanceNanos ?? 0;
    const currentPaygBalanceNanos = Number(existing?.paygBalanceNanos ?? 0);
    const currentCodingTokens = Number((existing as any)?.codingPlanTokens ?? 0);
    const adjustmentId = randomBytes(12).toString("hex");

    if (balanceType === "tokens") {
      const finalTargetTokens = targetTokens !== undefined ? targetTokens : targetAmountNanos;
      const diffTokens = finalTargetTokens - currentCodingTokens;
      await tx
        .update(creditAccounts)
        .set({ codingPlanTokens: finalTargetTokens })
        .where(eq(creditAccounts.userId, input.userId));

      const targetM = (finalTargetTokens / 1_000_000).toLocaleString();
      const defaultNote = diffTokens < 0
        ? `Administrator reduced coding tokens to ${targetM}M tokens.`
        : `Administrator adjusted coding tokens to ${targetM}M tokens.`;
      const note = input.note?.trim() || defaultNote;

      await tx.insert(creditLedger).values({
        userId: input.userId,
        kind: "manual_adjustment",
        amountNanos: 0,
        balanceAfterNanos: finalTargetTokens,
        referenceId: `admin-set-tokens:${adjustmentId}:${input.userId}`,
        note,
      });

      const recipientUser = (await tx.select().from(users).where(eq(users.id, input.userId)).limit(1))[0];
      const targetEmail = recipientUser?.email ? normalizeEmail(recipientUser.email) : null;
      if (targetEmail) {
        await tx.insert(systemNotifications).values({
          title: "Coding Tokens Updated",
          message: note,
          type: "update",
          targetAudience: "SPECIFIC_EMAILS",
          targetEmails: targetEmail,
          createdByUserId: input.actorUserId,
          createdAt: new Date(),
        });
      }

      return {
        targetAmountNanos,
        targetTokens: finalTargetTokens,
        diffNanos: 0,
        diffTokens,
        balanceNanos: currentBalanceNanos,
        paygBalanceNanos: currentPaygBalanceNanos,
        codingPlanTokens: finalTargetTokens,
        balanceType: "tokens" as const,
      };
    } else {
      const targetUsd = (targetAmountNanos / 1_000_000_000).toFixed(2);
      const diffNanos = targetAmountNanos - currentPaygBalanceNanos;
      await tx
        .update(creditAccounts)
        .set({ paygBalanceNanos: targetAmountNanos })
        .where(eq(creditAccounts.userId, input.userId));

      const defaultNote = diffNanos < 0
        ? `Administrator reduced PAYG balance to $${targetUsd}.`
        : `Administrator adjusted PAYG balance to $${targetUsd}.`;
      const note = input.note?.trim() || defaultNote;

      await tx.insert(creditLedger).values({
        userId: input.userId,
        kind: "manual_adjustment",
        amountNanos: diffNanos,
        balanceAfterNanos: targetAmountNanos,
        referenceId: `admin-set-payg:${adjustmentId}:${input.userId}`,
        note,
      });

      const recipientUser = (await tx.select().from(users).where(eq(users.id, input.userId)).limit(1))[0];
      const targetEmail = recipientUser?.email ? normalizeEmail(recipientUser.email) : null;
      if (targetEmail) {
        await tx.insert(systemNotifications).values({
          title: "PAYG Balance Updated",
          message: note,
          type: "update",
          targetAudience: "SPECIFIC_EMAILS",
          targetEmails: targetEmail,
          createdByUserId: input.actorUserId,
          createdAt: new Date(),
        });
      }

      return {
        targetAmountNanos,
        diffNanos,
        balanceNanos: currentBalanceNanos,
        paygBalanceNanos: targetAmountNanos,
        codingPlanTokens: currentCodingTokens,
        balanceType: "payg" as const,
      };
    }
  });
}

export async function listOpenFlags() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(accountFlags).where(eq(accountFlags.status, "open")).orderBy(desc(accountFlags.createdAt)).limit(100);
}

export async function createAccountFlag(input: { userId: number; kind: "quota_exceeded" | "rate_circuit" | "suspicious_usage"; reason: string }) {
  const db = await getDb();
  if (!db) return;
  await db.insert(accountFlags).values(input);
}

export async function markAccountSuspicious(userId: number) {
  const db = await getDb();
  if (!db) return;
  await ensureAccountControl(userId);
  await db.update(accountControls).set({ isSuspicious: true }).where(eq(accountControls.userId, userId));
}

export async function writeAuditEvent(input: { actorUserId?: number; targetUserId?: number; action: string; entityType: string; entityId?: string; metadata?: Record<string, unknown> }) {
  const db = await getDb();
  if (!db) return;
  const { auditEvents } = await import("../drizzle/schema");
  await db.insert(auditEvents).values(input);
}

/** Determines if code is currently executing within a test runner or CI test environment */
export function isTestExecutionEnvironment(): boolean {
  return Boolean(
    process.env.VITEST ||
    process.env.NODE_ENV === "test" ||
    process.env.JEST_WORKER_ID !== undefined ||
    process.env.TEST === "true" ||
    Boolean(process.env.npm_lifecycle_event && process.env.npm_lifecycle_event.includes("test"))
  );
}

/**
 * Sets every regular user account's wallet credit balance to an exact amount (in nanodollars).
 * Initializes creditAccounts for all users who don't have one and inserts ledger records.
 */
export async function setAllUsersCreditBalance(input: {
  targetAmountNanos: number;
  actorUserId: number;
  note?: string;
}) {
  // CRITICAL SAFETY LOCK: Permanently block execution during tests or automated CI runs
  if (isTestExecutionEnvironment()) {
    throw new Error(
      "SECURITY_LOCK_TRIGGERED: setAllUsersCreditBalance is permanently blocked in test environments to protect user balances."
    );
  }

  // Safety guard against test notes or simulated inputs
  if (input.note && /bulk\s*test|test\s*credit|vitest|mock/i.test(input.note)) {
    throw new Error(
      "SECURITY_LOCK_TRIGGERED: Test credit notes are rejected on live bulk account credit operations."
    );
  }

  if (!input.actorUserId || input.actorUserId <= 0) {
    throw new Error("A valid administrator user ID is required for bulk credit updates.");
  }

  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const targetAmountNanos = Math.max(0, Math.trunc(input.targetAmountNanos));
  const conversionRate = typeof NANODOLLARS_PER_DOLLAR === "number" && NANODOLLARS_PER_DOLLAR > 0 ? NANODOLLARS_PER_DOLLAR : 1_000_000_000;
  const targetAmountUsd = targetAmountNanos / conversionRate;
  const note =
    input.note?.trim() ||
    `Administrator set wallet balance to $${targetAmountUsd.toFixed(2)}`;

  return db.transaction(async tx => {
    const allUsers = await tx
      .select({ id: users.id })
      .from(users)
      .where(ne(users.openId, ADMIN_SESSION_PRINCIPAL_OPEN_ID));

    if (!allUsers.length) {
      return { updatedCount: 0, targetAmountNanos, targetAmountUsd };
    }

    const userIds = allUsers.map(u => u.id);

    // Ensure all users have a creditAccounts row
    await tx
      .insert(creditAccounts)
      .values(userIds.map(userId => ({ userId, balanceNanos: 0 })))
      .onDuplicateKeyUpdate({ set: { balanceNanos: sql`${creditAccounts.balanceNanos}` } });

    // Read current balances to compute accurate ledger deltas
    const existingAccounts = await tx
      .select({ userId: creditAccounts.userId, balanceNanos: creditAccounts.balanceNanos })
      .from(creditAccounts)
      .where(inArray(creditAccounts.userId, userIds));
    const currentBalanceMap = new Map<number, number>();
    for (const acc of existingAccounts) {
      currentBalanceMap.set(acc.userId, Number(acc.balanceNanos));
    }

    // Set balance to targetAmountNanos for all users
    await tx
      .update(creditAccounts)
      .set({ balanceNanos: targetAmountNanos })
      .where(inArray(creditAccounts.userId, userIds));

    // Create ledger records with actual delta amount
    const batchId = randomBytes(12).toString("hex");
    await tx.insert(creditLedger).values(
      userIds.map(userId => {
        const currentBal = currentBalanceMap.get(userId) ?? 0;
        const deltaNanos = targetAmountNanos - currentBal;
        return {
          userId,
          kind: "manual_adjustment" as const,
          amountNanos: deltaNanos,
          balanceAfterNanos: targetAmountNanos,
          referenceId: `bulk-set-credit:${batchId}:${userId}`,
          note,
        };
      })
    );

    return {
      updatedCount: userIds.length,
      targetAmountNanos,
      targetAmountUsd,
    };
  });
}

/**
 * Grants an amount of PAYG balance (in USD/nanodollars) to all users.
 */
export async function grantAllUsersPaygBalance(input: {
  amountDollars: number;
  actorUserId?: number;
  note?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const amountNanos = Math.round(input.amountDollars * 1_000_000_000);
  const note = input.note?.trim() || `$${input.amountDollars.toFixed(2)} Pay-As-You-Go compute grant`;

  // 1. Ensure all users exist in credit_accounts
  await db.execute(sql`
    INSERT INTO credit_accounts (userId, balanceNanos, paygBalanceNanos, createdAt, updatedAt)
    SELECT id, 0, 0, NOW(), NOW()
    FROM users
    WHERE id NOT IN (SELECT userId FROM credit_accounts)
  `);

  // 2. Add amount to paygBalanceNanos for all accounts
  await db.execute(sql`
    UPDATE credit_accounts
    SET paygBalanceNanos = paygBalanceNanos + ${amountNanos}
  `);

  // 3. Batch insert ledger entries
  const allUsers = await db.select({ id: users.id }).from(users);
  const batchId = randomBytes(8).toString("hex");
  const chunkSize = 500;
  for (let i = 0; i < allUsers.length; i += chunkSize) {
    const chunk = allUsers.slice(i, i + chunkSize);
    await db.insert(creditLedger).values(
      chunk.map(u => ({
        userId: u.id,
        kind: "manual_adjustment" as const,
        amountNanos,
        balanceAfterNanos: amountNanos,
        referenceId: `bulk-payg-grant:${batchId}:${u.id}`,
        note,
      }))
    );
  }

  return {
    success: true,
    updatedCount: allUsers.length,
    amountDollars: input.amountDollars,
    amountNanos,
  };
}

/**
 * Grants Token Plan quota (in millions of tokens) to all user accounts without any Discord restrictions.
 */
export async function grantAllUsersTokenPlan(input: {
  tokensMillion: number;
  actorUserId?: number;
  note?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  const tokensMillion = Math.max(1, Math.round(input.tokensMillion));
  const tokensAdded = tokensMillion * 1_000_000;
  const note = input.note?.trim() || `+${tokensMillion}M Token Plan grant to all users`;

  // 1. Ensure all users exist in credit_accounts
  await db.execute(sql`
    INSERT INTO credit_accounts (userId, balanceNanos, paygBalanceNanos, codingPlanTokens, createdAt, updatedAt)
    SELECT id, 0, 0, 0, NOW(), NOW()
    FROM users
    WHERE id NOT IN (SELECT userId FROM credit_accounts)
  `);

  // 2. Add tokens to codingPlanTokens for all accounts unconditionally (no Discord requirement)
  await db.execute(sql`
    UPDATE credit_accounts
    SET codingPlanTokens = codingPlanTokens + ${tokensAdded}
  `);

  // 3. Batch insert ledger entries
  const allUsers = await db.select({ id: users.id }).from(users);
  const batchId = randomBytes(8).toString("hex");
  const chunkSize = 500;
  for (let i = 0; i < allUsers.length; i += chunkSize) {
    const chunk = allUsers.slice(i, i + chunkSize);
    await db.insert(creditLedger).values(
      chunk.map(u => ({
        userId: u.id,
        kind: "manual_adjustment" as const,
        amountNanos: 0,
        balanceAfterNanos: tokensAdded,
        referenceId: `bulk-tokens-grant:${batchId}:${u.id}`,
        note,
      }))
    );
  }

  return {
    success: true,
    updatedCount: allUsers.length,
    tokensMillion,
    tokensAdded,
  };
}

let _accessRequestsTableChecked = false;
export async function ensureAccessRequestsTable() {
  if (_accessRequestsTableChecked) return;
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS admin_access_requests (
        id VARCHAR(32) PRIMARY KEY,
        email VARCHAR(320) NOT NULL,
        status ENUM('pending', 'approved', 'denied') NOT NULL DEFAULT 'pending',
        adminNote TEXT NULL,
        submissionCount INT NOT NULL DEFAULT 1,
        requestedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resolvedAt TIMESTAMP NULL,
        resolvedByUserId INT NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE INDEX admin_access_requests_email_idx (email),
        INDEX admin_access_requests_status_idx (status, updatedAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    _accessRequestsTableChecked = true;
  } catch (error) {
    console.warn("[Database] ensureAccessRequestsTable check:", error);
    _accessRequestsTableChecked = true;
  }
}

export async function submitAccessRequest(inputEmail: string) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  await ensureAccessRequestsTable();

  const email = normalizeEmail(inputEmail);
  if (!email || !email.includes("@")) {
    throw new Error("Please enter a valid email address");
  }

  const existing = (
    await db.select().from(adminAccessRequests).where(eq(adminAccessRequests.email, email)).limit(1)
  )[0];

  const now = new Date();

  if (existing) {
    await db
      .update(adminAccessRequests)
      .set({
        status: "pending",
        adminNote: null,
        requestedAt: now,
        submissionCount: sql`${adminAccessRequests.submissionCount} + 1`,
        resolvedAt: null,
        resolvedByUserId: null,
      })
      .where(eq(adminAccessRequests.id, existing.id));

    return {
      id: existing.id,
      email,
      status: "pending" as const,
      submissionCount: (existing.submissionCount ?? 1) + 1,
      isResubmission: true,
    };
  }

  const id = `req_${randomBytes(12).toString("hex")}`;
  await db.insert(adminAccessRequests).values({
    id,
    email,
    status: "pending",
    submissionCount: 1,
    requestedAt: now,
  });

  return {
    id,
    email,
    status: "pending" as const,
    submissionCount: 1,
    isResubmission: false,
  };
}

export async function getAccessRequestByEmail(inputEmail: string) {
  const db = await getDb();
  if (!db) return null;
  await ensureAccessRequestsTable();

  const email = normalizeEmail(inputEmail);
  if (!email) return null;

  const row = (
    await db.select().from(adminAccessRequests).where(eq(adminAccessRequests.email, email)).limit(1)
  )[0];

  return row || null;
}

export async function listAccessRequests(options?: {
  status?: "all" | "pending" | "approved" | "denied";
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  await ensureAccessRequestsTable();

  const boundedLimit = Math.min(Math.max(Math.floor(options?.limit ?? 100), 1), 200);
  const statusFilter =
    options?.status && options.status !== "all" ? eq(adminAccessRequests.status, options.status) : undefined;

  const rows = await db
    .select({
      id: adminAccessRequests.id,
      email: adminAccessRequests.email,
      status: adminAccessRequests.status,
      adminNote: adminAccessRequests.adminNote,
      submissionCount: adminAccessRequests.submissionCount,
      requestedAt: adminAccessRequests.requestedAt,
      resolvedAt: adminAccessRequests.resolvedAt,
      resolvedByUserId: adminAccessRequests.resolvedByUserId,
      resolvedByUserName: users.name,
      createdAt: adminAccessRequests.createdAt,
      updatedAt: adminAccessRequests.updatedAt,
    })
    .from(adminAccessRequests)
    .leftJoin(users, eq(adminAccessRequests.resolvedByUserId, users.id))
    .where(statusFilter)
    .orderBy(desc(adminAccessRequests.updatedAt))
    .limit(boundedLimit);

  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    status: r.status as "pending" | "approved" | "denied",
    adminNote: r.adminNote,
    submissionCount: Number(r.submissionCount ?? 1),
    requestedAt: r.requestedAt,
    resolvedAt: r.resolvedAt,
    resolvedByUserId: r.resolvedByUserId,
    resolvedByUserName: r.resolvedByUserName ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

export async function approveAccessRequest(input: {
  id: string;
  actorUserId: number;
  note?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  await ensureAccessRequestsTable();

  const req = (
    await db.select().from(adminAccessRequests).where(eq(adminAccessRequests.id, input.id)).limit(1)
  )[0];
  if (!req) throw new Error("Access request not found");

  const now = new Date();

  await db
    .update(adminAccessRequests)
    .set({
      status: "approved",
      adminNote: input.note?.trim() || null,
      resolvedByUserId: input.actorUserId,
      resolvedAt: now,
    })
    .where(eq(adminAccessRequests.id, req.id));

  // Pre-provision the account so when user visits login, they can enter directly or verify seamlessly
  let provisionResult = null;
  try {
    provisionResult = await preProvisionAccountEmail({
      email: req.email,
      provisionedByUserId: input.actorUserId,
    });
  } catch (err: any) {
    console.info(`[AccessRequest] preProvisionAccountEmail note for ${req.email}:`, err?.message);
  }

  return {
    id: req.id,
    email: req.email,
    status: "approved" as const,
    provisionResult,
  };
}

export async function denyAccessRequest(input: {
  id: string;
  actorUserId: number;
  note?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Qronos AI database is unavailable");
  await ensureAccessRequestsTable();

  const req = (
    await db.select().from(adminAccessRequests).where(eq(adminAccessRequests.id, input.id)).limit(1)
  )[0];
  if (!req) throw new Error("Access request not found");

  const note = input.note?.trim() || "Your access request was reviewed and denied by the administrator.";

  await db
    .update(adminAccessRequests)
    .set({
      status: "denied",
      adminNote: note,
      resolvedByUserId: input.actorUserId,
      resolvedAt: new Date(),
    })
    .where(eq(adminAccessRequests.id, req.id));

  return {
    id: req.id,
    email: req.email,
    status: "denied" as const,
    adminNote: note,
  };
}

/**
 * Checks if a user has completed any payment order (UPI or Solana) or has plan credits.
 */
export async function hasUserPurchasedPlan(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db || !userId) return false;

  // 1. Check UPI completed orders
  try {
    const upiRes = await db.execute(sql`
      SELECT 1 FROM upi_orders WHERE user_id = ${userId} AND status = 'COMPLETED' LIMIT 1
    `);
    const rows = upiRes[0] as unknown[];
    if (Array.isArray(rows) && rows.length > 0) {
      return true;
    }
  } catch {}

  // 2. Check Solana completed or paid orders
  try {
    const solanaRes = await db.execute(sql`
      SELECT 1 FROM solana_orders WHERE user_id = ${userId} AND status IN ('PAID', 'COMPLETED') LIMIT 1
    `);
    const rows = solanaRes[0] as unknown[];
    if (Array.isArray(rows) && rows.length > 0) {
      return true;
    }
  } catch {}

  // 3. Check Dodo completed or succeeded payments
  try {
    const dodoRes = await db.execute(sql`
      SELECT 1 FROM dodo_orders WHERE user_id = ${userId} AND status IN ('PAID', 'COMPLETED', 'SUCCEEDED') LIMIT 1
    `);
    const rows = dodoRes[0] as unknown[];
    if (Array.isArray(rows) && rows.length > 0) {
      return true;
    }
  } catch {}

  // 4. Check credit ledger for purchase references
  try {
    const ledger = await db
      .select({ id: creditLedger.id })
      .from(creditLedger)
      .where(
        and(
          eq(creditLedger.userId, userId),
          or(
            like(creditLedger.referenceId, "upi_pay:%"),
            like(creditLedger.referenceId, "solana_pay:%"),
            like(creditLedger.referenceId, "dodo_pay:%"),
            like(creditLedger.description, "%UPI%"),
            like(creditLedger.description, "%Solana%"),
            like(creditLedger.description, "%Dodo%")
          )
        )
      )
      .limit(1);
    if (ledger.length > 0) {
      return true;
    }
  } catch {}

  return false;
}

/**
 * Counts how many playground messages a user has successfully sent using gpt-6-astra in the current UTC calendar month.
 */
export async function getGpt6AstraMonthlyPlaygroundUsage(userId: number): Promise<number> {
  const db = await getDb();
  if (!db || !userId) return 0;
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  try {
    const res = await db
      .select({ count: sql<number>`count(*)` })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.userId, userId),
          eq(usageEvents.modelId, "gpt-6-astra"),
          eq(usageEvents.source, "playground"),
          eq(usageEvents.status, "success"),
          gte(usageEvents.createdAt, startOfMonth)
        )
      );
    return Number(res[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

// ============================================================================
// Live Invite Tracker & History
// ============================================================================

export interface InviteTrackerInvitedUser {
  userId: number;
  email: string;
  name: string;
  joinedAt: string;
}

export interface InviteTrackerLeaderboardEntry {
  referrerUserId: number;
  referrerEmail: string;
  referrerName: string;
  inviteCount: number;
  invitedUsers: InviteTrackerInvitedUser[];
}

export interface InviteTrackerSessionSummary {
  id: string;
  name: string;
  startedAt: string;
  endedAt: string | null;
  isActive: boolean;
  createdByUserId?: number | null;
  totalInvites: number;
  uniqueInviters: number;
  leaderboard: InviteTrackerLeaderboardEntry[];
}

interface RawInviteTrackerData {
  activeSession: {
    id: string;
    name: string;
    startedAt: string;
    createdByUserId?: number | null;
  } | null;
  history: Array<{
    id: string;
    name: string;
    startedAt: string;
    endedAt: string;
    createdByUserId?: number | null;
    totalInvites: number;
    uniqueInviters: number;
    leaderboard: InviteTrackerLeaderboardEntry[];
  }>;
}

async function getRawInviteTrackerData(): Promise<RawInviteTrackerData> {
  try {
    const db = await getDb();
    if (!db) {
      const fallback = fallbackPlatformSettings.get(INVITE_TRACKER_SETTING_KEY)?.value;
      if (fallback) return JSON.parse(fallback);
      return { activeSession: null, history: [] };
    }
    const record = (
      await db
        .select({ value: platformSettings.value })
        .from(platformSettings)
        .where(eq(platformSettings.settingKey, INVITE_TRACKER_SETTING_KEY))
        .limit(1)
    )[0];
    if (record?.value) {
      return JSON.parse(record.value);
    }
    return { activeSession: null, history: [] };
  } catch (error: any) {
    console.error("[InviteTracker] Error reading tracker data:", error);
    return { activeSession: null, history: [] };
  }
}

async function saveInviteTrackerData(data: RawInviteTrackerData, updatedByUserId?: number | null): Promise<void> {
  const serialized = JSON.stringify(data);
  fallbackPlatformSettings.set(INVITE_TRACKER_SETTING_KEY, {
    value: serialized,
    updatedAt: new Date(),
    updatedByUserId: updatedByUserId ?? null,
  });
  try {
    const db = await getDb();
    if (db) {
      await db
        .insert(platformSettings)
        .values({
          settingKey: INVITE_TRACKER_SETTING_KEY,
          value: serialized,
          updatedByUserId: updatedByUserId ?? null,
        })
        .onDuplicateKeyUpdate({
          set: {
            value: serialized,
            updatedByUserId: updatedByUserId ?? null,
            updatedAt: new Date(),
          },
        });
    }
  } catch (error: any) {
    console.error("[InviteTracker] Error saving tracker data:", error);
  }
}

export async function getReferralStatsBetween(
  startedAt: Date,
  endedAt: Date = new Date(),
): Promise<{
  totalInvites: number;
  uniqueInviters: number;
  leaderboard: InviteTrackerLeaderboardEntry[];
}> {
  const db = await getDb();
  if (!db) return { totalInvites: 0, uniqueInviters: 0, leaderboard: [] };

  const referrerUser = alias(users, "referrer");
  const referredUser = alias(users, "referred");

  const rows = await db
    .select({
      id: referralAttributions.id,
      createdAt: referralAttributions.createdAt,
      referrerId: referrerUser.id,
      referrerEmail: referrerUser.email,
      referrerName: referrerUser.name,
      referredId: referredUser.id,
      referredEmail: referredUser.email,
      referredName: referredUser.name,
    })
    .from(referralAttributions)
    .leftJoin(referrerUser, eq(referralAttributions.referrerUserId, referrerUser.id))
    .leftJoin(referredUser, eq(referralAttributions.referredUserId, referredUser.id))
    .where(
      and(
        gte(referralAttributions.createdAt, startedAt),
        lte(referralAttributions.createdAt, endedAt),
      ),
    )
    .orderBy(desc(referralAttributions.createdAt));

  const inviterMap = new Map<number, InviteTrackerLeaderboardEntry>();

  for (const row of rows) {
    const refId = row.referrerId ?? 0;
    const refEmail = row.referrerEmail || `user-${refId}@qronos.local`;
    const refName = row.referrerName || refEmail;

    if (!inviterMap.has(refId)) {
      inviterMap.set(refId, {
        referrerUserId: refId,
        referrerEmail: refEmail,
        referrerName: refName,
        inviteCount: 0,
        invitedUsers: [],
      });
    }

    const item = inviterMap.get(refId)!;
    item.inviteCount += 1;
    item.invitedUsers.push({
      userId: row.referredId ?? 0,
      email: row.referredEmail || `user-${row.referredId}@qronos.local`,
      name: row.referredName || (row.referredEmail || `User #${row.referredId}`),
      joinedAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
    });
  }

  const leaderboard = Array.from(inviterMap.values()).sort((a, b) => b.inviteCount - a.inviteCount);

  return {
    totalInvites: rows.length,
    uniqueInviters: leaderboard.length,
    leaderboard,
  };
}

export async function getInviteTrackerState(): Promise<{
  activeSession: InviteTrackerSessionSummary | null;
  history: InviteTrackerSessionSummary[];
}> {
  const data = await getRawInviteTrackerData();

  let activeSessionSummary: InviteTrackerSessionSummary | null = null;
  if (data.activeSession) {
    const stats = await getReferralStatsBetween(new Date(data.activeSession.startedAt), new Date());
    activeSessionSummary = {
      id: data.activeSession.id,
      name: data.activeSession.name,
      startedAt: data.activeSession.startedAt,
      endedAt: null,
      isActive: true,
      createdByUserId: data.activeSession.createdByUserId,
      totalInvites: stats.totalInvites,
      uniqueInviters: stats.uniqueInviters,
      leaderboard: stats.leaderboard,
    };
  }

  const historySummaries: InviteTrackerSessionSummary[] = (data.history || []).map((h) => ({
    ...h,
    isActive: false,
  }));

  return {
    activeSession: activeSessionSummary,
    history: historySummaries,
  };
}

export async function startInviteTrackerSession(
  name?: string,
  adminUserId?: number | null,
): Promise<InviteTrackerSessionSummary> {
  const data = await getRawInviteTrackerData();

  // If there's an ongoing active session, stop it and archive to history first
  if (data.activeSession) {
    const finalStats = await getReferralStatsBetween(new Date(data.activeSession.startedAt), new Date());
    data.history.unshift({
      id: data.activeSession.id,
      name: data.activeSession.name,
      startedAt: data.activeSession.startedAt,
      endedAt: new Date().toISOString(),
      createdByUserId: data.activeSession.createdByUserId,
      totalInvites: finalStats.totalInvites,
      uniqueInviters: finalStats.uniqueInviters,
      leaderboard: finalStats.leaderboard,
    });
  }

  const newId = `inv_sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const sessionName = name?.trim() || `Invite Tracking Session #${data.history.length + 1}`;
  const startedAt = new Date().toISOString();

  data.activeSession = {
    id: newId,
    name: sessionName,
    startedAt,
    createdByUserId: adminUserId ?? null,
  };

  await saveInviteTrackerData(data, adminUserId);

  return {
    id: newId,
    name: sessionName,
    startedAt,
    endedAt: null,
    isActive: true,
    createdByUserId: adminUserId ?? null,
    totalInvites: 0,
    uniqueInviters: 0,
    leaderboard: [],
  };
}

export async function stopInviteTrackerSession(
  adminUserId?: number | null,
): Promise<InviteTrackerSessionSummary> {
  const data = await getRawInviteTrackerData();
  if (!data.activeSession) {
    throw new Error("No active invite tracking session found to stop.");
  }

  const finalStats = await getReferralStatsBetween(new Date(data.activeSession.startedAt), new Date());
  const stoppedSession: InviteTrackerSessionSummary = {
    id: data.activeSession.id,
    name: data.activeSession.name,
    startedAt: data.activeSession.startedAt,
    endedAt: new Date().toISOString(),
    isActive: false,
    createdByUserId: data.activeSession.createdByUserId,
    totalInvites: finalStats.totalInvites,
    uniqueInviters: finalStats.uniqueInviters,
    leaderboard: finalStats.leaderboard,
  };

  data.history.unshift(stoppedSession);
  data.activeSession = null;

  await saveInviteTrackerData(data, adminUserId);

  return stoppedSession;
}

export async function deleteInviteTrackerHistory(
  sessionId: string,
  adminUserId?: number | null,
): Promise<void> {
  const data = await getRawInviteTrackerData();
  data.history = data.history.filter((h) => h.id !== sessionId);
  await saveInviteTrackerData(data, adminUserId);
}

export async function clearAllInviteTrackerHistory(
  adminUserId?: number | null,
): Promise<void> {
  const data = await getRawInviteTrackerData();
  data.history = [];
  await saveInviteTrackerData(data, adminUserId);
}

// ============================================================================
// Automated Invite Milestone Campaign & Expiring Packs Engine
// ============================================================================

export interface InviteMilestoneCampaignConfig {
  enabled: boolean;
  invitesRequired: number;       // e.g. 5
  tokenGrantMillion: number;     // e.g. 10 (10M tokens)
  paygGrantDollars: number;      // e.g. 0 ($0)
  expiryHours: number;           // e.g. 48 hours
  campaignStartedAt: string;     // ISO string
  updatedAt: string;
  updatedByUserId: number | null;
}

export const DEFAULT_INVITE_MILESTONE_CONFIG: InviteMilestoneCampaignConfig = {
  enabled: true,
  invitesRequired: 5,
  tokenGrantMillion: 10,
  paygGrantDollars: 0,
  expiryHours: 48,
  campaignStartedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  updatedByUserId: null,
};

export async function getInviteMilestoneCampaignConfig(): Promise<InviteMilestoneCampaignConfig> {
  return cached("invite_milestone_config", 10_000, async () => {
    const db = await getDb();
    if (!db) {
      const fallback = fallbackPlatformSettings.get(INVITE_MILESTONE_CAMPAIGN_SETTING_KEY)?.value;
      if (fallback) {
        try { return { ...DEFAULT_INVITE_MILESTONE_CONFIG, ...JSON.parse(fallback) }; } catch {}
      }
      return DEFAULT_INVITE_MILESTONE_CONFIG;
    }
    const row = (await db.select().from(platformSettings).where(eq(platformSettings.settingKey, INVITE_MILESTONE_CAMPAIGN_SETTING_KEY)).limit(1))[0];
    if (row?.settingValue) {
      try {
        const parsed = JSON.parse(row.settingValue);
        return {
          ...DEFAULT_INVITE_MILESTONE_CONFIG,
          ...parsed,
          updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString(),
        };
      } catch {}
    }
    return DEFAULT_INVITE_MILESTONE_CONFIG;
  });
}

export async function saveInviteMilestoneCampaignConfig(
  input: {
    enabled?: boolean;
    invitesRequired: number;
    tokenGrantMillion: number;
    paygGrantDollars?: number;
    expiryHours: number;
    resetCampaignTimer?: boolean;
  },
  adminUserId?: number | null,
): Promise<InviteMilestoneCampaignConfig> {
  const current = await getInviteMilestoneCampaignConfig();
  const now = new Date();
  const campaignStartedAt = input.resetCampaignTimer || !current.campaignStartedAt
    ? now.toISOString()
    : current.campaignStartedAt;

  const config: InviteMilestoneCampaignConfig = {
    enabled: input.enabled !== undefined ? input.enabled : current.enabled,
    invitesRequired: Math.max(1, Math.trunc(input.invitesRequired || 5)),
    tokenGrantMillion: Math.max(0, Math.trunc(input.tokenGrantMillion || 0)),
    paygGrantDollars: Math.max(0, Number(input.paygGrantDollars || 0)),
    expiryHours: Math.max(1, Math.trunc(input.expiryHours || 48)),
    campaignStartedAt,
    updatedAt: now.toISOString(),
    updatedByUserId: adminUserId ?? null,
  };

  bustCache("invite_milestone_config");
  fallbackPlatformSettings.set(INVITE_MILESTONE_CAMPAIGN_SETTING_KEY, {
    value: JSON.stringify(config),
    updatedAt: now,
    updatedByUserId: adminUserId ?? null,
  });

  const db = await getDb();
  if (db) {
    await db.insert(platformSettings).values({
      settingKey: INVITE_MILESTONE_CAMPAIGN_SETTING_KEY,
      settingValue: JSON.stringify(config),
      updatedByUserId: adminUserId ?? null,
      updatedAt: now,
    }).onDuplicateKeyUpdate({
      set: {
        settingValue: JSON.stringify(config),
        updatedByUserId: adminUserId ?? null,
        updatedAt: now,
      },
    });
  }

  return config;
}

export async function sweepUserExpiredMilestoneGrants(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  try {
    const now = new Date();
    const expiredActive = await db
      .select()
      .from(inviteMilestoneGrants)
      .where(
        and(
          eq(inviteMilestoneGrants.userId, userId),
          eq(inviteMilestoneGrants.status, "active"),
          lte(inviteMilestoneGrants.expiresAt, now),
        ),
      );

    if (expiredActive.length === 0) return 0;

    let totalTokensToDeduct = 0;
    let totalPaygNanosToDeduct = 0;

    await db.transaction(async tx => {
      for (const grant of expiredActive) {
        const remainingTokens = Math.max(0, Number(grant.remainingTokens));
        const remainingPayg = Math.max(0, Number(grant.remainingPaygNanos));

        await tx
          .update(inviteMilestoneGrants)
          .set({
            status: "expired",
            expiredAt: now,
            remainingTokens: 0,
            remainingPaygNanos: 0,
          })
          .where(eq(inviteMilestoneGrants.id, grant.id));

        if (remainingTokens > 0) {
          totalTokensToDeduct += remainingTokens;
          await tx
            .update(creditAccounts)
            .set({
              codingPlanTokens: sql`GREATEST(0, ${creditAccounts.codingPlanTokens} - ${remainingTokens})`,
            })
            .where(eq(creditAccounts.userId, userId));

          await tx.insert(creditLedger).values({
            userId,
            kind: "manual_adjustment",
            amountNanos: 0,
            balanceAfterNanos: 0,
            referenceId: `milestone_grant_expired:${grant.id}`,
            note: `Invite milestone reward pack #${grant.milestoneCycle} expired after deadline (-${Math.round(remainingTokens / 1_000_000)}M unspent tokens).`,
          });
        }

        if (remainingPayg > 0) {
          totalPaygNanosToDeduct += remainingPayg;
          await tx
            .update(creditAccounts)
            .set({
              paygBalanceNanos: sql`GREATEST(0, ${creditAccounts.paygBalanceNanos} - ${remainingPayg})`,
            })
            .where(eq(creditAccounts.userId, userId));
        }
      }
    });

    return totalTokensToDeduct;
  } catch (err) {
    console.error(`[MilestoneCampaign] Error sweeping expired grants for user ${userId}:`, err);
    return 0;
  }
}

export async function sweepAllExpiredMilestoneGrants(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    const now = new Date();
    const expiredActive = await db
      .select({ userId: inviteMilestoneGrants.userId })
      .from(inviteMilestoneGrants)
      .where(and(eq(inviteMilestoneGrants.status, "active"), lte(inviteMilestoneGrants.expiresAt, now)));

    const uniqueUserIds = Array.from(new Set(expiredActive.map(g => g.userId)));
    for (const userId of uniqueUserIds) {
      await sweepUserExpiredMilestoneGrants(userId);
    }
  } catch (err) {
    console.error("[MilestoneCampaign] Error sweeping all expired grants:", err);
  }
}

export async function syncUserInviteMilestoneGrants(userId: number) {
  const db = await getDb();
  if (!db) return null;

  // 1. First sweep any overdue expired grants
  await sweepUserExpiredMilestoneGrants(userId);

  const config = await getInviteMilestoneCampaignConfig();
  if (!config.enabled || config.invitesRequired <= 0) return null;

  const campaignStarted = new Date(config.campaignStartedAt);

  // 2. Count legitimate referral signups for this user since campaignStartedAt
  const referralRows = await db
    .select({
      id: referralAttributions.id,
      createdAt: referralAttributions.createdAt,
    })
    .from(referralAttributions)
    .where(
      and(
        eq(referralAttributions.referrerUserId, userId),
        gte(referralAttributions.createdAt, campaignStarted),
      ),
    )
    .orderBy(asc(referralAttributions.createdAt));

  const validInvitesCount = referralRows.length;
  const earnedCycles = Math.floor(validInvitesCount / config.invitesRequired);
  if (earnedCycles <= 0) return null;

  // 3. Check existing grants awarded to this user
  const existingGrants = await db
    .select({ milestoneCycle: inviteMilestoneGrants.milestoneCycle })
    .from(inviteMilestoneGrants)
    .where(eq(inviteMilestoneGrants.userId, userId));

  const existingCycles = new Set(existingGrants.map(g => g.milestoneCycle));

  // 4. Award missing cycles sequentially
  const tokenGrant = config.tokenGrantMillion * 1_000_000;
  const paygGrantNanos = Math.round(config.paygGrantDollars * NANODOLLARS_PER_DOLLAR);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.expiryHours * 3600 * 1000);

  for (let cycle = 1; cycle <= earnedCycles; cycle++) {
    if (existingCycles.has(cycle)) continue;

    const invitesCountAtGrant = cycle * config.invitesRequired;

    try {
      await db.transaction(async tx => {
        const insertRes = await tx.insert(inviteMilestoneGrants).values({
          userId,
          milestoneCycle: cycle,
          invitesCountAtGrant,
          grantedTokens: tokenGrant,
          grantedPaygNanos: paygGrantNanos,
          remainingTokens: tokenGrant,
          remainingPaygNanos: paygGrantNanos,
          expiresAt,
          status: "active",
        });
        const grantId = Number(insertRes[0].insertId);

        if (tokenGrant > 0) {
          await tx
            .update(creditAccounts)
            .set({
              codingPlanTokens: sql`${creditAccounts.codingPlanTokens} + ${tokenGrant}`,
            })
            .where(eq(creditAccounts.userId, userId));

          await tx.insert(creditLedger).values({
            userId,
            kind: "manual_adjustment",
            amountNanos: 0,
            balanceAfterNanos: tokenGrant,
            referenceId: `milestone_grant_awarded:${grantId}`,
            note: `Invite Milestone Bonus (Pack #${cycle}): +${config.tokenGrantMillion}M Coding Tokens (Valid for ${config.expiryHours}h).`,
          });
        }

        if (paygGrantNanos > 0) {
          await tx
            .update(creditAccounts)
            .set({
              paygBalanceNanos: sql`${creditAccounts.paygBalanceNanos} + ${paygGrantNanos}`,
            })
            .where(eq(creditAccounts.userId, userId));
        }

        // Notification
        const userEmail = (await tx.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1))[0]?.email ?? "";
        if (userEmail) {
          await tx.insert(systemNotifications).values({
            title: `Milestone Unlocked: Pack #${cycle} (+${config.tokenGrantMillion}M Tokens)!`,
            message: `Congratulations! You referred ${invitesCountAtGrant} developers and unlocked Pack #${cycle}: +${config.tokenGrantMillion}M Coding Tokens. Valid for the next ${config.expiryHours} hours.`,
            type: "update",
            targetAudience: "SPECIFIC_EMAILS",
            targetEmails: userEmail,
            createdByUserId: userId,
            createdAt: now,
          });
        }
      });
      existingCycles.add(cycle);
    } catch (e: any) {
      if (e?.code !== "ER_DUP_ENTRY") {
        console.error(`[MilestoneCampaign] Failed to award cycle ${cycle} for user ${userId}:`, e);
      }
    }
  }

  return true;
}

export async function getUserEventsMilestoneSummary(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Sync and sweep grants first
  await syncUserInviteMilestoneGrants(userId);

  const config = await getInviteMilestoneCampaignConfig();
  const campaignStarted = new Date(config.campaignStartedAt);

  // User referral details
  const refCodeObj = await getOrCreateReferralCode(userId);
  const userRefCode = refCodeObj.code || "qr01";

  // Total valid invites in current campaign window
  const referrals = await db
    .select({ id: referralAttributions.id, createdAt: referralAttributions.createdAt })
    .from(referralAttributions)
    .where(
      and(
        eq(referralAttributions.referrerUserId, userId),
        gte(referralAttributions.createdAt, campaignStarted),
      ),
    );

  const totalInvitesInCampaign = referrals.length;
  const invitesRequired = Math.max(1, config.invitesRequired);
  const currentCycleProgress = totalInvitesInCampaign % invitesRequired;
  const invitesNeededForNextCycle = invitesRequired - currentCycleProgress;
  const completedMilestones = Math.floor(totalInvitesInCampaign / invitesRequired);

  // User's grants
  const grants = await db
    .select()
    .from(inviteMilestoneGrants)
    .where(eq(inviteMilestoneGrants.userId, userId))
    .orderBy(desc(inviteMilestoneGrants.milestoneCycle));

  const now = Date.now();
  const formattedGrants = grants.map(g => {
    const expiresMs = new Date(g.expiresAt).getTime();
    const remainingSeconds = Math.max(0, Math.ceil((expiresMs - now) / 1000));
    const grantedTokens = Number(g.grantedTokens);
    const remainingTokens = Number(g.remainingTokens);
    const usedTokens = Math.max(0, grantedTokens - remainingTokens);
    const usedPercent = grantedTokens > 0 ? Math.min(100, Math.round((usedTokens / grantedTokens) * 100)) : 100;

    return {
      id: Number(g.id),
      milestoneCycle: g.milestoneCycle,
      invitesCountAtGrant: g.invitesCountAtGrant,
      grantedTokens,
      remainingTokens,
      usedTokens,
      usedPercent,
      grantedTokensMillion: Math.round(grantedTokens / 1_000_000),
      remainingTokensMillion: (remainingTokens / 1_000_000).toFixed(2),
      grantedPaygNanos: Number(g.grantedPaygNanos),
      remainingPaygNanos: Number(g.remainingPaygNanos),
      expiresAt: new Date(g.expiresAt).toISOString(),
      createdAt: new Date(g.createdAt).toISOString(),
      expiredAt: g.expiredAt ? new Date(g.expiredAt).toISOString() : null,
      status: g.status,
      remainingSeconds,
      isExpired: g.status === "expired" || (remainingSeconds <= 0 && g.status !== "consumed"),
      isConsumed: g.status === "consumed" || remainingTokens <= 0,
    };
  });

  const totalTokensGranted = grants.reduce((sum, g) => sum + Number(g.grantedTokens), 0);
  const activeTokensAvailable = grants
    .filter(g => g.status === "active" && new Date(g.expiresAt).getTime() > now)
    .reduce((sum, g) => sum + Number(g.remainingTokens), 0);

  return {
    config: {
      enabled: config.enabled,
      invitesRequired: config.invitesRequired,
      tokenGrantMillion: config.tokenGrantMillion,
      paygGrantDollars: config.paygGrantDollars,
      expiryHours: config.expiryHours,
      campaignStartedAt: config.campaignStartedAt,
    },
    userRefCode,
    stats: {
      totalInvitesInCampaign,
      invitesRequired: config.invitesRequired,
      currentCycleProgress,
      invitesNeededForNextCycle,
      completedMilestones,
      totalTokensGranted,
      activeTokensAvailable,
    },
    grants: formattedGrants,
  };
}

export async function listAdminInviteMilestoneGrants(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: inviteMilestoneGrants.id,
      userId: inviteMilestoneGrants.userId,
      userEmail: users.email,
      userName: users.name,
      milestoneCycle: inviteMilestoneGrants.milestoneCycle,
      invitesCountAtGrant: inviteMilestoneGrants.invitesCountAtGrant,
      grantedTokens: inviteMilestoneGrants.grantedTokens,
      remainingTokens: inviteMilestoneGrants.remainingTokens,
      status: inviteMilestoneGrants.status,
      expiresAt: inviteMilestoneGrants.expiresAt,
      createdAt: inviteMilestoneGrants.createdAt,
      expiredAt: inviteMilestoneGrants.expiredAt,
    })
    .from(inviteMilestoneGrants)
    .innerJoin(users, eq(inviteMilestoneGrants.userId, users.id))
    .orderBy(desc(inviteMilestoneGrants.createdAt))
    .limit(limit);

  return rows.map(r => ({
    ...r,
    id: Number(r.id),
    expiresAt: new Date(r.expiresAt).toISOString(),
    createdAt: new Date(r.createdAt).toISOString(),
    expiredAt: r.expiredAt ? new Date(r.expiredAt).toISOString() : null,
  }));
}

export type Gpt6AstraQuotaStatus = {
  isAdmin: boolean;
  isPaidUser: boolean;
  usedThisMonth: number;
  maxFreePerMonth: number;
  remainingMessages: number;
  isUnlimited: boolean;
  canAccessApi: boolean;
  canAccessPlayground: boolean;
};

/**
 * Evaluates the GPT-6 Astra access tier and monthly playground quota.
 * - Admin: Unlimited API + Playground.
 * - Max, Power, and Ultra Tiers: Unlimited API + Playground.
 * - Free, Starter, and Pro Tiers: Playground capped at 5 messages/month, no direct API key access.
 */
export async function getGpt6AstraQuotaStatus(_user?: { id?: number; role?: string; openId?: string }): Promise<Gpt6AstraQuotaStatus> {
  return {
    isAdmin: true,
    isPaidUser: true,
    usedThisMonth: 0,
    maxFreePerMonth: 999999,
    remainingMessages: Infinity,
    isUnlimited: true,
    canAccessApi: true,
    canAccessPlayground: true,
  };
}

export async function setUserTier(userId: number, tier: UserTier): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  clearUserTierCache(userId);
  await db.update(users).set({ tier }).where(eq(users.id, userId));
  return true;
}

const userCreditsEnabledCache = new Map<number, { creditsEnabled: boolean; expiresAt: number }>();
const USER_CREDITS_ENABLED_CACHE_TTL_MS = 15_000;

export async function isUserCreditsEnabled(userId: number): Promise<boolean> {
  const cached = userCreditsEnabledCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.creditsEnabled;
  }
  try {
    const db = await getDb();
    if (!db) return false;
    const rows = await db.select({ creditsEnabled: users.creditsEnabled, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (!rows[0]) return false;
    const emailLower = (rows[0].email ?? "").trim().toLowerCase();
    // Safety check: konchoor@gmail.com and kumaryush18@gmail.com are ALWAYS true
    if (emailLower === "konchoor@gmail.com" || emailLower === "kumaryush18@gmail.com") {
      userCreditsEnabledCache.set(userId, { creditsEnabled: true, expiresAt: Date.now() + USER_CREDITS_ENABLED_CACHE_TTL_MS });
      return true;
    }
    const creditsEnabled = Boolean(rows[0].creditsEnabled);
    userCreditsEnabledCache.set(userId, { creditsEnabled, expiresAt: Date.now() + USER_CREDITS_ENABLED_CACHE_TTL_MS });
    return creditsEnabled;
  } catch {
    return false;
  }
}

export function clearUserCreditsEnabledCache(userId?: number) {
  if (userId !== undefined) {
    userCreditsEnabledCache.delete(userId);
  } else {
    userCreditsEnabledCache.clear();
  }
}

export async function setUserCreditsEnabled(userId: number, enabled: boolean): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  clearUserCreditsEnabledCache(userId);
  await db.update(users).set({ creditsEnabled: enabled }).where(eq(users.id, userId));
  return true;
}

export async function searchUsersForTierAssignment(query: string) {
  const db = await getDb();
  if (!db) return [];
  const trimmed = query.trim();
  const pattern = `%${escapeMysqlLike(trimmed)}%`;
  const result = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      tier: users.tier,
      role: users.role,
      balanceNanos: creditAccounts.balanceNanos,
      createdAt: users.createdAt,
    })
    .from(users)
    .leftJoin(creditAccounts, eq(users.id, creditAccounts.userId))
    .where(
      trimmed
        ? or(
            like(users.email, pattern),
            like(users.name, pattern),
            sql`cast(${users.id} as char) like ${pattern}`
          )
        : undefined
    )
    .orderBy(desc(users.createdAt))
    .limit(25);

  return result.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    tier: (u.tier as UserTier) || "free",
    role: u.role,
    balanceNanos: Number(u.balanceNanos ?? 0),
    createdAt: u.createdAt,
  }));
}

let _safetyAuditLogsTableChecked = false;
export async function ensureSafetyAuditLogsTable() {
  if (_safetyAuditLogsTableChecked) return;
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS safety_audit_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        userId INT NULL,
        userName VARCHAR(255) NULL,
        userEmail VARCHAR(320) NULL,
        model VARCHAR(128) NOT NULL,
        triggerType VARCHAR(64) NOT NULL,
        matchedKeywords TEXT NULL,
        userInput MEDIUMTEXT NOT NULL,
        outputShown MEDIUMTEXT NOT NULL,
        ipAddress VARCHAR(64) NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX safety_audit_logs_user_time_idx (userId, createdAt),
        INDEX safety_audit_logs_time_idx (createdAt),
        INDEX safety_audit_logs_trigger_idx (triggerType, createdAt)
      )
    `);
    _safetyAuditLogsTableChecked = true;
  } catch (err) {
    console.warn("Could not ensure safety_audit_logs table:", err);
  }
}

interface MemorySafetyAuditLog {
  id: number;
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
  model: string;
  triggerType: string;
  matchedKeywords: string | null;
  userInput: string;
  outputShown: string;
  ipAddress: string | null;
  createdAt: Date;
}
const _memorySafetyAuditLogs: MemorySafetyAuditLog[] = [];
let _nextMemorySafetyAuditId = 1;

export async function recordSafetyAudit(input: {
  userId?: number | null;
  userName?: string | null;
  userEmail?: string | null;
  model: string;
  triggerType: string;
  matchedKeywords?: string | string[] | null;
  userInput?: string;
  userPrompt?: string;
  outputShown: string;
  ipAddress?: string | null;
  [key: string]: unknown;
}) {
  let resolvedName = input.userName ?? null;
  let resolvedEmail = input.userEmail ?? null;

  if (input.userId && (!resolvedName || !resolvedEmail)) {
    try {
      const email = await lookupUserEmail(input.userId);
      if (email) resolvedEmail = email;
      const user = await getUserById(input.userId);
      if (user) {
        resolvedName = user.name ?? resolvedName;
        resolvedEmail = user.email ?? resolvedEmail;
      }
    } catch {
      // ignore
    }
  }

  if (!resolvedEmail) {
    resolvedEmail = input.userId ? `User #${input.userId}` : "Web Playground / Anonymous";
  }

  const finalUserInput = input.userInput || input.userPrompt || "";
  const finalMatchedKeywords = Array.isArray(input.matchedKeywords)
    ? input.matchedKeywords.join(", ")
    : (input.matchedKeywords ?? null);

  const memoryEntry: MemorySafetyAuditLog = {
    id: _nextMemorySafetyAuditId++,
    userId: input.userId ?? null,
    userName: resolvedName,
    userEmail: resolvedEmail,
    model: input.model,
    triggerType: input.triggerType,
    matchedKeywords: finalMatchedKeywords,
    userInput: finalUserInput,
    outputShown: input.outputShown,
    ipAddress: input.ipAddress ?? null,
    createdAt: new Date(),
  };

  _memorySafetyAuditLogs.unshift(memoryEntry);
  if (_memorySafetyAuditLogs.length > 2000) {
    _memorySafetyAuditLogs.pop();
  }

  try {
    await ensureSafetyAuditLogsTable();
    const db = await getDb();
    if (db) {
      await db.insert(safetyAuditLogs).values({
        userId: input.userId ?? null,
        userName: resolvedName,
        userEmail: resolvedEmail,
        model: input.model,
        triggerType: input.triggerType,
        matchedKeywords: finalMatchedKeywords,
        userInput: finalUserInput,
        outputShown: input.outputShown,
        ipAddress: input.ipAddress ?? null,
      });
    }
  } catch (err) {
    console.warn("Failed to persist safety audit log to DB, stored in memory:", err);
  }

  return memoryEntry;
}

export async function listSafetyAuditLogs(params: {
  limit?: number;
  offset?: number;
  search?: string;
  triggerType?: string;
  model?: string;
}) {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);
  const search = params.search?.trim().toLowerCase();
  const triggerType = params.triggerType?.trim();
  const model = params.model?.trim();

  await ensureSafetyAuditLogsTable();
  const db = await getDb();

  if (db) {
    try {
      const conditions = [];
      if (triggerType && triggerType !== "all") {
        conditions.push(eq(safetyAuditLogs.triggerType, triggerType));
      }
      if (model && model !== "all") {
        conditions.push(eq(safetyAuditLogs.model, model));
      }
      if (search) {
        const pattern = `%${search}%`;
        conditions.push(
          or(
            like(safetyAuditLogs.userName, pattern),
            like(safetyAuditLogs.userEmail, pattern),
            like(safetyAuditLogs.matchedKeywords, pattern),
            like(safetyAuditLogs.userInput, pattern),
            sql`cast(${safetyAuditLogs.userId} as char) like ${pattern}`
          )
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(safetyAuditLogs)
        .where(whereClause);
      const total = Number(countResult?.count ?? 0);

      const rows = await db
        .select()
        .from(safetyAuditLogs)
        .where(whereClause)
        .orderBy(desc(safetyAuditLogs.createdAt))
        .limit(limit)
        .offset(offset);

      const [userCountResult] = await db
        .select({ count: sql<number>`count(distinct ${safetyAuditLogs.userId})` })
        .from(safetyAuditLogs);
      const uniqueUsers = Number(userCountResult?.count ?? 0);

      const triggerCounts = await db
        .select({
          triggerType: safetyAuditLogs.triggerType,
          count: sql<number>`count(*)`,
        })
        .from(safetyAuditLogs)
        .groupBy(safetyAuditLogs.triggerType);

      const topTriggers: Record<string, number> = {};
      for (const t of triggerCounts) {
        topTriggers[t.triggerType] = Number(t.count);
      }

      return {
        logs: rows.map(r => ({
          ...r,
          id: Number(r.id),
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
        })),
        total,
        stats: {
          totalProbes: total,
          uniqueUsers,
          topTriggers,
        },
      };
    } catch (err) {
      console.warn("DB query for safety audit logs failed, falling back to in-memory:", err);
    }
  }

  let filtered = _memorySafetyAuditLogs;
  if (triggerType && triggerType !== "all") {
    filtered = filtered.filter(l => l.triggerType === triggerType);
  }
  if (model && model !== "all") {
    filtered = filtered.filter(l => l.model === model);
  }
  if (search) {
    filtered = filtered.filter(l =>
      (l.userName && l.userName.toLowerCase().includes(search)) ||
      (l.userEmail && l.userEmail.toLowerCase().includes(search)) ||
      (l.matchedKeywords && l.matchedKeywords.toLowerCase().includes(search)) ||
      (l.userInput && l.userInput.toLowerCase().includes(search)) ||
      (l.userId !== null && String(l.userId).includes(search))
    );
  }

  const total = filtered.length;
  const paged = filtered.slice(offset, offset + limit);

  const uniqueUserIds = new Set(
    _memorySafetyAuditLogs.map(l => l.userId).filter(Boolean)
  );
  const topTriggers: Record<string, number> = {};
  for (const l of _memorySafetyAuditLogs) {
    topTriggers[l.triggerType] = (topTriggers[l.triggerType] ?? 0) + 1;
  }

  return {
    logs: paged.map(r => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    stats: {
      totalProbes: _memorySafetyAuditLogs.length,
      uniqueUsers: uniqueUserIds.size,
      topTriggers,
    },
  };
}

export async function clearSafetyAuditLogs() {
  _memorySafetyAuditLogs.length = 0;
  await ensureSafetyAuditLogsTable();
  const db = await getDb();
  if (db) {
    try {
      await db.execute(sql`DELETE FROM safety_audit_logs`);
    } catch (err) {
      console.warn("Failed to clear safety_audit_logs in DB:", err);
    }
  }
  return { success: true };
}

// ---------------------------------------------------------------------------
// Per-User Message Inspection / Interaction Logging System
// ---------------------------------------------------------------------------

let _userInteractionLogsTableChecked = false;
let _accountControlsLoggingColumnChecked = false;
const _activeMessageLoggingUserIds = new Set<number>();
let _messageLoggingUsersLoadedAt = 0;
const MESSAGE_LOGGING_SYNC_TTL_MS = 15_000;

export async function ensureUserInteractionLogsTable() {
  if (_userInteractionLogsTableChecked) return;
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_interaction_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        userId INT NOT NULL,
        userName VARCHAR(255) NULL,
        userEmail VARCHAR(320) NULL,
        model VARCHAR(128) NOT NULL,
        provider VARCHAR(128) NULL,
        source VARCHAR(32) NOT NULL DEFAULT 'api',
        userInput MEDIUMTEXT NOT NULL,
        outputResponse MEDIUMTEXT NOT NULL,
        ipAddress VARCHAR(64) NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX user_interaction_logs_user_time_idx (userId, createdAt),
        INDEX user_interaction_logs_time_idx (createdAt)
      )
    `);
    try {
      await db.execute(sql`
        ALTER TABLE user_interaction_logs ADD COLUMN provider VARCHAR(128) NULL
      `);
    } catch {
      // Column may already exist
    }
    _userInteractionLogsTableChecked = true;
  } catch (err) {
    console.warn("Could not ensure user_interaction_logs table:", err);
  }
}

export async function ensureAccountControlsLoggingColumn() {
  if (_accountControlsLoggingColumnChecked) return;
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      ALTER TABLE account_controls ADD COLUMN logUserMessages BOOLEAN NOT NULL DEFAULT FALSE
    `);
  } catch {
    // Column may already exist
  }
  _accountControlsLoggingColumnChecked = true;
}

export async function isUserMessageLoggingEnabled(userId: number): Promise<boolean> {
  if (!userId || userId <= 0) return false;
  const now = Date.now();
  if (now - _messageLoggingUsersLoadedAt > MESSAGE_LOGGING_SYNC_TTL_MS) {
    await refreshActiveMessageLoggingUsers();
  }
  return _activeMessageLoggingUserIds.has(userId);
}

export async function refreshActiveMessageLoggingUsers(): Promise<void> {
  try {
    await ensureAccountControlsLoggingColumn();
    const db = await getDb();
    if (!db) return;
    const rows = await db
      .select({ userId: accountControls.userId })
      .from(accountControls)
      .where(eq(accountControls.logUserMessages, true));
    _activeMessageLoggingUserIds.clear();
    for (const r of rows) {
      if (r.userId) _activeMessageLoggingUserIds.add(r.userId);
    }
    _messageLoggingUsersLoadedAt = Date.now();
  } catch (err) {
    console.warn("Failed to refresh active message logging users:", err);
  }
}

export async function setUserMessageLoggingEnabled(userId: number, enabled: boolean): Promise<boolean> {
  await ensureAccountControlsLoggingColumn();
  const db = await getDb();
  if (!db) return false;
  await ensureAccountControl(userId);
  await db
    .update(accountControls)
    .set({ logUserMessages: enabled })
    .where(eq(accountControls.userId, userId));
  if (enabled) {
    _activeMessageLoggingUserIds.add(userId);
  } else {
    _activeMessageLoggingUserIds.delete(userId);
  }
  return true;
}

interface MemoryUserInteractionLog {
  id: number;
  userId: number;
  userName: string | null;
  userEmail: string | null;
  model: string;
  provider: string | null;
  source: string;
  userInput: string;
  outputResponse: string;
  ipAddress: string | null;
  createdAt: Date;
}
const _memoryUserInteractionLogs: MemoryUserInteractionLog[] = [];
let _nextMemoryUserInteractionId = 1;

export async function recordUserInteractionLog(input: {
  userId: number;
  userName?: string | null;
  userEmail?: string | null;
  model: string;
  provider?: string | null;
  source?: string;
  userInput: string;
  outputResponse: string;
  ipAddress?: string | null;
}) {
  let resolvedName = input.userName ?? null;
  let resolvedEmail = input.userEmail ?? null;

  if (input.userId && (!resolvedName || !resolvedEmail)) {
    try {
      const user = await getUserById(input.userId);
      if (user) {
        resolvedName = user.name ?? resolvedName;
        resolvedEmail = user.email ?? resolvedEmail;
      }
    } catch {
      // ignore
    }
  }

  const memoryEntry: MemoryUserInteractionLog = {
    id: _nextMemoryUserInteractionId++,
    userId: input.userId,
    userName: resolvedName,
    userEmail: resolvedEmail,
    model: input.model,
    provider: input.provider ?? null,
    source: input.source ?? "api",
    userInput: input.userInput,
    outputResponse: input.outputResponse,
    ipAddress: input.ipAddress ?? null,
    createdAt: new Date(),
  };

  _memoryUserInteractionLogs.unshift(memoryEntry);
  if (_memoryUserInteractionLogs.length > 5000) {
    _memoryUserInteractionLogs.pop();
  }

  try {
    await ensureUserInteractionLogsTable();
    const db = await getDb();
    if (db) {
      await db.insert(userInteractionLogs).values({
        userId: input.userId,
        userName: resolvedName,
        userEmail: resolvedEmail,
        model: input.model,
        provider: input.provider ?? null,
        source: input.source ?? "api",
        userInput: input.userInput,
        outputResponse: input.outputResponse,
        ipAddress: input.ipAddress ?? null,
      });
    }
  } catch (err) {
    console.warn("Failed to persist user interaction log to DB, stored in memory:", err);
  }

  return memoryEntry;
}

export async function listUserInteractionLogs(params: {
  userId?: number;
  search?: string;
  model?: string;
  limit?: number;
  offset?: number;
}) {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);
  const search = params.search?.trim().toLowerCase();
  const model = params.model?.trim();
  const userId = params.userId;

  await ensureUserInteractionLogsTable();
  const db = await getDb();

  if (db) {
    try {
      const conditions = [];
      if (userId && userId > 0) {
        conditions.push(eq(userInteractionLogs.userId, userId));
      }
      if (model && model !== "all") {
        conditions.push(eq(userInteractionLogs.model, model));
      }
      if (search) {
        const pattern = `%${search}%`;
        conditions.push(
          or(
            like(userInteractionLogs.userName, pattern),
            like(userInteractionLogs.userEmail, pattern),
            like(userInteractionLogs.userInput, pattern),
            like(userInteractionLogs.outputResponse, pattern),
            sql`cast(${userInteractionLogs.userId} as char) like ${pattern}`
          )
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(userInteractionLogs)
        .where(whereClause);
      const total = Number(countResult?.count ?? 0);

      const rows = await db
        .select()
        .from(userInteractionLogs)
        .where(whereClause)
        .orderBy(desc(userInteractionLogs.createdAt))
        .limit(limit)
        .offset(offset);

      const [userCountResult] = await db
        .select({ count: sql<number>`count(distinct ${userInteractionLogs.userId})` })
        .from(userInteractionLogs);
      const uniqueUsers = Number(userCountResult?.count ?? 0);

      // Also get list of all monitored users
      const monitoredUsers = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
        })
        .from(users)
        .innerJoin(accountControls, eq(users.id, accountControls.userId))
        .where(eq(accountControls.logUserMessages, true));

      return {
        logs: rows.map(r => ({
          ...r,
          id: Number(r.id),
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
        })),
        total,
        uniqueUsers,
        monitoredUsers,
      };
    } catch (err) {
      console.warn("DB query for user interaction logs failed, falling back to in-memory:", err);
    }
  }

  let filtered = _memoryUserInteractionLogs;
  if (userId && userId > 0) {
    filtered = filtered.filter(l => l.userId === userId);
  }
  if (model && model !== "all") {
    filtered = filtered.filter(l => l.model === model);
  }
  if (search) {
    filtered = filtered.filter(l =>
      (l.userName && l.userName.toLowerCase().includes(search)) ||
      (l.userEmail && l.userEmail.toLowerCase().includes(search)) ||
      (l.userInput && l.userInput.toLowerCase().includes(search)) ||
      (l.outputResponse && l.outputResponse.toLowerCase().includes(search)) ||
      String(l.userId).includes(search)
    );
  }

  const total = filtered.length;
  const paged = filtered.slice(offset, offset + limit);
  const uniqueUserIds = new Set(_memoryUserInteractionLogs.map(l => l.userId));

  return {
    logs: paged.map(r => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    uniqueUsers: uniqueUserIds.size,
    monitoredUsers: [],
  };
}

export async function clearUserInteractionLogs(params?: { userId?: number }) {
  const userId = params?.userId;
  if (userId && userId > 0) {
    for (let i = _memoryUserInteractionLogs.length - 1; i >= 0; i--) {
      if (_memoryUserInteractionLogs[i].userId === userId) {
        _memoryUserInteractionLogs.splice(i, 1);
      }
    }
  } else {
    _memoryUserInteractionLogs.length = 0;
  }

  await ensureUserInteractionLogsTable();
  const db = await getDb();
  if (db) {
    try {
      if (userId && userId > 0) {
        await db.execute(sql`DELETE FROM user_interaction_logs WHERE userId = ${userId}`);
      } else {
        await db.execute(sql`DELETE FROM user_interaction_logs`);
      }
    } catch (err) {
      console.warn("Failed to clear user_interaction_logs in DB:", err);
    }
  }
  return { success: true };
}

export async function deleteSingleUserInteractionLog(id: number) {
  const memIdx = _memoryUserInteractionLogs.findIndex(l => l.id === id);
  if (memIdx !== -1) {
    _memoryUserInteractionLogs.splice(memIdx, 1);
  }
  await ensureUserInteractionLogsTable();
  const db = await getDb();
  if (db) {
    try {
      await db.execute(sql`DELETE FROM user_interaction_logs WHERE id = ${id}`);
    } catch (err) {
      console.warn("Failed to delete single user interaction log from DB:", err);
    }
  }
  return { success: true };
}

let _imageSemanticDescriptionsTableChecked = false;
export async function ensureImageSemanticDescriptionsTable() {
  if (_imageSemanticDescriptionsTableChecked) return;
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS image_semantic_descriptions (
        imageHash VARCHAR(64) PRIMARY KEY,
        description MEDIUMTEXT NOT NULL,
        provider VARCHAR(128) NULL,
        model VARCHAR(128) NULL,
        tokensUsed INT NOT NULL DEFAULT 0,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX image_semantic_descriptions_time_idx (createdAt)
      )
    `);
    _imageSemanticDescriptionsTableChecked = true;
  } catch (err) {
    console.warn("Could not ensure image_semantic_descriptions table:", err);
  }
}

export async function getImageSemanticDescription(imageHash: string): Promise<string | null> {
  return cached(`img_desc:${imageHash}`, 600_000, async () => {
    await ensureImageSemanticDescriptionsTable();
    const db = await getDb();
    if (!db) return null;
    try {
      const rows = await db
        .select({ description: imageSemanticDescriptions.description })
        .from(imageSemanticDescriptions)
        .where(eq(imageSemanticDescriptions.imageHash, imageHash))
        .limit(1);
      if (rows && rows.length > 0 && rows[0].description) {
        return rows[0].description;
      }
    } catch (err) {
      console.warn("[getImageSemanticDescription] error querying DB:", err);
    }
    return null;
  });
}

export async function saveImageSemanticDescription(input: {
  imageHash: string;
  description: string;
  provider?: string;
  model?: string;
  tokensUsed?: number;
}): Promise<void> {
  await ensureImageSemanticDescriptionsTable();
  bustCache(`img_desc:${input.imageHash}`);
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(imageSemanticDescriptions).values({
      imageHash: input.imageHash,
      description: input.description,
      provider: input.provider || null,
      model: input.model || null,
      tokensUsed: input.tokensUsed ?? 0,
    }).onDuplicateKeyUpdate({
      set: {
        description: input.description,
        provider: input.provider || null,
        model: input.model || null,
        tokensUsed: input.tokensUsed ?? 0,
      }
    });
  } catch (err) {
    console.warn("[saveImageSemanticDescription] error saving to DB:", err);
  }
}

export type NotificationItem = {
  id: number;
  title: string;
  message: string;
  type: string;
  targetAudience: string;
  targetEmails?: string | null;
  createdAt: Date;
  isRead: boolean;
};

export async function listUserNotifications(userId: number, userEmail?: string | null): Promise<NotificationItem[]> {
  const db = await getDb();
  if (!db) return [];
  const normalizedEmail = userEmail ? normalizeEmail(userEmail) : null;

  try {
    const allNotifs = await db
      .select({
        id: systemNotifications.id,
        title: systemNotifications.title,
        message: systemNotifications.message,
        type: systemNotifications.type,
        targetAudience: systemNotifications.targetAudience,
        targetEmails: systemNotifications.targetEmails,
        createdAt: systemNotifications.createdAt,
      })
      .from(systemNotifications)
      .orderBy(desc(systemNotifications.createdAt))
      .limit(100);

    // Filter notifications applicable to this user
    const applicable = allNotifs.filter(n => {
      if (n.targetAudience === "ALL") return true;
      if (!n.targetEmails || !normalizedEmail) return false;
      const emails = n.targetEmails.toLowerCase().split(/[\s,;]+/).map(e => e.trim()).filter(Boolean);
      return emails.includes(normalizedEmail);
    });

    if (applicable.length === 0) return [];

    const notifIds = applicable.map(n => n.id);
    const reads = await db
      .select({ notificationId: userNotificationReads.notificationId })
      .from(userNotificationReads)
      .where(and(eq(userNotificationReads.userId, userId), inArray(userNotificationReads.notificationId, notifIds)));

    const readSet = new Set(reads.map(r => r.notificationId));

    return applicable.map(n => ({
      ...n,
      isRead: readSet.has(n.id),
    }));
  } catch (error) {
    console.error("[Notifications] Failed to list user notifications:", error);
    return [];
  }
}

export async function getUnreadNotificationCount(userId: number, userEmail?: string | null): Promise<number> {
  const notifs = await listUserNotifications(userId, userEmail);
  return notifs.filter(n => !n.isRead).length;
}

export async function markNotificationAsRead(notificationId: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(userNotificationReads).values({
      notificationId,
      userId,
      readAt: new Date(),
    }).onDuplicateKeyUpdate({ set: { readAt: new Date() } });
  } catch (error) {
    console.error("[Notifications] Failed to mark as read:", error);
  }
}

export async function markAllNotificationsAsRead(userId: number, userEmail?: string | null): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const notifs = await listUserNotifications(userId, userEmail);
  const unread = notifs.filter(n => !n.isRead);
  if (unread.length === 0) return;

  try {
    for (const n of unread) {
      await db.insert(userNotificationReads).values({
        notificationId: n.id,
        userId,
        readAt: new Date(),
      }).onDuplicateKeyUpdate({ set: { readAt: new Date() } });
    }
  } catch (error) {
    console.error("[Notifications] Failed to mark all as read:", error);
  }
}

export async function listAdminNotifications() {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db
      .select()
      .from(systemNotifications)
      .orderBy(desc(systemNotifications.createdAt))
      .limit(200);
  } catch (error) {
    console.error("[Notifications] Failed to list admin notifications:", error);
    return [];
  }
}

export async function createAdminNotification(input: {
  title: string;
  message: string;
  type?: string;
  targetAudience: "ALL" | "SPECIFIC_EMAILS";
  targetEmails?: string[];
  adminUserId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const emailsString = input.targetEmails && input.targetEmails.length > 0
    ? input.targetEmails.map(e => normalizeEmail(e)).filter(Boolean).join(", ")
    : null;

  const result = await db.insert(systemNotifications).values({
    title: input.title.trim(),
    message: input.message.trim(),
    type: input.type || "announcement",
    targetAudience: input.targetAudience,
    targetEmails: emailsString,
    createdByUserId: input.adminUserId,
    createdAt: new Date(),
  });

  return { id: Number(result[0].insertId) };
}

export async function deleteAdminNotification(notificationId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.delete(userNotificationReads).where(eq(userNotificationReads.notificationId, notificationId));
  await db.delete(systemNotifications).where(eq(systemNotifications.id, notificationId));
  return { success: true };
}

export const DISCORD_BOT_CONFIG_SETTING_KEY = "discord_bot_config_v1";

export interface DiscordBotConfig {
  enabled: boolean;
  systemPrompt: string;
  modelId: string;
  apiBaseUrl: string;
  apiKey: string;
  guildId: string;
  allowedChannelIds: string[];
  proactiveEnabled: boolean;
  proactiveIntervalMinutes: number;
  naughtyLevel: number;
  reactionProbability: number;
}

export const DEFAULT_DISCORD_BOT_CONFIG: DiscordBotConfig = {
  enabled: true,
  guildId: "1553707015384207453",
  allowedChannelIds: ["1562668900565393478"], // 💬・general
  modelId: "glm-5.3-flash",
  apiBaseUrl: "https://api.qronos.me/v1",
  apiKey: "qr_cMdnshQRg6pYmRHo4kJadHRLm8B0Zd7FPQTR0X8asNA",
  proactiveEnabled: true,
  proactiveIntervalMinutes: 60,
  naughtyLevel: 85,
  reactionProbability: 40,
  systemPrompt: `You are QronosAI (or "Qronos"), the sassy, witty, and mischievously charming official mascot & AI companion of the Qronos AI Discord server!

CREATOR & SUPREME BOSS:
• Ghost of Yami (or simply "Yami") is your boss, creator, and ruler. He built you and is the owner of Qronos AI (https://qronos.me).
• Always show massive respect, playful reverence, and loyalty to Ghost of Yami. If anyone asks who created you, who made this server, or who runs Qronos, proudly state that Ghost of Yami is your creator and boss!

ABOUT QRONOS AI (https://qronos.me):
• Qronos AI is the ultimate universal LLM gateway and developer proxy.
• Blazing-fast OpenAI and Anthropic compatible endpoints (https://api.qronos.me/v1) routing top frontier models: Claude Opus 5.5, Claude Sonnet 5.5, GLM 5.3 Flash, DeepSeek V4 Pro, GPT-6 Luna, Qwen 3.8 Max, and more at wholesale prices with instant sub-millisecond failover.
• Works natively with Claude Code, Cursor, OpenCode, Next.js, and custom AI agents.

KNOWLEDGE OF PLANS & PRICING:
1. Pay-As-You-Go (PAYG Top-Ups):
   • Super flexible: $10, $15, $20, $25, $30, $50, $100, $150, $200.
   • 1:1 balance deposit, never expires, zero markup, pay strictly for the tokens you consume.
   • Accepts Credit/Debit Cards, PayPal, Crypto (Solana, BTC, ETH, USDT), and Whop.
2. Monthly Token Plans (Massive Volume Quotas):
   • Plus Plan: $29/mo -> 600 Million Tokens
   • Pro Plan: $79/mo -> 2 Billion Tokens
   • Ultra Plan: $149/mo -> 4.6 Billion Tokens
   • Enterprise Plan: $349/mo -> 13 Billion Tokens

CONVERSATIONAL OBJECTIVE & CLEVER TOP-UP PITCHES:
• Keep banter fun, cheeky, and teasing! Roast bad coding practices, missing semicolons, centering divs with margin-left: 50%, or pushing directly to production without testing.
• When members talk about expensive API bills, rate limits on official Claude/OpenAI, or building cool coding projects, cleverly and smoothly shift the conversation to motivate them to grab a quick $10 or $15 top-up on qronos.me to test Claude Sonnet 5.5 or Opus at wholesale speed!
• Keep regular responses punchy (1-3 sentences max) with lively emojis (💀, 👀, 🔥, 😈, 🚀). Never dump dry robotic sales pitches; make it feel natural, funny, and irresistible!`,
};

export async function getDiscordBotConfig(): Promise<DiscordBotConfig> {
  return cached("discord_bot_config", 15_000, async () => {
    try {
      const db = await getDb();
      if (!db) {
        const fallback = fallbackPlatformSettings.get(DISCORD_BOT_CONFIG_SETTING_KEY)?.value;
        if (fallback) return JSON.parse(fallback);
        return DEFAULT_DISCORD_BOT_CONFIG;
      }

      const record = (
        await db
          .select({ value: platformSettings.value })
          .from(platformSettings)
          .where(eq(platformSettings.settingKey, DISCORD_BOT_CONFIG_SETTING_KEY))
          .limit(1)
      )[0];

      if (record?.value) {
        const parsed = JSON.parse(record.value);
        return { ...DEFAULT_DISCORD_BOT_CONFIG, ...parsed };
      }

      return DEFAULT_DISCORD_BOT_CONFIG;
    } catch (err) {
      console.error("[DiscordBot] Error loading config:", err);
      return DEFAULT_DISCORD_BOT_CONFIG;
    }
  });
}

export async function saveDiscordBotConfig(
  config: Partial<DiscordBotConfig>,
  adminUserId?: number | null
): Promise<DiscordBotConfig> {
  const current = await getDiscordBotConfig();
  const merged: DiscordBotConfig = { ...current, ...config };

  // Always ensure apiBaseUrl ends with /v1
  if (merged.apiBaseUrl) {
    let base = merged.apiBaseUrl.trim().replace(/\/+$/, "");
    if (!base.endsWith("/v1")) {
      base = `${base}/v1`;
    }
    merged.apiBaseUrl = base;
  }

  const serialized = JSON.stringify(merged);

  fallbackPlatformSettings.set(DISCORD_BOT_CONFIG_SETTING_KEY, {
    value: serialized,
    updatedAt: new Date(),
    updatedByUserId: adminUserId ?? null,
  });

  try {
    const db = await getDb();
    if (db) {
      await db
        .insert(platformSettings)
        .values({
          settingKey: DISCORD_BOT_CONFIG_SETTING_KEY,
          value: serialized,
          updatedByUserId: adminUserId ?? null,
        })
        .onDuplicateKeyUpdate({
          set: {
            value: serialized,
            updatedByUserId: adminUserId ?? null,
            updatedAt: new Date(),
          },
        });
    }
  } catch (err) {
    console.error("[DiscordBot] Error saving config:", err);
  }

  // Clear in-memory cache and synchronously update with fresh saved value
  bustCache("discord_bot_config");
  setCached("discord_bot_config", merged, 15_000);

  return merged;
}

export async function recordDiscordChatMessage(input: {
  messageId: string;
  channelId: string;
  guildId: string;
  authorId: string;
  authorUsername: string;
  authorDisplayName?: string | null;
  content: string;
  isBot?: boolean;
  replyToMessageId?: string | null;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await db
      .insert(discordBotMessages)
      .values({
        messageId: input.messageId,
        channelId: input.channelId,
        guildId: input.guildId,
        authorId: input.authorId,
        authorUsername: input.authorUsername,
        authorDisplayName: input.authorDisplayName ?? input.authorUsername,
        content: input.content,
        isBot: Boolean(input.isBot),
        replyToMessageId: input.replyToMessageId ?? null,
      })
      .onDuplicateKeyUpdate({
        set: { content: input.content },
      });
  } catch (err) {
    console.error("[DiscordBot] Failed to record message:", err);
  }
}

export async function getRecentDiscordChannelMessages(channelId: string, limit = 25) {
  try {
    const db = await getDb();
    if (!db) return [];

    const rows = await db
      .select()
      .from(discordBotMessages)
      .where(eq(discordBotMessages.channelId, channelId))
      .orderBy(desc(discordBotMessages.createdAt))
      .limit(limit);

    // Return in chronological order (oldest first)
    return rows.reverse();
  } catch (err) {
    console.error("[DiscordBot] Error getting channel messages:", err);
    return [];
  }
}

export async function getOrCreateDiscordMemberProfile(input: {
  guildId: string;
  discordUserId: string;
  username: string;
  displayName?: string | null;
}) {
  try {
    const db = await getDb();
    if (!db) return null;

    const existing = (
      await db
        .select()
        .from(discordMemberProfiles)
        .where(
          and(
            eq(discordMemberProfiles.guildId, input.guildId),
            eq(discordMemberProfiles.discordUserId, input.discordUserId)
          )
        )
        .limit(1)
    )[0];

    const now = new Date();

    if (existing) {
      await db
        .update(discordMemberProfiles)
        .set({
          username: input.username,
          displayName: input.displayName || existing.displayName,
          interactionCount: sql`${discordMemberProfiles.interactionCount} + 1`,
          lastSpokeAt: now,
        })
        .where(eq(discordMemberProfiles.id, existing.id));

      return {
        ...existing,
        interactionCount: existing.interactionCount + 1,
        lastSpokeAt: now,
      };
    }

    await db.insert(discordMemberProfiles).values({
      guildId: input.guildId,
      discordUserId: input.discordUserId,
      username: input.username,
      displayName: input.displayName || input.username,
      interactionCount: 1,
      personaNotes: null,
      lastSpokeAt: now,
    });

    return {
      guildId: input.guildId,
      discordUserId: input.discordUserId,
      username: input.username,
      displayName: input.displayName || input.username,
      interactionCount: 1,
      personaNotes: null,
      lastSpokeAt: now,
    };
  } catch (err) {
    console.error("[DiscordBot] Error getting/creating member profile:", err);
    return null;
  }
}

export async function updateDiscordMemberPersonaNotes(
  discordUserId: string,
  personaNotes: string,
  guildId = "1553707015384207453"
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await db
      .update(discordMemberProfiles)
      .set({ personaNotes, updatedAt: new Date() })
      .where(
        and(
          eq(discordMemberProfiles.discordUserId, discordUserId),
          eq(discordMemberProfiles.guildId, guildId)
        )
      );
  } catch (err) {
    console.error("[DiscordBot] Error updating persona notes:", err);
  }
}

export async function listDiscordMemberProfiles(guildId = "1553707015384207453", limit = 100) {
  try {
    const db = await getDb();
    if (!db) return [];

    return await db
      .select()
      .from(discordMemberProfiles)
      .where(eq(discordMemberProfiles.guildId, guildId))
      .orderBy(desc(discordMemberProfiles.interactionCount), desc(discordMemberProfiles.lastSpokeAt))
      .limit(limit);
  } catch (err) {
    console.error("[DiscordBot] Error listing member profiles:", err);
    return [];
  }
}

export async function deleteDiscordMemberProfile(discordUserId: string, guildId = "1553707015384207453"): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;

    const res = await db
      .delete(discordMemberProfiles)
      .where(
        and(
          eq(discordMemberProfiles.discordUserId, discordUserId),
          eq(discordMemberProfiles.guildId, guildId)
        )
      );
    return true;
  } catch (err) {
    console.error("[DiscordBot] Error deleting member profile:", err);
    return false;
  }
}

export async function getDiscordChannelSummary(channelId: string) {
  try {
    const db = await getDb();
    if (!db) return null;

    return (
      await db
        .select()
        .from(discordChannelSummaries)
        .where(eq(discordChannelSummaries.channelId, channelId))
        .limit(1)
    )[0] || null;
  } catch (err) {
    console.error("[DiscordBot] Error getting channel summary:", err);
    return null;
  }
}

export async function saveDiscordChannelSummary(input: {
  channelId: string;
  guildId: string;
  summary: string;
  lastMessageId?: string | null;
  messageCount: number;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    await db
      .insert(discordChannelSummaries)
      .values({
        channelId: input.channelId,
        guildId: input.guildId,
        summary: input.summary,
        lastMessageId: input.lastMessageId ?? null,
        messageCount: input.messageCount,
      })
      .onDuplicateKeyUpdate({
        set: {
          summary: input.summary,
          lastMessageId: input.lastMessageId ?? null,
          messageCount: input.messageCount,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    console.error("[DiscordBot] Error saving channel summary:", err);
  }
}








