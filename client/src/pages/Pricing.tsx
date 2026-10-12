import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import { PublicNav } from "@/components/PublicNav";
import { PublicFooter } from "./Models";
import { StarBorderCard } from "@/components/StarBorderCard";
import { StarButton } from "@/components/StarButton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckoutModal } from "@/components/CheckoutModal";
import { PaygPaymentModal } from "@/components/PaygPaymentModal";
import {
  Check,
  X,
  Gift,
  Smartphone,
  Wallet,
  CreditCard,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
  Coins,
  Code2,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { TOKEN_PLAN_TIERS, type TokenPlanTier } from "@shared/paymentTiers";

export default function Pricing() {
  const [activePlanType, setActivePlanType] = useState<"token_plan" | "payg">("token_plan");
  const [activeRail, setActiveRail] = useState<"card" | "upi" | "crypto">("upi");
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isPaygModalOpen, setIsPaygModalOpen] = useState(false);
  const [authAlertOpen, setAuthAlertOpen] = useState(false);
  const { user } = useAuth();
  const [selectedRailForModal, setSelectedRailForModal] = useState<"crypto" | "upi" | "card">("upi");
  const [selectedAmountUsd, setSelectedAmountUsd] = useState<number>(25);
  const [isCheckoutPayg, setIsCheckoutPayg] = useState(false);
  const [isCheckoutCodingPlan, setIsCheckoutCodingPlan] = useState(false);
  const [selectedCodingTierId, setSelectedCodingTierId] = useState<string | undefined>(undefined);

  const openTokenPlanCheckout = (tier: TokenPlanTier) => {
    if (!user) {
      setAuthAlertOpen(true);
      return;
    }
    if (tier.amountUsd === 0) {
      toast.success("Free tier is active! Enjoy 10M starter tokens and daily check-ins.");
      return;
    }
    if (activeRail === "card") {
      toast.error("Card payments are temporarily under maintenance. Please use Domestic UPI or Solana Pay.");
      setSelectedRailForModal("upi");
    } else {
      setSelectedRailForModal(activeRail);
    }
    setSelectedAmountUsd(tier.amountUsd);
    setIsCheckoutPayg(false);
    setIsCheckoutCodingPlan(true);
    setSelectedCodingTierId(tier.id);
    setIsCheckoutOpen(true);
  };

  const handleSelectPaygMethod = (method: "card" | "upi" | "crypto", amountUsd: number) => {
    setIsPaygModalOpen(false);
    if (!user) {
      setAuthAlertOpen(true);
      return;
    }
    if (method === "card") {
      toast.error("Card payments are temporarily under maintenance. Please use Domestic UPI or Solana Pay.");
      setSelectedRailForModal("upi");
    } else {
      setSelectedRailForModal(method);
    }
    setSelectedAmountUsd(amountUsd);
    setIsCheckoutPayg(true);
    setIsCheckoutCodingPlan(false);
    setSelectedCodingTierId(undefined);
    setIsCheckoutOpen(true);
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col font-sans selection:bg-white/20 selection:text-white">
      <PublicNav />

      {/* =========================================================
          ACETERNITY CRYPTGEN PRICING SECTION
      ========================================================= */}
      <section className="relative isolate w-full overflow-hidden px-4 py-20 md:py-32 lg:px-8" id="pricing">
        {/* Aceternity Giant Ambient Sphere & Radial Grid Backdrop */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(255,255,255,0.08)]"
            style={{
              width: 1400,
              height: 1400,
              clipPath: "circle(50% at 50% 50%)",
              background:
                "radial-gradient(circle at center, rgba(35, 35, 35, 0.75) 0%, rgba(18, 18, 18, 0.55) 30%, rgba(0, 0, 0, 0.8) 70%)",
            }}
          />
          <div
            className="absolute bg-black left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(255,255,255,0.08)] shadow-[0_0_200px_80px_rgba(255,255,255,0.08)]"
            style={{ width: 1000, height: 1000 }}
          />
        </div>

        {/* Section Header with Radial Gradient Text */}
        <div className="relative z-20 mx-auto mb-6 max-w-4xl text-center pt-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-white/10 bg-white/[0.04] text-xs font-mono text-zinc-300 mb-6 backdrop-blur-md">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>TRANSPARENT NANODOLLAR SETTLEMENT · ZERO PLATFORM MARKUP</span>
          </div>

          <h1 className="inline-block text-4xl sm:text-5xl md:text-6xl bg-[radial-gradient(61.17%_178.53%_at_38.83%_-13.54%,#3B3B3B_0%,#888787_12.61%,#FFFFFF_50%,#888787_80%,#3B3B3B_100%)] bg-clip-text text-transparent font-extrabold tracking-tight">
            Flexible AI Compute Plans
          </h1>

          <p className="text-sm sm:text-base text-neutral-400 mt-4 px-4 max-w-2xl text-center mx-auto leading-relaxed font-sans">
            Scale autonomous AI workloads with two dedicated models: pre-allocated <strong className="text-white">Token Plans</strong> (10M tokens / $1) or direct <strong className="text-white">PAYG Plans</strong> with 60% off all model inference rates.
          </p>

          {/* Plan Type Switcher (Token Plan vs PAYG Plan) */}
          <div className="mt-8 flex items-center justify-center">
            <div className="inline-flex p-1.5 rounded-2xl bg-neutral-900/90 border border-neutral-700/80 backdrop-blur-xl shadow-2xl gap-1">
              <button
                type="button"
                onClick={() => setActivePlanType("token_plan")}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-mono font-semibold transition-all duration-200 cursor-pointer ${
                  activePlanType === "token_plan"
                    ? "bg-white text-black shadow-lg"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                <Code2 size={15} />
                <span>Token Plans (5 Tiers)</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold">
                  10M / $1
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActivePlanType("payg")}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-mono font-semibold transition-all duration-200 cursor-pointer ${
                  activePlanType === "payg"
                    ? "bg-white text-black shadow-lg"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                <Zap size={15} />
                <span>PAYG Plan (On-Demand)</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-bold">
                  +100% Match
                </span>
              </button>
            </div>
          </div>

          {/* Payment Rail Switcher Tabs */}
          <div className="mt-4 flex items-center justify-center">
            <div className="inline-flex p-1 rounded-xl bg-neutral-900/60 border border-neutral-800 backdrop-blur-md gap-1">
              <button
                type="button"
                onClick={() => setActiveRail("upi")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-mono transition-all duration-200 cursor-pointer ${
                  activeRail === "upi" ? "bg-white/15 text-white font-bold" : "text-neutral-400 hover:text-white"
                }`}
              >
                <Smartphone size={13} />
                <span>Domestic UPI (₹ INR)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveRail("crypto")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-mono transition-all duration-200 cursor-pointer ${
                  activeRail === "crypto" ? "bg-white/15 text-white font-bold" : "text-neutral-400 hover:text-white"
                }`}
              >
                <Wallet size={13} />
                <span>Solana Pay (SOL)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveRail("card")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-mono transition-all duration-200 cursor-pointer ${
                  activeRail === "card" ? "bg-white/15 text-white font-bold" : "text-neutral-400 hover:text-white"
                }`}
              >
                <CreditCard size={13} />
                <span>Card (Global)</span>
              </button>
            </div>
          </div>
        </div>

        {/* =========================================================
            PRICING CARDS WITH ROTATING STAR BORDER LIGHT BEAMS
        ========================================================= */}
        <div className="relative z-20 max-w-7xl mx-auto px-4 py-6">
          {activePlanType === "token_plan" ? (
            /* 5 TOKEN PLAN CARDS: Free, Plus, Pro, Ultra, Enterprise */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5 items-stretch">
              {TOKEN_PLAN_TIERS.map((tier) => {
                const isFree = tier.amountUsd === 0;
                const isPro = tier.popular === true;

                return (
                  <StarBorderCard
                    key={tier.id}
                    lightWidth={isPro ? 220 : 160}
                    duration={isPro ? 6 : 9}
                    lightColor={isPro ? "rgba(255, 255, 255, 1.0)" : "rgba(255, 255, 255, 0.75)"}
                    className="h-full rounded-3xl"
                  >
                    <div className="p-6 sm:p-7 flex flex-col justify-between h-full bg-[#0c0d12]/95 rounded-[23px]">
                      <div>
                        {/* Top Badge & Tier Name */}
                        <div className="flex items-center justify-between gap-2 mb-4">
                          <span className="text-xs font-mono uppercase font-bold tracking-wider text-white">
                            {tier.name}
                          </span>
                          <span
                            className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                              isPro
                                ? "bg-white text-black shadow-md"
                                : "bg-white/[0.08] text-zinc-300 border border-white/10"
                            }`}
                          >
                            {tier.badge || "PLAN"}
                          </span>
                        </div>

                        {/* Price */}
                        <div className="mb-4">
                          <div className="flex items-baseline gap-1">
                            <span className="text-4xl font-extrabold text-white tracking-tight font-mono">
                              ${tier.amountUsd}
                            </span>
                            <span className="text-zinc-400 text-xs font-mono">
                              {isFree ? "forever" : `/mo · ₹${tier.amountInr.toLocaleString()}`}
                            </span>
                          </div>
                          <p className="text-[11px] font-mono text-emerald-400 font-bold mt-1">
                            {tier.tokensMillions >= 1000
                              ? `${(tier.tokensMillions / 1000).toFixed(1)}B Tokens Allocation`
                              : `${tier.tokensMillions}M Tokens Allocation`}
                          </p>
                          <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                            {tier.description}
                          </p>
                        </div>

                        {/* Features List */}
                        <div className="space-y-2.5 mb-6 border-t border-white/[0.08] pt-4">
                          {tier.features.map((feature, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-xs text-neutral-300">
                              <Check className="h-3.5 w-3.5 text-white shrink-0 mt-0.5" />
                              <span className="leading-snug">{feature}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Card Action Button */}
                      <div className="mt-auto pt-2">
                        {isFree ? (
                          <Link href={user ? "/dashboard" : "/signup"} className="block w-full">
                            <button
                              type="button"
                              className="w-full py-2.5 rounded-xl text-xs font-bold font-mono text-white bg-white/[0.08] hover:bg-white/[0.15] border border-white/20 transition-all cursor-pointer"
                            >
                              {user ? "Active Starter Plan" : "Get Started Free"}
                            </button>
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openTokenPlanCheckout(tier)}
                            className={`w-full py-2.5 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer shadow-md ${
                              isPro
                                ? "bg-white text-black hover:bg-zinc-200 shadow-white/10"
                                : "bg-gradient-to-b from-neutral-700 to-neutral-800 hover:from-neutral-600 hover:to-neutral-700 text-white border border-neutral-600"
                            }`}
                          >
                            Choose {tier.name}
                          </button>
                        )}
                        <span className="block text-[10px] font-mono text-zinc-500 text-center mt-2">
                          10M tokens / $1 rate
                        </span>
                      </div>
                    </div>
                  </StarBorderCard>
                );
              })}
            </div>
          ) : (
            /* PAYG ON-DEMAND COMPUTE CARDS & DEPOSIT TIERS */
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch max-w-5xl mx-auto">
              {/* PAYG Starter ($10) */}
              <StarBorderCard lightWidth={160} duration={8} className="h-full rounded-3xl">
                <div className="p-7 flex flex-col justify-between h-full bg-[#0c0d12]/95 rounded-[23px]">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs font-mono uppercase font-bold text-white">PAYG Starter</span>
                      <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold">
                        60% OFF RATES
                      </span>
                    </div>
                    <div className="mb-4">
                      <span className="text-4xl font-extrabold text-white font-mono">$10</span>
                      <span className="text-zinc-400 text-xs font-mono ml-2">deposit · ₹960</span>
                      <p className="text-xs text-emerald-400 font-mono font-bold mt-1">60% Off All Model Rates ($25 Value)</p>
                      <p className="text-xs text-neutral-400 mt-2">
                        Official zero-markup provider rates with 60% compute discount. Perfect for dev and testing.
                      </p>
                    </div>
                    <div className="space-y-2.5 mb-6 border-t border-white/[0.08] pt-4 text-xs text-neutral-300">
                      <div className="flex items-center gap-2"><Check size={14} className="text-white" /> 60% off all frontier model rates</div>
                      <div className="flex items-center gap-2"><Check size={14} className="text-white" /> Pay strictly for tokens used</div>
                      <div className="flex items-center gap-2"><Check size={14} className="text-white" /> Balance never expires</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectPaygMethod(activeRail, 10)}
                    className="w-full py-2.5 rounded-xl text-xs font-bold font-mono text-white bg-gradient-to-b from-neutral-700 to-neutral-800 hover:from-neutral-600 border border-neutral-600 transition-all cursor-pointer"
                  >
                    Deposit $10 (60% Off Rates)
                  </button>
                </div>
              </StarBorderCard>

              {/* PAYG Developer ($25) - Featured */}
              <StarBorderCard lightWidth={220} duration={6} lightColor="rgba(255, 255, 255, 1.0)" className="h-full rounded-3xl">
                <div className="p-7 flex flex-col justify-between h-full bg-[#0c0d12]/95 rounded-[23px]">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs font-mono uppercase font-bold text-white">PAYG Pro</span>
                      <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-white text-black font-bold">
                        FEATURED · 60% OFF
                      </span>
                    </div>
                    <div className="mb-4">
                      <span className="text-4xl font-extrabold text-white font-mono">$25</span>
                      <span className="text-zinc-400 text-xs font-mono ml-2">deposit · ₹2,400</span>
                      <p className="text-xs text-emerald-400 font-mono font-bold mt-1">60% Off All Model Rates ($62.50 Value)</p>
                      <p className="text-xs text-neutral-400 mt-2">
                        Heavy engineering, Cursor and Claude Code with continuous key failover.
                      </p>
                    </div>
                    <div className="space-y-2.5 mb-6 border-t border-white/[0.08] pt-4 text-xs text-neutral-300">
                      <div className="flex items-center gap-2"><Check size={14} className="text-white" /> 60% off all frontier model rates</div>
                      <div className="flex items-center gap-2"><Check size={14} className="text-white" /> Sub-8ms multi-slot failover</div>
                      <div className="flex items-center gap-2"><Check size={14} className="text-white" /> Uncapped tokens/sec streaming</div>
                      <div className="flex items-center gap-2"><Check size={14} className="text-white" /> Balance never expires</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectPaygMethod(activeRail, 25)}
                    className="w-full py-2.5 rounded-xl text-xs font-bold font-mono bg-white text-black hover:bg-zinc-200 transition-all cursor-pointer shadow-lg"
                  >
                    Deposit $25 (60% Off Rates)
                  </button>
                </div>
              </StarBorderCard>

              {/* PAYG High-Throughput ($50) */}
              <StarBorderCard lightWidth={160} duration={8} className="h-full rounded-3xl">
                <div className="p-7 flex flex-col justify-between h-full bg-[#0c0d12]/95 rounded-[23px]">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs font-mono uppercase font-bold text-white">PAYG Max</span>
                      <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-white/[0.08] text-white">
                        VIP CLUSTER · 60% OFF
                      </span>
                    </div>
                    <div className="mb-4">
                      <span className="text-4xl font-extrabold text-white font-mono">$50</span>
                      <span className="text-zinc-400 text-xs font-mono ml-2">deposit · ₹4,800</span>
                      <p className="text-xs text-emerald-400 font-mono font-bold mt-1">60% Off All Model Rates ($125 Value)</p>
                      <p className="text-xs text-neutral-400 mt-2">
                        Production multi-agent swarms and continuous autonomous pipelines.
                      </p>
                    </div>
                    <div className="space-y-2.5 mb-6 border-t border-white/[0.08] pt-4 text-xs text-neutral-300">
                      <div className="flex items-center gap-2"><Check size={14} className="text-white" /> 60% off all frontier model rates</div>
                      <div className="flex items-center gap-2"><Check size={14} className="text-white" /> Dedicated standby VIP capacity</div>
                      <div className="flex items-center gap-2"><Check size={14} className="text-white" /> Team API key sharing</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectPaygMethod(activeRail, 50)}
                    className="w-full py-2.5 rounded-xl text-xs font-bold font-mono text-white bg-gradient-to-b from-neutral-700 to-neutral-800 hover:from-neutral-600 border border-neutral-600 transition-all cursor-pointer"
                  >
                    Deposit $50 (60% Off Rates)
                  </button>
                </div>
              </StarBorderCard>
            </div>
          )}
        </div>
      </section>

      {/* Pay-As-You-Go Deposit Modal */}
      {isPaygModalOpen && (
        <PaygPaymentModal
          isOpen={isPaygModalOpen}
          onClose={() => setIsPaygModalOpen(false)}
          onSelectPaymentMethod={handleSelectPaygMethod}
        />
      )}

      {/* Checkout Modal */}
      {isCheckoutOpen && (
        <CheckoutModal
          isOpen={isCheckoutOpen}
          onClose={() => {
            setIsCheckoutOpen(false);
            setIsCheckoutPayg(false);
            setIsCheckoutCodingPlan(false);
            setSelectedCodingTierId(undefined);
          }}
          initialRail={selectedRailForModal}
          initialPackageUsd={selectedAmountUsd}
          isPayg={isCheckoutPayg}
          isCodingPlan={isCheckoutCodingPlan}
          codingPlanTierId={selectedCodingTierId}
        />
      )}

      {/* Auth Alert Dialog */}
      <AlertDialog open={authAlertOpen} onOpenChange={setAuthAlertOpen}>
        <AlertDialogContent className="bg-neutral-900 border border-neutral-700 text-white rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">Sign In Required</AlertDialogTitle>
            <AlertDialogDescription className="text-neutral-400 text-sm">
              Please sign in or create an account to choose a Qronos AI compute plan and generate API keys.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border border-neutral-700 text-white hover:bg-neutral-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Link href="/signin" className="bg-white text-black font-semibold hover:bg-neutral-200 px-4 py-2 rounded-lg">
                Sign In
              </Link>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PublicFooter />
    </div>
  );
}
