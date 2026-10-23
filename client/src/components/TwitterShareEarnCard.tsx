import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Coins,
  Wallet,
  ArrowRight,
  Eye,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

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
    refetchInterval: 10_000,
  });

  const [countdownText, setCountdownText] = useState("12:00:00");
  const [activeGrantCountdown, setActiveGrantCountdown] = useState("12:00:00");
  const [showPreview, setShowPreview] = useState(false);

  // Check URL query parameters for feedback after returning from Twitter OAuth
  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlParams = new URLSearchParams(window.location.search);
    const rewardStatus = urlParams.get("twitter_reward");

    if (rewardStatus === "success") {
      const tokensM = urlParams.get("tokens_m");
      const paygUsd = urlParams.get("payg_usd");

      let msg = "🎉 Verified X post published!";
      if (tokensM && Number(tokensM) > 0) {
        msg += ` +${tokensM}M Tokens loaded!`;
      }
      if (paygUsd && Number(paygUsd) > 0) {
        msg += ` +$${paygUsd} PAYG added!`;
      }
      msg += " Valid for the next 12 hours.";
      toast.success(msg);

      window.history.replaceState({}, document.title, window.location.pathname);
      refetch();
    } else if (rewardStatus === "cooldown") {
      const rem = urlParams.get("remaining_min") || "a few";
      toast.info(`12-hour cooldown active. Next reward available in ${rem} minutes.`);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (rewardStatus === "declined") {
      toast.error("Twitter authorization was cancelled.");
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (rewardStatus === "error") {
      const errMsg = urlParams.get("message") || "Failed to post on X";
      if (errMsg.includes("missing_write_permissions") || errMsg.includes("reconnect")) {
        toast.error("Write permission missing: please disconnect Qronos AI in Twitter (X) Settings -> Connected Apps, then try again.");
      } else {
        toast.error(`Reward error: ${errMsg.replace(/_/g, " ")}`);
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [refetch]);

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
  const previewTweet = status?.previewTweet ?? null;
  const slotTitle = status?.slotTitle ?? null;

  const rewardLabel = [
    tokenMillion > 0 ? `+${tokenMillion}M Free Tokens` : "",
    paygDollars > 0 ? `+$${paygDollars.toFixed(2)} PAYG` : "",
  ]
    .filter(Boolean)
    .join(" & ") || "+30M Tokens";

  return (
    <div className="rounded-2xl sm:rounded-3xl border border-white/10 bg-gradient-to-b from-[#111318] to-[#0a0b0e] p-5 sm:p-6 space-y-4 shadow-xl relative overflow-hidden my-4">
      {/* Background Accent glow */}
      <div className="absolute top-0 right-0 w-72 h-72 bg-emerald-500/[0.04] rounded-full blur-3xl pointer-events-none" />

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-black shrink-0 shadow-lg shadow-white/10">
            <TwitterXIcon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-bold text-white font-mono tracking-tight flex items-center gap-2">
                Share on 𝕏 to Earn
              </h3>
              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] font-mono font-bold">
                {rewardLabel}
              </Badge>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Post about Qronos on X and get instant temporary compute. Renewable every 12 hours.
            </p>
          </div>
        </div>

        {/* Active grant indicator if running */}
        {activeReward && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] text-xs font-mono self-start sm:self-center">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-300 font-bold">
              Active Grant Expires: {activeGrantCountdown}
            </span>
          </div>
        )}
      </div>

      {/* Main Action area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-1 relative z-10 border-t border-white/5">
        <div className="space-y-1">
          <div className="text-xs text-zinc-300 font-mono">
            <strong>12-Hour Ephemeral Balance:</strong> Granted tokens are loaded into your balance for 12 hours. Unused balance vanishes after 12h and does not stack on renewal.
          </div>
          {status && status.totalPostsCount > 0 && (
            <div className="text-[11px] text-zinc-500 font-mono">
              You have completed <strong>{status.totalPostsCount}</strong> verified 𝕏 reward {status.totalPostsCount === 1 ? "post" : "posts"}.
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
          {previewTweet && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowPreview(!showPreview)}
              className="h-10 px-3 text-xs font-mono text-zinc-400 hover:text-white hover:bg-white/5 gap-1"
            >
              <Eye size={13} />
              {showPreview ? "Hide Preview" : "Preview 300c Post"}
              {showPreview ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </Button>
          )}

          {!user ? (
            <a href="/signin?redirect=/dashboard" className="inline-flex">
              <Button
                className="h-10 px-5 bg-white hover:bg-zinc-200 text-black font-mono font-bold text-xs gap-2 rounded-xl shadow-lg shadow-white/10 transition-all cursor-pointer w-full"
              >
                <TwitterXIcon className="h-4 w-4" />
                Sign in to Share on 𝕏 &amp; Earn
              </Button>
            </a>
          ) : canPost ? (
            <a href="/api/auth/twitter" className="inline-flex">
              <Button
                className="h-10 px-5 bg-white hover:bg-zinc-200 text-black font-mono font-bold text-xs gap-2 rounded-xl shadow-lg shadow-white/10 transition-all cursor-pointer w-full"
              >
                <TwitterXIcon className="h-4 w-4" />
                Post on 𝕏 &amp; Claim Reward
              </Button>
            </a>
          ) : (
            <Button
              disabled
              className="h-10 px-4 bg-white/5 border border-white/10 text-zinc-400 font-mono text-xs gap-2 rounded-xl cursor-not-allowed"
            >
              <Clock size={13} className="text-amber-400" />
              <span>Next Post in: {countdownText}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Collapsible Tweet Preview */}
      {showPreview && previewTweet && (
        <div className="mt-3 p-3.5 rounded-xl border border-white/10 bg-black/60 space-y-2 relative z-10">
          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
            <span>
              Theme Focus: <strong className="text-zinc-200">{slotTitle || "Wholesale Pricing"}</strong>
            </span>
            <span className="text-emerald-400 font-bold">
              {previewTweet.length} / 300 chars
            </span>
          </div>
          <p className="text-xs font-mono text-zinc-200 leading-relaxed bg-white/[0.03] p-2.5 rounded-lg border border-white/5 select-all">
            {previewTweet}
          </p>
          <p className="text-[10px] font-mono text-zinc-500">
            * Your unique referral code is automatically included. Any developer who signs up via your post awards you 25% lifetime commission!
          </p>
        </div>
      )}
    </div>
  );
}
