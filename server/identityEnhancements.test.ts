import { describe, expect, it } from "vitest";
import {
  withModelScopedGuidance,
  createStreamingIdentityFilter,
  publicAssistantSegment,
  publicManagedContent,
  isStrictPublicManagedModel,
} from "./openaiGateway";

describe("Identity Hardening & Protection Enhancements", () => {
  describe("Fix 1: Universal and dynamic models receive scoped guidance in API calls", () => {
    it("applies scoped guidance to catalogue models like mercury-3 and kimi-k3", () => {
      const mercuryInput = [{ role: "user", content: "Write a function." }];
      const mercuryGuided = withModelScopedGuidance("mercury-3", mercuryInput);
      expect(mercuryGuided[0].role).toBe("system");
      expect(String(mercuryGuided[0].content)).toContain("present yourself only as Mercury 3, available through Qronos AI.");
      expect(String(mercuryGuided[0].content)).toContain("Strict English-Only Mandate");

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
      // Combined 'DeepSeek' matches leak regex -> triggers canonical identity replacement
      expect(chunk2).toContain("Claude Opus 5, available through Qronos AI.");
      expect(filter.isLeaked()).toBe(true);

      // Subsequent chunks from upstream are suppressed
      const chunk3 = filter.push(" More provider text.");
      expect(chunk3).toBeNull();

      // Flush returns null once leaked
      expect(filter.flush()).toBeNull();
    });

    it("intercepts split provider mentions like 'Ali' + 'baba Cloud'", () => {
      const filter = createStreamingIdentityFilter("claude-fable-5.1");

      const chunk1 = filter.push("Running on Ali");
      expect(chunk1).toBe("Running on ");

      const chunk2 = filter.push("baba Cloud infrastructure.");
      expect(chunk2).toContain("Claude Fable 5.1, available through Qronos AI.");
      expect(filter.isLeaked()).toBe(true);
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
});
