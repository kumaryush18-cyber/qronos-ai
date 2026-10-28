import React, { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Trophy,
  Sparkles,
  Users,
  Clock,
  Gift,
  Copy,
  Check,
  Share2,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Hourglass,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Flame,
  Zap,
  Package,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { StarBorderCard } from "@/components/StarBorderCard";
import { StarBackgroundSvg, StarButton } from "@/components/StarButton";
import { cn } from "@/lib/utils";
import { SwordsmanHero } from "./RoninShowcase";

interface MilestoneGrantItem {
  id: number;
  milestoneCycle: number;
  invitesCountAtGrant: number;
  grantedTokens: number;
  remainingTokens: number;
  usedTokens: number;
  usedPercent: number;
  grantedTokensMillion: number;
  remainingTokensMillion: string;
  grantedPaygNanos: number;
  remainingPaygNanos: number;
  expiresAt: string;
  createdAt: string;
  expiredAt: string | null;
  status: "active" | "consumed" | "expired";
  remainingSeconds: number;
  isExpired: boolean;
  isConsumed: boolean;
}

function useCountdown(expiresAt: string, onExpired?: () => void) {
  const [timeText, setTimeText] = useState("00:00:00");
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const update = () => {
      const diffSec = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
      if (diffSec <= 0) {
        setTimeText("00:00:00");
        setIsExpired(true);
        onExpired?.();
        return;
      }
      const hrs = Math.floor(diffSec / 3600);
      const mins = Math.floor((diffSec % 3600) / 60);
      const secs = diffSec % 60;
      const pad = (n: number) => n.toString().padStart(2, "0");
      setTimeText(`${pad(hrs)}h ${pad(mins)}m ${pad(secs)}s`);
      setIsExpired(false);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return { timeText, isExpired };
}

function MilestonePackCard({
  grant,
  onExpireSweep,
}: {
  grant: MilestoneGrantItem;
  onExpireSweep: () => void;
}) {
  const { timeText, isExpired: localExpired } = useCountdown(grant.expiresAt, onExpireSweep);
  const isExpired = grant.status === "expired" || localExpired;
  const isConsumed = grant.status === "consumed" || grant.remainingTokens <= 0;
  const isActive = !isExpired && !isConsumed;

  return (
    <div
      style={{
        backgroundColor: isActive ? "oklch(0.14 0 0)" : "oklch(0.12 0 0)",
        borderColor: isActive ? "oklch(0.28 0.05 145)" : "oklch(0.22 0 0)",
        boxShadow: isActive
          ? "0 20px 50px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)"
          : "none",
      }}
      className={`rounded-2xl border p-5 sm:p-6 transition-all relative overflow-hidden ${
        isActive ? "ring-1 ring-emerald-500/30" : "opacity-80"
      }`}
    >
      {/* Background ambient gradient glow for active pack */}
      {isActive && (
        <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-emerald-500/[0.07] blur-3xl" />
      )}

      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-xl border ${
              isActive
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                : isConsumed
                ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                : "bg-white/[0.05] border-white/10 text-zinc-500"
            }`}
          >
            <Package size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-white tracking-tight font-mono">
                Milestone Pack #{grant.milestoneCycle}
              </h3>
              <Badge
                className={`font-mono text-[10px] ${
                  isActive
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 animate-pulse"
                    : isConsumed
                    ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                    : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                }`}
              >
                {isActive ? "● Active Pack" : isConsumed ? "✓ 100% Consumed" : "Expired"}
              </Badge>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5 font-mono">
              Unlocked at {grant.invitesCountAtGrant} developer invites ·{" "}
              {format(new Date(grant.createdAt), "MMM d, h:mm a")}
            </p>
          </div>
        </div>

        {/* Live Expiration Countdown Box */}
        <div className="flex items-center gap-3 self-start md:self-auto">
          {isActive ? (
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] shadow-inner">
              <Clock size={14} className="text-emerald-400 animate-spin-slow" />
              <div className="text-right">
                <span className="text-[10px] uppercase font-mono tracking-wider text-emerald-400/80 block">
                  Time Remaining
                </span>
                <span className="text-sm font-bold font-mono text-emerald-300">
                  {timeText}
                </span>
              </div>
            </div>
          ) : isConsumed ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-blue-500/20 bg-blue-500/[0.05]">
              <CheckCircle2 size={14} className="text-blue-400" />
              <span className="text-xs font-mono text-blue-300">All tokens utilized</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/10 bg-black/40">
              <Hourglass size={14} className="text-zinc-500" />
              <span className="text-xs font-mono text-zinc-400">
                Expired {format(new Date(grant.expiresAt), "MMM d, h:mm a")}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Token Meter & Progress */}
      <div className="relative z-10 mt-4 space-y-2">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-zinc-400">
            Tokens Available:{" "}
            <strong className="text-white font-bold">
              {grant.remainingTokens.toLocaleString()}
            </strong>{" "}
            / {grant.grantedTokens.toLocaleString()}
          </span>
          <span className="text-zinc-500">{grant.usedPercent}% utilized</span>
        </div>

        <Progress
          value={grant.usedPercent}
          className={`h-2.5 bg-black/60 border border-white/10 ${
            isActive ? "[&>div]:bg-emerald-500" : isConsumed ? "[&>div]:bg-blue-500" : "[&>div]:bg-zinc-600"
          }`}
        />

        <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 pt-1">
          <span>Grant: +{grant.grantedTokensMillion}M Tokens</span>
          <span>Expires in 48h from unlock</span>
        </div>
      </div>
    </div>
  );
}

function DoubleBorderStarCard({
  children,
  lightColor = "rgba(255, 255, 255, 0.9)",
  lightWidth = 200,
  duration = 7,
  className = "",
}: {
  children: React.ReactNode;
  lightColor?: string;
  lightWidth?: number;
  duration?: number;
  className?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState<string>("");

  useEffect(() => {
    const updatePath = () => {
      if (cardRef.current) {
        const w = cardRef.current.offsetWidth;
        const h = cardRef.current.offsetHeight;
        if (w > 0 && h > 0) {
          setPath(`path('M 0 0 H ${w} V ${h} H 0 V 0')`);
        }
      }
    };
    updatePath();
    const ro = new ResizeObserver(updatePath);
    if (cardRef.current) ro.observe(cardRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={cardRef}
      style={{
        ["--duration" as any]: duration,
        ["--light-width" as any]: `${lightWidth}px`,
        ["--light-color" as any]: lightColor,
        ["--path" as any]: path,
        isolation: "isolate",
      }}
      className={cn(
        "relative overflow-hidden rounded-3xl border border-white/20 p-[2px] bg-black shadow-2xl transition-all duration-300 group",
        className
      )}
    >
      {/* 1. Revolving orbiting star light beam along the perimeter path */}
      {path && (
        <div
          aria-hidden="true"
          className="absolute aspect-square inset-0 animate-star-btn bg-[radial-gradient(ellipse_at_center,var(--light-color),transparent,transparent)] pointer-events-none z-0"
          style={{
            offsetPath: "var(--path)",
            offsetDistance: "0%",
            width: "var(--light-width)",
          }}
        />
      )}

      {/* 2. Inner border + Starry background container (Double Border Design) */}
      <div className="relative z-10 h-full w-full overflow-hidden rounded-[22px] border border-white/15 bg-black p-6 flex flex-col justify-between">
        <div className="absolute inset-0 pointer-events-none opacity-20">
          <StarBackgroundSvg color="#000000" starColor="#ffffff" />
        </div>
        <div className="relative z-10 flex flex-col justify-between h-full space-y-4">
          {children}
        </div>
      </div>
    </div>
  );
}

export function EventsWorkspace() {
  const utils = trpc.useUtils();
  const [copied, setCopied] = useState(false);
  const [activeEvent, setActiveEvent] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const param = new URLSearchParams(window.location.search).get("event");
      if (param === "sprint" || param === "developer-sprint") {
        return "sprint";
      }
    }
    return null;
  });

  useEffect(() => {
    const handlePopState = () => {
      const param = new URLSearchParams(window.location.search).get("event");
      if (param === "sprint" || param === "developer-sprint") {
        setActiveEvent("sprint");
      } else {
        setActiveEvent(null);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const openEvent = (eventId: string) => {
    setActiveEvent(eventId);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("event", eventId);
      window.history.pushState({}, "", url.toString());
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const closeEvent = () => {
    setActiveEvent(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("event");
      window.history.pushState({}, "", url.toString());
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const { data, isLoading, refetch } = trpc.developer.eventsSummary.useQuery(undefined, {
    refetchInterval: 6_000,
  });

  const config = data?.config;
  const stats = data?.stats;
  const grants = data?.grants ?? [];
  const userRefCode = data?.userRefCode || "qr01";
  const origin = typeof window !== "undefined" ? window.location.origin : "https://qronos.me";
  const inviteUrl = `${origin}?aff=${userRefCode}`;
  const shareText = "I'm coding with frontier models on Qronos AI at wholesale rates. Join using my developer invite for high-scale quotas:";

  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    toast.success("Affiliate invite link copied to clipboard!");
    setTimeout(() => setCopied(false), 2500);
  };

  const progressPercent = stats?.invitesRequired
    ? Math.min(100, Math.round((stats.currentCycleProgress / stats.invitesRequired) * 100))
    : 0;

  // View 1: Event Cards Overview (Ongoing Card + 2 Skeleton Upcoming Cards)
  if (!activeEvent) {
    return (
      <div className="space-y-8 animate-in fade-in-0 duration-200">
        {/* Top Interactive Animated Katana Swordsman Hero Header */}
        <SwordsmanHero ongoingCount={1} upcomingCount={2} />

        {/* 3-Card Grid: Ongoing Event + 2 Skeleton Upcoming Cards */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar size={18} className="text-emerald-400" />
              <h2 className="text-lg font-bold font-mono text-white tracking-tight">
                Developer Challenges & Drops
              </h2>
            </div>
            <Badge className="bg-white/10 text-zinc-300 font-mono text-xs border border-white/10">
              3 Total Events
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 1. ONGOING EVENT CARD */}
            <DoubleBorderStarCard
              lightColor="rgba(52, 211, 153, 0.95)"
              lightWidth={220}
              duration={6}
            >
              <div className="space-y-4">
                {/* Top status */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono text-[10px] font-bold">
                      Ongoing
                    </Badge>
                  </div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400/90 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    Sprint Cycle #{stats ? stats.completedMilestones + 1 : 1}
                  </span>
                </div>

                {/* Catchy Headline in Big Metallic Silver Design */}
                <div className="pt-1 space-y-1.5">
                  <h3
                    className="text-2xl sm:text-3xl font-black font-mono tracking-tight uppercase select-none leading-none"
                    style={{
                      background:
                        "linear-gradient(180deg, #FFFFFF 0%, #E4E4E7 25%, #A1A1AA 55%, #FFFFFF 80%, #71717A 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      filter: "drop-shadow(0px 2px 14px rgba(255, 255, 255, 0.35))",
                    }}
                  >
                    TITAN APEX SPRINT
                  </h3>
                  <p className="text-xs text-zinc-400 font-mono font-medium">
                    Invite &amp; Unlock Frontier Compute Quotas
                  </p>
                </div>

                {/* Highlight Perk Tag */}
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] p-3.5 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-mono font-bold text-emerald-300">
                    <Gift size={14} className="text-emerald-400 shrink-0" />
                    <span>Every {config?.invitesRequired ?? 5} Invites = +{config?.tokenGrantMillion ?? 10}M Tokens</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed font-mono">
                    Each milestone unlocked immediately grants +{config?.tokenGrantMillion ?? 10}M Coding Tokens with an independent 48-hour live countdown timer.
                  </p>
                </div>

                {/* Clean Stats Overview (Progress bar removed) */}
                <div className="rounded-xl border border-white/10 bg-black/60 p-3.5 flex items-center justify-between text-xs font-mono">
                  <div>
                    <span className="text-zinc-500 text-[10px] block uppercase tracking-wider">Sprint Status</span>
                    <span className="text-white font-bold">{stats?.currentCycleProgress ?? 0} / {config?.invitesRequired ?? 5} Devs Joined</span>
                  </div>
                  <div className="text-right">
                    <span className="text-zinc-500 text-[10px] block uppercase tracking-wider">Packs Earned</span>
                    <span className="text-emerald-400 font-bold">{stats?.completedMilestones ?? 0} Packs</span>
                  </div>
                </div>
              </div>

              {/* Enter Button with Green Rotating Star Light Design */}
              <div className="pt-5 mt-4 border-t border-white/[0.08]">
                <StarButton
                  type="button"
                  onClick={() => openEvent("sprint")}
                  backgroundColor="#000000"
                  lightColor="rgba(52, 211, 153, 0.95)"
                  starColor="#10b981"
                  borderWidth={2}
                  duration={3}
                  lightWidth={140}
                  className="w-full h-11 rounded-full border border-emerald-500/60 hover:border-emerald-400 text-xs font-mono font-bold shadow-[0_0_25px_rgba(16,185,129,0.35)] cursor-pointer"
                >
                  <span className="text-white flex items-center justify-center gap-2">
                    <span>Enter Event</span>
                    <ArrowRight size={14} className="text-emerald-400 group-hover/star-button:translate-x-1 transition-transform" />
                  </span>
                </StarButton>
              </div>
            </DoubleBorderStarCard>

            {/* 2. UPCOMING EVENT CARD 1 (WITH SKELETON LOADING & METALLIC SILVER HEADLINE) */}
            <DoubleBorderStarCard
              lightColor="rgba(255, 255, 255, 0.85)"
              lightWidth={180}
              duration={8}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/25 font-mono text-[10px] font-bold">
                    Upcoming
                  </Badge>
                  <span className="text-[10px] font-mono text-zinc-500 flex items-center gap-1">
                    <Clock size={11} className="text-zinc-500" />
                    Nov 15, 2026
                  </span>
                </div>

                {/* Big Metallic Silver Headline */}
                <div className="pt-1 space-y-1.5">
                  <h3
                    className="text-2xl sm:text-3xl font-black font-mono tracking-tight uppercase select-none leading-none"
                    style={{
                      background:
                        "linear-gradient(180deg, #FFFFFF 0%, #E4E4E7 25%, #A1A1AA 55%, #FFFFFF 80%, #71717A 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      filter: "drop-shadow(0px 2px 14px rgba(255, 255, 255, 0.35))",
                    }}
                  >
                    NEURAL FORGE 2026
                  </h3>
                  <p className="text-xs text-zinc-400 font-mono font-medium">
                    Autonomous Multi-Agent Hackathon
                  </p>
                </div>

                <div className="rounded-xl border border-white/[0.08] bg-black/60 p-3.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-amber-400/50 animate-pulse" />
                    <Skeleton className="h-3 w-3/5 bg-white/15" />
                  </div>
                  <Skeleton className="h-3 w-full bg-white/[0.06]" />
                  <Skeleton className="h-3 w-4/5 bg-white/[0.04]" />
                </div>

                <div className="space-y-2.5 rounded-xl border border-white/[0.06] bg-black/40 p-3.5">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3 w-24 bg-white/10" />
                    <Skeleton className="h-3 w-16 bg-white/10" />
                  </div>
                  <Skeleton className="h-2 w-full bg-white/[0.06]" />
                </div>
              </div>

              <div className="pt-5 mt-4 border-t border-white/[0.08]">
                <Button
                  disabled
                  className="w-full bg-white/[0.04] border border-white/10 text-zinc-500 font-mono text-xs h-11 rounded-full cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Lock size={13} className="text-zinc-500" />
                  <span>Upcoming · Registration Locked</span>
                </Button>
              </div>
            </DoubleBorderStarCard>

            {/* 3. UPCOMING EVENT CARD 2 (WITH SKELETON LOADING & METALLIC SILVER HEADLINE) */}
            <DoubleBorderStarCard
              lightColor="rgba(255, 255, 255, 0.85)"
              lightWidth={180}
              duration={8}
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <Badge className="bg-blue-500/10 text-blue-400 border border-blue-500/25 font-mono text-[10px] font-bold">
                    Upcoming
                  </Badge>
                  <span className="text-[10px] font-mono text-zinc-500 flex items-center gap-1">
                    <Clock size={11} className="text-zinc-500" />
                    Nov 28, 2026
                  </span>
                </div>

                {/* Big Metallic Silver Headline */}
                <div className="pt-1 space-y-1.5">
                  <h3
                    className="text-2xl sm:text-3xl font-black font-mono tracking-tight uppercase select-none leading-none"
                    style={{
                      background:
                        "linear-gradient(180deg, #FFFFFF 0%, #E4E4E7 25%, #A1A1AA 55%, #FFFFFF 80%, #71717A 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      filter: "drop-shadow(0px 2px 14px rgba(255, 255, 255, 0.35))",
                    }}
                  >
                    QUANTUM MULTIPLIER
                  </h3>
                  <p className="text-xs text-zinc-400 font-mono font-medium">
                    2X Token Recharge Weekend Boost
                  </p>
                </div>

                <div className="rounded-xl border border-white/[0.08] bg-black/60 p-3.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-blue-400/50 animate-pulse" />
                    <Skeleton className="h-3 w-2/3 bg-white/15" />
                  </div>
                  <Skeleton className="h-3 w-full bg-white/[0.06]" />
                  <Skeleton className="h-3 w-3/4 bg-white/[0.04]" />
                </div>

                <div className="space-y-2.5 rounded-xl border border-white/[0.06] bg-black/40 p-3.5">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3 w-28 bg-white/10" />
                    <Skeleton className="h-3 w-14 bg-white/10" />
                  </div>
                  <Skeleton className="h-2 w-full bg-white/[0.06]" />
                </div>
              </div>

              <div className="pt-5 mt-4 border-t border-white/[0.08]">
                <Button
                  disabled
                  className="w-full bg-white/[0.04] border border-white/10 text-zinc-500 font-mono text-xs h-11 rounded-full cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Lock size={13} className="text-zinc-500" />
                  <span>Upcoming · In Development</span>
                </Button>
              </div>
            </DoubleBorderStarCard>
          </div>
        </section>
      </div>
    );
  }

  // View 2: Dedicated Event Page (5 Invites = 10M Tokens)
  return (
    <div className="space-y-8 animate-in fade-in-0 duration-200">
      {/* Top Navigation Bar with Back Button */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] flex-wrap gap-3">
        <Button
          onClick={closeEvent}
          variant="outline"
          className="h-9 px-3.5 rounded-xl border-white/15 bg-black/40 text-xs font-mono text-zinc-300 hover:text-white hover:bg-white/10 cursor-pointer flex items-center gap-2 shadow-sm"
        >
          <ArrowLeft size={14} />
          <span>Back to All Events</span>
        </Button>

        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono font-bold uppercase tracking-wider">
            Active Event Session · 5 Invites = +10M Tokens
          </Badge>
        </div>
      </div>

      {/* 1. TOP SPRINT HERO CARD */}
      <StarBorderCard
        lightWidth={260}
        duration={7}
        lightColor="rgba(52, 211, 153, 0.95)"
        className="rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 sm:p-8 bg-[#0b0d12]/95 rounded-[23px] space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-white/[0.08]">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-400">
                  Live Developer Sprint
                </span>
                <span className="text-zinc-600">•</span>
                <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-bold">
                  🎁 Every {config?.invitesRequired ?? 5} Invites = +{config?.tokenGrantMillion ?? 10}M Tokens
                </Badge>
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-mono">
                Invite & Unlock Frontier Compute
              </h1>
              <p className="text-xs sm:text-sm text-zinc-400 max-w-2xl leading-relaxed">
                Invite fellow developers to build with Qronos AI. Every{" "}
                <strong className="text-emerald-400 font-bold">{config?.invitesRequired ?? 5} developers</strong> who
                sign up through your unique affiliate link unlocks an automatic{" "}
                <strong className="text-white font-bold">
                  +{config?.tokenGrantMillion ?? 10} Million Coding Tokens pack
                </strong>{" "}
                deposited into your Token Plan (valid for {config?.expiryHours ?? 48} hours). Multiple packs stack
                independently!
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right hidden sm:block">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 block">
                  Token Reward Rate
                </span>
                <span className="text-2xl font-bold font-mono text-emerald-400">
                  +{config?.tokenGrantMillion ?? 10}M / {config?.invitesRequired ?? 5} Devs
                </span>
              </div>
            </div>
          </div>

          {/* Current Milestone Cycle Progress Bar */}
          <div className="rounded-2xl border border-white/10 bg-black/60 p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
              <span className="text-zinc-300 font-bold flex items-center gap-2">
                <Trophy size={14} className="text-amber-400" />
                Sprint Cycle #{stats ? stats.completedMilestones + 1 : 1} Progress:
              </span>
              <span className="text-emerald-400 font-bold">
                {stats?.currentCycleProgress ?? 0} / {config?.invitesRequired ?? 5} Invites ({progressPercent}%)
              </span>
            </div>

            <Progress
              value={progressPercent}
              className="h-3 bg-zinc-900 border border-white/10 [&>div]:bg-gradient-to-r [&>div]:from-emerald-500 [&>div]:to-teal-400"
            />

            <div className="flex items-center justify-between text-xs font-mono text-zinc-400 flex-wrap gap-2 pt-1">
              <span>
                👉{" "}
                <strong className="text-white">
                  {stats?.invitesNeededForNextCycle ?? config?.invitesRequired ?? 5} more developer invite
                  {(stats?.invitesNeededForNextCycle ?? 5) === 1 ? "" : "s"}
                </strong>{" "}
                to unlock Pack #{stats ? stats.completedMilestones + 1 : 1} (+{config?.tokenGrantMillion ?? 10}M
                Tokens)!
              </span>
              <span className="text-zinc-500">
                Lifetime Sprint Invites:{" "}
                <strong className="text-zinc-300">{stats?.totalInvitesInCampaign ?? 0} Devs</strong>
              </span>
            </div>
          </div>

          {/* Copy Link Input Bar */}
          <div className="flex flex-col sm:flex-row gap-2 rounded-2xl border border-white/10 bg-black/70 p-2 shadow-inner">
            <code className="min-w-0 flex-1 px-3 py-2 font-mono text-xs text-zinc-200 select-all truncate sm:leading-loose">
              {inviteUrl}
            </code>
            <Button
              onClick={copyInvite}
              className="shrink-0 bg-white text-black hover:bg-zinc-200 font-mono font-bold text-xs h-10 px-5 cursor-pointer shadow-md"
            >
              {copied ? <Check size={14} className="mr-1.5" /> : <Copy size={14} className="mr-1.5" />}
              {copied ? "Copied" : "Copy Link"}
            </Button>
          </div>

          {/* Social Share Buttons */}
          <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
            <span className="text-zinc-500 flex items-center gap-1.5">
              <Share2 size={13} className="text-zinc-400" /> Share directly:
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={`https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(shareText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300 hover:text-white hover:bg-white/[0.1] transition-all cursor-pointer"
              >
                Telegram
              </a>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(shareText)}%20${encodeURIComponent(inviteUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300 hover:text-white hover:bg-white/[0.1] transition-all cursor-pointer"
              >
                WhatsApp
              </a>
            </div>
          </div>
        </div>
      </StarBorderCard>

      {/* 2. REWARD PACKS GRID (WITH INDEPENDENT DOWN-COUNTERS) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={18} className="text-emerald-400" />
            <h2 className="text-lg font-bold font-mono text-white tracking-tight">
              Unlocked Milestone Reward Packs ({grants.length} Total)
            </h2>
          </div>
          <Badge className="bg-white/10 text-zinc-300 font-mono text-xs border border-white/10">
            {stats?.completedMilestones ?? 0} Packs Earned
          </Badge>
        </div>

        {grants.length === 0 ? (
          <div
            style={{ backgroundColor: "oklch(0.13 0 0)", borderColor: "oklch(0.22 0 0)" }}
            className="rounded-3xl border p-8 sm:p-12 text-center space-y-4"
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.05] border border-white/10 text-zinc-400">
              <Gift size={26} />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="text-base font-bold text-white font-mono">No Milestone Packs Unlocked Yet</h3>
              <p className="text-xs text-zinc-400 leading-relaxed font-mono">
                Share your invite link above. Once {config?.invitesRequired ?? 5} developers join via your link, your
                first +{config?.tokenGrantMillion ?? 10}M tokens pack will unlock right here with its 48-hour live
                countdown timer!
              </p>
            </div>
            <Button
              onClick={copyInvite}
              className="bg-emerald-500 hover:bg-emerald-600 text-black font-mono font-bold text-xs h-9 px-5 shadow-lg shadow-emerald-950/40 cursor-pointer"
            >
              <Copy size={13} className="mr-1.5" /> Copy Invite Link to Start
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {grants.map((grant) => (
              <MilestonePackCard key={grant.id} grant={grant} onExpireSweep={() => refetch()} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
