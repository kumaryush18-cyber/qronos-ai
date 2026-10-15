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
    name: "Starter",
    amountUsd: 10,
    amountInr: 960, // $10 * 96 displayed above
    scanAmountUsd: 11, // $10 + $1 scanned internally
    scanAmountInr: 1056, // 11 * 96 = ₹1,056 charged on scan
    credits: 3000,
    creditsNanos: 3000 * 1_000_000_000,
    description: "Ideal for light prototyping and personal scripts ($10/mo · ₹960)",
  },
  {
    id: "inr_developer",
    name: "Pro Plan",
    amountUsd: 25,
    amountInr: 2400, // $25 * 96 displayed above
    scanAmountUsd: 26, // $25 + $1 scanned internally
    scanAmountInr: 2496, // 26 * 96 = ₹2,496 charged on scan
    credits: 8500,
    creditsNanos: 8500 * 1_000_000_000,
    popular: true,
    description: "Most popular for active builders and automated agents ($25/mo · ₹2,400)",
  },
  {
    id: "inr_power",
    name: "Max Plan",
    amountUsd: 50,
    amountInr: 4800, // $50 * 96 displayed above
    scanAmountUsd: 51, // $50 + $1 scanned internally
    scanAmountInr: 4896, // 51 * 96 = ₹4,896 charged on scan
    credits: 18000,
    creditsNanos: 18000 * 1_000_000_000,
    description: "Enterprise scale inference for high-demand clusters ($50/mo · ₹4,800)",
  },
  {
    id: "inr_power_100",
    name: "Power Plan",
    amountUsd: 100,
    amountInr: 9600, // $100 * 96 displayed above
    scanAmountUsd: 101, // $100 + $1 scanned internally
    scanAmountInr: 9696, // 101 * 96 = ₹9,696 charged on scan
    credits: 40000,
    creditsNanos: 40000 * 1_000_000_000,
    description: "Heavy reasoning pipelines and continuous multi-agent clusters ($100/mo · ₹9,600)",
  },
  {
    id: "inr_ultra_200",
    name: "Ultra Plan",
    amountUsd: 200,
    amountInr: 19200, // $200 * 96 displayed above
    scanAmountUsd: 201, // $200 + $1 scanned internally
    scanAmountInr: 19296, // 201 * 96 = ₹19,296 charged on scan
    credits: 100000,
    creditsNanos: 100000 * 1_000_000_000,
    description: "Maximum enterprise throughput and dedicated compute allocation ($200/mo · ₹19,200)",
  },
];

export const CRYPTO_TIERS: CryptoTier[] = [
  { id: "crypto_10", name: "Starter", usd: 10, credits: 3000, creditsNanos: 3000 * 1_000_000_000 },
  { id: "crypto_25", name: "Pro Plan", usd: 25, credits: 8500, creditsNanos: 8500 * 1_000_000_000, popular: true },
  { id: "crypto_50", name: "Max Plan", usd: 50, credits: 18000, creditsNanos: 18000 * 1_000_000_000 },
  { id: "crypto_100", name: "Power Plan", usd: 100, credits: 40000, creditsNanos: 40000 * 1_000_000_000 },
  { id: "crypto_200", name: "Ultra Plan", usd: 200, credits: 100000, creditsNanos: 100000 * 1_000_000_000 },
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
      "Daily UTC check-in rewards (Up to $2)",
      "Standard token throughput",
      "Community support on Discord",
      "Zero credit card required",
    ],
  },
  {
    id: "token_plus_15",
    name: "Plus",
    tokens: 750_000_000,
    tokensMillions: 750,
    originalTokensMillions: 250,
    offerMultiplier: "3X",
    amountUsd: 25,
    amountInr: 2400,
    scanAmountUsd: 26,
    scanAmountInr: 2496,
    badge: "3X TOKENS OFFER",
    description: "750 Million tokens (3X Offer · was 250M) · 30M tokens / $1 · Ideal for scripts, tools & prototyping",
    features: [
      "750 Million tokens dedicated quota (3X Special Offer)",
      "Claude Opus 5, Sonnet 4.6 & 3.7",
      "GLM 5.3, Qwen 3.8 Max, DeepSeek V4 Pro",
      "Full tool-use & multi-file context",
      "Tokens never expire while active",
      "Sub-8ms automatic key failover",
    ],
  },
  {
    id: "coding_starter_25",
    name: "Pro",
    tokens: 1_000_000_000,
    tokensMillions: 1000,
    originalTokensMillions: 500,
    offerMultiplier: "2X",
    amountUsd: 50,
    amountInr: 4800,
    scanAmountUsd: 51,
    scanAmountInr: 4896,
    popular: true,
    badge: "2X TOKENS · POPULAR",
    description: "1.0 Billion tokens (2X Offer · was 500M) · 20M tokens / $1 · Production engineering and autonomous agents",
    features: [
      "1,000 Million (1.0 Billion) tokens dedicated quota (2X Special Offer)",
      "Claude Opus 5, Sonnet 4.6 & 3.7",
      "GLM 5.3, Qwen 3.8 Max, DeepSeek V4 Pro",
      "GPT-6 Astra & Kimi K3 Coder",
      "Full tool-use & multi-file context",
      "Zero monthly expiry while account active",
    ],
  },
  {
    id: "coding_power_100",
    name: "Ultra",
    tokens: 2_000_000_000,
    tokensMillions: 2000,
    originalTokensMillions: 1000,
    offerMultiplier: "2X",
    amountUsd: 80,
    amountInr: 7680,
    scanAmountUsd: 81,
    scanAmountInr: 7776,
    popular: false,
    badge: "2X TOKENS OFFER",
    description: "2.0 Billion tokens (2X Offer · was 1.0B) · High-throughput teams, multi-agent loops & CI pipelines",
    features: [
      "2,000 Million (2.0 Billion) tokens (2X Special Offer)",
      "Maximum concurrency allocation",
      "VIP upstream failover routing",
      "Multi-agent swarm continuous runs",
      "Team-wide API key sharing support",
      "Zero rate limit throttling",
    ],
  },
  {
    id: "coding_ultra_200",
    name: "Enterprise",
    tokens: 4_400_000_000,
    tokensMillions: 4400,
    originalTokensMillions: 2200,
    offerMultiplier: "2X",
    amountUsd: 150,
    amountInr: 14400,
    scanAmountUsd: 151,
    scanAmountInr: 14496,
    popular: false,
    badge: "2X TOKENS OFFER",
    description: "4.4 Billion tokens (2X Offer · was 2.2B) · Maximum compute capacity for enterprises",
    features: [
      "4.4 Billion tokens (2X Special Offer)",
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
        String(t.tokensMillions) === clean ||
        (t.originalTokensMillions !== undefined && String(t.originalTokensMillions) === clean)
    ) ||
    (clean.includes("25") ? TOKEN_PLAN_TIERS.find((t) => t.amountUsd === 25) : undefined) ||
    (clean.includes("50") ? TOKEN_PLAN_TIERS.find((t) => t.amountUsd === 50) : undefined) ||
    (clean.includes("80") ? TOKEN_PLAN_TIERS.find((t) => t.amountUsd === 80) : undefined) ||
    (clean.includes("150") ? TOKEN_PLAN_TIERS.find((t) => t.amountUsd === 150) : undefined)
  );
}

export const getTokenPlanTier = getCodingPlanTier;

