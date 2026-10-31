import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { RotateCcw, Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react";

export function RefundPolicyToggleCard() {
  const utils = trpc.useUtils();
  const query = trpc.admin.refundPolicyStatus.useQuery(undefined, {
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  const [enabled, setEnabled] = useState<boolean>(true);

  // Sync state when query loads
  useEffect(() => {
    if (query.data?.enabled !== undefined) {
      setEnabled(query.data.enabled);
    }
  }, [query.data?.enabled]);

  const mutation = trpc.admin.setRefundPolicyStatus.useMutation({
    onSuccess: (data) => {
      setEnabled(data.enabled);
      utils.admin.refundPolicyStatus.setData(undefined, { enabled: data.enabled });
      utils.public.refundPolicyStatus.setData(undefined, { enabled: data.enabled });
      toast.success(
        data.enabled
          ? "Refund Policy is now VISIBLE across the platform."
          : "Refund Policy is now HIDDEN from the entire platform.",
        {
          description: data.enabled
            ? "The Refund Policy content, navigation tabs, and footer links are active and accessible."
            : "All refund links, footer entries, sidebar tabs, and direct routes (/refund, /legal/refund) are hidden and blocked.",
          duration: 5000,
        }
      );
    },
    onError: (err) => {
      // Revert optimistic state on failure
      setEnabled(query.data?.enabled ?? true);
      toast.error("Failed to update Refund Policy visibility", {
        description: err.message,
      });
    },
  });

  const handleToggle = (checked: boolean) => {
    setEnabled(checked); // Optimistic UI
    mutation.mutate({ enabled: checked });
  };

  const isPending = mutation.isPending;

  return (
    <div
      style={{
        backgroundColor: "oklch(0.14 0 0)",
        borderColor: enabled ? "rgba(16, 185, 129, 0.35)" : "oklch(0.26 0 0)",
        boxShadow: enabled
          ? "0 10px 40px rgba(16, 185, 129, 0.08), inset 0 1px 0 rgba(255,255,255,0.06)"
          : "0 10px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
      className="relative overflow-hidden rounded-2xl sm:rounded-3xl border p-4 sm:p-6 transition-all duration-300"
    >
      {/* Subtle ambient brand glow */}
      {enabled && (
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/15 blur-3xl transition-opacity duration-500" />
      )}

      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Left: Branding & Info */}
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="relative shrink-0">
            <div
              className={`absolute -inset-1 rounded-xl bg-emerald-500/30 blur-sm transition-opacity ${
                enabled ? "opacity-100" : "opacity-0"
              }`}
            />
            <div
              className={`relative h-11 w-11 sm:h-12 sm:w-12 rounded-xl border flex items-center justify-center p-2.5 transition-all ${
                enabled
                  ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-400"
                  : "border-white/10 bg-[#1f2022] text-zinc-500 opacity-50 grayscale"
              }`}
            >
              <RotateCcw className="w-full h-full" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
                Platform Legal & Compliance
              </span>
              <span className="text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-zinc-300">
                Default: ON
              </span>
            </div>

            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2 mt-0.5">
              <span>Refund Policy Visibility</span>
              {enabled ? (
                <Eye size={14} className="text-emerald-400 shrink-0" />
              ) : (
                <EyeOff size={14} className="text-zinc-500 shrink-0" />
              )}
            </h3>

            <p className="text-xs text-zinc-400 mt-1 max-w-xl leading-relaxed">
              When toggled <strong className="text-zinc-200">OFF</strong>, the Refund Policy content completely vanishes:
              all footer links, sidebar navigation tabs, and direct URL routes (<code className="text-zinc-300">/refund</code>,{" "}
              <code className="text-zinc-300">/legal/refund</code>) are hidden and redirect away.
            </p>
          </div>
        </div>

        {/* Right: Status Pill & Toggle Switch */}
        <div className="flex items-center justify-between sm:justify-end gap-3.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/[0.08] shrink-0">
          {/* Status Badge */}
          {query.isLoading ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/10 text-zinc-400 font-mono text-xs">
              <Loader2 size={12} className="animate-spin" />
              Loading...
            </span>
          ) : enabled ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 font-mono text-xs font-bold shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              VISIBLE (ON)
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800/80 border border-white/10 text-zinc-400 font-mono text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-zinc-500" />
              HIDDEN (OFF)
            </span>
          )}

          {/* Toggle Switch */}
          <div className="flex items-center gap-2">
            <Switch
              checked={enabled}
              onCheckedChange={handleToggle}
              disabled={isPending || query.isLoading}
              aria-label="Toggle Refund Policy visibility across platform"
              className="h-6 w-11 data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-zinc-800 border-white/20 cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
