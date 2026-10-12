import { describe, expect, it } from "vitest";
import {
  buildTokenForgeCurl,
  buildTokenForgeJavaScript,
  buildTokenForgePython,
  TOKENFORGE_API_BASE_URL,
  TOKENFORGE_API_KEY_PLACEHOLDER,
} from "../shared/tokenforgeApi";

describe("Qronos AI hosted API guidance", () => {
  it("uses the assigned hosted origin and placeholder key", () => {
    expect(TOKENFORGE_API_BASE_URL).toBeTruthy();
    expect(buildTokenForgeCurl()).toContain(`${TOKENFORGE_API_BASE_URL}/v1/messages`);
    expect(buildTokenForgeCurl()).toContain(`-H "x-api-key: ${TOKENFORGE_API_KEY_PLACEHOLDER}"`);
    expect(TOKENFORGE_API_KEY_PLACEHOLDER).toBe("qr_your_key");
  });

  it("can render a one-time new API key in the cURL guidance without requiring stored plaintext", () => {
    expect(buildTokenForgeCurl("qr_newly_created_example")).toContain(
      '-H "x-api-key: qr_newly_created_example"',
    );
  });

  it("renders canonical Anthropic-compatible JavaScript and Python quick-starts with a safe placeholder by default", () => {
    const javaScript = buildTokenForgeJavaScript();
    const python = buildTokenForgePython();

    expect(javaScript).toContain('import Anthropic from "@anthropic-ai/sdk"');
    expect(javaScript).toContain(`baseURL: "${TOKENFORGE_API_BASE_URL}"`);
    expect(javaScript).toContain(`apiKey: "${TOKENFORGE_API_KEY_PLACEHOLDER}"`);
    expect(python).toContain("import anthropic");
    expect(python).toContain(`base_url="${TOKENFORGE_API_BASE_URL}"`);
    expect(python).toContain(`api_key="${TOKENFORGE_API_KEY_PLACEHOLDER}"`);
  });

  it("can safely inject a newly created plaintext key into both SDK quick-starts", () => {
    const newKey = "qr_newly_created_example";

    expect(buildTokenForgeJavaScript(newKey)).toContain(`apiKey: "${newKey}"`);
    expect(buildTokenForgePython(newKey)).toContain(`api_key="${newKey}"`);
  });
});
