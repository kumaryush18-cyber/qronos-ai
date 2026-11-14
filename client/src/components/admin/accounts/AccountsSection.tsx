import React, { useState, useDeferredValue, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { AdminAccount, AdminAccountModelUsage, PreProvisionedAccount } from "../types";
import { formatCredits, formatTokens, SectionHeader } from "../common/AdminCommon";
import { AccountModelUsageChart } from "../overview/AdminCharts";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Copy, Eye, Loader2, Mail, Power, RefreshCw, Search, Trash2, UsersRound, WalletCards, X } from "lucide-react";
import { toast } from "sonner";
import { UserTierBadge, USER_TIER_CONFIGS, UserTier } from "@/components/UserTierBadge";
import { DiscordIcon } from "@/components/LoginWelcomeTour";

function getFlagEmoji(countryCode?: string | null): string {
  if (!countryCode || countryCode.length !== 2 || countryCode === "UN" || countryCode === "GL" || countryCode === "XX") return "🌐";
  const code = countryCode.toUpperCase();
  const first = 127397 + code.charCodeAt(0);
  const second = 127397 + code.charCodeAt(1);
  return String.fromCodePoint(first, second);
}

export function AccountRow({
  account,
  activeAdminId,
  modelUsage,
  modelUsageLoading,
}: {
  account: AdminAccount;
  activeAdminId: number;
  modelUsage: AdminAccountModelUsage[];
  modelUsageLoading: boolean;
}) {
  const utils = trpc.useUtils();
  const [creditAmount, setCreditAmount] = useState("");
  const [creditTarget, setCreditTarget] = useState<"payg" | "tokens">("payg");
  const [creditAction, setCreditAction] = useState<"add" | "set">("add");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [resetVerificationOpen, setResetVerificationOpen] = useState(false);
  const [resetVerificationConfirmation, setResetVerificationConfirmation] = useState("");
  const [emailCopied, setEmailCopied] = useState(false);
  const isCurrentAdmin = account.id === activeAdminId;
  const confirmationPhrase = `DELETE ACCOUNT ${account.id}`;
  const resetVerificationPhrase = `RESET DISCORD VERIFICATION ${account.id}`;

  const control = trpc.admin.setAccountControl.useMutation({
    onSuccess: () => {
      utils.admin.overview.invalidate();
      utils.admin.accounts.invalidate();
      toast.success("Account access updated");
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteAccount = trpc.admin.deleteAccount.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.admin.overview.invalidate(), utils.admin.accounts.invalidate()]);
      toast.success("Account and associated Qronos AI data permanently deleted");
    },
    onError: (error) => toast.error(error.message),
  });

  const addCredit = trpc.admin.addAccountCredit.useMutation({
    onSuccess: async (result) => {
      setCreditAmount("");
      await Promise.all([
        utils.admin.overview.invalidate(),
        utils.admin.accounts.invalidate(),
        utils.admin.activity.invalidate(),
      ]);
      if (result.balanceType === "tokens") {
        const addedM = (result as any).amountTokens ? ((result as any).amountTokens / 1_000_000).toLocaleString() : ((result.amountNanos ?? 0) / 1_000_000).toLocaleString();
        const totalM = (((result as any).codingPlanTokens ?? 0) / 1_000_000).toLocaleString();
        toast.success(`${addedM}M coding tokens added; balance is now ${totalM}M tokens`);
      } else {
        toast.success(
          `$${((result.amountNanos ?? 0) / 1_000_000_000).toFixed(2)} PAYG balance added; PAYG balance is now $${(((result as any).paygBalanceNanos ?? 0) / 1_000_000_000).toFixed(2)}`
        );
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const setCredit = trpc.admin.setAccountCredit.useMutation({
    onSuccess: async (result) => {
      setCreditAmount("");
      await Promise.all([
        utils.admin.overview.invalidate(),
        utils.admin.accounts.invalidate(),
        utils.admin.activity.invalidate(),
      ]);
      if (result.balanceType === "tokens") {
        const targetM = (result as any).targetTokens ? ((result as any).targetTokens / 1_000_000).toLocaleString() : ((result.targetAmountNanos ?? 0) / 1_000_000).toLocaleString();
        toast.success(`Coding tokens set to ${targetM}M tokens for ${account.name || account.email}`);
      } else {
        const targetFormatted = `$${(((result as any).targetAmountNanos ?? 0) / 1_000_000_000).toFixed(2)}`;
        toast.success(
          `Balance set to ${targetFormatted} for ${account.name || account.email}`
        );
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const resetDiscordVerification = trpc.admin.resetDiscordVerification.useMutation({
    onSuccess: async (result) => {
      setResetVerificationOpen(false);
      setResetVerificationConfirmation("");
      await Promise.all([
        utils.admin.overview.invalidate(),
        utils.admin.accounts.invalidate(),
        utils.admin.activity.invalidate(),
      ]);
      toast.success(
        result.reset
          ? "Discord verification reset; the member must verify again"
          : "This account already requires Discord verification"
      );
    },
    onError: (error) => toast.error(error.message),
  });

  const assignTier = trpc.admin.assignUserTier.useMutation({
    onSuccess: (data) => {
      const config = USER_TIER_CONFIGS[data.tier as UserTier];
      toast.success(`Updated tier for ${account.name || account.email} to ${config.label}`);
      void utils.admin.accounts.invalidate();
    },
    onError: (error) => toast.error(error.message || "Failed to update tier"),
  });

  const emailLower = (account.email ?? "").trim().toLowerCase();
  const isWhitelisted = emailLower === "konchoor@gmail.com" || emailLower === "kumaryush18@gmail.com";
  const creditsEnabled = isWhitelisted ? true : Boolean(account.creditsEnabled);

  const logUserMessages = Boolean(account.logUserMessages);
  const toggleLogging = trpc.admin.toggleUserMessageLogging.useMutation({
    onSuccess: (data) => {
      toast.success(
        `Message inspection ${data.enabled ? "enabled (now logging input & AI output)" : "disabled"} for ${account.name || account.email}`
      );
      void utils.admin.accounts.invalidate();
    },
    onError: (error) => toast.error(error.message || "Failed to update message inspection toggle"),
  });

  const activity = account.lastActivityAt ? new Date(account.lastActivityAt).toLocaleDateString() : "No activity";

  return (
    <div
      data-admin-account-row
      className="grid gap-3 border-t border-white/8 py-4 xl:grid-cols-[1.1fr_.75fr_.95fr_auto] xl:items-center"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <p className="truncate text-xs font-bold text-white">{account.name || "Unnamed account"}</p>
          {account.countryCode && (
            <span
              title={`User Country: ${account.countryName || account.countryCode}`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/[0.06] border border-white/10 text-[10px] font-mono text-zinc-300 hover:border-white/20 transition-all shrink-0"
            >
              <span className="text-xs leading-none">{getFlagEmoji(account.countryCode)}</span>
              <span className="font-semibold text-white/90">{account.countryName || account.countryCode}</span>
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-1.5 min-w-0">
          <p className="truncate text-[10px] text-[#8f90a2] font-mono">{account.email || "No email available"}</p>
          {account.email && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!account.email) return;
                navigator.clipboard.writeText(account.email);
                setEmailCopied(true);
                toast.success(`Copied ${account.email} to clipboard`);
                setTimeout(() => setEmailCopied(false), 2000);
              }}
              title="Copy email address"
              className="p-0.5 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer inline-flex items-center justify-center shrink-0"
            >
              {emailCopied ? (
                <Check size={11} className="text-emerald-400 stroke-[2.5]" />
              ) : (
                <Copy size={11} className="text-zinc-400 hover:text-white" />
              )}
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 items-center">
          <div className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-black/30 px-1.5 py-0.5">
            <UserTierBadge tier={account.tier} size="xs" showTag />
            <select
              aria-label={`Change tier for ${account.email}`}
              value={(account.tier as UserTier) || "free"}
              disabled={assignTier.isPending}
              onChange={(e) => assignTier.mutate({ userId: account.id, tier: e.target.value as UserTier })}
              className="h-5 rounded bg-transparent text-[10px] text-white font-mono font-medium outline-none cursor-pointer hover:underline"
            >
              <option value="free" className="bg-[#121214] text-white">Free</option>
              <option value="plus" className="bg-[#121214] text-white">Plus</option>
              <option value="pro" className="bg-[#121214] text-white">Pro</option>
              <option value="ultra" className="bg-[#121214] text-white">Ultra</option>
              <option value="enterprise" className="bg-[#121214] text-white">Enterprise</option>
            </select>
            {assignTier.isPending && <Loader2 className="h-2.5 w-2.5 animate-spin text-white" />}
          </div>
          {/* User Message Inspection Toggle (Admin Control) */}
          <button
            type="button"
            disabled={toggleLogging.isPending}
            onClick={() => toggleLogging.mutate({ userId: account.id, enabled: !logUserMessages })}
            title={
              logUserMessages
                ? "Click to disable prompt & response logging for this user"
                : "Click to start logging all input messages and AI output responses for this user"
            }
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-semibold border transition-all cursor-pointer ${
              logUserMessages
                ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25"
                : "bg-neutral-800/80 border-neutral-700 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
            }`}
          >
            <Eye size={11} className={logUserMessages ? "text-cyan-300" : "text-neutral-400"} />
            <span>Inspect: {logUserMessages ? "ON" : "OFF"}</span>
            {toggleLogging.isPending && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
          </button>
          <Badge className="border-0 bg-white/6 text-[10px] text-zinc-300 font-mono">Standard account</Badge>
          {account.discordVerifiedAt ? (
            <Badge
              title={`Discord verified on ${new Date(account.discordVerifiedAt).toLocaleDateString()}`}
              className="border border-emerald-500/30 bg-emerald-500/15 text-emerald-400 text-[10px] font-mono font-bold inline-flex items-center gap-1.5"
            >
              <DiscordIcon className="h-3 w-3 text-[#5865F2]" />
              <Check size={11} className="text-emerald-400 stroke-[3]" />
              <span>Discord: Verified</span>
            </Badge>
          ) : (
            <Badge
              title="Not yet verified on Discord"
              className="border border-amber-500/30 bg-amber-500/10 text-amber-300 text-[10px] font-mono inline-flex items-center gap-1.5"
            >
              <DiscordIcon className="h-3 w-3 text-amber-400/70" />
              <X size={11} className="text-amber-400" />
              <span>Discord: Unverified</span>
            </Badge>
          )}
          {account.specialReferralSlot && (
            <Badge
              className={`border-0 text-[10px] font-mono ${
                account.specialReferralAwardedAt
                  ? "bg-white/10 text-white"
                  : "bg-amber-500/10 text-amber-300"
              }`}
            >
              Special referral #{account.specialReferralSlot}
              {account.specialReferralAwardedAt ? " · $150 credited" : " · awaiting verification"}
            </Badge>
          )}
          {account.suspicious && <Badge className="border-0 bg-amber-500/10 text-[10px] text-amber-300 font-mono">flagged</Badge>}
          {account.suspended && <Badge className="border-0 bg-red-400/10 text-[10px] text-red-300 font-mono">suspended</Badge>}
          {isCurrentAdmin && (
            <Badge className="border-0 bg-white/10 text-[10px] text-white font-mono">current admin</Badge>
          )}
        </div>
      </div>
      <div>
        <div className="grid grid-cols-2 gap-3 pb-2 border-b border-white/5">
          <div>
            <p className="text-[9px] uppercase tracking-[.10em] text-zinc-400 font-mono font-semibold">PAYG Balance ($)</p>
            <p className="mt-0.5 text-xs font-bold font-mono text-white">
              {formatCredits(account.paygBalanceNanos ?? 0)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-[.10em] text-zinc-400 font-mono font-semibold">Coding Tokens (M)</p>
            <p className="mt-0.5 text-xs font-bold font-mono text-emerald-400">
              {((account.codingPlanTokens ?? 0) / 1_000_000).toLocaleString()}M
            </p>
          </div>
        </div>
        <p className="mt-1 text-[10px] text-[#8f90a2]">
          Lifetime spent{" "}
          <span className="font-mono font-semibold tabular-nums text-[#e2e2ea]">
            {formatCredits(account.lifetimeSpendNanos)}
          </span>
        </p>

        {/* Balance Type & Mode Selector */}
        <div className="mt-2 flex flex-col gap-1">
          <div className="flex items-center gap-1 p-0.5 rounded-md bg-black/40 border border-white/10">
            <button
              type="button"
              onClick={() => setCreditTarget("payg")}
              className={`flex-1 py-0.5 text-[8.5px] font-mono font-bold rounded transition-all cursor-pointer ${
                creditTarget === "payg"
                  ? "bg-white text-black shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              PAYG ($)
            </button>
            <button
              type="button"
              onClick={() => setCreditTarget("tokens")}
              className={`flex-1 py-0.5 text-[8.5px] font-mono font-bold rounded transition-all cursor-pointer ${
                creditTarget === "tokens"
                  ? "bg-white text-black shadow-sm"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Tokens (M)
            </button>
          </div>

          <div className="flex items-center gap-1 p-0.5 rounded-md bg-black/30 border border-white/5">
            <button
              type="button"
              onClick={() => setCreditAction("add")}
              className={`flex-1 py-0.5 text-[8.5px] font-mono font-semibold rounded transition-all cursor-pointer ${
                creditAction === "add"
                  ? "bg-white/15 text-white shadow-xs"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              + Add
            </button>
            <button
              type="button"
              onClick={() => setCreditAction("set")}
              className={`flex-1 py-0.5 text-[8.5px] font-mono font-semibold rounded transition-all cursor-pointer ${
                creditAction === "set"
                  ? "bg-white/15 text-white shadow-xs"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              = Set
            </button>
          </div>
        </div>

        <div className="mt-1.5 flex gap-1">
          <Input
            aria-label={`${creditTarget === "tokens" ? "Tokens" : "PAYG"} ${creditAction === "set" ? "set" : "add"} amount`}
            type="number"
            min={creditAction === "set" ? "0" : "0.01"}
            step={creditTarget === "tokens" ? "1" : "0.01"}
            inputMode="decimal"
            value={creditAmount}
            onChange={(event) => setCreditAmount(event.target.value)}
            placeholder={
              creditAction === "set"
                ? `Set ${creditTarget === "tokens" ? "Tokens (M)" : "PAYG ($)"}`
                : `+ ${creditTarget === "tokens" ? "Tokens (M)" : "PAYG ($)"}`
            }
            className="h-8 min-w-0 bg-black/60 px-2 text-[10px] font-mono border-white/10 text-white placeholder:text-zinc-500 focus:border-white/30"
            disabled={addCredit.isPending || setCredit.isPending}
          />
          <Button
            size="sm"
            className="h-8 shrink-0 px-2.5 text-[10px] font-mono font-bold bg-white text-black hover:bg-zinc-200 cursor-pointer shadow-sm"
            disabled={
              addCredit.isPending ||
              setCredit.isPending ||
              creditAmount === "" ||
              isNaN(Number(creditAmount)) ||
              (creditAction === "add" && Number(creditAmount) <= 0) ||
              (creditAction === "set" && Number(creditAmount) < 0)
            }
            onClick={() => {
              const val = Number(creditAmount);
              if (creditAction === "set") {
                setCredit.mutate({
                  userId: account.id,
                  targetAmountUsd: val,
                  balanceType: creditTarget,
                });
              } else {
                addCredit.mutate({
                  userId: account.id,
                  amountUsd: val,
                  balanceType: creditTarget,
                });
              }
            }}
          >
            {addCredit.isPending || setCredit.isPending ? (
              "…"
            ) : creditAction === "set" ? (
              `Set ${creditTarget === "tokens" ? "Tokens (M)" : "PAYG"}`
            ) : (
              `+ Add ${creditTarget === "tokens" ? "Tokens (M)" : "PAYG"}`
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            aria-label="Permanently delete account now"
            title="Permanently delete this account and all associated Qronos AI data"
            className="h-8 shrink-0 border-red-400/20 px-2 text-red-300 hover:bg-red-400/10 hover:text-red-200"
            disabled={isCurrentAdmin || deleteAccount.isPending}
            onClick={() => deleteAccount.mutate({ userId: account.id })}
          >
            <Trash2 size={13} />
          </Button>
        </div>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-[.12em] text-[#77798b]">Lifetime successful usage</p>
        <p className="mt-1 text-sm font-bold text-white">{formatTokens(account.totalTokens)}</p>
        <p className="mt-0.5 text-[10px] text-[#8f90a2]">
          {account.requestCount.toLocaleString()} requests · {activity}
        </p>
        <p className="mt-1 text-[10px] text-[#8f90a2]">
          Referrals made{" "}
          <span className="font-mono font-semibold tabular-nums text-[#e2e2ea]">
            {account.referralCount.toLocaleString()}
          </span>
        </p>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          variant="outline"
          aria-label={account.suspended ? "Restore account access" : "Suspend account access"}
          className={`h-8 border-white/12 px-2 ${
            account.suspended ? "text-[#8aefc0]" : "text-[#f0a2a9]"
          } hover:bg-white/10`}
          disabled={control.isPending || isCurrentAdmin}
          onClick={() => control.mutate({ userId: account.id, isSuspended: !account.suspended })}
        >
          <Power size={13} />
        </Button>
        <AlertDialog
          open={resetVerificationOpen}
          onOpenChange={(open) => {
            setResetVerificationOpen(open);
            if (!open) setResetVerificationConfirmation("");
          }}
        >
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              aria-label="Reset Discord verification"
              title={
                account.discordVerifiedAt
                  ? "Require Discord membership verification again"
                  : "This account already requires Discord verification"
              }
              className="h-8 border-[#c9ff73]/20 px-2 text-[#c9ff73] hover:bg-[#c9ff73]/10"
              disabled={isCurrentAdmin || !account.discordVerifiedAt || resetDiscordVerification.isPending}
            >
              <RefreshCw size={13} />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="border-white/10 bg-[#09090b] text-white">
            <AlertDialogHeader>
              <AlertDialogTitle>Require Discord verification again?</AlertDialogTitle>
              <AlertDialogDescription className="text-[#a1a2b2]">
                This clears only the account’s membership-verification timestamp. On the next protected dashboard
                request, the member must complete the existing Discord OAuth and guild-membership check again. Qronos AI
                does not retain a Discord identity or OAuth token.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <label className="mt-4 block text-xs font-semibold text-[#d9d8e1]" htmlFor={`reset-discord-${account.id}`}>
              Type <span className="font-mono text-white font-bold">{resetVerificationPhrase}</span> to confirm
            </label>
            <Input
              id={`reset-discord-${account.id}`}
              value={resetVerificationConfirmation}
              onChange={(event) => setResetVerificationConfirmation(event.target.value)}
              placeholder={resetVerificationPhrase}
              autoComplete="off"
              className="mt-2 border-white/20 bg-black/40 font-mono text-xs text-white"
              disabled={resetDiscordVerification.isPending}
            />
            <AlertDialogFooter>
              <AlertDialogCancel className="border-white/12 bg-transparent text-[#d9d8e1] hover:bg-white/10 hover:text-white">
                Cancel
              </AlertDialogCancel>
              <Button
                onClick={() =>
                  resetDiscordVerification.mutate({
                    userId: account.id,
                    confirmation: resetVerificationConfirmation.trim(),
                  })
                }
                disabled={
                  resetDiscordVerification.isPending ||
                  resetVerificationConfirmation.trim() !== resetVerificationPhrase
                }
                className="bg-white text-black hover:bg-zinc-200 font-bold font-mono"
              >
                {resetDiscordVerification.isPending ? "Resetting…" : "Require re-verification"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog
          open={deleteOpen}
          onOpenChange={(open) => {
            setDeleteOpen(open);
            if (!open) setDeleteConfirmation("");
          }}
        >
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              aria-label="Permanently delete account"
              className="h-8 border-red-400/20 px-2 text-red-300 hover:bg-red-400/10 hover:text-red-200"
              disabled={isCurrentAdmin || deleteAccount.isPending}
            >
              <Trash2 size={13} />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="border-white/10 bg-[#09090b] text-white">
            <AlertDialogHeader>
              <AlertDialogTitle>Permanent deletion — step 2 of 2</AlertDialogTitle>
              <AlertDialogDescription className="text-[#a1a2b2]">
                This removes the account’s API keys, credits, usage, credentials, and identity links. Type{" "}
                <span className="font-mono text-[#f4c1c7]">{confirmationPhrase}</span> exactly to continue. The server
                checks this phrase before deletion.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <label className="mt-4 block text-xs font-semibold text-[#d9d8e1]" htmlFor={`delete-account-${account.id}`}>
              Typed confirmation
            </label>
            <Input
              id={`delete-account-${account.id}`}
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              placeholder={confirmationPhrase}
              autoComplete="off"
              className="mt-2 border-red-400/20 bg-black/20 font-mono text-xs"
              disabled={deleteAccount.isPending}
            />
            <AlertDialogFooter>
              <AlertDialogCancel className="border-white/12 bg-transparent text-[#d9d8e1] hover:bg-white/10 hover:text-white">
                Cancel
              </AlertDialogCancel>
              <Button
                onClick={() =>
                  deleteAccount.mutate({ userId: account.id, confirmation: deleteConfirmation.trim() })
                }
                disabled={deleteAccount.isPending || deleteConfirmation.trim() !== confirmationPhrase}
                className="bg-[#ef929b] text-[#271216] hover:bg-[#ffabb2]"
              >
                {deleteAccount.isPending ? "Deleting…" : "Delete permanently"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <div className="rounded-xl border border-white/8 bg-black/15 p-3 xl:col-span-4">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.13em] text-[#bfc0cb]">
              Observed model activity
            </p>
            <p className="mt-1 text-[10px] text-[#7f8190]">
              Only this account’s API-key and Playground request events. No prompts or key material are shown.
            </p>
          </div>
          <p className="shrink-0 font-mono text-[9px] text-[#77798b]">Bars compare request totals</p>
        </div>
        <AccountModelUsageChart usage={modelUsage} loading={modelUsageLoading} />
      </div>
    </div>
  );
}

export function SetAllUsersCreditCard() {
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<"tokens" | "payg">("tokens");
  const [bulkCreditAmount, setBulkCreditAmount] = useState("100");
  const [bulkCreditNote, setBulkCreditNote] = useState("");

  const grantAllUsersTokenPlan = trpc.admin.grantAllUsersTokenPlan.useMutation({
    onSuccess: async (result) => {
      setBulkCreditAmount("100");
      setBulkCreditNote("");
      toast.success(
        `Successfully granted ${result.tokensMillion}M tokens to all ${result.updatedCount} accounts!`
      );
      await Promise.all([
        utils.admin.overview.invalidate(),
        utils.admin.accounts.invalidate(),
        utils.admin.activity.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  const grantAllUsersPayg = trpc.admin.grantAllUsersPayg.useMutation({
    onSuccess: async (result) => {
      setBulkCreditAmount("5.00");
      setBulkCreditNote("");
      toast.success(
        `Successfully granted $${result.amountDollars.toFixed(2)} PAYG balance to all ${result.updatedCount} accounts!`
      );
      await Promise.all([
        utils.admin.overview.invalidate(),
        utils.admin.accounts.invalidate(),
        utils.admin.activity.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <section
      style={{
        backgroundColor: "oklch(0.14 0 0)",
        borderColor: "oklch(0.26 0 0)",
      }}
      className="rounded-3xl border p-5 sm:p-6 shadow-xl"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <SectionHeader
          icon={<WalletCards size={17} className="text-white" />}
          title={activeTab === "tokens" ? "Grant All Users Token Plan" : "Grant All Users PAYG Balance"}
          detail={
            activeTab === "tokens"
              ? "Add token plan tokens (in millions) directly to every user's coding token balance."
              : "Add a dollar amount directly into every user's Pay-As-You-Go compute balance."
          }
        />
        <div className="flex items-center gap-1 p-0.5 rounded-xl bg-black/40 border border-white/10 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              setActiveTab("tokens");
              setBulkCreditAmount("100");
            }}
            className={`px-3 py-1 text-xs font-mono font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "tokens"
                ? "bg-white text-black font-bold shadow-sm"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Token Plan (M Tokens)
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("payg");
              setBulkCreditAmount("5.00");
            }}
            className={`px-3 py-1 text-xs font-mono font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "payg"
                ? "bg-white text-black font-bold shadow-sm"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            PAYG Compute ($ USD)
          </button>
        </div>
      </div>

      <form
        className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          const val = Number(bulkCreditAmount);
          if (isNaN(val) || val <= 0) return;
          if (activeTab === "tokens") {
            grantAllUsersTokenPlan.mutate({ tokensMillion: val, note: bulkCreditNote.trim() || undefined });
          } else {
            grantAllUsersPayg.mutate({ amountUsd: val, note: bulkCreditNote.trim() || undefined });
          }
        }}
      >
        <div>
          <label className="text-xs font-mono font-semibold text-zinc-300" htmlFor="bulk-credit-amount">
            {activeTab === "tokens" ? "Token Grant Amount (Millions of Tokens)" : "PAYG Grant Amount ($ USD)"}
          </label>
          <Input
            id="bulk-credit-amount"
            type="number"
            min={activeTab === "tokens" ? "1" : "0.01"}
            max="100000"
            step={activeTab === "tokens" ? "1" : "0.01"}
            inputMode={activeTab === "tokens" ? "numeric" : "decimal"}
            value={bulkCreditAmount}
            onChange={(event) => setBulkCreditAmount(event.target.value)}
            placeholder={activeTab === "tokens" ? "e.g. 100" : "e.g. 5.00"}
            className="mt-2 h-10 border border-white/10 bg-black/40 text-sm font-mono font-semibold text-white placeholder:text-zinc-500 focus:border-white/30"
            disabled={grantAllUsersTokenPlan.isPending || grantAllUsersPayg.isPending}
          />
        </div>
        <div>
          <label className="text-xs font-mono font-semibold text-zinc-300" htmlFor="bulk-credit-note">
            Optional Note / Reason
          </label>
          <Input
            id="bulk-credit-note"
            value={bulkCreditNote}
            onChange={(event) => setBulkCreditNote(event.target.value)}
            placeholder={activeTab === "tokens" ? "e.g. 100M tokens welcome bonus" : "$5.00 PAYG starting compute grant"}
            className="mt-2 h-10 border-white/10 bg-black/40 text-sm font-mono text-white placeholder:text-zinc-500 focus:border-white/30"
            disabled={grantAllUsersTokenPlan.isPending || grantAllUsersPayg.isPending}
          />
        </div>
        <div className="flex items-end">
          <Button
            type="submit"
            className="h-10 w-full font-mono font-bold text-xs bg-white text-black hover:bg-zinc-200 shadow-md lg:w-auto cursor-pointer"
            disabled={
              bulkCreditAmount === "" ||
              isNaN(Number(bulkCreditAmount)) ||
              Number(bulkCreditAmount) <= 0 ||
              grantAllUsersTokenPlan.isPending ||
              grantAllUsersPayg.isPending
            }
          >
            {grantAllUsersTokenPlan.isPending || grantAllUsersPayg.isPending ? (
              <>
                <Loader2 className="animate-spin mr-1" size={14} />
                Executing Bulk Update…
              </>
            ) : activeTab === "tokens" ? (
              `+${
                !isNaN(Number(bulkCreditAmount)) && bulkCreditAmount !== ""
                  ? Number(bulkCreditAmount)
                  : "100"
              }M Tokens to All Users`
            ) : (
              `Grant +$${
                !isNaN(Number(bulkCreditAmount)) && bulkCreditAmount !== ""
                  ? Number(bulkCreditAmount).toFixed(2)
                  : "5.00"
              } PAYG to All Users`
            )}
          </Button>
        </div>
      </form>
      <p className="mt-3 text-[10px] leading-5 text-[#858697]">
        {activeTab === "tokens"
          ? "Adds the specified millions of coding tokens to all user balances without overwriting existing tokens. Writes immutable ledger records with no Discord requirement."
          : "Adds the specified balance to all user PAYG balances without overwriting existing deposited funds. Writes immutable ledger records."}
      </p>
    </section>
  );
}

export function AccountsSection({ activeAdminId }: { activeAdminId: number }) {
  const utils = trpc.useUtils();
  const [accountSearch, setAccountSearch] = useState("");
  const [preProvisionEmail, setPreProvisionEmail] = useState("");
  const [accountStatus, setAccountStatus] = useState<"all" | "active" | "suspended" | "flagged">("all");
  const [accountSort, setAccountSort] = useState<
    "latestJoin" | "mostTokens" | "discordVerified" | "mostCredit" | "mostReferrals" | "specialReferral"
  >("latestJoin");
  const [accountPage, setAccountPage] = useState(1);
  const deferredAccountSearch = useDeferredValue(accountSearch);

  const accountDirectoryInput = useMemo(
    () => ({
      page: accountPage,
      pageSize: 10,
      search: deferredAccountSearch,
      status: accountStatus,
      sort: accountSort,
    }),
    [accountPage, accountSort, accountStatus, deferredAccountSearch]
  );

  const accountDirectory = trpc.admin.accounts.useQuery(accountDirectoryInput, { refetchInterval: 15_000 });
  const preProvisionedAccounts = trpc.admin.preProvisionedAccounts.useQuery(undefined, { refetchInterval: 15_000 });

  const preProvisionAccount = trpc.admin.preProvisionAccount.useMutation({
    onSuccess: async (result) => {
      if (result.kind === "created") {
        setPreProvisionEmail("");
        toast.success(`${result.email} added to database with $50 credit and authorized for instant login`);
      } else if (result.kind === "existing_user") {
        toast.info("A Qronos AI account already exists in the database for that email");
      } else {
        toast.info("That email is already authorized for dashboard access");
      }
      await Promise.all([
        utils.admin.preProvisionedAccounts.invalidate(),
        utils.admin.accounts.invalidate(),
        utils.admin.overview.invalidate(),
        utils.admin.activity.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  const deletePreProvisionAccount = trpc.admin.deletePreProvisionedAccount.useMutation({
    onSuccess: async () => {
      toast.success("Authorization removed for email");
      await Promise.all([utils.admin.preProvisionedAccounts.invalidate(), utils.admin.activity.invalidate()]);
    },
    onError: (error) => toast.error(error.message),
  });

  const accountItems = (accountDirectory.data?.items ?? []) as AdminAccount[];
  const visibleAccountIds = useMemo(() => accountItems.map((account) => account.id), [accountItems]);
  const accountModelUsage = trpc.admin.accountModelUsage.useQuery(
    { userIds: visibleAccountIds.length ? visibleAccountIds : [activeAdminId] },
    { enabled: visibleAccountIds.length > 0, refetchInterval: 15_000 }
  );

  const modelUsageByAccount = useMemo(() => {
    const grouped = new Map<number, AdminAccountModelUsage[]>();
    for (const item of (accountModelUsage.data ?? []) as AdminAccountModelUsage[]) {
      const current = grouped.get(item.userId) ?? [];
      current.push(item);
      grouped.set(item.userId, current);
    }
    return grouped;
  }, [accountModelUsage.data]);

  useEffect(() => {
    setAccountPage(1);
  }, [deferredAccountSearch, accountSort, accountStatus]);

  return (
    <div className="space-y-4">
      <SetAllUsersCreditCard />

      <section className="dashboard-card">
        <SectionHeader
          icon={<Mail size={17} />}
          title="Authorize Developer Email for Dashboard Access"
          detail="Add an email here to grant that user instant dashboard access. When they enter this email in the sign-in verify box, their account is initialized and logged in immediately."
        />
        <form
          className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            if (preProvisionEmail.trim()) preProvisionAccount.mutate({ email: preProvisionEmail });
          }}
        >
          <div>
            <label className="sr-only" htmlFor="pre-provision-email">
              Email address to authorize
            </label>
            <Input
              id="pre-provision-email"
              type="email"
              value={preProvisionEmail}
              onChange={(event) => setPreProvisionEmail(event.target.value)}
              placeholder="developer@gmail.com"
              autoComplete="off"
              className="h-10 border-[#c9ff73]/20 bg-black/15 text-sm"
              disabled={preProvisionAccount.isPending}
            />
            <p className="mt-2 text-[10px] leading-5 text-[#858697]">
              When this user types their email on the sign-in verify input box, they are immediately granted access with
              their welcome credit.
            </p>
          </div>
          <Button
            type="submit"
            className="h-10 bg-white text-black hover:bg-zinc-200 font-mono font-bold text-xs shadow-md"
            disabled={!preProvisionEmail.trim() || preProvisionAccount.isPending}
          >
            {preProvisionAccount.isPending ? (
              <>
                <Loader2 className="animate-spin mr-1" size={14} />
                Authorizing…
              </>
            ) : (
              "Authorize Email"
            )}
          </Button>
        </form>
        <div className="mt-5 overflow-hidden rounded-xl border border-white/8 bg-black/10">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-b border-white/8 px-4 py-3 text-[10px] font-bold uppercase tracking-[.12em] text-[#858697]">
            <span>Authorized Email</span>
            <span>Access Status</span>
            <span>Action</span>
          </div>
          {preProvisionedAccounts.isLoading ? (
            <div className="grid h-24 place-items-center">
              <Loader2 className="animate-spin text-white" size={16} />
            </div>
          ) : (preProvisionedAccounts.data as PreProvisionedAccount[] | undefined)?.length ? (
            (preProvisionedAccounts.data as PreProvisionedAccount[]).map((record) => (
              <div
                key={record.id}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-white/6 px-4 py-3 text-xs last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-white">{record.email}</p>
                  <p className="mt-1 text-[10px] text-[#858697]">
                    Authorized {new Date(record.createdAt).toLocaleString()} ·{" "}
                    {formatCredits(record.introductoryCreditNanos)} welcome credit
                  </p>
                </div>
                <Badge
                  className={`h-fit border-0 text-[10px] font-mono ${
                    record.activatedAt ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-300"
                  }`}
                >
                  {record.activatedAt
                    ? `Activated${record.activatedUserName ? ` · ${record.activatedUserName}` : ""}`
                    : "Authorized (Awaiting user verify)"}
                </Badge>
                <div className="flex justify-end">
                  {!record.activatedAt ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-[#858697] hover:bg-red-500/10 hover:text-red-400"
                      title="Remove authorization"
                      disabled={deletePreProvisionAccount.isPending}
                      onClick={() => deletePreProvisionAccount.mutate({ id: record.id })}
                    >
                      <Trash2 size={13} />
                    </Button>
                  ) : (
                    <span className="text-[10px] text-[#858697]">—</span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="px-4 py-8 text-center text-xs text-[#858697]">
              No authorized emails yet. Enter an email above to grant access.
            </p>
          )}
        </div>
      </section>

      <section className="dashboard-card">
        <SectionHeader
          icon={<UsersRound size={17} />}
          title="Accounts"
          detail="Search name, email, or account ID. API key material is never shown. Deletion is irreversible and leaves only a non-reversible identity guard."
        />
        <div className="mt-5 grid gap-2 lg:grid-cols-[minmax(0,1fr)_9rem_12rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 text-[#858697]" size={15} />
            <Input
              value={accountSearch}
              onChange={(event) => setAccountSearch(event.target.value)}
              placeholder="Search name, email, or account ID"
              className="h-10 border-white/10 bg-black/15 pl-9 text-xs"
            />
          </div>
          <label className="sr-only" htmlFor="account-status-filter">
            Filter accounts by status
          </label>
          <select
            id="account-status-filter"
            value={accountStatus}
            onChange={(event) => setAccountStatus(event.target.value as typeof accountStatus)}
            className="h-10 rounded-lg border border-white/10 bg-black/15 px-3 text-xs text-[#e5e5ed] outline-none transition focus:border-[#c9ff73]/60"
          >
            <option value="all">All states</option>
            <option value="active">Active</option>
            <option value="flagged">Flagged</option>
            <option value="suspended">Suspended</option>
          </select>
          <label className="sr-only" htmlFor="account-sort">
            Sort accounts
          </label>
          <select
            id="account-sort"
            value={accountSort}
            onChange={(event) => setAccountSort(event.target.value as typeof accountSort)}
            className="h-10 rounded-lg border border-white/10 bg-black/15 px-3 text-xs text-[#e5e5ed] outline-none transition focus:border-[#c9ff73]/60"
          >
            <option value="latestJoin">Latest joined</option>
            <option value="mostTokens">Most tokens used</option>
            <option value="discordVerified">Discord verified first</option>
            <option value="mostCredit">Most credit</option>
            <option value="mostReferrals">Most referrals made</option>
            <option value="specialReferral">Special referral first</option>
          </select>
        </div>
        <div className="mt-4 rounded-xl border border-white/8 bg-black/10 px-3 sm:px-5">
          {accountDirectory.isLoading ? (
            <div className="grid h-40 place-items-center">
              <Loader2 className="animate-spin text-[#c9ff73]" size={18} />
            </div>
          ) : accountItems.length ? (
            accountItems.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                activeAdminId={activeAdminId}
                modelUsage={modelUsageByAccount.get(account.id) ?? []}
                modelUsageLoading={accountModelUsage.isLoading}
              />
            ))
          ) : (
            <p className="py-12 text-center text-sm text-[#9091a3]">No accounts match these filters.</p>
          )}
        </div>
        {accountDirectory.data && accountDirectory.data.total > 0 && (
          <div className="mt-4 flex flex-col gap-3 border-t border-white/8 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[#8f90a2]">
              Showing {(accountDirectory.data.page - 1) * accountDirectory.data.pageSize + 1}–
              {Math.min(
                accountDirectory.data.page * accountDirectory.data.pageSize,
                accountDirectory.data.total
              )}{" "}
              of {accountDirectory.data.total.toLocaleString()} accounts
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={accountDirectory.data.page <= 1}
                className="border-white/12 text-xs text-[#d9d8e1] hover:bg-white/10"
                onClick={() => setAccountPage((page) => Math.max(1, page - 1))}
              >
                Previous
              </Button>
              <span className="min-w-20 text-center font-mono text-[10px] text-[#aeb0bd]">
                Page {accountDirectory.data.page} / {accountDirectory.data.pageCount}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={accountDirectory.data.page >= accountDirectory.data.pageCount}
                className="border-white/12 text-xs text-[#d9d8e1] hover:bg-white/10"
                onClick={() =>
                  setAccountPage((page) => Math.min(accountDirectory.data?.pageCount ?? page, page + 1))
                }
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
