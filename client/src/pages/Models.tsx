import { useState, useMemo } from "react";
import { Link } from "wouter";
import { PublicNav } from "@/components/PublicNav";
import { QronosGlyph } from "@/components/QronosGlyph";
import { ProviderMark } from "@/components/ProviderMark";
import { StarBorderCard } from "@/components/StarBorderCard";
import { StarButton } from "@/components/StarButton";
import { Badge } from "@/components/ui/badge";
import { QRONOS_MODELS, CatalogueModel } from "@/lib/modelCatalogue";
import { useDynamicModelPricing } from "@/lib/useDynamicModelPricing";
import { trpc } from "@/lib/trpc";
import {
  Search,
  Check,
  Copy,
  Terminal,
  ShieldCheck,
  Lock,
  Code2,
  ExternalLink,
  Sparkles,
  Zap,
  Activity,
  Layers,
  ArrowRight,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import "./infergate-landing.css";

export default function Models() {
  const { getRates } = useDynamicModelPricing();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [tierFilter, setTierFilter] = useState<"all" | "free" | "paid" | "token_plan">("all");
  const [copiedModelId, setCopiedModelId] = useState<string | null>(null);

  const modelAvailability = trpc.public.modelAvailability.useQuery(undefined, {
    staleTime: 30_000,
    refetchInterval: 45_000,
  });

  const modelMetaMap = useMemo(() => {
    return new Map(
      modelAvailability.data?.map((item) => [
        item.modelId,
        {
          available: item.available,
          minTier: item.minTier ?? "free",
          isTokenPlan: (item as any).isTokenPlan ?? false,
          isPayg: (item as any).isPayg ?? false,
          isBundle: (item as any).isBundle !== false,
        },
      ]) ?? []
    );
  }, [modelAvailability.data]);

  // Unique list of providers
  const providers = useMemo(() => {
    const list = Array.from(new Set(QRONOS_MODELS.map((m) => m.provider)));
    return ["all", ...list];
  }, []);

  const filteredModels = useMemo(() => {
    return QRONOS_MODELS.filter((model) => {
      // Search filter
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        model.name.toLowerCase().includes(q) ||
        model.id.toLowerCase().includes(q) ||
        model.provider.toLowerCase().includes(q) ||
        model.description.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      // Provider filter
      if (selectedProvider !== "all" && model.provider !== selectedProvider) {
        return false;
      }

      // Tier filter
      const meta = modelMetaMap.get(model.id);
      const minTier = meta?.minTier ?? "free";
      if (tierFilter === "free") return minTier === "free";
      if (tierFilter === "paid") return minTier !== "free";
      if (tierFilter === "token_plan") return meta?.isTokenPlan === true;

      return true;
    });
  }, [searchQuery, selectedProvider, tierFilter, modelMetaMap]);

  const freeCount = useMemo(() => {
    return QRONOS_MODELS.filter((m) => (modelMetaMap.get(m.id)?.minTier ?? "free") === "free").length;
  }, [modelMetaMap]);

  const tokenPlanCount = useMemo(() => {
    return QRONOS_MODELS.filter((m) => modelMetaMap.get(m.id)?.isTokenPlan === true).length;
  }, [modelMetaMap]);

  const paidCount = QRONOS_MODELS.length - freeCount;

  const copyModelId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedModelId(id);
    toast.success(`Copied "${id}" to clipboard`);
    setTimeout(() => setCopiedModelId(null), 2000);
  };

  return (
    <div className="infergate-landing min-h-screen bg-[#08090d] text-white flex flex-col font-sans selection:bg-white/20 selection:text-white">
      {/* Background Ambience */}
      <div className="infergate-radial-glow" />

      <PublicNav />

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20 flex-1 w-full">
        {/* =========================================================
            HEADER & STATS
        ========================================================= */}
        <section className="mb-14 sm:mb-20 text-center max-w-4xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-xs font-mono text-zinc-300 backdrop-blur-md">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>THE VERIFIED FRONTIER MODEL MATRIX</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-light tracking-tight text-white leading-[1.05]">
            {QRONOS_MODELS.length} Frontier Models.
            <br />
            <span className="bg-gradient-to-b from-white via-zinc-300 to-zinc-500 bg-clip-text text-transparent font-medium">
              One Universal Gateway.
            </span>
          </h1>

          <p className="text-sm sm:text-base text-zinc-400 leading-relaxed max-w-2xl mx-auto">
            Every active route is accessible via our standard Messages API (<code>/v1/messages</code>) and Chat
            Completions (<code>/v1/chat/completions</code>) with provider-isolated execution, transparent nanodollar
            metering, and sub-8ms failover.
          </p>

          {/* Quick Telemetry Metric Tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] backdrop-blur-sm">
              <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">Verified Routes</div>
              <div className="text-2xl sm:text-3xl font-light text-white font-mono mt-1">
                {QRONOS_MODELS.length}
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] backdrop-blur-sm">
              <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">API Surface</div>
              <div className="text-2xl sm:text-3xl font-light text-white font-mono mt-1">01 Base URL</div>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] backdrop-blur-sm">
              <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">Failover Speed</div>
              <div className="text-2xl sm:text-3xl font-light text-white font-mono mt-1">&lt; 8ms P95</div>
            </div>
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] backdrop-blur-sm">
              <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">Key Slots / Pool</div>
              <div className="text-2xl sm:text-3xl font-light text-white font-mono mt-1">15 Slots</div>
            </div>
          </div>
        </section>

        {/* =========================================================
            SEARCH & FILTER CONTROLS
        ========================================================= */}
        <section className="mb-10 space-y-4">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] backdrop-blur-md">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search models by name, ID, or provider..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-black/60 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-white/30 transition-all font-mono"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Tier Filters */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setTierFilter("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                  tierFilter === "all"
                    ? "bg-white text-black font-semibold shadow-sm"
                    : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                All ({QRONOS_MODELS.length})
              </button>
              <button
                type="button"
                onClick={() => setTierFilter("free")}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer ${
                  tierFilter === "free"
                    ? "bg-white text-black font-semibold shadow-sm"
                    : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                <ShieldCheck size={13} />
                <span>Free ({freeCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setTierFilter("paid")}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer ${
                  tierFilter === "paid"
                    ? "bg-white text-black font-semibold shadow-sm"
                    : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                <Lock size={13} />
                <span>Paid ({paidCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setTierFilter("token_plan")}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all flex items-center gap-1.5 cursor-pointer ${
                  tierFilter === "token_plan"
                    ? "bg-white text-black font-semibold shadow-sm"
                    : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                <Code2 size={13} />
                <span>Token Plan ({tokenPlanCount})</span>
              </button>
            </div>
          </div>

          {/* Provider Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-500 mr-2 shrink-0">Provider:</span>
            {providers.map((prov) => (
              <button
                key={prov}
                type="button"
                onClick={() => setSelectedProvider(prov)}
                className={`px-3 py-1 rounded-full text-xs font-mono whitespace-nowrap transition-all cursor-pointer border ${
                  selectedProvider === prov
                    ? "bg-white/[0.1] text-white border-white/30 font-semibold"
                    : "text-zinc-400 border-white/[0.06] hover:border-white/15 hover:text-zinc-200"
                }`}
              >
                {prov === "all" ? "All Providers" : prov}
              </button>
            ))}
          </div>
        </section>

        {/* Results Counter */}
        <div className="text-xs font-mono text-zinc-500 mb-6 flex items-center justify-between">
          <span>
            Showing <strong className="text-zinc-300">{filteredModels.length}</strong> of {QRONOS_MODELS.length}{" "}
            verified model routes
          </span>
          {searchQuery && (
            <span>
              Filtering by: "<em>{searchQuery}</em>"
            </span>
          )}
        </div>

        {/* =========================================================
            MODEL CARDS GRID WITH ROTATING BORDER LIGHT (STAR BORDER CARD)
        ========================================================= */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredModels.map((model) => {
            const meta = modelMetaMap.get(model.id);
            const isAvailable = meta?.available ?? true;
            const minTier = meta?.minTier ?? "free";
            const isFree = minTier === "free";
            const isTokenPlan = meta?.isTokenPlan === true;
            const rates = getRates(model.id, model.inputUsdPerMillion, model.outputUsdPerMillion);

            return (
              <StarBorderCard key={model.id} lightWidth={180} duration={7} className="h-full">
                <div className="p-6 h-full flex flex-col justify-between">
                  {/* Top Bar: Provider + Tier Badges */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-4">
                      <div className="flex items-center gap-2">
                        <ProviderMark provider={model.provider} fallback={model.providerMark} size={24} />
                        <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                          {model.provider}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {isTokenPlan && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-white/20 text-zinc-300 bg-white/[0.04]">
                            Token Plan
                          </span>
                        )}
                        {isFree ? (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-emerald-500/30 text-emerald-300 bg-emerald-500/10">
                            Free
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-zinc-700 text-zinc-400 bg-zinc-900 uppercase">
                            {minTier}+
                          </span>
                        )}
                        <span
                          className={`w-2 h-2 rounded-full ${isAvailable ? "bg-emerald-400" : "bg-rose-500"}`}
                          title={isAvailable ? "Model Route Healthy" : "Model Temporarily Unavailable"}
                        />
                      </div>
                    </div>

                    {/* Model Title & Eyebrow */}
                    <div className="mb-3">
                      <h3 className="text-xl font-semibold text-white tracking-tight">{model.name}</h3>
                      <p className="text-xs text-zinc-500 font-mono mt-0.5">{model.eyebrow}</p>
                    </div>

                    {/* Copyable Model ID */}
                    <div className="mb-4">
                      <button
                        type="button"
                        onClick={() => copyModelId(model.id)}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg bg-black/60 border border-white/[0.08] hover:border-white/20 text-xs font-mono text-zinc-300 flex items-center justify-between transition-colors group/copy"
                      >
                        <span className="truncate">{model.id}</span>
                        {copiedModelId === model.id ? (
                          <Check size={12} className="text-emerald-400 shrink-0 ml-2" />
                        ) : (
                          <Copy size={12} className="text-zinc-500 group-hover/copy:text-white shrink-0 ml-2" />
                        )}
                      </button>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-zinc-400 leading-relaxed mb-4 line-clamp-3">{model.description}</p>

                    {/* Capabilities Tags */}
                    <div className="flex flex-wrap gap-1.5 mb-6">
                      {model.capabilities.map((cap) => (
                        <span
                          key={cap}
                          className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.03] border border-white/[0.06] text-zinc-300"
                        >
                          {cap}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Pricing Rate Box & Actions */}
                  <div className="border-t border-white/[0.08] pt-4 mt-auto">
                    <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-black/40 border border-white/[0.05] mb-4 font-mono text-xs">
                      <div>
                        <div className="text-[10px] text-zinc-500 uppercase">Input / 1M</div>
                        <div className="text-white font-medium mt-0.5">{rates.inputFormatted}</div>
                      </div>
                      <div className="border-l border-white/[0.06] pl-3">
                        <div className="text-[10px] text-zinc-500 uppercase">Output / 1M</div>
                        <div className="text-white font-medium mt-0.5">{rates.outputFormatted}</div>
                      </div>
                    </div>

                    {/* Card Action Buttons */}
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/playground?model=${encodeURIComponent(model.id)}`}
                        className="flex-1 py-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs font-mono text-zinc-200 hover:text-white transition-all flex items-center justify-center gap-1.5"
                      >
                        <Terminal size={12} />
                        <span>Test in Playground</span>
                      </Link>
                      {model.pricingUrl && (
                        <a
                          href={model.pricingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.08] border border-white/05 text-zinc-400 hover:text-white transition-all"
                          title="View upstream rate documentation"
                        >
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </StarBorderCard>
            );
          })}
        </div>

        {/* Empty State */}
        {filteredModels.length === 0 && (
          <div className="text-center py-20 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
            <p className="text-base text-zinc-300">No model routes match your current search.</p>
            <p className="text-xs text-zinc-500 mt-1">Try adjusting your keyword query or provider filters.</p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedProvider("all");
                setTierFilter("all");
              }}
              className="mt-4 px-4 py-1.5 rounded-lg text-xs font-mono bg-white/10 text-white hover:bg-white/15"
            >
              Reset Filters
            </button>
          </div>
        )}

        {/* =========================================================
            BOTTOM ACTIVATION & SLA CALLOUT
        ========================================================= */}
        <section className="mt-20 p-8 rounded-3xl bg-neutral-900/90 border border-white/10 backdrop-blur-xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-2 text-xs font-mono text-zinc-400">
              <Sparkles size={14} className="text-zinc-300" />
              <span>UNIFIED SDK ACCESS · PROTOCOL NORMALIZATION</span>
            </div>
            <h3 className="text-2xl font-bold text-white tracking-tight">
              Ready to route your models through Qronos AI?
            </h3>
            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
              Generate an API key in seconds and drop into Claude Code, Cursor, or your custom SDK by overriding one base
              URL.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/signup">
              <StarButton backgroundColor="#000000" className="rounded-full border border-slate-200/50 px-6 text-xs">
                <span>GET API KEY</span>
                <ArrowRight size={13} className="ml-1 inline-block" />
              </StarButton>
            </Link>
            <Link
              href="/docs"
              className="px-5 py-2.5 rounded-full border border-white/15 text-xs font-mono text-zinc-300 hover:text-white hover:bg-white/5 transition"
            >
              View Docs
            </Link>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}

export function PublicFooter() {
  return (
    <footer className="relative bg-black border-t border-white/10 mt-auto">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-3">
              <QronosGlyph size={28} />
              <span className="text-lg font-bold text-white flex items-center gap-2 font-display">
                Qronos AI
                <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border border-white/10 text-zinc-400 bg-white/[0.04]">
                  LLM GATEWAY
                </span>
              </span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-zinc-500">
              The universal AI model gateway for autonomous developers and high-throughput engineering teams. Route, pool,
              and settle every token through one unified base URL.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-10 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-zinc-500 font-mono">Product</p>
              <ul className="mt-4 space-y-2 text-zinc-300 text-xs">
                <li><Link href="/models">Models Matrix</Link></li>
                <li><Link href="/pricing">Pricing Plans</Link></li>
                <li><Link href="/playground">Playground</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-zinc-500 font-mono">Developers</p>
              <ul className="mt-4 space-y-2 text-zinc-300 text-xs">
                <li><Link href="/docs">Documentation</Link></li>
                <li><Link href="/docs#messages-api">Messages API</Link></li>
                <li><Link href="/docs#chat-api">Chat Completions</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-zinc-500 font-mono">Legal</p>
              <ul className="mt-4 space-y-2 text-zinc-300 text-xs">
                <li><Link href="/legal/privacy">Privacy Policy</Link></li>
                <li><Link href="/legal/terms">Terms of Service</Link></li>
                <li><Link href="/legal/refund">Refund Policy</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-zinc-600 md:flex-row md:justify-between font-mono">
          <span>© 2026 Qronos AI Systems. All rights reserved.</span>
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>All gateway systems operational</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
