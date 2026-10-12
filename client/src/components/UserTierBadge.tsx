import React from "react";
import { Sparkles, CheckCircle2, Zap, Brain, Flame, Crown } from "lucide-react";

export type UserTier = "free" | "starter" | "pro" | "power" | "ultra";

export interface UserTierConfig {
  tier: UserTier;
  label: string;
  tag: string;
  description: string;
  badgeClass: string;
  borderClass: string;
  textClass: string;
  glowClass: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
}

export const USER_TIER_CONFIGS: Record<UserTier, UserTierConfig> = {
  free: {
    tier: "free",
    label: "Free",
    tag: "10M Tokens",
    description: "10M starter tokens & daily check-in rewards",
    badgeClass: "bg-white/[0.06] border-white/15 text-zinc-300",
    borderClass: "border-white/20",
    textClass: "text-zinc-300",
    glowClass: "shadow-white/5",
    icon: Sparkles,
  },
  starter: {
    tier: "starter",
    label: "Plus",
    tag: "150M Tokens",
    description: "150M tokens dedicated quota · 10M / $1",
    badgeClass: "bg-white/[0.08] border-white/20 text-white font-semibold",
    borderClass: "border-white/25",
    textClass: "text-white",
    glowClass: "shadow-white/10",
    icon: CheckCircle2,
  },
  pro: {
    tier: "pro",
    label: "Pro",
    tag: "250M Tokens",
    description: "250M tokens dedicated quota · Production grade & VIP routing",
    badgeClass: "bg-white text-black border-white shadow-md font-bold",
    borderClass: "border-white/40",
    textClass: "text-white",
    glowClass: "shadow-white/15",
    icon: Zap,
  },
  power: {
    tier: "power",
    label: "Ultra",
    tag: "1.0B Tokens",
    description: "1.0B tokens · High-throughput pipelines & autonomous agents",
    badgeClass: "bg-emerald-500/15 border-emerald-500/35 text-emerald-300",
    borderClass: "border-emerald-500/40",
    textClass: "text-emerald-300",
    glowClass: "shadow-emerald-500/15",
    icon: Flame,
  },
  ultra: {
    tier: "ultra",
    label: "Enterprise",
    tag: "2.2B Tokens",
    description: "2.2B tokens dedicated capacity, custom SLA & private endpoints",
    badgeClass: "bg-white/[0.15] border-white/30 text-white font-bold",
    borderClass: "border-white/40",
    textClass: "text-white",
    glowClass: "shadow-white/20",
    icon: Crown,
  },
};

export function normalizeUserTier(tier?: string | null): UserTier {
  if (!tier) return "free";
  const normalized = tier.trim().toLowerCase();
  if (normalized === "max") return "pro";
  if (normalized in USER_TIER_CONFIGS) {
    return normalized as UserTier;
  }
  return "free";
}

interface UserTierBadgeProps {
  tier?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  showTag?: boolean;
  className?: string;
}

export function UserTierBadge({
  tier,
  size = "md",
  showTag = false,
  className = "",
}: UserTierBadgeProps) {
  const normalizedTier = normalizeUserTier(tier);
  const config = USER_TIER_CONFIGS[normalizedTier];
  const IconComponent = config.icon;

  const sizeStyles = {
    xs: {
      wrapper: "px-2 py-0.5 text-[10px] gap-1 rounded-md",
      icon: 11,
      tag: "text-[9px] px-1 py-0.2",
    },
    sm: {
      wrapper: "px-2.5 py-1 text-xs gap-1.5 rounded-lg",
      icon: 13,
      tag: "text-[10px] px-1.5 py-0.5",
    },
    md: {
      wrapper: "px-3 py-1.5 text-xs gap-2 rounded-xl",
      icon: 14,
      tag: "text-[10px] px-2 py-0.5",
    },
    lg: {
      wrapper: "px-4 py-2 text-sm gap-2.5 rounded-2xl",
      icon: 17,
      tag: "text-xs px-2.5 py-1",
    },
  }[size];

  return (
    <div
      className={`inline-flex items-center font-semibold border backdrop-blur-sm shadow-sm transition-all ${config.badgeClass} ${config.glowClass} ${sizeStyles.wrapper} ${className}`}
    >
      <IconComponent size={sizeStyles.icon} className="shrink-0" />
      <span className="font-medium tracking-tight whitespace-nowrap">{config.label}</span>
      {showTag && (
        <span
          className={`uppercase font-bold tracking-wider rounded-full bg-white/10 ${sizeStyles.tag} whitespace-nowrap opacity-90`}
        >
          {config.tag}
        </span>
      )}
    </div>
  );
}
