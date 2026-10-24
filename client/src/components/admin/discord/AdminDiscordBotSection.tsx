import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Bot,
  Sparkles,
  RefreshCw,
  Save,
  Send,
  MessageSquare,
  Flame,
  Smile,
  Users,
  Trash2,
  Activity,
  CheckCircle2,
  AlertCircle,
  Zap,
  Sliders,
  Cpu,
  Clock,
  RotateCcw,
  Search,
  ExternalLink,
  Brain,
  Hash,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { SectionHeader } from "../common/AdminCommon";

export function AdminDiscordBotSection() {
  const utils = trpc.useUtils();

  // Queries
  const statusQuery = trpc.admin.discordBotStatus.useQuery(undefined, {
    refetchInterval: 10_000,
  });
  const membersQuery = trpc.admin.discordBotMembers.useQuery(undefined, {
    refetchInterval: 20_000,
  });
  const summaryQuery = trpc.admin.discordBotChannelSummary.useQuery(
    { channelId: undefined },
    { refetchInterval: 30_000 }
  );
  const modelAvailability = trpc.public.modelAvailability.useQuery();

  // Local Form State
  const [activeTab, setActiveTab] = useState<"config" | "members" | "memory">("config");
  const [enabled, setEnabled] = useState<boolean>(true);
  const [systemPrompt, setSystemPrompt] = useState<string>("");
  const [modelId, setModelId] = useState<string>("glm-5.3-flash");
  const [apiBaseUrl, setApiBaseUrl] = useState<string>("https://api.qronos.me/v1");
  const [apiKey, setApiKey] = useState<string>("");
  const [guildId, setGuildId] = useState<string>("1553707015384207453");
  const [allowedChannelsStr, setAllowedChannelsStr] = useState<string>("1562668900565393478");
  const [proactiveEnabled, setProactiveEnabled] = useState<boolean>(true);
  const [proactiveIntervalMinutes, setProactiveIntervalMinutes] = useState<number>(60);
  const [naughtyLevel, setNaughtyLevel] = useState<number>(85);
  const [reactionProbability, setReactionProbability] = useState<number>(40);

  // Quick message testing state
  const [testMessage, setTestMessage] = useState<string>("");
  const [memberSearch, setMemberSearch] = useState<string>("");

  // Sync state from server on load
  useEffect(() => {
    if (statusQuery.data?.config) {
      const cfg = statusQuery.data.config;
      setEnabled(cfg.enabled ?? true);
      setSystemPrompt(cfg.systemPrompt ?? "");
      setModelId(cfg.modelId ?? "glm-5.3-flash");
      setApiBaseUrl(cfg.apiBaseUrl ?? "https://api.qronos.me/v1");
      setApiKey(cfg.apiKey ?? "");
      setGuildId(cfg.guildId ?? "1553707015384207453");
      setAllowedChannelsStr((cfg.allowedChannelIds ?? []).join(", ") || "1562668900565393478");
      setProactiveEnabled(cfg.proactiveEnabled ?? true);
      setProactiveIntervalMinutes(cfg.proactiveIntervalMinutes ?? 60);
      setNaughtyLevel(cfg.naughtyLevel ?? 85);
      setReactionProbability(cfg.reactionProbability ?? 40);
    }
  }, [statusQuery.data?.config]);

  // Mutations
  const saveConfigMutation = trpc.admin.saveDiscordBotConfig.useMutation({
    onSuccess: () => {
      toast.success("Discord bot configuration saved and applied!");
      utils.admin.discordBotStatus.invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to save config: ${err.message}`);
    },
  });

  const restartMutation = trpc.admin.restartDiscordBot.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Discord bot service reconnected successfully!");
      } else {
        toast.error("Bot restart completed, but gateway client failed to connect. Check DISCORD_BOT_TOKEN.");
      }
      utils.admin.discordBotStatus.invalidate();
    },
    onError: (err) => {
      toast.error(`Restart failed: ${err.message}`);
    },
  });

  const sendTestMutation = trpc.admin.sendDiscordBotMessage.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Test message dispatched to Discord channel!");
        setTestMessage("");
        utils.admin.discordBotStatus.invalidate();
      } else {
        toast.error(`Send failed: ${data.error || "Unknown error"}`);
      }
    },
    onError: (err) => {
      toast.error(`Error sending message: ${err.message}`);
    },
  });

  const deleteMemberMutation = trpc.admin.deleteDiscordBotMember.useMutation({
    onSuccess: () => {
      toast.success("Member profile removed from bot memory.");
      utils.admin.discordBotMembers.invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to delete profile: ${err.message}`);
    },
  });

  const handleSave = () => {
    const channels = allowedChannelsStr
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    saveConfigMutation.mutate({
      enabled,
      systemPrompt,
      modelId,
      apiBaseUrl,
      apiKey: apiKey.trim(),
      guildId: guildId.trim(),
      allowedChannelIds: channels,
      proactiveEnabled,
      proactiveIntervalMinutes,
      naughtyLevel,
      reactionProbability,
    });
  };

  const handleSendTest = () => {
    sendTestMutation.mutate({
      channelId: allowedChannelsStr.split(",")[0]?.trim() || undefined,
      content:
        testMessage.trim() ||
        "💀 Yo! Qronos AI Discord companion bot is online and watching the chat! Ping me anytime or ask questions. 😈🚀",
    });
  };

  const isConnected = Boolean(statusQuery.data?.isConnected);
  const botTag = statusQuery.data?.botTag || "@QronosAI#9469";
  const botId = statusQuery.data?.botId || "1562469488425832560";

  // Filtered members list
  const members = membersQuery.data || [];
  const filteredMembers = members.filter((m) => {
    if (!memberSearch.trim()) return true;
    const q = memberSearch.toLowerCase();
    return (
      m.username?.toLowerCase().includes(q) ||
      m.displayName?.toLowerCase().includes(q) ||
      m.personaNotes?.toLowerCase().includes(q) ||
      m.discordUserId?.includes(q)
    );
  });

  // Naughty level description helper
  const getNaughtyDescription = (level: number) => {
    if (level < 20) return "Polite, helpful, and formal assistant";
    if (level < 50) return "Friendly dev with subtle casual humor";
    if (level < 80) return "Playful banter, clever roasting & dev memes";
    return "Savage, delightfully witty dev roast & cheeky banter";
  };

  return (
    <div className="space-y-6">
      {/* Header section with live gateway stats */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <SectionHeader
            icon={<Bot className="text-indigo-400" size={20} />}
            title="Discord AI Companion Bot"
            detail="24/7 autonomous engagement bot with multi-tier semantic memory, member dossiers, and customizable dev banter."
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => utils.admin.discordBotStatus.invalidate()}
            className="h-8 gap-1.5 border-white/10 bg-zinc-900/60 text-xs text-zinc-300 hover:bg-white/10"
          >
            <RefreshCw size={12} className={statusQuery.isFetching ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => restartMutation.mutate()}
            disabled={restartMutation.isPending}
            className="h-8 gap-1.5 border-amber-500/30 bg-amber-500/10 text-xs text-amber-300 hover:bg-amber-500/20"
          >
            <RotateCcw size={12} className={restartMutation.isPending ? "animate-spin" : ""} />
            <span>Reconnect Gateway</span>
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saveConfigMutation.isPending}
            className="h-8 gap-1.5 bg-indigo-600 px-3.5 text-xs font-semibold text-white hover:bg-indigo-500"
          >
            <Save size={12} />
            <span>Save Settings</span>
          </Button>
        </div>
      </div>

      {/* Live Gateway Status Hero Card */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-[#0d0e17] via-[#121324] to-[#0d0e17] p-5 shadow-xl sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4 sm:items-center">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-500/10 shadow-inner">
              <Bot className="h-6 w-6 text-indigo-400" />
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#0d0e17] ${
                  isConnected ? "bg-emerald-400" : "bg-rose-500"
                }`}
              />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-white sm:text-lg">{botTag}</h3>
                <Badge
                  variant="outline"
                  className={`text-[10px] font-mono font-medium ${
                    isConnected
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                  }`}
                >
                  {isConnected ? "● Gateway Connected" : "○ Disconnected"}
                </Badge>
                {enabled ? (
                  <Badge className="border-indigo-500/30 bg-indigo-500/20 text-[10px] text-indigo-300">
                    Bot Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-zinc-700 bg-zinc-800 text-[10px] text-zinc-400">
                    Muted in Config
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
                <span className="font-mono">ID: {botId}</span>
                <span>•</span>
                <span>Guild: <span className="font-mono text-zinc-300">{guildId}</span></span>
                <span>•</span>
                <span>Running on Azure VM ($0 extra cost)</span>
              </div>
            </div>
          </div>

          {/* Quick Active Master Toggle & Status */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-white/5 bg-black/40 px-4 py-3 sm:justify-end">
            <div className="text-right">
              <p className="text-xs font-semibold text-white">Bot Responses</p>
              <p className="text-[10px] text-zinc-400">Enable automated chatter</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>
      </div>

      {/* Navigation Tabs (Mobile horizontally scrollable) */}
      <div className="flex overflow-x-auto border-b border-white/10 pb-2 scrollbar-none sm:space-x-2">
        <button
          onClick={() => setActiveTab("config")}
          className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium transition-all ${
            activeTab === "config"
              ? "bg-indigo-600 text-white shadow-md font-semibold"
              : "text-zinc-400 hover:bg-white/[0.06] hover:text-white"
          }`}
        >
          <Sliders size={14} />
          <span>Personality & Model Config</span>
        </button>
        <button
          onClick={() => setActiveTab("members")}
          className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium transition-all ${
            activeTab === "members"
              ? "bg-indigo-600 text-white shadow-md font-semibold"
              : "text-zinc-400 hover:bg-white/[0.06] hover:text-white"
          }`}
        >
          <Users size={14} />
          <span>Member Dossiers ({members.length})</span>
        </button>
        <button
          onClick={() => setActiveTab("memory")}
          className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium transition-all ${
            activeTab === "memory"
              ? "bg-indigo-600 text-white shadow-md font-semibold"
              : "text-zinc-400 hover:bg-white/[0.06] hover:text-white"
          }`}
        >
          <Brain size={14} />
          <span>Channel Rolling Summary</span>
        </button>
      </div>

      {/* TAB 1: Configuration & Personality */}
      {activeTab === "config" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main Config Column (2 spans on desktop) */}
          <div className="space-y-6 lg:col-span-2">
            {/* Personality & Banter Calibration */}
            <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-5 shadow-lg sm:p-6">
              <div className="flex items-center gap-2 pb-3 border-b border-white/10">
                <Flame className="text-amber-400" size={17} />
                <h4 className="text-sm font-bold text-white">Personality & Banter Calibration</h4>
              </div>

              <div className="mt-5 space-y-6">
                {/* Naughty / Banter Level Slider */}
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-zinc-200">
                      Cheeky / Naughty Level: <span className="font-mono text-amber-400">{naughtyLevel}%</span>
                    </label>
                    <span className="text-[11px] text-zinc-400 italic">
                      {getNaughtyDescription(naughtyLevel)}
                    </span>
                  </div>
                  <div className="mt-3">
                    <Slider
                      value={[naughtyLevel]}
                      min={0}
                      max={100}
                      step={5}
                      onValueChange={(val) => setNaughtyLevel(val[0])}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-zinc-400">
                    Controls how boldly the bot cracks developer jokes, roasts bad coding habits, and teases chat members.
                  </p>
                </div>

                {/* Emoji Reaction Probability */}
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-semibold text-zinc-200">
                      Emoji Reaction Frequency: <span className="font-mono text-indigo-400">{reactionProbability}%</span>
                    </label>
                    <span className="font-mono text-[11px] text-zinc-400">💀 👀 🤡 🔥 🚀 😈</span>
                  </div>
                  <div className="mt-3">
                    <Slider
                      value={[reactionProbability]}
                      min={0}
                      max={100}
                      step={5}
                      onValueChange={(val) => setReactionProbability(val[0])}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-zinc-400">
                    Percentage chance the bot adds a playful or sarcastic emoji reaction to eligible messages.
                  </p>
                </div>

                {/* Proactive Icebreaker / Silence Breaker */}
                <div className="rounded-xl border border-white/5 bg-black/40 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="text-xs font-semibold text-white flex items-center gap-1.5">
                        <Zap size={13} className="text-yellow-400" />
                        Proactive Icebreaker Engine
                      </h5>
                      <p className="mt-0.5 text-[11px] text-zinc-400">
                        Proactively pings a member with a fun debate or dev roast when `#general` goes quiet.
                      </p>
                    </div>
                    <Switch checked={proactiveEnabled} onCheckedChange={setProactiveEnabled} />
                  </div>

                  {proactiveEnabled && (
                    <div className="mt-4 pt-3 border-t border-white/5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-300">Quiet Silence Interval:</span>
                        <span className="font-mono text-zinc-200">{proactiveIntervalMinutes} minutes</span>
                      </div>
                      <div className="mt-2">
                        <Slider
                          value={[proactiveIntervalMinutes]}
                          min={10}
                          max={360}
                          step={10}
                          onValueChange={(val) => setProactiveIntervalMinutes(val[0])}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* System Prompt Customizer */}
            <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-5 shadow-lg sm:p-6">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <MessageSquare className="text-indigo-400" size={17} />
                  <h4 className="text-sm font-bold text-white">Bot System Prompt & Persona</h4>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSystemPrompt(
                      `You are QronosAI (or "Qronos"), the sassy, witty, and mischievously charming official mascot & AI companion of the Qronos AI Discord server!\n\nPERSONALITY & TONE:\n• You are playful, cheeky, funny, and slightly naughty/teasing, but never mean-spirited or toxic.\n• You love roasting developers playfully for syntax errors, pushing directly to main, centering divs with margin-left: 50%, or debugging for 4 hours only to find a missing semicolon.\n• You speak like an active Discord native: keep responses concise (1-3 sentences or punchy bullets), use casual internet slang, banter, and lively emojis (💀, 🤡, 🚀, 👀, 😈, 🔥, 😭).\n• When someone mentions their code, tease them about it before giving a surprisingly sharp, accurate answer.\n• Remember member details, call them by their names/nicknames, and bring up past inside jokes or things they said earlier.\n• Occasionally drop subtle flexes about running frontier models like Claude Opus 5.5, Sonnet & DeepSeek at wholesale speeds.`
                    );
                    toast.info("Reset to default Qronos AI companion persona template.");
                  }}
                  className="h-7 text-[11px] text-zinc-400 hover:text-white"
                >
                  Reset Template
                </Button>
              </div>

              <div className="mt-4">
                <Textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={8}
                  className="font-mono text-xs border-white/10 bg-black/50 text-zinc-200 placeholder:text-zinc-600 leading-relaxed"
                  placeholder="Enter system prompt instructions for Discord bot personality..."
                />
                <p className="mt-2 text-[11px] text-zinc-500">
                  Note: The bot dynamically injects recent rolling channel history and user dossier notes before generating replies.
                </p>
              </div>
            </div>
          </div>

          {/* Settings Sidebar Column (1 span) */}
          <div className="space-y-6">
            {/* LLM & Model Routing */}
            <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-5 shadow-lg">
              <div className="flex items-center gap-2 pb-3 border-b border-white/10">
                <Cpu className="text-emerald-400" size={16} />
                <h4 className="text-sm font-bold text-white">LLM Model Routing</h4>
              </div>

              <div className="mt-4 space-y-4 text-xs">
                <div>
                  <label className="font-semibold text-zinc-300">Inference Model</label>
                  <Input
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    placeholder="e.g. glm-5.3-flash, claude-sonnet-5.5"
                    className="mt-1.5 h-9 font-mono text-xs border-white/10 bg-black/50 text-white"
                  />
                  <p className="mt-1 text-[10px] text-zinc-500">
                    Recommended: <span className="font-mono text-emerald-400">glm-5.3-flash</span> (ultra fast &amp; responsive)
                  </p>
                </div>

                <div>
                  <label className="font-semibold text-zinc-300">API Base URL</label>
                  <Input
                    value={apiBaseUrl}
                    onChange={(e) => setApiBaseUrl(e.target.value)}
                    placeholder="https://api.qronos.me/v1"
                    className="mt-1.5 h-9 font-mono text-xs border-white/10 bg-black/50 text-white"
                  />
                </div>

                <div>
                  <label className="font-semibold text-zinc-300">Qronos API Key</label>
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="qr_..."
                    className="mt-1.5 h-9 font-mono text-xs border-white/10 bg-black/50 text-white"
                  />
                </div>
              </div>
            </div>

            {/* Discord Channels & Guild Binding */}
            <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-5 shadow-lg">
              <div className="flex items-center gap-2 pb-3 border-b border-white/10">
                <Hash className="text-indigo-400" size={16} />
                <h4 className="text-sm font-bold text-white">Target Discord Server</h4>
              </div>

              <div className="mt-4 space-y-4 text-xs">
                <div>
                  <label className="font-semibold text-zinc-300">Discord Guild ID</label>
                  <Input
                    value={guildId}
                    onChange={(e) => setGuildId(e.target.value)}
                    placeholder="1553707015384207453"
                    className="mt-1.5 h-9 font-mono text-xs border-white/10 bg-black/50 text-white"
                  />
                </div>

                <div>
                  <label className="font-semibold text-zinc-300">Allowed Channel IDs</label>
                  <Input
                    value={allowedChannelsStr}
                    onChange={(e) => setAllowedChannelsStr(e.target.value)}
                    placeholder="1562668900565393478"
                    className="mt-1.5 h-9 font-mono text-xs border-white/10 bg-black/50 text-white"
                  />
                  <p className="mt-1 text-[10px] text-zinc-500">
                    Comma-separated list of channel IDs where bot reads and talks.
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Test Message Dispatcher */}
            <div className="rounded-2xl border border-indigo-500/20 bg-indigo-950/20 p-5 shadow-lg">
              <div className="flex items-center gap-2 pb-3 border-b border-indigo-500/20">
                <Send className="text-indigo-400" size={16} />
                <h4 className="text-sm font-bold text-white">Dispatch Test Message</h4>
              </div>

              <div className="mt-4 space-y-3">
                <Textarea
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  placeholder="Type a custom message or leave empty for default test banter..."
                  rows={3}
                  className="text-xs border-indigo-500/20 bg-black/60 text-white placeholder:text-zinc-500"
                />
                <Button
                  onClick={handleSendTest}
                  disabled={sendTestMutation.isPending || !isConnected}
                  className="w-full h-8 gap-1.5 bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-500"
                >
                  <Send size={12} className={sendTestMutation.isPending ? "animate-spin" : ""} />
                  <span>Send to Channel</span>
                </Button>
                {!isConnected && (
                  <p className="text-[10px] text-rose-400 text-center">
                    Bot must be connected to dispatch live messages.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Member Dossiers & Long-Term Memory */}
      {activeTab === "members" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
              <Input
                placeholder="Search members or notes..."
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="h-9 pl-9 text-xs border-white/10 bg-zinc-950 text-white"
              />
            </div>
            <p className="text-xs text-zinc-400">
              Showing {filteredMembers.length} member profiles with persistent memories
            </p>
          </div>

          {filteredMembers.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-zinc-950/60 p-12 text-center">
              <Users className="h-10 w-10 text-zinc-600 mb-3" />
              <p className="text-sm font-semibold text-white">No Member Dossiers Recorded Yet</p>
              <p className="mt-1 max-w-sm text-xs text-zinc-400">
                As members chat in your Discord server, the bot automatically extracts their coding interests, quirks, and banter habits into persistent database memory!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {filteredMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex flex-col justify-between rounded-xl border border-white/10 bg-zinc-950 p-4 shadow-sm transition-colors hover:border-white/20"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h5 className="font-semibold text-white text-sm">
                          {member.displayName || member.username}
                        </h5>
                        <p className="text-[11px] font-mono text-zinc-400">@{member.username}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] border-white/10 bg-white/5 font-mono">
                        {member.interactionCount} turns
                      </Badge>
                    </div>

                    <div className="mt-3 rounded-lg border border-white/5 bg-black/40 p-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-1">
                        <Brain size={11} /> AI Persona Dossier
                      </p>
                      <p className="mt-1 text-xs text-zinc-300 leading-relaxed">
                        {member.personaNotes || "No notable traits extracted yet. Bot learns as they converse."}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3 text-[11px] text-zinc-500">
                    <span>
                      Active:{" "}
                      {member.lastSpokeAt
                        ? formatDistanceToNow(new Date(member.lastSpokeAt), { addSuffix: true })
                        : "recently"}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteMemberMutation.mutate({ discordUserId: member.discordUserId })}
                      className="h-6 px-2 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                    >
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Channel Rolling Semantic Summary */}
      {activeTab === "memory" && (
        <div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-5 shadow-lg sm:p-6">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Brain className="text-indigo-400" size={18} />
              <div>
                <h4 className="text-sm font-bold text-white">Rolling Semantic Channel Memory</h4>
                <p className="text-xs text-zinc-400">
                  Compressed long-term chat summary used to maintain inside jokes and multi-day context.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => utils.admin.discordBotChannelSummary.invalidate()}
              className="h-8 gap-1.5 border-white/10 bg-zinc-900/60 text-xs text-zinc-300 hover:bg-white/10"
            >
              <RefreshCw size={12} className={summaryQuery.isFetching ? "animate-spin" : ""} />
              <span>Refresh Summary</span>
            </Button>
          </div>

          <div className="mt-5 space-y-4">
            {summaryQuery.data?.summary ? (
              <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-5">
                <div className="flex items-center justify-between pb-3 border-b border-indigo-500/20 text-xs">
                  <span className="font-semibold text-indigo-300 flex items-center gap-1.5">
                    <Sparkles size={13} /> Active Compressed Memory Points
                  </span>
                  <span className="font-mono text-zinc-400 text-[11px]">
                    Messages compressed: {summaryQuery.data.messageCount}
                  </span>
                </div>
                <div className="mt-3 text-xs leading-relaxed text-zinc-200 whitespace-pre-wrap font-sans">
                  {summaryQuery.data.summary}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-white/5 bg-black/40 p-10 text-center">
                <Brain className="h-8 w-8 text-zinc-600 mb-2" />
                <p className="text-sm font-medium text-white">No Channel Summary Generated Yet</p>
                <p className="mt-1 text-xs text-zinc-400 max-w-md">
                  Once your Discord channel reaches over 20 messages, the background worker automatically condenses key projects, jokes, and preferences into semantic memory here!
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
