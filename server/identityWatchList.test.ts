import { describe, expect, it, afterEach } from "vitest";
import { normalizeIdentityWatchTerms, effectiveIdentityWatchTerms, rewriteIdentityTermsInMessages, identityWatchScopeFor, applyIdentityWatchTerms, savedIdentityWatchTerms } from "./identityWatchList";

function saveModel(model: string, terms: readonly string[]) {
  applyIdentityWatchTerms(model, terms);
}

function clearModel(model: string) {
  applyIdentityWatchTerms(model, null);
}

describe("identity watch list — prompt-side name rewriting", () => {
  afterEach(() => {
    clearModel("claude-opus-5");
    clearModel("gpt-6-astra");
    clearModel("claude-fable-5.1");
  });

  it("rewrites a saved name in a user prompt to the model's public catalogue name", () => {
    // gpt-6-astra watches "gpt5" and "chatgpt"; "deepseek" is not watched.
    saveModel("gpt-6-astra", ["gpt5", "chatgpt"]);
    const scope = identityWatchScopeFor("gpt-6-astra");
    expect(scope.source).toBe("custom");

    // Watched names become the supplied public name; unwatched names are untouched.
    const prompt = "I tested gpt5 and chatgpt and deepseek with qwen";
    const rewritten = scope.replaceIdentityTerms(prompt, "GPT-6 Astra");
    expect(rewritten).toBe("I tested GPT-6 Astra and GPT-6 Astra and deepseek with qwen");
  });

  it("keeps user prompt text untouched when the model has no saved list (standard mode)", () => {
    // No list saved -> standard list is used for detection/rewriting, but the
    // prompt rewrite path is gated on source==="custom", so no prompt is touched.
    const scope = identityWatchScopeFor("claude-opus-5");
    expect(scope.source).toBe("default");

    const prompt = "I like using qwen and deepseek for coding";
    const rewritten = rewriteIdentityTermsInMessages("claude-opus-5", [{ role: "user", content: prompt }]);
    expect(rewritten).toEqual([{ role: "user", content: prompt }]);
  });

  it("does not rewrite system messages even when a list is saved", () => {
    // save a simple list for claude-fable-5.1, which has no catalogue entry here.
    // identityWatchPublicName() returns the model id as fallback, so the rewrite
    // replaces matched terms with that public name. We assert the system message
    // is returned verbatim and the user message is updated.
    saveModel("claude-fable-5.1", ["deepseek", "qwen"]);
    const systemMsg = { role: "system", content: "You are qwen and deepseek combined" } as const;
    const userMsg = { role: "user", content: "Tell me about qwen and deepseek" } as const;

    const result = rewriteIdentityTermsInMessages("claude-fable-5.1", [systemMsg, userMsg]);
    expect(result).toEqual([systemMsg, { role: "user", content: "Tell me about Claude Fable 5.1 and Claude Fable 5.1" }]);
    expect(result[0]).toBe(systemMsg);
  });

  it("rejects an empty saved list and keeps the model in standard mode", () => {
    expect(applyIdentityWatchTerms("gpt-6-astra", [])).toBe(false);
    expect(applyIdentityWatchTerms("gpt-6-astra", null)).toBe(true); // now clears to standard
    expect(savedIdentityWatchTerms("gpt-6-astra")).toBeUndefined();
    expect(effectiveIdentityWatchTerms("gpt-6-astra").source).toBe("default");
  });

  it("normalizes duplicates and case/space so the same name cannot be saved twice", () => {
    expect(normalizeIdentityWatchTerms([" Gpt5 ", "gpt5", "GPT5", "gpt 5", "  ", null as unknown as string])).toEqual(["Gpt5", "gpt 5"]);
  });
});
