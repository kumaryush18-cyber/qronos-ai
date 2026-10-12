import { PUBLIC_ORIGIN } from "./const";
export const QRONOS_API_BASE_URL = PUBLIC_ORIGIN;
export const QRONOS_MESSAGES_URL = `${QRONOS_API_BASE_URL}/v1/messages`;
export const QRONOS_CHAT_COMPLETIONS_URL = `${QRONOS_API_BASE_URL}/v1/chat/completions`;
export const QRONOS_API_KEY_PLACEHOLDER = "qr_your_key";

// Backward-compatible aliases
export const TOKENFORGE_API_BASE_URL = QRONOS_API_BASE_URL;
export const TOKENFORGE_MESSAGES_URL = QRONOS_MESSAGES_URL;
export const TOKENFORGE_CHAT_COMPLETIONS_URL = QRONOS_CHAT_COMPLETIONS_URL;
export const TOKENFORGE_API_KEY_PLACEHOLDER = QRONOS_API_KEY_PLACEHOLDER;

export function buildQronosCurl(apiKey = QRONOS_API_KEY_PLACEHOLDER): string {
  return `curl ${QRONOS_MESSAGES_URL} \\
  -H "x-api-key: ${apiKey}" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "content-type: application/json" \\
  -d '{
    "model": "glm-5.3",
    "max_tokens": 1024,
    "messages": [{
      "role": "user",
      "content": "Explain vector search in three lines."
    }]
  }'`;
}
export const buildTokenForgeCurl = buildQronosCurl;

export function buildQronosJavaScript(apiKey = QRONOS_API_KEY_PLACEHOLDER): string {
  return `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: "${apiKey}",
  baseURL: "${QRONOS_API_BASE_URL}",
});

const message = await client.messages.create({
  model: "glm-5.3",
  max_tokens: 1024,
  messages: [{
    role: "user",
    content: "Explain vector search in three lines.",
  }],
});

console.log(message.content[0]?.text);`;
}
export const buildTokenForgeJavaScript = buildQronosJavaScript;

export function buildQronosPython(apiKey = QRONOS_API_KEY_PLACEHOLDER): string {
  return `import anthropic

client = anthropic.Anthropic(
    api_key="${apiKey}",
    base_url="${QRONOS_API_BASE_URL}",
)

message = client.messages.create(
    model="glm-5.3",
    max_tokens=1024,
    messages=[{
        "role": "user",
        "content": "Explain vector search in three lines.",
    }],
)

print(message.content[0].text)`;
}
export const buildTokenForgePython = buildQronosPython;

export function buildQronosClaudeCode(apiKey = QRONOS_API_KEY_PLACEHOLDER): string {
  return `export ANTHROPIC_BASE_URL="${QRONOS_API_BASE_URL}"
export ANTHROPIC_API_KEY="${apiKey}"
claude`;
}
export const buildTokenForgeClaudeCode = buildQronosClaudeCode;
