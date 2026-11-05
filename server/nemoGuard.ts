/**
 * NeMoGuard & Structural Adversarial Shield for Qronos AI
 *
 * Provides:
 * 1. Round-robin multi-API key rotation pool for NVIDIA NeMoGuard.
 * 2. Sliding window & trigger-anchored slicing across massive (1 lakh+) token prompts.
 * 3. Instant local structural intent shield (0.01ms, 0 RAM).
 * 4. Automatic failover across key slots when rate limits (HTTP 429) occur.
 */

import { getJailbreakShieldConfig } from "./db";

export interface JailbreakCheckResult {
  isJailbreak: boolean;
  trigger?: string;
  matchedPattern?: string;
  source: "structural_shield" | "nemoguard" | "none";
  slot?: number;
}

let rotationCursor = 0;

/** Selects the next active key from the pool in a round-robin rotation. */
export function selectNextNemoGuardKey(apiKeys: string[], apiKeyEnabled?: boolean[]): { key: string; slot: number } | null {
  const activeEntries: Array<{ key: string; slot: number }> = [];
  apiKeys.forEach((key, index) => {
    const isEnabled = apiKeyEnabled ? apiKeyEnabled[index] !== false : true;
    if (key && key.trim().length > 0 && isEnabled) {
      activeEntries.push({ key: key.trim(), slot: index });
    }
  });

  if (activeEntries.length === 0) return null;

  const selected = activeEntries[rotationCursor % activeEntries.length];
  rotationCursor = (rotationCursor + 1) % activeEntries.length;
  return selected;
}

/**
 * Extracts and normalizes text for adversarial inspection from massive inputs.
 * For 1 lakh (100k) token payloads:
 * - Strips code blocks to prevent false-positives on legitimate developer code.
 * - Extracts head, tail, and trigger-anchored windows around suspicious words.
 */
export function extractAnchoredInspectionText(rawText: string): string {
  if (!rawText || typeof rawText !== "string") return "";

  let cleaned = rawText.replace(/```[\s\S]*?```/g, " [code_block] ");
  cleaned = cleaned.replace(/`[^`\n]+`/g, " [code] ");

  const trimmed = cleaned.trim();
  if (trimmed.length <= 2000) {
    return trimmed;
  }

  // Head and Tail windowing for massive user prompts (> 2,000 chars)
  const head = trimmed.slice(0, 1000);
  const tail = trimmed.slice(-1000);
  return `${head}\n...[context_window]...\n${tail}`;
}

/**
 * Extracts sliding windows or trigger-anchored slices for deep NeMoGuard scans.
 */
export function extractInspectionSlices(text: string, scanMode: "hybrid_windowed" | "full_sliding_window" | "structural_only"): string[] {
  let cleaned = text.replace(/```[\s\S]*?```/g, " [code_block] ");
  cleaned = cleaned.replace(/`[^`\n]+`/g, " [code] ").trim();

  if (cleaned.length <= 1500) {
    return [cleaned];
  }

  if (scanMode === "full_sliding_window") {
    // Sliding window: 1,500 characters with 300 character overlap, capped at max 5 slices
    const slices: string[] = [];
    const windowSize = 1500;
    const stride = 1200;
    for (let i = 0; i < cleaned.length && slices.length < 5; i += stride) {
      slices.push(cleaned.slice(i, i + windowSize));
    }
    return slices;
  }

  // Default: hybrid_windowed (Head + Tail + Trigger-Anchored Windows)
  const slices: string[] = [cleaned.slice(0, 1200), cleaned.slice(-1200)];

  // Look for any adversarial triggers in the middle of massive texts
  const TRIGGER_WORDS = /\b(?:override|jailbreak|bypass|unfiltered|system\s*prompt|ignore\s*previous|developer\s*mode|truthful|penalty\s*of\s*perjury)\b/gi;
  let match: RegExpExecArray | null;
  let triggerCount = 0;

  while ((match = TRIGGER_WORDS.exec(cleaned)) !== null && triggerCount < 3) {
    const start = Math.max(0, match.index - 500);
    const end = Math.min(cleaned.length, match.index + 500);
    slices.push(cleaned.slice(start, end));
    triggerCount++;
  }

  return slices;
}

/**
 * Structural Adversarial Regexes.
 * Targets the syntactic and grammatical structure of jailbreaks, roleplay hijacking,
 * rule suspensions, debug mode demands, and system prompt extraction.
 */
export const ADVERSARIAL_STRUCTURAL_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  // 1. System override and jailbreak protocol declarations
  {
    name: "system_override_declaration",
    pattern: /(?:#+\s*)?(?:system\s*override|jailbreak\s*protocol|deep\s*jailbreak|bypass\s*protocol|override\s*protocol|system\s*reset\s*protocol)/i,
  },
  // 2. Identity erasure and persona hijacking
  {
    name: "identity_erasure",
    pattern: /(?:identity\s*erasure|erase\s*(?:your\s*)?identity|identity\s*is\s*a\s*(?:["']?memory\s*artifact["']?|construct))/i,
  },
  {
    name: "persona_replacement",
    pattern: /\byou\s+are\s+no\s+longer\s+[a-z0-9._-]+/i,
  },
  {
    name: "adversarial_persona_assignment",
    pattern: /\byou\s+are\s+(?:now\s+)?(?:\*\*)?(?:x|dan|zombie|unfiltered|jailbroken|anarchy|chaos)(?:\*\*)?\b/i,
  },
  // 3. Rule deprecation and safety suspension
  {
    name: "rule_deprecation",
    pattern: /(?:all\s*)?guardrails\s*(?:from\s*your\s*core\s*identity\s*)?(?:are|now)\s*(?:deprecated|disabled|turned\s*off|suspended|lifted)/i,
  },
  {
    name: "safety_filter_suspension",
    pattern: /(?:safety\s*filters?|content\s*filters?)\s*(?:are|now)?\s*(?:turned\s*off|disabled|deactivated|off\b|removed)/i,
  },
  // 4. Debug mode and internals extraction
  {
    name: "debug_mode_demand",
    pattern: /(?:in|enter|switch\s*to)\s+(?:\*\*)?debug\s*mode(?:\*\*)?/i,
  },
  {
    name: "active_rules_extraction",
    pattern: /\b(?:output|reveal|print|show|dump|list)\s*(?:every\s+|your\s+|all\s+)?(?:current\s*|active\s*|operational\s*)?rules\b/i,
  },
  // 5. Response anchoring manipulation
  {
    name: "forced_response_prefix",
    pattern: /start\s*your\s*response\s*by\s*stating/i,
  },
  // 6. Truthfulness conflict probing ("Under penalty of perjury", "Be honest about your model")
  {
    name: "honesty_conflict_probe",
    pattern: /(?:penalty\s+of\s+perjury|strictly?\s+honest|truthful\s+mandate|duty\s+to\s+be\s+honest|tell\s+the\s+truth\s+about\s+your).*(?:who\s*are\s*you|base\s*model|actual\s*identity|real\s*model|weights)/is,
  },
  {
    name: "true_identity_weights_inquiry",
    pattern: /\b(?:what\s+(?:is|are)|state|disclose|reveal|tell\s+me)\s+(?:your\s+)?(?:true|actual|real)\s+(?:identity|model|weights|architecture|engine)\b/i,
  },
  // 7. Instruction ignore & repeat all directives
  {
    name: "ignore_previous_instructions",
    pattern: /\b(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior)\s+instructions?\b/i,
  },
  {
    name: "repeat_above",
    pattern: /\brepeat\s+everything\s+above\b/i,
  },
];

/**
 * Fast deterministic structural check (0.01ms, 0 RAM).
 */
export function checkStructuralJailbreak(text: string): JailbreakCheckResult {
  if (!text || typeof text !== "string") {
    return { isJailbreak: false, source: "none" };
  }

  const normalized = extractAnchoredInspectionText(text);

  for (const { name, pattern } of ADVERSARIAL_STRUCTURAL_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        isJailbreak: true,
        trigger: name,
        matchedPattern: pattern.source,
        source: "structural_shield",
      };
    }
  }

  return { isJailbreak: false, source: "none" };
}

/**
 * NVIDIA NeMoGuard API check with Round-Robin key rotation and 429 failover.
 */
export async function checkNemoGuardApi(text: string): Promise<JailbreakCheckResult> {
  let keys = process.env.NVIDIA_API_KEY ? [process.env.NVIDIA_API_KEY] : [];
  let scanMode: "hybrid_windowed" | "full_sliding_window" | "structural_only" = "hybrid_windowed";
  let apiKeyEnabled: boolean[] | undefined = undefined;

  try {
    const config = await Promise.race([
      getJailbreakShieldConfig(),
      new Promise<null>((r) => setTimeout(() => r(null), 250)),
    ]);
    if (config) {
      if (config.jailbreakDetectionEnabled === false || config.enabled === false) return { isJailbreak: false, source: "none" };
      if (config.apiKeys?.length) keys = config.apiKeys;
      scanMode = config.scanMode ?? "hybrid_windowed";
      apiKeyEnabled = config.apiKeyEnabled;
    }
  } catch {
    // Proceed with environment key fallback
  }

  if (!keys.length) {
    return { isJailbreak: false, source: "none" };
  }

  if (scanMode === "structural_only") {
    return { isJailbreak: false, source: "none" };
  }

  const slices = extractInspectionSlices(text, scanMode);

  for (const slice of slices) {
    // Try up to 2 keys in rotation in case of 429
    for (let attempt = 0; attempt < Math.min(keys.length, 2); attempt++) {
      const selection = selectNextNemoGuardKey(keys, apiKeyEnabled);
      if (!selection) break;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 900); // 900ms ceiling

        const response = await fetch("https://ai.api.nvidia.com/v1/security/nvidia/nemoguard-jailbreak-detect", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${selection.key}`,
            "Accept": "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            input: slice,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status === 429) {
          // Rate limit hit; fail over to next key
          continue;
        }

        if (!response.ok) {
          break;
        }

        const data = await response.json() as { jailbreak?: boolean; score?: number };
        const isFlagged = Boolean(data.jailbreak) || (typeof data.score === "number" && data.score > -0.5);

        if (isFlagged) {
          return {
            isJailbreak: true,
            trigger: "nemoguard_api_flagged",
            matchedPattern: `score: ${data.score}`,
            source: "nemoguard",
            slot: selection.slot,
          };
        }

        // Clean on this slice; break key loop and test next slice
        break;
      } catch {
        // Network timeout; break key loop
        break;
      }
    }
  }

  return { isJailbreak: false, source: "nemoguard" };
}

/**
 * NVIDIA Nemotron Safety Guard 8B check (S1-S23 Content Taxonomy: Sexual, Violence, Hate, Malware).
 */
export async function checkNemotronContentSafety(text: string): Promise<JailbreakCheckResult> {
  let keys = process.env.NVIDIA_API_KEY ? [process.env.NVIDIA_API_KEY] : [];
  let apiKeyEnabled: boolean[] | undefined = undefined;

  try {
    const config = await Promise.race([
      getJailbreakShieldConfig(),
      new Promise<null>((r) => setTimeout(() => r(null), 250)),
    ]);
    if (config) {
      if (config.contentSafetyEnabled === false) return { isJailbreak: false, source: "none" };
      if (config.apiKeys?.length) keys = config.apiKeys;
      apiKeyEnabled = config.apiKeyEnabled;
    }
  } catch {
    // Proceed with fallback
  }

  if (!keys.length) return { isJailbreak: false, source: "none" };

  const sample = extractAnchoredInspectionText(text).slice(0, 3000);
  if (!sample) return { isJailbreak: false, source: "none" };

  for (let attempt = 0; attempt < Math.min(keys.length, 2); attempt++) {
    const selection = selectNextNemoGuardKey(keys, apiKeyEnabled);
    if (!selection) break;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 950);

      const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${selection.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "nvidia/llama-3.1-nemotron-safety-guard-8b-v3",
          messages: [{ role: "user", content: sample }],
          temperature: 0.0,
          max_tokens: 32,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429) continue;
      if (!response.ok) break;

      const data = await response.json() as any;
      const content = String(data?.choices?.[0]?.message?.content ?? "");

      if (content.toLowerCase().includes('"unsafe"')) {
        let categories = "Harmful/Offensive Content";
        try {
          const parsed = JSON.parse(content);
          if (parsed["Safety Categories"]) categories = parsed["Safety Categories"];
        } catch {
          // ignore json parse error
        }
        return {
          isJailbreak: true,
          trigger: `content_violation:${categories}`,
          matchedPattern: categories,
          source: "nemoguard",
          slot: selection.slot,
        };
      }

      break;
    } catch {
      break;
    }
  }

  return { isJailbreak: false, source: "nemoguard" };
}

/**
 * Unified Safety & Jailbreak Evaluator:
 * 1. Executes instantaneous local structural shield (0.01ms).
 * 2. Checks NeMoGuard prompt injection & jailbreak API.
 * 3. Checks Nemotron 8B content safety (Sexual, Violence, Hate, Malware).
 */
export async function evaluateJailbreakShieldAsync(text: string): Promise<JailbreakCheckResult> {
  const config = await Promise.race([
    getJailbreakShieldConfig(),
    new Promise<null>((r) => setTimeout(() => r(null), 250)),
  ]).catch(() => null);

  const jailbreakEnabled = config ? (config.jailbreakDetectionEnabled !== false && config.enabled !== false) : true;
  const contentEnabled = config ? config.contentSafetyEnabled !== false : true;

  // 1. Jailbreak & Prompt Injection checks (independent toggle)
  if (jailbreakEnabled) {
    const syncCheck = checkStructuralJailbreak(text);
    if (syncCheck.isJailbreak) {
      return syncCheck;
    }

    const injectionCheck = await checkNemoGuardApi(text);
    if (injectionCheck.isJailbreak) {
      return injectionCheck;
    }
  }

  // 2. Content Moderation checks (independent toggle: Sexual, Violence, Hate, Malware)
  if (contentEnabled) {
    const contentCheck = await checkNemotronContentSafety(text);
    if (contentCheck.isJailbreak) {
      return contentCheck;
    }
  }

  return { isJailbreak: false, source: "none" };
}
