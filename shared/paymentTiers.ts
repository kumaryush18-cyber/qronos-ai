export const USD_TO_INR_RATE = 96; // 1 USD = 96 INR benchmark conversion
export const UPI_INTERNAL_SURCHARGE_USD = 1; // +$1 USD surcharge applied internally on UPI scan only
export const UPI_INTERNAL_SURCHARGE_INR = UPI_INTERNAL_SURCHARGE_USD * USD_TO_INR_RATE; // ₹96

export interface UPITier {
  id: string;
  name: string;
  amountUsd: number; // Displayed plan price ($10, $25, $50)
  amountInr: number; // Displayed INR equivalent (₹960, ₹2,400, ₹4,800)
  scanAmountUsd: number; // Scanned equivalent with internal +$1 USD ($11, $26, $51)
  scanAmountInr: number; // Scanned amount in INR (₹1,056, ₹2,496, ₹4,896)
  credits: number;
  creditsNanos: number;
  popular?: boolean;
  description: string;
}

export interface CryptoTier {
  id: string;
  name: string;
  usd: number;
  credits: number;
  creditsNanos: number;
  popular?: boolean;
}

export const UPI_TIERS: UPITier[] = [
  {
    id: "inr_starter",
    name: "$10 Top-up",
    amountUsd: 10,
    amountInr: 960,
    scanAmountUsd: 11,
    scanAmountInr: 1056,
    credits: 3000,
    creditsNanos: 3000 * 1_000_000_000,
    description: "Light prototyping & API scripts ($10 deposit · ₹960)",
  },
  {
    id: "inr_topup_15",
    name: "$15 Top-up",
    amountUsd: 15,
    amountInr: 1440,
    scanAmountUsd: 16,
    scanAmountInr: 1536,
    credits: 4800,
    creditsNanos: 4800 * 1_000_000_000,
    description: "Personal projects & tests ($15 deposit · ₹1,440)",
  },
  {
    id: "inr_topup_20",
    name: "$20 Top-up",
    amountUsd: 20,
    amountInr: 1920,
    scanAmountUsd: 21,
    scanAmountInr: 2016,
    credits: 6600,
    creditsNanos: 6600 * 1_000_000_000,
    description: "Standard developer usage ($20 deposit · ₹1,920)",
  },
  {
    id: "inr_developer",
    name: "$25 Top-up",
    amountUsd: 25,
    amountInr: 2400,
    scanAmountUsd: 26,
    scanAmountInr: 2496,
    credits: 8500,
    creditsNanos: 8500 * 1_000_000_000,
    popular: true,
    description: "Most popular for active builders & agents ($25 deposit · ₹2,400)",
  },
  {
    id: "inr_topup_30",
    name: "$30 Top-up",
    amountUsd: 30,
    amountInr: 2880,
    scanAmountUsd: 31,
    scanAmountInr: 2976,
    credits: 10500,
    creditsNanos: 10500 * 1_000_000_000,
    description: "Engineering sprints & testing ($30 deposit · ₹2,880)",
  },
  {
    id: "inr_power",
    name: "$50 Top-up",
    amountUsd: 50,
    amountInr: 4800,
    scanAmountUsd: 51,
    scanAmountInr: 4896,
    credits: 18000,
    creditsNanos: 18000 * 1_000_000_000,
    description: "Heavy inference & agent loops ($50 deposit · ₹4,800)",
  },
  {
    id: "inr_power_100",
    name: "$100 Top-up",
    amountUsd: 100,
    amountInr: 9600,
    scanAmountUsd: 101,
    scanAmountInr: 9696,
    credits: 40000,
    creditsNanos: 40000 * 1_000_000_000,
    description: "Multi-agent pipelines & continuous workloads ($100 deposit · ₹9,600)",
  },
  {
    id: "inr_topup_150",
    name: "$150 Top-up",
    amountUsd: 150,
    amountInr: 14400,
    scanAmountUsd: 151,
    scanAmountInr: 14496,
    credits: 65000,
    creditsNanos: 65000 * 1_000_000_000,
    description: "High concurrency & team workflows ($150 deposit · ₹14,400)",
  },
  {
    id: "inr_ultra_200",
    name: "$200 Top-up",
    amountUsd: 200,
    amountInr: 19200,
    scanAmountUsd: 201,
    scanAmountInr: 19296,
    credits: 100000,
    creditsNanos: 100000 * 1_000_000_000,
    description: "Maximum enterprise throughput ($200 deposit · ₹19,200)",
  },
];

export const CRYPTO_TIERS: CryptoTier[] = [
  { id: "crypto_10", name: "$10 Top-up", usd: 10, credits: 3000, creditsNanos: 3000 * 1_000_000_000 },
  { id: "crypto_15", name: "$15 Top-up", usd: 15, credits: 4800, creditsNanos: 4800 * 1_000_000_000 },
  { id: "crypto_20", name: "$20 Top-up", usd: 20, credits: 6600, creditsNanos: 6600 * 1_000_000_000 },
  { id: "crypto_25", name: "$25 Top-up", usd: 25, credits: 8500, creditsNanos: 8500 * 1_000_000_000, popular: true },
  { id: "crypto_30", name: "$30 Top-up", usd: 30, credits: 10500, creditsNanos: 10500 * 1_000_000_000 },
  { id: "crypto_50", name: "$50 Top-up", usd: 50, credits: 18000, creditsNanos: 18000 * 1_000_000_000 },
  { id: "crypto_100", name: "$100 Top-up", usd: 100, credits: 40000, creditsNanos: 40000 * 1_000_000_000 },
  { id: "crypto_150", name: "$150 Top-up", usd: 150, credits: 6500, creditsNanos: 65000 * 1_000_000_000 },
  { id: "crypto_200", name: "$200 Top-up", usd: 200, credits: 100000, creditsNanos: 100000 * 1_000_000_000 },
];

export const PAYG_TOPUP_AMOUNTS = [10, 15, 20, 25, 30, 50, 100, 150, 200] as const;
export type PaygTopupAmount = (typeof PAYG_TOPUP_AMOUNTS)[number];

export const WHOP_10_CREDITS_CHECKOUT_URL = "https://whop.com/qronos/10-credits-a922/";

export interface PaygTopupOption {
  amountUsd: number;
  amountInr: number;
  scanAmountUsd: number;
  scanAmountInr: number;
  popular?: boolean;
  whopLink?: string;
  label: string;
}

export const PAYG_TOPUP_OPTIONS: PaygTopupOption[] = [
  {
    amountUsd: 10,
    amountInr: 960,
    scanAmountUsd: 11,
    scanAmountInr: 1056,
    whopLink: WHOP_10_CREDITS_CHECKOUT_URL,
    label: "$10",
  },
  {
    amountUsd: 15,
    amountInr: 1440,
    scanAmountUsd: 16,
    scanAmountInr: 1536,
    label: "$15",
  },
  {
    amountUsd: 20,
    amountInr: 1920,
    scanAmountUsd: 21,
    scanAmountInr: 2016,
    label: "$20",
  },
  {
    amountUsd: 25,
    amountInr: 2400,
    scanAmountUsd: 26,
    scanAmountInr: 2496,
    popular: true,
    label: "$25",
  },
  {
    amountUsd: 30,
    amountInr: 2880,
    scanAmountUsd: 31,
    scanAmountInr: 2976,
    label: "$30",
  },
  {
    amountUsd: 50,
    amountInr: 4800,
    scanAmountUsd: 51,
    scanAmountInr: 4896,
    label: "$50",
  },
  {
    amountUsd: 100,
    amountInr: 9600,
    scanAmountUsd: 101,
    scanAmountInr: 9696,
    label: "$100",
  },
  {
    amountUsd: 150,
    amountInr: 14400,
    scanAmountUsd: 151,
    scanAmountInr: 14496,
    label: "$150",
  },
  {
    amountUsd: 200,
    amountInr: 19200,
    scanAmountUsd: 201,
    scanAmountInr: 19296,
    label: "$200",
  },
];

export interface TokenPlanTier {
  id: string;
  name: string;
  tokens: number;
  tokensMillions: number;
  originalTokensMillions?: number;
  offerMultiplier?: string;
  amountUsd: number;
  amountInr: number;
  scanAmountUsd: number;
  scanAmountInr: number;
  popular?: boolean;
  badge?: string;
  description: string;
  features: string[];
}

export type CodingPlanTier = TokenPlanTier;

export const TOKEN_PLAN_TIERS: TokenPlanTier[] = [
  {
    id: "token_free",
    name: "Free",
    tokens: 10_000_000,
    tokensMillions: 10,
    amountUsd: 0,
    amountInr: 0,
    scanAmountUsd: 0,
    scanAmountInr: 0,
    badge: "STARTER",
    description: "10 Million starter tokens · Explore open routes & daily check-in rewards",
    features: [
      "10 Million starter tokens",
      "Access to verified open-weights & GLM",
      "Daily UTC check-in rewards (Up to $0.10)",
      "Standard token throughput",
      "Community support on Discord",
      "Zero credit card required",
    ],
  },
  {
    id: "token_plus_15",
    name: "Plus",
    tokens: 600_000_000,
    tokensMillions: 600,
    amountUsd: 10,
    amountInr: 960,
    scanAmountUsd: 11,
    scanAmountInr: 1056,
    badge: "POPULAR",
    description: "600 Million tokens · 60M tokens / $1 · Ideal for scripts, tools & prototyping",
    features: [
      "600 Million tokens dedicated quota",
      "Claude Opus 5, Sonnet 4.6 & 3.7",
      "GLM 5.3, Qwen 3.8 Max, DeepSeek V4 Pro",
      "Full tool-use & multi-file context",
      "Tokens never expire while active",
      "Sub-8ms automatic key failover",
    ],
  },
  {
    id: "coding_starter_30",
    name: "Pro",
    tokens: 2_200_000_000,
    tokensMillions: 2200,
    amountUsd: 30,
    amountInr: 2880,
    scanAmountUsd: 31,
    scanAmountInr: 2976,
    popular: true,
    badge: "RECOMMENDED",
    description: "2.2 Billion tokens · 73.3M tokens / $1 · Production engineering and autonomous agents",
    features: [
      "2.2 Billion tokens dedicated quota",
      "Claude Opus 5, Sonnet 4.6 & 3.7",
      "GLM 5.3, Qwen 3.8 Max, DeepSeek V4 Pro",
      "GPT-6 Astra & Kimi K3 Coder",
      "Full tool-use & multi-file context",
      "Zero monthly expiry while account active",
    ],
  },
  {
    id: "coding_power_60",
    name: "Ultra",
    tokens: 5_000_000_000,
    tokensMillions: 5000,
    amountUsd: 60,
    amountInr: 5760,
    scanAmountUsd: 61,
    scanAmountInr: 5856,
    popular: false,
    badge: "HIGH COMPUTE",
    description: "5.0 Billion tokens · 83.3M tokens / $1 · High-throughput teams, multi-agent loops & CI pipelines",
    features: [
      "5.0 Billion tokens dedicated quota",
      "Maximum concurrency allocation",
      "VIP upstream failover routing",
      "Multi-agent swarm continuous runs",
      "Team-wide API key sharing support",
      "Zero rate limit throttling",
    ],
  },
  {
    id: "coding_ultra_150",
    name: "Enterprise",
    tokens: 14_000_000_000,
    tokensMillions: 14000,
    amountUsd: 150,
    amountInr: 14400,
    scanAmountUsd: 151,
    scanAmountInr: 14496,
    popular: false,
    badge: "ENTERPRISE",
    description: "14.0 Billion tokens · 93.3M tokens / $1 · Maximum compute capacity for enterprises",
    features: [
      "14.0 Billion tokens dedicated quota",
      "Maximum cluster priority & bandwidth",
      "Enterprise SLA & dedicated support",
      "Continuous autonomous agents",
      "Unlimited prompt caching support",
      "Custom SLA & private gateway endpoints",
    ],
  },
];

export const CODING_PLAN_TIERS: TokenPlanTier[] = TOKEN_PLAN_TIERS;

export function getCodingPlanTier(idOrUsd: string | number): TokenPlanTier | undefined {
  if (typeof idOrUsd === "number") {
    return TOKEN_PLAN_TIERS.find(
      (t) => t.amountUsd === idOrUsd || t.tokensMillions === idOrUsd || t.originalTokensMillions === idOrUsd
    );
  }
  const clean = String(idOrUsd || "").trim().toLowerCase();
  return (
    TOKEN_PLAN_TIERS.find(
      (t) =>
        t.id.toLowerCase() === clean ||
        t.name.toLowerCase() === clean ||
        String(t.amountUsd) === clean ||
        String(t.tokensMillions) === clean
    ) ||
    (clean.includes("15") ? TOKEN_PLAN_TIERS.find((t) => t.amountUsd === 15) : undefined) ||
    (clean.includes("30") ? TOKEN_PLAN_TIERS.find((t) => t.amountUsd === 30) : undefined) ||
    (clean.includes("60") ? TOKEN_PLAN_TIERS.find((t) => t.amountUsd === 60) : undefined) ||
    (clean.includes("150") ? TOKEN_PLAN_TIERS.find((t) => t.amountUsd === 150) : undefined) ||
    (clean.includes("25") ? TOKEN_PLAN_TIERS.find((t) => t.amountUsd === 15) : undefined) ||
    (clean.includes("50") ? TOKEN_PLAN_TIERS.find((t) => t.amountUsd === 30) : undefined) ||
    (clean.includes("80") ? TOKEN_PLAN_TIERS.find((t) => t.amountUsd === 60) : undefined)
  );
}

export const getTokenPlanTier = getCodingPlanTier;

