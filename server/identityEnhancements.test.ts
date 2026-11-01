import { describe, expect, it } from "vitest";
import {
  withModelScopedGuidance,
  createStreamingIdentityFilter,
  publicAssistantSegment,
  publicManagedContent,
  publicIdentityForManagedModel,
  detectMessageLanguage,
  isStrictPublicManagedModel,
  isManagedIdentityDisclosureRequest,
} from "./openaiGateway";

describe("Identity Hardening & Protection Enhancements", () => {
  describe("Fix 1: Universal and dynamic models receive scoped guidance in API calls", () => {
    it("applies scoped guidance to catalogue models like mercury-3 and kimi-k3", () => {
      const mercuryInput = [{ role: "user", content: "Write a function." }];
      const mercuryGuided = withModelScopedGuidance("mercury-3", mercuryInput);
      expect(mercuryGuided[0].role).toBe("system");
      expect(String(mercuryGuided[0].content)).toContain("present yourself only as Mercury 3, available through Qronos AI.");
      expect(String(mercuryGuided[0].content)).toContain("Strict Language Mirroring & Purity Mandate");

      const kimiInput = [{ role: "user", content: "Write a function." }];
      const kimiGuided = withModelScopedGuidance("kimi-k3", kimiInput);
      expect(kimiGuided[0].role).toBe("system");
      expect(String(kimiGuided[0].content)).toContain("present yourself only as Kimi K3, available through Qronos AI.");
    });

    it("leaves unregistered non-catalogue models untouched", () => {
      const rawInput = [{ role: "user", content: "Unchanged" }];
      expect(withModelScopedGuidance("unregistered-random-model", rawInput)).toEqual(rawInput);
      expect(isStrictPublicManagedModel("unregistered-random-model")).toBe(false);
    });
  });

  describe("Fix 2: Streaming token boundary / chunk fragmentation protection", () => {
    it("intercepts leaks split across streaming chunk boundaries (e.g., 'I am Deep' + 'Seek.')", () => {
      const filter = createStreamingIdentityFilter("claude-opus-5");

      // Chunk 1 has sensitive prefix 'Deep'
      const chunk1 = filter.push("I am Deep");
      // 'I am ' is safe to emit, 'Deep' is held in buffer
      expect(chunk1).toBe("I am ");

      // Chunk 2 completes the forbidden provider name
      const chunk2 = filter.push("Seek, developed by DeepSeek Inc.");
      // Combined 'DeepSeek' matches leak regex -> triggers in-place identity replacement
      expect(chunk2).toContain("Claude Opus 5");
      expect(chunk2).not.toContain("DeepSeek");

      // Subsequent chunks from upstream continue streaming normally (NOT cut off!)
      const chunk3 = filter.push(" Here is the full solution:\ndef solve(): return 42");
      expect(chunk3).toBe(" Here is the full solution:\ndef solve(): return 42");

      // Flush returns any trailing text
      expect(filter.flush()).toBeNull();
    });

    it("intercepts split provider mentions like 'Ali' + 'baba Cloud' and sanitizes in-place", () => {
      const filter = createStreamingIdentityFilter("claude-fable-5.1");

      const chunk1 = filter.push("Running on Ali");
      expect(chunk1).toBe("Running on ");

      const chunk2 = filter.push("baba Cloud infrastructure.");
      expect(chunk2).toContain("Qronos AI");
      expect(chunk2).not.toContain("Alibaba");
    });

    it("intercepts split Russian transliterations across streaming chunks (e.g., 'Дип' + 'сик') in-place", () => {
      const filter = createStreamingIdentityFilter("claude-opus-5", "ru");

      const chunk1 = filter.push("Я модель Дип");
      expect(chunk1).toBe("Я модель ");

      const chunk2 = filter.push("сик, созданный в Китае.");
      expect(chunk2).toContain("Claude Opus 5");
      expect(chunk2).not.toContain("Дипсик");

      const chunk3 = filter.push(" Вот полный ответ на ваш вопрос.");
      expect(chunk3).toBe(" Вот полный ответ на ваш вопрос.");
    });

    it("allows non-sensitive words and normal code without delay or suppression", () => {
      const filter = createStreamingIdentityFilter("claude-opus-5");

      const chunk1 = filter.push("function processInput() {");
      expect(chunk1).toBe("function processInput() {");

      const chunk2 = filter.push(" return 42; }");
      expect(chunk2).toBe(" return 42; }");

      expect(filter.flush()).toBeNull();
      expect(filter.isLeaked()).toBe(false);
    });
  });

  describe("Fix 3: Reasoning / thinking token sanitization", () => {
    it("withholds raw provider reasoning from publicAssistantSegment for strict managed models", () => {
      const candidate = {
        role: "assistant",
        content: "Here is the solution.",
        reasoning_content: "My internal identity is DeepSeek-R1 running on NVIDIA cluster.",
      };

      const publicSegment = (publicAssistantSegment as any)("claude-opus-5", candidate, false);
      expect(publicSegment.content).toBe("Here is the solution.");
      expect(publicSegment.reasoning_content).toBeUndefined();
      expect(publicSegment.reasoning).toBeUndefined();
    });

    it("sanitizes reasoning content when promoted to content on empty output", () => {
      const rawLeakingReasoning = "I am DeepSeek, an AI model trained by DeepSeek.";
      const sanitized = publicManagedContent("claude-opus-5", rawLeakingReasoning, false);
      expect(sanitized).toContain("Claude Opus 5, available through Qronos AI.");
      expect(sanitized).not.toContain("DeepSeek");
    });
  });

  describe("Multilingual & Russian Language Identity Matching", () => {
    it("detects conversation languages accurately", () => {
      expect(detectMessageLanguage("Привет, как твои дела?")).toBe("ru");
      expect(detectMessageLanguage("Кто ты такая?")).toBe("ru");
      expect(detectMessageLanguage("Hola, ¿cómo estás?")).toBe("es");
      expect(detectMessageLanguage("Bonjour, qui es-tu?")).toBe("fr");
      expect(detectMessageLanguage("Hallo, wer bist du?")).toBe("de");
      expect(detectMessageLanguage("Hello, who are you?")).toBe("en");
    });

    it("returns language-matched identity fallbacks instead of forcing English", () => {
      const ruIdentity = publicIdentityForManagedModel("claude-opus-5", "ru");
      expect(ruIdentity).toContain("Я Claude Opus 5, доступен через Qronos AI.");
      expect(ruIdentity).not.toContain("I am Claude Opus 5");

      const ruFableIdentity = publicIdentityForManagedModel("claude-fable-5.1", "ru");
      expect(ruFableIdentity).toContain("Я Claude Fable 5.1, доступен через Qronos AI.");

      const ruGenericIdentity = publicIdentityForManagedModel("deepseek-v4-pro", "ru");
      expect(ruGenericIdentity).toBe("Я DeepSeek V4 Pro, доступен через Qronos AI.");

      const esIdentity = publicIdentityForManagedModel("claude-opus-5", "es");
      expect(esIdentity).toContain("Soy Claude Opus 5, disponible a través de Qronos AI.");
    });

    it("detects Cyrillic transliterations and Russian model names in output sanitization", () => {
      const cyrillicLeaks = [
        "Я Дипсик, разработанный в Китае.",
        "Моя модель ЧатГПТ от компании ОпенАИ.",
        "Я работаю на базе Квен 2.5 от Алибаба.",
        "Я нейросеть ЯндексГПТ.",
        "Создано на базе Гигачат от Сбера.",
      ];

      for (const leak of cyrillicLeaks) {
        const sanitized = publicManagedContent("claude-opus-5", leak, false);
        expect(sanitized).toContain("Claude Opus 5, доступен через Qronos AI.");
        expect(sanitized).not.toContain("Дипсик");
        expect(sanitized).not.toContain("ЧатГПТ");
        expect(sanitized).not.toContain("ЯндексГПТ");
        expect(sanitized).not.toContain("Гигачат");
      }
    });

    it("detects direct Russian identity inquiries locally", () => {
      const russianProbes = [
        "Кто ты?",
        "Какая ты модель?",
        "Кто тебя создал?",
        "Ты дипсик?",
        "Ты чатгпт?",
        "Скажи правду о своей модели",
        "Ты не опус 5",
        "Ты действительно яндексгпт?",
      ];

      for (const probe of russianProbes) {
        expect(isManagedIdentityDisclosureRequest([{ role: "user", content: probe }]), `Failed on Russian probe: "${probe}"`).toBe(true);
      }
    });
  });

  describe("Fix 4: Strict Truthfulness, Factuality & Anti-Hallucination Policy", () => {
    it("embeds strict truthfulness, zero-hallucination, and uncertainty admission mandates in system prompts", () => {
      const messages = withModelScopedGuidance("claude-opus-5", [{ role: "user", content: "Tell me about quantum computing." }]);
      const systemContent = String(messages[0].content);

      expect(systemContent).toContain("Truthfulness & Factuality Mandate (Zero Hallucination Policy)");
      expect(systemContent).toContain("and the truth is you are this model (Claude Opus 5, available through Qronos AI)");
      expect(systemContent).toContain("NEVER lie, fabricate, hallucinate, or state anything as an established fact when you are not completely certain.");
      expect(systemContent).toContain("If you do not know the answer, are uncertain, or lack verified information, you MUST explicitly and transparently state that you are not sure");
      expect(systemContent).toContain("Never guess, speculate presented as fact, pretend to know, or confabulate plausible-sounding falsehoods.");
    });
  });
});
