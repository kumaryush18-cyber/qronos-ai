import React, { useState, useDeferredValue } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Globe, Users, Zap, Search, Copy, Check, X, ChevronDown, ChevronUp, Mail } from "lucide-react";
import { coalesceDailyUsage } from "../../../../../shared/usageSeries";
import { QRONOS_MODELS } from "@/lib/modelCatalogue";
import { AdminAccountModelUsage, AdminGlobalModelUsage, AdminCountryDistributionResponse } from "../types";
import { formatTokens } from "../common/AdminCommon";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { UserTierBadge, UserTier } from "@/components/UserTierBadge";

const modelNameById = new Map(QRONOS_MODELS.map((model) => [model.id, model.name]));

export function AccountModelUsageChart({
  usage,
  loading,
}: {
  usage: AdminAccountModelUsage[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid h-28 place-items-center" aria-label="Loading account model usage">
        <Loader2 className="animate-spin text-[#c9ff73]" size={16} />
      </div>
    );
  }
  if (!usage.length) {
    return (
      <div className="grid min-h-24 place-items-center rounded-lg border border-dashed border-white/10 px-4 text-center text-[10px] leading-5 text-[#858697]">
        No model requests have been recorded for this account. Models appear after API-key or Playground activity.
      </div>
    );
  }
  const maximum = Math.max(1, ...usage.map((item) => item.requestCount));
  return (
    <div
      className="space-y-2.5"
      role="img"
      aria-label={`Model usage: ${usage
        .map(
          (item) =>
            `${modelNameById.get(item.modelId) ?? item.modelId}, ${item.requestCount} requests, ${item.totalTokens} tokens`
        )
        .join("; ")}`}
    >
      {usage.map((item) => (
        <div
          className="grid grid-cols-[minmax(5.5rem,.7fr)_minmax(0,1.3fr)_auto] items-center gap-2 sm:grid-cols-[9rem_minmax(0,1fr)_7.25rem]"
          key={item.modelId}
        >
          <div className="min-w-0">
            <p className="truncate font-mono text-[10px] font-semibold text-[#e2e2ea]" title={item.modelId}>
              {modelNameById.get(item.modelId) ?? item.modelId}
            </p>
            <p className="truncate font-mono text-[9px] text-[#77798b]">{item.modelId}</p>
          </div>
          <div className="h-5 overflow-hidden rounded-md border border-white/8 bg-black/25" aria-hidden="true">
            <div
              className="h-full min-w-1 rounded-md bg-gradient-to-r from-[#4c7e22] via-[#82be3d] to-[#c9ff73] transition-[width] duration-200 ease-out"
              style={{ width: `${Math.max(3, (item.requestCount / maximum) * 100)}%` }}
            />
          </div>
          <p className="text-right font-mono text-[9px] font-bold leading-4 tabular-nums text-[#c9ff73]">
            {item.requestCount.toLocaleString()} req
            <br />
            <span className="font-medium text-[#a7a8b6]">{formatTokens(item.totalTokens)} tok</span>
          </p>
        </div>
      ))}
    </div>
  );
}

export function AllAccountModelUsageChart({
  usage,
  loading,
}: {
  usage: AdminGlobalModelUsage[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid h-52 place-items-center" aria-label="Loading all-account model activity">
        <Loader2 className="animate-spin text-[#c9ff73]" size={18} />
      </div>
    );
  }
  if (!usage.length) {
    return (
      <div className="grid h-52 place-items-center px-5 text-center text-xs leading-5 text-[#9091a3]">
        Model bars appear after the first successful request from any Qronos AI account.
      </div>
    );
  }
  const maximum = Math.max(1, ...usage.map((item) => item.requestCount));
  return (
    <div
      className="space-y-3"
      role="img"
      aria-label={`All-account model activity: ${usage
        .map(
          (item) =>
            `${modelNameById.get(item.modelId) ?? item.modelId}, ${item.accountCount} accounts, ${item.requestCount} requests, ${item.totalTokens} tokens`
        )
        .join("; ")}`}
    >
      {usage.map((item) => (
        <div
          className="grid grid-cols-[minmax(5.25rem,.65fr)_minmax(0,1.35fr)] gap-x-2 gap-y-1.5 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-center sm:gap-y-0"
          key={item.modelId}
        >
          <div className="min-w-0">
            <span className="block truncate text-[10px] font-semibold text-[#e4e4ec]" title={item.modelId}>
              {modelNameById.get(item.modelId) ?? item.modelId}
            </span>
            <span className="block truncate font-mono text-[9px] text-[#7f8193]">
              {item.accountCount} account{item.accountCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="h-6 overflow-hidden rounded-md border border-white/8 bg-black/20" aria-hidden="true">
            <div
              className="h-full min-w-1 rounded-md bg-gradient-to-r from-[#487f2d] via-[#7fc838] to-[#c9ff73] transition-[width] duration-200 ease-out"
              style={{ width: `${Math.max(3, (item.requestCount / maximum) * 100)}%` }}
            />
          </div>
          <span className="col-span-2 text-right font-mono text-[9px] font-bold tabular-nums text-[#c9ff73] sm:col-span-1 sm:text-[10px]">
            {item.requestCount.toLocaleString()} req · {formatTokens(item.totalTokens)} tok
          </span>
        </div>
      ))}
    </div>
  );
}

export function AdminUsageChart({
  usage,
  modelUsage,
  loading,
}: {
  usage: { day: string; requests: number; tokens: number }[];
  modelUsage: AdminGlobalModelUsage[];
  loading: boolean;
}) {
  const data = coalesceDailyUsage(usage);
  const max = Math.max(1, ...data.map((row) => row.requests));
  return (
    <div className="space-y-7">
      <div>
        {data.length ? (
          <div className="flex h-40 items-end gap-2">
            {data.map((row) => (
              <div className="group flex h-full flex-1 flex-col justify-end" key={row.day}>
                <div
                  className="rounded-t bg-gradient-to-t from-[#5f9f29] to-[#c9ff73]"
                  style={{ height: `${Math.max(4, (row.requests / max) * 100)}%` }}
                  title={`${row.requests} requests · ${row.tokens.toLocaleString()} tokens`}
                />
                <span className="mt-2 text-center font-mono text-[8px] text-[#77798b]">{row.day.slice(5)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid h-40 place-items-center text-xs text-[#9091a3]">
            No metered activity has been recorded yet.
          </div>
        )}
      </div>
      <div className="border-t border-white/8 pt-5">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.13em] text-[#bfc0cb]">
              All-account model activity
            </p>
            <p className="mt-1 text-[10px] text-[#7f8190]">
              Every model used by at least one Qronos AI account. Bars compare successful request totals.
            </p>
          </div>
          <p className="shrink-0 font-mono text-[9px] text-[#77798b]">Accounts · requests · tokens</p>
        </div>
        <AllAccountModelUsageChart usage={modelUsage} loading={loading} />
      </div>
    </div>
  );
}

export function EmailProviderChart({
  providers,
  loading,
}: {
  providers: { provider: string; accountCount: number }[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid h-52 place-items-center" aria-label="Loading email provider distribution">
        <Loader2 className="animate-spin text-[#c9ff73]" size={18} />
      </div>
    );
  }
  if (!providers.length) {
    return (
      <div className="grid h-52 place-items-center px-5 text-center text-xs leading-5 text-[#9091a3]">
        Email-provider counts will appear after the first account with an email address is registered.
      </div>
    );
  }
  const maximum = Math.max(1, ...providers.map((item) => item.accountCount));
  return (
    <div
      className="space-y-3"
      role="img"
      aria-label={`Email provider distribution: ${providers
        .map((item) => `${item.provider}, ${item.accountCount} accounts`)
        .join("; ")}`}
    >
      {providers.map((item) => (
        <div
          className="grid grid-cols-[minmax(5rem,.55fr)_minmax(0,1.45fr)_2.25rem] items-center gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_3rem]"
          key={item.provider}
        >
          <span className="truncate font-mono text-[10px] font-semibold text-[#d9d8e1]" title={item.provider}>
            {item.provider}
          </span>
          <div className="h-6 overflow-hidden rounded-md border border-white/8 bg-black/20" aria-hidden="true">
            <div
              className="h-full min-w-1 rounded-md bg-gradient-to-r from-[#5f9f29] via-[#92d43c] to-[#c9ff73] transition-[width] duration-200 ease-out"
              style={{ width: `${Math.max(3, (item.accountCount / maximum) * 100)}%` }}
            />
          </div>
          <span className="text-right font-mono text-[10px] font-bold tabular-nums text-[#c9ff73]">
            {item.accountCount}
          </span>
        </div>
      ))}
    </div>
  );
}

export function OrcaRouterSlotUsageChart({
  usage,
  loading,
}: {
  usage: Array<{ slot: number; requestCount: number }>;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid h-56 place-items-center" aria-label="Loading OrcaRouter credential-slot request totals">
        <Loader2 className="animate-spin text-[#c9ff73]" size={18} />
      </div>
    );
  }
  const slots = Array.from({ length: 15 }, (_, slot) => ({
    slot,
    requestCount: usage.find((item) => item.slot === slot)?.requestCount ?? 0,
  }));
  const totalRequests = slots.reduce((total, item) => total + item.requestCount, 0);
  if (!totalRequests) {
    return (
      <div className="grid min-h-36 place-items-center rounded-xl border border-dashed border-white/10 bg-black/10 px-5 text-center text-[11px] leading-5 text-[#9091a3]">
        No OrcaRouter requests have been routed through the active pool since the current service start or the most recent credential rotation.
      </div>
    );
  }
  const maximum = Math.max(1, ...slots.map((item) => item.requestCount));
  return (
    <div
      className="space-y-2.5"
      role="img"
      aria-label={`OrcaRouter credential-slot request totals: ${slots
        .map((item) => `slot ${item.slot + 1}, ${item.requestCount} requests`)
        .join("; ")}`}
    >
      {slots.map((item) => (
        <div
          className="grid grid-cols-[2.75rem_minmax(0,1fr)_3.25rem] items-center gap-2 sm:grid-cols-[4.5rem_minmax(0,1fr)_4.5rem]"
          key={item.slot}
        >
          <span className="font-mono text-[10px] font-semibold text-[#d9d8e1]">
            S{String(item.slot + 1).padStart(2, "0")}
          </span>
          <div className="h-5 overflow-hidden rounded-md border border-white/8 bg-black/25" aria-hidden="true">
            <div
              className="h-full min-w-1 rounded-md bg-gradient-to-r from-[#4c7e22] via-[#82be3d] to-[#c9ff73] transition-[width] duration-200 ease-out"
              style={{ width: `${Math.max(3, (item.requestCount / maximum) * 100)}%` }}
            />
          </div>
          <span className="text-right font-mono text-[10px] font-bold tabular-nums text-[#c9ff73]">
            {item.requestCount.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CountryDistributionChart({
  distribution,
  loading,
}: {
  distribution?: AdminCountryDistributionResponse;
  loading: boolean;
}) {
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const deferredSearch = useDeferredValue(userSearch);

  const countryUsersQuery = trpc.admin.usersByCountry.useQuery(
    { countryCode: selectedCountry!, search: deferredSearch },
    { enabled: Boolean(selectedCountry) }
  );

  const handleCopySingle = (email: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    toast.success(`Copied ${email} to clipboard`);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  const handleCopyAll = (emails: string[]) => {
    const valid = emails.filter(Boolean);
    if (!valid.length) return;
    navigator.clipboard.writeText(valid.join(", "));
    setCopiedAll(true);
    toast.success(`Copied ${valid.length} user emails to clipboard`);
    setTimeout(() => setCopiedAll(false), 2500);
  };

  if (loading) {
    return (
      <div className="grid h-56 place-items-center" aria-label="Loading geographic distribution">
        <Loader2 className="animate-spin text-[#c9ff73]" size={18} />
      </div>
    );
  }

  const items = distribution?.items ?? [];
  if (!items.length) {
    return (
      <div className="grid min-h-36 place-items-center rounded-xl border border-dashed border-white/10 bg-black/10 px-5 text-center text-[11px] leading-5 text-[#9091a3]">
        Geographic user data will appear as accounts register and sign into Qronos AI.
      </div>
    );
  }

  const maxTotal = Math.max(1, ...items.map((i) => i.totalUsers));
  const topCountry = items[0];
  const selectedCountryMeta = items.find((i) => i.countryCode === selectedCountry);

  return (
    <div className="space-y-4">
      {/* KPI Metric Summary Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pb-3 border-b border-white/8">
        <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
          <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">Total Users</p>
          <p className="mt-1 text-sm font-bold font-mono text-white flex items-center gap-1.5">
            <Users size={13} className="text-zinc-400" />
            {distribution?.totalTracked ?? 0}
          </p>
        </div>
        <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
          <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">Active (7 Days)</p>
          <p className="mt-1 text-sm font-bold font-mono text-emerald-400 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {distribution?.totalActive7d ?? 0}
          </p>
        </div>
        <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
          <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">Active Rate</p>
          <p className="mt-1 text-sm font-bold font-mono text-[#c9ff73] flex items-center gap-1">
            <Zap size={13} className="text-[#c9ff73]" />
            {distribution?.globalActiveRate ?? 0}%
          </p>
        </div>
        <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 truncate">
          <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">Top Country</p>
          <p className="mt-1 text-xs font-bold font-mono text-white truncate flex items-center gap-1">
            <span>{topCountry?.flagEmoji || "🌐"}</span>
            <span className="truncate">{topCountry?.countryName || "None"}</span>
          </p>
        </div>
      </div>

      {/* Helper notice */}
      <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
        <span>Click any country bar below to view all user email accounts from that country:</span>
        {selectedCountry && (
          <button
            type="button"
            onClick={() => setSelectedCountry(null)}
            className="text-xs text-zinc-400 hover:text-white underline cursor-pointer"
          >
            Clear selection
          </button>
        )}
      </div>

      {/* Country Breakdown Rows */}
      <div
        className="space-y-2 max-h-72 overflow-y-auto pr-1"
        role="img"
        aria-label="Country user distribution and 7-day activity"
      >
        {items.map((item) => {
          const isSelected = selectedCountry === item.countryCode;

          return (
            <button
              key={item.countryCode}
              type="button"
              onClick={() => {
                setSelectedCountry(isSelected ? null : item.countryCode);
                setUserSearch("");
              }}
              className={`w-full text-left grid grid-cols-[minmax(6.5rem,.8fr)_minmax(0,1.2fr)_auto] items-center gap-2.5 p-2 rounded-xl transition-all cursor-pointer border ${
                isSelected
                  ? "border-[#c9ff73]/50 bg-[#c9ff73]/10 shadow-[0_0_15px_rgba(201,255,115,0.12)] ring-1 ring-[#c9ff73]/40"
                  : "border-white/5 bg-black/25 hover:border-white/15 hover:bg-white/[0.04]"
              }`}
            >
              {/* Country label + flag */}
              <div className="min-w-0 flex items-center gap-1.5">
                <span className="text-sm leading-none shrink-0">{item.flagEmoji}</span>
                <div className="truncate">
                  <span className="block truncate text-[11px] font-semibold text-white font-sans" title={item.countryName}>
                    {item.countryName}
                  </span>
                  <span className="block font-mono text-[9px] text-zinc-500">
                    {item.countryCode} • {isSelected ? "Selected (Click to close)" : "Click to view emails"}
                  </span>
                </div>
              </div>

              {/* Visual Dual/Stacked Bar */}
              <div className="h-5 overflow-hidden rounded-md border border-white/8 bg-black/40 relative" aria-hidden="true">
                {/* Background bar: Total Users */}
                <div
                  className="h-full rounded-md bg-white/15 absolute left-0 top-0 transition-[width] duration-300"
                  style={{ width: `${Math.max(4, (item.totalUsers / maxTotal) * 100)}%` }}
                />
                {/* Foreground glowing bar: Active Users (7d) */}
                <div
                  className="h-full rounded-md bg-gradient-to-r from-[#4c7e22] via-[#82be3d] to-[#c9ff73] absolute left-0 top-0 transition-[width] duration-300"
                  style={{ width: `${Math.max(2, (item.activeUsers7d / maxTotal) * 100)}%` }}
                />
              </div>

              {/* Readout Numbers */}
              <div className="text-right font-mono text-[10px] tabular-nums shrink-0">
                <span className="font-bold text-[#c9ff73]">
                  {item.activeUsers7d} active
                </span>
                <span className="text-zinc-500 text-[9px] ml-1">
                  / {item.totalUsers} ({item.activityRatePercent}%)
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Country Users Drawer / Box */}
      {selectedCountry && (
        <div className="mt-4 p-4 rounded-2xl border border-white/15 bg-black/85 backdrop-blur-2xl space-y-3.5 shadow-2xl animate-in fade-in-0 slide-in-from-top-2 duration-200">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg">{selectedCountryMeta?.flagEmoji || "🌐"}</span>
                <h4 className="text-sm font-bold text-white font-mono flex items-center gap-2">
                  <span>{selectedCountryMeta?.countryName || selectedCountry} Users</span>
                  <span className="text-[10px] text-zinc-300 bg-white/10 px-2 py-0.5 rounded-full border border-white/10 font-mono">
                    {countryUsersQuery.data?.total ?? 0} accounts
                  </span>
                </h4>
              </div>
              <p className="text-[10px] text-zinc-400 mt-1 font-mono">
                Click any email to copy to clipboard. Real-time active status based on 7-day gateway activity.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {countryUsersQuery.data?.users?.length ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopyAll(countryUsersQuery.data!.users.map((u) => u.email || ""))}
                  className="h-7 text-[10px] font-mono border-white/20 text-zinc-300 hover:text-white hover:bg-white/10 cursor-pointer"
                >
                  {copiedAll ? <Check size={11} className="mr-1 text-emerald-400" /> : <Copy size={11} className="mr-1" />}
                  <span>{copiedAll ? "Copied All!" : "Copy All Emails"}</span>
                </Button>
              ) : null}
              <button
                type="button"
                onClick={() => setSelectedCountry(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title="Close user list"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Search Input Filter */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <Input
              type="text"
              placeholder={`Filter ${selectedCountryMeta?.countryName || selectedCountry} users by email or name...`}
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="pl-8 h-8 text-xs font-mono bg-white/[0.04] border-white/10 text-white placeholder:text-zinc-600 rounded-xl"
            />
          </div>

          {/* User Emails List */}
          <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1 divide-y divide-white/[0.04]">
            {countryUsersQuery.isLoading ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin text-[#c9ff73]" />
                <span className="text-[10px] font-mono text-zinc-400">Loading {selectedCountryMeta?.countryName} user directory…</span>
              </div>
            ) : !countryUsersQuery.data?.users.length ? (
              <div className="py-6 text-center text-xs text-zinc-500 font-mono">
                No accounts match your search filter.
              </div>
            ) : (
              countryUsersQuery.data.users.map((u) => (
                <div
                  key={u.id}
                  className="pt-2 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded-lg hover:bg-white/[0.04] transition-colors"
                >
                  <div className="min-w-0 flex items-center gap-2.5">
                    <Mail size={13} className="text-zinc-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-xs font-bold text-white truncate">{u.email || "No email available"}</span>
                        {u.email && (
                          <button
                            type="button"
                            onClick={(e) => handleCopySingle(u.email!, e)}
                            title="Copy email"
                            className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            {copiedEmail === u.email ? (
                              <Check size={11} className="text-emerald-400 stroke-[2.5]" />
                            ) : (
                              <Copy size={11} />
                            )}
                          </button>
                        )}
                      </div>
                      {u.name && <p className="text-[10px] text-zinc-400 truncate">{u.name}</p>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <UserTierBadge tier={u.tier as UserTier} size="xs" showTag />
                    {u.isActive7d ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[9px] font-mono font-bold text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Active (7d)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800/80 border border-zinc-700/60 text-[9px] font-mono text-zinc-500">
                        Inactive
                      </span>
                    )}
                    {u.lastSignedIn && (
                      <span className="text-[9px] font-mono text-zinc-500 hidden md:inline">
                        Last active: {new Date(u.lastSignedIn).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

