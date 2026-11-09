# Qronos AI — Public Open-Source Repository Cleanup Plan

## 1. Executive Summary & Objective

The goal of this initiative is to create a secure, clean, and fully decoupled clone of the Qronos AI codebase in a new local workspace (`Qronos-Clone`). 

This public version will serve as an open-source, developer-friendly AI SaaS starter kit featuring:
- **Clean User Frontend**: Modern landing page, model showcase, documentation, developer dashboard (API keys, usage analytics, billing/credits, referrals, profile), and public playground.
- **Robust User Backend**: High-performance dual-ledger token/PAYG credit system, API key management, usage tracking, and multi-provider AI proxy gateways (OpenAI-compatible and Anthropic-compatible).
- **Zero Infrastructure / Admin / Secret Leakage**: Complete removal of cloud deployment secrets, SSH private keys, Azure VM metadata, internal admin control panels, user prompt surveillance mechanisms, upstream aggregator credentials, and the 5-layer model identity masking system.

All modifications and removals will be executed strictly within `/workspaces/Hi/Qronos-Clone`. The original production repository (`/workspaces/Hi/qronos-ai`) remains pristine and untouched.

---

## 2. Complete Inventory of Files to DELETE in `Qronos-Clone`

### A. Infrastructure, Host Location & Cloud Secrets
*Must be deleted to ensure public users cannot discover where production is hosted or access the host.*
- `qronos_azure_id_rsa` — Azure VM SSH root private key.
- `.github/workflows/docker-build-push.yml` — Deployment workflow exposing SSH target actions, `/opt/qronos`, and GHCR endpoints.
- `Caddyfile` — Production reverse proxy rules, listening ports, and internal endpoints.
- `router/Dockerfile` — Specialized internal router container configuration.
- `scripts/warm-render-endpoints.sh` — Script revealing Render proxy hostnames.
- `firebase-applet-config.json` — Internal Firebase project identifiers and client configs.
- `.env` — Local environment secrets (will be replaced by `.env.example`).

### B. 5-Layer Identity Masking, Model Spoofing & Deception Modules
*Must be deleted to remove synthetic identity deception logic and proprietary guardrail workarounds.*
- `server/identityPhrases.ts` — Hardcoded rotating identity statements (*"I am Claude Opus 5, available through Qronos AI..."*, Russian variants) used to fool identity probes.
- `server/identityWatchList.ts` — Hardcoded list of watched upstream vendors (`tokenrouter`, `orcarouter`, `fxqidian`, `bluesminds`, `b.ai`, `bailu`, `aliyun`, `deepseek`) and runtime rewrite rules.
- `server/nemoGuard.ts` — NVIDIA NeMoGuard API key rotation pools, sliding window token buffers, and adversarial regex shields.
- `server/claudeOpus5IdentityPolicy.test.ts` — Identity spoofing compliance tests.
- `server/identityEnhancements.test.ts` — Streaming chunk boundary leak interception tests.
- `server/identityWatchList.test.ts` — Identity term rewrite tests.
- `server/jailbreakProtection.test.ts` — Identity probe interception tests.

### C. Admin Panel Frontend (Components & Pages)
*Must be deleted so no administrative interface, routes, or control panels exist in the public code.*
- `client/src/components/admin/` (Delete entire directory and all subdirectories):
  - `accounts/` (`AccountsSection.tsx`, `UserTierAssignmentCard.tsx`)
  - `campaign/` (`SpecialReferralSection.tsx`)
  - `common/` (`AdminCommon.tsx`)
  - `controls/` (`OperationalControls.tsx`)
  - `diagnostics/` (`FailureHistory.tsx`)
  - `discord/` (`AdminDiscordBotSection.tsx`)
  - `inspector/` (`AdminUserMessageInspector.tsx` — raw user prompt inspection tool)
  - `invites/` (`AdminInviteTrackerSection.tsx`)
  - `jailbreak/` (`AdminJailbreakSection.tsx`)
  - `notifications/` (`AdminNotificationsSection.tsx`)
  - `overview/` (`AdminCharts.tsx`, `DiscordBypassSection.tsx`, `OperationsSections.tsx`, `RefundPolicyToggleCard.tsx`, `UnoRouterToggleCard.tsx`)
  - `pricing/` (`AdminPricingSection.tsx`)
  - `providers/` (`DynamicProviderKeyPool.tsx`, `IdentityWatchListCard.tsx`, `ManagedProviderSelector.tsx`, `OrcaRouterCredentialPanel.tsx`, `ProvidersSection.tsx`, `UniversalModelProviderBalancer.tsx`)
  - `requests/` (`AdminAccessRequestsSection.tsx`)
  - `safety/` (`AdminSafetyAuditSection.tsx`)
  - `CacheDebuggerTab.tsx`
  - `types.ts`
- `client/src/pages/AdminDashboard.tsx`
- `client/src/pages/AdminSettings.tsx`
- `client/src/pages/Qwen38MaxProviderSettings.tsx`
- `client/src/pages/LiveRequestLog.tsx`
- `client/src/pages/admin/Support.tsx`

### D. Admin Backend & Upstream Credential Services
*Must be deleted to eliminate admin backdoors and exposed third-party aggregator routing.*
- `server/adminPasscode.ts` & `server/adminPasscode.test.ts`
- `server/adminAccountDirectory.test.ts`
- `server/adminCreditGrant.test.ts`
- `server/adminOverview.test.ts`
- `server/cacheDebugger.ts` & `server/cacheDebugger.test.ts`
- `server/providerRuntimeConfigVault.ts` & `server/providerRuntimeConfigVault.test.ts`
- `server/providerCredentialTelemetry.ts` & `server/providerCredentialTelemetry.test.ts`
- `server/managedProviderCredentialPools.test.ts`
- `server/managedProviderKeyEnablement.test.ts`
- `server/managedProviderKeyMetrics.test.ts`
- `server/managedProviderRequestCap.test.ts`
- `server/managedResponseQuality.live.integration.test.ts`
- `server/managedFailureLogRetention.ts` & `server/managedFailureLogRetention.test.ts`
- `server/bluesMindsClaudeFable5Credentials.ts` & test files
- `server/clusterProtocolCredentials.ts` & test files
- `server/deepseekV4ProCredentials.ts`
- `server/fxqidianCredentials.ts` & test files
- `server/glm53Credentials.ts`
- `server/nvidiaClaudeFable5Credentials.ts` & test files
- `server/orcaRouterCredentials.ts` & `server/orcaRouterCredentialVault.ts`
- `server/tokenReplyClaudeOpus5Credentials.ts` & test files
- `server/tokenRouterCredentials.ts` & test files
- `server/*.secret.live.test.ts` (all live upstream test suites)
- `server/bailuClaudeOpus5.inspection.live.test.ts`

### E. Internal Maintenance Scripts, Root Patches & Research Docs
- Root maintenance scripts: `fix_*.cjs`, `patch_*.cjs`, `insert_gpt6_ui.cjs`, `revert_operational.cjs`, `update_transactions_ws.cjs`, `check_user.cjs`
- Internal probe scripts: `create-key.ts`, `create-key2.ts`, `get-key.ts`, `inspect-*.ts`, `test-live.ts`, `test-err.ts`, `test-identity.ts`, `clear-blocks.ts`
- Internal notes: `hi.txt`, `audit-notes.md`, `todo.md`, `verification_notes.md`, `provider-validation.md`, `tokenrouter_qwen38max_validation.md`, `brand-asset-sources.md`
- Research directory: `research/`
- Docs revealing private research: `docs/claude-code-orcarouter-translation-research.md`, `docs/claude-code-translation-research.md`, `docs/cluster-protocol-catalogue-audit.md`, `docs/DEEPSEEK_V4_PRICING.md`, `docs/official-pricing-research.md`, `docs/PRICING_AND_KEY_REFRESH_VALIDATION.md`, `docs/pricing-sources.md`, `docs/provider-mark-sources.md`, `docs/model-visual-sources.md`

---

## 3. Inventory of Files to REFACTOR & SANITIZE in `Qronos-Clone`

### A. `client/src/App.tsx`
- Remove all admin imports (`AdminDashboard`, `AdminSettings`, `Qwen38MaxProviderSettings`).
- Remove admin routes (`/admin`, `/admin/*`, `/debug/cache`, `/dashboard/admin/*`).
- Retain all public pages (`Home`, `Models`, `Docs`, `Demo`, `Pricing`, `Playground`, `LocalAuth`, `DeveloperDashboard`, `Legal`, `NotFound`).

### B. `server/routers.ts`
- Remove the entire `admin: router({ ... })` (~1,500 lines of code) and related admin imports (`adminProcedure`, `verifyAdminPasscode`, etc.).
- Remove administrative support chat procedures (`adminGetConversations`, `adminSendReply`, etc.).
- Retain complete user procedures:
  - User auth, session tokens, and local credentials.
  - API key generation, revocation, and labeling.
  - Credit account status, PAYG balance, Token Plan quotas, and transaction history.
  - Model pricing queries, usage metrics, and user referral links.

### C. `server/openaiGateway.ts` & `server/anthropicGateway.ts`
- Remove all 5 layers of identity interception:
  - Remove pre-flight prompt probe inspections (`inspectManagedSafetyProbe`, `isManagedIdentityDisclosureRequest`, `canonicalManagedIdentityResponse`).
  - Remove prompt injection reinforcement (`reinforcePromptContextForUpstream`).
  - Remove inbound message identity replacement (`rewriteIdentityTermsInMessages`).
  - Remove streaming chunk boundary rewriting and token stitching (`publicManagedContent`, `sanitizeStreamingChunk`).
  - Remove reasoning/thinking stream stripping (`sanitizeThinking`).
- Make the gateways pure, transparent, high-performance forwarders that route directly to standard model endpoints (e.g. standard OpenAI or Anthropic API endpoints configured via `.env`).

### D. `drizzle/schema.ts`
- Strip admin and surveillance tables:
  - `platformSettings`, `providerConfigs`, `orcaRouterCredentialSlots`
  - `baiProviderCircuitStates`, `baiCredentialCapacitySlots`
  - `providerKeyMetrics`, `managedProviderModelUsage`
  - `renderProxyEndpointMetrics`, `bailuWebshareProxySlotMetrics`
  - `claudeOpus5FailureLogs`, `safetyAuditLogs`, `userInteractionLogs`
  - `auditEvents`, `adminAccessRequests`
  - `discordBotMessages`, `discordMemberProfiles`, `discordChannelSummaries`
- Retain clean user tables:
  - `users`, `passwordCredentials`, `oauthIdentities`, `deletedIdentityTombstones`
  - `apiKeys`, `accountControls`
  - `creditAccounts`, `creditLedger`, `usageEvents`, `dailyUsage`
  - `referralCodes`, `referralAttributions`, `dailyCheckins`
  - `systemNotifications`, `userNotificationReads`

### E. `server/db.ts`
- Remove admin query functions (`listAdminAccounts`, `setAccountCredit`, `getAdminOverview`, `recordSafetyAudit`, `logUserInteractionMessage`, etc.).
- Remove provider credential vault decryption and persistence.
- Retain atomic credit reservation, token quota deduction, PAYG settlement, API key verification, and user management.

### F. Container & Environment Configuration
- Create clean, generic `Dockerfile` and `docker-compose.yml` for local developer setup without any references to production Azure paths or private image registries.
- Provide a clean `.env.example` documenting standard environment variables (`DATABASE_URL`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `SESSION_SECRET`, etc.).

---

## 4. Execution Roadmap

1. **Workspace Setup**: Copy `qronos-ai` to `/workspaces/Hi/Qronos-Clone` (excluding `.git` and `node_modules` to prevent secret carryover).
2. **File Deletion Phase**: Delete all files identified in Section 2.
3. **Frontend Refactoring Phase**: Clean `client/src/App.tsx` and verify frontend builds cleanly.
4. **Backend Refactoring Phase**: Strip `admin` routers from `server/routers.ts`, sanitize `db.ts`, and clean gateways.
5. **Schema Sanitization Phase**: Clean `drizzle/schema.ts`.
6. **Container & Config Phase**: Supply standard open-source `Dockerfile`, `docker-compose.yml`, `.env.example`, and a clean `README.md`.
7. **Verification & Testing**: Run unit tests and type-checks in `Qronos-Clone` to ensure zero compilation or runtime errors.
8. **Fresh Git Init**: Initialize a clean git repository in `Qronos-Clone` with a single initial commit ready for public release.
