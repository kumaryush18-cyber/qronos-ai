import { useAuth } from "@/_core/hooks/useAuth";
import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
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
import { toast } from "sonner";
import {
  Check,
  Code2,
  Gift,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wallet,
  Zap,
  CreditCard,
  ExternalLink,
  ArrowRight,
} from "lucide-react";
import { Link } from "wouter";
import {
  TOKEN_PLAN_TIERS,
  type TokenPlanTier,
  PAYG_TOPUP_OPTIONS,
  WHOP_10_CREDITS_CHECKOUT_URL,
  USD_TO_INR_RATE,
} from "@shared/paymentTiers";

export function DashboardPricingSection() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const wallet = trpc.developer.wallet.useQuery(undefined, { enabled: Boolean(user) });

  const [activePlanType, setActivePlanType] = useState<"token_plan" | "payg">("token_plan");
  const [activeRail, setActiveRail] = useState<"upi" | "crypto">("upi");
  const [selectedPaygAmount, setSelectedPaygAmount] = useState<number>(10);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isPaygModalOpen, setIsPaygModalOpen] = useState(false);
  const [authAlertOpen, setAuthAlertOpen] = useState(false);
  const [selectedRailForModal, setSelectedRailForModal] = useState<"crypto" | "upi">("upi");
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
      toast.success("Free tier is active on your account! Enjoy 10M starter tokens and daily check-ins.");
      return;
    }
    setSelectedRailForModal(activeRail);
    setSelectedAmountUsd(tier.amountUsd);
    setIsCheckoutPayg(false);
    setIsCheckoutCodingPlan(true);
    setSelectedCodingTierId(tier.id);
    setIsCheckoutOpen(true);
  };

  const handleSelectPaygMethod = (method: "upi" | "crypto", amountUsd: number) => {
    setIsPaygModalOpen(false);
    if (!user) {
      setAuthAlertOpen(true);
      return;
    }
    setSelectedRailForModal(method);
    setSelectedAmountUsd(amountUsd);
    setIsCheckoutPayg(true);
    setIsCheckoutCodingPlan(false);
    setSelectedCodingTierId(undefined);
    setIsCheckoutOpen(true);
  };

  const handleCheckoutSuccess = () => {
    void utils.developer.wallet.invalidate();
    if (isCheckoutCodingPlan) {
      toast.success("Payment verified! Your Token Plan tokens have been credited.");
    } else if (isCheckoutPayg) {
      toast.success(`Payment verified! $${selectedAmountUsd}.00 USD deposited into your PAYG balance.`);
    } else {
      toast.success("Payment verified! Your credits have been added.");
    }
  };

  return (
    <div
      style={{
        backgroundColor: "oklch(0.14 0 0)",
        borderColor: "oklch(0.26 0 0)",
        boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
      className="relative min-w-0 rounded-3xl border p-4 sm:p-7 md:p-8 shadow-2xl overflow-hidden"
    >
      {/* Aceternity Giant Ambient Sphere Backdrop */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(255,255,255,0.06)]"
          style={{
            width: 1200,
            height: 1200,
            clipPath: "circle(50% at 50% 50%)",
            background:
              "radial-gradient(circle at center, rgba(30, 30, 30, 0.7) 0%, rgba(15, 15, 15, 0.5) 30%, rgba(0, 0, 0, 0.8) 70%)",
          }}
        />
        <div
          className="absolute bg-black left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(255,255,255,0.06)] shadow-[0_0_160px_60px_rgba(255,255,255,0.06)]"
          style={{ width: 800, height: 800 }}
        />
      </div>

      <div className="relative z-10 space-y-8">
        {/* Header Section */}
        <div className="text-center max-w-3xl mx-auto pt-2">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-white/10 bg-white/[0.04] text-xs font-mono text-zinc-300 mb-4 backdrop-blur-md">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>TRANSPARENT SETTLEMENT · ZERO PLATFORM MARKUP</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl bg-[radial-gradient(61.17%_178.53%_at_38.83%_-13.54%,#3B3B3B_0%,#888787_12.61%,#FFFFFF_50%,#888787_80%,#3B3B3B_100%)] bg-clip-text text-transparent font-extrabold tracking-tight">
            Qronos AI Pricing & Plans
          </h1>

          <p className="text-xs sm:text-sm text-neutral-400 mt-3 max-w-xl mx-auto leading-relaxed font-sans">
            Scale autonomous AI workloads with pre-allocated <strong className="text-white">Token Plans</strong> (10M tokens / $1) or direct <strong className="text-white">PAYG Plans</strong> with 60% off all model inference rates.
          </p>

          {/* Plan Type Switcher (Token Plan vs PAYG Plan) */}
          <div className="mt-6 flex items-center justify-center">
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
          <div className="mt-3.5 flex items-center justify-center">
            <div className="inline-flex p-1 rounded-xl bg-neutral-900/60 border border-neutral-800 backdrop-blur-md gap-1">
              <button
                type="button"
                onClick={() => setActiveRail("upi")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all duration-200 cursor-pointer ${
                  activeRail === "upi" ? "bg-white/15 text-white font-bold" : "text-neutral-400 hover:text-white"
                }`}
              >
                <Smartphone size={13} />
                <span>Domestic UPI (₹ INR)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveRail("crypto")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all duration-200 cursor-pointer ${
                  activeRail === "crypto" ? "bg-white/15 text-white font-bold" : "text-neutral-400 hover:text-white"
                }`}
              >
                <Wallet size={13} />
                <span>Solana Pay (SOL)</span>
              </button>
            </div>
          </div>
        </div>

        {/* =========================================================
            PRICING CARDS WITH ROTATING STAR BORDER LIGHT BEAMS
        ========================================================= */}
        <div>
          {activePlanType === "token_plan" ? (
            /* 5 TOKEN PLAN CARDS: Free, Plus, Pro, Ultra, Enterprise */
            <>
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
                          {/* Metallic Silver Highlighted Token Grant Box */}
                          <div className="mt-3.5 p-2.5 rounded-xl border border-white/15 bg-gradient-to-r from-white/[0.08] via-white/[0.03] to-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] flex items-center justify-between gap-2">
                            <div className="flex flex-col text-left">
                              <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-400 font-bold">
                                Token Grant
                              </span>
                              <span className="text-base sm:text-lg font-mono font-black tracking-tight bg-[linear-gradient(110deg,#9ca3af_0%,#ffffff_35%,#e4e4e7_50%,#ffffff_65%,#71717a_100%)] bg-clip-text text-transparent drop-shadow-[0_2px_8px_rgba(255,255,255,0.35)]">
                                {tier.tokensMillions >= 1000
                                  ? `${(tier.tokensMillions / 1000).toFixed(1)}B Tokens`
                                  : `${tier.tokensMillions}M Tokens`}
                              </span>
                            </div>
                            <span className="h-2 w-2 rounded-full bg-zinc-300 shadow-[0_0_8px_#ffffff] animate-pulse shrink-0" />
                          </div>
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
                          <button
                            type="button"
                            onClick={() => toast.success("Free tier active: 10M tokens allocated!")}
                            className="w-full py-2.5 rounded-xl text-xs font-bold font-mono text-white bg-white/[0.08] hover:bg-white/[0.15] border border-white/20 transition-all cursor-pointer"
                          >
                            Active Starter Plan
                          </button>
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
            </>
          ) : (
            /* PAYG ON-DEMAND COMPUTE - 9 TOP-UP BOXES */
            <div className="max-w-5xl mx-auto space-y-6">
              {/* Feature Highlights Banner */}
              <div className="rounded-2xl border border-white/10 bg-[#0c0d12]/90 p-5 sm:p-6 backdrop-blur-md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-amber-400" />
                      <h2 className="text-base sm:text-lg font-bold font-mono text-white">
                        On-Demand Compute Top-Up
                      </h2>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold">
                        50% OFF RATES
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400">
                      Select any box below to top up your balance. No recurring subscriptions, zero monthly expiration, and per-token nanodollar billing.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 shrink-0">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <span>Instant Ledger Settlement</span>
                  </div>
                </div>

                {/* 9 TOP-UP BOXES: $10, $15, $20, $25, $30, $50, $100, $150, $200 ONLY */}
                <div className="pt-5 space-y-3">
                  <label className="text-xs font-mono uppercase font-bold text-zinc-400 block tracking-wider">
                    Select Top-Up Amount (9 Available Sizes)
                  </label>

                  <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2.5">
                    {PAYG_TOPUP_OPTIONS.map((opt) => {
                      const isSelected = selectedPaygAmount === opt.amountUsd;

                      return (
                        <button
                          key={opt.amountUsd}
                          type="button"
                          onClick={() => setSelectedPaygAmount(opt.amountUsd)}
                          className={`relative p-3 rounded-2xl border text-center transition-all cursor-pointer flex flex-col justify-between ${
                            isSelected
                              ? "bg-white text-black border-white shadow-xl shadow-white/10 scale-[1.02] ring-2 ring-white/50"
                              : "bg-white/[0.03] hover:bg-white/[0.08] text-white border-white/10 hover:border-white/25"
                          }`}
                        >
                          {opt.amountUsd === 10 && (
                            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded-full text-[8px] font-mono font-bold uppercase bg-orange-500 text-black shadow-sm whitespace-nowrap">
                              Card/PayPal/Crypto
                            </span>
                          )}
                          {opt.popular && (
                            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded-full text-[8px] font-mono font-bold uppercase bg-amber-400 text-black shadow-sm">
                              Popular
                            </span>
                          )}
                          {opt.amountUsd === 100 && (
                            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded-full text-[8px] font-mono font-bold uppercase bg-cyan-400 text-black shadow-sm">
                              Best Value
                            </span>
                          )}

                          <div className="pt-1">
                            <span className="text-lg sm:text-xl font-black font-mono tracking-tight block">
                              ${opt.amountUsd}
                            </span>
                            <span className={`text-[10px] font-mono block mt-0.5 ${isSelected ? "text-zinc-600" : "text-zinc-400"}`}>
                              ₹{opt.amountInr.toLocaleString()}
                            </span>
                          </div>

                          <div className={`mt-2 pt-1.5 border-t text-[10px] font-mono font-bold ${
                            isSelected ? "border-black/10 text-emerald-700" : "border-white/10 text-emerald-400"
                          }`}>
                            +${opt.amountUsd}.00
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Selected Checkout Actions Panel */}
                <div className="mt-6 p-4 rounded-xl border border-white/10 bg-black/40 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
                    <div>
                      <span className="text-xs text-zinc-400 font-mono">Selected Top-Up:</span>
                      <div className="text-xl font-bold font-mono text-white flex items-center gap-2">
                        <span>${selectedPaygAmount}.00 USD</span>
                        <span className="text-sm text-zinc-400 font-normal">
                          (₹{(selectedPaygAmount * USD_TO_INR_RATE).toLocaleString()})
                        </span>
                      </div>
                    </div>
                    <div className="text-xs font-mono text-emerald-400 flex items-center gap-1.5 self-start sm:self-auto">
                      <Check size={14} />
                      <span>Adds +${selectedPaygAmount}.00 PAYG developer compute</span>
                    </div>
                  </div>

                  {/* Payment Methods for selected box */}
                  <div className="space-y-2">
                    <span className="text-xs font-mono text-zinc-400 block">
                      Choose Payment Method:
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Whop Card / PayPal / Crypto Button */}
                      {selectedPaygAmount === 10 ? (
                        <a
                          href={`${WHOP_10_CREDITS_CHECKOUT_URL}${user?.email ? `?email=${encodeURIComponent(user.email)}` : ""}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-3 rounded-xl border border-orange-500/40 bg-gradient-to-r from-orange-950/40 to-amber-950/30 hover:border-orange-500/80 text-white font-mono text-xs font-bold flex items-center justify-between transition-all group shadow-lg shadow-orange-950/30"
                        >
                          <div className="flex items-center gap-2">
                            <CreditCard size={16} className="text-orange-400 shrink-0" />
                            <div className="text-left">
                              <div>Card, Apple/Google Pay, PayPal & Crypto</div>
                              <div className="text-[10px] text-orange-300 font-normal">via Whop 1-Click Checkout</div>
                            </div>
                          </div>
                          <ExternalLink size={13} className="text-orange-400 group-hover:translate-x-0.5 transition-transform" />
                        </a>
                      ) : (
                        <div className="p-3 rounded-xl border border-white/5 bg-white/[0.02] text-zinc-500 font-mono text-xs flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CreditCard size={15} />
                            <span>Card/PayPal/Crypto ($10 active)</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedPaygAmount(10)}
                            className="text-[10px] text-orange-400 hover:underline"
                          >
                            Switch to $10
                          </button>
                        </div>
                      )}

                      {/* Domestic UPI */}
                      <button
                        type="button"
                        onClick={() => handleSelectPaygMethod("upi", selectedPaygAmount)}
                        className="p-3 rounded-xl border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/30 text-white font-mono text-xs font-bold flex items-center justify-between transition-all cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <Smartphone size={16} className="text-zinc-300 shrink-0" />
                          <div className="text-left">
                            <div>Domestic UPI</div>
                            <div className="text-[10px] text-zinc-400 font-normal">₹{(selectedPaygAmount * USD_TO_INR_RATE).toLocaleString()} · Zero fee QR</div>
                          </div>
                        </div>
                        <ArrowRight size={13} className="text-zinc-400" />
                      </button>

                      {/* Solana Pay */}
                      <button
                        type="button"
                        onClick={() => handleSelectPaygMethod("crypto", selectedPaygAmount)}
                        className="p-3 rounded-xl border border-purple-500/30 bg-purple-950/20 hover:bg-purple-950/40 hover:border-purple-500/60 text-white font-mono text-xs font-bold flex items-center justify-between transition-all cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <Wallet size={16} className="text-purple-400 shrink-0" />
                          <div className="text-left">
                            <div>Solana Pay</div>
                            <div className="text-[10px] text-purple-300 font-normal">${selectedPaygAmount} SOL / USDC</div>
                          </div>
                        </div>
                        <ArrowRight size={13} className="text-purple-400" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

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
          onSuccess={handleCheckoutSuccess}
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
    </div>
  );
}
export default DashboardPricingSection;
