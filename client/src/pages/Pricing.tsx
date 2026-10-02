import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useEffect } from "react";
import { PublicNav } from "@/components/PublicNav";
import { PublicFooter } from "./Models";
import { ModernPricingPage, type PricingCardProps } from "@/components/ui/animated-glassy-pricing";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CheckoutModal } from "@/components/CheckoutModal";
import { PaygPaymentModal } from "@/components/PaygPaymentModal";
import { ModelPricingTable } from "@/components/ModelPricingTable";
import { ShieldCheck, Smartphone, Wallet, Zap, Sparkles, CreditCard, Loader2, ArrowRight, Percent, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function Pricing() {
  const [pricingTier, setPricingTier] = useState<"payg" | "bundles">("payg");
  const [activeRail, setActiveRail] = useState<"card" | "upi" | "crypto">("upi");
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isPaygModalOpen, setIsPaygModalOpen] = useState(false);
  const [authAlertOpen, setAuthAlertOpen] = useState(false);
  const { user } = useAuth();
  const userEmail = (user?.email ?? "").trim().toLowerCase();
  const isWhitelistedUser = userEmail === "konchoor@gmail.com" || userEmail === "kumaryush18@gmail.com";
  const creditsEnabled = isWhitelistedUser || Boolean((user as any)?.creditsEnabled);
  const [selectedRailForModal, setSelectedRailForModal] = useState<"crypto" | "upi" | "card">("upi");
  const [selectedAmountUsd, setSelectedAmountUsd] = useState<number>(25);
  const [isCheckoutPayg, setIsCheckoutPayg] = useState(false);
  const [dodoLoadingPlan, setDodoLoadingPlan] = useState<string | null>(null);
  const [dodoProducts, setDodoProducts] = useState<{ starter: string; pro: string; max: string; power: string; ultra: string }>({
    starter: "",
    pro: "",
    max: "",
    power: "",
    ultra: "",
  });

  useEffect(() => {
    if (!creditsEnabled && pricingTier === "bundles") {
      setPricingTier("payg");
    }
  }, [creditsEnabled, pricingTier]);

  useEffect(() => {
    fetch("/api/payments/dodo/config")
      .then((res) => res.json())
      .then((data) => {
        if (data?.products) {
          setDodoProducts({
            starter: data.products.starter || "",
            pro: data.products.pro || "",
            max: data.products.max || "",
            power: data.products.power || "",
            ultra: data.products.ultra || "",
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleDodoCheckout = async (_planKey: "starter" | "pro" | "max" | "power" | "ultra") => {
    toast.error("Card payments are temporarily under maintenance. Please use Domestic UPI or Solana Pay.");
    if (!user) {
      setAuthAlertOpen(true);
      return;
    }
    setSelectedRailForModal("upi");
    setIsCheckoutOpen(true);
  };

  const openCheckout = (rail: "card" | "upi" | "crypto", amount: number) => {
    if (!user) { setAuthAlertOpen(true); return; }
    setSelectedRailForModal(rail);
    setSelectedAmountUsd(amount);
    setIsCheckoutPayg(false);
    setIsCheckoutOpen(true);
  };

  const handleSelectPaygMethod = (method: "card" | "upi" | "crypto", amountUsd: number) => {
    setIsPaygModalOpen(false);
    if (!user) {
      setAuthAlertOpen(true);
      return;
    }
    setSelectedRailForModal(method);
    setSelectedAmountUsd(amountUsd);
    setIsCheckoutPayg(true);
    setIsCheckoutOpen(true);
  };

  // Card Payments Plans (Global Visa, Mastercard, Apple Pay, Google Pay) - UNDER MAINTENANCE
  const cardPricingPlans: PricingCardProps[] = [
    {
      planName: "Starter Developer",
      description: "Ideal for light prototyping, personal scripts, and integration testing.",
      price: "10",
      period: "month",
      currencySymbol: "$",
      features: [
        "3,000 API Compute Units",
        "Full Claude & OpenAI compatibility",
        "Visa, Mastercard, Amex & Apple Pay",
        "Status: Temporarily Under Maintenance",
        "Please use Domestic UPI or Solana Pay",
      ],
      buttonText: "Under Maintenance",
      buttonVariant: "secondary",
      onSelect: () => handleDodoCheckout("starter"),
    },
    {
      planName: "Pro Developer",
      description: "Most popular for active builders, long-context reasoning, and automated agents.",
      price: "25",
      period: "month",
      currencySymbol: "$",
      features: [
        "8,500 API Compute Units (Best Value)",
        "Priority routing & intelligent circuit breakers",
        "Sub-10ms edge proxy & latency optimization",
        "Status: Temporarily Under Maintenance",
        "Please use Domestic UPI or Solana Pay",
      ],
      buttonText: "Under Maintenance",
      isPopular: false,
      buttonVariant: "secondary",
      onSelect: () => handleDodoCheckout("pro"),
    },
    {
      planName: "Max Team",
      description: "Enterprise scale inference for high-demand clusters and engineering teams.",
      price: "50",
      period: "month",
      currencySymbol: "$",
      features: [
        "18,000 API Compute Units",
        "High-throughput concurrency buffers",
        "Dedicated multi-provider failover routing",
        "Status: Temporarily Under Maintenance",
        "Please use Domestic UPI or Solana Pay",
      ],
      buttonText: "Under Maintenance",
      buttonVariant: "secondary",
      onSelect: () => handleDodoCheckout("max"),
    },
    {
      planName: "Power Team",
      description: "Heavy reasoning pipelines, continuous multi-agent clusters, and high throughput.",
      price: "100",
      period: "month",
      currencySymbol: "$",
      features: [
        "40,000 API Compute Units",
        "Maximum parallel stream concurrency",
        "Dedicated rate multiplier buffers",
        "Status: Temporarily Under Maintenance",
        "Please use Domestic UPI or Solana Pay",
      ],
      buttonText: "Under Maintenance",
      buttonVariant: "secondary",
      onSelect: () => handleDodoCheckout("power"),
    },
    {
      planName: "Ultra Enterprise",
      description: "Maximum enterprise throughput, autonomous swarms, and dedicated compute allocation.",
      price: "200",
      period: "month",
      currencySymbol: "$",
      features: [
        "100,000 API Compute Units",
        "Maximum allocation queue priority",
        "Full TokenForge model routing matrix",
        "Status: Temporarily Under Maintenance",
        "Please use Domestic UPI or Solana Pay",
      ],
      buttonText: "Under Maintenance",
      buttonVariant: "secondary",
      onSelect: () => handleDodoCheckout("ultra"),
    },
  ];

  // UPI Plans (Converted Dollar to INR Direct Rail)
  const upiPricingPlans: PricingCardProps[] = [
    {
      planName: "Starter Developer",
      description: "Ideal for light prototyping, personal scripts, and integration testing.",
      price: "10",
      period: "month",
      currencySymbol: "$",
      features: [
        "3,000 API Compute Units",
        "Anthropic & OpenAI compatible REST API",
        "Direct UPI Instant Top-Up (GPay, PhonePe, Paytm)",
        "Zero payment gateway processing deductions",
        "Standard Rate Limit Quotas",
      ],
      buttonText: "Top Up $10 via UPI",
      buttonVariant: "secondary",
      onSelect: () => openCheckout("upi", 10),
    },
    {
      planName: "Pro Developer",
      description: "Most popular for active builders, long-context reasoning, and automated agents.",
      price: "25",
      period: "month",
      currencySymbol: "$",
      features: [
        "8,500 API Compute Units (Best Value)",
        "Priority routing through healthy provider pools",
        "Instant UTR Verification & auto-credit ledger",
        "High availability multi-model catalogue",
        "Continuous failover & circuit breaker protection",
      ],
      buttonText: "Top Up $25 via UPI",
      isPopular: true,
      buttonVariant: "primary",
      onSelect: () => openCheckout("upi", 25),
    },
    {
      planName: "Max Team",
      description: "Enterprise scale inference for high-demand clusters and engineering teams.",
      price: "50",
      period: "month",
      currencySymbol: "$",
      features: [
        "18,000 API Compute Units",
        "Dedicated rate multiplier buffers & priority compute",
        "Unified telemetry & usage observability",
        "Instant UTR Verification & zero gateway deductions",
        "High-concurrency parallel stream dispatch",
        "Standby failover cluster included",
      ],
      buttonText: "Top Up $50 via UPI",
      buttonVariant: "secondary",
      onSelect: () => openCheckout("upi", 50),
    },
    {
      planName: "Power Team",
      description: "Heavy reasoning pipelines and continuous multi-agent clusters (~₹9,600).",
      price: "100",
      period: "month",
      currencySymbol: "$",
      features: [
        "40,000 API Compute Units",
        "Uncapped concurrency and request throughput",
        "Zero payment processing fees",
        "Instant automated UTR verification",
        "Uncapped concurrency limit",
        "Compute allowance never expires",
      ],
      buttonText: "Top Up $100 via UPI",
      buttonVariant: "secondary",
      onSelect: () => openCheckout("upi", 100),
    },
    {
      planName: "Ultra Enterprise",
      description: "Maximum enterprise throughput and dedicated compute allocation (~₹19,200).",
      price: "200",
      period: "month",
      currencySymbol: "$",
      features: [
        "100,000 API Compute Units",
        "Maximum allocation queue priority",
        "Full TokenForge model routing matrix",
        "Zero gateway deduction (100% allocation)",
        "Dedicated VIP developer support",
        "Compute allowance never expires",
      ],
      buttonText: "Top Up $200 via UPI",
      buttonVariant: "secondary",
      onSelect: () => openCheckout("upi", 200),
    },
  ];

  // Crypto / Solana Pay Plans (Global Non-Custodial Rail)
  const cryptoPricingPlans: PricingCardProps[] = [
    {
      planName: "Starter Developer",
      description: "Perfect for global on-chain top-ups with Solana micro-fees.",
      price: "10",
      period: "month",
      currencySymbol: "$",
      features: [
        "3,000 API Compute Units",
        "Instant Solana Pay QR Code settlement",
        "Full Messages API & streaming playground",
        "Supports Phantom, Solflare, Backpack",
        "Sub-second on-chain blockchain confirmation",
        "Developer API key management",
      ],
      buttonText: "Pay $10 with Solana",
      buttonVariant: "secondary",
      onSelect: () => openCheckout("crypto", 10),
    },
    {
      planName: "Pro Developer",
      description: "Engineered for AI engineers, autonomous agents, and production traffic.",
      price: "25",
      period: "month",
      currencySymbol: "$",
      features: [
        "8,500 API Compute Units",
        "Intelligent provider routing & health probes",
        "Automated on-chain transaction reference validation",
        "Zero chargebacks & zero intermediary delay",
        "Auto-failover to standby model clusters",
        "Uncapped tokens/sec inference routing",
      ],
      buttonText: "Pay $25 with Solana",
      isPopular: true,
      buttonVariant: "primary",
      onSelect: () => openCheckout("crypto", 25),
    },
    {
      planName: "Max Team",
      description: "Enterprise scale inference for high-demand clusters and production agents.",
      price: "50",
      period: "month",
      currencySymbol: "$",
      features: [
        "18,000 API Compute Units",
        "Maximum tier throughput & pool priority",
        "Custom provider routing overrides",
        "Multi-wallet corporate accounting",
        "Direct telemetry & slot-level performance stats",
        "Dedicated circuit breakers",
      ],
      buttonText: "Pay $50 with Solana",
      buttonVariant: "secondary",
      onSelect: () => openCheckout("crypto", 50),
    },
    {
      planName: "Power Team",
      description: "Heavy reasoning pipelines and continuous multi-agent clusters.",
      price: "100",
      period: "month",
      currencySymbol: "$",
      features: [
        "40,000 API Compute Units",
        "High concurrency parallel stream dispatch",
        "Sub-second on-chain settlement",
        "Automated fallback failover circuit",
        "Compute allowance never expires",
      ],
      buttonText: "Pay $100 with Solana",
      buttonVariant: "secondary",
      onSelect: () => openCheckout("crypto", 100),
    },
    {
      planName: "Ultra Enterprise",
      description: "Maximum throughput tier for high-throughput enterprise workloads.",
      price: "200",
      period: "month",
      currencySymbol: "$",
      features: [
        "100,000 API Compute Units",
        "Maximum allocation queue priority",
        "Full TokenForge model routing matrix",
        "Zero platform markup on base compute",
        "Direct developer channel support",
        "Compute allowance never expires",
      ],
      buttonText: "Pay $200 with Solana",
      buttonVariant: "secondary",
      onSelect: () => openCheckout("crypto", 200),
    },
  ];

  const currentPlans =
    activeRail === "card"
      ? cardPricingPlans
      : activeRail === "upi"
      ? upiPricingPlans
      : cryptoPricingPlans;

  return (
    <div className="min-h-screen bg-[#09090b] text-slate-100 flex flex-col selection:bg-rose-500/30 selection:text-rose-200">
      <div className="relative z-30">
        <PublicNav />
      </div>

      <main className="flex-1 relative">
        <ModernPricingPage
          title={
            <>
              {pricingTier === "payg" ? (
                <>
                  Pay As You Go with <span className="text-rose-400">100% Bonus Credit</span>
                </>
              ) : (
                <>
                  Find the <span className="text-rose-400">Perfect Plan</span> for Your Workload
                </>
              )}
            </>
          }
          subtitle={
            pricingTier === "payg"
              ? "Fund your developer compute balance on demand. Every top-up receives an instant +100% capacity grant (2x usable quota) with transparent metering and sub-second failover routing."
              : "Prepaid API compute subscription packages with instant quota allocation and high-throughput routing. Direct settlement across Card, UPI, and Solana."
          }
          plans={pricingTier === "bundles" ? currentPlans : []}
          showAnimatedBackground={true}
          contentAfterPlans={
            pricingTier === "payg" ? (
              <div className="w-full flex flex-col items-center">
                {/* Dedicated Pay-As-You-Go Plan Card */}
                <div className="w-full max-w-2xl mx-auto px-4 mb-4">
                  <div className="relative backdrop-blur-[20px] bg-gradient-to-br from-white/10 via-black/50 to-black/40 border-2 border-rose-500/40 rounded-3xl p-7 sm:p-9 shadow-2xl shadow-rose-950/40 overflow-hidden">
                    {/* Glow Highlight */}
                    <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 bg-rose-500/20 rounded-full blur-3xl pointer-events-none" />

                    {/* Top Badges */}
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-500 text-white shadow-lg shadow-rose-500/30">
                        <Sparkles className="w-3.5 h-3.5" />
                        +100% Compute Bonus (2x Quota)
                      </div>
                      <span className="text-xs font-mono text-emerald-400 font-semibold flex items-center gap-1">
                        <Percent className="w-3.5 h-3.5" />
                        Official Provider Rates
                      </span>
                    </div>

                    {/* Card Title & Description */}
                    <div className="mb-6">
                      <span className="text-xs uppercase tracking-widest text-slate-400 font-semibold block">
                        Tier 1 • Developer On-Demand
                      </span>
                      <h2 className="text-3xl sm:text-4xl font-extralight text-white font-display mt-1">
                        Pay-As-You-Go Plan
                      </h2>
                      <p className="text-sm text-slate-300 mt-2 leading-relaxed">
                        Fund your developer balance on demand. Every top-up receives an unconditional 100% bonus compute allocation (deposit $50 → get $100 usable quota) while inference requests are billed at transparent rates.
                      </p>
                    </div>

                    {/* Rate Display Callout */}
                    <div className="p-4 rounded-2xl bg-black/50 border border-white/10 mb-6 flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <span className="text-xs text-slate-400 block uppercase font-medium">Recharge Bonus</span>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <span className="text-3xl sm:text-4xl font-extralight text-rose-400 font-display">
                            +100% BONUS
                          </span>
                          <span className="text-xs text-slate-400 font-sans">2x Usable Quota</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-slate-400 block uppercase font-medium">Model Rates</span>
                        <span className="text-2xl font-light text-emerald-400 font-display">Official Rates</span>
                        <span className="text-xs text-slate-400 block">Zero platform markup</span>
                      </div>
                    </div>

                    {/* Feature Checklist */}
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8 text-xs text-slate-200">
                      <li className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <span>Instant 100% bonus compute grant on every recharge (2x quota)</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <span>Pay strictly for consumed tokens at official provider rates</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <span>Compute balance never expires; top up on your schedule</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <span>Unthrottled tokens/sec with automated failover routing</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <span>Instant support for Solana, UPI, and Global Cards</span>
                      </li>
                      <li className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <span>Sub-second automated ledger settlement</span>
                      </li>
                    </ul>

                    {/* Proceed Button */}
                    <button
                      type="button"
                      onClick={() => {
                        if (!user) {
                          setAuthAlertOpen(true);
                          return;
                        }
                        setIsPaygModalOpen(true);
                      }}
                      className="w-full py-4 rounded-xl font-bold text-sm bg-gradient-to-r from-rose-500 via-rose-600 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white shadow-xl shadow-rose-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer group active:scale-[0.99]"
                    >
                      <span>Proceed to Payment</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                    <p className="text-[11px] text-center text-slate-400 mt-2.5">
                      Select between Solana Pay, Domestic UPI, or Card Payment in the next step.
                    </p>
                  </div>
                </div>

                {/* Model Pricing Comparison Table */}
                <ModelPricingTable onOpenTopUpModal={() => {
                  if (!user) {
                    setAuthAlertOpen(true);
                    return;
                  }
                  setIsPaygModalOpen(true);
                }} />
              </div>
            ) : null
          }
        >
          {/* Top-Level Controls */}
          <div className="flex flex-col items-center gap-5 w-full">
            {/* Two-Tier Switcher */}
            {creditsEnabled && (
              <div className="inline-flex items-center p-1.5 rounded-2xl bg-black/60 border border-white/15 backdrop-blur-2xl shadow-2xl gap-2">
                <button
                  type="button"
                  onClick={() => setPricingTier("payg")}
                  className={`flex items-center gap-2.5 px-6 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 cursor-pointer ${
                    pricingTier === "payg"
                      ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-500/30 font-semibold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <span>Tier 1: Pay-As-You-Go</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-white/20 text-white">
                    +100% Bonus (2x)
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPricingTier("bundles")}
                  className={`flex items-center gap-2.5 px-6 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 cursor-pointer ${
                    pricingTier === "bundles"
                      ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-500/30 font-semibold"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <span>Tier 2: Compute Packages</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                    Fixed Packages
                  </span>
                </button>
              </div>
            )}

            {/* Rail Selector Switcher (Shown only for Tier 2 Bundles) */}
            {pricingTier === "bundles" && (
              <div className="flex flex-col items-center gap-3">
                <div className="flex flex-wrap items-center justify-center p-1.5 rounded-2xl bg-black/40 border border-white/10 backdrop-blur-xl shadow-xl gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveRail("card")}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 cursor-pointer ${
                      activeRail === "card"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <CreditCard size={16} className={activeRail === "card" ? "text-amber-400" : "text-slate-400"} />
                    <span>Card Payment</span>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                      Maintenance
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveRail("upi")}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 cursor-pointer ${
                      activeRail === "upi"
                        ? "bg-rose-500 text-white shadow-lg shadow-rose-500/30 font-semibold"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Smartphone size={16} />
                    <span>Domestic UPI (₹ INR)</span>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-black/30 font-bold text-emerald-300">
                      Active · Zero Fees
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveRail("crypto")}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 cursor-pointer ${
                      activeRail === "crypto"
                        ? "bg-rose-500 text-white shadow-lg shadow-rose-500/30 font-semibold"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Wallet size={16} />
                    <span>Solana Pay (Global SOL)</span>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-black/30 font-bold text-purple-300">
                      Active · On-Chain
                    </span>
                  </button>
                </div>
                <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1">
                  <Zap size={13} className="text-rose-400" />
                  <span>
                    {activeRail === "card"
                      ? "Card processing is temporarily offline for upgrades. Please use Domestic UPI or Solana Pay."
                      : activeRail === "upi"
                      ? "Direct settlement to merchant UPI ID with instant UTR verification."
                      : "Decentralized on-chain transfer via Solana Pay with immediate ledger credit."}
                  </span>
                </p>
              </div>
            )}
          </div>
        </ModernPricingPage>

        {/* Informational Protection Card */}
        <div className="relative z-10 w-full max-w-4xl mx-auto px-4 pb-16">
          <div className="p-5 rounded-2xl bg-black/30 border border-white/10 backdrop-blur-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-left">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-6 w-6 text-rose-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-white">Verified Enterprise Upstream Quotas</p>
                <p className="text-slate-300 text-xs mt-0.5">
                  Inference executes against verified clusters (Claude Opus 5, GLM-5.3, DeepSeek V4). Purchased credits never expire.
                </p>
              </div>
            </div>
            <Link
              href="/legal/acceptable-use"
              className="shrink-0 text-xs font-medium text-rose-400 hover:text-rose-300 hover:underline inline-flex items-center gap-1"
            >
              Read Acceptable Use &rarr;
            </Link>
          </div>
        </div>
      </main>

      <AlertDialog open={authAlertOpen} onOpenChange={setAuthAlertOpen}>
        <AlertDialogContent className="bg-[#09090b] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Authentication Required</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Please sign in to your account first to proceed with the payment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-white/10 hover:bg-white/5 text-white">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => window.location.href = "/signin"} className="bg-[#befe6c] text-black hover:bg-[#befe6c]/90">
              Sign In
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* PAYG Payment Rail Selection Modal */}
      <PaygPaymentModal
        isOpen={isPaygModalOpen}
        onClose={() => setIsPaygModalOpen(false)}
        onSelectPaymentMethod={handleSelectPaygMethod}
        initialAmountUsd={selectedAmountUsd}
      />

      {/* Direct Settlement Checkout Modal for Card, UPI and Solana */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        initialRail={selectedRailForModal}
        initialPackageUsd={selectedAmountUsd}
        isPayg={isCheckoutPayg}
        userId={user?.id}
      />

      <div className="relative z-30">
        <PublicFooter />
      </div>
    </div>
  );
}
