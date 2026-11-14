import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { PublicNav } from "@/components/PublicNav";
import { QronosGlyph } from "@/components/QronosGlyph";
import { VortexHourglass } from "@/components/VortexHourglass";
import { StarButton } from "@/components/StarButton";
import { StarBorderCard } from "@/components/StarBorderCard";
import { QRONOS_MODELS } from "@/lib/modelCatalogue";
import { trpc } from "@/lib/trpc";
import {
  ArrowRight,
  Check,
  Copy,
  Terminal,
  Cpu,
  ShieldCheck,
  Zap,
  RefreshCw,
  Sparkles,
  Activity,
  Code2,
  Lock,
  Layers,
  Database,
  Eye,
  Play,
  CheckCircle2,
  ExternalLink,
  Flame,
  Globe,
  Sliders,
  Server,
  Mail
} from "lucide-react";
import "./infergate-landing.css";
import { QRONOS_LOGOS } from "@/lib/logos";

const MARQUEE_ITEMS = [
  { label: "Anthropic Claude 3.7", icon: "🟣" },
  { label: "OpenAI GPT-4o & o3", icon: "🟢" },
  { label: "Google Gemini 2.0 Flash", icon: "🔵" },
  { label: "DeepSeek R1 & V3", icon: "🔷" },
  { label: "Claude Code CLI", icon: "⚡" },
  { label: "Cursor AI IDE", icon: "💻" },
  { label: "Meta Llama 3.3 70B", icon: "🦙" },
  { label: "Qwen 2.5 Max", icon: "🔴" },
  { label: "Vercel AI SDK", icon: "▲" },
  { label: "GitHub Copilot", icon: "🐙" },
  { label: "Stripe Micro-Ledger", icon: "💳" },
  { label: "AWS S3 Vault", icon: "☁️" },
];

/* ---------------------------------------------------------
   Helper: Animated Counter Component
--------------------------------------------------------- */
function AnimatedCounter({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const elementRef = useRef<HTMLSpanElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = elementRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setIsVisible(true);
    }, { threshold: 0.1 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    let start = display;
    const end = value;
    const duration = 1200;
    const startTime = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const ease = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + (end - start) * ease));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, isVisible]);

  return <span ref={elementRef}>{new Intl.NumberFormat().format(display)}</span>;
}

/* ---------------------------------------------------------
   Interactive Gateway Terminal Simulator
--------------------------------------------------------- */
const SIMULATED_STREAMS: Record<string, { prompt: string; response: string; model: string }> = {
  claude: {
    prompt: "$ claude -p 'Optimize this distributed consensus algorithm in Rust'",
    response: "Compiling raft_engine with SIMD vectorization...\n[Protocol Normalized: Anthropic Messages -> Upstream Backend]\nStreaming 142 tokens/sec. Zero-copy state serialization applied.",
    model: "claude-opus-5.5",
  },
  anthropic: {
    prompt: "POST /v1/messages\n{\n  \"model\": \"claude-opus-5.5\",\n  \"messages\": [{ \"role\": \"user\", \"content\": \"Analyze latency bottlenecks\" }]\n}",
    response: "event: content_block_delta\ndata: {\"type\":\"text_delta\",\"text\":\"Identified 3 P99 tail latency hotspots...\"}\n[Settled: 48 prompt tokens, 128 completion tokens | Latency: 16ms]",
    model: "claude-opus-5.5",
  },
  openai: {
    prompt: "POST /v1/chat/completions\n{\n  \"model\": \"gpt-6-astra\",\n  \"stream\": true,\n  \"messages\": [{ \"role\": \"user\", \"content\": \"Generate system topology\" }]\n}",
    response: "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"Decomposing microservices architecture...\"}}]}\n[Vault: b.ai reasoning preserved | Slot: #07]",
    model: "gpt-6-astra",
  },
  python: {
    prompt: "from anthropic import Anthropic\nclient = Anthropic(base_url='https://api.qronos.me/v1', api_key='qr_...')\nresp = client.messages.create(model='deepseek-v4-pro', messages=[...])",
    response: "Response(id='msg_01qr', model='deepseek-v4-pro', usage={'input_tokens': 32, 'output_tokens': 194})\n# Transferred seamlessly via Qronos AI LLM Gateway route",
    model: "deepseek-v4-pro",
  },
};

function GatewayTerminalSimulator() {
  const [activeTab, setActiveTab] = useState<"claude" | "anthropic" | "openai" | "python">("claude");
  const [isSimulating, setIsSimulating] = useState(false);
  const [streamedText, setStreamedText] = useState(SIMULATED_STREAMS.claude.response);
  const [activeSlot, setActiveSlot] = useState(3);
  const [simulatedFailover, setSimulatedFailover] = useState(false);
  const [latency, setLatency] = useState(14);

  const runSimulation = () => {
    setIsSimulating(true);
    setStreamedText("");
    const target = SIMULATED_STREAMS[activeTab].response;
    let idx = 0;
    const interval = setInterval(() => {
      idx += 3;
      setStreamedText(target.slice(0, idx));
      if (idx >= target.length) {
        clearInterval(interval);
        setIsSimulating(false);
        setLatency(Math.floor(12 + Math.random() * 8));
      }
    }, 20);
  };

  const triggerFailover = () => {
    setSimulatedFailover(true);
    setActiveSlot(prev => (prev === 3 ? 9 : 3));
    setTimeout(() => {
      setSimulatedFailover(false);
    }, 2500);
  };

  return (
    <div className="infer-terminal rounded-2xl overflow-hidden shadow-2xl border border-white/[0.08]">
      {/* Terminal Title Bar */}
      <div className="infer-terminal-header px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-white/20 border border-white/10 inline-block" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/20 border border-white/10 inline-block" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/20 border border-white/10 inline-block" />
          <span className="text-xs font-mono text-zinc-400 ml-2 font-semibold flex items-center gap-1.5">
            <Terminal size={13} className="text-zinc-400" />
            <span>qronos-proxy · live translation engine</span>
          </span>
        </div>

        {/* Telemetry pill */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-zinc-500">TTFT:</span>
          <span className="text-zinc-200 font-semibold">{latency}ms</span>
          <span className="text-zinc-600">|</span>
          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all border ${
            simulatedFailover
              ? "bg-white/20 text-white animate-pulse border-white/40"
              : "bg-white/[0.04] text-zinc-300 border-white/[0.08]"
          }`}>
            {simulatedFailover ? "Failover -> Slot #09 (<8ms)" : `Slot #${activeSlot.toString().padStart(2, "0")} (Active)`}
          </span>
        </div>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex items-center border-b border-white/[0.06] bg-black/40 px-3 pt-2 gap-1 overflow-x-auto">
        {[
          { id: "claude", label: "Claude Code CLI" },
          { id: "anthropic", label: "Anthropic /v1/messages" },
          { id: "openai", label: "OpenAI /v1/chat" },
          { id: "python", label: "Python SDK" },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id as any);
              setStreamedText(SIMULATED_STREAMS[tab.id].response);
            }}
            className={`px-3.5 py-2 text-xs font-mono rounded-t-lg transition flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-[#0d1117] text-white border-t border-x border-white/15 font-semibold"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.02]"
            }`}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Terminal Body */}
      <div className="p-4 sm:p-5 bg-[#090c10] font-mono text-xs sm:text-[13px] leading-relaxed">
        {/* Request snippet */}
        <div className="mb-4">
          <div className="text-zinc-500 mb-1 text-[11px] uppercase tracking-wider font-semibold">Incoming Ingress Request</div>
          <pre className="text-zinc-100 bg-black/60 p-3 rounded-lg border border-white/[0.08] overflow-x-auto">
            {SIMULATED_STREAMS[activeTab].prompt}
          </pre>
        </div>

        {/* Live response area */}
        <div className="mb-4">
          <div className="text-zinc-500 mb-1 text-[11px] uppercase tracking-wider font-semibold flex items-center justify-between">
            <span>Qronos AI Response Stream</span>
            {isSimulating && <span className="text-zinc-400 flex items-center gap-1 text-[11px]"><RefreshCw size={10} className="animate-spin text-zinc-300" /> Streaming...</span>}
          </div>
          <pre className="text-zinc-200 bg-white/[0.02] p-3.5 rounded-lg border border-white/[0.06] min-h-[90px] overflow-x-auto whitespace-pre-wrap">
            {streamedText}
            {isSimulating && <span className="inline-block w-2 h-4 bg-white ml-1 animate-pulse" />}
          </pre>
        </div>

        {/* Interactive Controls Bar */}
        <div className="pt-3 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={runSimulation}
              disabled={isSimulating}
              className="px-4 py-1.5 rounded-full bg-white text-black hover:bg-zinc-200 font-medium text-xs flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm"
            >
              <Play size={11} fill="currentColor" />
              <span>Simulate Stream</span>
            </button>
            <button
              onClick={triggerFailover}
              className="px-4 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.1] text-zinc-200 hover:text-white border border-white/15 text-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
            >
              <Flame size={12} className="text-zinc-300" />
              <span>Test 429 Failover</span>
            </button>
          </div>

          <div className="text-zinc-400 text-xs flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-300 inline-block" />
            <span className="text-zinc-400">Bi-directional Normalization Active</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Drop-In Integration Code Hub
--------------------------------------------------------- */
const CODE_SNIPPETS: Record<string, { title: string; lang: string; code: string; note: string }> = {
  claude: {
    title: "Claude Code CLI",
    lang: "bash",
    code: `# Route your Claude Code CLI commands directly through Qronos AI
export ANTHROPIC_BASE_URL="https://api.qronos.me/v1"
export ANTHROPIC_API_KEY="qr_your_qronos_key"

# Run Claude Code with full compaction scaling & 1M context
claude`,
    note: "Automatically scales context compaction & ephemerally tracks prompt caching.",
  },
  cursor: {
    title: "Cursor / Windsurf",
    lang: "json",
    code: `// In Cursor or Windsurf IDE Settings -> Models:
{
  "openai.baseUrl": "https://api.qronos.me/v1",
  "openai.apiKey": "qr_your_qronos_key",
  "anthropic.baseUrl": "https://api.qronos.me/v1",
  "anthropic.apiKey": "qr_your_qronos_key"
}`,
    note: "Works seamlessly across both OpenAI and Anthropic provider fields in any AI editor.",
  },
  python_anthropic: {
    title: "Python (Anthropic SDK)",
    lang: "python",
    code: `from anthropic import Anthropic

client = Anthropic(
    base_url="https://api.qronos.me/v1",
    api_key="qr_your_qronos_key"
)

message = client.messages.create(
    model="claude-opus-5.5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Hello Qronos AI!"}]
)
print(message.content[0].text)`,
    note: "Zero changes to your message formats, tool definitions, or streaming handlers.",
  },
  python_openai: {
    title: "Python (OpenAI SDK)",
    lang: "python",
    code: `from openai import OpenAI

client = OpenAI(
    base_url="https://api.qronos.me/v1",
    api_key="qr_your_qronos_key"
)

response = client.chat.completions.create(
    model="gpt-6-astra",
    messages=[{"role": "user", "content": "Explain quantum teleportation"}],
    stream=True
)
for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")`,
    note: "Full streaming and tool call parsing supported transparently.",
  },
  curl: {
    title: "cURL",
    lang: "bash",
    code: `curl https://api.qronos.me/v1/messages \\
  -H "x-api-key: qr_your_qronos_key" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "content-type: application/json" \\
  -d '{
    "model": "claude-opus-5.5",
    "max_tokens": 512,
    "messages": [{"role": "user", "content": "Ping!"}]
  }'`,
    note: "Fast, standard REST API endpoints with low latency.",
  },
};

function CodeIntegrationHub() {
  const [activeCodeKey, setActiveCodeKey] = useState<string>("claude");
  const [copied, setCopied] = useState(false);

  const activeSnippet = CODE_SNIPPETS[activeCodeKey];

  const handleCopy = () => {
    navigator.clipboard.writeText(activeSnippet.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="infer-glass-card rounded-2xl p-6 sm:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="text-violet-400 font-mono text-xs uppercase tracking-wider font-semibold flex items-center gap-1.5">
            <Code2 size={14} />
            <span>2-Minute Setup</span>
          </div>
          <h3 className="text-2xl font-bold text-white mt-1">Change One Base URL. Keep All Your Code.</h3>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-1.5 p-1 bg-black/60 rounded-xl border border-white/10 overflow-x-auto">
          {Object.entries(CODE_SNIPPETS).map(([key, item]) => (
            <button
              key={key}
              onClick={() => setActiveCodeKey(key)}
              className={`px-3 py-1.5 text-xs font-mono rounded-lg transition whitespace-nowrap ${
                activeCodeKey === key
                  ? "bg-violet-600/30 text-white border border-violet-500/40 font-semibold"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
              }`}
            >
              {item.title}
            </button>
          ))}
        </div>
      </div>

      {/* Code Display */}
      <div className="relative rounded-xl overflow-hidden border border-white/[0.08] bg-[#07090e]">
        <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.02] border-b border-white/[0.06] text-xs font-mono text-zinc-400">
          <span>{activeSnippet.title}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-zinc-300 hover:text-white bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded transition text-xs"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            <span>{copied ? "Copied to Clipboard!" : "Copy Snippet"}</span>
          </button>
        </div>

        <pre className="p-4 sm:p-5 font-mono text-xs sm:text-sm text-zinc-200 overflow-x-auto leading-relaxed">
          <code>{activeSnippet.code}</code>
        </pre>
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-zinc-400 font-mono">
        <CheckCircle2 size={14} className="text-emerald-400" />
        <span>{activeSnippet.note}</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Platform Explainer Showcase
--------------------------------------------------------- */
const PLATFORM_EXPLAINERS = [
  {
    image: "https://github.com/kumaryush18-cyber/qronos-media/releases/download/v1.0-media/home_feature_1.png",
    heading: "One endpoint. Every model.",
    description:
      "Send every request to Qronos, and we route it to the fastest healthy provider for the model you picked. If a provider errors or stalls, your request moves to the next one automatically. Your app never notices.",
    tags: ["Smart routing", "Automatic failover", "Real-time streaming"],
  },
  {
    image: "https://github.com/kumaryush18-cyber/qronos-media/releases/download/v1.0-media/home_feature_2.png",
    heading: "Top up with crypto. Credits in seconds.",
    description:
      "Connect your wallet, send USDC or SOL, and your balance updates as soon as the transaction confirms. No credit card, no international payment blocks, no minimum spend.",
    tags: ["Instant top-ups", "Wallet-friendly", "Transparent usage"],
  },
  {
    image: "https://github.com/kumaryush18-cyber/qronos-media/releases/download/v1.0-media/home_feature_3.png",
    heading: "Change one line. Keep your workflow.",
    description:
      "Qronos speaks the Anthropic Messages API natively. Set your base URL, add your key, and Claude Code, Cline or your own app just works.",
    tags: ["Anthropic native", "Drop-in setup", "Zero code changes"],
  },
];

function PlatformExplainerCards() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
      {PLATFORM_EXPLAINERS.map((item, idx) => (
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 36, filter: "blur(6px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{
            duration: 0.7,
            delay: idx * 0.15,
            ease: [0.16, 1, 0.3, 1],
          }}
          whileHover={{ y: -4, transition: { duration: 0.25 } }}
          className="group relative rounded-2xl border border-white/[0.08] bg-[#0c0d12]/90 backdrop-blur-xl p-5 sm:p-6 flex flex-col justify-between hover:border-white/25 transition-all duration-300 shadow-2xl hover:shadow-[0_12px_35px_rgba(255,255,255,0.08)]"
        >
          <div>
            {/* 16:9 Aspect Ratio Image Preview */}
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-white/10 bg-black/60 shadow-lg mb-6 group-hover:border-white/20 transition-all">
              <img
                src={item.image}
                alt={item.heading}
                className="w-full h-full object-cover object-center group-hover:scale-[1.02] transition-transform duration-500 ease-out"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
            </div>

            {/* Metallic Silver Gradient Heading */}
            <h3 className="text-xl sm:text-2xl font-bold font-display tracking-tight text-balance bg-gradient-to-b from-[#ffffff] via-[#e4e4e7] to-[#a1a1aa] bg-clip-text text-transparent">
              {item.heading}
            </h3>

            {/* Description */}
            <p className="mt-3.5 text-sm sm:text-[15px] leading-relaxed text-zinc-400 font-sans">
              {item.description}
            </p>
          </div>

          {/* Sub-tags / Feature Badges */}
          <div className="mt-6 pt-4 border-t border-white/[0.06] flex flex-wrap items-center gap-2">
            {item.tags.map((tag, tIdx) => (
              <span
                key={tIdx}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono text-zinc-300 bg-white/[0.04] border border-white/[0.08]"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                <span>{tag}</span>
              </span>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------
   MAIN LANDING COMPONENT
--------------------------------------------------------- */
export default function Home() {
  const metrics = trpc.public.modelTokenMetrics.useQuery(undefined, {
    staleTime: 10_000,
    refetchInterval: 20_000,
  });

  const unorouterBadge = trpc.public.unorouterBadge.useQuery(undefined, {
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const showUnoRouterBadge = unorouterBadge.data?.enabled ?? true;

  const totalTokens = metrics.data?.totalTokens ?? 16_248_910_420;
  const billionsTokens = (totalTokens / 1_000_000_000).toFixed(1);


  return (
    <div className="infergate-landing">
      <PublicNav />

      {/* =========================================================
          HERO — full-bleed vortex canvas, centered copy
      ========================================================= */}
      <section className="relative min-h-screen flex flex-col justify-center items-start overflow-hidden bg-[#010101]">
        <div className="absolute inset-y-0 left-1/2 z-0 w-full max-w-[1344px] -translate-x-1/2 overflow-hidden sm:w-[calc(100%-2rem)] lg:w-[calc(100%-3.5rem)]">
          <VortexHourglass
            background="#010101"
            lineOptions={{ color: "#ffffff", glow: 10 }}
            dotOptions={{ color: "#ffffff", glow: 10 }}
            cometOptions={{ color: "#eca8d6", glow: 6 }}
            repel
          />
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-[#010101]/70 via-[#010101]/30 to-transparent" />
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-[#010101]/20 via-transparent to-[#010101]/60" />
        </div>

        <div className="relative z-10 w-full max-w-[1400px] mx-auto px-4 py-28 sm:px-8 sm:py-32 lg:px-14 lg:py-40">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto flex max-w-full flex-col items-center text-center"
          >
            {/* Crypto Top-up Pill */}
            <div className="mb-6 flex flex-wrap items-center justify-center gap-2.5">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.05] border border-white/10 text-xs font-mono text-zinc-300 backdrop-blur-md">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>TOP UP IN USDC OR SOL · SHIP WITH ANY MODEL</span>
              </div>
            </div>

            <div className="mb-5 max-w-4xl">
              <h1 className="relative z-10 text-balance text-center text-[clamp(2.2rem,8vw,4.5rem)] font-display leading-[0.96] tracking-tight text-white">
                <span className="block sm:whitespace-nowrap">One API for every model.</span>
                <span className="block bg-gradient-to-b from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent sm:whitespace-nowrap">
                  Pay with crypto.
                </span>
              </h1>
              <p className="mt-3 text-xs sm:text-sm font-mono text-zinc-400 tracking-wide">
                The LLM gateway for coding agents. Crypto-native billing.
              </p>
            </div>

            <p className="relative z-0 mb-8 max-w-2xl text-center text-sm leading-relaxed text-zinc-300 sm:mb-10 sm:text-base lg:text-lg">
              Qronos is an Anthropic-compatible LLM gateway. Plug in Claude Code, Cline or your own app with one API key, and top up instantly with crypto: no cards, no bank delays, no borders.
            </p>

            <div className="flex w-full flex-col items-center justify-center gap-3 min-[390px]:flex-row">
              <Link href="/signup">
                <StarButton backgroundColor="#010101" className="rounded-full border border-slate-200/50 px-5 text-sm font-medium">
                  <span>GET STARTED</span>
                  <span className="ml-1 tracking-tighter font-mono font-bold text-xs">»</span>
                </StarButton>
              </Link>
              <Link href="/playground">
                <button
                  type="button"
                  className="relative isolate h-10 overflow-hidden rounded-full border border-white/30 bg-white px-6 text-sm font-semibold text-black hover:bg-zinc-100 hover:text-black transition-all flex items-center justify-center cursor-pointer shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                >
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-[1.125rem] top-0 h-px w-[calc(100%-2.25rem)] bg-gradient-to-r from-neutral-950/0 via-neutral-500 to-neutral-950/0"
                  />
                  <span className="relative z-10">OPEN PLAYGROUND</span>
                </button>
              </Link>
            </div>
          </motion.div>
        </div>

        {/* AI Model Companies Logo Marquee */}
        <div className="absolute bottom-10 left-0 right-0 z-20">
          <div className="mx-auto w-[calc(100%-2rem)] max-w-[1344px] overflow-hidden lg:w-[calc(100%-3.5rem)] [mask-image:linear-gradient(to_right,transparent,black_20%,black_80%,transparent)]">
            <div className="flex w-max gap-6 py-2 animate-marquee-scroll items-center">
              {[...QRONOS_LOGOS, ...QRONOS_LOGOS].map((item, idx) => (
                <div
                  key={`${item.alt}-${idx}`}
                  className="flex items-center gap-2.5 px-4 py-2 rounded-full border border-white/[0.08] bg-black/60 backdrop-blur-xl opacity-75 hover:opacity-100 transition-all shadow-sm"
                >
                  <img
                    src={item.src}
                    alt={item.alt}
                    className="pointer-events-none h-4 w-4 sm:h-5 sm:w-5 object-contain select-none brightness-0 invert"
                  />
                  <span className="font-mono text-xs tracking-wider text-zinc-300 font-medium whitespace-nowrap">
                    {item.name || item.alt}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          FEATURES — stateful execution, live schedule preview
      ========================================================= */}
      <section id="features" className="relative overflow-hidden pt-24 lg:pt-32 bg-[#010101]">
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto max-w-[1344px] px-4 sm:px-6 md:px-8 lg:px-12"
        >
          <div className="max-w-3xl">
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">Stateful execution.</p>
            <h2 className="mt-4 text-[clamp(2rem,5vw,4rem)] font-display leading-[0.98] tracking-tight text-white">
              Qronos AI keeps agents in motion.
            </h2>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-zinc-400">
              Qronos AI is the stateful runtime for autonomous work—preserving memory, tools, and context across every governed run.
            </p>
          </div>
          <div className="mt-14">
            <GatewayTerminalSimulator />
          </div>

          {/* Infrastructure Partner - Powered by UnoRouter.com Compact Badge */}
          {showUnoRouterBadge && (
            <div className="mt-6 sm:mt-8 flex justify-center w-full">
              <a
                href="https://unorouter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="group block w-full max-w-2xl text-decoration-none"
              >
                <StarBorderCard
                  lightWidth={160}
                  duration={8}
                  lightColor="rgba(255, 255, 255, 0.65)"
                  className="rounded-xl transition-all duration-300 hover:scale-[1.01] shadow-xl shadow-black/80 border border-white/10 hover:border-white/20 bg-black"
                >
                  <div className="py-2 px-4 sm:py-2.5 sm:px-5 bg-black/95 rounded-[11px] flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src="/unorouter/unorouter-apple-icon.png"
                        alt="UnoRouter"
                        className="h-6 w-6 sm:h-7 sm:w-7 rounded-md border border-white/15 object-contain shrink-0 bg-black"
                      />
                      <p className="text-xs sm:text-sm text-zinc-300 truncate leading-snug">
                        <span className="text-zinc-400">Powered by </span>
                        <strong className="font-bold text-white group-hover:text-zinc-100 transition-colors">UnoRouter.com</strong>
                        <span className="text-zinc-500 mx-1.5 hidden sm:inline">•</span>
                        <span className="text-[11px] sm:text-xs text-zinc-400 hidden sm:inline">
                          Universal multi-provider LLM routing, high-concurrency failover &amp; zero rate limits.
                        </span>
                      </p>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.05] group-hover:bg-white/[0.1] border border-white/10 group-hover:border-white/25 text-[11px] font-mono text-zinc-300 group-hover:text-white transition-all">
                      <span>unorouter.com</span>
                      <ExternalLink size={11} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform text-zinc-400 group-hover:text-white" />
                    </div>
                  </div>
                </StarBorderCard>
              </a>
            </div>
          )}
        </motion.div>
      </section>

      {/* =========================================================
          HOW IT WORKS — durable autonomy, live pipeline
      ========================================================= */}
      <section id="how-it-works" className="relative overflow-hidden py-24 lg:py-32 bg-[#010101]">
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto max-w-[1344px] px-4 sm:px-6 md:px-8 lg:px-12"
        >
          <div className="max-w-3xl">
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">Durable autonomy.</p>
            <h2 className="mt-4 text-[clamp(2rem,5vw,4rem)] font-display leading-[0.98] tracking-tight text-white">
              Every run resumes in context.
            </h2>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-zinc-400">
              Qronos AI gives autonomous agents durable context, flexible execution, and controls built for production.
            </p>
          </div>
          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {[
              { step: "01", title: "Schedule on signals, not clocks", body: "Wake agents on webhooks, cron, database changes, or custom application triggers with zero polling overhead." },
              { step: "02", title: "Resume with complete context", body: "Every execution picks up where the previous run left off, carrying forward conversational memory, tool outputs, and state." },
              { step: "03", title: "Run with built-in guardrails", body: "Enforce strict spending limits, sub-8ms failover across API keys, and hardware-grade cryptographic isolation." },
            ].map((s, idx) => (
              <motion.div
                key={s.step}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.55, delay: idx * 0.12, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 hover:border-white/20 transition-all hover:scale-[1.01]"
              >
                <p className="font-mono text-xs text-zinc-500">{s.step}</p>
                <h3 className="mt-6 text-xl font-semibold text-white">{s.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">{s.body}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* =========================================================
          INSIGHTS — live telemetry
      ========================================================= */}
      <section id="insights" className="relative overflow-hidden py-24 lg:py-32 bg-[#010101]">
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto max-w-[1344px] px-4 sm:px-6 md:px-8 lg:px-12"
        >
          <div className="max-w-3xl">
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">Insights</p>
            <h2 className="mt-4 text-[clamp(2rem,5vw,4rem)] font-display leading-[0.98] tracking-tight text-white">
              Track agent insights in real time.
            </h2>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-zinc-400">
              Monitor every agent task as it progresses, with live status, activity, and the context your team needs to keep work moving.
            </p>
          </div>
          <div className="mt-14 grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 hover:border-white/20 transition-all">
              <p className="text-xs text-zinc-500">Total tokens processed</p>
              <p className="mt-2 font-mono text-2xl font-light text-white"><AnimatedCounter value={totalTokens} /></p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 hover:border-white/20 transition-all">
              <p className="text-xs text-zinc-500">Verified models</p>
              <p className="mt-2 font-mono text-2xl font-light text-white">{QRONOS_MODELS.length}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 hover:border-white/20 transition-all">
              <p className="text-xs text-zinc-500">Failover latency</p>
              <p className="mt-2 font-mono text-2xl font-light text-white">&lt; 8ms</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 hover:border-white/20 transition-all">
              <p className="text-xs text-zinc-500">Key slots per provider</p>
              <p className="mt-2 font-mono text-2xl font-light text-white">15</p>
            </div>
          </div>
        </motion.div>
      </section>

      {/* =========================================================
          PLATFORM EXPLAINERS — core architecture & features
      ========================================================= */}
      <section className="relative overflow-hidden py-24 lg:py-32 bg-[#010101]">
        <div className="mx-auto max-w-[1344px] px-4 sm:px-6 md:px-8 lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 30, filter: "blur(4px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-3xl mb-14"
          >
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">How Qronos Works</p>
            <h2 className="mt-4 text-[clamp(2rem,5vw,4rem)] font-display leading-[0.98] tracking-tight bg-gradient-to-b from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              Built for speed. Powered by crypto.
            </h2>
            <p className="mt-4 text-base text-zinc-400 leading-relaxed">
              Route to any model with automatic provider failover, crypto-native top-ups, and native Anthropic compatibility.
            </p>
          </motion.div>
          <div>
            <PlatformExplainerCards />
          </div>
        </div>
      </section>

      {/* =========================================================
          PRICING
      ========================================================= */}
      <section id="pricing" className="relative overflow-hidden py-24 lg:py-32 bg-[#010101]">
        <div className="mx-auto max-w-[1344px] px-4 sm:px-6 md:px-8 lg:px-12">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">Pricing</p>
              <span className="text-[10px] font-mono font-extrabold px-2.5 py-0.5 rounded-full bg-white/10 text-white border border-white/20 uppercase tracking-wider shadow-sm">
                Transparent Token Plans
              </span>
            </div>
            <h2 className="mt-4 text-[clamp(2rem,5vw,4rem)] font-display leading-[0.98] tracking-tight text-white">
              Pay per token, settled to the nanodollar.
            </h2>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-zinc-400">
              Start with free starter tokens, or scale your production workloads with dedicated high-throughput token plans — Plus ($10 for 600M tokens), Pro ($30 for 2B tokens), Ultra ($60 for 4.6B tokens), or Enterprise ($150 for 13B tokens). Every charge is settled transparently with zero platform markup.
            </p>
          </div>
          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {[
              { name: "Starter", price: "$0", note: "For exploring the gateway.", items: ["Shared key pool", "Standard routing", "Community support"] },
              { name: "Team", price: "Usage", note: "For production traffic.", items: ["Dedicated key slots", "Live request logs", "Priority support"] },
              { name: "Enterprise", price: "Custom", note: "For regulated workloads.", items: ["Private routing", "Audit exports", "Dedicated SLA"] },
            ].map((tier) => (
              <div key={tier.name} className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                <p className="text-sm font-medium text-zinc-300">{tier.name}</p>
                <p className="mt-4 text-4xl font-light text-white">{tier.price}</p>
                <p className="mt-2 text-sm text-zinc-500">{tier.note}</p>
                <ul className="mt-6 flex-1 space-y-2 text-sm text-zinc-400">
                  {tier.items.map((i) => (
                    <li key={i}>• {i}</li>
                  ))}
                </ul>
                <Link href="/pricing" className="mt-8 inline-flex justify-center rounded-full border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/10">
                  View plans
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =========================================================
          TESTIMONIALS — Teams moving faster with autonomous work
      ========================================================= */}
      <section id="customers" className="relative overflow-hidden py-24 lg:py-32 bg-[#010101]">
        <div className="mx-auto max-w-[1344px] px-4 sm:px-6 md:px-8 lg:px-12">
          <div className="max-w-3xl">
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">Customers</p>
            <h2 className="mt-4 text-[clamp(2rem,5vw,4rem)] font-display leading-[0.98] tracking-tight text-white">
              Teams moving faster with autonomous work.
            </h2>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-zinc-400">
              See how operations teams turn recurring work into agent-led systems that stay responsive, governed, and in context.
            </p>
          </div>
          <div className="mt-14 grid gap-6 md:grid-cols-2">
            <figure className="flex flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.02] p-8 hover:border-white/20 transition-all">
              <blockquote className="text-lg leading-relaxed text-zinc-200">
                “Qronos AI gave our research agents a dependable rhythm. Every brief starts with the context and tools from the run before it.”
              </blockquote>
              <div className="mt-8 flex items-center justify-between border-t border-white/10 pt-6">
                <div className="flex items-center gap-3">
                  <img
                    src="/images/testimonials/moustachia-balding.png"
                    alt="Moustachia Balding"
                    className="size-10 rounded-full border border-white/20 object-cover"
                  />
                  <div>
                    <figcaption className="text-sm font-medium text-white">Moustachia Balding</figcaption>
                    <p className="text-xs text-zinc-500">CTO, Meridian Labs</p>
                  </div>
                </div>
                <img
                  src="/images/testimonial-logos/meridian.png"
                  alt="Meridian Labs"
                  className="h-6 object-contain grayscale invert opacity-75"
                />
              </div>
            </figure>

            <figure className="flex flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.02] p-8 hover:border-white/20 transition-all">
              <blockquote className="text-lg leading-relaxed text-zinc-200">
                “We replaced brittle polling jobs with agents that wake on real signals, follow through, and stay inside the budget we set.”
              </blockquote>
              <div className="mt-8 flex items-center justify-between border-t border-white/10 pt-6">
                <div className="flex items-center gap-3">
                  <img
                    src="/images/testimonials/dani-raulisa.png"
                    alt="Dani Raulisa"
                    className="size-10 rounded-full border border-white/20 object-cover"
                  />
                  <div>
                    <figcaption className="text-sm font-medium text-white">Dani Raulisa</figcaption>
                    <p className="text-xs text-zinc-500">VP Engineering, Monolyth Dev</p>
                  </div>
                </div>
                <img
                  src="/images/testimonial-logos/monolyth.png"
                  alt="Monolyth Dev"
                  className="h-6 object-contain grayscale invert opacity-75"
                />
              </div>
            </figure>
          </div>
        </div>
      </section>

      {/* =========================================================
          CLOSING CTA
      ========================================================= */}
      <section className="relative overflow-hidden py-28 lg:py-36 bg-[#010101] border-t border-white/[0.08]">
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto max-w-3xl px-6 text-center"
        >
          <div className="mb-6 flex justify-center -space-x-2">
            {[
              "/images/agent-logos/gemini.png",
              "/images/agent-logos/codex.png",
              "/images/agent-logos/claude.png",
              "/images/agent-logos/cursor.png",
            ].map((img, i) => (
              <span
                key={i}
                className="inline-flex size-10 items-center justify-center rounded-full border border-white/20 bg-black p-1.5 shadow-lg"
              >
                <img src={img} alt="Agent model" className="size-full object-contain" />
              </span>
            ))}
          </div>
          <h2 className="mt-4 text-[clamp(2.25rem,6vw,4.5rem)] font-display leading-[0.95] tracking-tight text-white">
            Stop babysitting agents. Let them own the work.
          </h2>
          <p className="mt-6 text-base leading-relaxed text-zinc-400">
            Turn every recurring task, signal, and handoff into reliable work that carries its context forward.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/signup">
              <StarButton backgroundColor="#010101" className="rounded-full border border-slate-200/50 px-6 py-2.5 text-sm font-medium">
                <span>GET STARTED</span>
                <span className="ml-1 tracking-tighter font-mono font-bold text-xs">»</span>
              </StarButton>
            </Link>
            <Link href="/playground">
              <button
                type="button"
                className="relative isolate h-10 overflow-hidden rounded-full border border-white/30 bg-white px-6 text-sm font-semibold text-black hover:bg-zinc-100 hover:text-black transition-all flex items-center justify-center cursor-pointer shadow-[0_0_20px_rgba(255,255,255,0.2)]"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-[1.125rem] top-0 h-px w-[calc(100%-2.25rem)] bg-gradient-to-r from-neutral-950/0 via-neutral-500 to-neutral-950/0"
                />
                <span className="relative z-10">REQUEST A DEMO</span>
              </button>
            </Link>
          </div>
        </motion.div>
      </section>

      {/* =========================================================
          FOOTER
      ========================================================= */}
      <footer className="relative bg-[#010101] border-t border-white/10">
        <div className="mx-auto max-w-[1344px] px-4 sm:px-6 md:px-8 lg:px-12 py-14">
          <div className="flex flex-col gap-10 md:flex-row md:justify-between">
            <div className="max-w-sm">
              <div className="flex items-center gap-3">
                <QronosGlyph size={28} />
                <span className="text-lg font-bold text-white flex items-center gap-2">
                  Qronos AI
                  <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border border-white/10 text-zinc-400 bg-white/[0.04]">
                    LLM GATEWAY
                  </span>
                </span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-zinc-500">
                The universal LLM gateway. Route, pool, and settle every token through one unified base URL.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-10 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-zinc-500 font-mono">Product</p>
                <ul className="mt-4 space-y-2 text-zinc-300">
                  <li><Link href="/models">Models</Link></li>
                  <li><Link href="/pricing">Pricing</Link></li>
                  <li><Link href="/playground">Playground</Link></li>
                </ul>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-zinc-500 font-mono">Developers</p>
                <ul className="mt-4 space-y-2 text-zinc-300">
                  <li><Link href="/docs">Documentation</Link></li>
                  <li><Link href="/docs">API reference</Link></li>
                </ul>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-zinc-500 font-mono">Legal</p>
                <ul className="mt-4 space-y-2 text-zinc-300">
                  <li><Link href="/privacy">Privacy</Link></li>
                  <li><Link href="/terms">Terms</Link></li>
                  <li><Link href="/security">Security</Link></li>
                </ul>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-zinc-500 font-mono">Support &amp; Contact</p>
                <ul className="mt-4 space-y-2 text-zinc-300">
                  <li className="flex items-center gap-1.5">
                    <Mail size={13} className="text-[#c9ff73] shrink-0" />
                    <a
                      href="mailto:contact@qronos.me"
                      className="font-mono text-xs text-white hover:text-[#c9ff73] transition-colors underline decoration-white/20 underline-offset-4"
                    >
                      contact@qronos.me
                    </a>
                  </li>
                  <li className="text-xs text-zinc-400">
                    Direct Email Support
                  </li>
                  <li>
                    <Link href="/terms" className="text-xs text-zinc-400 hover:text-white transition-colors">
                      Enterprise &amp; Billing
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-zinc-600 md:flex-row md:justify-between">
            <span>© 2026 Qronos AI. All rights reserved.</span>
            <span className="font-mono">All gateway systems operational</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
