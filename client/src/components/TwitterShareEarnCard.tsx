import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Sparkles,
  Clock,
  ExternalLink,
  ClipboardPaste,
  CheckCircle2,
  HelpCircle,
  Loader2,
  Shuffle,
} from "lucide-react";
import { toast } from "sonner";

export function TwitterXIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function TwitterShareEarnCard() {
  const { user } = useAuth();
  const { data: status, isLoading, refetch } = trpc.developer.twitterRewardStatus.useQuery(undefined, {
    enabled: Boolean(user),
    refetchInterval: 15_000,
  });

  const [tweetUrl, setTweetUrl] = useState("");
  const [countdownText, setCountdownText] = useState("12:00:00");
  const [activeGrantCountdown, setActiveGrantCountdown] = useState("12:00:00");
  const [showGuide, setShowGuide] = useState(false);

  const verifyMutation = trpc.developer.verifyTwitterShare.useMutation({
    onSuccess: (data) => {
      let msg = "🎉 𝕏 post verified!";
      if (data.tokensMillion && data.tokensMillion > 0) {
        msg += ` +${data.tokensMillion}M Tokens loaded!`;
      }
      if (data.paygDollars && data.paygDollars > 0) {
        msg += ` +$${data.paygDollars} PAYG added!`;
      }
      msg += " Valid for the next 12 hours.";
      toast.success(msg);
      setTweetUrl("");
      refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to verify 𝕏 post. Please check the URL.");
    },
  });

  // Live countdown timer for 12-hour cooldown
  useEffect(() => {
    if (!status?.nextPostAllowedAt || status.canPost) {
      setCountdownText("00:00:00");
      return;
    }

    const updateCooldown = () => {
      const targetMs = new Date(status.nextPostAllowedAt).getTime();
      const diffSec = Math.max(0, Math.ceil((targetMs - Date.now()) / 1000));

      if (diffSec <= 0) {
        setCountdownText("00:00:00");
        refetch();
        return;
      }

      const hrs = Math.floor(diffSec / 3600);
      const mins = Math.floor((diffSec % 3600) / 60);
      const secs = diffSec % 60;
      const pad = (n: number) => n.toString().padStart(2, "0");
      setCountdownText(`${pad(hrs)}h ${pad(mins)}m ${pad(secs)}s`);
    };

    updateCooldown();
    const interval = setInterval(updateCooldown, 1000);
    return () => clearInterval(interval);
  }, [status?.nextPostAllowedAt, status?.canPost, refetch]);

  // Live countdown timer for active grant expiration
  useEffect(() => {
    if (!status?.activeReward?.expiresAt) {
      setActiveGrantCountdown("00:00:00");
      return;
    }

    const updateGrantTimer = () => {
      const expiresMs = new Date(status.activeReward!.expiresAt).getTime();
      const diffSec = Math.max(0, Math.ceil((expiresMs - Date.now()) / 1000));

      if (diffSec <= 0) {
        setActiveGrantCountdown("00:00:00");
        refetch();
        return;
      }

      const hrs = Math.floor(diffSec / 3600);
      const mins = Math.floor((diffSec % 3600) / 60);
      const secs = diffSec % 60;
      const pad = (n: number) => n.toString().padStart(2, "0");
      setActiveGrantCountdown(`${pad(hrs)}h ${pad(mins)}m ${pad(secs)}s`);
    };

    updateGrantTimer();
    const interval = setInterval(updateGrantTimer, 1000);
    return () => clearInterval(interval);
  }, [status?.activeReward?.expiresAt, refetch]);

  if (status && status.config.enabled === false) {
    return null;
  }

  const tokenMillion = status?.config?.tokenGrantMillion ?? 30;
  const paygDollars = status?.config?.paygGrantDollars ?? 0;
  const canPost = Boolean(status?.canPost ?? true);
  const activeReward = status?.activeReward ?? null;
  const previewTweet = status?.previewTweet ?? "Wholesale AI compute on @QronosAI! https://qronos.me";

  const rewardLabel = [
    tokenMillion > 0 ? `+${tokenMillion}M Tokens` : "",
    paygDollars > 0 ? `+$${paygDollars.toFixed(2)} PAYG` : "",
  ]
    .filter(Boolean)
    .join(" & ") || "+30M Tokens";

  const handleOpenTweetIntent = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(previewTweet)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setTweetUrl(text.trim());
        toast.info("Pasted link from clipboard");
      }
    } catch {
      toast.error("Please paste your link manually into the box");
    }
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tweetUrl.trim()) {
      toast.error("Please paste your 𝕏 post URL first");
      return;
    }
    verifyMutation.mutate({ tweetUrl: tweetUrl.trim() });
  };

  return (
    <div className="rounded-2xl sm:rounded-3xl border border-white/10 bg-[#0e1015] p-5 sm:p-6 space-y-4 shadow-xl relative overflow-hidden my-4">
      {/* Top ambient glow */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-500/[0.04] blur-3xl" />

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-black shrink-0 shadow-lg shadow-white/10">
            <TwitterXIcon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-bold text-white font-mono tracking-tight">
                Share on 𝕏 to Earn
              </h3>
              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] font-mono font-bold">
                {rewardLabel} (12h)
              </Badge>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Post about Qronos with your link. Claim instant compute valid for 12 hours (renewable every 12h).
            </p>
          </div>
        </div>

        {/* Active grant indicator if currently running */}
        {activeReward && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] text-xs font-mono self-start sm:self-center">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-300 font-bold">
              Active Grant: {activeGrantCountdown} left
            </span>
          </div>
        )}
      </div>

      {/* Two-step Clean Action Box */}
      <div className="rounded-2xl border border-white/[0.08] bg-black/40 p-4 sm:p-5 space-y-4 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Step 1: Open Tweet intent */}
          <div className="md:col-span-4">
            <Button
              type="button"
              onClick={handleOpenTweetIntent}
              className="w-full h-11 bg-white hover:bg-zinc-200 text-black font-mono font-bold text-xs gap-2 rounded-xl shadow-lg transition-all cursor-pointer"
            >
              <TwitterXIcon className="h-4 w-4" />
              <span>1. Click to Post on 𝕏</span>
              <ExternalLink size={13} className="text-zinc-600" />
            </Button>
          </div>

          {/* Step 2: Paste URL & Verify */}
          <form onSubmit={handleVerify} className="md:col-span-8 flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Input
                type="url"
                value={tweetUrl}
                onChange={(e) => setTweetUrl(e.target.value)}
                placeholder="2. Paste your 𝕏 post URL (e.g. https://x.com/username/status/...)"
                className="h-11 bg-white/[0.04] border-white/10 text-xs font-mono text-white placeholder:text-zinc-500 pr-10 rounded-xl focus:border-emerald-500/50"
              />
              <button
                type="button"
                onClick={handlePasteClipboard}
                title="Paste from clipboard"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white p-1 transition-colors"
              >
                <ClipboardPaste size={15} />
              </button>
            </div>

            {canPost ? (
              <Button
                type="submit"
                disabled={verifyMutation.isPending || !tweetUrl.trim()}
                className="h-11 px-5 bg-emerald-500 hover:bg-emerald-400 text-black font-mono font-bold text-xs gap-1.5 rounded-xl shrink-0 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(16,185,129,0.2)]"
              >
                {verifyMutation.isPending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    <span>Verify & Claim</span>
                  </>
                )}
              </Button>
            ) : (
              <Button
                type="button"
                disabled
                className="h-11 px-4 bg-white/5 border border-white/10 text-zinc-400 font-mono text-xs gap-2 rounded-xl cursor-not-allowed shrink-0"
              >
                <Clock size={13} className="text-amber-400" />
                <span>Next in: {countdownText}</span>
              </Button>
            )}
          </form>
        </div>

        {/* Helper Guide: How to copy URL */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-white/5 text-[11px] font-mono text-zinc-400">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-zinc-500">💡 How to copy link:</span>
            <span>On your 𝕏 post, click the <strong>Share icon (📤)</strong> → click <strong>"Copy link"</strong> → paste it above.</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                refetch();
                toast.info("Swapped to another random 𝕏 post template");
              }}
              className="inline-flex items-center gap-1 text-[10px] text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <Shuffle size={11} className="text-emerald-400" />
              <span>Shuffle copy</span>
            </button>
            <button
              type="button"
              onClick={() => setShowGuide(!showGuide)}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 underline underline-offset-2 self-start sm:self-auto cursor-pointer"
            >
              {showGuide ? "Hide preview" : "View preview"}
            </button>
          </div>
        </div>

        {/* Optional Collapsible preview */}
        {showGuide && (
          <div className="p-3.5 rounded-xl border border-white/5 bg-black/60 text-xs font-mono space-y-2">
            <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-wider">
              <span>Pre-filled Post Format</span>
              <span className="text-emerald-400">Heading & Bullet Points</span>
            </div>
            <pre className="text-zinc-300 bg-white/[0.03] p-3 rounded-lg border border-white/5 select-all whitespace-pre-wrap font-sans text-xs leading-relaxed">
              {previewTweet}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
