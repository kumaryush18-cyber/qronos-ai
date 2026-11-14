import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MovingDotCard } from "@/components/ui/moving-dot-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { QRONOS_MODELS } from "@/lib/modelCatalogue";
import { coalesceDailyUsage } from "../../../shared/usageSeries";
import { markApiKeyRevoked, prependCreatedApiKey } from "../../../shared/apiKeyListCache";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Boxes,
  Check,
  CheckCircle2,
  Clipboard,
  Clock,
  Code2,
  Coins,
  Copy,
  Cpu,
  CreditCard,
  ExternalLink,
  Flame,
  Gift,
  Infinity as InfinityIcon,
  KeyRound,
  Loader2,
  LockKeyhole,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import "../dashboard.css";
import Playground from "./Playground";
import { CreditOverview, Profile, UsageLogs, formatCreditWhole, useIsCreditsEnabled } from "./CreditWorkspace";
import { DashboardModels } from "./DashboardModels";
import { DashboardPricingSection } from "@/components/dashboard/DashboardPricingSection";
import { StarButton } from "@/components/StarButton";
import { DiscordIcon } from "@/components/LoginWelcomeTour";
import { openDiscordVerifyModal } from "@/components/DiscordVerifyModal";
import { CreateApiKeyModal, NewApiKeyResult } from "@/components/CreateApiKeyModal";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { StarBorderCard } from "@/components/StarBorderCard";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PearlButton } from "@/components/ui/pearl-button";
import { CheckoutModal } from "@/components/CheckoutModal";
import { TransactionsWorkspace } from "@/components/TransactionsWorkspace";
import { PaymentsWorkspace } from "@/components/payments/PaymentsWorkspace";
import { UserTierBadge } from "@/components/UserTierBadge";
import { QronosGlyph } from "@/components/QronosGlyph";
import VapourAccent from "@/components/ui/vapour-accent";
import { buildQronosCurl, buildQronosJavaScript, buildQronosPython, QRONOS_API_BASE_URL } from "../../../shared/qronosApi";
import { clearOneTimeApiKey, getOneTimeApiKey, rememberOneTimeApiKey } from "../../../shared/oneTimeApiKey";
import { buildReferralInviteUrl } from "../../../shared/referrals";
import { EventsWorkspace } from "@/components/events/EventsWorkspace";

export const DASHBOARD_VIDEO_URL = "https://github.com/kumaryush18-cyber/qronos-media/releases/download/v1.0-media/dashboard_video.mp4";

let _hasGlobalVideoPreloaded = false;

export function useDashboardVideoPreloader(videoUrl: string = DASHBOARD_VIDEO_URL) {
  const [isReady, setIsReady] = useState(() => {
    if (typeof window === "undefined") return false;
    if (_hasGlobalVideoPreloaded) return true;
    try {
      return sessionStorage.getItem("qronos_video_preloaded") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (isReady) return;
    let cancelled = false;

    const markReady = () => {
      if (cancelled) return;
      _hasGlobalVideoPreloaded = true;
      try {
        sessionStorage.setItem("qronos_video_preloaded", "true");
      } catch {}
      setIsReady(true);
    };

    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = videoUrl;

    if (video.readyState >= 3) {
      markReady();
      return;
    }

    video.addEventListener("canplaythrough", markReady, { once: true });
    video.addEventListener("canplay", markReady, { once: true });
    video.addEventListener("loadeddata", markReady, { once: true });
    video.addEventListener("error", markReady, { once: true });

    // Preload stream via fetch to prime browser cache
    fetch(videoUrl, { mode: "cors" })
      .then((res) => {
        if (res.ok) markReady();
      })
      .catch(() => {});

    // Safety timeout so user is never permanently blocked on poor connection
    const timer = setTimeout(markReady, 4000);

    video.load();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      video.removeEventListener("canplaythrough", markReady);
      video.removeEventListener("canplay", markReady);
      video.removeEventListener("loadeddata", markReady);
      video.removeEventListener("error", markReady);
    };
  }, [videoUrl, isReady]);

  return isReady;
}

export function DashboardVideoLoadingScreen() {
  return (
    <div className="flex min-h-[520px] w-full flex-col items-center justify-center rounded-3xl border border-white/10 bg-[#010101] p-8 text-center backdrop-blur-2xl shadow-2xl">
      <div className="relative mb-6 flex h-20 w-20 items-center justify-center">
        <div className="absolute inset-0 rounded-3xl bg-emerald-500/20 blur-2xl animate-pulse" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-black/90 shadow-2xl">
          <QronosGlyph size={32} className="animate-pulse" />
        </div>
      </div>
      <div className="space-y-2">
        <h2 className="text-xl sm:text-2xl font-extrabold font-mono text-white tracking-tight">
          Entering Developer Workspace
        </h2>
        <p className="text-xs font-mono text-zinc-400 max-w-sm mx-auto flex items-center justify-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
          <span>Preloading dashboard media & telemetry stream…</span>
        </p>
      </div>
      <div className="mt-8 w-56 h-1 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-emerald-500 via-cyan-400 to-emerald-400 animate-pulse w-full" />
      </div>
    </div>
  );
}

type Section = "overview" | "keys" | "usage" | "playground" | "profile" | "referrals" | "models" | "model" | "transactions" | "payments" | "pricing" | "events" | "x-rewards";
type UsageData = {
  quota?: { suspended: boolean } | null;
  totalRequests: number;
  totalTokens: number;
  daily: { day: string; requests: number; tokens: number }[];
};

function UsageRing({ label, used, limit, tone = "violet" }: { label: string; used: number; limit: number; tone?: "violet" | "cyan" }) {
  const pct = Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  const color = tone === "cyan" ? "#79e8ef" : "#b89aff";
  return <div className="usage-ring"><div className="usage-ring__disc" style={{ background: `conic-gradient(${color} ${pct * 3.6}deg, rgba(255,255,255,.09) 0deg)` }}><div>{pct}%</div></div><div><p>{label}</p><span>{used.toLocaleString()} of {limit.toLocaleString()}</span></div></div>;
}

function KeySecret({ value, onDismiss }: { value: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success("API key copied to clipboard");
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <StarBorderCard
      lightWidth={220}
      duration={6}
      lightColor="rgba(255, 255, 255, 0.95)"
      className="rounded-3xl mb-6 shadow-2xl"
    >
      <div className="p-6 sm:p-7 bg-[#0c0d12]/95 rounded-[23px]">
        <div className="flex items-start justify-between gap-4 flex-wrap pb-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
              <ShieldCheck size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400">
                  One-Time Secret Token
                </span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <h3 className="text-base font-bold text-white tracking-tight mt-0.5">
                Save your cryptographic key now
              </h3>
            </div>
          </div>
          <Badge className="border-0 bg-white/[0.08] text-zinc-300 font-mono text-[10px]">
            SHA-256 Hashed at Rest
          </Badge>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-zinc-400 max-w-2xl">
          For your security, Qronos AI stores only a salted cryptographic hash of this key. This plaintext secret cannot be recovered after this session or if you dismiss this notice.
        </p>

        <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 rounded-xl border border-white/10 bg-black/80 p-3 shadow-inner">
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-white selection:bg-white/20 select-all px-1">
            {value}
          </code>
          <Button
            size="sm"
            onClick={copy}
            className="shrink-0 bg-white text-black hover:bg-zinc-200 font-mono font-bold text-xs h-9 px-4 cursor-pointer shadow-md"
          >
            {copied ? <Check size={14} className="mr-1.5" /> : <Copy size={14} className="mr-1.5" />}
            {copied ? "Copied" : "Copy key"}
          </Button>
        </div>

        <div className="mt-5 pt-3 border-t border-white/[0.06] flex items-center justify-between flex-wrap gap-3">
          <span className="text-[11px] font-mono text-zinc-500">
            Compatible with Cursor, Claude Code, and all Anthropic SDKs
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={onDismiss}
            className="border-white/15 text-zinc-300 hover:bg-white/10 hover:text-white text-xs font-mono h-8 cursor-pointer"
          >
            I’ve saved this key securely
          </Button>
        </div>
      </div>
    </StarBorderCard>
  );
}

function ApiKeyCreatedModal({
  data,
  onClose,
}: {
  data: { key: string; label: string; keyGroup: string } | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!data?.key) return;
    await navigator.clipboard.writeText(data.key);
    setCopied(true);
    toast.success("API key copied to clipboard!");
    window.setTimeout(() => setCopied(false), 2500);
  };

  useEffect(() => {
    if (data?.key) {
      navigator.clipboard.writeText(data.key).catch(() => {});
    }
  }, [data]);

  if (!data) return null;

  return (
    <Dialog open={Boolean(data)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="border border-white/15 bg-[#090a10]/98 p-0 text-white sm:max-w-md rounded-3xl overflow-hidden shadow-2xl backdrop-blur-2xl">
        <div className="p-6 sm:p-7 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 mb-4 shadow-lg shadow-emerald-500/10">
            <ShieldCheck size={24} />
          </div>

          <DialogTitle className="text-xl font-extrabold text-white tracking-tight">
            API Key Created Successfully
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400 mt-1 font-mono">
            {data.label || "Default Key"} • {data.keyGroup === "token_plan" ? "Token Plan Quota" : "PAYG Quota"}
          </DialogDescription>

          <div className="my-5 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-3.5 text-xs text-amber-200/90 leading-relaxed font-mono text-left">
            <span>
              <strong>Save your secret key now.</strong> For security reasons, Qronos AI does not store plaintext keys. It will not be shown again once you close this window.
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/90 p-3 shadow-inner">
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-white selection:bg-white/20 select-all text-left">
                {data.key}
              </code>
            </div>

            <Button
              onClick={copy}
              className="w-full h-11 rounded-xl bg-white text-black hover:bg-zinc-200 font-mono font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer"
            >
              {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
              <span>{copied ? "Copied to Clipboard!" : "Copy Full API Key"}</span>
            </Button>
          </div>

          <div className="mt-5 pt-3 border-t border-white/[0.08] flex items-center justify-between">
            <span className="text-[10px] font-mono text-zinc-500">Auto-copied to clipboard</span>
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="h-8 rounded-lg border-white/10 text-xs font-mono text-zinc-300 hover:text-white cursor-pointer"
            >
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CurlExample({ apiKey }: { apiKey?: string }) {
  const [copied, setCopied] = useState(false);
  const command = buildQronosCurl(apiKey);
  const copy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    toast.success(apiKey ? "cURL command with your new key copied" : "cURL template copied to clipboard");
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section
      style={{
        backgroundColor: "oklch(0.18 0 0)",
        borderColor: "oklch(0.26 0 0)",
      }}
      className="min-w-0 overflow-hidden rounded-xl border p-4"
      aria-labelledby="curl-example-title"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[.16em] font-mono text-zinc-400">Hosted endpoint</p>
          <h3 id="curl-example-title" className="mt-1 text-sm font-bold text-white">Make your first request</h3>
          <p className="mt-1 text-xs leading-5 text-zinc-400">{apiKey ? "This one-time command contains the new plaintext key shown above. Save it securely before dismissing." : "Create or rotate a key to populate this command automatically. Until then, it uses a safe placeholder."}</p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 border-white/15 text-zinc-200 hover:bg-white/10" onClick={copy}>
          {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy cURL"}
        </Button>
      </div>
      <p className="mt-3 break-all rounded-lg border border-white/10 bg-black/60 px-3 py-2 font-mono text-[10px] text-zinc-300">{QRONOS_API_BASE_URL}</p>
      <pre className="mt-3 w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-lg border border-white/10 bg-black p-3"><code className="block min-w-max font-mono text-[11px] leading-5 text-zinc-200">{command}</code></pre>
    </section>
  );
}

type SdkLanguage = "javascript" | "python";

function SdkQuickStart({ apiKey }: { apiKey?: string }) {
  const [language, setLanguage] = useState<SdkLanguage>("javascript");
  const [copied, setCopied] = useState(false);
  const isJavaScript = language === "javascript";
  const installCommand = isJavaScript ? "npm install @anthropic-ai/sdk" : "pip install anthropic";
  const code = isJavaScript ? buildQronosJavaScript(apiKey) : buildQronosPython(apiKey);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success(`${isJavaScript ? "JavaScript" : "Python"} quick-start copied`);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section
      style={{
        backgroundColor: "oklch(0.18 0 0)",
        borderColor: "oklch(0.26 0 0)",
      }}
      className="min-w-0 overflow-hidden rounded-xl border p-4"
      aria-labelledby="sdk-quickstart-title"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[.16em] font-mono text-zinc-400">Anthropic Messages SDK</p>
          <h3 id="sdk-quickstart-title" className="mt-1 text-sm font-bold text-white">Start from your language</h3>
          <p className="mt-1 max-w-xl text-xs leading-5 text-zinc-400">Use the standard Anthropic SDK with Qronos AI’s hosted base URL. {apiKey ? "The selected snippet includes the new plaintext key shown above." : "Create or rotate a key to populate a selected snippet automatically."}</p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 border-white/15 text-zinc-200 hover:bg-white/10" onClick={copy}>
          {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy code"}
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="SDK language">
        <button type="button" role="tab" aria-selected={isJavaScript} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${isJavaScript ? "border-white/30 bg-white/15 text-white" : "border-white/10 bg-black/40 text-zinc-400 hover:bg-white/5 hover:text-white"}`} onClick={() => setLanguage("javascript")}>JavaScript</button>
        <button type="button" role="tab" aria-selected={!isJavaScript} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${!isJavaScript ? "border-white/30 bg-white/15 text-white" : "border-white/10 bg-black/40 text-zinc-400 hover:bg-white/5 hover:text-white"}`} onClick={() => setLanguage("python")}>Python</button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400"><span className="font-semibold text-zinc-200">Install:</span><code className="max-w-full overflow-x-auto rounded border border-white/10 bg-black/60 px-2 py-1 font-mono text-zinc-200">{installCommand}</code></div>
      <pre className="mt-3 w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-lg border border-white/10 bg-black p-3"><code className="block min-w-max font-mono text-[11px] leading-5 text-zinc-200">{code}</code></pre>
    </section>
  );
}

function KeyCreateForm({ onSuccess, activeCount = 0 }: { onSuccess: (value: NewApiKeyResult) => void; activeCount?: number }) {
  const { user } = useAuth();
  const isDiscordVerified = Boolean((user as any)?.discordVerifiedAt || (user as any)?.isAdminSession);
  const isLimitReached = activeCount >= 10;
  const [selectedPlan, setSelectedPlan] = useState<"token_plan" | "payg">("token_plan");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openCreateModal = (plan: "token_plan" | "payg") => {
    if (!isDiscordVerified) {
      openDiscordVerifyModal();
      return;
    }
    if (isLimitReached) {
      toast.error("Maximum limit of 10 active API keys reached. Please revoke or delete an existing key first.");
      return;
    }
    setSelectedPlan(plan);
    setIsModalOpen(true);
  };

  if (!isDiscordVerified) {
    return (
      <div
        style={{
          backgroundColor: "oklch(0.14 0 0)",
          borderColor: "oklch(0.26 0 0)",
          boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
        className="rounded-3xl border p-6 sm:p-8 shadow-2xl mb-6 relative overflow-hidden text-center"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#5865F2]/15 border border-[#5865F2]/30 text-[#5865F2] mb-4 shadow-lg shadow-[#5865F2]/20">
          <DiscordIcon className="h-7 w-7" />
        </div>
        <p className="text-[10px] font-mono font-bold uppercase tracking-[.18em] text-[#9ba5f7]">
          Verification Required
        </p>
        <h2 className="mt-1 text-xl sm:text-2xl font-extrabold text-white tracking-tight">
          Verify Discord to Generate API Keys
        </h2>
        <p className="mt-2 text-xs sm:text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
          To protect community quota pools and activate cryptographic key generation, verify your membership in the Qronos AI Discord server.
        </p>
        <div className="mt-6 flex justify-center">
          <button type="button" onClick={openDiscordVerifyModal} className="cursor-pointer focus:outline-none">
            <StarButton
              backgroundColor="#06070b"
              lightColor="rgba(88, 101, 242, 0.95)"
              starColor="#5865F2"
              borderWidth={2}
              duration={3}
              className="h-11 px-6 rounded-full border border-[#5865F2]/70 hover:border-[#7289da] text-xs font-mono font-bold shadow-[0_0_25px_rgba(88,101,242,0.4)]"
            >
              <DiscordIcon className="h-4 w-4 text-[#5865F2] mr-2" />
              <span>Connect Discord &amp; Claim 10M Tokens</span>
            </StarButton>
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <CreateApiKeyModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        initialKeyGroup={selectedPlan}
        activeCount={activeCount}
        onSuccess={onSuccess}
      />

      <section
        style={{
          backgroundColor: "oklch(0.14 0 0)",
          borderColor: "oklch(0.26 0 0)",
          boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
        className="rounded-3xl border p-5 sm:p-7 shadow-2xl mb-6 relative overflow-hidden"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-5 border-b border-white/[0.08]">
          <div>
            <div className="flex items-center gap-2">
              <KeyRound size={15} className="text-white" />
              <span className="text-[10px] font-bold uppercase tracking-[.18em] font-mono text-zinc-400">
                Credential Generator
              </span>
            </div>
            <h2 className="mt-1 text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              Generate New API Key
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              Configure key name, expiration date with auto-delete, and quota limits.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              className={
                isLimitReached
                  ? "border border-amber-500/40 bg-amber-500/15 text-amber-300 font-mono text-[10px]"
                  : "border border-white/10 bg-white/[0.06] text-zinc-300 font-mono text-[10px]"
              }
            >
              {activeCount} / 10 Active Keys
            </Badge>
          </div>
        </div>

        {isLimitReached && (
          <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200 font-mono">
            <AlertTriangle size={16} className="shrink-0 text-amber-400" />
            <span>Active key limit reached. Revoke or delete an existing key before creating a new one.</span>
          </div>
        )}

        {/* Plan Cards to trigger modal */}
        <div className="mt-5">
          <label className="text-xs font-semibold text-zinc-300 block mb-2.5 font-mono">
            Click to configure &amp; create key:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Token Plan Card */}
            <button
              type="button"
              onClick={() => openCreateModal("token_plan")}
              style={{
                backgroundColor: "oklch(0.18 0 0)",
                borderColor: "oklch(0.26 0 0)",
              }}
              className="flex flex-col items-start rounded-2xl border p-4 sm:p-5 text-left transition-all cursor-pointer relative overflow-hidden group hover:border-emerald-500/50 hover:bg-emerald-500/[0.04] hover:shadow-[0_0_25px_rgba(16,185,129,0.1)]"
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-xs sm:text-sm font-bold text-white flex items-center gap-2 font-mono">
                  <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                    <Code2 size={14} />
                  </span>
                  <span>Token Plan Key</span>
                </span>
                <Badge className="border-0 bg-white/[0.08] text-white font-mono text-[9px]">
                  10M / $1
                </Badge>
              </div>
              <p className="mt-2.5 text-[11px] leading-relaxed text-zinc-400">
                Deducts strictly from Token Plan quota (Claude Opus 5.5, GLM-5.3, DeepSeek). Set custom token limit or leave unlimited.
              </p>
              <div className="mt-4 flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-400 group-hover:translate-x-1 transition-transform">
                <Plus size={13} />
                <span>Configure &amp; Generate Token Key →</span>
              </div>
            </button>

            {/* PAYG Card */}
            <button
              type="button"
              onClick={() => openCreateModal("payg")}
              style={{
                backgroundColor: "oklch(0.18 0 0)",
                borderColor: "oklch(0.26 0 0)",
              }}
              className="flex flex-col items-start rounded-2xl border p-4 sm:p-5 text-left transition-all cursor-pointer relative overflow-hidden group hover:border-amber-500/50 hover:bg-amber-500/[0.04] hover:shadow-[0_0_25px_rgba(245,158,11,0.1)]"
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-xs sm:text-sm font-bold text-white flex items-center gap-2 font-mono">
                  <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                    <Zap size={14} />
                  </span>
                  <span>PAYG Key</span>
                </span>
                <Badge className="border-0 bg-white/[0.08] text-white font-mono text-[9px]">
                  +100% Match
                </Badge>
              </div>
              <p className="mt-2.5 text-[11px] leading-relaxed text-zinc-400">
                Deducts strictly from Pay-As-You-Go compute balance at official zero-markup rates. Set dollar spend limit or leave unlimited.
              </p>
              <div className="mt-4 flex items-center gap-1.5 text-xs font-mono font-bold text-amber-400 group-hover:translate-x-1 transition-transform">
                <Plus size={13} />
                <span>Configure &amp; Generate PAYG Key →</span>
              </div>
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

function ApiKeyList() {
  const keys = trpc.developer.apiKeys.useQuery();
  const utils = trpc.useUtils();
  const [plainTextKey, setPlainTextKey] = useState<string | null>(null);
  const [createdModalData, setCreatedModalData] = useState<{ key: string; label: string; keyGroup: string } | null>(null);
  const [activeSnippetKey, setActiveSnippetKey] = useState<number | null>(null);

  const showNewKey = (value: NewApiKeyResult) => {
    const record = { ...value.record, lastUsedAt: null, revokedAt: null };
    utils.developer.apiKeys.setData(undefined, (current) => prependCreatedApiKey(current, record as never));
    setPlainTextKey(value.key);
    rememberOneTimeApiKey(value.key);
    setCreatedModalData({
      key: value.key,
      label: value.record.label,
      keyGroup: (value.record as any).keyGroup || "token_plan",
    });
  };

  const revoke = trpc.developer.revokeApiKey.useMutation({
    onSuccess: (_, variables) => {
      utils.developer.apiKeys.setData(undefined, (current) =>
        current ? current.filter((k) => k.id !== variables.apiKeyId) : []
      );
      toast.success("API key deleted permanently");
    },
    onError: (error) => toast.error(error.message),
  });

  const rotate = trpc.developer.rotateApiKey.useMutation({
    onSuccess: (value, variables) => {
      const record = { ...value.record, lastUsedAt: null, revokedAt: null };
      utils.developer.apiKeys.setData(undefined, (current) =>
        prependCreatedApiKey((current || []).filter((k) => k.id !== variables.apiKeyId), record as never)
      );
      setPlainTextKey(value.key);
      rememberOneTimeApiKey(value.key);
      toast.success("Key rotated — copy the new secret now");
    },
    onError: (error) => toast.error(error.message),
  });

  if (keys.isLoading)
    return (
      <div className="grid min-h-48 place-items-center rounded-3xl border border-white/10 bg-black/40">
        <Loader2 className="animate-spin text-zinc-400" size={24} />
      </div>
    );

  const dismissPlainTextKey = () => {
    clearOneTimeApiKey();
    setPlainTextKey(null);
  };

  const activeKeys = (keys.data || []).filter((k) => k.status === "active");
  const activeCount = activeKeys.length;

  return (
    <div className="space-y-4">
      {createdModalData && (
        <ApiKeyCreatedModal
          data={createdModalData}
          onClose={() => setCreatedModalData(null)}
        />
      )}
      {plainTextKey && <KeySecret value={plainTextKey} onDismiss={dismissPlainTextKey} />}
      <KeyCreateForm onSuccess={showNewKey} activeCount={activeCount} />

      {/* Keys List Surface */}
      <section
        style={{
          backgroundColor: "oklch(0.14 0 0)",
          borderColor: "oklch(0.26 0 0)",
          boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
        className="rounded-3xl border p-5 sm:p-7 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between pb-5 border-b border-white/[0.08] flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-white" />
              <span className="text-[10px] font-bold uppercase tracking-[.18em] font-mono text-zinc-400">
                Active Key Vault
              </span>
            </div>
            <h3 className="mt-1 text-xl font-extrabold text-white tracking-tight">
              Configured Credentials
            </h3>
          </div>
          <span className="text-xs font-mono text-zinc-400">
            {keys.data?.length ?? 0} credential{keys.data?.length === 1 ? "" : "s"} registered
          </span>
        </div>

        {keys.data?.length ? (
          <div className="mt-5 space-y-3">
            {keys.data.map((key) => {
              const rawGroup = (key as any).keyGroup;
              const isTokenPlan = rawGroup === "token_plan" || rawGroup === "tokens" || rawGroup === "coding_plan";
              const isPayg = rawGroup === "payg";
              const isSnippetOpen = activeSnippetKey === key.id;

              return (
                <div
                  key={key.id}
                  style={{
                    backgroundColor: "oklch(0.18 0 0)",
                    borderColor: "oklch(0.26 0 0)",
                  }}
                  className="rounded-2xl border p-4 sm:p-5 transition-all duration-200 hover:border-white/30"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3.5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] border border-white/10 text-white mt-0.5">
                        <KeyRound size={17} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-white tracking-tight">{key.label}</p>
                          {isTokenPlan ? (
                            <Badge className="border border-white/15 bg-white/[0.08] text-white font-mono text-[9px] px-2 py-0.5 flex items-center gap-1">
                              <Code2 size={10} /> Token Plan
                            </Badge>
                          ) : (
                            <Badge className="border border-white/15 bg-white/[0.08] text-white font-mono text-[9px] px-2 py-0.5 flex items-center gap-1">
                              <Zap size={10} /> PAYG
                            </Badge>
                          )}
                          <Badge
                            className={
                              key.status === "active"
                                ? "border-0 bg-emerald-500/10 text-emerald-400 font-mono text-[9px]"
                                : "border-0 bg-red-400/10 text-red-300 font-mono text-[9px]"
                            }
                          >
                            {key.status === "active" ? "● Active" : "Revoked"}
                          </Badge>

                          {/* Quota Limit Badge */}
                          {(key as any).spendLimitTokens ? (
                            <Badge className="border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 font-mono text-[9px] px-2 py-0.5 flex items-center gap-1">
                              <Coins size={9} /> Max: {(((key as any).spendLimitTokens) / 1_000_000).toFixed(0)}M tokens
                            </Badge>
                          ) : (key as any).spendLimitNanos ? (
                            <Badge className="border border-amber-500/30 bg-amber-500/10 text-amber-300 font-mono text-[9px] px-2 py-0.5 flex items-center gap-1">
                              <Coins size={9} /> Max: ${(((key as any).spendLimitNanos) / 1_000_000_000).toFixed(2)}
                            </Badge>
                          ) : (
                            <Badge className="border border-white/10 bg-white/[0.04] text-zinc-400 font-mono text-[9px] px-2 py-0.5 flex items-center gap-1">
                              <InfinityIcon size={9} /> Unlimited
                            </Badge>
                          )}

                          {/* Expiration Date Badge */}
                          {(key as any).expiresAt ? (
                            <Badge className="border border-amber-400/30 bg-amber-400/15 text-amber-300 font-mono text-[9px] px-2 py-0.5 flex items-center gap-1">
                              <Clock size={9} /> Expires: {new Date((key as any).expiresAt).toLocaleDateString()}
                            </Badge>
                          ) : (
                            <Badge className="border border-white/10 bg-white/[0.04] text-zinc-400 font-mono text-[9px] px-2 py-0.5 flex items-center gap-1">
                              <ShieldCheck size={9} className="text-emerald-400" /> Never expires
                            </Badge>
                          )}
                        </div>

                        <div className="mt-2 flex items-center gap-2.5 text-xs font-mono text-zinc-400 flex-wrap">
                          <span className="rounded bg-black/60 px-2 py-0.5 border border-white/10 text-zinc-300">
                            {key.prefix}••••••••••••
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-[10px] font-mono text-zinc-400 hover:text-white hover:bg-white/10 gap-1 cursor-pointer"
                            onClick={async () => {
                              const secret = plainTextKey || getOneTimeApiKey();
                              if (secret && secret.startsWith(key.prefix.replace("…", ""))) {
                                await navigator.clipboard.writeText(secret);
                                toast.success("Full secret API key copied to clipboard!");
                              } else {
                                await navigator.clipboard.writeText(key.prefix);
                                toast.info("Key prefix copied. For security, full keys are shown once upon creation.");
                              }
                            }}
                          >
                            <Copy size={11} />
                            <span>Copy</span>
                          </Button>
                          <span>Created {new Date(key.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions Row */}
                    <div className="flex items-center gap-1.5 self-end sm:self-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Toggle integration snippet"
                        className="text-zinc-400 hover:text-white hover:bg-white/[0.08] text-xs font-mono h-8 cursor-pointer"
                        onClick={() => setActiveSnippetKey(isSnippetOpen ? null : key.id)}
                      >
                        <Terminal size={13} className="mr-1" />
                        <span>Snippet</span>
                      </Button>

                      {key.status === "active" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Rotate key (Generates new secret)"
                            className="text-zinc-400 hover:text-white hover:bg-white/[0.08] text-xs font-mono h-8 cursor-pointer"
                            disabled={rotate.isPending}
                            onClick={() =>
                              rotate.mutate({
                                apiKeyId: key.id,
                                label: `${key.label.slice(0, 80)} · rotated`,
                                keyGroup: (key as any).keyGroup,
                              })
                            }
                          >
                            <RefreshCw size={13} className={rotate.isPending ? "animate-spin mr-1" : "mr-1"} />
                            <span>Rotate</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Delete API key permanently"
                            className="text-red-400 hover:bg-red-400/10 hover:text-red-300 text-xs font-mono h-8 cursor-pointer"
                            disabled={revoke.isPending}
                            onClick={() => {
                              if (confirm(`Are you sure you want to permanently delete API key "${key.label}"?`)) {
                                revoke.mutate({ apiKeyId: key.id });
                              }
                            }}
                          >
                            <Trash2 size={13} className="mr-1" />
                            <span>Delete</span>
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expandable Snippet Drawer */}
                  {isSnippetOpen && (
                    <div className="mt-4 pt-3 border-t border-white/[0.08] rounded-xl bg-black/70 p-3.5 border border-white/10">
                      <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 pb-2 border-b border-white/[0.06]">
                        <span>Cursor & Claude Code Configuration:</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[10px] text-zinc-300 hover:text-white cursor-pointer"
                          onClick={() => {
                            navigator.clipboard.writeText(`export ANTHROPIC_BASE_URL="${QRONOS_API_BASE_URL}"\nexport ANTHROPIC_API_KEY="${key.prefix}..."`);
                            toast.success("Snippet copied");
                          }}
                        >
                          <Copy size={11} className="mr-1" /> Copy
                        </Button>
                      </div>
                      <pre className="mt-2 text-[11px] font-mono text-zinc-300 overflow-x-auto leading-relaxed">
                        <code>{`export ANTHROPIC_BASE_URL="${QRONOS_API_BASE_URL}"\nexport ANTHROPIC_API_KEY="${key.prefix}..."`}</code>
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-white/15 p-12 text-center bg-black/30">
            <KeyRound className="mx-auto text-zinc-500 mb-3" size={28} />
            <p className="text-sm font-bold text-white">No active credentials</p>
            <p className="mt-1 text-xs text-zinc-400 max-w-sm mx-auto">
              Generate a labeled API key above to connect Cursor, Claude Code, Python, or TypeScript.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function UsageChart({ daily }: { daily: { day: string; requests: number; tokens: number }[] }) {
  const data = useMemo(() => coalesceDailyUsage(daily).slice(-14), [daily]);
  const maxTokens = Math.max(1, ...data.map((row) => row.tokens));
  const maxRequests = Math.max(1, ...data.map((row) => row.requests));
  const [metricType, setMetricType] = useState<"tokens" | "requests">("tokens");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!data.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center rounded-2xl border border-white/[0.08] bg-black/40">
        <BarChart3 className="text-zinc-600 mb-2" size={28} />
        <p className="text-sm font-semibold text-white">No requests recorded yet</p>
        <p className="text-xs text-zinc-500 mt-1 max-w-xs">
          Your throughput activity will automatically visualize here once requests flow through the gateway.
        </p>
      </div>
    );
  }

  const totalTokens = data.reduce((acc, row) => acc + row.tokens, 0);
  const totalRequests = data.reduce((acc, row) => acc + row.requests, 0);
  const maxVal = metricType === "tokens" ? maxTokens : maxRequests;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMetricType("tokens")}
            className={`rounded-lg px-3 py-1 text-xs font-mono transition-all cursor-pointer ${
              metricType === "tokens"
                ? "bg-white text-black font-bold shadow-sm"
                : "bg-white/[0.06] text-zinc-400 hover:text-white"
            }`}
          >
            Tokens ({totalTokens.toLocaleString()})
          </button>
          <button
            type="button"
            onClick={() => setMetricType("requests")}
            className={`rounded-lg px-3 py-1 text-xs font-mono transition-all cursor-pointer ${
              metricType === "requests"
                ? "bg-white text-black font-bold shadow-sm"
                : "bg-white/[0.06] text-zinc-400 hover:text-white"
            }`}
          >
            Requests ({totalRequests.toLocaleString()})
          </button>
        </div>
        <div className="text-[11px] font-mono text-zinc-400">
          Peak {metricType}: <span className="text-white font-bold">{maxVal.toLocaleString()}</span>
        </div>
      </div>

      <div className="relative pt-6 pb-2">
        <div className="flex h-44 items-end gap-1.5 sm:gap-2.5">
          {data.map((row, idx) => {
            const val = metricType === "tokens" ? row.tokens : row.requests;
            const heightPct = Math.max(6, Math.round((val / maxVal) * 100));
            const isHovered = hoveredIdx === idx;
            const isPeak = val === maxVal && val > 0;

            return (
              <div
                key={row.day}
                className="group relative flex flex-1 h-full flex-col items-center justify-end cursor-pointer"
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {isHovered && (
                  <div className="absolute -top-14 z-30 flex flex-col items-center rounded-lg border border-white/20 bg-black/95 px-2.5 py-1.5 text-center shadow-xl pointer-events-none whitespace-nowrap animate-in fade-in-0 zoom-in-95">
                    <span className="text-[10px] font-mono text-zinc-400">{row.day}</span>
                    <span className="text-xs font-mono font-bold text-white">
                      {row.tokens.toLocaleString()} tokens • {row.requests.toLocaleString()} reqs
                    </span>
                  </div>
                )}
                <div className="w-full rounded-md bg-white/[0.05] p-0.5 h-full flex items-end">
                  <div
                    style={{ height: `${heightPct}%` }}
                    className={`w-full rounded transition-all duration-300 ${
                      isPeak
                        ? "bg-gradient-to-t from-zinc-400 to-white shadow-[0_0_12px_rgba(255,255,255,0.35)]"
                        : isHovered
                        ? "bg-white"
                        : "bg-white/40 group-hover:bg-white/70"
                    }`}
                  />
                </div>
                <span className="mt-2 text-[9px] font-mono text-zinc-500 group-hover:text-zinc-300 transition-colors">
                  {row.day.slice(5)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PageIntro({ eyebrow, title, subtitle, action }: { eyebrow: string; title: React.ReactNode; subtitle: string; action?: React.ReactNode }) {
  return <div className="dashboard-page-intro"><div><p>{eyebrow}</p><h1>{title}</h1><span>{subtitle}</span></div>{action}</div>;
}

type IntegrationTab = "curl" | "python" | "javascript" | "cursor" | "claude_code";

function OverviewIntegrationDesk() {
  const [apiKey, setApiKey] = useState(() => getOneTimeApiKey());
  const [tab, setTab] = useState<IntegrationTab>("curl");
  const [copied, setCopied] = useState(false);

  const hideOneTimeKey = () => {
    clearOneTimeApiKey();
    setApiKey(null);
    toast.success("One-time key hidden from integration examples");
  };

  const effectiveKey = apiKey || "qr_your_key";

  const getCodeSnippet = () => {
    switch (tab) {
      case "curl":
        return buildQronosCurl(apiKey ?? undefined);
      case "python":
        return buildQronosPython(apiKey ?? undefined);
      case "javascript":
        return buildQronosJavaScript(apiKey ?? undefined);
      case "cursor":
        return `// Cursor Settings -> Models -> OpenAI/Anthropic Base URL Override
{
  "anthropic.baseUrl": "${QRONOS_API_BASE_URL}",
  "anthropic.apiKey": "${effectiveKey}"
}`;
      case "claude_code":
        return `# Point Claude Code CLI directly to Qronos AI
export ANTHROPIC_BASE_URL="${QRONOS_API_BASE_URL}"
export ANTHROPIC_API_KEY="${effectiveKey}"
claude`;
    }
  };

  const code = getCodeSnippet();

  const copyCode = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Code snippet copied to clipboard");
    window.setTimeout(() => setCopied(false), 1500);
  };

  const getInstallNote = () => {
    if (tab === "python") return "pip install anthropic";
    if (tab === "javascript") return "npm install @anthropic-ai/sdk";
    if (tab === "cursor") return "Cursor IDE version >= 0.40";
    if (tab === "claude_code") return "npm install -g @anthropic-ai/claude-code";
    return "Standard Unix / Windows Terminal cURL";
  };

  return (
    <section
      style={{
        backgroundColor: "oklch(0.14 0 0)",
        borderColor: "oklch(0.26 0 0)",
        boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
      className="rounded-3xl border p-5 sm:p-7 mb-6 shadow-2xl relative overflow-hidden"
      aria-labelledby="overview-quickstart-title"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2">
            <Radio size={14} className="text-white" />
            <p className="text-[10px] font-bold uppercase tracking-[.18em] font-mono text-zinc-400">
              Interactive Integration Workbench
            </p>
          </div>
          <h2 id="overview-quickstart-title" className="mt-1 text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Connect Any Tool or Agent
          </h2>
          <p className="mt-1 text-xs text-zinc-400">
            Native Anthropic Messages API compatible. Works seamlessly with Cursor, Claude Code, Python, and TypeScript.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Link href="/dashboard/keys" className="dashboard-outline-action font-mono text-xs">
            <KeyRound size={13} /> Manage keys
          </Link>
          <Button
            size="sm"
            onClick={copyCode}
            className="h-9 px-4 rounded-full bg-white text-black font-bold text-xs hover:bg-zinc-200 transition-all cursor-pointer shadow-md"
          >
            {copied ? <Check size={14} className="mr-1.5" /> : <Copy size={14} className="mr-1.5" />}
            {copied ? "Copied" : "Copy snippet"}
          </Button>
        </div>
      </div>

      {apiKey && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/[0.04] p-3">
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-200">
            <ShieldCheck size={15} className="text-emerald-400 shrink-0" />
            <span>Active one-time key injected into code snippets below. Save it before navigating away.</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-white/20 text-white hover:bg-white/10 text-xs font-mono h-7"
            onClick={hideOneTimeKey}
          >
            Hide key
          </Button>
        </div>
      )}

      {/* Language / Client Selector Tabs */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setTab("curl")}
          className={`rounded-lg px-3 py-1.5 text-xs font-mono font-semibold transition-all cursor-pointer ${
            tab === "curl"
              ? "bg-white text-black shadow-md"
              : "bg-white/[0.06] text-zinc-400 hover:text-white hover:bg-white/[0.1]"
          }`}
        >
          cURL
        </button>
        <button
          type="button"
          onClick={() => setTab("python")}
          className={`rounded-lg px-3 py-1.5 text-xs font-mono font-semibold transition-all cursor-pointer ${
            tab === "python"
              ? "bg-white text-black shadow-md"
              : "bg-white/[0.06] text-zinc-400 hover:text-white hover:bg-white/[0.1]"
          }`}
        >
          Python (Anthropic SDK)
        </button>
        <button
          type="button"
          onClick={() => setTab("javascript")}
          className={`rounded-lg px-3 py-1.5 text-xs font-mono font-semibold transition-all cursor-pointer ${
            tab === "javascript"
              ? "bg-white text-black shadow-md"
              : "bg-white/[0.06] text-zinc-400 hover:text-white hover:bg-white/[0.1]"
          }`}
        >
          TypeScript / Node
        </button>
        <button
          type="button"
          onClick={() => setTab("cursor")}
          className={`rounded-lg px-3 py-1.5 text-xs font-mono font-semibold transition-all cursor-pointer ${
            tab === "cursor"
              ? "bg-white text-black shadow-md"
              : "bg-white/[0.06] text-zinc-400 hover:text-white hover:bg-white/[0.1]"
          }`}
        >
          Cursor IDE
        </button>
        <button
          type="button"
          onClick={() => setTab("claude_code")}
          className={`rounded-lg px-3 py-1.5 text-xs font-mono font-semibold transition-all cursor-pointer ${
            tab === "claude_code"
              ? "bg-white text-black shadow-md"
              : "bg-white/[0.06] text-zinc-400 hover:text-white hover:bg-white/[0.1]"
          }`}
        >
          Claude Code CLI
        </button>
      </div>

      {/* Install command note */}
      <div className="mt-3 flex items-center gap-2 text-[11px] font-mono text-zinc-400">
        <span className="text-zinc-500 uppercase tracking-wider">Requirement:</span>
        <code className="rounded border border-white/10 bg-black/60 px-2 py-0.5 text-zinc-300">
          {getInstallNote()}
        </code>
      </div>

      {/* Terminal View */}
      <div className="mt-3 relative rounded-2xl border border-white/10 bg-black/80 overflow-hidden shadow-inner">
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.08] bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
            <span className="text-[10px] font-mono text-zinc-400 ml-2">endpoint: {QRONOS_API_BASE_URL}/v1</span>
          </div>
          <span className="text-[10px] font-mono text-zinc-500 uppercase">UTF-8</span>
        </div>
        <pre className="p-4 sm:p-5 overflow-x-auto text-[11px] sm:text-xs font-mono leading-relaxed text-zinc-200">
          <code>{code}</code>
        </pre>
      </div>
    </section>
  );
}

function PlatformUsageMetrics() {
  const metrics = trpc.public.modelTokenMetrics.useQuery(undefined, {
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
  });
  const totalTokens = metrics.data?.totalTokens ?? 0;
  const refreshedAt = metrics.dataUpdatedAt
    ? new Date(metrics.dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  return (
    <section className="h-full flex flex-col justify-between" aria-labelledby="platform-usage-title">
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <p className="text-[10px] font-bold uppercase tracking-[.18em] font-mono text-zinc-400">
              Live Network Activity
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] border border-white/10 px-2 py-0.5 text-[9px] font-mono text-zinc-300">
            28+ Routes Live
          </span>
        </div>

        <h3 id="platform-usage-title" className="mt-4 text-xl font-bold tracking-tight text-white">
          Global Mesh Volume
        </h3>
        <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
          Aggregated lifetime successful tokens settled across Qronos AI model gateways. Refreshes every 15 seconds.
        </p>
      </div>

      <div className="my-6 relative flex flex-col items-center justify-center">
        {/* Animated concentric radar pulse rings */}
        <div className="pointer-events-none absolute h-40 w-40 rounded-full border border-white/[0.06] animate-ping opacity-25" />
        <div className="pointer-events-none absolute h-48 w-48 rounded-full border border-white/[0.04] animate-pulse opacity-20" />

        <StarBorderCard
          lightWidth={180}
          duration={5}
          lightColor="rgba(255, 255, 255, 0.95)"
          className="relative z-10 w-full rounded-2xl shadow-2xl"
        >
          <div
            style={{
              backgroundColor: "oklch(0.18 0 0)",
            }}
            className="p-6 text-center overflow-hidden rounded-[15px] relative"
          >
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
            <div className="text-[10px] font-mono uppercase tracking-[.2em] text-zinc-400 font-semibold">
              Total Tokens Processed
            </div>
            <div className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight text-white mt-2">
              {metrics.isLoading ? (
                <Loader2 className="inline-block animate-spin text-zinc-400" size={28} />
              ) : (
                new Intl.NumberFormat().format(totalTokens)
              )}
            </div>
            <div className="text-[11px] text-zinc-400 mt-2.5 font-mono flex items-center justify-center gap-1.5">
              <RefreshCw size={11} className={metrics.isFetching ? "animate-spin text-white" : "text-zinc-500"} />
              <span>
                {metrics.isFetching ? "Synchronizing mesh..." : refreshedAt ? `Updated at ${refreshedAt}` : "Connected"}
              </span>
            </div>
          </div>
        </StarBorderCard>
      </div>

      <div className="pt-4 border-t border-white/[0.08] flex items-center justify-between text-[11px] font-mono text-zinc-400">
        <span className="flex items-center gap-1.5">
          <Zap size={12} className="text-zinc-300" /> SSE Direct Streaming
        </span>
        <span className="text-zinc-500">Zero Gateway Markup</span>
      </div>
    </section>
  );
}

function UnifiedBalancesPortfolio() {
  const wallet = trpc.developer.wallet.useQuery();
  const utils = trpc.useUtils();
  const creditsEnabled = useIsCreditsEnabled(wallet.data?.creditsEnabled);

  const claimCheckin = trpc.developer.claimDailyCheckin.useMutation({
    onSuccess: (res) => {
      if (res.claimed) {
        toast.success(`🎉 Daily reward claimed: ${res.rewardFormatted} added to your balance!`);
      } else {
        toast.info("You have already claimed today's UTC check-in reward.");
      }
      void utils.developer.wallet.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to claim check-in reward"),
  });

  const data = wallet.data;
  const paygBalanceNanos = Number((data as any)?.paygBalanceNanos ?? 0);
  const codingPlanTokens = Number((data as any)?.codingPlanTokens ?? 0);

  const formattedCodingTokens =
    codingPlanTokens >= 1_000_000
      ? `${(codingPlanTokens / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}M`
      : codingPlanTokens.toLocaleString();

  return (
    <section
      style={{
        backgroundColor: "oklch(0.14 0 0)",
        borderColor: "oklch(0.26 0 0)",
        boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
      className="rounded-3xl border p-5 sm:p-7 shadow-2xl backdrop-blur-xl relative overflow-hidden mb-6 mt-0"
    >
      {/* Header bar of Portfolio */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <p className="text-[10px] font-bold uppercase tracking-[.18em] font-mono text-zinc-400">
              Compute & Balance Portfolio
            </p>
          </div>
          <h2 className="mt-1 text-xl sm:text-2xl font-extrabold text-white tracking-tight">Active Available Quotas</h2>
        </div>

        {/* Single Pay / Top Up Button */}
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/dashboard/pricing">
            <StarButton backgroundColor="#010101" className="rounded-full border border-slate-200/50 px-5 text-xs font-mono h-9">
              <span>Add Balance & Plans</span>
              <ArrowUpRight size={13} className="ml-1 inline-block" />
            </StarButton>
          </Link>
        </div>
      </div>

      {/* 2 Balances Grid: Token Plan & PAYG Compute */}
      <div className="relative z-10 mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Tier 2: Dedicated Token Plan (Wrapped in StarBorderCard) */}
        <StarBorderCard
          lightWidth={180}
          duration={8}
          lightColor="rgba(255, 255, 255, 0.85)"
          className="rounded-2xl h-full"
        >
          <div className="p-5 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.08] text-white border border-white/15">
                    <Code2 size={15} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white font-mono">Token Plan Quota</p>
                    <p className="text-[10px] text-zinc-400">Opus 5 & GLM 5.3 Quota</p>
                  </div>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-white/[0.08] border border-white/20 text-white font-mono">
                  10M / $1
                </span>
              </div>

              <div className="mt-5">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight text-white">
                    {formattedCodingTokens}
                  </span>
                  <span className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
                    {codingPlanTokens >= 1_000_000 ? "Tokens Quota" : "Tokens"}
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
                  Dedicated high-throughput token pool for Cursor, Claude Code, and agent workloads.
                </p>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-white/[0.08] flex items-center justify-between text-[11px]">
              <span className="text-zinc-500 font-medium">Auto-deducted on requests</span>
              <Link href="/dashboard/pricing" className="text-white hover:text-zinc-300 font-semibold flex items-center gap-1 hover:underline">
                <span>Get Tokens</span>
                <ArrowRight size={11} />
              </Link>
            </div>
          </div>
        </StarBorderCard>

        {/* Tier 1: PAYG Compute Wallet */}
        <div
          style={{
            backgroundColor: "oklch(0.18 0 0)",
            borderColor: "oklch(0.26 0 0)",
          }}
          className="group relative overflow-hidden rounded-2xl border p-5 transition-all duration-300 hover:border-white/30 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06] text-white border border-white/10">
                  <Zap size={15} />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white font-mono">PAYG Compute Wallet</p>
                  <p className="text-[10px] text-zinc-400">Zero-Markup Direct</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => claimCheckin.mutate()}
                  disabled={claimCheckin.isPending}
                  className="h-6 text-[10px] font-mono px-2 py-0 border-white/20 bg-white/[0.04] text-white hover:bg-white/[0.1] cursor-pointer"
                >
                  {claimCheckin.isPending ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} className="mr-1" />}
                  Daily Check-in
                </Button>
              </div>
            </div>

            <div className="mt-5">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight text-white">
                  ${(paygBalanceNanos / 1_000_000_000).toFixed(2)}
                </span>
                <span className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
                  USD
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
                Official provider token settlement with zero platform markup.
              </p>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/[0.08] flex items-center justify-between text-[11px]">
            <span className="text-zinc-500 font-medium">PAYG on-demand</span>
            <Link href="/dashboard/pricing" className="text-white hover:text-zinc-300 font-semibold flex items-center gap-1 hover:underline">
              <span>Top Up Balance</span>
              <ArrowRight size={11} />
            </Link>
          </div>
        </div>
      </div>

      {/* Daily Check-in Claim & Quick Status Footer */}
      <div className="relative z-10 mt-5 pt-4 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-zinc-400">
          <ShieldCheck size={14} className="text-zinc-300" />
          <span>Real-time multi-rail settlements via UPI & Solana with zero transaction fees.</span>
        </div>

        {data?.canCheckIn ? (
          <Button
            size="sm"
            onClick={() => claimCheckin.mutate()}
            disabled={claimCheckin.isPending}
            className="w-full sm:w-auto bg-white text-black font-bold text-xs hover:bg-zinc-200 cursor-pointer shadow-md"
          >
            {claimCheckin.isPending ? <Loader2 size={13} className="animate-spin" /> : <Gift size={13} />}
            <span>Claim Free Daily Reward ($0.01 - $0.10)</span>
          </Button>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-300 bg-white/[0.06] border border-white/15 px-3 py-1 rounded-full font-medium">
            <CheckCircle2 size={13} className="text-emerald-400" />
            <span>Today's UTC reward claimed</span>
          </div>
        )}
      </div>
    </section>
  );
}

function OverviewHero({
  user,
}: {
  user: ReturnType<typeof useAuth>["user"];
}) {
  const firstName = user?.name ? user.name.split(" ")[0] : "";
  const isDiscordVerified = Boolean((user as any)?.discordVerifiedAt || (user as any)?.isAdminSession);

  return (
    <div
      style={{
        backgroundColor: "oklch(0.14 0 0)",
        borderColor: "oklch(0.26 0 0)",
        boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
      className="relative mb-0 overflow-hidden rounded-3xl border p-6 sm:p-8"
    >
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/[0.03] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 left-1/3 h-48 w-48 rounded-full bg-emerald-500/[0.03] blur-2xl" />

      {/* Welcome sentence and controls (directly above the video) */}
      <div className="relative z-10 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Gateway Operational
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-mono text-zinc-300">
              <Zap size={11} className="text-zinc-200" />
              Zero Artificial Rate Limits
            </span>
            <UserTierBadge tier={(user as any)?.tier} showTag size="sm" />
            {isDiscordVerified && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#5865F2]/40 bg-[#5865F2]/15 px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-[#9ba5f7] shadow-[0_0_12px_rgba(88,101,242,0.25)]">
                <DiscordIcon className="h-3 w-3 text-[#5865F2]" />
                <Check size={11} className="text-emerald-400 stroke-[3]" />
                Discord Verified
              </span>
            )}
          </div>

          <h1 className="mt-3.5 text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight text-white leading-snug">
            <span>{firstName ? `Welcome back, ${firstName}` : "Welcome to Qronos AI"}</span>
            <span className="text-zinc-600 font-light mx-2">/</span>
            <span className="text-base sm:text-xl font-mono text-zinc-400 font-medium">Developer Workspace</span>
          </h1>
          <p className="mt-2 max-w-2xl text-xs sm:text-sm text-zinc-400 leading-relaxed">
            Direct high-concurrency model routing mesh. Claude Opus 5, GLM-5.3, and DeepSeek V3 settled transparently with zero platform markup.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap xl:shrink-0">
          {!isDiscordVerified && (
            <button type="button" onClick={openDiscordVerifyModal} className="inline-block cursor-pointer focus:outline-none">
              <StarButton
                backgroundColor="#06070b"
                lightColor="rgba(88, 101, 242, 0.95)"
                starColor="#5865F2"
                borderWidth={2}
                duration={3}
                className="rounded-full border border-[#5865F2]/60 hover:border-[#7289da] px-3.5 sm:px-4 text-xs font-mono font-bold h-9 sm:h-10 shadow-[0_0_24px_rgba(88,101,242,0.4)]"
              >
                <DiscordIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#5865F2] mr-1.5" />
                <span className="text-white">Verify Discord</span>
                <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300 bg-amber-400/20 border border-amber-400/35 px-1 py-0.2 rounded ml-1">
                  10M Free
                </span>
              </StarButton>
            </button>
          )}
          <Link href="/dashboard/pricing">
            <StarButton backgroundColor="#010101" className="rounded-full border border-slate-200/50 px-4 text-xs font-mono h-9 sm:h-10 shadow-lg">
              <Zap size={13} className="mr-1.5 inline-block text-white" />
              <span>Recharge &amp; Plans</span>
            </StarButton>
          </Link>
          <Link href="/dashboard/playground">
            <Button
              variant="outline"
              className="h-9 sm:h-10 rounded-full border-white/15 bg-black/40 text-xs font-mono text-zinc-200 hover:bg-white/10 hover:text-white px-3.5 cursor-pointer transition-all"
            >
              <Terminal size={13} className="mr-1.5 text-zinc-400" />
              <span>Prompt Studio</span>
            </Button>
          </Link>
          <Link href="/docs">
            <Button
              variant="outline"
              className="h-9 sm:h-10 rounded-full border-white/10 bg-black/20 text-xs font-mono text-zinc-400 hover:bg-white/5 hover:text-zinc-200 px-3 cursor-pointer transition-all"
            >
              <BookOpen size={13} className="mr-1" />
              <span>API Specs</span>
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function DashboardVideoShowcase() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = true;
      videoRef.current.defaultMuted = true;
      videoRef.current.volume = 0;
      videoRef.current.play().catch(() => {});
    }
  }, []);

  return (
    <div className="relative my-4 w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
      <div className="relative aspect-video w-full overflow-hidden bg-black">
        <video
          ref={videoRef}
          src={DASHBOARD_VIDEO_URL}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          onEnded={(e) => {
            e.currentTarget.currentTime = 0;
            e.currentTarget.play().catch(() => {});
          }}
          className="block w-full h-full object-cover object-center"
        />

        {/* Responsive Overlay Card positioned directly over the bottom-right corner to cleanly and completely hide any watermark */}
        <div className="absolute bottom-2 right-2 sm:bottom-3.5 sm:right-3.5 md:bottom-4 md:right-4 z-20 flex items-center gap-2 sm:gap-2.5 md:gap-3 rounded-xl sm:rounded-2xl border border-white/20 bg-[#030406]/98 px-2.5 py-1.5 sm:px-4 sm:py-2 md:px-5 md:py-2.5 shadow-[0_12px_45px_rgba(0,0,0,0.98)] backdrop-blur-2xl pointer-events-none select-none max-w-[calc(100%-1rem)]">
          <div className="flex h-7 w-7 sm:h-8 sm:w-8 md:h-9 md:w-9 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-white/[0.08] border border-white/15">
            <QronosGlyph size={18} className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5" />
          </div>
          <div className="flex flex-col text-left min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-[10px] sm:text-xs md:text-sm font-mono font-extrabold uppercase tracking-wider text-white whitespace-nowrap">
                Qronos AI Mesh
              </span>
              <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399] shrink-0" />
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[8px] sm:text-[9.5px] md:text-xs font-mono text-zinc-300 whitespace-nowrap">Universal Gateway Engine</span>
              <span className="hidden min-[420px]:inline-block text-[7.5px] sm:text-[8.5px] font-mono uppercase tracking-widest text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.2 rounded font-bold shrink-0">
                ACTIVE
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiscordVerificationAlertBanner() {
  return (
    <div className="relative mb-3 overflow-hidden rounded-2xl border border-[#5865F2]/30 bg-gradient-to-r from-[#5865F2]/10 via-[#07080e] to-[#5865F2]/5 p-4 sm:p-4.5 shadow-[0_10px_35px_rgba(0,0,0,0.8)] backdrop-blur-xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#5865F2]/15 border border-[#5865F2]/30 text-[#5865F2] shadow-lg shadow-[#5865F2]/20">
            <DiscordIcon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#9ba5f7]">
                Action Required · Discord Verification
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
            </div>
            <p className="mt-1 text-xs sm:text-sm font-semibold text-white">
              Connect your Discord account to claim your <strong className="text-emerald-400 font-bold">10,000,000 Free Tokens</strong> &amp; activate API keys.
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              Active Discord server membership unlocks Playground completions, high-concurrency routing, and cryptographic key generation.
            </p>
          </div>
        </div>

        <div className="shrink-0">
          <button type="button" onClick={openDiscordVerifyModal} className="inline-block cursor-pointer focus:outline-none">
            <StarButton
              backgroundColor="#06070b"
              lightColor="rgba(88, 101, 242, 0.95)"
              starColor="#5865F2"
              borderWidth={1.5}
              duration={3.5}
              className="h-9 px-4 rounded-full border border-[#5865F2]/70 hover:border-[#7289da] text-xs font-mono font-bold shadow-[0_0_20px_rgba(88,101,242,0.35)]"
            >
              <DiscordIcon className="h-3.5 w-3.5 text-[#5865F2] mr-1.5" />
              <span>Verify Discord</span>
              <ArrowRight size={13} className="ml-1 text-zinc-300" />
            </StarButton>
          </button>
        </div>
      </div>
    </div>
  );
}

function Overview({
  user,
  loading,
  usage,
  videoReady,
}: {
  user: ReturnType<typeof useAuth>["user"];
  loading: boolean;
  usage: { data?: UsageData; isLoading: boolean };
  videoReady: boolean;
}) {
  const isDiscordVerified = Boolean((user as any)?.discordVerifiedAt || (user as any)?.isAdminSession);
  const quota = usage.data?.quota;
  if (loading || usage.isLoading || !videoReady) return <DashboardVideoLoadingScreen />;

  return (
    <>
      {/* Discord Verification Alert Banner if unverified */}
      {!isDiscordVerified && <DiscordVerificationAlertBanner />}

      {/* 1. Welcome Header Card (Above the video) */}
      <OverviewHero user={user} />

      {/* 2. Standalone Video Showcase on the Dashboard Background */}
      <DashboardVideoShowcase />

      {/* 3. Unified Balances & Token Allocation Bento with Traveling Star Beam */}
      <UnifiedBalancesPortfolio />

      {/* 2-Column Command & Performance Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-6">
        {/* Left 7 Columns: Personal Activity & Gateway Status */}
        <div
          style={{
            backgroundColor: "oklch(0.14 0 0)",
            borderColor: "oklch(0.26 0 0)",
            boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
          className="lg:col-span-7 flex flex-col justify-between rounded-3xl border p-6 shadow-xl"
        >
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <Activity size={15} className="text-white" />
                <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-zinc-400">Gateway Telemetry</span>
              </div>
              <Badge className={quota?.suspended ? "border-0 bg-red-400/10 text-red-300 font-mono text-xs" : "border-0 bg-emerald-500/10 text-emerald-400 font-mono text-xs"}>
                {quota?.suspended ? "Suspended" : "● Operational & Active"}
              </Badge>
            </div>

            <h3 className="mt-4 text-xl font-bold text-white tracking-tight">Zero Artificial Rate Limiting</h3>
            <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
              Qronos AI operates without per-minute or concurrent cap constraints. Every request is settled atomically against your selected balance tier.
            </p>

            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div
                style={{ backgroundColor: "oklch(0.18 0 0)", borderColor: "oklch(0.26 0 0)" }}
                className="rounded-xl border p-3.5"
              >
                <p className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider font-mono">Lifetime Requests</p>
                <p className="mt-1 text-xl font-mono font-bold text-white">{(usage.data?.totalRequests ?? 0).toLocaleString()}</p>
                <span className="text-[10px] text-zinc-500 font-mono">Successful calls</span>
              </div>

              <StarBorderCard
                lightWidth={130}
                duration={5}
                lightColor="rgba(255, 255, 255, 0.95)"
                className="rounded-xl shadow-lg"
              >
                <div
                  style={{ backgroundColor: "oklch(0.18 0 0)" }}
                  className="rounded-[15px] p-3.5 h-full w-full"
                >
                  <p className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider font-mono">Tokens Processed</p>
                  <p className="mt-1 text-xl font-mono font-bold text-white">{(usage.data?.totalTokens ?? 0).toLocaleString()}</p>
                  <span className="text-[10px] text-zinc-500 font-mono">Input + output</span>
                </div>
              </StarBorderCard>

              <div
                style={{ backgroundColor: "oklch(0.18 0 0)", borderColor: "oklch(0.26 0 0)" }}
                className="col-span-2 sm:col-span-1 rounded-xl border p-3.5 flex flex-col justify-between"
              >
                <div>
                  <p className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider font-mono">Interactive Studio</p>
                  <p className="mt-1 text-xs font-semibold text-white">3D Thinking Orb</p>
                </div>
                <Link href="/dashboard/playground" className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-white hover:underline font-mono">
                  <span>Open Playground</span>
                  <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/[0.08] flex items-center justify-between flex-wrap gap-2 text-[11px] font-mono text-zinc-400">
            <span className="flex items-center gap-1.5"><ShieldCheck size={14} className="text-zinc-300" /> Keys hashed with SHA-256</span>
            <Link href="/dashboard/keys" className="text-white hover:underline font-semibold flex items-center gap-1">
              <span>Manage API Keys</span>
              <ArrowRight size={11} />
            </Link>
          </div>
        </div>

        {/* Right 5 Columns: Live Global Platform Activity */}
        <div
          style={{
            backgroundColor: "oklch(0.14 0 0)",
            borderColor: "oklch(0.26 0 0)",
            boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
          className="lg:col-span-5 flex flex-col justify-between rounded-3xl border p-6 shadow-xl"
        >
          <PlatformUsageMetrics />
        </div>
      </div>

      {/* Integration Quick Start & Code Snippets */}
      <OverviewIntegrationDesk />

      {/* 14-Day Usage Telemetry Chart */}
      <section
        style={{
          backgroundColor: "oklch(0.14 0 0)",
          borderColor: "oklch(0.26 0 0)",
          boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
        className="rounded-3xl border p-5 sm:p-7 mb-6 shadow-2xl"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-white/[0.08]">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 size={14} className="text-white" />
              <p className="text-[10px] font-bold uppercase tracking-[.18em] font-mono text-zinc-400">Request Telemetry</p>
            </div>
            <h2 className="mt-1 text-xl sm:text-2xl font-extrabold text-white tracking-tight">14-Day Throughput Activity</h2>
            <p className="mt-1 text-xs text-zinc-400">Inspect daily token settlement volume and historical compute trends.</p>
          </div>
          <Link href="/dashboard/usage" className="dashboard-outline-action font-mono text-xs">
            Detailed Usage logs <ArrowRight size={14} />
          </Link>
        </div>
        <div className="mt-5">
          <UsageChart daily={usage.data?.daily ?? []} />
        </div>
      </section>

      {/* Developer Quick Action Bento (4-Tile Matrix) */}
      <section
        style={{
          backgroundColor: "oklch(0.14 0 0)",
          borderColor: "oklch(0.26 0 0)",
          boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
        className="rounded-3xl border p-5 sm:p-7 mb-6 shadow-2xl"
      >
        <div className="pb-5 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-white" />
            <p className="text-[10px] font-bold uppercase tracking-[.18em] font-mono text-zinc-400">Build with Intent</p>
          </div>
          <h2 className="mt-1 text-xl sm:text-2xl font-extrabold text-white tracking-tight">Developer Launchpad</h2>
          <p className="mt-1 text-xs text-zinc-400">Essential fast routes to integrate, test, and ship with Qronos AI models.</p>
        </div>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/dashboard/keys"
            style={{
              backgroundColor: "oklch(0.18 0 0)",
              borderColor: "oklch(0.26 0 0)",
            }}
            className="group rounded-2xl border p-5 transition-all duration-300 hover:border-white/30 hover:-translate-y-1 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between text-zinc-400 group-hover:text-white transition-colors">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] border border-white/10">
                  <KeyRound size={16} />
                </span>
                <span className="text-[10px] font-mono font-bold">01</span>
              </div>
              <h3 className="mt-4 text-sm font-bold text-white tracking-tight">API Key Engine</h3>
              <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                Generate labeled, high-security SHA-256 keys for Cursor, Claude Code, or backend servers.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-white/[0.08] flex items-center gap-1 text-[11px] font-mono font-bold text-white group-hover:translate-x-1 transition-transform">
              <span>Manage keys</span>
              <ArrowRight size={13} />
            </div>
          </Link>

          <Link
            href="/dashboard/playground"
            style={{
              backgroundColor: "oklch(0.18 0 0)",
              borderColor: "oklch(0.26 0 0)",
            }}
            className="group rounded-2xl border p-5 transition-all duration-300 hover:border-white/30 hover:-translate-y-1 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between text-zinc-400 group-hover:text-white transition-colors">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] border border-white/10">
                  <Terminal size={16} />
                </span>
                <span className="text-[10px] font-mono font-bold">02</span>
              </div>
              <h3 className="mt-4 text-sm font-bold text-white tracking-tight">Prompt Studio</h3>
              <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                Evaluate Claude Opus 5, GLM-5.3, and DeepSeek V3 in real time with the 3D Thinking Orb.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-white/[0.08] flex items-center gap-1 text-[11px] font-mono font-bold text-white group-hover:translate-x-1 transition-transform">
              <span>Open studio</span>
              <ArrowRight size={13} />
            </div>
          </Link>

          <Link
            href="/models"
            style={{
              backgroundColor: "oklch(0.18 0 0)",
              borderColor: "oklch(0.26 0 0)",
            }}
            className="group rounded-2xl border p-5 transition-all duration-300 hover:border-white/30 hover:-translate-y-1 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between text-zinc-400 group-hover:text-white transition-colors">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] border border-white/10">
                  <Boxes size={16} />
                </span>
                <span className="text-[10px] font-mono font-bold">03</span>
              </div>
              <h3 className="mt-4 text-sm font-bold text-white tracking-tight">Model Catalogue</h3>
              <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                Inspect 28+ verified frontier routes, context limits, zero-markup pricing, and latency scores.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-white/[0.08] flex items-center gap-1 text-[11px] font-mono font-bold text-white group-hover:translate-x-1 transition-transform">
              <span>Explore models</span>
              <ArrowRight size={13} />
            </div>
          </Link>

          <Link
            href="/docs"
            style={{
              backgroundColor: "oklch(0.18 0 0)",
              borderColor: "oklch(0.26 0 0)",
            }}
            className="group rounded-2xl border p-5 transition-all duration-300 hover:border-white/30 hover:-translate-y-1 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between text-zinc-400 group-hover:text-white transition-colors">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] border border-white/10">
                  <Code2 size={16} />
                </span>
                <span className="text-[10px] font-mono font-bold">04</span>
              </div>
              <h3 className="mt-4 text-sm font-bold text-white tracking-tight">API Documentation</h3>
              <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                Explore native Anthropic Messages API compatible endpoints, parameters, and streaming formats.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-white/[0.08] flex items-center gap-1 text-[11px] font-mono font-bold text-white group-hover:translate-x-1 transition-transform">
              <span>Read the docs</span>
              <ArrowRight size={13} />
            </div>
          </Link>
        </div>
      </section>
    </>
  );
}

function SpecialReferralGiftBox({ enabled }: { enabled: boolean }) {
  const utils = trpc.useUtils();
  const gift = trpc.developer.specialReferralGift.useQuery(undefined, { enabled, staleTime: 60_000, refetchInterval: 90_000, refetchOnWindowFocus: true });
  const [revealed, setRevealed] = useState(false);
  const acknowledge = trpc.developer.acknowledgeSpecialReferralGift.useMutation({
    onSuccess: () => {
      setRevealed(true);
      utils.developer.specialReferralGift.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const claim = gift.data;
  if (!claim?.awardedAt || (claim.giftViewedAt && !revealed)) return null;
  const amount = `$${(claim.amountNanos / 1_000_000_000).toFixed(0)}`;
  return <section className="special-referral-gift mb-5" aria-label="Special referral gift" role="status">
    <div className="special-referral-gift__ribbons" aria-hidden="true">{Array.from({ length: 16 }, (_, index) => <i key={index} />)}</div>
    <div className={`special-referral-gift__box ${revealed ? "special-referral-gift__box--opened" : ""}`}>
      <div className="special-referral-gift__shine" aria-hidden="true" />
      <div className="special-referral-gift__icon"><Gift size={28} /></div>
      <div className="min-w-0 flex-1">
        <p className="special-referral-gift__eyebrow">SPECIAL REFERRAL REWARD</p>
        <h2>{revealed ? `${amount} added to your account` : "Your special referral gift box is ready"}</h2>
        <p>{revealed ? "Your special referral credit is now available in your Qronos AI balance." : "You joined through a verified campaign link. Open your gift box to reveal your credits."}</p>
      </div>
      {!revealed && <Button className="special-referral-gift__button" onClick={() => acknowledge.mutate()} disabled={acknowledge.isPending}>{acknowledge.isPending ? <Loader2 className="animate-spin" size={16} /> : <Gift size={16} />}{acknowledge.isPending ? "Opening…" : "Open gift"}</Button>}
      {revealed && <span className="special-referral-gift__confirmed"><Check size={15} /> Credited</span>}
    </div>
  </section>;
}

function OverviewPricingLink() {
  const { user } = useAuth();
  const emailLower = (user?.email ?? "").trim().toLowerCase();
  const isWhitelistedUser = emailLower === "konchoor@gmail.com" || emailLower === "kumaryush18@gmail.com";
  const creditsEnabled = isWhitelistedUser || Boolean((user as any)?.creditsEnabled);

  return (
    <section className="mb-6 rounded-2xl border border-white/8 bg-[#0c0d10] p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-500/25 bg-rose-500/10 text-rose-400">
            <CreditCard size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">
                {creditsEnabled ? "Qronos AI Pricing & Plans" : "Qronos AI Pay-As-You-Go Compute"}
              </h3>
              <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-300">
                {creditsEnabled ? "Zero Markup" : "100% Deposit Match"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[#8e909e]">
              {creditsEnabled
                ? "Compare Card, Domestic UPI, and Solana Pay top-ups with instant credit recharge."
                : "Fund your account with Card, UPI, or Solana Pay at official zero-markup provider rates."}
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/pricing"
          className="dashboard-primary-link inline-flex items-center justify-center gap-2 whitespace-nowrap self-start sm:self-auto"
        >
          {creditsEnabled ? "See our pricing plan" : "View deposit options"} <ArrowRight size={15} />
        </Link>
      </div>
    </section>
  );
}

export default function DeveloperDashboard({ section = "overview", modelId }: { section?: Section; modelId?: string }) {
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();
  const workspaceVerified = Boolean(user);
  const usage = trpc.developer.usage.useQuery(undefined, { enabled: Boolean(user) });
  const videoReady = useDashboardVideoPreloader(DASHBOARD_VIDEO_URL);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    const verified = searchParams.get("verified");
    const discordError = searchParams.get("error");

    if (verified === "discord") {
      utils.auth.me.invalidate();
      utils.developer.discordVerificationStatus.invalidate();
      utils.developer.usage.invalidate();

      toast.success("Discord verification successful!", {
        description: "10,000,000 free tokens have been added to your balance. API key generation and Playground completions are now active.",
        duration: 8000,
      });

      const cleanUrl = window.location.pathname + (window.location.hash || "");
      window.history.replaceState({}, "", cleanUrl);
    } else if (discordError) {
      const errorMap: Record<string, { title: string; desc: string }> = {
        "not-member": {
          title: "Discord Verification Incomplete",
          desc: "You must join the official Qronos AI Discord server before verifying. Click Step 1 to join, then Step 2 to verify.",
        },
        "already-linked": {
          title: "Discord Account Already Linked",
          desc: "This Discord account is already bound to another Qronos AI account. Each Discord account can only verify one workspace.",
        },
        "state-error": {
          title: "Verification Session Expired",
          desc: "Your authorization session timed out or cookies were blocked. Please click Verify Discord to try again.",
        },
        failed: {
          title: "Discord Verification Failed",
          desc: "We could not confirm your server membership due to a network or Discord API timeout. Please retry.",
        },
      };

      const info = errorMap[discordError] || {
        title: "Discord Verification Failed",
        desc: `Could not verify your Discord membership (code: ${discordError}). Please try again.`,
      };

      toast.error(info.title, {
        description: info.desc,
        duration: 9000,
      });

      openDiscordVerifyModal(discordError);

      const cleanUrl = window.location.pathname + (window.location.hash || "");
      window.history.replaceState({}, "", cleanUrl);
    }
  }, [utils]);

  const isOverview = section === "overview";
  const isWaitingForVideo = isOverview && !videoReady;
  const content =
    section === "pricing" ? (
      <DashboardPricingSection />
    ) : section === "playground" ? (
      <Playground />
    ) : section === "models" ? (
      <DashboardModels />
    ) : section === "model" ? (
      <DashboardModels modelId={modelId} />
    ) : section === "keys" ? (
      <>
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
                  <ShieldCheck size={12} />
                  SHA-256 Vault Active
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-mono text-zinc-300">
                  Zero Plaintext Retained
                </span>
              </div>
              <h1 className="mt-3.5 text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
                API Key Engine
              </h1>
              <p className="mt-2 text-xs sm:text-sm text-zinc-400 max-w-2xl leading-relaxed">
                Generate, rotate, or revoke cryptographically secure keys. Explicit routing ensures requests deduct from your preferred compute pool (Coding Tokens or PAYG on-demand compute).
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link href="/docs">
                <Button variant="outline" className="h-10 rounded-full border-white/15 bg-black/40 text-xs font-mono text-zinc-200 hover:bg-white/10 hover:text-white px-4 cursor-pointer">
                  <BookOpen size={13} className="mr-1.5 text-zinc-400" />
                  <span>SDK Docs</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
        <ApiKeyList />
      </>
    ) : section === "transactions" ? (
      <TransactionsWorkspace />
    ) : section === "payments" ? (
      <PaymentsWorkspace />
    ) : section === "usage" ? (
      <>
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
                  Live Observability Stream
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-mono text-zinc-300">
                  Real-time Settlement
                </span>
              </div>
              <h1 className="mt-3.5 text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
                Request Activity & Usage Logs
              </h1>
              <p className="mt-2 text-xs sm:text-sm text-zinc-400 max-w-2xl leading-relaxed">
                Inspect every successful model invocation across Cursor, Claude Code, Python, and the Playground. Accurate per-token metrics with transparent credit settlement.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link href="/dashboard/playground">
                <Button variant="outline" className="h-10 rounded-full border-white/15 bg-black/40 text-xs font-mono text-zinc-200 hover:bg-white/10 hover:text-white px-4 cursor-pointer">
                  <Terminal size={13} className="mr-1.5 text-zinc-400" />
                  <span>Open Playground</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
        <UsageLogs />
      </>
    ) : section === "events" ? (
      <EventsWorkspace />
    ) : section === "profile" ? (
      <Profile />
    ) : section === "referrals" || section === "x-rewards" ? (
      <ReferralWorkspace />
    ) : (
      <Overview user={user} loading={loading} usage={usage} videoReady={videoReady} />
    );
  return (
    <DashboardLayout>
      <div className="dashboard-page-surface">
        <div className="dashboard-page-content">
          <SpecialReferralGiftBox enabled={Boolean(user) && workspaceVerified} />
          {isWaitingForVideo ? <DashboardVideoLoadingScreen /> : content}
        </div>
      </div>
    </DashboardLayout>
  );
}

function ReferralWorkspace() {
  const { user } = useAuth();
  const referralQuery = trpc.developer.referrals.useQuery(undefined, {
    enabled: Boolean(user),
    staleTime: 60_000,
    refetchInterval: 90_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const isLoading = referralQuery.isLoading;
  const [copied, setCopied] = useState(false);
  const referral = referralQuery.data || {
    code: "",
    referrals: [],
    totalRewardNanos: 0,
    totalReferralTokens: 0,
    receivedRewardNanos: 0,
    wasReferred: false,
    receivedTokens: 0,
  };
  const inviteUrl = referral.code ? buildReferralInviteUrl(referral.code) : "";
  const formatCredit = (nanos: number) => `$${(nanos / 1_000_000_000).toFixed(2)}`;

  const copyInvite = async () => {
    if (!inviteUrl || isLoading || !referral.code) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    toast.success("Affiliate link copied to clipboard");
    window.setTimeout(() => setCopied(false), 2000);
  };

  const shareText = encodeURIComponent(
    `Route Claude Opus 5.5, GLM-5.3 & DeepSeek with sub-millisecond failover on @Qronosme. 📌 Pin @Qronosme. Sign up with my link to get 5M free coding tokens bonus (15M total):`
  );

  return (
    <div className="space-y-6">
      {/* 1. Header Hero */}
      <section
        style={{
          backgroundColor: "oklch(0.14 0 0)",
          borderColor: "oklch(0.26 0 0)",
          boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
        className="rounded-3xl border p-6 sm:p-8 shadow-2xl relative overflow-hidden"
      >
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/[0.03] blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Referral Network Active
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-mono text-zinc-300">
                <Zap size={12} className="text-emerald-400" />
                +1M & +5M Free Tokens
              </span>
            </div>
            <h1 className="mt-3.5 text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
              Developer Referral Program
            </h1>
            <p className="mt-2 text-xs sm:text-sm text-zinc-400 max-w-2xl leading-relaxed">
              Invite other developers to Qronos AI. When someone joins with your link, they receive <strong className="text-emerald-400">5,000,000 Free Coding Tokens</strong> instantly and you receive <strong className="text-emerald-400">1,000,000 Free Coding Tokens</strong> credited directly to your balance.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right hidden sm:block">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block">Bonus Reward</span>
              <span className="text-2xl font-bold font-mono text-emerald-400">+1M Tokens</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Rotating Star Border Invitation Card + Stats Bento */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left 7 Cols: Rotating Star Border Link Box */}
        <div className="lg:col-span-7">
          <StarBorderCard
            lightWidth={220}
            duration={7}
            lightColor="rgba(255, 255, 255, 0.95)"
            className="rounded-3xl h-full shadow-2xl"
          >
            <div className="p-6 sm:p-7 bg-[#0c0d12]/95 rounded-[23px] flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.08] border border-white/10 text-white">
                      <Gift size={16} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white tracking-tight">Your Unique Affiliate Link</h3>
                      <p className="text-[11px] font-mono text-zinc-500 flex items-center gap-1.5">
                        <span>Affiliate code:</span>
                        {isLoading || !referral.code ? (
                          <span className="inline-block h-3 w-12 rounded bg-white/10 animate-pulse" />
                        ) : (
                          <span className="text-zinc-200 font-bold">{referral.code.toUpperCase()}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <Badge className="border-0 bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-mono text-[10px]">
                    +1M / +5M Tokens
                  </Badge>
                </div>

                <p className="mt-4 text-xs text-zinc-400 leading-relaxed">
                  Anyone who joins through this link receives an automatic +5M free referral tokens bonus (15M free tokens total upon login), and you receive +1M free tokens credited instantly.
                </p>

                {/* Copy Link Input Bar */}
                <div className="mt-5 flex flex-col sm:flex-row gap-2 rounded-2xl border border-white/10 bg-black/70 p-2 shadow-inner">
                  {isLoading || !inviteUrl ? (
                    <div className="min-w-0 flex-1 px-3 py-2.5 flex items-center">
                      <div className="h-4 w-64 max-w-full rounded bg-white/10 animate-pulse" />
                    </div>
                  ) : (
                    <code className="min-w-0 flex-1 px-3 py-2 font-mono text-xs text-zinc-200 select-all truncate sm:leading-loose">
                      {inviteUrl}
                    </code>
                  )}
                  <Button
                    onClick={copyInvite}
                    disabled={isLoading || !inviteUrl}
                    className="shrink-0 bg-white text-black hover:bg-zinc-200 font-mono font-bold text-xs h-10 px-5 cursor-pointer shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {copied ? <Check size={14} className="mr-1.5" /> : <Copy size={14} className="mr-1.5" />}
                    {copied ? "Copied" : "Copy Link"}
                  </Button>
                </div>
              </div>

              {/* Fast Social Sharing Row */}
              <div className="mt-6 pt-4 border-t border-white/[0.08] flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
                <span className="text-zinc-500 flex items-center gap-1.5">
                  <Share2 size={13} className="text-zinc-400" /> Share directly:
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  <a
                    href={isLoading || !inviteUrl ? "#" : `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${shareText}`}
                    target={isLoading || !inviteUrl ? undefined : "_blank"}
                    rel="noopener noreferrer"
                    onClick={(e) => { if (isLoading || !inviteUrl) e.preventDefault(); }}
                    className={`rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300 hover:text-white hover:bg-white/[0.1] transition-all ${isLoading || !inviteUrl ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    Telegram
                  </a>
                  <a
                    href={isLoading || !inviteUrl ? "#" : `https://wa.me/?text=${shareText}%20${encodeURIComponent(inviteUrl)}`}
                    target={isLoading || !inviteUrl ? undefined : "_blank"}
                    rel="noopener noreferrer"
                    onClick={(e) => { if (isLoading || !inviteUrl) e.preventDefault(); }}
                    className={`rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300 hover:text-white hover:bg-white/[0.1] transition-all ${isLoading || !inviteUrl ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    WhatsApp
                  </a>
                </div>
              </div>
            </div>
          </StarBorderCard>
        </div>

        {/* Right 5 Cols: Stats Bento */}
        <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
          <div
            style={{
              backgroundColor: "oklch(0.14 0 0)",
              borderColor: "oklch(0.26 0 0)",
              boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
            }}
            className="rounded-3xl border p-6 flex flex-col justify-between shadow-xl"
          >
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-[10px] font-mono uppercase tracking-wider font-bold">Referred Developers</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.06] border border-white/10 text-white">
                <Users size={16} />
              </div>
            </div>
            <div className="mt-4 flex items-end justify-between gap-3 flex-wrap">
              <div>
                {isLoading ? (
                  <div className="h-9 w-20 rounded bg-white/10 animate-pulse my-1" />
                ) : (
                  <p className="text-3xl sm:text-4xl font-extrabold font-mono text-white tracking-tight">
                    {referral.referrals.length}
                  </p>
                )}
                <p className="mt-1 text-xs text-zinc-500 font-mono">Bound developers in your network</p>
              </div>
              <div className="text-right pb-0.5">
                {isLoading ? (
                  <div className="h-6 w-28 rounded-full bg-white/10 animate-pulse" />
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-mono font-bold text-emerald-400">
                      <Sparkles size={11} />
                      +{((referral.totalReferralTokens ?? (referral.referrals.length * 1_000_000)) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}M Tokens
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono block mt-1">+1M per referral</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div
            style={{
              backgroundColor: "oklch(0.14 0 0)",
              borderColor: "oklch(0.26 0 0)",
              boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
            }}
            className="rounded-3xl border p-6 flex flex-col justify-between shadow-xl"
          >
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-[10px] font-mono uppercase tracking-wider font-bold">Total Bonus Tokens Earned</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.06] border border-white/10 text-white">
                <Coins size={16} />
              </div>
            </div>
            <div className="mt-4">
              {isLoading ? (
                <div className="h-9 w-28 rounded bg-white/10 animate-pulse my-1" />
              ) : (
                <p className="text-3xl sm:text-4xl font-extrabold font-mono text-emerald-400 tracking-tight">
                  +{((referral.totalReferralTokens ?? (referral.referrals.length * 1_000_000)) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}M
                </p>
              )}
              <p className="mt-1 text-xs text-zinc-500 font-mono">Credited to Token Plan quota</p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Step-by-Step Referral Process Cards */}
      <section className="space-y-3" aria-label="How referral rewards work">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-white" />
          <p className="text-[10px] font-bold uppercase tracking-[.18em] font-mono text-zinc-400">
            How Referral Rewards Work
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1 */}
          <div
            style={{
              backgroundColor: "oklch(0.14 0 0)",
              borderColor: "oklch(0.24 0 0)",
            }}
            className="rounded-3xl border p-6 flex flex-col justify-between shadow-xl relative overflow-hidden group hover:border-white/30 transition-all"
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 rounded-full">
                Step 1 · Share Link
              </span>
              <span className="text-xs font-mono font-bold text-zinc-500">01</span>
            </div>
            <div className="mt-4">
              <h3 className="text-base font-bold text-white tracking-tight">Invite Fellow Developers</h3>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                Copy your personal invitation link and share it with peers, teammates, communities, and developer networks.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center gap-2 text-[11px] font-mono text-zinc-300">
              <CheckCircle2 size={13} className="text-emerald-400" />
              <span>Unique link tied to your account</span>
            </div>
          </div>

          {/* Card 2 */}
          <div
            style={{
              backgroundColor: "oklch(0.14 0 0)",
              borderColor: "oklch(0.24 0 0)",
            }}
            className="rounded-3xl border p-6 flex flex-col justify-between shadow-xl relative overflow-hidden group hover:border-white/30 transition-all"
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-300 bg-cyan-500/10 border border-cyan-500/25 px-2.5 py-0.5 rounded-full">
                Step 2 · They Join
              </span>
              <span className="text-xs font-mono font-bold text-zinc-500">02</span>
            </div>
            <div className="mt-4">
              <h3 className="text-base font-bold text-white tracking-tight">They Get 5M Free Tokens</h3>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                When a developer creates an account through your invitation, <strong>they receive 5,000,000 Free Coding Tokens</strong> on login.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center gap-2 text-[11px] font-mono text-zinc-300">
              <Zap size={13} className="text-cyan-400" />
              <span>Instant welcome token grant</span>
            </div>
          </div>

          {/* Card 3 */}
          <div
            style={{
              backgroundColor: "oklch(0.14 0 0)",
              borderColor: "oklch(0.24 0 0)",
            }}
            className="rounded-3xl border p-6 flex flex-col justify-between shadow-xl relative overflow-hidden group hover:border-white/30 transition-all"
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-300 bg-amber-500/10 border border-amber-500/25 px-2.5 py-0.5 rounded-full">
                Step 3 · You Earn
              </span>
              <span className="text-xs font-mono font-bold text-zinc-500">03</span>
            </div>
            <div className="mt-4">
              <h3 className="text-base font-bold text-white tracking-tight">You Get 1M Free Tokens</h3>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                You immediately receive <strong>1,000,000 Free Coding Tokens</strong> added directly to your Token Plan quota for every successful signup.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center gap-2 text-[11px] font-mono text-zinc-300">
              <Coins size={13} className="text-amber-400" />
              <span>Zero limits · Uncapped token growth</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Welcome Bonus Banner (if received) */}
      {(Boolean((referral as any).wasReferred) || Number((referral as any).receivedTokens ?? 0) > 0 || referral.receivedRewardNanos > 0) && (
        <section
          style={{
            backgroundColor: "oklch(0.14 0 0)",
            borderColor: "oklch(0.26 0 0)",
          }}
          className="rounded-3xl border p-5 sm:p-6 shadow-xl flex items-start gap-4"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">Welcome Affiliate Bonus Credited</h3>
            <p className="mt-0.5 text-xs text-zinc-400 leading-relaxed">
              You joined Qronos AI via an affiliate invite! You received <strong className="text-emerald-400 font-mono font-bold">+5,000,000 Free Coding Tokens</strong> added to your Token Plan Quota{referral.receivedRewardNanos > 0 ? ` plus ${formatCredit(referral.receivedRewardNanos)} in compute balance` : ""}.
            </p>
          </div>
        </section>
      )}

      {/* 4. Referral Activity Ledger */}
      <section
        style={{
          backgroundColor: "oklch(0.14 0 0)",
          borderColor: "oklch(0.26 0 0)",
          boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
        className="rounded-3xl border p-6 sm:p-8 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between pb-5 border-b border-white/[0.08] flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Users size={14} className="text-white" />
              <p className="text-[10px] font-bold uppercase tracking-[.18em] font-mono text-zinc-400">Partner Activity</p>
            </div>
            <h2 className="mt-1 text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              Successful Invitations Ledger
            </h2>
          </div>
          <span className="text-xs font-mono text-zinc-400">
            {isLoading ? (
              <span className="inline-block h-3.5 w-24 rounded bg-white/10 animate-pulse align-middle" />
            ) : (
              `${referral.referrals.length} attribution${referral.referrals.length === 1 ? "" : "s"} logged`
            )}
          </span>
        </div>

        <div className="mt-5">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    backgroundColor: "oklch(0.18 0 0)",
                    borderColor: "oklch(0.26 0 0)",
                  }}
                  className="rounded-2xl border p-4 sm:p-5 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="h-9 w-9 shrink-0 rounded-xl bg-white/10 animate-pulse" />
                    <div className="space-y-2">
                      <div className="h-4 w-40 rounded bg-white/10 animate-pulse" />
                      <div className="h-3 w-28 rounded bg-white/5 animate-pulse" />
                    </div>
                  </div>
                  <div className="h-7 w-24 rounded-full bg-white/10 animate-pulse" />
                </div>
              ))}
            </div>
          ) : referral.referrals.length ? (
            <div className="space-y-3">
              {referral.referrals.map((item) => (
                <div
                  key={item.id}
                  style={{
                    backgroundColor: "oklch(0.18 0 0)",
                    borderColor: "oklch(0.26 0 0)",
                  }}
                  className="rounded-2xl border p-4 sm:p-5 flex items-center justify-between gap-4 transition-all hover:border-white/30"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] border border-white/10 text-white">
                      <Users size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">Verified Developer Invited</p>
                      <p className="text-xs font-mono text-zinc-400 mt-0.5">
                        Credited {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                      +1M Tokens{item.rewardNanos > 0 ? ` · +${formatCredit(item.rewardNanos)}` : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center bg-black/30">
              <Users className="mx-auto text-zinc-500 mb-3" size={28} />
              <p className="text-sm font-bold text-white font-mono">No referral attributions yet</p>
              <p className="mt-1 text-xs text-zinc-400 max-w-sm mx-auto">
                Invite developers with your referral link above. You will receive <strong>1,000,000 Free Tokens</strong> and your referral receives <strong>5,000,000 Free Tokens</strong> credited instantly upon registration!
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
