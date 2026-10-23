import { PRICING_URL } from "@shared/const";

export type CatalogueModel = {
  id: string;
  name: string;
  provider: string;
  providerMark: string;
  tone: "lime" | "cyan" | "amber" | "violet" | "coral" | "sky";
  description: string;
  eyebrow: string;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  capabilities: string[];
  pricingSource: string;
  pricingUrl: string;
  isPremium?: boolean;
};

const model = (
  id: string,
  name: string,
  provider: string,
  providerMark: string,
  tone: CatalogueModel["tone"],
  inputUsdPerMillion: number,
  outputUsdPerMillion: number,
  eyebrow: string,
  description: string,
  capabilities: string[],
  pricingSource: string,
  pricingUrl: string,
  isPremium?: boolean
): CatalogueModel => ({
  id,
  name,
  provider,
  providerMark,
  tone,
  inputUsdPerMillion,
  outputUsdPerMillion,
  eyebrow,
  description,
  capabilities,
  pricingSource,
  pricingUrl,
  ...(isPremium ? { isPremium: true } : {}),
});

export const QRONOS_MODELS: CatalogueModel[] = [
  model("claude-opus-5.5", "Claude Opus 5.5", "Claude", "AI", "violet", 15, 75, "Anthropic frontier reasoning", "Next-generation Anthropic frontier model featuring deep reasoning, exceptional code synthesis, and autonomous multi-step problem solving.", ["Reasoning", "Thinking", "Streaming", "Coding"], "Qronos AI Claude Opus 5.5 pricing", PRICING_URL, true),
  model("claude-sonnet-5.5", "Claude Sonnet 5.5", "Claude", "AI", "violet", 3, 15, "Balanced frontier intelligence", "Next-generation flagship Anthropic balanced frontier model combining deep analytical reasoning, coding proficiency, and low latency.", ["Reasoning", "Thinking", "Streaming", "Coding"], "Qronos AI Claude Sonnet 5.5 pricing", PRICING_URL),
  model("claude-haiku-5.5", "Claude Haiku 5.5", "Claude", "AI", "violet", 1, 5, "Ultra-fast compact reasoning", "Next-generation compact Anthropic model engineered for ultra-fast reasoning, code execution, and high-throughput agentic workflows.", ["Reasoning", "Fast", "Streaming", "Coding"], "Qronos AI Claude Haiku 5.5 pricing", PRICING_URL),
  model("gpt-6-sol", "GPT 6 Sol", "OpenAI", "O", "sky", 15, 75, "Next-gen Sol frontier reasoning", "Next-generation OpenAI frontier reasoning model featuring Sol high-velocity inference, autonomous software engineering, and extended chain-of-thought.", ["Reasoning", "Thinking", "Streaming", "Coding"], "Qronos AI GPT 6 Sol pricing", PRICING_URL, true),
  model("gpt-6-luna", "GPT 6 Luna", "OpenAI", "O", "sky", 10, 50, "Next-gen Luna adaptive reasoning", "Next-generation OpenAI frontier reasoning model featuring extended Luna adaptive intelligence, deep code synthesis, and advanced problem solving.", ["Reasoning", "Thinking", "Streaming", "Coding"], "Qronos AI GPT 6 Luna pricing", PRICING_URL, true),
  model("gpt-6-astra", "GPT-6 Astra", "OpenAI", "O", "sky", 15, 75, "Next-gen Astra frontier reasoning", "Next-generation OpenAI frontier reasoning model featuring ultra-deep Astra chain-of-thought, code synthesis, and multimodal capability.", ["Reasoning", "Thinking", "Streaming", "Coding"], "Qronos AI GPT-6 Astra pricing", PRICING_URL, true),
  model("gemini-4-argon", "Gemini 4 Argon", "Google", "G", "cyan", 2, 8, "Google Argon multimodal frontier", "Google's breakthrough Argon frontier model featuring native multimodal comprehension, long-horizon analysis, and high-velocity reasoning.", ["Reasoning", "Multimodal", "Vision", "Coding", "Streaming"], "Qronos AI Gemini 4 Argon pricing", PRICING_URL),
  model("glm-5.3", "GLM 5.3", "Z.AI", "GLM", "lime", 1.4, 4.4, "Advanced Z.AI reasoning", "A configurable Z.AI route for advanced text reasoning, coding, and streamed chat workloads.", ["Reasoning", "Streaming", "Coding"], "Qronos AI provisional GLM 5.3 configured-route pricing", PRICING_URL),
  model("glm-5.3-flash", "GLM 5.3 Flash", "Z.AI", "GLM", "lime", 0.15, 0.30, "Fast Z.AI flash reasoning", "High-velocity Z.AI flash reasoning route engineered for real-time text analysis, code synthesis, and sub-second chat workloads.", ["Reasoning", "Fast", "Streaming", "Coding"], "Qronos AI GLM 5.3 Flash pricing", PRICING_URL),
  model("deepseek-v4-flash", "DeepSeek V4 Flash", "DeepSeek", "DS", "sky", 0.14, 0.28, "Fast text chat", "A fast text-chat option for everyday questions, writing, and coding tasks.", ["Streaming", "Coding"], "DeepSeek V4 Flash API pricing", "https://api-docs.deepseek.com/quick_start/pricing"),
  model("deepseek-v4-pro", "DeepSeek V4 Pro", "DeepSeek", "DS", "sky", 0.14, 0.28, "General text reasoning", "A capable text-chat option for analysis, writing, coding, and structured answers.", ["Streaming", "Coding"], "Qronos AI model pricing", PRICING_URL),
  model("claude-opus-5", "Claude Opus 5", "Claude", "AI", "violet", 15, 75, "Advanced reasoning", "A high-capability text model for detailed reasoning, coding, and streamed chat completions.", ["Reasoning", "Streaming", "Coding"], "Qronos AI model pricing", PRICING_URL),
  model("qwen3.8-max", "Qwen 3.8 Max", "Qwen", "Q", "lime", 2, 6, "Flagship Qwen reasoning", "A flagship Qwen route for advanced reasoning, coding, streamed chat, and inspectable Playground thinking summaries.", ["Reasoning", "Thinking", "Streaming", "Coding"], "OpenRouter Qwen3.8 Max published rate", "https://openrouter.ai/qwen/qwen3.8-max"),
  model("claude-fable-5.1", "Claude Fable 5.1", "Claude", "AI", "violet", 10, 50, "Advanced reasoning", "A capable text model for reasoning, coding, streamed chat, and inspectable Playground thinking summaries.", ["Reasoning", "Thinking", "Streaming", "Coding"], "Qronos AI provisional configured-route pricing", PRICING_URL),
  model("kimi-k3", "Kimi K3", "Moonshot AI", "K", "amber", 3, 15, "Moonshot flagship", "Moonshot AI’s flagship text model for long-horizon coding and knowledge work.", ["Reasoning", "Long context", "Streaming", "Coding"], "Moonshot AI Kimi API pricing", "https://platform.kimi.ai/docs/pricing/chat-k3"),
  model("mercury-3", "Mercury 3", "Inception", "M", "coral", 0.10, 0.35, "Inception diffusion reasoning", "Inception's breakthrough diffusion-based reasoning LLM (dLLM) featuring parallel token refinement, high agentic speed, and 1M context.", ["Reasoning", "Diffusion", "Fast", "Coding", "1M Context", "Streaming"], "Inception Labs published rates", "https://www.inceptionlabs.ai"),
];

export const PLAYGROUND_FEATURED_MODEL_IDS = [
  "claude-opus-5.5",
  "claude-sonnet-5.5",
  "gpt-6-astra",
  "mercury-3",
  "gpt-6-luna",
  "gemini-4-argon",
  "claude-haiku-5.5",
  "glm-5.3",
  "qwen3.8-max",
  "claude-fable-5.1",
  "deepseek-v4-pro",
] as const;

export function prioritizePlaygroundModels<T extends { id: string }>(models: readonly T[]) {
  const featured = PLAYGROUND_FEATURED_MODEL_IDS.flatMap(id => models.filter(model => model.id === id));
  return [...featured, ...models.filter(model => !PLAYGROUND_FEATURED_MODEL_IDS.includes(model.id as (typeof PLAYGROUND_FEATURED_MODEL_IDS)[number]))];
}

export const TOKENFORGE_MODELS = QRONOS_MODELS;

export const formatUsdPerMillion = (value: number) => `$${value.toFixed(2)}`;
export const QRONOS_PLATFORM_CHARGE_MULTIPLIER = 2.0;
export const TOKENFORGE_PLATFORM_CHARGE_MULTIPLIER = QRONOS_PLATFORM_CHARGE_MULTIPLIER;

export const qronosCreditRatePerMillion = (upstreamRate: number, modelId?: string) => {
  if (
    modelId === "gpt-6-astra" ||
    modelId === "claude-opus-5" ||
    modelId === "claude-opus-5.5" ||
    modelId === "gpt-6-sol" ||
    modelId === "gpt-6-luna"
  ) {
    return upstreamRate;
  }
  return upstreamRate * QRONOS_PLATFORM_CHARGE_MULTIPLIER;
};
export const tokenForgeCreditRatePerMillion = qronosCreditRatePerMillion;

export const formatQronosCreditRatePerMillion = (upstreamRate: number, modelId?: string) =>
  `$${qronosCreditRatePerMillion(upstreamRate, modelId).toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}`;
export const formatTokenForgeCreditRatePerMillion = formatQronosCreditRatePerMillion;
