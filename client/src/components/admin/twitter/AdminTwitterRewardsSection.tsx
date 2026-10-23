import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Sparkles,
  RefreshCw,
  Save,
  Wand2,
  Share2,
  Clock,
  ExternalLink,
  Coins,
  Wallet,
  Users,
  Search,
  CheckCircle2,
  AlertCircle,
  Check,
  RotateCcw,
  Layers,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { SectionHeader, Metric } from "../common/AdminCommon";

export function TwitterXIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function AdminTwitterRewardsSection() {
  const utils = trpc.useUtils();

  // Queries
  const configQuery = trpc.admin.twitterRewardConfig.useQuery();
  const overviewQuery = trpc.admin.twitterRewardsOverview.useQuery(undefined, {
    refetchInterval: 15_000,
  });
  const modelAvailability = trpc.public.modelAvailability.useQuery();

  // Local Form State
  const [tokenGrantMillion, setTokenGrantMillion] = useState<number>(30);
  const [paygGrantDollars, setPaygGrantDollars] = useState<number>(0);
  const [campaignEnabled, setCampaignEnabled] = useState<boolean>(true);
  const [selectedModel, setSelectedModel] = useState<string>("claude-sonnet-5.5");
  const [slots, setSlots] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"slots" | "analytics">("slots");
  const [regeneratingSlotIndex, setRegeneratingSlotIndex] = useState<number | null>(null);

  // Sync state when config loads
  useEffect(() => {
    if (configQuery.data) {
      setTokenGrantMillion(configQuery.data.tokenGrantMillion);
      setPaygGrantDollars(configQuery.data.paygGrantDollars);
      setCampaignEnabled(configQuery.data.enabled);
      setSelectedModel(configQuery.data.selectedModel || "claude-sonnet-5.5");
      setSlots(configQuery.data.slots || []);
    }
  }, [configQuery.data]);

  // Mutations
  const saveConfigMutation = trpc.admin.saveTwitterRewardConfig.useMutation({
    onSuccess: () => {
      toast.success("𝕏 Share-to-Earn configuration saved successfully!");
      utils.admin.twitterRewardConfig.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to save configuration");
    },
  });

  const regenerateSlotMutation = trpc.admin.regenerateTwitterSlot.useMutation({
    onSuccess: (data) => {
      toast.success(`Slot #${data.slot.slotIndex + 1} regenerated with ${data.slot.lastGeneratedModel || selectedModel}!`);
      setSlots((prev) =>
        prev.map((s) => (s.slotIndex === data.slot.slotIndex ? data.slot : s))
      );
      setRegeneratingSlotIndex(null);
      utils.admin.twitterRewardConfig.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to regenerate slot");
      setRegeneratingSlotIndex(null);
    },
  });

  const regenerateAllMutation = trpc.admin.regenerateAllTwitterSlots.useMutation({
    onSuccess: (data) => {
      toast.success(`All 15 slots regenerated with ${selectedModel}!`);
      setSlots(data.slots);
      utils.admin.twitterRewardConfig.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to regenerate all slots");
    },
  });

  const handleSaveConfig = () => {
    saveConfigMutation.mutate({
      enabled: campaignEnabled,
      tokenGrantMillion: Number(tokenGrantMillion) || 0,
      paygGrantDollars: Number(paygGrantDollars) || 0,
      cooldownHours: 12,
      selectedModel,
      slots,
    });
  };

  const handleSlotTextChange = (index: number, newText: string) => {
    setSlots((prev) =>
      prev.map((s, i) => (i === index ? { ...s, templateText: newText } : s))
    );
  };

  const handleSlotToggle = (index: number, enabled: boolean) => {
    setSlots((prev) =>
      prev.map((s, i) => (i === index ? { ...s, enabled } : s))
    );
  };

  const handleRegenerateSlot = (slotIndex: number) => {
    setRegeneratingSlotIndex(slotIndex);
    regenerateSlotMutation.mutate({
      slotIndex,
      model: selectedModel,
    });
  };

  const handleRegenerateAll = () => {
    if (window.confirm(`Regenerate all 15 marketing slots using ${selectedModel}? This will update slot texts to fresh exact-300-char copy.`)) {
      regenerateAllMutation.mutate({ model: selectedModel });
    }
  };

  // Filtered claims for table
  const filteredClaims = (overviewQuery.data?.claims || []).filter((claim) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (claim.userEmail && claim.userEmail.toLowerCase().includes(q)) ||
      (claim.userName && claim.userName.toLowerCase().includes(q)) ||
      (claim.twitterUsername && claim.twitterUsername.toLowerCase().includes(q)) ||
      claim.tweetId.toLowerCase().includes(q)
    );
  });

  // Extract models list from catalogue or fallback list
  const availableModelIds = [
    "claude-sonnet-5.5",
    "claude-opus-5.5",
    "claude-haiku-5.5",
    "deepseek-v4-pro",
    "gpt-6-astra",
    "gpt-6-luna",
    "qwen3.8-max",
    "glm-5.3",
    "claude-fable-5.1",
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 border border-white/20 text-white">
            <TwitterXIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
              𝕏 Share-to-Earn Campaign
              {campaignEnabled ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                  CAMPAIGN LIVE
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-zinc-800 text-zinc-400 border border-zinc-700">
                  PAUSED
                </span>
              )}
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Reward users with 12-hour temporary compute for sharing Qronos on X. Manage 15 rotating content slots, AI generation model, and live user post activity.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSaveConfig}
            disabled={saveConfigMutation.isPending}
            className="h-8 px-4 bg-emerald-500 hover:bg-emerald-600 text-black font-mono font-bold text-xs gap-1.5 shadow-md shadow-emerald-500/20"
          >
            <Save size={13} />
            {saveConfigMutation.isPending ? "Saving..." : "Save Campaign Settings"}
          </Button>
        </div>
      </div>

      {/* Campaign Grant & Settings Card */}
      <div className="rounded-2xl border border-white/10 bg-[#0c0d12]/95 p-5 sm:p-6 space-y-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/8 pb-4">
          <div className="space-y-0.5">
            <h2 className="text-base font-bold text-white font-mono flex items-center gap-2">
              <Coins size={16} className="text-amber-400" />
              12-Hour Reward Grant Amounts
            </h2>
            <p className="text-xs text-zinc-400">
              Users post on X and receive these amounts. Balances vanish after 12 hours if unused and do not stack on subsequent posts.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-bold text-zinc-400">
              {campaignEnabled ? "Campaign Active" : "Campaign Paused"}
            </span>
            <Switch
              checked={campaignEnabled}
              onCheckedChange={setCampaignEnabled}
              className="data-[state=checked]:bg-emerald-500"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          {/* Token Plan Box */}
          <div className="space-y-1.5 p-4 rounded-xl border border-white/10 bg-white/[0.02]">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                Token Plan Grant (Millions)
              </label>
              <Badge variant="outline" className="text-[10px] font-mono border-cyan-500/30 text-cyan-400 bg-cyan-500/10">
                Tokens
              </Badge>
            </div>
            <div className="relative">
              <Input
                type="number"
                min="0"
                step="5"
                placeholder="e.g. 30 or 50"
                value={tokenGrantMillion === 0 ? "" : tokenGrantMillion}
                onChange={(e) => setTokenGrantMillion(Number(e.target.value) || 0)}
                className="h-10 font-mono text-sm bg-black/40 border-white/15 text-white pr-10 rounded-xl"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-cyan-400">
                M
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 font-mono">
              Enter <strong>30</strong> or <strong>50</strong> for 30M or 50M tokens. Leave empty/0 to grant no tokens.
            </p>
          </div>

          {/* PAYG Balance Box */}
          <div className="space-y-1.5 p-4 rounded-xl border border-white/10 bg-white/[0.02]">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                PAYG Dollar Balance ($ USD)
              </label>
              <Badge variant="outline" className="text-[10px] font-mono border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                PAYG
              </Badge>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-mono font-bold text-emerald-400">
                $
              </span>
              <Input
                type="number"
                min="0"
                step="0.5"
                placeholder="e.g. 0.00 or 5.00"
                value={paygGrantDollars === 0 ? "" : paygGrantDollars}
                onChange={(e) => setPaygGrantDollars(Number(e.target.value) || 0)}
                className="h-10 pl-7 font-mono text-sm bg-black/40 border-white/15 text-white rounded-xl"
              />
            </div>
            <p className="text-[11px] text-zinc-500 font-mono">
              Enter <strong>5.00</strong> to grant $5.00 USD. Leave empty/0 to grant no PAYG balance.
            </p>
          </div>

          {/* Cooldown Info */}
          <div className="space-y-1.5 p-4 rounded-xl border border-white/10 bg-white/[0.02] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  Cooldown & Validity
                </label>
                <Clock size={14} className="text-amber-400" />
              </div>
              <p className="text-lg font-bold font-mono text-white mt-2">
                12 Hours
              </p>
              <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
                • 12-hour post cooldown per user
                <br />
                • Unused balance vanishes after 12h
                <br />
                • Non-stacking on renewal
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs (Slots vs Analytics) */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setActiveTab("slots")}
            className={`h-8 px-3.5 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer ${
              activeTab === "slots"
                ? "bg-white text-black shadow-md"
                : "text-zinc-400 hover:text-white hover:bg-white/10"
            }`}
          >
            <Layers size={13} className="mr-1.5" />
            15 Marketing Content Slots ({slots.length})
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setActiveTab("analytics")}
            className={`h-8 px-3.5 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer ${
              activeTab === "analytics"
                ? "bg-white text-black shadow-md"
                : "text-zinc-400 hover:text-white hover:bg-white/10"
            }`}
          >
            <Users size={13} className="mr-1.5" />
            User Post Activity ({overviewQuery.data?.totalPosts || 0})
          </Button>
        </div>

        {activeTab === "slots" && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-zinc-400 hidden sm:inline">
              Generation Model:
            </span>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="h-8 px-2.5 rounded-xl bg-black border border-white/15 text-xs font-mono text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              {availableModelIds.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <Button
              size="sm"
              variant="outline"
              disabled={regenerateAllMutation.isPending}
              onClick={handleRegenerateAll}
              className="h-8 border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-zinc-200 font-mono text-xs gap-1.5"
            >
              <Wand2 size={13} className={regenerateAllMutation.isPending ? "animate-spin text-emerald-400" : "text-amber-400"} />
              {regenerateAllMutation.isPending ? "Generating 15 Slots..." : "Regenerate All Slots"}
            </Button>
          </div>
        )}
      </div>

      {/* TAB 1: 15 CONTENT SLOTS */}
      {activeTab === "slots" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3.5 text-xs font-mono text-amber-200 flex items-start gap-2.5">
            <Sparkles size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              When any user shares on X, the system randomly selects one of the 15 active slots below and injects their unique affiliate code into <code className="bg-black/40 px-1 py-0.5 rounded text-white font-bold">&#123;&#123;REFERRAL_LINK&#125;&#125;</code>.
              Each post is strictly formatted to <strong>exactly 300 characters</strong>. Click <strong>Regenerate</strong> on any slot to have <strong>{selectedModel}</strong> craft fresh viral copy.
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {slots.map((slot, idx) => {
              const currentLen = (slot.templateText || "").length;
              const isExact300 = currentLen === 300;
              const isRegenerating = regeneratingSlotIndex === slot.slotIndex;

              return (
                <div
                  key={slot.slotIndex}
                  className={`rounded-2xl border p-4 sm:p-5 transition-all bg-[#0c0d12]/90 space-y-3 ${
                    slot.enabled ? "border-white/10 hover:border-white/20" : "border-white/5 opacity-60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-white/8 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="h-6 w-6 rounded-md grid place-items-center text-xs font-mono font-bold bg-white/10 text-white">
                        #{slot.slotIndex + 1}
                      </span>
                      <div>
                        <h3 className="text-sm font-bold font-mono text-white">
                          {slot.title}
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Switch
                        checked={slot.enabled}
                        onCheckedChange={(checked) => handleSlotToggle(idx, checked)}
                        className="data-[state=checked]:bg-emerald-500 scale-90"
                      />
                    </div>
                  </div>

                  <p className="text-[11px] font-mono text-zinc-400">
                    <strong className="text-zinc-300">Theme:</strong> {slot.focus}
                  </p>

                  <div className="space-y-1.5">
                    <Textarea
                      rows={4}
                      value={slot.templateText}
                      onChange={(e) => handleSlotTextChange(idx, e.target.value)}
                      placeholder="Enter 300 character template with {{REFERRAL_LINK}}..."
                      className="font-mono text-xs bg-black/60 border-white/15 text-zinc-200 resize-none rounded-xl focus-visible:ring-emerald-500"
                    />

                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <div className="flex items-center gap-2 text-zinc-500">
                        {slot.lastGeneratedModel && (
                          <span>Model: <strong className="text-zinc-400">{slot.lastGeneratedModel}</strong></span>
                        )}
                        {slot.lastGeneratedAt && (
                          <span>• {formatDistanceToNow(new Date(slot.lastGeneratedAt), { addSuffix: true })}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`font-bold px-2 py-0.5 rounded ${
                            isExact300
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                              : "bg-amber-500/10 text-amber-300 border border-amber-500/30"
                          }`}
                        >
                          {currentLen} / 300 chars
                        </span>

                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isRegenerating}
                          onClick={() => handleRegenerateSlot(slot.slotIndex)}
                          className="h-6 px-2 text-[11px] font-mono text-zinc-300 hover:text-white hover:bg-white/10 gap-1 cursor-pointer"
                        >
                          <Wand2 size={11} className={isRegenerating ? "animate-spin text-emerald-400" : "text-amber-400"} />
                          {isRegenerating ? "Generating..." : "Regenerate"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: USER POST ACTIVITY & ANALYTICS */}
      {activeTab === "analytics" && (
        <div className="space-y-4">
          {/* Top Metrics Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="rounded-2xl border border-white/10 bg-[#0c0d12]/95 p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-bold">Total X Posts</span>
                <TwitterXIcon className="h-4 w-4 text-white" />
              </div>
              <p className="mt-2 text-2xl sm:text-3xl font-bold font-mono text-white">
                {(overviewQuery.data?.totalPosts || 0).toLocaleString()}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500 font-mono">
                Verified X posts published across platform
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0c0d12]/95 p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-bold">Participating Users</span>
                <Users size={16} className="text-zinc-300" />
              </div>
              <p className="mt-2 text-2xl sm:text-3xl font-bold font-mono text-white">
                {(overviewQuery.data?.uniqueUsers || 0).toLocaleString()}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500 font-mono">
                Unique accounts earning rewards
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0c0d12]/95 p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400 font-bold">Tokens Awarded</span>
                <Coins size={16} className="text-cyan-400" />
              </div>
              <p className="mt-2 text-2xl sm:text-3xl font-bold font-mono text-cyan-300">
                {Math.round((overviewQuery.data?.totalTokensGranted || 0) / 1_000_000).toLocaleString()} M
              </p>
              <p className="mt-1 text-[11px] text-zinc-500 font-mono">
                Cumulative token quota granted
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0c0d12]/95 p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-bold">PAYG Awarded</span>
                <Wallet size={16} className="text-emerald-400" />
              </div>
              <p className="mt-2 text-2xl sm:text-3xl font-bold font-mono text-emerald-400">
                ${((overviewQuery.data?.totalPaygGrantedNanos || 0) / 1_000_000_000).toFixed(2)}
              </p>
              <p className="mt-1 text-[11px] text-zinc-500 font-mono">
                Cumulative dollar balance granted
              </p>
            </div>
          </div>

          {/* User Posts Table */}
          <div className="rounded-2xl border border-white/10 bg-[#0c0d12]/95 p-5 space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/8 pb-3">
              <h2 className="text-sm font-bold font-mono uppercase tracking-wider text-white flex items-center gap-2">
                <TwitterXIcon className="h-4 w-4" />
                Live User Posts & Reward Feed
              </h2>

              <div className="relative w-full sm:w-72">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <Input
                  placeholder="Filter by email or Twitter handle..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs font-mono bg-black/40 border-white/10 text-white placeholder:text-zinc-600 rounded-xl"
                />
              </div>
            </div>

            {filteredClaims.length === 0 ? (
              <div className="p-8 text-center text-xs font-mono text-zinc-500 rounded-xl border border-dashed border-white/10">
                No verified X posts recorded yet. Once users click &quot;Post on X to Earn&quot;, their posts, handles, and 12-hour reward status will appear here live.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-zinc-500">
                      <th className="pb-2.5 font-bold">User Account</th>
                      <th className="pb-2.5 font-bold">𝕏 Handle</th>
                      <th className="pb-2.5 font-bold">Slot Theme</th>
                      <th className="pb-2.5 font-bold">Reward Loaded</th>
                      <th className="pb-2.5 font-bold">12h Status</th>
                      <th className="pb-2.5 font-bold">Posted</th>
                      <th className="pb-2.5 font-bold text-right">View Tweet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredClaims.map((claim) => {
                      const isExpired = claim.status === "expired" || new Date(claim.expiresAt).getTime() < Date.now();

                      return (
                        <tr key={claim.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-3">
                            <div className="font-bold text-white">{claim.userEmail || `User #${claim.userId}`}</div>
                            {claim.userName && <div className="text-[10px] text-zinc-500">{claim.userName}</div>}
                          </td>

                          <td className="py-3">
                            <span className="font-bold text-zinc-200">@{claim.twitterUsername}</span>
                          </td>

                          <td className="py-3">
                            <Badge variant="outline" className="text-[10px] font-mono border-white/15 text-zinc-300">
                              Slot #{claim.slotIndex + 1}
                            </Badge>
                          </td>

                          <td className="py-3">
                            <div className="text-cyan-400 font-bold">
                              {claim.grantedTokens > 0 ? `+${Math.round(claim.grantedTokens / 1_000_000)}M Tokens` : ""}
                            </div>
                            {claim.grantedPaygNanos > 0 && (
                              <div className="text-emerald-400 text-[10px]">
                                +${(claim.grantedPaygNanos / 1_000_000_000).toFixed(2)} PAYG
                              </div>
                            )}
                          </td>

                          <td className="py-3">
                            {isExpired ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700">
                                Expired
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                Active (Expires {format(new Date(claim.expiresAt), "h:mm a")})
                              </span>
                            )}
                          </td>

                          <td className="py-3 text-zinc-400">
                            <div>{format(new Date(claim.postedAt), "MMM d, h:mm a")}</div>
                            <div className="text-[10px] text-zinc-600">
                              {formatDistanceToNow(new Date(claim.postedAt), { addSuffix: true })}
                            </div>
                          </td>

                          <td className="py-3 text-right">
                            {claim.tweetId && claim.tweetId !== "unknown" ? (
                              <a
                                href={`https://x.com/i/status/${claim.tweetId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 hover:underline"
                              >
                                View 𝕏 <ArrowUpRight size={12} />
                              </a>
                            ) : (
                              <span className="text-zinc-600">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ArrowUpRight({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M7 17L17 7" />
      <path d="M7 7h10v10" />
    </svg>
  );
}
