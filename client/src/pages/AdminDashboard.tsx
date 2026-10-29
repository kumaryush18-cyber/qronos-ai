import AdminSupport from "./admin/Support";
import React, { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import LiveRequestLog from "./LiveRequestLog";
import { MotionVideosAdminSection } from "@/components/admin/MotionVideosAdminSection";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ChartNoAxesCombined,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Shield,
  UsersRound,
} from "lucide-react";
import { Link } from "wouter";
import { QronosGlyph } from "@/components/QronosGlyph";
import { toast } from "sonner";
import { persistSessionToken, clearStoredSession } from "@/lib/sessionToken";
import { StarBorderCard } from "@/components/StarBorderCard";
import "../dashboard.css";

import {
  AdminAccount,
  AdminAuditRecord,
  AdminGlobalModelUsage,
  ManagedProviderKeyMetricGroup,
  SpecialReferralCampaignData,
  ProviderTelemetryItem,
  ManagedModelOverviewItem,
} from "@/components/admin/types";
import { formatTokens, Metric, SectionHeader } from "@/components/admin/common/AdminCommon";
import { AdminUsageChart, EmailProviderChart } from "@/components/admin/overview/AdminCharts";
import { AccountsSection } from "@/components/admin/accounts/AccountsSection";
import { DiscordBypassSection } from "@/components/admin/overview/DiscordBypassSection";
import { UnoRouterToggleCard } from "@/components/admin/overview/UnoRouterToggleCard";
import { SpecialReferralCampaignSection } from "@/components/admin/campaign/SpecialReferralSection";
import {
  AuditTimeline,
  downloadAuditCsv,
  AnnouncementSection,
  CapacitySection,
  InferenceControlsSection,
} from "@/components/admin/overview/OperationsSections";
import { OperationalControls } from "@/components/admin/controls/OperationalControls";

import { ManagedProviderSelector } from "@/components/admin/providers/ManagedProviderSelector";
import { Sonnet46ProviderBalancerPanel } from "@/components/admin/providers/ProvidersSection";
import { AdminAccessRequestsSection } from "@/components/admin/requests/AdminAccessRequestsSection";
import { AdminSafetyAuditSection } from "@/components/admin/safety/AdminSafetyAuditSection";
import { AdminUserMessageInspector } from "@/components/admin/inspector/AdminUserMessageInspector";
import { TransactionsWorkspace } from "@/components/TransactionsWorkspace";
import { PaymentsWorkspace } from "@/components/payments/PaymentsWorkspace";
import { AdminPricingSection } from "@/components/admin/pricing/AdminPricingSection";
import { CacheDebuggerTab } from "@/components/admin/CacheDebuggerTab";
import { AdminNotificationsSection } from "@/components/admin/notifications/AdminNotificationsSection";
import { AdminInviteTrackerSection } from "@/components/admin/invites/AdminInviteTrackerSection";
import { AdminDiscordBotSection } from "@/components/admin/discord/AdminDiscordBotSection";

export type AdminSection =
  | "overview"
  | "notifications"
  | "cache"
  | "accounts"
  | "user-logs"
  | "safety-audit"
  | "pricing"
  | "settlements"
  | "payments"
  | "requests"
  | "campaign"
  | "invite-tracker"
  | "discord-bot"
  | "controls"
  | "providers"
  | "operations"
  | "announcement"
  | "activity"
  | "live"
  | "live-chat";

export default function AdminDashboard({ initialSection }: { initialSection?: AdminSection } = {}) {
  const { user, loading } = useAuth();
  const isAdminSession = user?.isAdminSession === true;

  const overview = trpc.admin.overview.useQuery(undefined, {
    enabled: isAdminSession,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: 2,
    retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
  });
  const flags = trpc.admin.flags.useQuery(undefined, { enabled: isAdminSession, refetchInterval: 45_000 });
  const activityFeed = trpc.admin.activity.useQuery({ limit: 40 }, { enabled: isAdminSession, refetchInterval: 45_000 });
  const auditExport = trpc.admin.auditExport.useQuery(undefined, { enabled: false });
  const announcement = trpc.admin.announcement.useQuery(undefined, { enabled: isAdminSession });
  const specialReferralCampaign = trpc.admin.specialReferralCampaign.useQuery(undefined, {
    enabled: isAdminSession,
    refetchInterval: 60_000,
  });

  const utils = trpc.useUtils();
  const [adminPasscode, setAdminPasscode] = useState("");
  const [section, setSection] = useState<AdminSection>(() => {
    if (initialSection) return initialSection;
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const tab = urlParams.get("tab") as AdminSection;
      if (tab) {
        if ((tab as string) === "invites" || tab === "invite-tracker") return "invite-tracker";
        return tab;
      }
      if (window.location.pathname.includes("/admin/support") || window.location.pathname.includes("/admin/live-chat")) {
        return "live-chat";
      }
      if (window.location.pathname.includes("/debug/cache") || window.location.pathname.includes("/admin/cache")) {
        return "cache";
      }
    }
    return "overview";
  });
  const [announcementText, setAnnouncementText] = useState("");
  const [modelQuery, setModelQuery] = useState("");

  const modelControl = trpc.admin.setModelEnabled.useMutation({
    onSuccess: () => {
      utils.admin.overview.invalidate();
      toast.success("Model availability updated");
    },
    onError: (error) => toast.error(error.message),
  });

  const modelTierControl = trpc.admin.setModelMinTier.useMutation({
    onSuccess: (data) => {
      utils.admin.overview.invalidate();
      toast.success(`Access tier for ${data.modelId} set to ${data.minTier}`);
    },
    onError: (error) => toast.error(error.message),
  });

  const modelPaygControl = trpc.admin.setModelIsPayg.useMutation({
    onSuccess: (data) => {
      utils.admin.overview.invalidate();
      toast.success(`PAYG tag for ${data.modelId} set to ${data.isPayg ? "PAYG Enabled" : "PAYG Disabled"}`);
    },
    onError: (error) => toast.error(error.message),
  });

  const modelTokenPlanControl = trpc.admin.setModelIsTokenPlan.useMutation({
    onSuccess: (data) => {
      utils.admin.overview.invalidate();
      toast.success(`Token Plan tag for ${data.modelId} set to ${data.isTokenPlan ? "Token Plan Enabled" : "Token Plan Disabled"}`);
    },
    onError: (error) => toast.error(error.message),
  });

  const modelCompactScalingControl = trpc.admin.setModelCompactScaling.useMutation({
    onSuccess: (data) => {
      utils.admin.overview.invalidate();
      toast.success(
        data.enabled
          ? `Auto Compact Scaling enabled for ${data.modelId} (${data.triggerTokens.toLocaleString()} tokens)`
          : `Auto Compact Scaling disabled for ${data.modelId}`
      );
    },
    onError: (error) => toast.error(error.message),
  });


  const providerControl = trpc.admin.setProviderEnabled.useMutation({
    onSuccess: (result) => {
      utils.admin.overview.invalidate();
      toast.success(
        result.disabledModels
          ? `Provider paused; ${result.disabledModels} routed model${result.disabledModels === 1 ? "" : "s"} disabled`
          : "Provider availability updated"
      );
    },
    onError: (error) => toast.error(error.message),
  });

  const providerVisionControl = trpc.admin.setProviderSupportsVision.useMutation({
    onSuccess: (result) => {
      utils.admin.overview.invalidate();
      toast.success(
        result.supportsVision
          ? `Multimodal Vision/Image input enabled for ${result.slug}`
          : `Multimodal Vision/Image input disabled for ${result.slug}`
      );
    },
    onError: (error) => toast.error(error.message),
  });

  const providerDocumentsControl = trpc.admin.setProviderSupportsDocuments.useMutation({
    onSuccess: (result) => {
      utils.admin.overview.invalidate();
      toast.success(
        result.supportsDocuments
          ? `Document / PDF input enabled for ${result.slug}`
          : `Document / PDF input disabled for ${result.slug}`
      );
    },
    onError: (error) => toast.error(error.message),
  });

  const unlockAdmin = trpc.admin.unlock.useMutation({
    onSuccess: async () => {
      setAdminPasscode("");
      await utils.auth.me.invalidate();
      toast.success("Administrator access activated; other sessions were signed out");
    },
    onError: (error) => toast.error(error.message),
  });

  const signOutAdmin = trpc.admin.signOut.useMutation({
    onSuccess: async () => {
      clearStoredSession();
      await utils.auth.me.invalidate();
      toast.success("Administrator access revoked for this browser");
    },
    onError: (error) => toast.error(error.message),
  });

  const saveAnnouncement = trpc.admin.setAnnouncement.useMutation({
    onSuccess: async (result) => {
      setAnnouncementText(result.text ?? "");
      utils.admin.announcement.setData(undefined, result.text);
      await Promise.all([utils.public.announcement.invalidate(), utils.admin.activity.invalidate()]);
      toast.success(result.text ? "Announcement published across Qronos AI" : "Announcement cleared from Qronos AI");
    },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    if (announcement.data !== undefined) setAnnouncementText(announcement.data ?? "");
  }, [announcement.data]);

  const accounts = (overview.data?.accounts ?? []) as AdminAccount[];
  const managedProviderKeyMetrics = (overview.data?.managedProviderKeyMetrics ?? []) as ManagedProviderKeyMetricGroup[];
  const providerTelemetry = (overview.data?.providerTelemetry ?? []) as ProviderTelemetryItem[];
  const emailProviders = overview.data?.emailProviders ?? [];
  const providers = (overview.data?.providers ?? []) as Array<{ slug: string; displayName: string; enabled: boolean }>;
  const models = (overview.data?.models ?? []) as ManagedModelOverviewItem[];

  const downloadAuditExport = async () => {
    const result = await auditExport.refetch();
    if (!result.data) {
      toast.error("Audit export is temporarily unavailable");
      return;
    }
    downloadAuditCsv(result.data);
    toast.success("Privacy-safe audit export downloaded");
  };

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-black text-white">
        <Loader2 className="animate-spin text-zinc-400" size={24} />
      </main>
    );
  }

  if (!isAdminSession) {
    return (
      <main
        style={{ backgroundColor: "oklch(0 0 0)" }}
        className="min-h-screen px-4 py-8 text-white sm:py-16 flex items-center justify-center"
      >
        <section
          style={{
            backgroundColor: "oklch(0.14 0 0)",
            borderColor: "oklch(0.26 0 0)",
            boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
          className="relative mx-auto flex w-full max-w-lg flex-col justify-center overflow-hidden rounded-3xl border p-6 sm:p-9 shadow-2xl"
        >
          <div className="relative">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-3">
                <QronosGlyph size={32} className="rounded-lg overflow-hidden shrink-0" />
                <div>
                  <h2 className="text-sm font-extrabold tracking-tight text-white">Qronos AI</h2>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">Control Plane Access</p>
                </div>
              </div>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
              >
                <ArrowLeft size={13} />
                <span>Dashboard</span>
              </Link>
            </div>

            <div className="mt-6 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <p className="text-[10px] font-bold uppercase tracking-[.18em] font-mono text-zinc-400">
                Operations Console
              </p>
            </div>

            <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Unlock Control Plane
            </h1>
            <p className="mt-2 text-xs sm:text-sm leading-relaxed text-zinc-400">
              Enter the administrator passcode to activate your session. Administrator rights grant full access to provider routing, account governance, and system telemetry.
            </p>

            <form
              className="mt-6 rounded-2xl border border-white/[0.08] bg-black/40 p-5 sm:p-6"
              onSubmit={(event) => {
                event.preventDefault();
                if (adminPasscode.trim()) unlockAdmin.mutate({ passcode: adminPasscode });
              }}
            >
              <label className="block text-xs font-semibold text-zinc-200" htmlFor="admin-passcode">
                Administrator Passcode
              </label>
              <Input
                id="admin-passcode"
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={adminPasscode}
                onChange={(event) => setAdminPasscode(event.target.value)}
                placeholder="Enter administrator passcode"
                className="mt-2 h-11 border-white/10 bg-black/60 text-white placeholder:text-zinc-500 font-mono tracking-wider focus:border-white/30"
                disabled={unlockAdmin.isPending}
                autoFocus
              />
              <Button
                type="submit"
                className="mt-4 h-11 w-full bg-white text-black font-bold text-sm hover:bg-zinc-200 transition-all cursor-pointer shadow-lg disabled:opacity-50"
                disabled={!adminPasscode.trim() || unlockAdmin.isPending}
              >
                {unlockAdmin.isPending ? (
                  <>
                    <Loader2 className="animate-spin mr-2" size={16} /> Verifying Passcode...
                  </>
                ) : (
                  <>
                    <Shield size={16} className="mr-2" /> Unlock Administrator Access
                  </>
                )}
              </Button>
              <p className="mt-3 text-[11px] leading-5 text-zinc-500 text-center font-mono">
                Verified against secure server credentials with timing-safe comparison.
              </p>
            </form>
          </div>
        </section>
      </main>
    );
  }

  const isOverviewLoading = overview.isLoading && !overview.data;
  const isFlagsLoading = flags.isLoading && !flags.data;

  const metrics = (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-4">
      <Metric
        icon={<UsersRound size={17} />}
        label="Accounts"
        loading={isOverviewLoading}
        value={(overview.data?.totals?.totalAccounts ?? accounts.length).toLocaleString()}
        detail="Total registered accounts"
      />
      <Metric
        icon={<ChartNoAxesCombined size={17} />}
        label="Total tokens processed"
        loading={isOverviewLoading}
        value={formatTokens(overview.data?.totals?.totalTokens ?? 0)}
        detail="Across all active accounts"
        lime
      />
      <Metric
        icon={<Activity size={17} />}
        label="Lifetime requests"
        loading={isOverviewLoading}
        value={(overview.data?.totals?.totalRequests ?? 0).toLocaleString()}
        detail="Across all accounts"
      />
      <Metric
        icon={<AlertTriangle size={17} />}
        label="Safety signals"
        loading={isFlagsLoading}
        value={(flags.data?.length ?? 0).toLocaleString()}
        detail="Open account flags"
        warning
      />
    </div>
  );

  const body = loading ? (
    <div className="grid h-80 place-items-center">
      <Loader2 className="animate-spin text-zinc-400" />
    </div>
  ) : overview.error && !overview.data ? (
    <div
      style={{
        backgroundColor: "oklch(0.14 0 0)",
        borderColor: "oklch(0.26 0 0)",
      }}
      className="grid min-h-64 place-items-center rounded-2xl border p-6 text-center"
    >
      <div>
        <AlertTriangle className="mx-auto text-amber-400" size={22} />
        <p className="mt-3 text-sm font-semibold text-white">Live operations data could not load</p>
        <p className="mt-2 max-w-sm text-xs leading-5 text-zinc-400">
          Your administrator session is still active. Refresh the control-plane data to try again.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-4 border-white/12 text-zinc-200 hover:bg-white/10"
          onClick={() => overview.refetch()}
        >
          Retry live data
        </Button>
      </div>
    </div>
  ) : (
    <div className="space-y-4">
      {overview.error && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[.06] px-3.5 py-2 text-xs font-mono text-amber-300">
          <span>Using the last successfully loaded operations data while a refresh is retried.</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 px-2 text-amber-300 hover:bg-amber-500/10 hover:text-white"
            onClick={() => overview.refetch()}
          >
            Retry
          </Button>
        </div>
      )}
      {metrics}
      <div
        style={{
          backgroundColor: "oklch(0.14 0 0)",
          borderColor: "oklch(0.26 0 0)",
        }}
        className="rounded-2xl border p-2 flex flex-wrap gap-1.5 shadow-xl"
      >
        {(
          [
            "overview",
            "notifications",
            "cache",
            "accounts",
            "user-logs",
            "safety-audit",
            "pricing",
            "settlements",
            "payments",
            "requests",
            "campaign",
            "invite-tracker",
            "discord-bot",
            "controls",
            "providers",
            "operations",
            "announcement",
            "activity",
            "live",
            "live-chat",
          ] as const
        ).map((item) => (
          <Button
            key={item}
            size="sm"
            variant="ghost"
            onClick={() => setSection(item)}
            className={`h-8 px-3 rounded-xl text-xs font-mono transition-all cursor-pointer ${
              section === item
                ? "bg-white text-black font-bold shadow-md"
                : "text-zinc-400 hover:bg-white/[0.06] hover:text-white"
            }`}
          >
            {item === "overview"
              ? "Overview"
              : item === "notifications"
              ? "Notifications"
              : item === "cache"
              ? "Prompt Cache"
              : item === "accounts"
              ? "Accounts"
              : item === "user-logs"
              ? "User Messages"
              : item === "safety-audit"
              ? "Safety Audit"
              : item === "pricing"
              ? "Model pricing"
              : item === "settlements"
              ? "Settlements & UPI"
              : item === "payments"
              ? "Payments"
              : item === "requests"
              ? "Access requests"
              : item === "campaign"
              ? "Special referral"
              : item === "invite-tracker"
              ? "Invite tracker"
              : item === "discord-bot"
              ? "Discord Bot"
              : item === "controls"
              ? "Model controls"
              : item === "providers"
              ? "Provider settings"
              : item === "operations"
              ? "Operations"
              : item === "announcement"
              ? "Announcement"
              : item === "live"
              ? "Live requests"
              : item === "live-chat"
              ? "Live Chat"
              : "Activity"}
          </Button>
        ))}
      </div>
      {section === "notifications" && (
        <AdminNotificationsSection />
      )}
      {section === "cache" && (
        <CacheDebuggerTab />
      )}
      {section === "user-logs" && (
        <AdminUserMessageInspector />
      )}
      {section === "safety-audit" && (
        <AdminSafetyAuditSection />
      )}
      {section === "settlements" && (
        <div className="space-y-4">
          <TransactionsWorkspace adminMode={true} />
        </div>
      )}
      {section === "payments" && (
        <div className="space-y-4">
          <PaymentsWorkspace adminMode={true} />
        </div>
      )}
      {section === "pricing" && (
        <div className="space-y-4">
          <AdminPricingSection />
        </div>
      )}
      {section === "overview" && (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="xl:col-span-2">
            <UnoRouterToggleCard />
          </div>
          <div className="xl:col-span-2">
            <DiscordBypassSection />
          </div>
          <AccountsSection activeAdminId={user?.id ?? -1} />
          <StarBorderCard lightWidth={180} duration={8} className="rounded-3xl h-full">
            <div className="p-5 sm:p-6 bg-[#0c0d12]/95 rounded-[23px] h-full flex flex-col justify-between">
              <div>
                <SectionHeader
                  icon={<ChartNoAxesCombined size={17} />}
                  title="Usage activity"
                  detail="Recent request activity across the Qronos AI gateway."
                />
                <div className="mt-4">
                  <AdminUsageChart
                    usage={overview.data?.usage ?? []}
                    modelUsage={(overview.data?.allAccountModelUsage ?? []) as AdminGlobalModelUsage[]}
                    loading={overview.isLoading}
                  />
                </div>
              </div>
            </div>
          </StarBorderCard>

          <StarBorderCard lightWidth={180} duration={8} className="rounded-3xl h-full">
            <div className="p-5 sm:p-6 bg-[#0c0d12]/95 rounded-[23px] h-full flex flex-col justify-between">
              <div>
                <SectionHeader
                  icon={<Mail size={17} />}
                  title="Email provider distribution"
                  detail="Live account counts by mailbox domain. Individual email addresses are never displayed."
                />
                <div className="mt-5">
                  <EmailProviderChart providers={emailProviders} loading={overview.isLoading} />
                </div>
              </div>
            </div>
          </StarBorderCard>

          <div className="xl:col-span-2">
            <CapacitySection providers={providers} telemetry={providerTelemetry} />
          </div>
        </div>
      )}
      {section === "accounts" && <AccountsSection activeAdminId={user?.id ?? -1} />}
      {section === "requests" && <AdminAccessRequestsSection />}
      {section === "campaign" && (
        <SpecialReferralCampaignSection
          campaign={specialReferralCampaign.data as SpecialReferralCampaignData | undefined}
          loading={specialReferralCampaign.isLoading}
        />
      )}
      {section === "invite-tracker" && (
        <AdminInviteTrackerSection />
      )}
      {section === "discord-bot" && (
        <AdminDiscordBotSection />
      )}
      {section === "controls" && (
        <InferenceControlsSection
          providers={providers}
          models={models}
          telemetry={providerTelemetry}
          modelQuery={modelQuery}
          onModelQueryChange={setModelQuery}
          onProviderToggle={(slug, enabled) => providerControl.mutate({ slug: slug as never, enabled })}
          onProviderVisionToggle={(slug, supportsVision) => providerVisionControl.mutate({ slug, supportsVision })}
          onProviderDocumentsToggle={(slug, supportsDocuments) => providerDocumentsControl.mutate({ slug, supportsDocuments })}
          onModelToggle={(modelId, enabled) => modelControl.mutate({ modelId: modelId as never, enabled })}
          onModelTierChange={(modelId, minTier) => modelTierControl.mutate({ modelId: modelId as never, minTier })}
          onModelPaygToggle={(modelId, isPayg) => modelPaygControl.mutate({ modelId: modelId as never, isPayg })}
          onModelTokenPlanToggle={(modelId, isTokenPlan) => modelTokenPlanControl.mutate({ modelId: modelId as never, isTokenPlan })}
          onModelCompactScalingToggle={(modelId, enabled, triggerTokens) =>
            modelCompactScalingControl.mutate({ modelId, enabled, triggerTokens })
          }
          providerPending={providerControl.isPending}
          providerVisionPending={providerVisionControl.isPending}
          providerDocumentsPending={providerDocumentsControl.isPending}
          modelPending={modelControl.isPending}
          modelTierPending={modelTierControl.isPending}
          modelPaygPending={modelPaygControl.isPending}
          modelTokenPlanPending={modelTokenPlanControl.isPending}
          modelCompactScalingPending={modelCompactScalingControl.isPending}
        />
      )}
      {section === "providers" && <ManagedProviderSelector keyMetrics={managedProviderKeyMetrics} />}
      {section === "operations" && <OperationalControls />}
      {section === "announcement" && (
        <AnnouncementSection
          text={announcementText}
          onChange={setAnnouncementText}
          onSave={() => saveAnnouncement.mutate({ text: announcementText })}
          saving={saveAnnouncement.isPending}
          loading={announcement.isLoading}
        />
      )}
      {section === "activity" && (
        <AuditTimeline
          events={(activityFeed.data ?? []) as AdminAuditRecord[]}
          onExport={downloadAuditExport}
          exporting={auditExport.isFetching}
        />

      )}
      {section === "live" && (
        <div className="space-y-6">
          <LiveRequestLog />
          <MotionVideosAdminSection />
        </div>
      )}
      {section === "live-chat" && <AdminSupport />}
    </div>
  );

  if (typeof window !== "undefined" && window.location.pathname === "/admin/sonnet4.6") {
    return (
      <DashboardLayout>
        <div className="dashboard-page-surface">
          <div className="dashboard-page-content space-y-4">
            <section className="dashboard-card flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="dashboard-kicker">Managed provider settings</p>
                <h1 className="mt-1 text-xl font-bold text-white">Claude Sonnet 4.6</h1>
                <p className="mt-1 text-xs leading-5 text-[#9495a7]">
                  Encrypted provider groups, equal-share routing, masked API keys, live health metrics, and
                  administrator-only timestamped diagnostics.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="border-white/12 text-[#d9d8e1] hover:bg-white/10"
                onClick={() => window.location.assign("/admin")}
              >
                Back to provider settings
              </Button>
            </section>
            <Sonnet46ProviderBalancerPanel
              metrics={managedProviderKeyMetrics.find((item) => item.modelId === "claude-sonnet-4.6")}
            />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="dashboard-page-surface">
        <div className="dashboard-page-content">
          <div
            style={{
              backgroundColor: "oklch(0.14 0 0)",
              borderColor: "oklch(0.26 0 0)",
              boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
            }}
            className="relative mb-6 overflow-hidden rounded-3xl border p-6 sm:p-8"
          >
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/[0.03] blur-3xl" />
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Root Control Plane Active
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-mono text-zinc-300">
                    <Shield size={11} className="text-zinc-200" />
                    Administrator Session
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-mono text-zinc-300">
                    <Mail size={11} className="text-emerald-400" />
                    admin@gmail.com
                  </span>
                </div>
                <h1 className="mt-3.5 text-2xl sm:text-4xl font-extrabold tracking-tight text-white flex items-center gap-2.5 flex-wrap">
                  <span>Qronos AI</span>
                  <span className="text-zinc-600 font-light">/</span>
                  <span className="text-xl sm:text-2xl font-mono text-zinc-400 font-medium">Operations Console</span>
                </h1>
                <p className="mt-2 text-xs sm:text-sm text-zinc-400 max-w-2xl leading-relaxed">
                  Passcode-scoped system administration, provider routing, token allocations, safety audits, and live platform telemetry.
                </p>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-10 rounded-full border-red-500/30 bg-red-500/10 text-xs font-mono text-red-300 hover:bg-red-500/20 hover:text-white px-4 cursor-pointer"
                    >
                      <LogOut size={13} className="mr-1.5" />
                      <span>Lock Control Plane</span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="border-white/10 bg-[#09090b] text-white rounded-2xl">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Lock Administrator Session?</AlertDialogTitle>
                      <AlertDialogDescription className="text-zinc-400 text-xs">
                        This session will be revoked. You can unlock the operations console again with your administrator passcode.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="border-white/10 bg-transparent text-zinc-300 hover:bg-white/10">
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => signOutAdmin.mutate()}
                        disabled={signOutAdmin.isPending}
                        className="bg-red-500 text-white hover:bg-red-600 font-bold"
                      >
                        {signOutAdmin.isPending ? "Locking…" : "Lock Session"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </div>
          {/* Pre-provision a GitHub account; exact, verified GitHub email match is required for activation; Awaiting verified GitHub login */}
          {body}
        </div>
      </div>
    </DashboardLayout>
  );
}
