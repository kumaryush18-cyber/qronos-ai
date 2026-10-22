import React, { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  AlertTriangle,
  Calendar,
  Check,
  Clock,
  Code2,
  Coins,
  Infinity as InfinityIcon,
  KeyRound,
  Loader2,
  Plus,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

export type NewApiKeyResult = {
  key: string;
  record: {
    id: number;
    label: string;
    prefix: string;
    keyGroup?: "payg" | "bundle" | "token_plan" | "tokens" | "coding_plan";
    status: "active" | "revoked";
    expiresAt?: Date | string | null;
    spendLimitTokens?: number | null;
    spendLimitNanos?: number | null;
    createdAt: Date;
  };
};

export interface CreateApiKeyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialKeyGroup?: "token_plan" | "payg";
  activeCount?: number;
  onSuccess: (value: NewApiKeyResult) => void;
}

export function CreateApiKeyModal({
  open,
  onOpenChange,
  initialKeyGroup = "token_plan",
  activeCount = 0,
  onSuccess,
}: CreateApiKeyModalProps) {
  const [label, setLabel] = useState("");
  const [keyGroup, setKeyGroup] = useState<"token_plan" | "payg">(initialKeyGroup);

  // Amount limit state
  const [isUnlimitedAmount, setIsUnlimitedAmount] = useState(true);
  const [customTokensMillion, setCustomTokensMillion] = useState("10");
  const [customPaygUsd, setCustomPaygUsd] = useState("5.00");

  // Expiry date state
  const [isNeverExpires, setIsNeverExpires] = useState(true);

  // Default expiry date 30 days in future if user toggles custom date
  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const [expiryDate, setExpiryDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });

  const isLimitReached = activeCount >= 10;

  const create = trpc.developer.createApiKey.useMutation({
    onSuccess: (value) => {
      onSuccess(value as unknown as NewApiKeyResult);
      onOpenChange(false);
      setLabel("");
      setIsUnlimitedAmount(true);
      setIsNeverExpires(true);
      const typeLabel = keyGroup === "token_plan" ? "Token Plan" : "PAYG";
      toast.success(`New ${typeLabel} API key generated`);
    },
    onError: (error) => toast.error(error.message),
  });

  const applyPresetDays = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setExpiryDate(d.toISOString().slice(0, 10));
    setIsNeverExpires(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanLabel = label.trim();
    if (!cleanLabel) {
      toast.error("Please enter a descriptive key name/label.");
      return;
    }
    if (isLimitReached) {
      toast.error("Maximum limit of 10 active API keys reached. Delete an existing key first.");
      return;
    }

    // Expiry date
    let expiresAtIso: string | null = null;
    if (!isNeverExpires && expiryDate) {
      const exp = new Date(expiryDate);
      exp.setHours(23, 59, 59, 999);
      if (exp.getTime() <= Date.now()) {
        toast.error("Expiry date must be in the future.");
        return;
      }
      expiresAtIso = exp.toISOString();
    }

    // Amount limits
    let spendLimitTokens: number | null = null;
    let spendLimitNanos: number | null = null;

    if (!isUnlimitedAmount) {
      if (keyGroup === "token_plan") {
        const valM = parseFloat(customTokensMillion);
        if (Number.isFinite(valM) && valM > 0) {
          spendLimitTokens = Math.round(valM * 1_000_000);
        }
      } else {
        const valUsd = parseFloat(customPaygUsd);
        if (Number.isFinite(valUsd) && valUsd > 0) {
          spendLimitNanos = Math.round(valUsd * 1_000_000_000);
        }
      }
    }

    create.mutate({
      label: cleanLabel,
      keyGroup,
      expiresAt: expiresAtIso,
      spendLimitTokens,
      spendLimitNanos,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border border-white/12 bg-[#090a10]/98 p-0 text-white w-[calc(100vw-24px)] sm:w-[calc(100vw-48px)] max-w-lg rounded-2xl sm:rounded-3xl overflow-hidden shadow-[0_25px_80px_rgba(0,0,0,0.95)] backdrop-blur-2xl max-h-[min(92vh,720px)] flex flex-col focus:outline-none">
        <form onSubmit={handleSubmit} className="relative p-4.5 sm:p-6 md:p-7 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {/* Ambient Lighting Depth Glow */}
          <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-white/[0.04] blur-3xl" />
          <div className="pointer-events-none absolute -left-20 -bottom-20 h-56 w-56 rounded-full bg-emerald-500/[0.04] blur-3xl" />

          {/* Header */}
          <div className="relative z-10 flex items-center justify-between pb-4 border-b border-white/[0.08]">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.08] border border-white/15 text-white shadow-lg">
                <KeyRound size={17} />
              </div>
              <div>
                <DialogTitle className="text-sm font-extrabold text-white tracking-tight">
                  Generate API Key
                </DialogTitle>
                <DialogDescription className="text-[11px] text-zinc-400 font-mono">
                  Configure spend controls, quota type &amp; expiration
                </DialogDescription>
              </div>
            </div>
            <Badge
              className={
                isLimitReached
                  ? "border border-amber-500/40 bg-amber-500/15 text-amber-300 font-mono text-[9px]"
                  : "border border-white/10 bg-white/[0.06] text-zinc-300 font-mono text-[9px]"
              }
            >
              {activeCount} / 10 Active
            </Badge>
          </div>

          {isLimitReached && (
            <div className="relative z-10 mt-3 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 font-mono">
              <AlertTriangle size={15} className="shrink-0 text-amber-400" />
              <span>Limit of 10 active keys reached. Revoke an existing key before creating another.</span>
            </div>
          )}

          {/* Plan Selector: Token Plan vs PAYG */}
          <div className="relative z-10 mt-4">
            <Label className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-300 block mb-2">
              1. Key Quota Routing Plan
            </Label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setKeyGroup("token_plan")}
                className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all cursor-pointer relative overflow-hidden ${
                  keyGroup === "token_plan"
                    ? "bg-white/[0.09] border-white/40 ring-1 ring-white/20 shadow-md"
                    : "bg-black/40 border-white/10 hover:border-white/20"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5 font-mono">
                    <Code2 size={13} className="text-emerald-400" />
                    <span>Token Plan</span>
                  </span>
                  {keyGroup === "token_plan" && <Check size={12} className="text-emerald-400 stroke-[3]" />}
                </div>
                <p className="mt-1 text-[10px] text-zinc-400 leading-tight">
                  Claude Opus, GLM-5.3 &amp; DeepSeek quota.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setKeyGroup("payg")}
                className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all cursor-pointer relative overflow-hidden ${
                  keyGroup === "payg"
                    ? "bg-white/[0.09] border-white/40 ring-1 ring-white/20 shadow-md"
                    : "bg-black/40 border-white/10 hover:border-white/20"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5 font-mono">
                    <Zap size={13} className="text-amber-400" />
                    <span>PAYG Key</span>
                  </span>
                  {keyGroup === "payg" && <Check size={12} className="text-amber-400 stroke-[3]" />}
                </div>
                <p className="mt-1 text-[10px] text-zinc-400 leading-tight">
                  Direct nanodollar wallet settlement.
                </p>
              </button>
            </div>
          </div>

          {/* Key Name / Label */}
          <div className="relative z-10 mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <Label htmlFor="modal-key-label" className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-300">
                2. Key Name / Description
              </Label>
              <span className="text-[10px] font-mono text-zinc-500">{label.length}/100</span>
            </div>
            <Input
              id="modal-key-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. cursor-ide-production, claude-code-cli, agent-v2"
              maxLength={100}
              autoFocus
              className="h-10 border-white/10 bg-black/60 text-white placeholder:text-zinc-500 font-mono text-xs focus:border-white/30"
            />
          </div>

          {/* Amount / Spend Limit */}
          <div className="relative z-10 mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-300">
                3. Amount / Quota Limit
              </Label>
              <span className="text-[10px] font-mono text-zinc-500">
                {isUnlimitedAmount ? "Full Account Quota" : "Restricted Ceiling"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2.5">
              <button
                type="button"
                onClick={() => setIsUnlimitedAmount(true)}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-mono font-bold cursor-pointer transition-all ${
                  isUnlimitedAmount
                    ? "bg-white/[0.1] border-white/40 text-white ring-1 ring-white/20"
                    : "bg-black/30 border-white/10 text-zinc-400 hover:text-white"
                }`}
              >
                <InfinityIcon size={14} className="text-emerald-400" />
                <span>Unlimited (Default)</span>
              </button>

              <button
                type="button"
                onClick={() => setIsUnlimitedAmount(false)}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-mono font-bold cursor-pointer transition-all ${
                  !isUnlimitedAmount
                    ? "bg-white/[0.1] border-white/40 text-white ring-1 ring-white/20"
                    : "bg-black/30 border-white/10 text-zinc-400 hover:text-white"
                }`}
              >
                <Coins size={13} className="text-amber-400" />
                <span>Set Custom Limit</span>
              </button>
            </div>

            {!isUnlimitedAmount && (
              <div className="p-3 rounded-xl border border-white/10 bg-black/50 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-zinc-300">
                  <span>{keyGroup === "token_plan" ? "Max Tokens (Millions):" : "Max Dollar Spend ($ USD):"}</span>
                  <span className="text-emerald-400 font-bold">
                    {keyGroup === "token_plan"
                      ? `${customTokensMillion}M Tokens`
                      : `$${parseFloat(customPaygUsd || "0").toFixed(2)}`}
                  </span>
                </div>
                <div className="relative">
                  <Input
                    type="number"
                    step={keyGroup === "token_plan" ? "1" : "0.50"}
                    min={keyGroup === "token_plan" ? "1" : "0.50"}
                    value={keyGroup === "token_plan" ? customTokensMillion : customPaygUsd}
                    onChange={(e) => {
                      if (keyGroup === "token_plan") setCustomTokensMillion(e.target.value);
                      else setCustomPaygUsd(e.target.value);
                    }}
                    className="h-9 border-white/10 bg-black/70 text-white font-mono text-xs pr-12 focus:border-white/30"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-zinc-400 pointer-events-none">
                    {keyGroup === "token_plan" ? "M Tokens" : "USD"}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Expiration Date with Calendar */}
          <div className="relative z-10 mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-300">
                4. Expiration Date
              </Label>
              <span className="text-[10px] font-mono text-zinc-500">
                {isNeverExpires ? "Permanent" : "Auto-Delete on Expiry"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2.5">
              <button
                type="button"
                onClick={() => setIsNeverExpires(true)}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-mono font-bold cursor-pointer transition-all ${
                  isNeverExpires
                    ? "bg-white/[0.1] border-white/40 text-white ring-1 ring-white/20"
                    : "bg-black/30 border-white/10 text-zinc-400 hover:text-white"
                }`}
              >
                <ShieldCheck size={14} className="text-emerald-400" />
                <span>Never Expires (Default)</span>
              </button>

              <button
                type="button"
                onClick={() => setIsNeverExpires(false)}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-mono font-bold cursor-pointer transition-all ${
                  !isNeverExpires
                    ? "bg-white/[0.1] border-white/40 text-white ring-1 ring-white/20"
                    : "bg-black/30 border-white/10 text-zinc-400 hover:text-white"
                }`}
              >
                <Calendar size={13} className="text-sky-400" />
                <span>Set Expiry Date</span>
              </button>
            </div>

            {!isNeverExpires && (
              <div className="p-3 rounded-xl border border-white/10 bg-black/50 space-y-2.5">
                {/* Calendar Input */}
                <div className="relative">
                  <Input
                    type="date"
                    min={tomorrowStr}
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="h-10 border-white/10 bg-black/70 text-white font-mono text-xs focus:border-white/30 cursor-pointer"
                  />
                </div>

                {/* Quick Preset Days */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-mono text-zinc-500 mr-1">Presets:</span>
                  {[
                    { label: "+7 Days", days: 7 },
                    { label: "+30 Days", days: 30 },
                    { label: "+90 Days", days: 90 },
                    { label: "+1 Year", days: 365 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyPresetDays(preset.days)}
                      className="px-2 py-0.5 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20 text-[10px] font-mono text-zinc-300 transition-colors cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <p className="text-[10.5px] font-mono text-amber-300/80 leading-relaxed pt-1 border-t border-white/5">
                  ⚠️ Note: When this key expires on {expiryDate}, it will be automatically deleted from the database.
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="relative z-10 mt-6 pt-4 border-t border-white/[0.08] flex items-center justify-end gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-10 px-4 border-white/10 text-xs font-mono text-zinc-400 hover:bg-white/5 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!label.trim() || create.isPending || isLimitReached}
              className="h-10 px-5 bg-white hover:bg-zinc-200 text-black font-mono font-bold text-xs shadow-lg cursor-pointer disabled:opacity-40"
            >
              {create.isPending ? (
                <>
                  <Loader2 className="animate-spin mr-1.5" size={14} /> Generating…
                </>
              ) : (
                <>
                  <Plus size={14} className="mr-1" /> Generate API Key
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateApiKeyModal;
