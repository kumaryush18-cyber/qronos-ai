import React from "react";
import { Switch } from "@/components/ui/switch";

export const formatCredits = (nanos: number) => `$${Math.round(nanos / 1_000_000_000).toLocaleString("en-US")}`;

export const formatTokens = (tokens: number) => {
  if (tokens >= 1_000_000) {
    const millions = Math.round(tokens / 1_000_000);
    return `${millions.toLocaleString("en-US")} M`;
  }
  if (tokens >= 1_000) {
    const thousands = Math.round(tokens / 1_000);
    return `${thousands.toLocaleString("en-US")} K`;
  }
  return Math.round(tokens).toLocaleString("en-US");
};

export function Toggle({
  label,
  enabled,
  onChange,
  pending,
}: {
  label: string;
  enabled: boolean;
  onChange: (value: boolean) => void;
  pending?: boolean;
}) {
  return (
    <div
      style={{
        backgroundColor: enabled ? "oklch(0.18 0 0)" : "oklch(0.14 0 0)",
        borderColor: enabled ? "oklch(0.35 0 0)" : "oklch(0.24 0 0)",
      }}
      className={`flex shrink-0 items-center gap-2 rounded-xl border px-2.5 py-1 transition-all ${
        enabled ? "shadow-sm" : ""
      }`}
    >
      <span
        className={`min-w-9 text-right text-[9px] font-mono font-bold uppercase tracking-[.12em] ${
          enabled ? "text-emerald-400" : "text-zinc-500"
        }`}
      >
        {pending ? "Saving" : enabled ? "Live" : "Off"}
      </span>
      <Switch
        aria-label={`${label}: ${enabled ? "enabled" : "disabled"}`}
        checked={enabled}
        onCheckedChange={(value) => onChange(Boolean(value))}
        disabled={pending}
        className="h-5 w-9 border-0 data-[state=checked]:bg-white data-[state=unchecked]:bg-zinc-700 [&_[data-slot=switch-thumb]]:size-4 [&_[data-slot=switch-thumb]]:data-[state=checked]:bg-black [&_[data-slot=switch-thumb]]:data-[state=checked]:translate-x-[calc(100%-1px)] cursor-pointer"
      />
    </div>
  );
}

export function Metric({
  icon,
  label,
  value,
  detail,
  lime,
  warning,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  lime?: boolean;
  warning?: boolean;
}) {
  return (
    <div
      style={{
        backgroundColor: "oklch(0.14 0 0)",
        borderColor: "oklch(0.26 0 0)",
        boxShadow: "0 20px 50px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
      className="rounded-2xl border min-w-0 p-4 sm:p-5 flex flex-col justify-between"
    >
      <div className="flex items-center justify-between">
        <div
          className={`grid h-8 w-8 place-items-center rounded-lg border ${
            warning
              ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
              : "border-white/10 bg-white/[0.06] text-white"
          }`}
        >
          {icon}
        </div>
        {warning && (
          <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
        )}
      </div>

      <div className="mt-4">
        <p className="truncate text-xl sm:text-2xl font-bold font-mono text-white tracking-tight">
          {value}
        </p>
        <p className="mt-1 truncate text-xs font-semibold text-zinc-300 font-sans">{label}</p>
        <p className="mt-0.5 hidden text-[10px] text-zinc-500 font-mono sm:block">{detail}</p>
      </div>
    </div>
  );
}

export function SectionHeader({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3 pb-4 border-b border-white/[0.08]">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.06] border border-white/10 text-white">
        {icon}
      </div>
      <div>
        <p className="text-sm font-bold text-white tracking-tight">{title}</p>
        <p className="mt-0.5 text-xs text-zinc-400 leading-relaxed">{detail}</p>
      </div>
    </div>
  );
}
