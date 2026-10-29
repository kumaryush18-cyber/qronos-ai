import {
  isCacheDebugEnabled,
  setCacheDebugEnabled,
  clearCacheDebugEntries,
  getCacheDebugSummaries,
  getCacheDebugEntry,
  computeCacheDiffBetweenEntries,
  exportCacheDebugJsonl,
} from "./cacheDebugger";
import { COOKIE_NAME, DEFAULT_SESSION_MAX_AGE_MS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ESTABLISHED_EMAIL_DOMAIN_GUIDANCE } from "../shared/emailPolicy";
import {
  createApiKey,
  getAdminAccountModelUsage,
  getAdminOverview,
  listAdminAccounts,
  getEmailAllowlistConfig,
  getQuotaStatus,
  getUsageSummary,
  listOpenFlags,
  listApiKeys,
  revokeApiKey,
  rotateApiKey,
  setAccountControl,
  setEmailAllowlistConfig,
  setModelEnabled,
  setModelMinTier,
  setModelIsPayg,
  setModelIsBundle,
  setModelIsTokenPlan,
  setModelCompactScalingConfig,
  getModelCompactScalingConfig,
  setModelAccess,
  setProviderEnabled,
  setProviderSupportsVision,
  setProviderSupportsDocuments,
  writeAuditEvent,
  clearFailedPasswordLogin,
  getPasswordLoginThrottle,
  recordFailedPasswordLogin,
  claimDailyCheckin,
  getCreditProfile,
  getModelAvailabilitySnapshot,
  getPublicModelTokenMetrics,
  getUsageLogs,
  clearLegacyAdministratorRoles,
  countDiscordVerifiedAccounts,
  deleteAccountPermanently,
  grantAdminAccountCredit,
  setAdminAccountCredit,
  grantDiscordVerifiedAccountGiveaway,
  listCreditGiveawayHistory,
  listUnreadCreditGiveawayNotifications,
  dismissCreditGiveawayNotification,
  getAdminAuditExport,
  getAuthSessionVersion,
  getPlatformMaintenanceConfig,
  getPlatformMaintenanceMessages,
  setPlatformMaintenanceMessages,
  getEffectivePlatformMaintenanceMessage,
  getPlatformMaintenanceExemptions,
  getGpt6AstraPremiumExemptions,
  setGpt6AstraPremiumExemption,
  removeGpt6AstraPremiumExemption,

  setPlatformMaintenanceExemption,
  removePlatformMaintenanceExemption,
  isUserExemptFromPlatformMaintenance,
  getPlaygroundMaintenanceConfig,
  setPlaygroundMaintenanceConfig,
  getPinnedUserRoutingPolicy,
  setPinnedUserRoutingPolicy,
  getMaintenanceCountdown,
  listAdminAuditEvents,
  countDiscordUnverifiedAccounts,
  deleteDiscordUnverifiedAccounts,
  getAnnouncementText,
  setAnnouncementText,
  getUnoRouterBadgeEnabled,
  setUnoRouterBadgeEnabled,
  getModelTokenMultipliers,
  setModelTokenMultiplier,
  getModelPricingOverrides,
  setModelPricingOverride,
  resetModelPricingOverride,
  getReferralOverview,
  getSpecialReferralGiftStatus,
  acknowledgeSpecialReferralGift,
  getSpecialReferralCampaignAdminOverview,
  resetDiscordVerification,
  bypassDiscordVerificationByEmail,
  listDiscordVerifiedAccounts,
  setPlatformMaintenanceConfig,
  resumePlatformAfterTimedMaintenance,
  setMaintenanceCountdown,
  getOrCreateAdminSessionPrincipal,
  replaceOrcaRouterCredentialPool,
  getClaudeFable5NvidiaProviderSettings,
  updateClaudeFable5NvidiaProviderSettings,
  getRecentClaudeFable5FailureLogs,
  getRecentGlm53FailureLogs,
  getRecentSonnet46FailureLogs,
  getRecentClaudeOpus5FailureLogs,
  getRecentDeepseekV4ProFailureLogs,
  getRecentQwen38MaxFailureLogs,
  getRecentGpt6AstraFailureLogs,
  getRecentKimiK3FailureLogs,
  getClaudeOpus5ProviderSettings,
  updateClaudeOpus5ProviderSettings,
  setClaudeOpus5BaiPriority,
  deleteClaudeOpus5QwenApiKey,
  deleteClaudeOpus5QwenModel,
  getGlm53ProviderSettings,
  updateGlm53ProviderSettings,
  getSonnet46ProviderSettings,
  updateSonnet46ProviderSettings,
  getDeepseekV4ProProviderSettings,
  updateDeepseekV4ProProviderSettings,
  getQwen38MaxProviderSettings,
  updateQwen38MaxProviderSettings,
  getGpt6AstraProviderSettings,
  updateGpt6AstraProviderSettings,
  getKimiK3ProviderSettings,
  updateKimiK3ProviderSettings,
  getGpt6AstraQuotaStatus,
  getBailuWebshareProxyPoolSettings,
  updateBailuWebshareProxyPoolSettings,
  listAdminPreProvisionedAccounts,
  preProvisionAccountEmail,
  deletePreProvisionedAccount,
  hasPendingPreProvisionedAccountEmail,
  getUserByEmail,
  verifyAndAuthenticateEmail,
  getOrCreateUserByEmail,
  markUserSignedIn,
  setAllUsersCreditBalance,
  grantAllUsersPaygBalance,
  grantAllUsersTokenPlan,
  setUserTier,
  getUserById,
  isUserCreditsEnabled,
  setUserCreditsEnabled,
  searchUsersForTierAssignment,
  submitAccessRequest,
  getAccessRequestByEmail,
  listAccessRequests,
  approveAccessRequest,
  denyAccessRequest,
  getRecentModelFailureLogs,
  listSafetyAuditLogs,
  clearSafetyAuditLogs,
  setUserMessageLoggingEnabled,
  listUserInteractionLogs,
  clearUserInteractionLogs,
  deleteSingleUserInteractionLog,
  listUserNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  listAdminNotifications,
  createAdminNotification,
  deleteAdminNotification,
  getInviteTrackerState,
  startInviteTrackerSession,
  stopInviteTrackerSession,
  deleteInviteTrackerHistory,
  clearAllInviteTrackerHistory,
  getInviteMilestoneCampaignConfig,
  saveInviteMilestoneCampaignConfig,
  getUserEventsMilestoneSummary,
  listAdminInviteMilestoneGrants,
  getOrCreateReferralCode,
  getDiscordBotConfig,
  saveDiscordBotConfig,
  listDiscordMemberProfiles,
  deleteDiscordMemberProfile,
  getDiscordChannelSummary,
} from "./db";
import {
  getDiscordBotLiveStatus,
  startDiscordBotService,
  stopDiscordBotService,
  sendDiscordBotTestMessage,
} from "./discordBotService";
import { getSessionCookieOptions } from "./_core/cookies";
import { invalidateSessionAuthCache, sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router, verifiedDeveloperProcedure } from "./_core/trpc";
import { configuredEmailAllowlist } from "./localAuth";
import { CLAUDE_OPUS5_PROVIDER_SLUG, CLUSTER_PROTOCOL_PROVIDER_SLUG, FXQIDIAN_PROVIDER_SLUG, isTokenForgeModelId, TOKENHARBOR_PROVIDER_SLUG, TOKENROUTER_PROVIDER_SLUG, type TokenForgeModelId } from "./modelCatalogue";
import { PUBLIC_PROVIDER_ERROR_MESSAGE, runPlaygroundCompletion, TokenForgePlaygroundError, tokenForgeRequestIpHash } from "./openaiGateway";
import { verifyAdminPasscode } from "./adminPasscode";
import { getOrcaRouterCredentialPoolStatus, getOrcaRouterSlotRequestCounts, invalidateOrcaRouterCredentialPool, ORCA_ROUTER_CREDENTIAL_POOL_SIZE, validateOrcaRouterCredential } from "./orcaRouterCredentials";
import { buildSpecialReferralCampaignUrl } from "../shared/referrals";
import { listUserDodoPayments, listAllDodoPayments, syncDodoPaymentsFromApi } from "./dodoPaymentsGateway";
import { getAllEffectiveModelPricing } from "./creditPricing";
import {
  getUniversalModelProviderSettings,
  updateUniversalModelProviderSettings,
  listUniversalConfiguredModels,
  getUniversalModelKeyMetricGroup,
} from "./universalModelProviders";

const apiKeyLabel = z
  .string()
  .trim()
  .min(1, "Choose a label for this key")
  .max(100, "Key labels must be 100 characters or fewer");

const LOCAL_SESSION_MAX_AGE_MS = DEFAULT_SESSION_MAX_AGE_MS;
const playgroundMessage = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().trim().min(1, "Message content cannot be empty").max(20_000, "Each message must be 20,000 characters or fewer"),
});
const tokenForgeModelId = z.string()
  .refine(isTokenForgeModelId, "The requested model is not in the active Qronos AI catalogue.")
  .transform(model => model as TokenForgeModelId);
const adminPasscodeInput = z.object({ passcode: z.string().min(4, "Enter the administrator passcode").max(128) });
const adminAccountDirectoryInput = z.object({
  page: z.number().int().min(1).max(100_000).default(1),
  pageSize: z.number().int().min(5).max(50).default(10),
  search: z.string().trim().max(120).default(""),
  status: z.enum(["all", "active", "suspended", "flagged"]).default("all"),
  sort: z.enum(["latestJoin", "mostTokens", "discordVerified", "mostCredit", "mostReferrals", "specialReferral"]).default("latestJoin"),
});
const adminPreProvisionAccountInput = z.object({
  email: z.string().trim().email("Enter a valid email address").max(320, "Email addresses must be 320 characters or fewer"),
});
const permanentAccountDeleteInput = z.object({ userId: z.number().int().positive(), confirmation: z.string().trim().max(64).optional() });
const adminCreditGrantInput = z.object({
  userId: z.number().int().positive(),
  amountUsd: z.number().finite().positive().max(10_000_000).refine(value => Math.round(value * 100) === value * 100, "Use an amount with no more than two decimal places"),
  balanceType: z.enum(["payg", "tokens", "bundle"]).default("payg").optional(),
});
const setAccountCreditInput = z.object({
  userId: z.number().int().positive(),
  targetAmountUsd: z.number().finite().min(0, "Amount cannot be negative").max(10_000_000, "Amount exceeds limit").refine(value => Math.round(value * 100) === value * 100, "Use an amount with no more than two decimal places"),
  balanceType: z.enum(["payg", "tokens", "bundle"]).default("payg").optional(),
  note: z.string().trim().max(256, "Note must be 256 characters or fewer").optional(),
});
const setAllUsersCreditInput = z.object({
  amountUsd: z.number().finite().min(0, "Credit amount cannot be negative").max(100_000, "Amount cannot exceed $100,000").refine(value => Math.round(value * 100) === value * 100, "Use an amount with no more than two decimal places"),
  note: z.string().trim().max(256, "Note must be 256 characters or fewer").optional(),
});
const discordVerifiedGiveawayInput = z.object({
  amountUsd: z.number().finite().positive().max(100_000).refine(value => Math.round(value * 100) === value * 100, "Use an amount with no more than two decimal places"),
  announcementNote: z.string().trim().max(256, "Recipient announcement notes must be 256 characters or fewer").optional(),
  expectedRecipientCount: z.number().int().min(0).max(1_000_000),
  confirmation: z.string().trim().max(160),
}).superRefine((input, context) => {
  const phrase = `GIVE $${input.amountUsd.toFixed(2)} TO ${input.expectedRecipientCount} ACCOUNTS`;
  const verifiedPhrase = `GIVE $${input.amountUsd.toFixed(2)} TO ${input.expectedRecipientCount} VERIFIED ACCOUNTS`;
  if (input.confirmation !== phrase && input.confirmation !== verifiedPhrase) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmation"], message: `Type ${phrase} to confirm this giveaway` });
  }
});
const discordVerificationResetInput = z.object({
  userId: z.number().int().positive(),
  confirmation: z.string().trim().max(80),
}).superRefine((input, context) => {
  if (input.confirmation !== `RESET DISCORD VERIFICATION ${input.userId}`) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmation"], message: `Type RESET DISCORD VERIFICATION ${input.userId} to require membership verification again` });
  }
});
const announcementInput = z.object({ text: z.string().max(500, "Announcements must be 500 characters or fewer") });
const maintenanceCountdownInput = z.object({
  durationMs: z.number().int().min(1_000, "Choose a countdown duration of at least one second").max(30 * 24 * 60 * 60 * 1_000, "Maintenance countdowns can be no longer than 30 days"),
  note: z.string().trim().max(200, "Maintenance notes must be 200 characters or fewer"),
}).nullable();
const orcaRouterCredentialPoolInput = z.object({
  credentials: z.array(z.string().trim().min(20, "Enter a complete OrcaRouter credential").max(512)).length(ORCA_ROUTER_CREDENTIAL_POOL_SIZE, `Provide exactly ${ORCA_ROUTER_CREDENTIAL_POOL_SIZE} OrcaRouter credentials`),
});
const claudeFable5ProviderGroupInput = z.object({
  id: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i, "Use letters, numbers, hyphens, or underscores for the provider ID"),
  label: z.string().trim().min(1, "Enter a provider label").max(80),
  enabled: z.boolean().optional(),
  baseUrl: z.string().trim().url("Enter a valid HTTPS base URL").max(512),
  model: z.string().trim().min(1, "Enter a model ID").max(256),
  apiKeys: z.array(z.string().trim().max(512)).max(50, "A provider pool can contain at most 50 API keys"),
  apiKeyEnabled: z.array(z.boolean()).max(50, "A provider pool can contain at most 50 API key states").optional(),
  removeSlots: z.array(z.number().int().positive()).max(50).optional(),
  removedSlots: z.array(z.number().int().positive()).max(50).optional(),
  maxInputTokens: z.number().int().min(1, "Input token limit must be at least 1").max(10_000_000, "Input token limit cannot exceed 10,000,000").optional().nullable(),
  maxOutputTokens: z.number().int().min(1, "Output token limit must be at least 1").max(10_000_000, "Output token limit cannot exceed 10,000,000").optional().nullable(),
  disableIdentityPrompt: z.boolean().optional(),
  bypassCooldown: z.boolean().optional(),
  supportsVision: z.boolean().optional(),
  pinnedUserEmails: z.array(z.string().trim().max(320)).max(500).optional(),
  reasoningEffort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional().nullable(),
}).transform(input => ({
  ...input,
  removeSlots: input.removeSlots ?? input.removedSlots,
}));

const claudeFable5ProviderSettingsInput = z.union([
  z.object({ providers: z.array(claudeFable5ProviderGroupInput).min(1, "Keep at least one Claude Fable 5.1 provider").max(100, "At most 100 Claude Fable 5.1 providers may be configured") }),
  z.object({ baseUrl: z.string().trim().url("Enter a valid HTTPS base URL").max(512).optional(), model: z.string().trim().min(1, "Enter a model ID").max(256).optional(), apiKeys: z.array(z.string().trim().max(512)).max(50).optional(), apiKeyEnabled: z.array(z.boolean()).max(50).optional(), removeSlots: z.array(z.number().int().positive()).max(50).optional(), removedSlots: z.array(z.number().int().positive()).max(50).optional(), maxInputTokens: z.number().int().min(1).max(10_000_000).optional().nullable(), maxOutputTokens: z.number().int().min(1).max(10_000_000).optional().nullable(), disableIdentityPrompt: z.boolean().optional(), bypassCooldown: z.boolean().optional(), supportsVision: z.boolean().optional(), pinnedUserEmails: z.array(z.string().trim().max(320)).max(500).optional(), reasoningEffort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional().nullable() }).refine(input => input.baseUrl !== undefined || input.model !== undefined || input.apiKeys !== undefined || input.apiKeyEnabled !== undefined || input.removeSlots !== undefined || input.removedSlots !== undefined || input.maxInputTokens !== undefined || input.maxOutputTokens !== undefined || input.disableIdentityPrompt !== undefined || input.bypassCooldown !== undefined || input.supportsVision !== undefined || input.pinnedUserEmails !== undefined || input.reasoningEffort !== undefined, "Provide at least one setting to update").transform(input => ({ ...input, removeSlots: input.removeSlots ?? input.removedSlots })),
]);

const claudeOpus5ProviderSettingsInput = z.object({
  baiPriority: z.boolean().optional(),
  providers: z.array(z.object({
    id: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i, "Use letters, numbers, hyphens, or underscores for the provider ID"),
    label: z.string().trim().min(1, "Enter a provider label").max(80),
    enabled: z.boolean().optional(),
    baseUrl: z.string().trim().url("Enter a valid HTTPS base URL").max(512),
    model: z.string().trim().min(1, "Enter a model ID").max(256),
    apiKeys: z.array(z.string().trim().max(512)).max(50, "A provider pool can contain at most 50 API keys"),
    apiKeyEnabled: z.array(z.boolean()).max(50, "A provider pool can contain at most 50 API key states").optional(),
    removeSlots: z.array(z.number().int().positive()).max(50).optional(),
    removedSlots: z.array(z.number().int().positive()).max(50).optional(),
    maxOutputTokens: z.number().int().min(1, "Output token limit must be at least 1").max(10_000_000, "Output token limit cannot exceed 10,000,000").optional().nullable(),
    maxInputTokens: z.number().int().min(1, "Input token limit must be at least 1").max(10_000_000, "Input token limit cannot exceed 10,000,000").optional().nullable(),
    disableIdentityPrompt: z.boolean().optional(),
    bypassCooldown: z.boolean().optional(),
    supportsVision: z.boolean().optional(),
    supportsDocuments: z.boolean().optional(),
    pinnedUserEmails: z.array(z.string().trim().max(320)).max(500).optional(),
    reasoningEffort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional().nullable(),
    modelPool: z.array(z.object({
      id: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i, "Use letters, numbers, hyphens, or underscores for the model entry ID"),
      model: z.string().trim().min(1, "Enter a model ID").max(256),
      enabled: z.boolean().optional(),
      quotaTokens: z.number().int().min(1_000).max(100_000_000).optional(),
    })).max(50, "A Qwen provider can contain at most 50 model IDs").optional(),
  }).transform(provider => ({
    ...provider,
    removeSlots: provider.removeSlots ?? provider.removedSlots,
  }))).min(1, "Keep at least one Claude Opus 5 provider").max(100, "At most 100 Claude Opus 5 providers may be configured"),
});

const universalModelProviderSettingsInput = z.object({
  modelId: z.string().trim().min(1, "Enter a valid model ID"),
  providers: z.array(z.object({
    id: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i, "Use letters, numbers, hyphens, or underscores for the provider ID"),
    label: z.string().trim().min(1, "Enter a provider label").max(80),
    enabled: z.boolean().optional(),
    baseUrl: z.string().trim().url("Enter a valid HTTPS base URL").max(512),
    model: z.string().trim().min(1, "Enter a model ID").max(256),
    apiKeys: z.array(z.string().trim().max(512)).max(50, "A provider pool can contain at most 50 API keys"),
    apiKeyEnabled: z.array(z.boolean()).max(50, "A provider pool can contain at most 50 API key states").optional(),
    removeSlots: z.array(z.number().int().positive()).max(50).optional(),
    removedSlots: z.array(z.number().int().positive()).max(50).optional(),
    maxOutputTokens: z.number().int().min(1, "Output token limit must be at least 1").max(10_000_000, "Output token limit cannot exceed 10,000,000").optional().nullable(),
    maxInputTokens: z.number().int().min(1, "Input token limit must be at least 1").max(10_000_000, "Input token limit cannot exceed 10,000,000").optional().nullable(),
    disableIdentityPrompt: z.boolean().optional(),
    bypassCooldown: z.boolean().optional(),
    supportsVision: z.boolean().optional(),
    supportsDocuments: z.boolean().optional(),
    pinnedUserEmails: z.array(z.string().trim().max(320)).max(500).optional(),
    reasoningEffort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional().nullable(),
  }).transform(provider => ({
    ...provider,
    removeSlots: provider.removeSlots ?? provider.removedSlots,
  }))).min(1, "Keep at least one provider").max(100, "At most 100 providers may be configured"),
});
const claudeOpus5QwenModelDeleteInput = z.object({
  providerId: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i),
  modelEntryId: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i),
});
const claudeOpus5QwenApiKeyDeleteInput = z.object({
  providerId: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i),
  slot: z.number().int().positive(),
});
const bailuWebshareProxyPoolInput = z.object({
  enabled: z.boolean(),
  proxies: z.array(z.object({
    id: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i, "Use letters, numbers, hyphens, or underscores for the proxy ID"),
    label: z.string().trim().max(80).optional(),
    proxyUrl: z.string().trim().max(2_048).optional(),
    host: z.string().trim().optional(),
    port: z.number().int().min(1).max(65_535).optional(),
    username: z.string().max(512).optional(),
    password: z.string().max(512).optional(),
    enabled: z.boolean().optional(),
  }).superRefine((proxy, ctx) => {
    if (proxy.proxyUrl) return;
    if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(proxy.host ?? "")) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["host"], message: "Enter a complete Direct proxy URL or the Webshare direct proxy IPv4 address" });
    if (!proxy.port) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["port"], message: "Enter a Direct proxy URL or port" });
  })).max(3, "Bailu supports at most three Webshare direct proxies"),
});
const glm53ProviderGroupInput = z.object({
  id: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i, "Use letters, numbers, hyphens, or underscores for the provider identifier"),
  label: z.string().trim().min(1, "Enter a provider label").max(80),
  enabled: z.boolean().optional(),
  baseUrl: z.string().trim().url("Enter a valid HTTPS base URL").max(512),
  model: z.string().trim().min(1, "Enter a model ID").max(256),
  apiKeys: z.array(z.string().trim().max(512)).max(50, "A provider pool can contain at most 50 API keys"),
  apiKeyEnabled: z.array(z.boolean()).max(50, "A provider pool can contain at most 50 API key states").optional(),
  removeSlots: z.array(z.number().int().positive()).max(50).optional(),
  removedSlots: z.array(z.number().int().positive()).max(50).optional(),
  maxInputTokens: z.number().int().min(1, "Input token limit must be at least 1").max(10_000_000, "Input token limit cannot exceed 10,000,000").optional().nullable(),
  maxOutputTokens: z.number().int().min(1, "Output token limit must be at least 1").max(10_000_000, "Output token limit cannot exceed 10,000,000").optional().nullable(),
  disableIdentityPrompt: z.boolean().optional(),
  bypassCooldown: z.boolean().optional(),
  supportsVision: z.boolean().optional(),
  pinnedUserEmails: z.array(z.string().trim().max(320)).max(500).optional(),
  reasoningEffort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional().nullable(),
}).transform(input => ({
  ...input,
  removeSlots: input.removeSlots ?? input.removedSlots,
}));

const glm53ProviderSettingsInput = z.union([
  z.object({ providers: z.array(glm53ProviderGroupInput).min(1, "Keep at least one GLM 5.3 provider").max(100, "At most 100 GLM 5.3 providers may be configured") }),
  z.object({ baseUrl: z.string().trim().url("Enter a valid HTTPS base URL").max(512).optional(), model: z.string().trim().min(1, "Enter a model ID").max(256).optional(), apiKeys: z.array(z.string().trim().max(512)).max(50).optional(), apiKeyEnabled: z.array(z.boolean()).max(50).optional(), removeSlots: z.array(z.number().int().positive()).max(50).optional(), removedSlots: z.array(z.number().int().positive()).max(50).optional(), maxInputTokens: z.number().int().min(1).max(10_000_000).optional().nullable(), maxOutputTokens: z.number().int().min(1).max(10_000_000).optional().nullable(), disableIdentityPrompt: z.boolean().optional(), bypassCooldown: z.boolean().optional(), supportsVision: z.boolean().optional(), pinnedUserEmails: z.array(z.string().trim().max(320)).max(500).optional(), reasoningEffort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional().nullable() }).refine(input => input.baseUrl !== undefined || input.model !== undefined || input.apiKeys !== undefined || input.apiKeyEnabled !== undefined || input.removeSlots !== undefined || input.removedSlots !== undefined || input.maxInputTokens !== undefined || input.maxOutputTokens !== undefined || input.disableIdentityPrompt !== undefined || input.bypassCooldown !== undefined || input.supportsVision !== undefined || input.pinnedUserEmails !== undefined || input.reasoningEffort !== undefined, "Provide at least one setting to update").transform(input => ({ ...input, removeSlots: input.removeSlots ?? input.removedSlots })),
]);

const deepseekV4ProProviderGroupInput = z.object({
  id: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i, "Use letters, numbers, hyphens, or underscores for the provider identifier"),
  label: z.string().trim().min(1, "Enter a provider label").max(80),
  enabled: z.boolean().optional(),
  baseUrl: z.string().trim().url("Enter a valid HTTPS base URL").max(512),
  model: z.string().trim().min(1, "Enter a model ID").max(256),
  apiKeys: z.array(z.string().trim().max(512)).max(50, "A provider pool can contain at most 50 API keys"),
  apiKeyEnabled: z.array(z.boolean()).max(50, "A provider pool can contain at most 50 API key states").optional(),
  removeSlots: z.array(z.number().int().positive()).max(50).optional(),
  removedSlots: z.array(z.number().int().positive()).max(50).optional(),
  maxInputTokens: z.number().int().min(1, "Input token limit must be at least 1").max(10_000_000, "Input token limit cannot exceed 10,000,000").optional().nullable(),
  disableIdentityPrompt: z.boolean().optional(),
  bypassCooldown: z.boolean().optional(),
  supportsVision: z.boolean().optional(),
  pinnedUserEmails: z.array(z.string().trim().max(320)).max(500).optional(),
  reasoningEffort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional().nullable(),
}).transform(input => ({
  ...input,
  removeSlots: input.removeSlots ?? input.removedSlots,
}));

const deepseekV4ProProviderSettingsInput = z.union([
  z.object({
    providers: z.array(deepseekV4ProProviderGroupInput).min(1).max(100, "DeepSeek V4 Pro supports at most 100 provider groups"),
  }),
  z.object({
    baseUrl: z.string().trim().url("Enter a valid HTTPS base URL").max(512).optional(),
    model: z.string().trim().min(1, "Enter a model ID").max(256).optional(),
    apiKeys: z.array(z.string().trim().max(512)).max(50, "A provider pool can contain at most 50 API keys").optional(),
    apiKeyEnabled: z.array(z.boolean()).max(50, "A provider pool can contain at most 50 API key states").optional(),
    removeSlots: z.array(z.number().int().positive()).max(50).optional(),
    removedSlots: z.array(z.number().int().positive()).max(50).optional(),
    maxInputTokens: z.number().int().min(1).max(10_000_000).optional().nullable(),
    disableIdentityPrompt: z.boolean().optional(),
    bypassCooldown: z.boolean().optional(),
    supportsVision: z.boolean().optional(),
    pinnedUserEmails: z.array(z.string().trim().max(320)).max(500).optional(),
    reasoningEffort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional().nullable(),
  }).refine(input => input.baseUrl !== undefined || input.model !== undefined || input.apiKeys !== undefined || input.apiKeyEnabled !== undefined || input.removeSlots !== undefined || input.removedSlots !== undefined || input.maxInputTokens !== undefined || input.disableIdentityPrompt !== undefined || input.bypassCooldown !== undefined || input.supportsVision !== undefined || input.pinnedUserEmails !== undefined || input.reasoningEffort !== undefined, "Provide at least one setting to update").transform(input => ({
    ...input,
    removeSlots: input.removeSlots ?? input.removedSlots,
  })),
]);

const sonnet46ProviderSettingsInput = z.object({
  providers: z.array(z.object({
    id: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i, "Use letters, numbers, hyphens, or underscores for the provider identifier"),
    label: z.string().trim().min(1, "Enter a provider label").max(80),
    enabled: z.boolean().optional(),
    baseUrl: z.string().trim().url("Enter a valid HTTPS base URL").max(512),
    model: z.string().trim().min(1, "Enter a model ID").max(256),
    apiKeys: z.array(z.string().trim().max(512)).max(50, "A provider pool can contain at most 50 API keys"),
    apiKeyEnabled: z.array(z.boolean()).max(50, "A provider pool can contain at most 50 API key states").optional(),
    removeSlots: z.array(z.number().int().positive()).max(50).optional(),
    removedSlots: z.array(z.number().int().positive()).max(50).optional(),
    maxInputTokens: z.number().int().min(1, "Input token limit must be at least 1").max(10_000_000, "Input token limit cannot exceed 10,000,000").optional().nullable(),
    disableIdentityPrompt: z.boolean().optional(),
    bypassCooldown: z.boolean().optional(),
    supportsVision: z.boolean().optional(),
    pinnedUserEmails: z.array(z.string().trim().max(320)).max(500).optional(),
    reasoningEffort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional().nullable(),
  }).transform(provider => ({
    ...provider,
    removeSlots: provider.removeSlots ?? provider.removedSlots,
  }))).min(1, "Keep at least one Claude Sonnet 4.6 provider").max(100, "Claude Sonnet 4.6 supports at most 100 provider groups"),
});
const discordUnverifiedCleanupInput = z.object({
  expectedCount: z.number().int().min(0).max(1_000_000),
  confirmation: z.string().trim().max(128),
}).superRefine((input, context) => {
  const phrase = `DELETE ${input.expectedCount} UNVERIFIED DISCORD ACCOUNTS`;
  if (input.confirmation !== phrase) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmation"], message: `Type ${phrase} to permanently remove these accounts` });
  }
});

function playgroundTrpcError(error: TokenForgePlaygroundError) {
  const code = error.code === "model_not_found" ? "NOT_FOUND"
    : error.code === "model_unavailable" || error.code === "provider_unavailable" || error.code === "platform_maintenance" ? "SERVICE_UNAVAILABLE"
        : error.code === "invalid_messages" ? "BAD_REQUEST"
          : error.code === "account_suspended" ? "FORBIDDEN"
            : error.code === "insufficient_credits" ? "PAYMENT_REQUIRED"
          : "TOO_MANY_REQUESTS";
  return new TRPCError({ code, message: error.message });
}

function adminUnlockThrottleIdentifier(req: Parameters<typeof tokenForgeRequestIpHash>[0]) {
  return `admin-unlock-ip-${tokenForgeRequestIpHash(req)}@tokenforge.internal`;
}

const GLOBAL_ADMIN_UNLOCK_THROTTLE_IDENTIFIER = "admin-unlock-global-distributed-ceiling@tokenforge.internal";
const ADMIN_SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours strictly for admin sessions

import {
  sendSupportMessage,
  getChatHistory,
  markUserMessagesAsRead,
  getUserUnreadCount,
  getAdminConversations,
  markAdminMessagesAsRead,
  sendAdminReply,
  findUserByEmail,
  deleteAdminMessage,
} from "./support";

export const supportRouter = router({
  sendMessage: protectedProcedure.input(z.object({ content: z.string() })).mutation(async ({ ctx, input }) => {
    return sendSupportMessage(ctx.user.id, input.content);
  }),
  getHistory: protectedProcedure.query(async ({ ctx }) => {
    return getChatHistory(ctx.user.id);
  }),
  markAsRead: protectedProcedure.mutation(async ({ ctx }) => {
    return markUserMessagesAsRead(ctx.user.id);
  }),
  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    return getUserUnreadCount(ctx.user.id);
  }),
  
  // Admin routes
  adminGetConversations: adminProcedure.query(async () => {
    return getAdminConversations();
  }),
  adminMarkAsRead: adminProcedure.input(z.object({ userId: z.number() })).mutation(async ({ input }) => {
    return markAdminMessagesAsRead(input.userId);
  }),
  adminSendReply: adminProcedure.input(z.object({ userId: z.number(), content: z.string() })).mutation(async ({ input }) => {
    return sendAdminReply(input.userId, input.content);
  }),
  adminGetChatHistory: adminProcedure.input(z.object({ userId: z.number() })).query(async ({ input }) => {
    return getChatHistory(input.userId);
  }),
  adminFindUserByEmail: adminProcedure.input(z.object({ email: z.string().trim() })).mutation(async ({ input }) => {
    const user = await findUserByEmail(input.email);
    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `No registered user found with email "${input.email}".`,
      });
    }
    return user;
  }),
  adminDeleteMessage: adminProcedure.input(z.object({ messageId: z.number() })).mutation(async ({ input }) => {
    try {
      return await deleteAdminMessage(input.messageId);
    } catch (err: any) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: err?.message || "Failed to delete message",
      });
    }
  }),
});

export const appRouter = router({
  support: supportRouter,
  system: systemRouter,
  public: router({
    modelAvailability: publicProcedure.query(() => getModelAvailabilitySnapshot()),
    modelTokenMetrics: publicProcedure.query(() => getPublicModelTokenMetrics()),
    announcement: publicProcedure.query(() => getAnnouncementText()),
    maintenanceCountdown: publicProcedure.query(() => getMaintenanceCountdown()),
    unorouterBadge: publicProcedure.query(async () => {
      const enabled = await getUnoRouterBadgeEnabled();
      return { enabled };
    }),
    modelTokenMultipliers: publicProcedure.query(async () => {
      return await getModelTokenMultipliers();
    }),
    modelPricing: publicProcedure
      .input(z.object({ tier: z.enum(["payg", "bundle"]).default("payg").optional() }).optional())
      .query(async ({ input }) => await getAllEffectiveModelPricing(input?.tier ?? "payg")),
    platformMaintenanceStatus: publicProcedure.query(async ({ ctx }) => {
      const config = await getPlatformMaintenanceConfig();
      if (!config.enabled) {
        return { active: false, isExempt: false, message: "" };
      }
      const isExempt = ctx.user ? await isUserExemptFromPlatformMaintenance(ctx.user) : false;
      const message = await getEffectivePlatformMaintenanceMessage(ctx.user?.id);
      return { active: true, isExempt, message };
    }),
  }),
  auth: router({
    me: publicProcedure.query(async (opts) => {
      if (!opts.ctx.user) return null;
      const creditsEnabled = await isUserCreditsEnabled(opts.ctx.user.id);
      return {
        ...opts.ctx.user,
        creditsEnabled,
      };
    }),
    getSessionToken: publicProcedure.query(async () => {
      // Hardened: tokens are exclusively kept inside httpOnly cookies and never sent to client memory
      return { sessionToken: null };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const token = (ctx.req.cookies as Record<string, string>)?.[COOKIE_NAME] ||
        (ctx.req.headers.authorization?.startsWith("Bearer ") ? ctx.req.headers.authorization.slice(7) : null);
      if (token) {
        sdk.revokeSessionToken(token);
      }
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    submitAccessRequest: publicProcedure
      .input(
        z.object({
          email: z.string().trim().email("Please enter a valid email address").max(255),
        })
      )
      .mutation(async ({ input }) => {
        try {
          const result = await submitAccessRequest(input.email);
          return {
            success: true as const,
            message: "Administrator will give access soon, try login again after some time.",
            ...result,
          };
        } catch (error: any) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error?.message || "Failed to submit access request.",
          });
        }
      }),
    verifyEmailLogin: publicProcedure
      .input(
        z.object({
          email: z.string().trim().email("Please enter a valid email address").max(255),
          referralCode: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        let user;
        try {
          user = await verifyAndAuthenticateEmail(input.email, input.referralCode);
        } catch (error: any) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "NOT_FOUND",
            message: error?.message || "Email not registered. Please contact administrator to get access.",
          });
        }
        if (user.isSuspended) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This account is currently suspended.",
          });
        }

        const sessionVersion = await getAuthSessionVersion();
        const sessionToken = await sdk.createSessionToken(user.openId, {
          expiresInMs: LOCAL_SESSION_MAX_AGE_MS,
          name: user.name ?? "Qronos developer",
          sessionVersion,
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: LOCAL_SESSION_MAX_AGE_MS,
        });

        await markUserSignedIn(user.id);

        return {
          success: true as const,
          sessionToken,
          user: {
            id: user.id,
            openId: user.openId,
            name: user.name,
            email: user.email,
          },
        };
      }),
  }),
  notifications: router({
    list: verifiedDeveloperProcedure.query(async ({ ctx }) => {
      return await listUserNotifications(ctx.user.id, ctx.user.email);
    }),
    unreadCount: verifiedDeveloperProcedure.query(async ({ ctx }) => {
      return await getUnreadNotificationCount(ctx.user.id, ctx.user.email);
    }),
    markAsRead: verifiedDeveloperProcedure
      .input(z.object({ notificationId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        await markNotificationAsRead(input.notificationId, ctx.user.id);
        return { success: true };
      }),
    markAllAsRead: verifiedDeveloperProcedure.mutation(async ({ ctx }) => {
      await markAllNotificationsAsRead(ctx.user.id, ctx.user.email);
      return { success: true };
    }),
  }),
  developer: router({
    discordVerificationStatus: protectedProcedure.query(({ ctx }) => ({
      verified: ctx.user.isAdminSession === true || Boolean(ctx.user.discordVerifiedAt),
      administratorBypass: ctx.user.isAdminSession === true,
      discordInviteUrl: "https://discord.gg/PGVmBGht7r",
    })),
    apiKeys: verifiedDeveloperProcedure.query(async ({ ctx }) => listApiKeys(ctx.user.id)),
    referrals: protectedProcedure.query(async ({ ctx }) => {
      try {
        const referrals = await getReferralOverview(ctx.user.id);
        if (referrals) return referrals;
      } catch (err) {
        console.warn("[Referrals] Failed to fetch referrals:", err);
      }
      return {
        code: "qr01",
        referrals: [],
        totalRewardNanos: 0,
        totalReferralTokens: 0,
        receivedRewardNanos: 0,
        wasReferred: false,
        receivedTokens: 0,
      };
    }),
    specialReferralGift: verifiedDeveloperProcedure.query(async ({ ctx }) => getSpecialReferralGiftStatus(ctx.user.id)),
    acknowledgeSpecialReferralGift: verifiedDeveloperProcedure.mutation(async ({ ctx }) => {
      const gift = await acknowledgeSpecialReferralGift(ctx.user.id);
      if (!gift) throw new TRPCError({ code: "NOT_FOUND", message: "No verified special referral gift is available for this account." });
      return gift;
    }),
    eventsSummary: protectedProcedure.query(async ({ ctx }) => {
      return await getUserEventsMilestoneSummary(ctx.user.id);
    }),
    createApiKey: verifiedDeveloperProcedure
      .input(
        z.object({
          label: apiKeyLabel,
          keyGroup: z.enum(["payg", "bundle", "token_plan", "tokens", "coding_plan"]).default("token_plan"),
          expiresAt: z.string().datetime().nullable().optional(),
          spendLimitTokens: z.number().int().positive().nullable().optional(),
          spendLimitNanos: z.number().int().positive().nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.isAdminSession && !ctx.user.discordVerifiedAt) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Discord verification is required to generate API keys. Please verify your Discord membership.",
          });
        }
        try {
          const normalizedKeyGroup = input.keyGroup === "bundle" ? "payg" : input.keyGroup;
          return await createApiKey(ctx.user.id, input.label, normalizedKeyGroup, {
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
            spendLimitTokens: input.spendLimitTokens,
            spendLimitNanos: input.spendLimitNanos,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Qronos AI could not create this key";
          throw new TRPCError({
            code: message.includes("Maximum limit of 10") ? "BAD_REQUEST" : message.includes("Discord") ? "FORBIDDEN" : "INTERNAL_SERVER_ERROR",
            message,
          });
        }
      }),
    revokeApiKey: verifiedDeveloperProcedure.input(z.object({ apiKeyId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const revoked = await revokeApiKey(ctx.user.id, input.apiKeyId);
      if (!revoked) throw new TRPCError({ code: "NOT_FOUND", message: "This active API key was not found or has already been deleted." });
      return { success: true } as const;
    }),
    deleteApiKey: verifiedDeveloperProcedure.input(z.object({ apiKeyId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const deleted = await revokeApiKey(ctx.user.id, input.apiKeyId);
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "This API key was not found or has already been deleted." });
      return { success: true } as const;
    }),
    rotateApiKey: verifiedDeveloperProcedure
      .input(z.object({ apiKeyId: z.number().int().positive(), label: apiKeyLabel, keyGroup: z.enum(["payg", "bundle", "token_plan", "tokens", "coding_plan"]).optional() }))
      .mutation(async ({ ctx, input }) => {
        const normalizedKeyGroup = input.keyGroup === "bundle" ? "payg" : input.keyGroup;
        const result = await rotateApiKey(ctx.user.id, input.apiKeyId, input.label, normalizedKeyGroup);
        if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "This active API key was not found" });
        return result;
      }),
    quota: protectedProcedure.query(async ({ ctx }) => {
      const quota = await getQuotaStatus(ctx.user.id);
      if (!quota) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Quota status is temporarily unavailable" });
      return quota;
    }),
    gpt6AstraQuota: publicProcedure.query(async () => {
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
    }),
    modelAvailability: protectedProcedure.query(() => getModelAvailabilitySnapshot()),
    usage: protectedProcedure.query(async ({ ctx }) => getUsageSummary(ctx.user.id)),
    usageLogs: protectedProcedure
      .input(z.object({
        modelId: tokenForgeModelId.optional(),
        source: z.enum(["api", "playground"]).optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }).optional())
      .query(({ ctx, input }) => getUsageLogs({
        userId: ctx.user.id,
        modelId: input?.modelId,
        source: input?.source,
        from: input?.from ? new Date(input.from) : undefined,
        to: input?.to ? new Date(input.to) : undefined,
        limit: input?.limit,
      })),
    wallet: protectedProcedure.query(async ({ ctx }) => {
      try {
        const wallet = await getCreditProfile(ctx.user.id);
        if (wallet) return wallet;
      } catch (err) {
        console.warn("[Wallet] Safe fallback for userId:", ctx.user.id, err);
      }
      return {
        userId: ctx.user.id,
        balanceNanos: 50_000_000_000,
        paygBalanceNanos: 0,
        codingPlanTokens: 10_000_000,
        creditsEnabled: true,
        canCheckIn: true,
        today: new Date().toISOString().slice(0, 10),
        ledger: [],
        checkins: [],
      };
    }),
    unreadGiveawayNotifications: verifiedDeveloperProcedure.query(({ ctx }) => listUnreadCreditGiveawayNotifications(ctx.user.id)),
    dismissGiveawayNotification: verifiedDeveloperProcedure
      .input(z.object({ notificationId: z.number().int().positive() }))
      .mutation(({ ctx, input }) => dismissCreditGiveawayNotification({ userId: ctx.user.id, notificationId: input.notificationId })),
    dodoPayments: verifiedDeveloperProcedure.query(async ({ ctx }) => {
      return await listUserDodoPayments(ctx.user.id);
    }),
    syncDodoPayments: verifiedDeveloperProcedure.mutation(async ({ ctx }) => {
      await syncDodoPaymentsFromApi();
      return await listUserDodoPayments(ctx.user.id);
    }),
    profile: protectedProcedure.query(({ ctx }) => ({
      id: ctx.user.id,
      name: ctx.user.name,
      email: ctx.user.email,
      role: ctx.user.role,
      tier: ctx.user.tier ?? "free",
      createdAt: ctx.user.createdAt,
      lastSignedIn: ctx.user.lastSignedIn,
      loginMethod: ctx.user.loginMethod,
    })),
    checkIn: verifiedDeveloperProcedure.mutation(async ({ ctx }) => {
      const result = await claimDailyCheckin(ctx.user.id);
      return result;
    }),
    claimDailyCheckin: verifiedDeveloperProcedure.mutation(async ({ ctx }) => {
      const result = await claimDailyCheckin(ctx.user.id);
      return result;
    }),
    playground: verifiedDeveloperProcedure
      .input(z.object({
        model: tokenForgeModelId,
        messages: z.array(playgroundMessage).min(1).max(100),
        maxOutputTokens: z.number().int().min(64).max(65_536).optional(),
        temperature: z.number().min(0).max(2).optional(),
        reasoningEffort: z.enum(["default", "low", "medium", "high", "xhigh", "max"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user.isAdminSession && !ctx.user.discordVerifiedAt) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Discord verification is required to use the Playground. Please verify your Discord membership.",
          });
        }
        try {
          return await runPlaygroundCompletion({
            userId: ctx.user.id,
            model: input.model,
            messages: input.messages,
            maxOutputTokens: input.maxOutputTokens,
            temperature: input.temperature,
            reasoningEffort: input.reasoningEffort,
            sourceIpHash: tokenForgeRequestIpHash(ctx.req),
          });
        } catch (error) {
          if (error instanceof TokenForgePlaygroundError) throw playgroundTrpcError(error);
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Qronos AI could not complete this Playground request" });
        }
      }),
  }),
  admin: router({
    unlock: publicProcedure.input(adminPasscodeInput).mutation(async ({ ctx, input }) => {
      if (ctx.user?.isAdminSession) return { unlocked: true, alreadyAdmin: true } as const;

      // 1. Dual-Scope: Check Global Failure Ceiling across all distributed IPs
      const globalThrottle = await getPasswordLoginThrottle(GLOBAL_ADMIN_UNLOCK_THROTTLE_IDENTIFIER);
      if (globalThrottle.blocked) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Administrator access is locked due to security violations across distributed networks. Try again in ${globalThrottle.retryAfterSeconds} seconds.`,
        });
      }

      // 2. Dual-Scope: Check Caller IP Throttle
      const identifier = adminUnlockThrottleIdentifier(ctx.req);
      const throttle = await getPasswordLoginThrottle(identifier);
      if (throttle.blocked) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Too many administrator passcode attempts. Try again in ${throttle.retryAfterSeconds} seconds.`,
        });
      }

      if (!verifyAdminPasscode(input.passcode)) {
        // Layer 3: Progressive Deliberate Latency and Jitter to throttle brute-force concurrency
        if (process.env.NODE_ENV !== "test") {
          const delayMs = 1000 + Math.floor(Math.random() * 300);
          await new Promise((r) => setTimeout(r, delayMs));
        }

        const failedAttempt = await recordFailedPasswordLogin(identifier);
        await recordFailedPasswordLogin(GLOBAL_ADMIN_UNLOCK_THROTTLE_IDENTIFIER);

        if (failedAttempt.blocked) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Too many administrator passcode attempts. Try again in ${failedAttempt.retryAfterSeconds} seconds.`,
          });
        }
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Incorrect administrator passcode" });
      }

      await clearFailedPasswordLogin(identifier);
      await clearFailedPasswordLogin(GLOBAL_ADMIN_UNLOCK_THROTTLE_IDENTIFIER);

      const administrator = await getOrCreateAdminSessionPrincipal();
      await clearLegacyAdministratorRoles();

      // Issue session version and strictly bounded 4-hour admin session (Layer 4)
      const sessionVersion = await getAuthSessionVersion();
      const token = await sdk.createSessionToken(administrator.openId, {
        expiresInMs: ADMIN_SESSION_MAX_AGE_MS,
        name: administrator.name ?? "Qronos Administrator",
        sessionVersion,
        isAdminSession: true,
      });
      ctx.res.cookie(COOKIE_NAME, token, {
        ...getSessionCookieOptions(ctx.req),
        maxAge: ADMIN_SESSION_MAX_AGE_MS,
      });
      await writeAuditEvent({
        actorUserId: administrator.id,
        targetUserId: administrator.id,
        action: "admin.passcode.unlocked",
        entityType: "administrator_session",
        entityId: String(administrator.id),
        metadata: { entry: "passcode_only" },
      });
      return { unlocked: true, alreadyAdmin: false, sessionVersion } as const;
    }),
    signOut: adminProcedure.mutation(async ({ ctx }) => {
      const token = (ctx.req.cookies as Record<string, string>)?.[COOKIE_NAME] ||
        (ctx.req.headers.authorization?.startsWith("Bearer ") ? ctx.req.headers.authorization.slice(7) : null);
      if (token) {
        sdk.revokeSessionToken(token);
      }
      ctx.res.clearCookie(COOKIE_NAME, getSessionCookieOptions(ctx.req));
      await writeAuditEvent({ actorUserId: ctx.user.id, targetUserId: ctx.user.id, action: "admin.self_revoked", entityType: "account", entityId: String(ctx.user.id) });
      return { success: true } as const;
    }),
    overview: adminProcedure.query(() => getAdminOverview()),
    listNotifications: adminProcedure.query(async () => {
      return await listAdminNotifications();
    }),
    createNotification: adminProcedure
      .input(
        z.object({
          title: z.string().trim().min(1, "Title is required").max(255),
          message: z.string().trim().min(1, "Message is required").max(5000),
          type: z.enum(["announcement", "update", "alert", "info"]).default("announcement").optional(),
          targetAudience: z.enum(["ALL", "SPECIFIC_EMAILS"]).default("ALL"),
          targetEmails: z.array(z.string().trim()).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const result = await createAdminNotification({
          title: input.title,
          message: input.message,
          type: input.type,
          targetAudience: input.targetAudience,
          targetEmails: input.targetEmails,
          adminUserId: ctx.user.id,
        });
        await writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "notification.created",
          entityType: "system_notification",
          entityId: String(result.id),
          metadata: { title: input.title, targetAudience: input.targetAudience, emailCount: input.targetEmails?.length ?? 0 },
        });
        return { success: true, ...result };
      }),
    deleteNotification: adminProcedure
      .input(z.object({ notificationId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        await deleteAdminNotification(input.notificationId);
        await writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "notification.deleted",
          entityType: "system_notification",
          entityId: String(input.notificationId),
        });
        return { success: true };
      }),
    generateNotificationDraft: adminProcedure
      .input(
        z.object({
          model: z.string().trim().default("claude-opus-5"),
          prompt: z.string().trim().min(2, "Explanation is required").max(3000),
          intent: z.enum(["announcement", "update", "alert", "info"]).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const systemPrompt = `You are the Qronos AI Announcement Generator.
Based on the operator's prompt, generate an executive, developer-focused broadcast notification.
Return strictly valid JSON with no markdown wrapping, no backticks, and no extra commentary:
{
  "title": "A punchy, concise notification title under 60 characters with a leading emoji",
  "message": "Clear, professional 2-3 sentence description of the update or alert.",
  "type": "announcement" | "update" | "alert" | "info"
}`;

        const userPrompt = `Operator Briefing: ${input.prompt}
${input.intent ? `Requested Notification Type: ${input.intent}` : ""}`;

        try {
          const completion = await runPlaygroundCompletion({
            userId: ctx.user.id,
            model: input.model as TokenForgeModelId,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.2,
            maxOutputTokens: 512,
            sourceIpHash: "admin-notification-generator",
          });

          const rawText = completion.content || "";
          let parsed: { title?: string; message?: string; type?: string } = {};

          try {
            parsed = JSON.parse(rawText.trim());
          } catch {
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              try {
                parsed = JSON.parse(jsonMatch[0]);
              } catch {}
            }
          }

          const fallbackType = input.intent || "announcement";
          const finalTitle = parsed.title?.trim() || `📢 ${input.prompt.slice(0, 40)}...`;
          const finalMessage = parsed.message?.trim() || input.prompt.trim();
          const finalType = (["announcement", "update", "alert", "info"].includes(parsed.type || "") ? parsed.type : fallbackType) as "announcement" | "update" | "alert" | "info";

          return {
            title: finalTitle,
            message: finalMessage,
            type: finalType,
            modelUsed: completion.model,
          };
        } catch (error: any) {
          console.error("[generateNotificationDraft] Error:", error);
          return {
            title: `📢 ${input.prompt.slice(0, 45)}`,
            message: input.prompt.trim(),
            type: input.intent || "announcement",
            modelUsed: input.model,
          };
        }
      }),
    safetyAudit: adminProcedure
      .input(
        z.object({
          limit: z.number().int().min(1).max(200).default(50),
          offset: z.number().int().min(0).default(0),
          search: z.string().optional(),
          triggerType: z.string().optional(),
          model: z.string().optional(),
        }).default({ limit: 50, offset: 0 })
      )
      .query(async ({ input }) => {
        return await listSafetyAuditLogs(input);
      }),
    clearSafetyAuditLogs: adminProcedure.mutation(async ({ ctx }) => {
      await clearSafetyAuditLogs();
      await writeAuditEvent({
        actorUserId: ctx.user.id,
        targetUserId: ctx.user.id,
        action: "admin.safety_audit_logs.cleared",
        entityType: "safety_audit",
        entityId: "all",
      });
      return { success: true };
    }),
    toggleUserMessageLogging: adminProcedure
      .input(
        z.object({
          userId: z.number().int().positive(),
          enabled: z.boolean(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const success = await setUserMessageLoggingEnabled(input.userId, input.enabled);
        if (!success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update user message logging status" });
        }
        await writeAuditEvent({
          actorUserId: ctx.user.id,
          targetUserId: input.userId,
          action: input.enabled ? "user.message_logging_enabled" : "user.message_logging_disabled",
          entityType: "user",
          entityId: String(input.userId),
        });
        return { success: true, userId: input.userId, enabled: input.enabled };
      }),
    userInteractionLogs: adminProcedure
      .input(
        z.object({
          userId: z.number().int().positive().optional(),
          search: z.string().optional(),
          model: z.string().optional(),
          limit: z.number().int().min(1).max(200).default(50).optional(),
          offset: z.number().int().min(0).default(0).optional(),
        }).default({})
      )
      .query(async ({ input }) => {
        return await listUserInteractionLogs({
          userId: input.userId,
          search: input.search,
          model: input.model,
          limit: input.limit,
          offset: input.offset,
        });
      }),
    clearUserInteractionLogs: adminProcedure
      .input(
        z.object({
          userId: z.number().int().positive().optional(),
        }).optional()
      )
      .mutation(async ({ ctx, input }) => {
        await clearUserInteractionLogs({ userId: input?.userId });
        await writeAuditEvent({
          actorUserId: ctx.user.id,
          targetUserId: input?.userId ?? ctx.user.id,
          action: input?.userId ? "user.interaction_logs.cleared_user" : "user.interaction_logs.cleared_all",
          entityType: "user_interaction_logs",
          entityId: input?.userId ? String(input.userId) : "all",
        });
        return { success: true };
      }),
    deleteUserInteractionLog: adminProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await deleteSingleUserInteractionLog(input.id);
        return { success: true };
      }),
    specialReferralCampaign: adminProcedure.query(async () => ({ ...(await getSpecialReferralCampaignAdminOverview()), link: buildSpecialReferralCampaignUrl(), bonusUsd: 150 })),
    inviteTracker: adminProcedure.query(async () => {
      return getInviteTrackerState();
    }),
    startInviteTracker: adminProcedure
      .input(z.object({ name: z.string().max(120).optional() }).optional())
      .mutation(async ({ ctx, input }) => {
        return startInviteTrackerSession(input?.name, ctx.user?.id);
      }),
    stopInviteTracker: adminProcedure.mutation(async ({ ctx }) => {
      return stopInviteTrackerSession(ctx.user?.id);
    }),
    deleteInviteTrackerHistory: adminProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ ctx, input }) => {
        await deleteInviteTrackerHistory(input.id, ctx.user?.id);
        return { success: true };
      }),
    clearInviteTrackerHistory: adminProcedure.mutation(async ({ ctx }) => {
      await clearAllInviteTrackerHistory(ctx.user?.id);
      return { success: true };
    }),
    inviteMilestoneConfig: adminProcedure.query(async () => {
      return await getInviteMilestoneCampaignConfig();
    }),
    saveInviteMilestoneConfig: adminProcedure
      .input(
        z.object({
          enabled: z.boolean().optional(),
          invitesRequired: z.number().int().min(1).max(1000),
          tokenGrantMillion: z.number().min(0).max(10000),
          paygGrantDollars: z.number().min(0).max(1000).optional(),
          expiryHours: z.number().int().min(1).max(8760),
          resetCampaignTimer: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const config = await saveInviteMilestoneCampaignConfig(input, ctx.user?.id);
        await writeAuditEvent({
          actorUserId: ctx.user?.id,
          action: "invite_milestone.config_updated",
          entityType: "platform_setting",
          entityId: "invite_milestone_campaign",
          metadata: input,
        });
        return config;
      }),
    inviteMilestoneGrantsOverview: adminProcedure.query(async () => {
      return await listAdminInviteMilestoneGrants(100);
    }),
    discordBotStatus: adminProcedure.query(async () => {
      return getDiscordBotLiveStatus();
    }),
    saveDiscordBotConfig: adminProcedure
      .input(
        z.object({
          enabled: z.boolean(),
          systemPrompt: z.string().min(10).max(20000),
          modelId: z.string().min(1),
          apiBaseUrl: z.string().min(1),
          apiKey: z.string().min(1),
          guildId: z.string().min(1),
          allowedChannelIds: z.array(z.string()),
          proactiveEnabled: z.boolean(),
          proactiveIntervalMinutes: z.number().int().min(5).max(1440),
          naughtyLevel: z.number().int().min(0).max(100),
          reactionProbability: z.number().int().min(0).max(100),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const updated = await saveDiscordBotConfig(input, ctx.user.id);
        await writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "discord_bot.config_updated",
          entityType: "platform_setting",
          entityId: "discord_bot_config",
          metadata: {
            enabled: input.enabled,
            modelId: input.modelId,
            naughtyLevel: input.naughtyLevel,
            proactiveEnabled: input.proactiveEnabled,
          },
        });
        return { success: true, config: updated };
      }),
    discordBotMembers: adminProcedure.query(async () => {
      return listDiscordMemberProfiles();
    }),
    deleteDiscordBotMember: adminProcedure
      .input(z.object({ discordUserId: z.string() }))
      .mutation(async ({ input }) => {
        const ok = await deleteDiscordMemberProfile(input.discordUserId);
        return { success: ok };
      }),
    restartDiscordBot: adminProcedure.mutation(async () => {
      await stopDiscordBotService();
      const restarted = await startDiscordBotService();
      return { success: restarted };
    }),
    discordBotChannelSummary: adminProcedure
      .input(z.object({ channelId: z.string().optional() }))
      .query(async ({ input }) => {
        const config = await getDiscordBotConfig();
        const chanId = input.channelId || config.allowedChannelIds[0] || "1562668900565393478";
        return getDiscordChannelSummary(chanId);
      }),
    sendDiscordBotMessage: adminProcedure
      .input(
        z.object({
          channelId: z.string().optional(),
          content: z.string().min(1).max(2000),
        })
      )
      .mutation(async ({ input }) => {
        return sendDiscordBotTestMessage(input.channelId, input.content);
      }),
    accounts: adminProcedure.input(adminAccountDirectoryInput).query(({ input }) => listAdminAccounts(input)),
    searchUsersForTier: adminProcedure
      .input(z.object({ query: z.string().default("") }))
      .query(async ({ input }) => {
        return await searchUsersForTierAssignment(input.query);
      }),
    assignUserTier: adminProcedure
      .input(z.object({
        userId: z.number().int().positive(),
        tier: z.enum(["free", "plus", "pro", "ultra", "enterprise", "starter", "max", "power"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const success = await setUserTier(input.userId, input.tier);
        if (!success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update user tier" });
        }
        await writeAuditEvent({
          actorUserId: ctx.user.id,
          targetUserId: input.userId,
          action: "user.tier_assigned",
          entityType: "user",
          entityId: String(input.userId),
          metadata: { tier: input.tier },
        });
        return { success: true, userId: input.userId, tier: input.tier };
      }),
    toggleUserCredits: adminProcedure
      .input(z.object({
        userId: z.number().int().positive(),
        enabled: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        const targetUser = await getUserById(input.userId);
        const emailLower = (targetUser?.email ?? "").trim().toLowerCase();
        if (emailLower === "konchoor@gmail.com" || emailLower === "kumaryush18@gmail.com") {
          if (!input.enabled) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Credit system is permanently enabled for this key developer account and cannot be disabled.",
            });
          }
        }
        const success = await setUserCreditsEnabled(input.userId, input.enabled);
        if (!success) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update credits status" });
        }
        await writeAuditEvent({
          actorUserId: ctx.user.id,
          targetUserId: input.userId,
          action: input.enabled ? "user.credits_enabled" : "user.credits_disabled",
          entityType: "user",
          entityId: String(input.userId),
          metadata: { creditsEnabled: input.enabled },
        });
        return { success: true, userId: input.userId, creditsEnabled: input.enabled };
      }),
    preProvisionedAccounts: adminProcedure.query(() => listAdminPreProvisionedAccounts()),
    preProvisionAccount: adminProcedure.input(adminPreProvisionAccountInput).mutation(async ({ ctx, input }) => {
      const result = await preProvisionAccountEmail({ email: input.email, provisionedByUserId: ctx.user.id });
      if (result.kind === "created") {
        const emailDomain = result.email.split("@")[1] ?? "unknown";
        await writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "account.pre_provisioned",
          entityType: "pre_provisioned_account",
          entityId: String(result.reservationId),
          metadata: { emailDomain, introductoryCreditNanos: result.introductoryCreditNanos },
        });
      }
      return result;
    }),
    deletePreProvisionedAccount: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const deleted = await deletePreProvisionedAccount(input.id);
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Reservation not found" });
      await writeAuditEvent({
        actorUserId: ctx.user.id,
        action: "account.pre_provision_deleted",
        entityType: "pre_provisioned_account",
        entityId: String(input.id),
      });
      return { success: true } as const;
    }),
    accountModelUsage: adminProcedure.input(z.object({ userIds: z.array(z.number().int().positive()).min(1).max(10) })).query(({ input }) => getAdminAccountModelUsage(input.userIds)),
    activity: adminProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(40) }).optional()).query(({ input }) => listAdminAuditEvents(input?.limit ?? 40)),
    auditExport: adminProcedure.query(() => getAdminAuditExport()),
    pinnedUserRoutingPolicy: adminProcedure.query(() => getPinnedUserRoutingPolicy()),
    setPinnedUserRoutingPolicy: adminProcedure.input(z.object({ softPreference: z.boolean() })).mutation(async ({ ctx, input }) => {
      const policy = await setPinnedUserRoutingPolicy(input.softPreference, ctx.user.id);
      await writeAuditEvent({
        actorUserId: ctx.user.id,
        action: input.softPreference ? "routing.pinned_user.soft_preference" : "routing.pinned_user.strict_lock",
        entityType: "platform_setting",
        entityId: "pinned_user_routing_policy",
      });
      return policy;
    }),
    platformMaintenance: adminProcedure.query(() => getPlatformMaintenanceConfig()),
    playgroundMaintenance: adminProcedure.query(() => getPlaygroundMaintenanceConfig()),
    setPlaygroundMaintenance: adminProcedure.input(z.object({ enabled: z.boolean() })).mutation(async ({ ctx, input }) => {
      const maintenance = await setPlaygroundMaintenanceConfig(input.enabled, ctx.user.id);
      await writeAuditEvent({ actorUserId: ctx.user.id, action: input.enabled ? "playground.maintenance.enabled" : "playground.maintenance.disabled", entityType: "platform_setting", entityId: "playground_maintenance" });
      return maintenance;
    }),
    setPlatformMaintenance: adminProcedure.input(z.object({ enabled: z.boolean() })).mutation(async ({ ctx, input }) => {
      const maintenance = await setPlatformMaintenanceConfig(input.enabled, ctx.user.id);
      await writeAuditEvent({ actorUserId: ctx.user.id, action: input.enabled ? "platform.maintenance.enabled" : "platform.maintenance.disabled", entityType: "platform_setting", entityId: "platform_maintenance" });
      return maintenance;
    }),
    platformMaintenanceMessages: adminProcedure.query(() => getPlatformMaintenanceMessages()),
    setPlatformMaintenanceMessages: adminProcedure.input(z.object({
      defaultMessage: z.string().max(1000).optional(),
      free: z.string().max(1000).optional(),
      starter: z.string().max(1000).optional(),
      pro: z.string().max(1000).optional(),
      max: z.string().max(1000).optional(),
      power: z.string().max(1000).optional(),
      ultra: z.string().max(1000).optional(),
    })).mutation(async ({ ctx, input }) => {
      const messages = await setPlatformMaintenanceMessages(input, ctx.user.id);
      await writeAuditEvent({
        actorUserId: ctx.user.id,
        action: "platform.maintenance_messages.updated",
        entityType: "platform_setting",
        entityId: "platform_maintenance_messages",
      });
      return messages;
    }),

    modelPricingTable: adminProcedure
      .input(z.object({ tier: z.enum(["payg", "bundle"]).default("payg").optional() }).optional())
      .query(async ({ input }) => await getAllEffectiveModelPricing(input?.tier ?? "payg")),
    updateModelPricing: adminProcedure.input(z.object({
      modelId: z.string().min(1, "Model ID is required"),
      inputUsdPerMillion: z.number().min(0, "Input price must be non-negative").max(10_000, "Input price is too large"),
      outputUsdPerMillion: z.number().min(0, "Output price must be non-negative").max(10_000, "Output price is too large"),
      tier: z.enum(["payg", "bundle"]).default("payg").optional(),
    })).mutation(async ({ ctx, input }) => {
      const tier = input.tier ?? "payg";
      await setModelPricingOverride(input.modelId, { inputUsdPerMillion: input.inputUsdPerMillion, outputUsdPerMillion: input.outputUsdPerMillion }, tier, ctx.user.id);
      await writeAuditEvent({
        actorUserId: ctx.user.id,
        action: tier === "payg" ? "model.payg_pricing.updated" : "model.pricing.updated",
        entityType: "model_pricing",
        entityId: input.modelId,
        metadata: { inputUsdPerMillion: input.inputUsdPerMillion, outputUsdPerMillion: input.outputUsdPerMillion, tier },
      });
      return await getAllEffectiveModelPricing(tier);
    }),
    resetModelPricing: adminProcedure.input(z.object({
      modelId: z.string().min(1, "Model ID is required"),
      tier: z.enum(["payg", "bundle"]).default("payg").optional(),
    })).mutation(async ({ ctx, input }) => {
      const tier = input.tier ?? "payg";
      await resetModelPricingOverride(input.modelId, tier, ctx.user.id);
      await writeAuditEvent({
        actorUserId: ctx.user.id,
        action: tier === "payg" ? "model.payg_pricing.reset" : "model.pricing.reset",
        entityType: "model_pricing",
        entityId: input.modelId,
        metadata: { tier },
      });
      return await getAllEffectiveModelPricing(tier);
    }),
    
    gpt6AstraPremiumExemptions: adminProcedure.query(() => getGpt6AstraPremiumExemptions()),
    setGpt6AstraPremiumExemption: adminProcedure.input(z.object({
      email: z.string().email("Enter a valid email address"),
    })).mutation(async ({ ctx, input }) => {
      const exemptions = await setGpt6AstraPremiumExemption(input.email, ctx.user.id);
      await writeAuditEvent({ actorUserId: ctx.user.id, action: "gpt6_astra_premium_exemption_added", entityType: "user", entityId: input.email, metadata: { email: input.email } });
      return exemptions;
    }),
    removeGpt6AstraPremiumExemption: adminProcedure.input(z.object({
      email: z.string(),
    })).mutation(async ({ ctx, input }) => {
      const exemptions = await removeGpt6AstraPremiumExemption(input.email, ctx.user.id);
      await writeAuditEvent({ actorUserId: ctx.user.id, action: "gpt6_astra_premium_exemption_removed", entityType: "user", entityId: input.email, metadata: { email: input.email } });
      return exemptions;
    }),

    platformMaintenanceExemptions: adminProcedure.query(() => getPlatformMaintenanceExemptions()),
    setPlatformMaintenanceExemption: adminProcedure.input(z.object({
      email: z.string().email(),
      status: z.enum(["allowed", "restricted"]),
    })).mutation(async ({ ctx, input }) => {
      const exemptions = await setPlatformMaintenanceExemption(input.email, input.status, ctx.user.id);
      await writeAuditEvent({
        actorUserId: ctx.user.id,
        action: input.status === "allowed" ? "platform.maintenance.exemption_allowed" : "platform.maintenance.exemption_restricted",
        entityType: "platform_setting",
        entityId: "platform_maintenance_exemptions",
        metadata: { email: input.email, status: input.status },
      });
      return exemptions;
    }),
    removePlatformMaintenanceExemption: adminProcedure.input(z.object({
      email: z.string().email(),
    })).mutation(async ({ ctx, input }) => {
      const exemptions = await removePlatformMaintenanceExemption(input.email, ctx.user.id);
      await writeAuditEvent({
        actorUserId: ctx.user.id,
        action: "platform.maintenance.exemption_removed",
        entityType: "platform_setting",
        entityId: "platform_maintenance_exemptions",
        metadata: { email: input.email },
      });
      return exemptions;
    }),
    resumeTimedMaintenance: adminProcedure.mutation(async ({ ctx }) => {
      const maintenance = await resumePlatformAfterTimedMaintenance(ctx.user.id);
      await writeAuditEvent({ actorUserId: ctx.user.id, action: "platform.maintenance.timed_resumed", entityType: "platform_setting", entityId: "platform_maintenance" });
      return maintenance;
    }),
    maintenanceCountdown: adminProcedure.query(() => getMaintenanceCountdown()),
    setMaintenanceCountdown: adminProcedure.input(maintenanceCountdownInput).mutation(async ({ ctx, input }) => {
      const countdown = await setMaintenanceCountdown(input, ctx.user.id);
      await writeAuditEvent({
        actorUserId: ctx.user.id,
        action: input ? "platform.maintenance_countdown.started" : "platform.maintenance_countdown.cleared",
        entityType: "platform_setting",
        entityId: "maintenance_countdown_v1",
        metadata: input ? { durationMs: input.durationMs } : undefined,
      });
      return countdown;
    }),
    discordVerifiedGiveawayRecipients: adminProcedure.query(async () => ({ count: await countDiscordVerifiedAccounts() })),
    giveawayHistory: adminProcedure.query(() => listCreditGiveawayHistory()),
    giveDiscordVerifiedAccountsCredit: adminProcedure.input(discordVerifiedGiveawayInput).mutation(async ({ ctx, input }) => {
      const amountNanos = Math.round(input.amountUsd * 1_000_000_000);
      let result: Awaited<ReturnType<typeof grantDiscordVerifiedAccountGiveaway>>;
      try {
        result = await grantDiscordVerifiedAccountGiveaway({ actorUserId: ctx.user.id, amountNanos, expectedRecipientCount: input.expectedRecipientCount, announcementNote: input.announcementNote });
      } catch (error) {
        console.error("[TokenForge giveaway persistence failure]", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "The giveaway could not be completed. No giveaway credit was applied; review the recipient count and try again.",
        });
      }
      if (!result.applied) {
        throw new TRPCError({ code: "CONFLICT", message: `The verified recipient set changed from ${input.expectedRecipientCount} to ${result.recipientCount} accounts. Review the updated count and confirm again.` });
      }
      await writeAuditEvent({
        actorUserId: ctx.user.id,
        action: "account.discord_verified.giveaway_credited",
        entityType: "credit_giveaway",
        entityId: result.id ?? "discord_verified",
        metadata: { amountNanos: result.amountNanos, recipientCount: result.recipientCount, totalAmountNanos: result.totalAmountNanos, hasAnnouncementNote: Boolean(input.announcementNote?.trim()) },
      });
      return result;
    }),
    discordUnverifiedAccountCleanup: adminProcedure.query(async () => ({ count: await countDiscordUnverifiedAccounts() })),
    deleteDiscordUnverifiedAccounts: adminProcedure.input(discordUnverifiedCleanupInput).mutation(async ({ ctx, input }) => {
      const currentCount = await countDiscordUnverifiedAccounts();
      if (currentCount !== input.expectedCount) {
        throw new TRPCError({ code: "CONFLICT", message: `The cleanup set changed from ${input.expectedCount} to ${currentCount} accounts. Review the updated count and confirm again.` });
      }
      const result = await deleteDiscordUnverifiedAccounts();
      await writeAuditEvent({ actorUserId: ctx.user.id, action: "account.discord_unverified.bulk_deleted", entityType: "account_cleanup", entityId: "discord_unverified", metadata: { deletedCount: result.deletedCount } });
      return result;
    }),
    deleteAccount: adminProcedure.input(permanentAccountDeleteInput).mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "The active administrator account cannot be deleted from the control plane" });
      const deleted = await deleteAccountPermanently(input.userId);
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "This account no longer exists" });
      await writeAuditEvent({ actorUserId: ctx.user.id, action: "account.permanently_deleted", entityType: "deleted_account", entityId: String(input.userId) });
      return { success: true } as const;
    }),
    addAccountCredit: adminProcedure.input(adminCreditGrantInput).mutation(async ({ ctx, input }) => {
      const balanceType = input.balanceType ?? "payg";
      const amountNanos = balanceType === "tokens" ? 0 : Math.round(input.amountUsd * 1_000_000_000);
      const amountTokens = balanceType === "tokens" ? Math.round(input.amountUsd * 1_000_000) : undefined;
      const result = await grantAdminAccountCredit({ userId: input.userId, amountNanos, amountTokens, actorUserId: ctx.user.id, balanceType });
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "This account no longer exists" });
      await writeAuditEvent({
        actorUserId: ctx.user.id,
        targetUserId: input.userId,
        action: balanceType === "tokens" ? "account.coding_tokens_granted" : "account.payg_balance_granted",
        entityType: "account",
        entityId: String(input.userId),
        metadata: { amountNanos: result.amountNanos, amountTokens: (result as any).amountTokens, balanceType, balanceNanos: result.balanceNanos, paygBalanceNanos: result.paygBalanceNanos, codingPlanTokens: (result as any).codingPlanTokens },
      });
      return result;
    }),
    setAccountCredit: adminProcedure.input(setAccountCreditInput).mutation(async ({ ctx, input }) => {
      const balanceType = input.balanceType ?? "payg";
      const targetAmountNanos = balanceType === "tokens" ? 0 : Math.round(input.targetAmountUsd * 1_000_000_000);
      const targetTokens = balanceType === "tokens" ? Math.round(input.targetAmountUsd * 1_000_000) : undefined;
      const result = await setAdminAccountCredit({
        userId: input.userId,
        targetAmountNanos,
        targetTokens,
        actorUserId: ctx.user.id,
        balanceType,
        note: input.note,
      });
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "This account no longer exists" });
      await writeAuditEvent({
        actorUserId: ctx.user.id,
        targetUserId: input.userId,
        action: balanceType === "tokens" ? "account.coding_tokens_set" : "account.payg_balance_set",
        entityType: "account",
        entityId: String(input.userId),
        metadata: {
          targetAmountUsd: input.targetAmountUsd,
          targetAmountNanos: result.targetAmountNanos,
          targetTokens: (result as any).targetTokens,
          diffNanos: result.diffNanos,
          diffTokens: (result as any).diffTokens,
          balanceType,
          balanceNanos: result.balanceNanos,
          paygBalanceNanos: result.paygBalanceNanos,
          codingPlanTokens: (result as any).codingPlanTokens,
          note: input.note,
        },
      });
      return result;
    }),
    setAllUsersCredit: adminProcedure.input(setAllUsersCreditInput).mutation(async ({ ctx, input }) => {
      const amountNanos = Math.round(input.amountUsd * 1_000_000_000);
      const result = await setAllUsersCreditBalance({ targetAmountNanos: amountNanos, actorUserId: ctx.user.id, note: input.note });
      await writeAuditEvent({
        actorUserId: ctx.user.id,
        action: "account.all_users_credit_set",
        entityType: "credit_account",
        metadata: { amountUsd: input.amountUsd, amountNanos, updatedCount: result.updatedCount, note: input.note },
      });
      return result;
    }),
    grantAllUsersPayg: adminProcedure
      .input(
        z.object({
          amountUsd: z.number().positive().max(1000).default(5),
          note: z.string().max(256).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const result = await grantAllUsersPaygBalance({
          amountDollars: input.amountUsd,
          actorUserId: ctx.user.id,
          note: input.note,
        });
        await writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "account.all_users_payg_granted",
          entityType: "credit_account",
          metadata: { amountUsd: input.amountUsd, updatedCount: result.updatedCount, note: input.note },
        });
        return result;
      }),
    grantAllUsersTokenPlan: adminProcedure
      .input(
        z.object({
          tokensMillion: z.number().positive().max(100_000).default(100),
          note: z.string().max(256).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const result = await grantAllUsersTokenPlan({
          tokensMillion: input.tokensMillion,
          actorUserId: ctx.user.id,
          note: input.note,
        });
        await writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "account.all_users_token_plan_granted",
          entityType: "credit_account",
          metadata: {
            tokensMillion: input.tokensMillion,
            tokensAdded: result.tokensAdded,
            updatedCount: result.updatedCount,
            note: input.note,
          },
        });
        return result;
      }),
    resetDiscordVerification: adminProcedure.input(discordVerificationResetInput).mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Administrator sessions bypass Discord verification and cannot be reset from the control plane" });
      }
      const result = await resetDiscordVerification(input.userId);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "This account no longer exists" });
      await writeAuditEvent({
        actorUserId: ctx.user.id,
        targetUserId: input.userId,
        action: "account.discord_verification.reset",
        entityType: "account",
        entityId: String(input.userId),
        metadata: { verificationWasPresent: result.reset },
      });
      return { success: true, reset: result.reset } as const;
    }),
    bypassDiscordVerification: adminProcedure
      .input(z.object({ email: z.string().trim().min(3) }))
      .mutation(async ({ ctx, input }) => {
        const result = await bypassDiscordVerificationByEmail(input.email);
        if (!result.found || !result.user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `User with email "${input.email}" does not exist in the database.`,
          });
        }
        await writeAuditEvent({
          actorUserId: ctx.user.id,
          targetUserId: result.user.id,
          action: "account.discord_verification.bypassed",
          entityType: "account",
          entityId: String(result.user.id),
          metadata: {
            email: result.user.email,
            wasAlreadyVerified: result.alreadyVerified,
            tokensAwarded: result.user.tokensAwarded,
            bypassedByAdmin: true,
          },
        });
        const userObj = await getUserByEmail(input.email);
        if (userObj?.openId) {
          invalidateSessionAuthCache(userObj.openId);
        }
        return result;
      }),
    discordVerifiedAccountsList: adminProcedure
      .input(z.object({ limit: z.number().int().min(1).max(200).default(50).optional() }).optional())
      .query(async ({ input }) => {
        return await listDiscordVerifiedAccounts(input?.limit ?? 50);
      }),
    flags: adminProcedure.query(() => listOpenFlags()),
    accessRequests: adminProcedure
      .input(
        z
          .object({
            status: z.enum(["all", "pending", "approved", "denied"]).default("all").optional(),
            limit: z.number().int().min(1).max(200).default(100).optional(),
          })
          .optional()
      )
      .query(({ input }) =>
        listAccessRequests({ status: input?.status ?? "all", limit: input?.limit ?? 100 })
      ),
    approveAccessRequest: adminProcedure
      .input(
        z.object({
          id: z.string().min(1),
          note: z.string().max(500).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const result = await approveAccessRequest({
            id: input.id,
            actorUserId: ctx.user.id,
            note: input.note,
          });
          await writeAuditEvent({
            actorUserId: ctx.user.id,
            action: "access_request.approved",
            entityType: "access_request",
            entityId: input.id,
            metadata: { email: result.email, note: input.note },
          });
          return result;
        } catch (error: any) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error?.message || "Failed to approve access request",
          });
        }
      }),
    denyAccessRequest: adminProcedure
      .input(
        z.object({
          id: z.string().min(1),
          note: z.string().max(500).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const result = await denyAccessRequest({
            id: input.id,
            actorUserId: ctx.user.id,
            note: input.note,
          });
          await writeAuditEvent({
            actorUserId: ctx.user.id,
            action: "access_request.denied",
            entityType: "access_request",
            entityId: input.id,
            metadata: { email: result.email, note: result.adminNote },
          });
          return result;
        } catch (error: any) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error?.message || "Failed to deny access request",
          });
        }
      }),
    emailAllowlist: adminProcedure.query(async () => {
      const saved = await getEmailAllowlistConfig();
      return {
        entries: saved?.entries ?? Array.from(configuredEmailAllowlist()),
        updatedAt: saved?.updatedAt ?? null,
        updatedByUserId: saved?.updatedByUserId ?? null,
        source: saved ? "database" as const : "environment" as const,
      };
    }),
    setEmailAllowlist: adminProcedure
      .input(z.object({ entries: z.array(z.string().trim().min(3).max(320)).max(250) }))
      .mutation(async ({ ctx, input }) => {
        try {
          const saved = await setEmailAllowlistConfig(input.entries, ctx.user.id);
          await writeAuditEvent({ actorUserId: ctx.user.id, action: "email.allowlist.updated", entityType: "platform_setting", entityId: "email_allowlist", metadata: { entryCount: saved.entries.length } });
          return saved;
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Qronos AI could not save the email allowlist" });
        }
      }),
    orcaRouterCredentials: adminProcedure.query(() => getOrcaRouterCredentialPoolStatus()),
    orcaRouterSlotUsage: adminProcedure.query(() => getOrcaRouterSlotRequestCounts()),
    claudeFable5ProviderSettings: adminProcedure.query(() => getClaudeFable5NvidiaProviderSettings()),
    claudeFable5FailureLogs: adminProcedure.query(async () => (await getRecentClaudeFable5FailureLogs(200)).map(entry => ({ ...entry, publicMessage: PUBLIC_PROVIDER_ERROR_MESSAGE }))),
    updateClaudeFable5ProviderSettings: adminProcedure.input(claudeFable5ProviderSettingsInput).mutation(async ({ ctx, input }) => {
      try {
        const settings = await updateClaudeFable5NvidiaProviderSettings(input, ctx.user.id);
        await writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "provider.claude_fable5.runtime_updated",
          entityType: "provider",
          entityId: "claude-fable-5.1",
          metadata: {
            providerCount: "providers" in input ? input.providers.length : 1,
            configuredKeySlots: "providers" in input ? input.providers.reduce((count, provider) => count + provider.apiKeys.filter(value => Boolean(value.trim())).length, 0) : (input.apiKeys?.filter(value => Boolean(value.trim())).length ?? 0),
          },
        });
        return settings;
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Qronos AI could not save Claude Fable 5.1 provider settings" });
      }
    }),
    claudeOpus5ProviderSettings: adminProcedure.query(() => getClaudeOpus5ProviderSettings()),
    claudeOpus5FailureLogs: adminProcedure.query(async () => (await getRecentClaudeOpus5FailureLogs(200)).map(entry => ({ ...entry, publicMessage: PUBLIC_PROVIDER_ERROR_MESSAGE }))),
    bailuWebshareProxyPoolSettings: adminProcedure.query(() => getBailuWebshareProxyPoolSettings()),
    updateBailuWebshareProxyPoolSettings: adminProcedure.input(bailuWebshareProxyPoolInput).mutation(async ({ ctx, input }) => {
      try {
        const settings = await updateBailuWebshareProxyPoolSettings(input, ctx.user.id);
        await writeAuditEvent({ actorUserId: ctx.user.id, action: "provider.claude_opus5.bailu_webshare_proxy_pool_updated", entityType: "provider", entityId: "bailu", metadata: { enabled: settings.enabled, proxyCount: settings.proxies.length } });
        return settings;
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Qronos AI could not save the Bailu Webshare proxy pool" });
      }
    }),
    deepseekV4ProFailureLogs: adminProcedure.query(async () => (await getRecentDeepseekV4ProFailureLogs(200)).map(entry => ({ ...entry, publicMessage: PUBLIC_PROVIDER_ERROR_MESSAGE }))),
    qwen38MaxProviderSettings: adminProcedure.query(() => getQwen38MaxProviderSettings()),
    updateQwen38MaxProviderSettings: adminProcedure.input(claudeOpus5ProviderSettingsInput).mutation(async ({ ctx, input }) => {
      const settings = await updateQwen38MaxProviderSettings(input, ctx.user.id);
      await writeAuditEvent({ actorUserId: ctx.user.id, action: "qwen38_max_provider_settings_updated", entityType: "provider", entityId: "qwen3.8-max", metadata: { providerCount: input.providers.length } });
      return settings;
    }),
    qwen38MaxFailureLogs: adminProcedure.query(async () => (await getRecentQwen38MaxFailureLogs(200)).map(entry => ({ ...entry, publicMessage: PUBLIC_PROVIDER_ERROR_MESSAGE }))),
    gpt6AstraProviderSettings: adminProcedure.query(() => getGpt6AstraProviderSettings()),
    updateGpt6AstraProviderSettings: adminProcedure.input(claudeOpus5ProviderSettingsInput).mutation(async ({ ctx, input }) => {
      const settings = await updateGpt6AstraProviderSettings(input, ctx.user.id);
      await writeAuditEvent({ actorUserId: ctx.user.id, action: "gpt6_astra_provider_settings_updated", entityType: "provider", entityId: "gpt-6-astra", metadata: { providerCount: input.providers.length } });
      return settings;
    }),
    gpt6AstraFailureLogs: adminProcedure.query(async () => (await getRecentGpt6AstraFailureLogs(200)).map(entry => ({ ...entry, publicMessage: PUBLIC_PROVIDER_ERROR_MESSAGE }))),
    kimiK3ProviderSettings: adminProcedure.query(() => getKimiK3ProviderSettings()),
    updateKimiK3ProviderSettings: adminProcedure.input(claudeOpus5ProviderSettingsInput).mutation(async ({ ctx, input }) => {
      const settings = await updateKimiK3ProviderSettings(input, ctx.user.id);
      await writeAuditEvent({ actorUserId: ctx.user.id, action: "kimi_k3_provider_settings_updated", entityType: "provider", entityId: "kimi-k3", metadata: { providerCount: input.providers.length } });
      return settings;
    }),
    kimiK3FailureLogs: adminProcedure.query(async () => (await getRecentKimiK3FailureLogs(200)).map(entry => ({ ...entry, publicMessage: PUBLIC_PROVIDER_ERROR_MESSAGE }))),
    universalModelProviderSettings: adminProcedure
      .input(z.object({ modelId: z.string().trim().min(1) }))
      .query(async ({ input }) => getUniversalModelProviderSettings(input.modelId)),
    updateUniversalModelProviderSettings: adminProcedure
      .input(universalModelProviderSettingsInput)
      .mutation(async ({ ctx, input }) => {
        try {
          const settings = await updateUniversalModelProviderSettings(input, ctx.user.id);
          await writeAuditEvent({
            actorUserId: ctx.user.id,
            action: "universal_model_provider_settings_updated",
            entityType: "provider",
            entityId: input.modelId,
            metadata: { providerCount: input.providers.length, modelId: input.modelId },
          });
          return settings;
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error instanceof Error ? error.message : "Qronos AI could not save universal model provider settings",
          });
        }
      }),
    listUniversalModels: adminProcedure.query(async () => listUniversalConfiguredModels()),
    modelCompactScaling: adminProcedure
      .input(z.object({ modelId: z.string().trim().min(1) }))
      .query(async ({ input }) => getModelCompactScalingConfig(input.modelId)),
    universalModelKeyMetrics: adminProcedure
      .input(z.object({ modelId: z.string().trim().min(1) }))
      .query(async ({ input }) => getUniversalModelKeyMetricGroup(input.modelId)),
    universalModelFailureLogs: adminProcedure
      .input(z.object({
        modelId: z.string().trim().min(1),
        limit: z.number().int().min(1).max(200).default(100),
      }))
      .query(async ({ input }) => {
        const logs = await getRecentModelFailureLogs(input.modelId, input.limit);
        return logs.map(entry => ({ ...entry, publicMessage: PUBLIC_PROVIDER_ERROR_MESSAGE }));
      }),
    updateClaudeOpus5ProviderSettings: adminProcedure.input(claudeOpus5ProviderSettingsInput).mutation(async ({ ctx, input }) => {
      try {
        const settings = await updateClaudeOpus5ProviderSettings(input, ctx.user.id);
        await writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "provider.claude_opus5.runtime_updated",
          entityType: "provider",
          entityId: "claude-opus-5",
          metadata: {
            providerCount: input.providers.length,
            providerIds: input.providers.map(provider => provider.id),
            configuredKeySlots: input.providers.reduce((count, provider) => count + provider.apiKeys.filter(value => Boolean(value.trim())).length, 0),
          },
        });
        return settings;
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Qronos AI could not save Claude Opus 5 provider settings" });
      }
    }),
    setClaudeOpus5BaiPriority: adminProcedure.input(z.object({ enabled: z.boolean() })).mutation(async ({ ctx, input }) => {
      try {
        const settings = await setClaudeOpus5BaiPriority(input.enabled, ctx.user.id);
        await writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "provider.claude_opus5.bai_priority_updated",
          entityType: "provider",
          entityId: "b.ai",
          metadata: { baiPriority: input.enabled },
        });
        return settings;
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Qronos AI could not update b.ai priority" });
      }
    }),
    deleteClaudeOpus5QwenModel: adminProcedure.input(claudeOpus5QwenModelDeleteInput).mutation(async ({ ctx, input }) => {
      try {
        const settings = await deleteClaudeOpus5QwenModel(input, ctx.user.id);
        await writeAuditEvent({ actorUserId: ctx.user.id, action: "provider.claude_opus5.qwen_model_deleted", entityType: "provider", entityId: input.providerId, metadata: { modelEntryId: input.modelEntryId } });
        return settings;
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Qronos AI could not delete the Qwen model" });
      }
    }),
    deleteClaudeOpus5QwenApiKey: adminProcedure.input(claudeOpus5QwenApiKeyDeleteInput).mutation(async ({ ctx, input }) => {
      try {
        const settings = await deleteClaudeOpus5QwenApiKey(input, ctx.user.id);
        await writeAuditEvent({ actorUserId: ctx.user.id, action: "provider.claude_opus5.qwen_key_deleted", entityType: "provider", entityId: input.providerId, metadata: { slot: input.slot } });
        return settings;
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Qronos AI could not delete the Qwen API key" });
      }
    }),
    glm53ProviderSettings: adminProcedure.query(() => getGlm53ProviderSettings()),
    glm53FailureLogs: adminProcedure.query(async () => (await getRecentGlm53FailureLogs(200)).map(entry => ({ ...entry, publicMessage: PUBLIC_PROVIDER_ERROR_MESSAGE }))),
    updateGlm53ProviderSettings: adminProcedure.input(glm53ProviderSettingsInput).mutation(async ({ ctx, input }) => {
      try {
        const settings = await updateGlm53ProviderSettings(input, ctx.user.id);
        await writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "provider.glm53.runtime_updated",
          entityType: "provider",
          entityId: "glm-5.3",
          metadata: {
            providerCount: "providers" in input ? input.providers.length : 1,
            providerIds: "providers" in input ? input.providers.map(p => p.id) : ["primary"],
          },
        });
        return settings;
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Qronos AI could not save GLM 5.3 provider settings" });
      }
    }),
    sonnet46ProviderSettings: adminProcedure.query(() => getSonnet46ProviderSettings()),
    sonnet46FailureLogs: adminProcedure.query(async () => (await getRecentSonnet46FailureLogs(200)).map(entry => ({ ...entry, publicMessage: PUBLIC_PROVIDER_ERROR_MESSAGE }))),
    updateSonnet46ProviderSettings: adminProcedure.input(sonnet46ProviderSettingsInput).mutation(async ({ ctx, input }) => {
      try {
        const settings = await updateSonnet46ProviderSettings(input, ctx.user.id);
        await writeAuditEvent({ actorUserId: ctx.user.id, action: "provider.sonnet46.runtime_updated", entityType: "provider", entityId: "claude-sonnet-4.6", metadata: { providerGroups: input.providers.length, enabledProviderGroups: input.providers.filter(provider => provider.enabled !== false).length } });
        return settings;
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Qronos AI could not save Claude Sonnet 4.6 provider settings" });
      }
    }),
    deepseekV4ProProviderSettings: adminProcedure.query(() => getDeepseekV4ProProviderSettings()),
    updateDeepseekV4ProProviderSettings: adminProcedure.input(deepseekV4ProProviderSettingsInput).mutation(async ({ ctx, input }) => {
      try {
        const settings = await updateDeepseekV4ProProviderSettings(input, ctx.user.id);
        await writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "provider.deepseek_v4_pro.runtime_updated",
          entityType: "provider",
          entityId: "deepseek-v4-pro",
          metadata: "providers" in input ? {
            providerGroups: input.providers.length,
            enabledProviderGroups: input.providers.filter(provider => provider.enabled !== false).length,
            submittedApiKeySlots: input.providers.reduce((total, provider) => total + provider.apiKeys.filter(value => Boolean(value.trim())).length, 0),
            removedApiKeySlots: input.providers.reduce((total, provider) => total + (provider.removeSlots?.length ?? 0), 0),
          } : {
            legacyCompatibilityUpdate: true,
            baseUrlChanged: input.baseUrl !== undefined,
            modelChanged: input.model !== undefined,
            apiKeySlotsChanged: (input.apiKeys?.filter(value => Boolean(value.trim())).length ?? 0) + (input.removeSlots?.length ?? 0),
          },
        });
        return settings;
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Qronos AI could not save DeepSeek V4 Pro provider settings" });
      }
    }),
    replaceOrcaRouterCredentials: adminProcedure
      .input(orcaRouterCredentialPoolInput)
      .mutation(async ({ ctx, input }) => {
        try {
          for (const credential of input.credentials) await validateOrcaRouterCredential(credential);
          const slots = await replaceOrcaRouterCredentialPool(input.credentials, ctx.user.id);
          invalidateOrcaRouterCredentialPool();
          await writeAuditEvent({
            actorUserId: ctx.user.id,
            action: "provider.orcarouter.credentials_rotated",
            entityType: "provider",
            entityId: CLAUDE_OPUS5_PROVIDER_SLUG,
            metadata: { slotCount: slots.length, validation: "server_probe" },
          });
          return { source: "database" as const, slots };
        } catch (error) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "OrcaRouter credential validation failed" });
        }
      }),
    announcement: adminProcedure.query(() => getAnnouncementText()),
    setAnnouncement: adminProcedure.input(announcementInput).mutation(async ({ ctx, input }) => {
      const text = await setAnnouncementText(input.text, ctx.user.id);
      await writeAuditEvent({
        actorUserId: ctx.user.id,
        action: "announcement.updated",
        entityType: "platform_setting",
        entityId: "announcement_text",
        metadata: { published: Boolean(text), characterCount: text?.length ?? 0 },
      });
      return { text };
    }),
    unorouterBadge: adminProcedure.query(async () => {
      const enabled = await getUnoRouterBadgeEnabled();
      return { enabled };
    }),
    setUnoRouterBadge: adminProcedure
      .input(z.object({ enabled: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const enabled = await setUnoRouterBadgeEnabled(input.enabled, ctx.user.id);
        await writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "unorouter_badge.updated",
          entityType: "platform_setting",
          entityId: "unorouter_badge_enabled",
          metadata: { enabled },
        });
        return { success: true, enabled };
      }),
    modelTokenMultipliers: adminProcedure.query(async () => {
      return await getModelTokenMultipliers();
    }),
    setModelTokenMultiplier: adminProcedure
      .input(
        z.object({
          modelId: z.string().trim().min(1),
          multiplier: z.number().positive().max(100),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const multipliers = await setModelTokenMultiplier(input.modelId, input.multiplier, ctx.user.id);
        await writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "model.token_multiplier.updated",
          entityType: "model",
          entityId: input.modelId,
          metadata: { multiplier: input.multiplier },
        });
        return { success: true, multipliers, modelId: input.modelId, multiplier: input.multiplier };
      }),
    setModelEnabled: adminProcedure.input(z.object({ modelId: tokenForgeModelId, enabled: z.boolean() })).mutation(async ({ ctx, input }) => {
      const updated = await setModelEnabled(input.modelId, input.enabled);
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Model configuration not found" });
      await writeAuditEvent({ actorUserId: ctx.user.id, action: input.enabled ? "model.enabled" : "model.disabled", entityType: "model", entityId: input.modelId });
      return { success: true } as const;
    }),
    setModelMinTier: adminProcedure
      .input(z.object({
        modelId: tokenForgeModelId,
        minTier: z.enum(["free", "plus", "pro", "ultra", "enterprise", "starter", "max", "power"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const updated = await setModelMinTier(input.modelId, input.minTier);
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Model configuration not found" });
        await writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "model.min_tier.updated",
          entityType: "model",
          entityId: input.modelId,
          metadata: { minTier: input.minTier },
        });
        return { success: true, modelId: input.modelId, minTier: input.minTier } as const;
      }),
    setModelIsPayg: adminProcedure
      .input(z.object({
        modelId: z.string().trim().min(1),
        isPayg: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        const updated = await setModelIsPayg(input.modelId, input.isPayg);
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Model configuration not found" });
        await writeAuditEvent({
          actorUserId: ctx.user.id,
          action: input.isPayg ? "model.payg_tag.added" : "model.payg_tag.removed",
          entityType: "model",
          entityId: input.modelId,
          metadata: { isPayg: input.isPayg },
        });
        return { success: true, modelId: input.modelId, isPayg: input.isPayg } as const;
      }),
    setModelIsBundle: adminProcedure
      .input(z.object({
        modelId: z.string().trim().min(1),
        isBundle: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        const updated = await setModelIsBundle(input.modelId, input.isBundle);
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Model configuration not found" });
        await writeAuditEvent({
          actorUserId: ctx.user.id,
          action: input.isBundle ? "model.bundle_access.enabled" : "model.bundle_access.disabled",
          entityType: "model",
          entityId: input.modelId,
          metadata: { isBundle: input.isBundle },
        });
        return { success: true, modelId: input.modelId, isBundle: input.isBundle } as const;
      }),
    setModelIsTokenPlan: adminProcedure
      .input(z.object({
        modelId: z.string().trim().min(1),
        isTokenPlan: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        const updated = await setModelIsTokenPlan(input.modelId, input.isTokenPlan);
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Model configuration not found" });
        await writeAuditEvent({
          actorUserId: ctx.user.id,
          action: input.isTokenPlan ? "model.token_plan_access.enabled" : "model.token_plan_access.disabled",
          entityType: "model",
          entityId: input.modelId,
          metadata: { isTokenPlan: input.isTokenPlan },
        });
        return { success: true, modelId: input.modelId, isTokenPlan: input.isTokenPlan } as const;
      }),
    setModelCompactScaling: adminProcedure
      .input(z.object({
        modelId: z.string().trim().min(1),
        enabled: z.boolean(),
        triggerTokens: z.union([z.number(), z.string()]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await setModelCompactScalingConfig(input.modelId, {
          enabled: input.enabled,
          triggerTokens: input.triggerTokens,
        }, ctx.user.id);
        await writeAuditEvent({
          actorUserId: ctx.user.id,
          action: input.enabled ? "model.compact_scaling.enabled" : "model.compact_scaling.disabled",
          entityType: "model",
          entityId: input.modelId,
          metadata: { enabled: input.enabled, triggerTokens: result.triggerTokens },
        });
        return { success: true, modelId: input.modelId, ...result } as const;
      }),
    setModelAccess: adminProcedure
      .input(z.object({
        modelId: z.string().trim().min(1),
        isPayg: z.boolean().optional(),
        isBundle: z.boolean().optional(),
        isTokenPlan: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const updated = await setModelAccess(input.modelId, { isPayg: input.isPayg, isBundle: input.isBundle, isTokenPlan: input.isTokenPlan });
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Model configuration not found" });
        await writeAuditEvent({
          actorUserId: ctx.user.id,
          action: "model.access.updated",
          entityType: "model",
          entityId: input.modelId,
          metadata: { isPayg: input.isPayg, isBundle: input.isBundle, isTokenPlan: input.isTokenPlan },
        });
        return { success: true, modelId: input.modelId, isPayg: input.isPayg, isBundle: input.isBundle, isTokenPlan: input.isTokenPlan } as const;
      }),
    setProviderEnabled: adminProcedure.input(z.object({ slug: z.enum([FXQIDIAN_PROVIDER_SLUG, CLUSTER_PROTOCOL_PROVIDER_SLUG, TOKENHARBOR_PROVIDER_SLUG, CLAUDE_OPUS5_PROVIDER_SLUG, TOKENROUTER_PROVIDER_SLUG]), enabled: z.boolean() })).mutation(async ({ ctx, input }) => {
      const result = await setProviderEnabled(input.slug, input.enabled);
      if (!result.updated) throw new TRPCError({ code: "NOT_FOUND", message: "Provider configuration not found" });
      await writeAuditEvent({ actorUserId: ctx.user.id, action: input.enabled ? "provider.enabled" : "provider.disabled", entityType: "provider", entityId: input.slug, metadata: { disabledModels: result.disabledModels } });
      return { success: true, disabledModels: result.disabledModels } as const;
    }),
    setProviderSupportsVision: adminProcedure.input(z.object({ slug: z.string().trim().min(1), supportsVision: z.boolean() })).mutation(async ({ ctx, input }) => {
      const result = await setProviderSupportsVision(input.slug, input.supportsVision);
      if (!result.updated) throw new TRPCError({ code: "NOT_FOUND", message: "Provider configuration not found" });
      await writeAuditEvent({ actorUserId: ctx.user.id, action: input.supportsVision ? "provider.vision.enabled" : "provider.vision.disabled", entityType: "provider", entityId: input.slug, metadata: { supportsVision: input.supportsVision } });
      return { success: true, slug: input.slug, supportsVision: input.supportsVision } as const;
    }),
    setProviderSupportsDocuments: adminProcedure.input(z.object({ slug: z.string().trim().min(1), supportsDocuments: z.boolean() })).mutation(async ({ ctx, input }) => {
      const result = await setProviderSupportsDocuments(input.slug, input.supportsDocuments);
      if (!result.updated) throw new TRPCError({ code: "NOT_FOUND", message: "Provider configuration not found" });
      await writeAuditEvent({ actorUserId: ctx.user.id, action: input.supportsDocuments ? "provider.documents.enabled" : "provider.documents.disabled", entityType: "provider", entityId: input.slug, metadata: { supportsDocuments: input.supportsDocuments } });
      return { success: true, slug: input.slug, supportsDocuments: input.supportsDocuments } as const;
    }),
    setAccountControl: adminProcedure
      .input(z.object({ userId: z.number().int().positive(), isSuspended: z.boolean().optional(), dailyRequestLimit: z.number().int().min(1).max(1_000_000).optional(), dailyTokenLimit: z.number().int().min(1_000).max(10_000_000).optional() }))
      .mutation(async ({ ctx, input }) => {
        if (input.userId === ctx.user.id && input.isSuspended) throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot suspend your own administrator account" });
        const updated = await setAccountControl(input);
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Account control record not found" });
        await writeAuditEvent({ actorUserId: ctx.user.id, targetUserId: input.userId, action: "account.control.updated", entityType: "account", entityId: String(input.userId), metadata: { isSuspended: input.isSuspended, dailyRequestLimit: input.dailyRequestLimit, dailyTokenLimit: input.dailyTokenLimit } });
        return { success: true } as const;
      }),
    dodoPayments: adminProcedure.query(async () => {
      return await listAllDodoPayments(150);
    }),
    syncDodoPayments: adminProcedure.mutation(async () => {
      const result = await syncDodoPaymentsFromApi();
      const list = await listAllDodoPayments(150);
      return { synced: result.synced, payments: list };
    }),
    modelFailureLogs: adminProcedure
      .input(z.object({
        modelId: z.string().trim().min(1),
        limit: z.number().int().min(1).max(200).default(100),
      }))
      .query(async ({ input }) => {
        const logs = await getRecentModelFailureLogs(input.modelId, input.limit);
        return logs.map(entry => ({ ...entry, publicMessage: PUBLIC_PROVIDER_ERROR_MESSAGE }));
      }),
    getCacheDebugStatus: adminProcedure.query(() => ({
      enabled: isCacheDebugEnabled(),
      count: getCacheDebugSummaries().length,
    })),
    setCacheDebugStatus: adminProcedure
      .input(z.object({ enabled: z.boolean() }))
      .mutation(({ input }) => {
        setCacheDebugEnabled(input.enabled);
        return { enabled: isCacheDebugEnabled() };
      }),
    getCacheDebugRequests: adminProcedure.query(() => getCacheDebugSummaries()),
    getCacheDebugRequestDetail: adminProcedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => {
        const entry = getCacheDebugEntry(input.id);
        if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Debug entry not found" });
        return entry;
      }),
    diffCacheDebugRequests: adminProcedure
      .input(z.object({
        reqAId: z.string(),
        reqBId: z.string(),
        field: z.enum(["upstream_body", "incoming_body"]).default("upstream_body"),
      }))
      .query(({ input }) => {
        const entryA = getCacheDebugEntry(input.reqAId);
        const entryB = getCacheDebugEntry(input.reqBId);
        if (!entryA || !entryB) {
          throw new TRPCError({ code: "NOT_FOUND", message: "One or both debug requests were not found." });
        }
        return computeCacheDiffBetweenEntries(entryA, entryB, input.field);
      }),
    clearCacheDebugRequests: adminProcedure.mutation(() => {
      clearCacheDebugEntries();
      return { success: true };
    }),
    exportCacheDebugJsonl: adminProcedure.query(() => exportCacheDebugJsonl()),

  }),
});

export type AppRouter = typeof appRouter;
