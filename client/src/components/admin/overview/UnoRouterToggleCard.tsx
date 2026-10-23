import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Sparkles, Eye, EyeOff, Loader2 } from "lucide-react";

export function UnoRouterToggleCard() {
  const utils = trpc.useUtils();
  const query = trpc.admin.unorouterBadge.useQuery(undefined, {
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

  const mutation = trpc.admin.setUnoRouterBadge.useMutation({
    onSuccess: (data) => {
      setEnabled(data.enabled);
      utils.admin.unorouterBadge.setData(undefined, { enabled: data.enabled });
      utils.public.unorouterBadge.setData(undefined, { enabled: data.enabled });
      toast.success(
        data.enabled
          ? "UnoRouter card is now VISIBLE on the landing page."
          : "UnoRouter card is now HIDDEN from the landing page.",
        {
          description: data.enabled
            ? "The 'Powered by UnoRouter.com' badge is rendered below the interactive terminal."
            : "The badge has been removed from the landing page for all visitors.",
          duration: 5000,
        }
      );
    },
    onError: (err) => {
      // Revert optimistic state on failure
      setEnabled(query.data?.enabled ?? true);
      toast.error("Failed to update UnoRouter badge visibility", {
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
        borderColor: enabled ? "rgba(255, 42, 12, 0.35)" : "oklch(0.26 0 0)",
        boxShadow: enabled
          ? "0 10px 40px rgba(255, 42, 12, 0.08), inset 0 1px 0 rgba(255,255,255,0.06)"
          : "0 10px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
      className="relative overflow-hidden rounded-2xl sm:rounded-3xl border p-4 sm:p-6 transition-all duration-300"
    >
      {/* Subtle ambient brand glow */}
      {enabled && (
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#ff2a0c]/15 blur-3xl transition-opacity duration-500" />
      )}

      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Left: Branding & Info */}
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="relative shrink-0">
            <div
              className={`absolute -inset-1 rounded-xl bg-[#ff2a0c]/30 blur-sm transition-opacity ${
                enabled ? "opacity-100" : "opacity-0"
              }`}
            />
            <img
              src="/unorouter/unorouter-apple-icon.png"
              alt="UnoRouter"
              className={`relative h-11 w-11 sm:h-12 sm:w-12 rounded-xl border object-contain p-1 bg-[#1f2022] transition-all ${
                enabled ? "border-[#ff2a0c]/40 brightness-100" : "border-white/10 opacity-50 grayscale"
              }`}
            />
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
                Landing Page Partner Card
              </span>
              <span className="text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/10 text-zinc-300">
                Default: ON
              </span>
            </div>

            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2 mt-0.5">
              <span>UnoRouter Infrastructure Badge</span>
              {enabled ? (
                <Eye size={14} className="text-emerald-400 shrink-0" />
              ) : (
                <EyeOff size={14} className="text-zinc-500 shrink-0" />
              )}
            </h3>

            <p className="text-xs text-zinc-400 mt-1 max-w-xl leading-relaxed">
              Controls the visibility of the <strong className="text-zinc-200">"Powered by UnoRouter.com"</strong> card
              located directly below the terminal simulator on the public landing page.
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
              aria-label="Toggle UnoRouter badge on landing page"
              className="h-6 w-11 data-[state=checked]:bg-[#ff2a0c] data-[state=unchecked]:bg-zinc-800 border-white/20 cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
