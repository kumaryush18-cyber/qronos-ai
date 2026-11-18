/**
 * Which client sent a gateway request.
 *
 * The editor extension and the terminal CLI are different tools that share one
 * backend: the extension spawns it with QRONOS_CLIENT=vscode and a standalone
 * CLI defaults to cli. The backend forwards that as the `x-qronos-client`
 * header, so the admin live-request panel can tell them apart. Requests from
 * scripts and third-party SDKs carry neither signal and stay "api".
 */
export type ClientTag = "code" | "cli" | "api";

const CODE_HEADER_VALUES = new Set(["code", "vscode", "qronos-code", "extension"]);
const CLI_HEADER_VALUES = new Set(["cli", "acp", "tui", "terminal"]);

/**
 * Resolve the client tag from explicit headers first, then the user agent.
 * Unknown callers are "api" rather than a guess, so a wrong badge is impossible
 * for traffic we cannot identify.
 */
export function resolveClientTag(req: { headers: Record<string, unknown> }): ClientTag {
  const header = String(req.headers["x-qronos-client"] ?? "").trim().toLowerCase();
  if (CODE_HEADER_VALUES.has(header)) return "code";
  if (CLI_HEADER_VALUES.has(header)) return "cli";

  const userAgent = String(req.headers["user-agent"] ?? "").toLowerCase();
  // Both clients send "Qronos-Code/<version>" today, so the user agent alone
  // cannot separate them; only an explicit "vscode" marker can.
  if (userAgent.includes("qronos-code-vscode")) return "code";
  if (userAgent.includes("qronos-code")) return "code";
  if (userAgent.includes("qronos")) return "cli";
  return "api";
}

export const CLIENT_TAG_LABELS: Record<ClientTag, string> = {
  code: "Qronos Code",
  cli: "Qronos CLI",
  api: "API",
};
