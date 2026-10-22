import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Check,
  CheckCircle2,
  AlertTriangle,
  Search,
  Loader2,
  ShieldCheck,
  UserCheck,
  RefreshCw,
  X,
  ArrowRight,
  Shield,
  Coins,
} from "lucide-react";
import { toast } from "sonner";
import { DiscordIcon } from "@/components/LoginWelcomeTour";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function DiscordBypassSection() {
  const [email, setEmail] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [lastResult, setLastResult] = useState<{
    success: boolean;
    message: string;
    user?: { id: number; email: string; name: string | null; tokensAwarded?: number };
  } | null>(null);

  const utils = trpc.useUtils();

  const verifiedAccounts = trpc.admin.discordVerifiedAccountsList.useQuery(
    { limit: 100 },
    { refetchInterval: 30_000 }
  );

  const bypassMutation = trpc.admin.bypassDiscordVerification.useMutation({
    onSuccess: (data) => {
      const tokensMsg = data.user.tokensAwarded
        ? ` and granted ${((data.user.tokensAwarded) / 1_000_000).toFixed(0)}M welcome tokens`
        : "";
      const msg = data.alreadyVerified
        ? `User "${data.user.email}" was already Discord verified.`
        : `User "${data.user.email}" successfully verified${tokensMsg}!`;

      toast.success(msg);
      setLastResult({
        success: true,
        message: msg,
        user: data.user,
      });
      setEmail("");
      utils.admin.discordVerifiedAccountsList.invalidate();
      utils.admin.overview.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
      setLastResult({
        success: false,
        message: error.message,
      });
    },
  });

  const resetMutation = trpc.admin.resetDiscordVerification.useMutation({
    onSuccess: (_, variables) => {
      toast.success("Discord verification reset for user #" + variables.userId);
      utils.admin.discordVerifiedAccountsList.invalidate();
      utils.admin.overview.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      toast.error("Please enter a valid user email address.");
      return;
    }
    setLastResult(null);
    bypassMutation.mutate({ email: cleanEmail });
  };

  const filteredList = useMemo(() => {
    const list = verifiedAccounts.data ?? [];
    if (!searchFilter.trim()) return list;
    const q = searchFilter.toLowerCase();
    return list.filter(
      (acc) =>
        acc.email?.toLowerCase().includes(q) ||
        acc.name?.toLowerCase().includes(q) ||
        String(acc.id).includes(q)
    );
  }, [verifiedAccounts.data, searchFilter]);

  return (
    <section
      style={{
        backgroundColor: "oklch(0.14 0 0)",
        borderColor: "oklch(0.26 0 0)",
        boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
      className="rounded-3xl border p-5 sm:p-7 shadow-2xl relative overflow-hidden"
    >
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#5865F2]/10 blur-3xl" />

      {/* Header */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#5865F2]/20 border border-[#5865F2]/40 text-[#5865F2]">
              <DiscordIcon className="h-4.5 w-4.5" />
            </div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-[.18em] text-[#9ba5f7]">
              Community Access Engine
            </span>
          </div>
          <h2 className="mt-2 text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <span>Discord Verification Bypass</span>
            <Badge className="border border-emerald-500/30 bg-emerald-500/15 text-emerald-400 font-mono text-[10px]">
              Active
            </Badge>
          </h2>
          <p className="mt-1 text-xs text-zinc-400 max-w-2xl leading-relaxed">
            Enter a user’s email address to verify them manually. If the account exists in the database,
            it is immediately marked Discord-verified, unlocking API key creation, Playground, and the 10M welcome tokens.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge className="border border-[#5865F2]/30 bg-[#5865F2]/15 text-[#9ba5f7] font-mono text-xs px-3 py-1">
            <UserCheck size={12} className="mr-1.5 text-emerald-400" />
            {verifiedAccounts.data?.length ?? 0} Verified Accounts
          </Badge>
        </div>
      </div>

      {/* Email Input & Action Form */}
      <div className="relative z-10 mt-5">
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter user email to bypass (e.g. developer@gmail.com)"
              className="h-11 border-white/10 bg-black/60 text-white placeholder:text-zinc-500 font-mono text-xs focus:border-[#5865F2]/60 focus:ring-1 focus:ring-[#5865F2]/40"
              disabled={bypassMutation.isPending}
            />
          </div>
          <Button
            type="submit"
            disabled={!email.trim() || bypassMutation.isPending}
            className="h-11 shrink-0 bg-gradient-to-r from-[#5865F2] to-[#4752c4] hover:from-[#6572f8] hover:to-[#525de0] text-white font-mono font-bold text-xs px-5 cursor-pointer shadow-lg shadow-[#5865F2]/25 border border-[#7289da]/30 disabled:opacity-40"
          >
            {bypassMutation.isPending ? (
              <>
                <Loader2 className="animate-spin mr-1.5" size={14} />
                Checking DB…
              </>
            ) : (
              <>
                <ShieldCheck className="mr-1.5" size={15} />
                Verify &amp; Bypass Discord
              </>
            )}
          </Button>
        </form>

        {/* Live Feedback Banner */}
        {lastResult && (
          <div
            role="status"
            className={`mt-3 flex items-start gap-3 rounded-2xl border p-3.5 text-xs font-mono transition-all ${
              lastResult.success
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-red-500/30 bg-red-500/10 text-red-300"
            }`}
          >
            {lastResult.success ? (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-400" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-semibold">{lastResult.message}</p>
              {lastResult.user && (
                <div className="mt-1 flex items-center gap-2 flex-wrap text-[11px] text-zinc-300">
                  <span className="text-zinc-400">User ID: #{lastResult.user.id}</span>
                  <span>•</span>
                  <span>Email: {lastResult.user.email}</span>
                  {lastResult.user.name && (
                    <>
                      <span>•</span>
                      <span>Name: {lastResult.user.name}</span>
                    </>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setLastResult(null)}
              className="text-zinc-400 hover:text-white"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Fixed Scrolling Section for Verified / Bypassed Users */}
      <div className="relative z-10 mt-6 pt-5 border-t border-white/[0.08]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white font-mono flex items-center gap-1.5">
              <span>Verified Accounts Directory</span>
              <span className="text-zinc-500">({filteredList.length})</span>
            </span>
          </div>

          <div className="relative w-full sm:w-64">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <Input
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search by email or ID…"
              className="h-8 pl-8 text-[11px] font-mono border-white/10 bg-black/40 text-zinc-200 placeholder:text-zinc-500"
            />
          </div>
        </div>

        {/* Scrollable Container with Fixed Max Height */}
        <div
          tabIndex={0}
          aria-label="Verified accounts list"
          className="max-h-[300px] overflow-y-auto space-y-2 pr-1.5 focus:outline-none focus:ring-1 focus:ring-white/20 rounded-xl"
          style={{ scrollbarWidth: "thin" }}
        >
          {verifiedAccounts.isLoading ? (
            <div className="py-12 text-center text-zinc-500 font-mono text-xs flex items-center justify-center gap-2">
              <Loader2 className="animate-spin text-zinc-400" size={16} />
              Loading verified accounts…
            </div>
          ) : filteredList.length === 0 ? (
            <div className="py-10 text-center rounded-2xl border border-white/5 bg-black/20 text-zinc-500 font-mono text-xs">
              {searchFilter
                ? `No verified accounts matching "${searchFilter}".`
                : "No accounts have been Discord verified yet."}
            </div>
          ) : (
            filteredList.map((acc) => (
              <div
                key={acc.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-white/5 bg-black/30 p-3 hover:border-white/15 hover:bg-black/50 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#5865F2]/10 border border-[#5865F2]/25 text-[#5865F2] font-mono font-bold text-xs">
                    {acc.email?.charAt(0).toUpperCase() || "U"}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-white truncate max-w-[220px] sm:max-w-[300px]">
                        {acc.email}
                      </span>
                      <Badge className="border-0 bg-white/[0.06] text-[9px] font-mono text-zinc-400">
                        #{acc.id}
                      </Badge>
                      <Badge className="border border-emerald-500/30 bg-emerald-500/15 text-[9px] font-mono text-emerald-400 flex items-center gap-1">
                        <Check size={9} className="stroke-[3]" />
                        Verified
                      </Badge>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] font-mono text-zinc-400">
                      {acc.name && <span>{acc.name}</span>}
                      {acc.discordVerifiedAt && (
                        <span>
                          Verified: {new Date(acc.discordVerifiedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 justify-between sm:justify-end">
                  <div className="text-right">
                    <span className="text-[9px] font-mono uppercase text-zinc-500 block">Quota Tokens</span>
                    <span className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-1">
                      <Coins size={11} />
                      {acc.codingPlanTokens
                        ? `${(acc.codingPlanTokens / 1_000_000).toFixed(0)}M`
                        : "0M"}
                    </span>
                  </div>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2.5 text-[10px] font-mono border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/40"
                      >
                        Revoke
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="border border-white/10 bg-[#0c0d12] text-white sm:max-w-md rounded-2xl">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-base font-bold text-white">
                          Revoke Discord Verification?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-xs text-zinc-400 leading-relaxed font-mono">
                          This will reset Discord verification for account #{acc.id} ({acc.email}).
                          The user will be required to re-verify Discord before they can access the Playground or generate API keys.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="border-white/10 text-xs font-mono text-zinc-400 hover:bg-white/5">
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() =>
                            resetMutation.mutate({
                              userId: acc.id,
                              confirmation: `RESET DISCORD VERIFICATION ${acc.id}`,
                            })
                          }
                          className="bg-red-600 hover:bg-red-700 text-white text-xs font-mono font-bold"
                        >
                          Confirm Revocation
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

export default DiscordBypassSection;
