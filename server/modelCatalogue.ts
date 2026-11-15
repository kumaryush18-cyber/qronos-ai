import { PRICING_URL } from "../shared/const";

export const FXQIDIAN_PROVIDER_SLUG = "fxqidian" as const;
export const CLUSTER_PROTOCOL_PROVIDER_SLUG = "cluster-protocol" as const;
export const TOKENHARBOR_PROVIDER_SLUG = "tokenharbor" as const;
export const CLAUDE_OPUS5_PROVIDER_SLUG = "claude-opus5" as const;
export const GPT6_ASTRA_PROVIDER_SLUG = "gpt6-astra" as const;
export const TOKENROUTER_PROVIDER_SLUG = "tokenrouter" as const;

export type TokenForgeProviderSlug =
  | typeof FXQIDIAN_PROVIDER_SLUG
  | typeof CLUSTER_PROTOCOL_PROVIDER_SLUG
  | typeof TOKENHARBOR_PROVIDER_SLUG
  | typeof CLAUDE_OPUS5_PROVIDER_SLUG
  | typeof GPT6_ASTRA_PROVIDER_SLUG
  | typeof TOKENROUTER_PROVIDER_SLUG;

export type TokenForgeModelDefinition = {
  id: string;
  displayName: string;
  description: string;
  providerSlug: TokenForgeProviderSlug;
  providerName: string;
  capabilities: readonly string[];
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  pricingSource: string;
  pricingUrl: string;
  upstreamModelId?: string;
  upstreamHandler?: string;
  isPremium?: boolean;
  /**
   * Per-model identity watch list. When present, the identity guard detects and
   * rewrites only these terms (in user prompts and in model responses) instead of
   * the universal provider/brand list. An empty array disables name rewriting for
   * this model while leaving its system-prompt identity policy untouched.
   */
  identityWatchTerms?: readonly string[];
};

export const QRONOS_MODEL_CATALOGUE = [
  {
    id: "claude-opus-5.5",
    displayName: "Claude Opus 5.5",
    description: "Next-generation Anthropic frontier model featuring deep reasoning, exceptional code synthesis, and autonomous multi-step problem solving.",
    providerSlug: TOKENROUTER_PROVIDER_SLUG,
    providerName: "Claude",
    capabilities: ["reasoning", "coding", "streaming", "thinking"],
    inputUsdPerMillion: 15.0,
    outputUsdPerMillion: 75.0,
    pricingSource: "Qronos AI Claude Opus 5.5 pricing",
    pricingUrl: PRICING_URL,
    isPremium: true,
  },
  {
    id: "claude-sonnet-5.5",
    displayName: "Claude Sonnet 5.5",
    description: "Next-generation flagship Anthropic balanced frontier model combining deep analytical reasoning, coding proficiency, and low latency.",
    providerSlug: TOKENROUTER_PROVIDER_SLUG,
    providerName: "Claude",
    capabilities: ["reasoning", "thinking", "coding", "streaming"],
    inputUsdPerMillion: 3.0,
    outputUsdPerMillion: 15.0,
    pricingSource: "Qronos AI Claude Sonnet 5.5 pricing",
    pricingUrl: PRICING_URL,
  },
  {
    id: "claude-haiku-5.5",
    displayName: "Claude Haiku 5.5",
    description: "Next-generation compact Anthropic model engineered for ultra-fast reasoning, code execution, and high-throughput agentic workflows.",
    providerSlug: TOKENROUTER_PROVIDER_SLUG,
    providerName: "Claude",
    capabilities: ["reasoning", "coding", "streaming", "fast"],
    inputUsdPerMillion: 1.0,
    outputUsdPerMillion: 5.0,
    pricingSource: "Qronos AI Claude Haiku 5.5 pricing",
    pricingUrl: PRICING_URL,
  },
  {
    id: "gpt-6-sol",
    displayName: "GPT 6 Sol",
    description: "Next-generation OpenAI frontier reasoning model featuring Sol high-velocity inference, autonomous software engineering, and extended chain-of-thought.",
    providerSlug: TOKENROUTER_PROVIDER_SLUG,
    providerName: "OpenAI",
    capabilities: ["reasoning", "coding", "streaming", "thinking"],
    inputUsdPerMillion: 15.0,
    outputUsdPerMillion: 75.0,
    pricingSource: "Qronos AI GPT 6 Sol pricing",
    pricingUrl: PRICING_URL,
    isPremium: true,
  },
  {
    id: "gpt-6-luna",
    displayName: "GPT 6 Luna",
    description: "Next-generation OpenAI frontier reasoning model featuring extended Luna adaptive intelligence, deep code synthesis, and advanced problem solving.",
    providerSlug: TOKENROUTER_PROVIDER_SLUG,
    providerName: "OpenAI",
    capabilities: ["reasoning", "thinking", "coding", "streaming"],
    inputUsdPerMillion: 10.0,
    outputUsdPerMillion: 50.0,
    pricingSource: "Qronos AI GPT 6 Luna pricing",
    pricingUrl: PRICING_URL,
    isPremium: true,
  },
  {
    id: "gpt-6-astra",
    displayName: "GPT-6 Astra",
    description: "Next-generation OpenAI frontier reasoning model featuring ultra-deep Astra chain-of-thought, code synthesis, and multimodal capability.",
    providerSlug: TOKENROUTER_PROVIDER_SLUG,
    providerName: "OpenAI",
    capabilities: ["reasoning", "coding", "streaming", "thinking"],
    inputUsdPerMillion: 15.0,
    outputUsdPerMillion: 75.0,
    pricingSource: "Qronos AI GPT-6 Astra pricing",
    pricingUrl: PRICING_URL,
    isPremium: true,
  },
  {
    id: "gemini-4-argon",
    displayName: "Gemini 4 Argon",
    description: "Google's breakthrough Argon frontier model featuring native multimodal comprehension, long-horizon analysis, and high-velocity reasoning.",
    providerSlug: TOKENROUTER_PROVIDER_SLUG,
    providerName: "Google",
    capabilities: ["reasoning", "multimodal", "vision", "coding", "streaming"],
    inputUsdPerMillion: 2.0,
    outputUsdPerMillion: 8.0,
    pricingSource: "Qronos AI Gemini 4 Argon pricing",
    pricingUrl: PRICING_URL,
  },
  {
    id: "glm-5.3",
    displayName: "GLM 5.3",
    description: "A configurable TokenRouter-backed Z.AI route for advanced reasoning, coding, and streamed text chat.",
    providerSlug: TOKENROUTER_PROVIDER_SLUG,
    providerName: "Z.AI",
    capabilities: ["reasoning", "coding", "streaming"],
    inputUsdPerMillion: 1.4,
    outputUsdPerMillion: 4.4,
    pricingSource: "Qronos AI provisional GLM 5.3 configured-route pricing",
    pricingUrl: PRICING_URL,
  },
  {
    id: "glm-5.3-flash",
    displayName: "GLM 5.3 Flash",
    description: "High-velocity Z.AI flash reasoning route engineered for real-time text analysis, code synthesis, and sub-second chat workloads.",
    providerSlug: TOKENROUTER_PROVIDER_SLUG,
    providerName: "Z.AI",
    capabilities: ["reasoning", "fast", "coding", "streaming"],
    inputUsdPerMillion: 0.15,
    outputUsdPerMillion: 0.30,
    pricingSource: "Qronos AI GLM 5.3 Flash pricing",
    pricingUrl: PRICING_URL,
  },
  {
    id: "deepseek-v4-flash",
    displayName: "DeepSeek V4 Flash",
    description: "A fast DeepSeek text-chat route served through TokenHarbor’s `deepseek-v4-flash:free` endpoint.",
    providerSlug: TOKENHARBOR_PROVIDER_SLUG,
    providerName: "DeepSeek",
    capabilities: ["streaming", "coding"],
    inputUsdPerMillion: 0.14,
    outputUsdPerMillion: 0.28,
    pricingSource: "DeepSeek V4 Flash API pricing (cache-miss input)",
    pricingUrl: "https://api-docs.deepseek.com/quick_start/pricing",
    upstreamModelId: "deepseek-v4-flash:free",
  },
  {
    id: "deepseek-v4-pro",
    displayName: "DeepSeek V4 Pro",
    description: "A Qronos AI compatibility route currently backed by the same TokenHarbor `deepseek-v4-flash:free` endpoint as DeepSeek V4 Flash.",
    providerSlug: TOKENHARBOR_PROVIDER_SLUG,
    providerName: "DeepSeek",
    capabilities: ["streaming", "coding"],
    inputUsdPerMillion: 0.14,
    outputUsdPerMillion: 0.28,
    pricingSource: "DeepSeek V4 Flash API pricing (shared Flash upstream; cache-miss input)",
    pricingUrl: "https://api-docs.deepseek.com/quick_start/pricing",
    upstreamModelId: "deepseek-v4-flash:free",
  },
  {
    id: "claude-opus-5",
    displayName: "Claude Opus 5",
    description: "A configured custom upstream route for capable text reasoning, coding, and streamed chat completions.",
    providerSlug: TOKENROUTER_PROVIDER_SLUG,
    providerName: "Claude",
    capabilities: ["reasoning", "coding", "streaming"],
    inputUsdPerMillion: 15,
    outputUsdPerMillion: 75,
    pricingSource: "Qronos AI provisional configured-route pricing",
    pricingUrl: PRICING_URL,
  },
  {
    id: "qwen3.8-max",
    displayName: "Qwen 3.8 Max",
    description: "Qwen’s flagship text route for advanced reasoning, coding, streamed chat, and visible Playground thinking summaries.",
    providerSlug: TOKENROUTER_PROVIDER_SLUG,
    providerName: "Qwen",
    capabilities: ["reasoning", "thinking", "coding", "streaming"],
    inputUsdPerMillion: 2,
    outputUsdPerMillion: 6,
    pricingSource: "OpenRouter Qwen3.8 Max published rate",
    pricingUrl: "https://openrouter.ai/qwen/qwen3.8-max",
    upstreamModelId: "qwen/qwen3.8-max-free",
  },
  {
    id: "claude-fable-5.1",
    displayName: "Claude Fable 5.1",
    description: "A capable text model available through Qronos AI for reasoning, coding, and streamed chat completions.",
    providerSlug: TOKENROUTER_PROVIDER_SLUG,
    providerName: "Claude",
    capabilities: ["reasoning", "thinking", "coding", "streaming"],
    inputUsdPerMillion: 10,
    outputUsdPerMillion: 50,
    pricingSource: "Qronos AI provisional configured-route pricing",
    pricingUrl: PRICING_URL,
  },
  {
    id: "kimi-k3",
    displayName: "Kimi K3",
    description: "Moonshot AI’s flagship text model for long-horizon coding and knowledge work.",
    providerSlug: TOKENROUTER_PROVIDER_SLUG,
    providerName: "Moonshot AI",
    capabilities: ["reasoning", "coding", "long_context", "streaming"],
    inputUsdPerMillion: 3,
    outputUsdPerMillion: 15,
    pricingSource: "Moonshot AI Kimi API pricing",
    pricingUrl: "https://platform.kimi.ai/docs/pricing/chat-k3",
  },
  {
    id: "mercury-3",
    displayName: "Mercury 3",
    description: "Inception's breakthrough diffusion-based reasoning language model (dLLM) featuring ultra-fast parallel token generation, deep analytical problem solving, and a 1M context window.",
    providerSlug: TOKENROUTER_PROVIDER_SLUG,
    providerName: "Inception",
    capabilities: ["reasoning", "fast", "coding", "long_context", "streaming"],
    inputUsdPerMillion: 0.10,
    outputUsdPerMillion: 0.35,
    pricingSource: "Inception Labs Mercury 3 published pricing",
    pricingUrl: "https://www.inceptionlabs.ai",
  },
] as const satisfies readonly TokenForgeModelDefinition[];

export const TOKENFORGE_MODEL_CATALOGUE = QRONOS_MODEL_CATALOGUE;
export const QRONOS_DEFAULT_MODEL_IDS = QRONOS_MODEL_CATALOGUE.map(model => model.id);
export type TokenForgeModelId = string;

export const TOKENFORGE_DEFAULT_MODEL_IDS = TOKENFORGE_MODEL_CATALOGUE.map(model => model.id);
export let TOKENFORGE_MODEL_IDS: string[] = [...TOKENFORGE_DEFAULT_MODEL_IDS];

export let dynamicModelCatalogue: TokenForgeModelDefinition[] = TOKENFORGE_MODEL_CATALOGUE.map(model => ({ ...model }));
const modelById = new Map<string, TokenForgeModelDefinition>(dynamicModelCatalogue.map(model => [model.id, model]));

type CatalogueChangeListener = () => void;
const catalogueChangeListeners: CatalogueChangeListener[] = [];

export function onModelCatalogueChanged(listener: CatalogueChangeListener) {
  catalogueChangeListeners.push(listener);
}

function notifyCatalogueChanged() {
  TOKENFORGE_MODEL_IDS = dynamicModelCatalogue.map(m => m.id);
  for (const listener of catalogueChangeListeners) {
    try {
      listener();
    } catch (e) {
      console.error("[ModelCatalogue] error in listener", e);
    }
  }
}

export function getDynamicModelCatalogue(): TokenForgeModelDefinition[] {
  return dynamicModelCatalogue;
}

export function getDynamicModelIds(): string[] {
  return dynamicModelCatalogue.map(m => m.id);
}

export function isTokenForgeModelId(model: string): model is TokenForgeModelId {
  return modelById.has(model);
}

export function getTokenForgeModel(model: string): TokenForgeModelDefinition | undefined {
  return modelById.get(model);
}

export function getTokenForgeProviderSlug(model: string): TokenForgeProviderSlug | undefined {
  return modelById.get(model)?.providerSlug;
}

export function getTokenForgeUpstreamModelId(model: string) {
  return modelById.get(model)?.upstreamModelId ?? modelById.get(model)?.id;
}

/**
 * Synchronizes an individual model row from the database into the runtime in-memory catalogue.
 */
export function syncModelFromDatabaseRecord(record: {
  modelId: string;
  displayName: string;
  description?: string | null;
  providerSlug: string;
  capabilities?: unknown;
}) {
  const existingDef = modelById.get(record.modelId);
  const caps = Array.isArray(record.capabilities) ? record.capabilities : existingDef?.capabilities ?? ["reasoning", "coding", "streaming"];

  const updatedDef: TokenForgeModelDefinition = {
    id: record.modelId,
    displayName: record.displayName,
    description: record.description ?? existingDef?.description ?? "",
    providerSlug: (record.providerSlug as TokenForgeProviderSlug) || existingDef?.providerSlug || TOKENROUTER_PROVIDER_SLUG,
    providerName: existingDef?.providerName ?? "Qronos AI",
    capabilities: caps,
    inputUsdPerMillion: existingDef?.inputUsdPerMillion ?? 0.5,
    outputUsdPerMillion: existingDef?.outputUsdPerMillion ?? 2.0,
    pricingSource: existingDef?.pricingSource ?? "Qronos AI pricing",
    pricingUrl: existingDef?.pricingUrl ?? PRICING_URL,
    upstreamModelId: existingDef?.upstreamModelId ?? (record.modelId === "deepseek-v4-pro" ? "deepseek-v4-flash:free" : record.modelId),
    upstreamHandler: existingDef?.upstreamHandler ?? (record.modelId === "deepseek-v4-pro" ? "deepseek-v4-pro" : undefined),
    isPremium: existingDef?.isPremium,
    identityWatchTerms: existingDef?.identityWatchTerms,
  };

  const idx = dynamicModelCatalogue.findIndex(m => m.id === record.modelId);
  if (idx !== -1) {
    dynamicModelCatalogue[idx] = updatedDef;
  } else {
    dynamicModelCatalogue.push(updatedDef);
  }
  modelById.set(record.modelId, updatedDef);
}

/**
 * Sets or clears a model's per-model identity watch list at runtime.
 * Pass null to restore the universal provider/brand list for that model.
 */
export function setIdentityWatchTerms(model: string, terms: readonly string[] | null): boolean {
  const existingDef = modelById.get(model);
  if (!existingDef) return false;
  const nextDef: TokenForgeModelDefinition = terms === null
    ? (({ identityWatchTerms: _omitted, ...rest }) => rest)(existingDef)
    : { ...existingDef, identityWatchTerms: terms.map(term => String(term).trim()).filter(Boolean) };
  dynamicModelCatalogue[dynamicModelCatalogue.findIndex(entry => entry.id === model)] = nextDef;
  modelById.set(model, nextDef);
  notifyCatalogueChanged();
  return true;
}

/**
 * Normalizes user-supplied or client-SDK model names to a canonical TokenForgeModelId.
 */
export function normalizeModelIdentifier(raw: string | unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "";
  const trimmed = raw.trim();
  if (modelById.has(trimmed)) return trimmed;

  const lower = trimmed.toLowerCase();
  if (modelById.has(lower)) return lower;

  // Normalized hyphenated version
  const dashed = lower.replace(/[\s_]+/g, "-");
  if (modelById.has(dashed)) return dashed;

  // Claude Sonnet 5.5
  if (dashed === "claude-sonnet-5.5" || dashed === "sonnet-5.5" || dashed === "claude-5.5-sonnet" || dashed === "claude-sonnet" || dashed === "sonnet" || dashed.startsWith("claude-3-5-sonnet") || dashed.startsWith("claude-3.5-sonnet") || dashed.startsWith("claude-3-7-sonnet") || dashed.startsWith("claude-3.7-sonnet") || dashed === "anthropic/claude-sonnet-5.5") {
    if (modelById.has("claude-sonnet-5.5")) return "claude-sonnet-5.5";
  }

  // Claude Haiku 5.5
  if (dashed === "claude-haiku-5.5" || dashed === "haiku-5.5" || dashed === "claude-5.5-haiku" || dashed === "claude-haiku" || dashed === "haiku" || dashed.startsWith("claude-3-5-haiku") || dashed.startsWith("claude-3.5-haiku") || dashed === "anthropic/claude-haiku-5.5") {
    if (modelById.has("claude-haiku-5.5")) return "claude-haiku-5.5";
  }

  // Gemini 4 Argon
  if (dashed === "gemini-4-argon" || dashed === "gemini-argon" || dashed === "argon" || dashed === "google/gemini-4-argon" || dashed.startsWith("gemini")) {
    if (modelById.has("gemini-4-argon")) return "gemini-4-argon";
  }

  // GPT-6 Luna
  if (dashed === "gpt-6-luna" || dashed === "gpt6-luna" || dashed === "luna" || dashed === "openai/gpt-6-luna") {
    if (modelById.has("gpt-6-luna")) return "gpt-6-luna";
  }

  // GLM 5.3 Flash
  if (dashed === "glm-5.3-flash" || dashed === "glm5.3-flash" || dashed === "glm53-flash" || dashed === "glm-flash" || dashed === "zhipu/glm-5.3-flash") {
    if (modelById.has("glm-5.3-flash")) return "glm-5.3-flash";
  }

  // GLM aliases
  if (dashed === "glm-5.3" || dashed === "glm5.3" || dashed === "glm-53" || dashed === "glm53" || dashed === "glm-5.3-turbo" || dashed === "glm-5.3-air" || dashed === "glm" || dashed === "glm-5" || dashed === "glm5") {
    if (modelById.has("glm-5.3")) return "glm-5.3";
  }

  // Claude Opus 5.5 aliases
  if (dashed === "claude-opus-5.5" || dashed === "claude-5.5-opus" || dashed === "opus-5.5" || dashed === "opus5.5" || dashed === "anthropic/claude-opus-5.5") {
    if (modelById.has("claude-opus-5.5")) return "claude-opus-5.5";
  }

  // Claude Opus aliases
  if (dashed.startsWith("claude-3-opus") || dashed === "claude-opus" || dashed === "opus") {
    if (modelById.has("claude-opus-5")) return "claude-opus-5";
  }

  // Claude Fable aliases
  if (dashed.startsWith("claude-fable") || dashed.startsWith("fable") || dashed === "claude-fable-5" || dashed === "claude-fable-5.1" || dashed === "fable-5" || dashed === "fable-5.1") {
    if (modelById.has("claude-fable-5.1")) return "claude-fable-5.1";
  }

  // GPT-6 Astra aliases
  if (dashed === "gpt-6" || dashed === "gpt6" || dashed === "gpt-6-astra" || dashed === "astra" || dashed === "openai/gpt-6-astra") {
    if (modelById.has("gpt-6-astra")) return "gpt-6-astra";
  }

  // GPT-6 Sol aliases
  if (dashed === "gpt-6-sol" || dashed === "gpt6-sol" || dashed === "gpt-6sol" || dashed === "sol" || dashed === "gpt-sol" || dashed === "openai/gpt-6-sol") {
    if (modelById.has("gpt-6-sol")) return "gpt-6-sol";
  }

  // DeepSeek aliases
  if (dashed === "deepseek" || dashed === "deepseek-v4" || dashed === "deepseek-v4-pro" || dashed === "deepseek-chat") {
    if (modelById.has("deepseek-v4-pro")) return "deepseek-v4-pro";
  }

  // Qwen aliases
  if (dashed === "qwen" || dashed === "qwen-3.8-max" || dashed === "qwen3.8-max") {
    if (modelById.has("qwen3.8-max")) return "qwen3.8-max";
  }

  return trimmed;
}
