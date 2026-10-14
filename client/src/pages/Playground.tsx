import { useState } from "react";
import { VortexHourglass } from "@/components/VortexHourglass";
import { AIThinkingOrbInput } from "@/components/ui/ai-thiking-orb-and-input";
import { Sparkles, Terminal, Cpu, ShieldCheck, ChevronDown, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { QRONOS_MODELS } from "@/lib/modelCatalogue";
import { trpc } from "@/lib/trpc";
import "./infergate-landing.css";

const FEATURED_MODELS = [
  { id: "claude-opus-5.5", label: "Claude Opus 5.5" },
  { id: "claude-opus-5", label: "Claude Opus 5" },
  { id: "claude-fable-5.1", label: "Claude Fable 5.1" },
  { id: "glm-5.3", label: "GLM 5.3" },
  { id: "glm-5.2", label: "GLM-5.2" },
  { id: "gpt-6-astra", label: "GPT-6 Astra" },
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
  { id: "qwen3.8-max", label: "Qwen 3.8 Max" },
];

export default function Playground() {
  const [activeModel, setActiveModel] = useState("claude-opus-5.5");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Fetch full live models catalogue from gateway
  const availabilityQuery = trpc.public.modelAvailability.useQuery();

  const allModels = availabilityQuery.data?.length
    ? availabilityQuery.data.map(m => {
        const found = QRONOS_MODELS.find(cat => cat.id === m.modelId);
        return {
          id: m.modelId,
          label: found?.name || m.modelId,
          provider: found?.provider || "Qronos AI",
        };
      })
    : QRONOS_MODELS.map(m => ({ id: m.id, label: m.name, provider: m.provider }));

  const activeModelMeta = allModels.find(m => m.id === activeModel) || {
    id: activeModel,
    label: activeModel,
    provider: "Qronos AI",
  };

  const handleOrbSubmit = async (text: string): Promise<string> => {
    try {
      const response = await fetch("/api/playground/chat/completions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: activeModel,
          messages: [{ role: "user", content: text }],
          maxOutputTokens: 1024,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const errMsg = payload?.error?.message || payload?.message || `Gateway returned status ${response.status}`;
        throw new Error(errMsg);
      }

      const raw = await response.text();
      try {
        const parsed = JSON.parse(raw);
        return parsed.choices?.[0]?.message?.content ?? parsed.content ?? "Answer generated.";
      } catch {
        const lines = raw.split("\n");
        let combined = "";
        for (const line of lines) {
          if (line.startsWith("data:") && !line.includes("[DONE]")) {
            try {
              const d = JSON.parse(line.slice(5).trim());
              const delta = d.choices?.[0]?.delta?.content ?? "";
              combined += delta;
            } catch {}
          }
        }
        return combined || raw;
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes("Sign in") || msg.includes("unauthorized") || msg.includes("401")) {
        return `⚠️ Authentication Required: You must be signed in to send messages in the live Playground.\n\nPlease sign in to your developer workspace or register with GitHub to unlock live model completions.`;
      }
      if (msg.includes("provider is temporarily unavailable") || msg.includes("not configured") || msg.includes("unavailable")) {
        return `⚠️ Upstream Provider Not Configured:\n\nNo active upstream provider key is currently configured for '${activeModel}'.\n\nTo activate this route:\n• Go to Admin Dashboard -> Provider Settings (/admin?tab=providers)\n• Under Universal Model Hub, select '${activeModel}' and add your upstream API key (e.g. Anthropic, OpenAI, OpenRouter, or DeepSeek).`;
      }
      return `⚠️ Qronos AI Gateway Error:\n\n${msg}`;
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-140px)] w-full rounded-3xl overflow-hidden border border-white/[0.08] bg-black text-white flex flex-col justify-center items-center shadow-2xl">
      {/* 3D Particle Vortex Background with Depth Blur */}
      <div className="absolute inset-0 pointer-events-auto filter blur-[3px] opacity-75 overflow-hidden">
        <VortexHourglass
          background="#000000"
          topRadius={380}
          waistRadius={53}
          waistPosition={50}
          bottomRadius={1150}
          twist={3}
          zoom={75}
          speed={10}
          direction="right"
          lineOptions={{ count: 240, color: "#ffffff", glow: 10 }}
          dotOptions={{ count: 8000, size: 20, color: "#ffffff", glow: 10, flicker: 10 }}
          cometOptions={{ count: 10, speed: 6, color: "#eca8d6", glow: 6, tail: 19, delay: 8, collide: 6 }}
          repel={true}
          repelOptions={{ radius: 60, strength: 10 }}
        />
        {/* Ambient Dark Obsidian Vignette */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-black/85 via-black/30 to-black/85" />
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/60 via-transparent to-black/90" />
      </div>

      {/* Interactive Stage Content */}
      <div className="relative z-10 w-full max-w-4xl mx-auto px-4 sm:px-8 py-10 flex flex-col items-center text-center">
        {/* Status Pills Row */}
        <div className="mb-5 flex items-center justify-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.05] border border-white/10 text-xs font-mono text-zinc-300 backdrop-blur-md">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>QRONOS AI · WORKBENCH CLONE</span>
          </div>
          <Badge className="border-0 bg-white/[0.06] text-zinc-300 font-mono text-[10px] px-2.5 py-1">
            <ShieldCheck size={11} className="mr-1 text-emerald-400" />
            Live Gateway Session
          </Badge>
        </div>

        {/* Headline */}
        <div className="mb-3">
          <h1 className="text-balance text-center text-[clamp(1.9rem,5vw,3rem)] font-display leading-[1.02] tracking-tight text-white">
            <span className="block sm:whitespace-nowrap">The gateway workbench</span>
            <span className="block bg-gradient-to-b from-white via-zinc-300 to-zinc-500 bg-clip-text text-transparent sm:whitespace-nowrap">
              for autonomous agents
            </span>
          </h1>
        </div>

        {/* Subtitle */}
        <p className="mb-6 max-w-lg text-center text-xs sm:text-sm leading-relaxed text-zinc-400">
          Ask any question to watch the 3D particle orb launch, reason across frontier models, and stream live intelligence.
        </p>

        {/* Model Selection Row: Featured Chips + Full Catalogue Dropdown */}
        <div className="flex flex-col items-center gap-3 mb-7 z-20 w-full max-w-xl">
          {/* Quick Chips */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
            {FEATURED_MODELS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setActiveModel(m.id);
                  setIsDropdownOpen(false);
                }}
                className={`px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full text-xs font-mono transition-all cursor-pointer border ${
                  activeModel === m.id
                    ? "bg-white text-black font-bold border-white shadow-lg shadow-white/10 scale-105"
                    : "text-zinc-400 border-white/10 hover:border-white/30 hover:text-white bg-black/60 backdrop-blur-md"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Full Model Catalogue Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-mono text-zinc-300 border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] hover:text-white transition-all backdrop-blur-xl cursor-pointer"
            >
              <Cpu size={13} className="text-[#c9ff73]" />
              <span>Model: <strong className="text-white">{activeModelMeta.label}</strong> ({activeModelMeta.provider})</span>
              <ChevronDown size={13} className={`transition-transform duration-200 ${isDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {isDropdownOpen && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-72 sm:w-80 max-h-72 overflow-y-auto rounded-2xl border border-white/15 bg-[#0d0e14]/98 p-1.5 shadow-2xl backdrop-blur-2xl z-50 divide-y divide-white/[0.04]">
                <div className="px-3 py-2 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
                  Select Any Model From Catalogue ({allModels.length})
                </div>
                <div className="py-1">
                  {allModels.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setActiveModel(m.id);
                        setIsDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-xs font-mono transition-colors cursor-pointer ${
                        activeModel === m.id
                          ? "bg-white/15 text-white font-bold"
                          : "text-zinc-400 hover:bg-white/[0.06] hover:text-white"
                      }`}
                    >
                      <div className="truncate mr-2">
                        <span className="block text-white text-xs">{m.label}</span>
                        <span className="block text-[10px] text-zinc-500 font-sans">{m.provider} • {m.id}</span>
                      </div>
                      {activeModel === m.id && <Check size={14} className="text-[#c9ff73] shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* AI Thinking Orb and Traveling Star Border Input */}
        <div className="w-full flex items-center justify-center min-h-[340px] z-10">
          <AIThinkingOrbInput
            onSubmit={handleOrbSubmit}
            placeholder={`Ask ${activeModelMeta.label} anything…`}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}
