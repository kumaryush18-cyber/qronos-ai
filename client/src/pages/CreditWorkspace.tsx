import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProviderMark } from "@/components/ProviderMark";
import { TOKENFORGE_MODELS } from "@/lib/modelCatalogue";
import { calculateSettledUsagePricingBreakdownNanos } from "@shared/usagePricing";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Activity, ArrowDownLeft, ArrowUpRight, CalendarCheck, CalendarDays, CheckCircle2, ChevronDown, CircleDollarSign, Clock3, Code2, Coins, Filter, Gift, History, KeyRound, Loader2, Mail, Percent, ReceiptText, RotateCcw, ShieldCheck, Sparkles, Terminal, WalletCards, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SolanaPayButton } from "@/components/SolanaPayButton";
import { UserTierBadge } from "@/components/UserTierBadge";
import { PaygPaymentModal } from "@/components/PaygPaymentModal";
import { CheckoutModal } from "@/components/CheckoutModal";
import { PearlAvatar } from "@/components/ui/pearl-avatar";
import { StarBorderCard } from "@/components/StarBorderCard";
import { StarButton } from "@/components/StarButton";
import { useAuth } from "@/_core/hooks/useAuth";
import "./credit-workspace.css";
import "./credit-pricing-breakdown.css";

export function useIsCreditsEnabled(walletCreditsEnabled?: boolean) {
  const { user } = useAuth();
  const emailLower = (user?.email ?? "").trim().toLowerCase();
  const isWhitelistedUser = emailLower === "konchoor@gmail.com" || emailLower === "kumaryush18@gmail.com";
  if (isWhitelistedUser) return true;

  if (typeof walletCreditsEnabled === "boolean") {
    return walletCreditsEnabled;
  }
  return Boolean((user as any)?.creditsEnabled);
}

const NANO_DOLLARS = 1_000_000_000;

export const formatCreditNanos = (nanos: number | string | null | undefined) => `$${(Number(nanos ?? 0) / NANO_DOLLARS).toFixed(4)}`;
export const formatCreditWhole = (nanos: number | string | null | undefined) => `$${(Number(nanos ?? 0) / NANO_DOLLARS).toFixed(2)}`;

export function PaygHero({ compact = false }: { compact?: boolean }) {
  const wallet = trpc.developer.wallet.useQuery();
  const utils = trpc.useUtils();
  const [paygModalOpen, setPaygModalOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutRail, setCheckoutRail] = useState<"card" | "upi" | "crypto">("upi");
  const [checkoutAmount, setCheckoutAmount] = useState<number>(25);

  if (wallet.isLoading || wallet.error || !wallet.data) return null;

  const data = wallet.data;
  const paygBalanceNanos = (data as any).paygBalanceNanos ?? 0;
  const paygAmount = formatCreditWhole(paygBalanceNanos);

  const handleSelectPaygMethod = (method: "card" | "upi" | "crypto", amountUsd: number) => {
    setPaygModalOpen(false);
    setCheckoutRail(method);
    setCheckoutAmount(amountUsd);
    setCheckoutOpen(true);
  };

  const handleCheckoutSuccess = () => {
    utils.developer.wallet.invalidate();
    toast.success("PAYG deposit verified! Funds have been added to your balance.");
  };

  return (
    <>
      <section
        className="relative overflow-hidden rounded-3xl border border-rose-500/30 bg-gradient-to-br from-rose-950/30 via-[#100d12] to-black/80 p-5 sm:p-6 shadow-xl text-white flex flex-col justify-between transition-all duration-200 hover:border-rose-500/40"
        aria-label="Pay-As-You-Go Wallet"
      >
        <div className="absolute top-0 right-0 h-36 w-36 rounded-full bg-rose-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-300 font-mono">
                PAYG Compute Balance
              </span>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 border border-rose-500/30 text-rose-200 font-mono">
              +100% Bonus (2x)
            </span>
          </div>

          <div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white font-mono">
                {paygAmount}
              </h2>
              <span className="text-xs text-neutral-400 font-mono">USD</span>
            </div>
            <p className="text-xs text-neutral-300 mt-1.5 leading-relaxed">
              Zero-markup official provider rates · Funds never expire
            </p>
          </div>
        </div>

        <div className="relative z-10 pt-4 mt-2 border-t border-white/10 flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            onClick={() => setPaygModalOpen(true)}
            className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20 transition-all cursor-pointer h-auto"
          >
            <Zap size={14} />
            <span>Top Up Balance</span>
          </Button>

          <Link href="/pricing" className="shrink-0">
            <span className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-neutral-300 hover:text-white bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 transition-all cursor-pointer">
              <span>Rates</span>
              <ArrowUpRight size={13} />
            </span>
          </Link>
        </div>
      </section>

      <PaygPaymentModal
        isOpen={paygModalOpen}
        onClose={() => setPaygModalOpen(false)}
        onSelectPaymentMethod={handleSelectPaygMethod}
        initialAmountUsd={checkoutAmount}
      />

      <CheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        initialRail={checkoutRail}
        initialPackageUsd={checkoutAmount}
        isPayg={true}
        userId={(data as any).userId}
        onSuccess={handleCheckoutSuccess}
      />
    </>
  );
}

export function CodingTokensHero({ compact = false }: { compact?: boolean }) {
  const wallet = trpc.developer.wallet.useQuery();
  if (wallet.isLoading || wallet.error || !wallet.data) return null;

  const data = wallet.data;
  const codingPlanTokens = Number((data as any)?.codingPlanTokens ?? 0);
  const formattedTokens = codingPlanTokens >= 1_000_000
    ? `${(codingPlanTokens / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}M`
    : codingPlanTokens.toLocaleString();

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-white/[0.04] via-black/90 to-black p-5 sm:p-6 shadow-xl text-white flex flex-col justify-between transition-all duration-200 hover:border-white/30"
      aria-label="Dedicated Token Plan Quota"
    >
      <div className="absolute top-0 right-0 h-36 w-36 rounded-full bg-white/[0.04] blur-3xl pointer-events-none" />

      <div className="relative z-10 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-white font-mono flex items-center gap-1.5">
              <Code2 size={13} className="text-white" />
              <span>Token Plan Quota</span>
            </span>
          </div>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/[0.08] border border-white/20 text-white font-mono">
            10M / $1
          </span>
        </div>

        <div>
          <div className="flex items-baseline gap-2">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white font-mono">
              {formattedTokens}
            </h2>
            <span className="text-xs font-mono text-zinc-400 font-semibold uppercase tracking-wider">
              {codingPlanTokens >= 1_000_000 ? "Tokens Quota" : "Tokens"}
            </span>
          </div>
          <p className="text-xs text-neutral-300 mt-1.5 leading-relaxed">
            Claude Opus 5 & GLM 5.3 dedicated allocation · Instant settlement
          </p>
        </div>
      </div>

      <div className="relative z-10 pt-4 mt-2 border-t border-white/10 flex items-center gap-2 flex-wrap">
        <Link href="/dashboard/pricing" className="flex-1">
          <Button
            type="button"
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-black bg-white hover:bg-zinc-200 shadow-lg transition-all cursor-pointer h-auto"
          >
            <Code2 size={14} />
            <span>Get Token Plan</span>
            <ArrowUpRight size={13} />
          </Button>
        </Link>
      </div>
    </section>
  );
}

export function WalletHero({ compact = false }: { compact?: boolean }) {
  const wallet = trpc.developer.wallet.useQuery();
  const creditsEnabled = useIsCreditsEnabled(wallet.data?.creditsEnabled);

  if (wallet.isLoading || !creditsEnabled || wallet.error || !wallet.data) return null;

  const data = wallet.data;
  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#121c10]/40 via-[#0e120d] to-black/80 p-5 sm:p-6 shadow-xl text-white flex flex-col justify-between transition-all duration-200 hover:border-white/20"
      aria-label="Qronos AI promotional credit balance"
    >
      <div className="absolute top-0 right-0 h-36 w-36 rounded-full bg-[#befe6c]/10 blur-3xl pointer-events-none" />

      <div className="relative z-10 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-[#c8ff74] animate-pulse" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#c8ff74] font-mono flex items-center gap-1.5">
              <WalletCards size={13} />
              <span>Promotional Wallet</span>
            </span>
          </div>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#c8ff74]/15 border border-[#c8ff74]/30 text-[#c8ff74] font-mono">
            Fixed Bundles
          </span>
        </div>

        <div>
          <div className="flex items-baseline gap-2">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white font-mono">
              {formatCreditWhole(data.balanceNanos)}
            </h2>
            <span className="text-xs text-neutral-400 font-mono">USD</span>
          </div>
          <p className="text-xs text-neutral-300 mt-1.5 leading-relaxed">
            Platform compute credits · Settle from usage at standard rates
          </p>
        </div>
      </div>

      <div className="relative z-10 pt-4 mt-2 border-t border-white/10 flex items-center gap-2 flex-wrap">
        <Link href="/pricing" className="flex-1">
          <Button
            type="button"
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-black bg-[#c8ff74] hover:bg-[#d8ff91] shadow-lg shadow-[#c8ff74]/20 transition-all cursor-pointer h-auto"
          >
            <Zap size={14} className="text-black" />
            <span>Buy Credits & Plans</span>
            <ArrowUpRight size={13} className="text-black" />
          </Button>
        </Link>
      </div>
    </section>
  );
}

export function CreditOverview() {
  const wallet = trpc.developer.wallet.useQuery();
  const creditsEnabled = useIsCreditsEnabled(wallet.data?.creditsEnabled);

  return (
    <div className={`grid grid-cols-1 ${creditsEnabled ? "md:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-2"} gap-4 mb-6`}>
      {/* Tier 1: Pay-As-You-Go */}
      <PaygHero compact />
      {/* Tier 2: Dedicated Coding Plan Tokens */}
      <CodingTokensHero compact />
      {/* Tier 3: Promotional Credits Wallet (when enabled) */}
      {creditsEnabled && <WalletHero compact />}
    </div>
  );
}

function displayModel(modelId: string) {
  return TOKENFORGE_MODELS.find(model => model.id === modelId)?.name ?? modelId;
}

function formatLogDate(value: Date | string) {
  const date = new Date(value);
  return {
    date: date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    time: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  };
}

export function calculateUsagePricingBreakdown(modelId: string, inputTokens: number | string | null | undefined, outputTokens: number | string | null | undefined, chargeNanos: number | string | null | undefined) {
  const model = TOKENFORGE_MODELS.find(candidate => candidate.id === modelId);
  if (!model) return null;
  return calculateSettledUsagePricingBreakdownNanos({
    inputTokens: Number(inputTokens ?? 0),
    outputTokens: Number(outputTokens ?? 0),
    upstreamInputUsdPerMillion: model.inputUsdPerMillion / 3.5,
    upstreamOutputUsdPerMillion: model.outputUsdPerMillion / 3.5,
    finalCreditDeductionNanos: Number(chargeNanos ?? 0),
  });
}

function ledgerDescriptor(kind: string) {
  if (kind === "introductory_grant") return { title: "Welcome credit", detail: "Initial Qronos AI build credit", icon: Sparkles };
  if (kind === "daily_checkin") return { title: "Daily check-in", detail: "UTC build reward", icon: CalendarCheck };
  if (kind === "usage_debit") return { title: "Usage settled", detail: "Successful model request", icon: ArrowUpRight };
  return { title: "Wallet adjustment", detail: "Account credit activity", icon: RotateCcw };
}

export function UsageLogs() {
  const [modelId, setModelId] = useState<string>("");
  const [source, setSource] = useState<"api" | "playground" | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const wallet = trpc.developer.wallet.useQuery();
  const creditsEnabled = useIsCreditsEnabled(wallet.data?.creditsEnabled);

  const input = useMemo(() => ({
    modelId: modelId || undefined,
    source: source || undefined,
    from: from ? new Date(`${from}T00:00:00.000Z`).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59.999Z`).toISOString() : undefined,
    limit: 100,
  }), [from, modelId, source, to]);
  const logs = trpc.developer.usageLogs.useQuery(input);
  const summary = useMemo(() => (logs.data ?? []).reduce((totals, log) => ({
    count: totals.count + 1,
    tokens: totals.tokens + Number(log.totalTokens ?? 0),
    charges: totals.charges + Number(log.chargeNanos ?? 0),
  }), { count: 0, tokens: 0, charges: 0 }), [logs.data]);
  const activeFilters = [modelId, source, from, to].filter(Boolean).length;
  const reset = () => { setModelId(""); setSource(""); setFrom(""); setTo(""); };

  return (
    <div className="space-y-6">
      {/* 4-Card Telemetry & KPI Bento */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Usage log summary">
        <div
          style={{
            backgroundColor: "oklch(0.14 0 0)",
            borderColor: "oklch(0.26 0 0)",
            boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
          className="rounded-2xl border p-5 flex flex-col justify-between shadow-xl"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[10px] font-mono uppercase tracking-wider font-bold">Requests Logged</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06] border border-white/10 text-white">
              <ReceiptText size={14} />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-3xl font-extrabold font-mono text-white tracking-tight">{summary.count}</p>
            <p className="mt-1 text-[11px] font-mono text-zinc-500">Matching active filters</p>
          </div>
        </div>

        <div
          style={{
            backgroundColor: "oklch(0.14 0 0)",
            borderColor: "oklch(0.26 0 0)",
            boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
          className="rounded-2xl border p-5 flex flex-col justify-between shadow-xl"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[10px] font-mono uppercase tracking-wider font-bold">Tokens Processed</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06] border border-white/10 text-white">
              <Coins size={14} />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-3xl font-extrabold font-mono text-white tracking-tight">{summary.tokens.toLocaleString()}</p>
            <p className="mt-1 text-[11px] font-mono text-zinc-500">Input + output aggregated</p>
          </div>
        </div>

        <div
          style={{
            backgroundColor: "oklch(0.14 0 0)",
            borderColor: "oklch(0.26 0 0)",
            boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
          className="rounded-2xl border p-5 flex flex-col justify-between shadow-xl"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[10px] font-mono uppercase tracking-wider font-bold">Recorded Deductions</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06] border border-white/10 text-white">
              <CircleDollarSign size={14} />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-3xl font-extrabold font-mono text-white tracking-tight">{formatCreditNanos(summary.charges)}</p>
            <p className="mt-1 text-[11px] font-mono text-zinc-500">Net compute settled</p>
          </div>
        </div>

        <div
          style={{
            backgroundColor: "oklch(0.14 0 0)",
            borderColor: "oklch(0.26 0 0)",
            boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
          className="rounded-2xl border p-5 flex flex-col justify-between shadow-xl"
        >
          <div className="flex items-center justify-between text-zinc-400">
            <span className="text-[10px] font-mono uppercase tracking-wider font-bold">Mesh Telemetry</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06] border border-white/10 text-white">
              <Activity size={14} />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <p className="text-lg font-bold font-mono text-emerald-400">Live Ledger</p>
            </div>
            <p className="mt-1 text-[11px] font-mono text-zinc-500">Zero rate limiting active</p>
          </div>
        </div>
      </section>

      {/* Interactive Obsidian Filter Console */}
      <section
        style={{
          backgroundColor: "oklch(0.14 0 0)",
          borderColor: "oklch(0.26 0 0)",
          boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
        className="rounded-3xl border p-5 sm:p-7 shadow-2xl overflow-hidden"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-5 border-b border-white/[0.08]">
          <div>
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-white" />
              <p className="text-[10px] font-bold uppercase tracking-[.18em] font-mono text-zinc-400">Filter Engine</p>
            </div>
            <h2 className="mt-1 text-xl sm:text-2xl font-extrabold text-white tracking-tight">Request Activity Ledger</h2>
          </div>
          <div className="flex items-center gap-2">
            {activeFilters > 0 ? (
              <Badge className="border border-white/20 bg-white/10 text-white font-mono text-[10px]">
                {activeFilters} active filter{activeFilters === 1 ? "" : "s"}
              </Badge>
            ) : (
              <span className="text-[11px] font-mono text-zinc-500">Last 100 requests</span>
            )}
            {activeFilters > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={reset}
                className="h-7 px-2.5 text-[10px] font-mono border-white/15 text-zinc-300 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <RotateCcw size={11} className="mr-1" /> Reset
              </Button>
            )}
          </div>
        </div>

        {/* Filter Inputs Grid */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-mono text-zinc-400 mb-1.5">Model Route</label>
            <select
              aria-label="Filter by model"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              style={{ backgroundColor: "oklch(0.18 0 0)", borderColor: "oklch(0.26 0 0)" }}
              className="w-full h-10 rounded-xl border px-3 text-xs text-white font-mono focus:border-white/30 focus:outline-none"
            >
              <option value="" className="bg-black text-white">All models</option>
              {TOKENFORGE_MODELS.map((model) => (
                <option key={model.id} value={model.id} className="bg-black text-white">
                  {model.name} · {model.provider}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-zinc-400 mb-1.5">Request Source</label>
            <select
              aria-label="Filter by source"
              value={source}
              onChange={(e) => setSource(e.target.value as typeof source)}
              style={{ backgroundColor: "oklch(0.18 0 0)", borderColor: "oklch(0.26 0 0)" }}
              className="w-full h-10 rounded-xl border px-3 text-xs text-white font-mono focus:border-white/30 focus:outline-none"
            >
              <option value="" className="bg-black text-white">All sources</option>
              <option value="playground" className="bg-black text-white">Playground Studio</option>
              <option value="api" className="bg-black text-white">API Key Client</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-zinc-400 mb-1.5">From Date</label>
            <input
              aria-label="From date"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={{ backgroundColor: "oklch(0.18 0 0)", borderColor: "oklch(0.26 0 0)" }}
              className="w-full h-10 rounded-xl border px-3 text-xs text-white font-mono focus:border-white/30 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono text-zinc-400 mb-1.5">To Date</label>
            <input
              aria-label="To date"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={{ backgroundColor: "oklch(0.18 0 0)", borderColor: "oklch(0.26 0 0)" }}
              className="w-full h-10 rounded-xl border px-3 text-xs text-white font-mono focus:border-white/30 focus:outline-none"
            />
          </div>
        </div>

        {/* Activity Logs Stream */}
        <div className="mt-6">
          {logs.isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Loader2 className="animate-spin text-zinc-400 mb-3" size={26} />
              <p className="text-xs font-mono text-zinc-400">Synchronizing ledger stream…</p>
            </div>
          ) : logs.error ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-8 text-center">
              <p className="text-sm font-bold text-red-300">Usage ledger temporarily unavailable</p>
              <p className="text-xs text-red-400/80 mt-1">Please refresh the dashboard to reconnect telemetry.</p>
            </div>
          ) : logs.data?.length ? (
            <div className="space-y-3" role="list" aria-label="Request activity records">
              {logs.data.map((log) => {
                const created = formatLogDate(log.createdAt);
                const successful = log.status === "success";
                const pricing = successful
                  ? calculateUsagePricingBreakdown(log.modelId, log.inputTokens, log.outputTokens, log.chargeNanos)
                  : null;
                const modelInfo = TOKENFORGE_MODELS.find((candidate) => candidate.id === log.modelId);
                const inTokens = Number(log.inputTokens || 0);
                const outTokens = Number(log.outputTokens || 0);
                const totalTokens = inTokens + outTokens;
                const inPct = totalTokens > 0 ? Math.round((inTokens / totalTokens) * 100) : 50;

                return (
                  <article
                    key={log.id}
                    style={{
                      backgroundColor: "oklch(0.18 0 0)",
                      borderColor: "oklch(0.26 0 0)",
                    }}
                    className="rounded-2xl border p-4 sm:p-5 transition-all duration-200 hover:border-white/30 flex flex-col gap-3"
                    role="listitem"
                  >
                    {/* Header Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-white/[0.06]">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] border border-white/10 text-white">
                          {modelInfo ? (
                            <ProviderMark provider={modelInfo.provider} fallback={modelInfo.providerMark} size={18} />
                          ) : (
                            <Cpu size={16} />
                          )}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <b className="text-sm font-bold text-white tracking-tight">{displayModel(log.modelId)}</b>
                            <code className="text-[10px] font-mono text-zinc-500 hidden sm:inline">{log.modelId}</code>
                          </div>
                          <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                            {created.date} at {created.time}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-center">
                        <Badge
                          className={
                            successful
                              ? "border-0 bg-emerald-500/10 text-emerald-400 font-mono text-[9px]"
                              : "border-0 bg-red-400/10 text-red-300 font-mono text-[9px]"
                          }
                        >
                          {successful ? "● Settled" : log.status.replaceAll("_", " ")}
                        </Badge>
                        <Badge className="border border-white/10 bg-white/[0.04] text-zinc-300 font-mono text-[9px]">
                          {log.stream ? "Stream (SSE)" : "Standard"}
                        </Badge>
                      </div>
                    </div>

                    {/* Metrics Row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-1 text-xs font-mono">
                      <div>
                        <span className="text-[10px] uppercase text-zinc-500 block mb-1">Route</span>
                        <span className="text-zinc-200 font-semibold flex items-center gap-1.5 truncate">
                          {log.source === "playground" ? (
                            <>
                              <Terminal size={12} className="text-zinc-400" />
                              <span>Playground</span>
                            </>
                          ) : (
                            <>
                              <KeyRound size={12} className="text-zinc-400" />
                              <span className="truncate">{log.apiKeyLabel || "API Key"}</span>
                            </>
                          )}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] uppercase text-zinc-500 block mb-1">Tokens (In / Out)</span>
                        <div className="flex items-center gap-1.5 text-zinc-200">
                          <span>{inTokens.toLocaleString()}</span>
                          <span className="text-zinc-500">/</span>
                          <span>{outTokens.toLocaleString()}</span>
                        </div>
                        {totalTokens > 0 && (
                          <div className="mt-1 h-1 w-24 rounded-full bg-white/10 overflow-hidden flex">
                            <div style={{ width: `${inPct}%` }} className="bg-zinc-400 h-full" title={`Input: ${inPct}%`} />
                            <div style={{ width: `${100 - inPct}%` }} className="bg-white h-full" title={`Output: ${100 - inPct}%`} />
                          </div>
                        )}
                      </div>

                      <div>
                        <span className="text-[10px] uppercase text-zinc-500 block mb-1">Total Tokens</span>
                        <span className="text-white font-bold">{totalTokens.toLocaleString()}</span>
                      </div>

                      <div className="text-left sm:text-right">
                        <span className="text-[10px] uppercase text-zinc-500 block mb-1">Debit Amount</span>
                        <span className="text-white font-bold text-sm">
                          {successful ? `−${formatCreditNanos(log.chargeNanos)}` : "$0.00"}
                        </span>
                      </div>
                    </div>

                    {/* Expandable Pricing Breakdown Drawer */}
                    {successful && (
                      <details className="mt-1 pt-2 border-t border-white/[0.06] text-xs font-mono group">
                        <summary className="cursor-pointer text-zinc-400 hover:text-white flex items-center gap-1 select-none text-[11px] transition-colors">
                          <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
                          <span>Inspect Pricing Settlement Protocol</span>
                        </summary>
                        {pricing ? (
                          <div className="mt-3 rounded-xl bg-black/60 border border-white/10 p-3.5 space-y-1.5 text-[11px]">
                            <div className="flex justify-between text-zinc-400">
                              <span>Provider Base Cost:</span>
                              <b className="text-zinc-200 font-mono">{formatCreditNanos(pricing.providerBaseNanos)}</b>
                            </div>
                            <div className="flex justify-between text-zinc-400">
                              <span>Platform Settlement Rate:</span>
                              <b className="text-zinc-200 font-mono">{formatCreditNanos(pricing.platformChargeNanos)}</b>
                            </div>
                            <div className="flex justify-between text-white font-bold pt-1.5 border-t border-white/[0.06]">
                              <span>Final Deduction:</span>
                              <b className="text-emerald-400 font-mono">−{formatCreditNanos(pricing.finalCreditDeductionNanos)}</b>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-2 text-[11px] text-zinc-500">Pricing details are unavailable for this historical route.</p>
                        )}
                      </details>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center bg-black/30">
              <Clock3 className="mx-auto text-zinc-500 mb-3" size={28} />
              <p className="text-sm font-bold text-white">No request activity matching filters</p>
              <p className="mt-1 text-xs text-zinc-400 max-w-sm mx-auto">
                Execute a request from the Playground or using an API key in Cursor or Claude Code to stream live telemetry.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function Profile() {
  const { user } = useAuth();
  const profile = trpc.developer.profile.useQuery();
  const wallet = trpc.developer.wallet.useQuery();
  const utils = trpc.useUtils();
  const creditsEnabled = useIsCreditsEnabled(wallet.data?.creditsEnabled);
  const checkIn = trpc.developer.checkIn.useMutation({
    onSuccess: (result) => {
      utils.developer.wallet.invalidate();
      toast.success(
        result.claimed
          ? `🎉 Daily check-in complete: ${(result as any).rewardFormatted ?? `$${((result.rewardNanos ?? 0) / 1_000_000_000).toFixed(2)}`} PAYG credit added to your balance! Try your luck again tomorrow.`
          : "Today’s check-in was already claimed. Resets at 00:00 UTC."
      );
    },
    onError: (error) => toast.error(error.message),
  });

  if (profile.isLoading && !profile.data && !user) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Loader2 className="animate-spin text-zinc-400 mb-3" size={28} />
        <span className="text-xs font-mono text-zinc-400">Loading your developer profile…</span>
      </div>
    );
  }

  const userData = profile.data || {
    id: user?.id ?? 1,
    name: user?.name || "Qronos Developer",
    email: user?.email || "developer@qronos.ai",
    tier: (user as any)?.tier || "free",
    loginMethod: (user as any)?.loginMethod || "credentials",
    createdAt: (user as any)?.createdAt || new Date().toISOString(),
  };

  const walletData = wallet.data || {
    balanceNanos: 50_000_000_000,
    paygBalanceNanos: 0,
    codingPlanTokens: 10_000_000,
    creditsEnabled: true,
    canCheckIn: true,
    today: new Date().toISOString().slice(0, 10),
    ledger: [],
    checkins: [],
  };

  const checkinDays = new Set((walletData.checkins || []).map((checkin: any) => String(checkin.day).slice(0, 10)));
  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - (6 - offset));
    return date;
  });
  const initial = userData.name?.trim().slice(0, 1).toUpperCase() ?? "Q";
  const paygBalanceNanos = Number((walletData as any)?.paygBalanceNanos ?? 0);
  const codingPlanTokens = Number((walletData as any)?.codingPlanTokens ?? 0);
  const bundleBalanceNanos = Number(walletData?.balanceNanos ?? 0);

  const formattedCodingTokens =
    codingPlanTokens >= 1_000_000
      ? `${(codingPlanTokens / 1_000_000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}M`
      : codingPlanTokens.toLocaleString();

  return (
    <div className="space-y-6">
      {/* 1. Developer Identity & Security Posture Hero */}
      <section
        style={{
          backgroundColor: "oklch(0.14 0 0)",
          borderColor: "oklch(0.26 0 0)",
          boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
        className="rounded-3xl border p-6 sm:p-8 shadow-2xl relative overflow-hidden"
      >
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/[0.03] blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-5">
            <div className="relative shrink-0">
              <PearlAvatar letter={initial} size={64} />
              <span className="absolute bottom-0 right-0 h-4 w-4 rounded-full bg-emerald-500 border-2 border-black" title="Active developer session" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono uppercase tracking-[.18em] font-bold text-zinc-400 flex items-center gap-1.5">
                  <ShieldCheck size={13} className="text-emerald-400" />
                  Qronos AI Developer Account
                </span>
                <UserTierBadge tier={(userData as any).tier} showTag size="xs" />
              </div>

              <h2 className="mt-1 text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                {userData.name || "Qronos Developer"}
              </h2>

              <div className="mt-2 flex items-center gap-3 text-xs font-mono text-zinc-400 flex-wrap">
                <span className="flex items-center gap-1 text-zinc-300">
                  <Mail size={12} className="text-zinc-500" />
                  {userData.email || "No email"}
                </span>
                <span className="text-zinc-600">•</span>
                <span className="capitalize">{userData.loginMethod ?? "password"} auth</span>
                <span className="text-zinc-600">•</span>
                <span>Member since {new Date(userData.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap self-start md:self-auto shrink-0">
            <Link href="/dashboard/keys">
              <Button variant="outline" className="h-9 px-4 rounded-full border-white/15 bg-black/40 text-xs font-mono text-zinc-200 hover:bg-white/10 hover:text-white cursor-pointer">
                <KeyRound size={13} className="mr-1.5 text-zinc-400" />
                <span>API Keys</span>
              </Button>
            </Link>
            <Link href="/dashboard/pricing">
              <StarButton backgroundColor="#000000" className="h-9 px-4 rounded-full border border-slate-200/50 text-xs font-mono">
                <Zap size={13} className="mr-1.5 inline-block text-white" />
                <span>Recharge & Plans</span>
              </StarButton>
            </Link>
          </div>
        </div>
      </section>

      {/* 2-Column Bento: Daily Check-in Ritual + Active Compute Quotas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left 7 Cols: Daily Build Ritual & 7-Day UTC Calendar */}
        <section
          style={{
            backgroundColor: "oklch(0.14 0 0)",
            borderColor: "oklch(0.26 0 0)",
            boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
          className="lg:col-span-7 rounded-3xl border p-6 sm:p-7 shadow-2xl flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <CalendarDays size={15} className="text-white" />
                <span className="text-[10px] font-bold uppercase tracking-[.18em] font-mono text-zinc-400">
                  Daily Build Ritual
                </span>
              </div>
              <Badge className="border-0 bg-white/[0.08] text-white font-mono text-[10px] px-2 py-0.5">
                Up to $2.00 / UTC Day
              </Badge>
            </div>

            <h3 className="mt-4 text-xl font-bold text-white tracking-tight">
              Daily Compute Claim
            </h3>
            <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
              Check in once per UTC day to claim a random compute bonus up to $2.00. Funds are credited instantly to your account with zero expiration.
            </p>

            {/* 7-Day Interactive Streak Calendar */}
            <div className="mt-6 grid grid-cols-7 gap-2">
              {days.map((date) => {
                const key = date.toISOString().slice(0, 10);
                const claimed = checkinDays.has(key);
                const today = key === walletData.today;

                return (
                  <div
                    key={key}
                    style={{
                      backgroundColor: today ? "oklch(0.22 0 0)" : "oklch(0.18 0 0)",
                      borderColor: today ? "oklch(0.4 0 0)" : "oklch(0.26 0 0)",
                    }}
                    className={`rounded-2xl border p-2.5 sm:p-3 text-center flex flex-col items-center justify-between transition-all ${
                      claimed ? "ring-1 ring-emerald-500/40" : ""
                    }`}
                  >
                    <span className="text-[10px] font-mono uppercase text-zinc-400 font-semibold">
                      {date.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }).slice(0, 2)}
                    </span>
                    <span className="text-sm sm:text-base font-bold font-mono text-white my-1">
                      {date.getUTCDate()}
                    </span>
                    <span className="text-[9px] font-mono">
                      {claimed ? (
                        <CheckCircle2 size={13} className="text-emerald-400 mx-auto" />
                      ) : today ? (
                        <span className="text-white font-bold text-[8px] uppercase tracking-wider">Today</span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/[0.08] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-white">
                {walletData.canCheckIn ? "Today's reward is ready to claim" : "Today's reward secured"}
              </p>
              <p className="text-[10px] font-mono text-zinc-500">Resets daily at 00:00 UTC</p>
            </div>
            <Button
              disabled={checkIn.isPending || !walletData.canCheckIn}
              onClick={() => checkIn.mutate()}
              className="w-full sm:w-auto bg-white text-black hover:bg-zinc-200 font-mono font-bold text-xs h-9 px-5 cursor-pointer shadow-md disabled:opacity-40"
            >
              {checkIn.isPending ? (
                <Loader2 className="animate-spin mr-1.5" size={14} />
              ) : (
                <CalendarCheck className="mr-1.5" size={14} />
              )}
              {walletData.canCheckIn ? "Claim Daily Reward" : "Checked In for Today"}
            </Button>
          </div>
        </section>

        {/* Right 5 Cols: Multi-Tier Quota Allocation Summary */}
        <section
          style={{
            backgroundColor: "oklch(0.14 0 0)",
            borderColor: "oklch(0.26 0 0)",
            boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
          className="lg:col-span-5 rounded-3xl border p-6 sm:p-7 shadow-2xl flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <WalletCards size={15} className="text-white" />
                <span className="text-[10px] font-bold uppercase tracking-[.18em] font-mono text-zinc-400">
                  Compute Reserves
                </span>
              </div>
              <Badge className="border-0 bg-white/[0.08] text-white font-mono text-[10px]">
                Active Tiers
              </Badge>
            </div>

            <div className="mt-5 space-y-3">
              {/* Tier 1: PAYG */}
              <div
                style={{ backgroundColor: "oklch(0.18 0 0)", borderColor: "oklch(0.26 0 0)" }}
                className="rounded-2xl border p-3.5 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-1.5 text-zinc-300 font-mono text-xs font-bold">
                    <Zap size={13} className="text-white" />
                    <span>PAYG Balance</span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500">Official zero-markup rates</span>
                </div>
                <div className="text-right">
                  <span className="text-base font-bold font-mono text-white">
                    {formatCreditWhole(paygBalanceNanos)}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400 ml-1">USD</span>
                </div>
              </div>

              {/* Tier 2: Token Plan */}
              <div
                style={{ backgroundColor: "oklch(0.18 0 0)", borderColor: "oklch(0.26 0 0)" }}
                className="rounded-2xl border p-3.5 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-1.5 text-zinc-300 font-mono text-xs font-bold">
                    <Code2 size={13} className="text-white" />
                    <span>Token Plan Quota</span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500">Claude Opus 5 & GLM 5.3</span>
                </div>
                <div className="text-right">
                  <span className="text-base font-bold font-mono text-white">
                    {formattedCodingTokens}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400 ml-1">Tokens</span>
                </div>
              </div>

              {/* Promotional Wallet */}
              {creditsEnabled && (
                <div
                  style={{ backgroundColor: "oklch(0.18 0 0)", borderColor: "oklch(0.26 0 0)" }}
                  className="rounded-2xl border p-3.5 flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-1.5 text-zinc-300 font-mono text-xs font-bold">
                      <Gift size={13} className="text-white" />
                      <span>Promotional Wallet</span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500">Community check-in gifts</span>
                  </div>
                  <div className="text-right">
                    <span className="text-base font-bold font-mono text-white">
                      {formatCreditWhole(bundleBalanceNanos)}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-400 ml-1">USD</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-white/[0.08]">
            <Link href="/dashboard/pricing" className="block w-full">
              <Button className="w-full bg-white text-black hover:bg-zinc-200 font-mono font-bold text-xs h-9 cursor-pointer shadow-md">
                <span>Top Up Reserves & Plans</span>
                <ArrowUpRight size={13} className="ml-1.5" />
              </Button>
            </Link>
          </div>
        </section>
      </div>

      {/* 3. Immutable Credit Trail & Audit Ledger */}
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
              <History size={14} className="text-white" />
              <p className="text-[10px] font-bold uppercase tracking-[.18em] font-mono text-zinc-400">Audit Trail</p>
            </div>
            <h3 className="mt-1 text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              Wallet Activity History
            </h3>
          </div>
          <Badge className="border border-white/10 bg-white/[0.06] text-zinc-300 font-mono text-[10px]">
            Immutable Cryptographic Ledger
          </Badge>
        </div>

        <div className="mt-5">
          {walletData.ledger.length ? (
            <div className="space-y-2.5">
              {walletData.ledger.map((entry: any) => {
                const amount = Number(entry.amountNanos);
                const descriptor = ledgerDescriptor(entry.kind);
                const Icon = descriptor.icon;

                return (
                  <div
                    key={entry.id}
                    style={{ backgroundColor: "oklch(0.18 0 0)", borderColor: "oklch(0.26 0 0)" }}
                    className="rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all duration-200 hover:border-white/30"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] border border-white/10 text-white">
                        <Icon size={16} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">{descriptor.title}</p>
                        <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                          {entry.note || descriptor.detail} • {new Date(entry.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="self-end sm:self-center">
                      <span
                        className={`text-sm font-mono font-bold ${
                          amount > 0 ? "text-emerald-400" : "text-white"
                        }`}
                      >
                        {amount > 0 ? "+" : "−"}{formatCreditNanos(Math.abs(amount))}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center bg-black/30">
              <ArrowDownLeft className="mx-auto text-zinc-500 mb-3" size={26} />
              <p className="text-sm font-bold text-white">Your wallet is ready</p>
              <p className="mt-1 text-xs text-zinc-400 max-w-sm mx-auto">
                Credit grants, daily check-ins, and deposit settlements will automatically log into this immutable ledger.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
