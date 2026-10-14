import { useState } from "react";
import { Link } from "wouter";
import { PublicNav } from "@/components/PublicNav";
import { PublicFooter } from "@/pages/Models";
import { StarButton } from "@/components/StarButton";
import { QRONOS_MODELS } from "@/lib/modelCatalogue";
import {
  Terminal,
  KeyRound,
  ShieldCheck,
  Zap,
  Copy,
  Check,
  Search,
  BookOpen,
  ArrowRight,
  ExternalLink,
  Code2,
  RefreshCw,
  Layers,
  Cpu,
  AlertCircle,
  FileCode,
  Sliders,
  Database,
  Radio,
  Lock,
  Sparkles,
} from "lucide-react";
import "./infergate-docs-legal.css";

const BASE_URL = "https://api.qronos.me/v1";

interface CodeBlockProps {
  title: string;
  lang?: string;
  code: string;
}

function CodeBlock({ title, lang = "bash", code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="infergate-code-panel rounded-2xl overflow-hidden border border-white/[0.08] bg-[#090b10] shadow-xl my-4">
      <div className="infergate-code-bar px-4 py-2.5 bg-black/60 border-b border-white/[0.06] flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2 text-zinc-300">
          <Terminal size={13} className="text-zinc-400" />
          <span className="font-semibold">{title}</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white transition text-xs font-mono cursor-pointer border border-white/05"
        >
          {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="p-4 sm:p-5 overflow-x-auto text-xs sm:text-[13px] font-mono leading-relaxed text-zinc-200 bg-transparent">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function Docs() {
  const [activeSection, setActiveSection] = useState("overview");
  const [searchFilter, setSearchFilter] = useState("");

  const menuSections = [
    {
      group: "Getting Started",
      items: [
        { id: "overview", label: "Architecture Overview" },
        { id: "quickstart", label: "2-Minute Quickstart" },
        { id: "authentication", label: "Authentication & Keys" },
      ],
    },
    {
      group: "Gateway Protocols",
      items: [
        { id: "messages-api", label: "Anthropic Messages API" },
        { id: "openai-api", label: "OpenAI Chat Completions" },
        { id: "streaming", label: "SSE Stream Protocol" },
        { id: "tool-calling", label: "Function & Tool Calling" },
        { id: "reasoning-tokens", label: "Thinking & Reasoning Tokens" },
      ],
    },
    {
      group: "Developer Tooling",
      items: [
        { id: "claude-code", label: "Claude Code CLI Setup" },
        { id: "ide-integration", label: "Cursor & Windsurf IDE" },
        { id: "sdks", label: "SDKs (Python / TypeScript)" },
      ],
    },
    {
      group: "Platform Mechanics",
      items: [
        { id: "failover", label: "Key Pooling & 429 Failover" },
        { id: "billing-math", label: "Nanodollar Token Accounting" },
        { id: "context-scaling", label: "Context Compaction Scaling" },
        { id: "models", label: "Verified Model Catalogue" },
        { id: "errors", label: "Error Codes & Diagnostics" },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-[#08090d] text-white flex flex-col font-sans selection:bg-white/20 selection:text-white relative overflow-x-hidden">
      {/* Background Ambience (No Spiral / No Grid) */}
      <div className="infergate-doc-glow" />

      <PublicNav />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16 flex-1 w-full grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* =========================================================
            STICKY INTERACTIVE SIDEBAR
        ========================================================= */}
        <aside className="lg:col-span-3 lg:sticky lg:top-24 lg:self-start lg:h-[calc(100vh-120px)] lg:overflow-y-auto pr-2 scrollbar-none space-y-6">
          {/* Quick Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search reference..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-white/30 font-mono transition-all"
            />
          </div>

          <div className="space-y-6">
            {menuSections.map((group) => {
              const filteredItems = group.items.filter((item) =>
                item.label.toLowerCase().includes(searchFilter.toLowerCase())
              );
              if (filteredItems.length === 0) return null;

              return (
                <div key={group.group}>
                  <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 font-semibold mb-2 px-2">
                    {group.group}
                  </div>
                  <div className="space-y-1">
                    {filteredItems.map((item) => (
                      <a
                        key={item.id}
                        href={`#${item.id}`}
                        onClick={() => setActiveSection(item.id)}
                        className={`block px-3 py-2 rounded-xl text-xs font-mono transition-all flex items-center justify-between ${
                          activeSection === item.id
                            ? "bg-white/[0.08] text-white border border-white/20 font-semibold shadow-sm"
                            : "text-zinc-400 hover:text-white hover:bg-white/[0.03]"
                        }`}
                      >
                        <span>{item.label}</span>
                        {activeSection === item.id && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </a>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Base URL Pill */}
          <div className="p-3.5 rounded-xl border border-white/10 bg-white/[0.02] font-mono text-xs space-y-1">
            <div className="text-[10px] uppercase text-zinc-500">Universal Endpoint</div>
            <div className="text-white text-xs truncate font-medium">https://api.qronos.me/v1</div>
          </div>
        </aside>

        {/* =========================================================
            DOCUMENTATION CONTENT ARTICLE
        ========================================================= */}
        <article className="lg:col-span-9 min-w-0 space-y-16">
          {/* Top Header Block */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-8 border-b border-white/[0.08]">
            <div>
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-white/10 text-xs font-mono text-zinc-300 mb-3 backdrop-blur-md">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>QRONOS AI · TECHNICAL REFERENCE</span>
              </div>
              <h1 className="text-3xl sm:text-5xl font-light text-white tracking-tight">
                Developer Documentation
              </h1>
            </div>
            <Link href="/signup">
              <StarButton backgroundColor="#000000" className="rounded-full border border-slate-200/50 px-5 text-xs font-mono">
                <span>GET API KEY</span>
                <span className="ml-1 tracking-tighter font-mono font-bold text-xs">»</span>
              </StarButton>
            </Link>
          </div>

          {/* SECTION: Overview */}
          <section id="overview" className="scroll-mt-24 space-y-4">
            <h2 className="text-2xl font-bold text-white tracking-tight">Architecture Overview</h2>
            <p className="text-base text-zinc-300 leading-relaxed">
              Qronos AI is an enterprise-grade LLM gateway and intelligent reverse proxy designed to unify
              heterogeneous AI model providers under standard client protocols. It delivers bi-directional protocol
              normalization, autonomous provider failover, encrypted credential pooling, and sub-millisecond routing
              telemetry.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08]">
                <div className="text-[11px] font-mono text-zinc-500 uppercase">Latency Overhead</div>
                <div className="text-2xl font-light text-white font-mono mt-1">&lt; 14ms P95</div>
                <div className="text-xs text-zinc-500 mt-1">Direct stream pass-through</div>
              </div>
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08]">
                <div className="text-[11px] font-mono text-zinc-500 uppercase">Provider Pooling</div>
                <div className="text-2xl font-light text-white font-mono mt-1">15 Slots / Key</div>
                <div className="text-xs text-zinc-500 mt-1">Automatic 429 rotation</div>
              </div>
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08]">
                <div className="text-[11px] font-mono text-zinc-500 uppercase">Protocol Fidelity</div>
                <div className="text-2xl font-light text-white font-mono mt-1">100% Native</div>
                <div className="text-xs text-zinc-500 mt-1">Anthropic & OpenAI bidirectional</div>
              </div>
            </div>
          </section>

          {/* SECTION: Quickstart */}
          <section id="quickstart" className="scroll-mt-24 space-y-4 pt-8 border-t border-white/[0.08]">
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <Zap size={20} className="text-zinc-400" />
              <span>2-Minute Quickstart</span>
            </h2>
            <p className="text-sm text-zinc-300 leading-relaxed">
              You do not need to install custom client libraries or rewrite your application logic. Simply point your
              existing client to the Qronos AI gateway endpoint and provide your API key.
            </p>

            <CodeBlock
              title="cURL Test Request (Anthropic Messages API)"
              code={`curl https://api.qronos.me/v1/messages \\
  -H "x-api-key: qr_your_qronos_key" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "content-type: application/json" \\
  -d '{
    "model": "claude-opus-5.5",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Explain quantum teleportation in 2 sentences."}
    ]
  }'`}
            />

            <div className="p-4 rounded-xl border border-white/10 bg-white/[0.02] text-xs text-zinc-300">
              <strong className="text-white">Instant Migration Tip:</strong> If you are using OpenAI SDKs, change the endpoint URL to <code>https://api.qronos.me/v1</code>. Qronos AI serves both <code>/v1/messages</code> and <code>/v1/chat/completions</code> from the same root base URL.
            </div>
          </section>

          {/* SECTION: Authentication */}
          <section id="authentication" className="scroll-mt-24 space-y-4 pt-8 border-t border-white/[0.08]">
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <KeyRound size={20} className="text-zinc-400" />
              <span>Authentication & Key Custody</span>
            </h2>
            <p className="text-sm text-zinc-300 leading-relaxed">
              Every request to Qronos AI must be authenticated using an API key generated in your Developer Dashboard.
              Qronos AI keys start with the prefix <code>qr_</code> followed by 256 bits of cryptographically secure
              entropy.
            </p>

            <div className="rounded-xl border border-white/[0.08] overflow-hidden bg-black/40">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-white/[0.04] text-zinc-400 uppercase tracking-wider">
                  <tr>
                    <th className="p-3">Header Name</th>
                    <th className="p-3">Example Value</th>
                    <th className="p-3">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06] text-zinc-300">
                  <tr>
                    <td className="p-3 font-semibold text-white">x-api-key</td>
                    <td className="p-3">qr_9f8a...</td>
                    <td className="p-3">Anthropic Messages standard header</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-white">Authorization</td>
                    <td className="p-3">Bearer qr_9f8a...</td>
                    <td className="p-3">OpenAI standard Bearer token format</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* SECTION: Claude Code CLI */}
          <section id="claude-code" className="scroll-mt-24 space-y-4 pt-8 border-t border-white/[0.08]">
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <Terminal size={20} className="text-zinc-400" />
              <span>Claude Code CLI Integration</span>
            </h2>
            <p className="text-sm text-zinc-300 leading-relaxed">
              Qronos AI provides full, native emulation for Anthropic's official <strong>Claude Code CLI</strong> tool.
              Our gateway handles compaction scaling and thinking token histories so you can run complex, multi-agent
              coding sessions without hitting rate limits or compaction crashes.
            </p>

            <CodeBlock
              title="Terminal Environment Setup (~/.bashrc or ~/.zshrc)"
              code={`export ANTHROPIC_BASE_URL="https://api.qronos.me/v1"
export ANTHROPIC_API_KEY="qr_your_qronos_key"

# Run Claude Code CLI
claude`}
            />
          </section>

          {/* SECTION: Cursor & Windsurf IDE */}
          <section id="ide-integration" className="scroll-mt-24 space-y-4 pt-8 border-t border-white/[0.08]">
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <Code2 size={20} className="text-zinc-400" />
              <span>Cursor & Windsurf IDE Integration</span>
            </h2>
            <p className="text-sm text-zinc-300 leading-relaxed">
              Use Qronos AI as your unified intelligence backend inside Cursor or Windsurf by updating your custom model
              endpoint in Settings.
            </p>

            <CodeBlock
              title="Cursor IDE Settings -> Models"
              lang="json"
              code={`{
  "openai.baseUrl": "https://api.qronos.me/v1",
  "openai.apiKey": "qr_your_qronos_key",
  "anthropic.baseUrl": "https://api.qronos.me/v1",
  "anthropic.apiKey": "qr_your_qronos_key"
}`}
            />
          </section>

          {/* SECTION: Key Pooling & 429 Failover */}
          <section id="failover" className="scroll-mt-24 space-y-4 pt-8 border-t border-white/[0.08]">
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <Layers size={20} className="text-zinc-400" />
              <span>Multi-Slot Key Pooling & 429 Failover</span>
            </h2>
            <p className="text-sm text-zinc-300 leading-relaxed">
              Qronos AI manages up to 15 upstream API key slots per provider. When an upstream key returns HTTP 429 or
              503, the request is transparently re-routed to the next available healthy key slot in under 8ms without
              dropping the client connection.
            </p>
          </section>

          {/* Bottom Activation Banner with StarButton */}
          <div className="mt-16 p-8 rounded-3xl bg-neutral-900/90 border border-white/10 backdrop-blur-xl flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-white tracking-tight">Ready to integrate Qronos AI?</h3>
              <p className="text-sm text-zinc-400">
                Generate an API key in seconds and route all your AI workloads through one unified endpoint.
              </p>
            </div>
            <Link href="/signup">
              <StarButton backgroundColor="#000000" className="rounded-full border border-slate-200/50 px-6 py-2.5 text-xs font-mono">
                <span>GET STARTED</span>
                <span className="ml-1 tracking-tighter font-mono font-bold text-xs">»</span>
              </StarButton>
            </Link>
          </div>
        </article>
      </main>

      <PublicFooter />
    </div>
  );
}
