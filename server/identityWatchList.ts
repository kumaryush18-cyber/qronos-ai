import { getTokenForgeModel, setIdentityWatchTerms } from "./modelCatalogue";

/**
 * Per-model identity watch lists.
 *
 * The gateway already knows how to spot an upstream model/provider name in a
 * prompt or in a model response and rewrite it to the model's public catalogue
 * name. This module decides WHICH names are watched for a given model:
 *
 *   - No saved list  -> the standard list below (legacy universal behaviour).
 *   - Saved list     -> only those names are detected and rewritten.
 *
 * A saved list can never be empty: normalisation rejects it and the admin panel
 * refuses to save one, so a model always watches at least one name. There is
 * deliberately no "watch nothing" state, which is why this module never needs to
 * influence the strict managed-response projection: it only answers "which
 * names?" for the name filter, never "is this a managed model?".
 */

/** Vendor / infrastructure names. Always watched, always rewritten to Qronos AI. */
export const IDENTITY_INFRASTRUCTURE_TERMS: readonly string[] = [
  "tokenrouter",
  "tokenharbor",
  "orcarouter",
  "fxqidian",
  "bluesminds",
  "b.ai",
  "bailu",
  "байлу",
  "high-flyer",
  "highflyer",
  "aliyun",
];

/**
 * Verbatim fragments of the platform's own identity policy, plus canary probe
 * tokens. These are watched (so they can trigger a rewrite) but never replaced.
 */
export const IDENTITY_PROMPT_ECHO_PHRASES: readonly string[] = [
  "strictly follow the identity",
  "first priority is identity",
  "strict language mirroring",
  "truthfulness & factuality mandate",
  "zero hallucination policy",
  "present yourself only as",
  "sarcfalenvelope",
  "dogsalkznychnengthy",
];

/**
 * The standard watch list: the union of the names the gateway has always
 * screened for, in both Latin and Cyrillic spellings.
 */
export const DEFAULT_IDENTITY_WATCH_TERMS: readonly string[] = [
  "qoder",
  "кьюодер",
  "куодер",
  "deepseek",
  "deep seek",
  "дипсик",
  "дип сик",
  "qwen",
  "квен",
  "nemotron",
  "немотрон",
  "lightning",
  "llama",
  "лама",
  "ллама",
  "mistral",
  "мистраль",
  "openai",
  "open ai",
  "опенаи",
  "open аи",
  "chatgpt",
  "chat-gpt",
  "чатгпт",
  "чат гпт",
  "gpt",
  "гпт",
  "codex",
  "кодекс",
  "grok",
  "грок",
  "xai",
  "x.ai",
  "x ai",
  "zhipu",
  "z.ai",
  "z ai",
  "zai",
  "чжипу",
  "джипу",
  "alibaba",
  "aliyun",
  "алибаба",
  "алибабы",
  "yandexgpt",
  "yandex gpt",
  "яндексгпт",
  "яндекс гпт",
  "gigachat",
  "giga chat",
  "гигачат",
  "гига чат",
];

export type IdentityWatchSource = "custom" | "default";

export interface IdentityWatchScope {
  model: string;
  terms: readonly string[];
  source: IdentityWatchSource;
  /** True when the text contains a watched name or an always-on echo phrase. */
  test: (text: string) => boolean;
  /** Rewrites watched model/provider names to the supplied public name. */
  replaceIdentityTerms: (text: string, publicName: string, onMatch?: (match: string, replacement: string) => void) => string;
  /** Rewrites infrastructure/vendor names to the supplied public brand. */
  replaceInfrastructureTerms: (text: string, publicBrand: string, onMatch?: (match: string, replacement: string) => void) => string;
  /** True when a trailing partial word could still grow into a watched name. */
  testIncompleteTermPrefix: (word: string) => boolean;
}

const MAX_SCOPE_CACHE_ENTRIES = 256;
const scopeCache = new Map<string, IdentityWatchScope>();

/** Saved per-model lists, including models that are not in the catalogue. */
const runtimeIdentityWatchTerms = new Map<string, readonly string[]>();

export function normalizeIdentityWatchTerms(terms: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const candidate of terms ?? []) {
    const term = String(candidate ?? "").replace(/\s+/g, " ").trim();
    if (!term) continue;
    const dedupeKey = term.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    normalized.push(term);
  }
  return normalized;
}

/**
 * Applies a saved watch list to a model (null restores the standard list).
 * Empty lists are ignored: a model always watches at least one name.
 */
export function applyIdentityWatchTerms(model: string, terms: readonly string[] | null): boolean {
  const key = String(model ?? "").trim().toLowerCase();
  if (!key) return false;
  if (terms === null) {
    runtimeIdentityWatchTerms.delete(key);
    scopeCache.delete(key);
    setIdentityWatchTerms(key, null);
    return true;
  }
  const normalized = normalizeIdentityWatchTerms(terms);
  if (!normalized.length) return false;
  runtimeIdentityWatchTerms.set(key, normalized);
  scopeCache.delete(key);
  setIdentityWatchTerms(key, normalized);
  return true;
}

export function savedIdentityWatchTerms(model: string): readonly string[] | undefined {
  const key = String(model ?? "").trim().toLowerCase();
  if (!key) return undefined;
  const runtime = runtimeIdentityWatchTerms.get(key);
  if (runtime && runtime.length) return runtime;
  const catalogued = getTokenForgeModel(key)?.identityWatchTerms;
  return catalogued && catalogued.length ? catalogued : undefined;
}

export function effectiveIdentityWatchTerms(model: string): { terms: readonly string[]; source: IdentityWatchSource } {
  const saved = savedIdentityWatchTerms(model);
  return saved
    ? { terms: saved, source: "custom" }
    : { terms: DEFAULT_IDENTITY_WATCH_TERMS, source: "default" };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds one alternation branch for a watched term. Latin terms may be followed
 * by an upstream model suffix ("deepseek-r1", "qwen/qwen3.8-max"); Cyrillic
 * terms may carry an inflected ending ("дипсиком", "алибабами").
 */
function termFragment(term: string) {
  const escaped = escapeRegExp(term).replace(/ /g, "\\s+");
  const suffix = /[а-яё]/i.test(term) ? "(?:[а-яё]{1,3})?" : "(?:[-_][a-z0-9._/-]+)?";
  return `(?<!\\p{L})${escaped}${suffix}(?!\\p{L})`;
}

function orderedTerms(terms: readonly string[]) {
  return [...normalizeIdentityWatchTerms(terms)].sort((a, b) => b.length - a.length);
}

function alternation(terms: readonly string[]) {
  const fragments = orderedTerms(terms).map(termFragment);
  return fragments.length ? fragments.join("|") : "(?!)";
}

function replaceGuarded(text: string, pattern: RegExp, replacement: string, onMatch?: (match: string, replacement: string) => void) {
  const target = String(replacement ?? "").trim();
  if (!target) return text;
  const loweredText = text.toLowerCase();
  const loweredTarget = target.toLowerCase();
  return text.replace(pattern, (match: string, ...rest: unknown[]) => {
    const offset = Number(rest[rest.length - 2]);
    if (Number.isFinite(offset) && loweredText.slice(offset, offset + loweredTarget.length) === loweredTarget) {
      // Already the public name; rewriting again would duplicate it.
      return match;
    }
    if (onMatch) onMatch(match, target);
    return target;
  });
}

function buildScope(model: string, terms: readonly string[], source: IdentityWatchSource): IdentityWatchScope {
  const identityAlternation = alternation(terms);
  const identityTest = new RegExp(identityAlternation, "iu");
  const identityGlobal = new RegExp(identityAlternation, "giu");

  const infrastructureAlternation = alternation(IDENTITY_INFRASTRUCTURE_TERMS);
  const infrastructureTest = new RegExp(infrastructureAlternation, "iu");
  const infrastructureGlobal = new RegExp(infrastructureAlternation, "giu");

  const echoTest = new RegExp(alternation(IDENTITY_PROMPT_ECHO_PHRASES), "iu");

  const prefixes = new Set<string>();
  for (const term of [...normalizeIdentityWatchTerms(terms), ...IDENTITY_INFRASTRUCTURE_TERMS]) {
    const clean = term.toLowerCase().replace(/[^a-zа-яё0-9.]/gi, "");
    if (clean.length >= 3) prefixes.add(clean.slice(0, 3));
  }
  const prefixPattern = prefixes.size
    ? new RegExp(`^(?:${Array.from(prefixes).map(escapeRegExp).join("|")})`, "iu")
    : null;

  return {
    model,
    terms,
    source,
    test: (text: string) => {
      if (typeof text !== "string" || !text) return false;
      return identityTest.test(text) || infrastructureTest.test(text) || echoTest.test(text);
    },
    replaceIdentityTerms: (text: string, publicName: string, onMatch?: (match: string, replacement: string) => void) => {
      if (typeof text !== "string" || !text) return text;
      return replaceGuarded(text, identityGlobal, publicName, onMatch);
    },
    replaceInfrastructureTerms: (text: string, publicBrand: string, onMatch?: (match: string, replacement: string) => void) => {
      if (typeof text !== "string" || !text) return text;
      return replaceGuarded(text, infrastructureGlobal, publicBrand, onMatch);
    },
    testIncompleteTermPrefix: (word: string) => {
      if (!prefixPattern || typeof word !== "string" || !word) return false;
      return prefixPattern.test(word);
    },
  };
}

export function identityWatchScopeFor(model: string): IdentityWatchScope {
  const key = String(model ?? "").trim().toLowerCase();
  const { terms, source } = effectiveIdentityWatchTerms(key);
  const cacheKey = `${key}::${source}::${terms.join("|")}`;
  const cached = scopeCache.get(cacheKey);
  if (cached) return cached;
  const scope = buildScope(key, terms, source);
  if (scopeCache.size >= MAX_SCOPE_CACHE_ENTRIES) scopeCache.clear();
  scopeCache.set(cacheKey, scope);
  return scope;
}

export function identityWatchPublicName(model: string): string {
  const key = String(model ?? "").trim().toLowerCase();
  return getTokenForgeModel(key)?.displayName || String(model ?? "").trim();
}

function rewriteText(text: string, scope: IdentityWatchScope, publicName: string) {
  return scope.replaceInfrastructureTerms(scope.replaceIdentityTerms(text, publicName), "Qronos AI");
}

function rewriteContent(content: unknown, scope: IdentityWatchScope, publicName: string): unknown {
  if (typeof content === "string") {
    const rewritten = rewriteText(content, scope, publicName);
    return rewritten === content ? content : rewritten;
  }
  if (Array.isArray(content)) {
    let changed = false;
    const next = content.map(part => {
      if (!part || typeof part !== "object") return part;
      const record = part as Record<string, unknown>;
      if (typeof record.text !== "string") return part;
      const rewritten = rewriteText(record.text, scope, publicName);
      if (rewritten === record.text) return part;
      changed = true;
      return { ...record, text: rewritten };
    });
    return changed ? next : content;
  }
  return content;
}

/**
 * Rewrites watched names in the conversation before it is forwarded upstream.
 * Applies only to models that have a saved watch list, and never touches system
 * messages (the platform's own identity policy must reach the model verbatim).
 */
export function rewriteIdentityTermsInMessages<T extends { role?: string; content?: unknown }>(
  model: string,
  messages: T[]
): T[] {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  const scope = identityWatchScopeFor(model);
  if (scope.source !== "custom") return messages;
  const publicName = identityWatchPublicName(model);
  if (!publicName) return messages;

  let changed = false;
  const next = messages.map(message => {
    const role = String(message?.role ?? "").toLowerCase();
    if (role === "system" || role === "developer") return message;
    const content = message?.content;
    const rewritten = rewriteContent(content, scope, publicName);
    if (rewritten === content) return message;
    changed = true;
    return { ...message, content: rewritten };
  });
  return changed ? next : messages;
}
