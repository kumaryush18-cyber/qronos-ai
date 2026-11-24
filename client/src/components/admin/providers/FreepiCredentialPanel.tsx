import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyRound, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { SectionHeader } from "../common/AdminCommon";
import { ageLabel, creditShare, creditTone, fmtCredits, refillLabel } from "./freepi-usage-format";
import { FreepiRoutingBlock } from "./FreepiRoutingBlock";

type UsageRow = {
  slot: number;
  ok: boolean;
  reason?: "revoked" | "unreachable" | "bad-shape";
  remaining: number | null;
  allowance: number | null;
  tier: string | null;
  lane: string | null;
  refillAt: string | null;
  promptTokensToday: number | null;
  completionTokensToday: number | null;
  checkedAt: string;
  cached: boolean;
};

const REASON_TEXT: Record<string, string> = {
  revoked: "That key is no longer accepted",
  unreachable: "Could not reach the service",
  "bad-shape": "The answer could not be read",
};

const BAR_TONE: Record<"good" | "low" | "empty", string> = {
  good: "bg-[#c9ff73]",
  low: "bg-[#ffcd82]",
  empty: "bg-[#ff6b6b]",
};

/** A thin bar: lime while healthy, pale orange when low, red when empty. */
function CreditBar({ share }: { share: number }) {
  const percent = Math.max(0, Math.min(100, Math.round(share * 100)));
  return (
    <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
      <div className={`h-full rounded-full ${BAR_TONE[creditTone(share)]}`} style={{ width: `${percent}%` }} />
    </div>
  );
}


/**
 * The shared key pool for the free models.
 *
 * Eight encrypted slots. You paste a key, the server checks it before saving,
 * and the panel keeps only the last six characters of a fingerprint so nothing
 * readable is ever on screen.
 *
 * Each slot also shows what is left today. That read is cached for half an hour,
 * because a daily allowance is not a live price; the small Refresh button beside
 * a slot asks for a live number for that slot only, and Refresh all does the lot.
 *
 * One key allows one live request at a time, so more slots simply let more people
 * wait less.
 */
export function FreepiCredentialPanel() {
  const utils = trpc.useUtils();
  const credentials = trpc.admin.freepiCredentials.useQuery(undefined, { refetchInterval: 20_000 });
  const usage = trpc.admin.freepiUsage.useQuery(undefined, { refetchOnWindowFocus: false });
  const slots = credentials.data?.slots ?? [];
  const poolSize = credentials.data?.poolSize ?? 8;
  const slotNumbers = Array.from({ length: poolSize }, (_, index) => index);
  const usageRows: UsageRow[] = (usage.data?.slots ?? []) as UsageRow[];

  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [labels, setLabels] = useState<Record<number, string>>({});
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState<number | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);

  const refresh = async () => {
    await Promise.all([
      utils.admin.freepiCredentials.invalidate(),
      utils.admin.freepiUsage.invalidate(),
      utils.admin.activity.invalidate(),
    ]);
  };

  const refreshOne = trpc.admin.refreshFreepiUsage.useMutation({
    onSuccess: async (result, variables) => {
      if (!result.ok && result.reason === "too-soon") {
        toast.message(`Slot ${variables.slot + 1} was just checked. Showing the same number.`);
      }
      setRefreshing(null);
      await utils.admin.freepiUsage.invalidate();
    },
    onError: (error) => {
      setRefreshing(null);
      toast.error(error.message);
    },
  });

  const refreshAll = trpc.admin.refreshAllFreepiUsage.useMutation({
    onSuccess: async () => {
      setRefreshingAll(false);
      await utils.admin.freepiUsage.invalidate();
      toast.success("Every slot checked just now");
    },
    onError: (error) => {
      setRefreshingAll(false);
      toast.error(error.message);
    },
  });

  const save = trpc.admin.saveFreepiCredential.useMutation({
    onSuccess: async (_result, variables) => {
      setDrafts((current) => ({ ...current, [variables.slot]: "" }));
      setLabels((current) => ({ ...current, [variables.slot]: "" }));
      setBusySlot(null);
      await refresh();
      toast.success(`Slot ${variables.slot + 1} saved and checked`);
    },
    onError: (error) => {
      setBusySlot(null);
      toast.error(error.message);
    },
  });

  const remove = trpc.admin.removeFreepiCredential.useMutation({
    onSuccess: async (_result, variables) => {
      setBusySlot(null);
      await refresh();
      toast.success(`Slot ${variables.slot + 1} is empty`);
    },
    onError: (error) => {
      setBusySlot(null);
      toast.error(error.message);
    },
  });

  const savedCount = slots.length;

  return (
    <section className="dashboard-card">
      <SectionHeader
        icon={<KeyRound size={17} />}
        title="Free model keys"
        detail="The four free models run on these keys. Each one is checked before it is saved, then encrypted at rest. The CLI of every signed-in user reads this pool, so nobody has to keep a key on their own machine. Credits below are cached for 30 minutes; Refresh asks for a live number."
      />

      <div className="mt-5 flex flex-wrap items-center gap-2 text-[10px] text-[#858697]">
        <Badge className="border-0 bg-white/6 text-[#c6c7d2]">
          {savedCount} of {poolSize} slots filled
        </Badge>
        <span>One live request per key. {Math.max(savedCount, 1)} key(s) means {Math.max(savedCount, 1)} request(s) at the same moment.</span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={refreshingAll || savedCount === 0}
          onClick={() => {
            setRefreshingAll(true);
            refreshAll.mutate();
          }}
          className="ml-auto h-7 text-[10px] text-[#b7b8c7] hover:bg-white/8 hover:text-white"
        >
          <RefreshCw size={12} className={refreshingAll ? "animate-spin" : undefined} />
          Refresh all
        </Button>
      </div>

      <div className="mt-5">
        <FreepiRoutingBlock />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {slotNumbers.map((slot) => {
          const saved = slots.find((item) => item.slot === slot);
          const draft = drafts[slot] ?? "";
          const label = labels[slot] ?? "";
          const pending = busySlot === slot;
          const row = usageRows.find((item) => item.slot === slot);
          const share = row && row.ok ? creditShare(row.remaining, row.allowance) : null;
          const refill = refillLabel(row?.refillAt ?? null);
          return (
            <div key={slot} className="rounded-xl border border-white/8 bg-black/15 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-white">Slot {slot + 1}</p>
                  <p className="mt-1 font-mono text-[10px] text-[#858697]">
                    {saved
                      ? `Stored · •••${saved.fingerprintSuffix}${saved.label ? ` · ${saved.label}` : ""}`
                      : "Empty"}
                  </p>
                </div>
                <Badge
                  className={`border-0 text-[10px] ${
                    saved && row?.ok
                      ? "bg-[#c9ff73]/10 text-[#c9ff73]"
                      : saved && row && !row.ok
                        ? "bg-[#ff6b6b]/10 text-[#ff9b9b]"
                        : saved
                          ? "bg-white/6 text-[#9fa0ad]"
                          : "bg-white/6 text-[#9fa0ad]"
                  }`}
                >
                  {saved && row?.ok ? "Ready" : saved && row && !row.ok ? "Check it" : saved ? "Ready" : "Empty"}
                </Badge>
              </div>

              {saved ? (
                <div className="mt-3 rounded-lg border border-white/6 bg-white/[.02] px-3 py-2">
                  {row ? (
                    row.ok ? (
                      <>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-mono text-[11px] text-white">
                            {fmtCredits(row.remaining)} / {fmtCredits(row.allowance)} credits left
                          </span>
                          <span className="text-[10px] text-[#858697]">
                            {share === null ? "" : `${Math.round(share * 100)}%`}
                          </span>
                        </div>
                        {share === null ? null : <CreditBar share={share} />}
                        <p className="mt-1.5 text-[10px] text-[#7f8190]">
                          {[row.tier, row.lane].filter(Boolean).join(" · ") || "no tier reported"}
                          {refill ? ` · refill ${refill}` : ""}
                        </p>
                        <p className="mt-0.5 text-[10px] text-[#7f8190]">
                          today in {fmtCredits(row.promptTokensToday)} · out {fmtCredits(row.completionTokensToday)}
                          {" · "}
                          {ageLabel(row.checkedAt, Date.now())}
                        </p>
                      </>
                    ) : (
                      <p className="text-[10px] text-[#ff9b9b]">
                        {REASON_TEXT[row.reason ?? ""] ?? "Could not read this key"} · {ageLabel(row.checkedAt, Date.now())}
                      </p>
                    )
                  ) : (
                    <p className="text-[10px] text-[#7f8190]">Credits not read yet.</p>
                  )}
                  <div className="mt-2 flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={refreshing === slot}
                      onClick={() => {
                        setRefreshing(slot);
                        refreshOne.mutate({ slot });
                      }}
                      className="h-6 px-2 text-[10px] text-[#b7b8c7] hover:bg-white/8 hover:text-white"
                    >
                      <RefreshCw size={11} className={refreshing === slot ? "animate-spin" : undefined} />
                      Refresh
                    </Button>
                  </div>
                </div>
              ) : null}

              <label
                className="mt-4 block text-[10px] font-bold uppercase tracking-[.12em] text-[#9b9ca9]"
                htmlFor={`freepi-token-${slot}`}
              >
                {saved ? "Replace this key" : "Add a key"}
              </label>
              <Input
                id={`freepi-token-${slot}`}
                value={draft}
                onChange={(event) => setDrafts((current) => ({ ...current, [slot]: event.target.value }))}
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                placeholder="Paste the key"
                className="mt-2 h-10 border-white/10 bg-black/20 font-mono text-xs text-white placeholder:text-[#696b78]"
                disabled={pending}
              />
              <Input
                value={label}
                onChange={(event) => setLabels((current) => ({ ...current, [slot]: event.target.value }))}
                autoComplete="off"
                placeholder="Label (optional), e.g. main"
                className="mt-2 h-9 border-white/10 bg-black/20 text-xs text-white placeholder:text-[#696b78]"
                disabled={pending}
              />
              <div className="mt-3 flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={pending || draft.trim().length < 20}
                  onClick={() => {
                    setBusySlot(slot);
                    save.mutate({
                      slot,
                      token: draft.trim(),
                      label: label.trim() || undefined,
                      replaced: Boolean(saved),
                    });
                  }}
                  className="bg-[#c9ff73] text-[#17210d] hover:bg-[#d8ff91]"
                >
                  {pending ? <Loader2 className="animate-spin" size={14} /> : null}
                  {saved ? "Check & replace" : "Check & save"}
                </Button>
                {saved ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      setBusySlot(slot);
                      remove.mutate({ slot });
                    }}
                    className="text-[#f2a6a6] hover:bg-[#f2a6a6]/10 hover:text-white"
                  >
                    <Trash2 size={14} />
                    Remove
                  </Button>
                ) : null}
              </div>
              <p className="mt-2 min-h-4 text-[10px] text-[#7f8190]">
                {draft.trim() ? "Ready to check. The value is never shown again." : "Nothing saved for this slot."}
              </p>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[10px] leading-5 text-[#858697]">
        Only a non-reversible fingerprint suffix is visible here. Keys are encrypted with the server secret, never
        written to logs or audit rows, and read by the CLI endpoint
        <span className="font-mono text-[#c6c7d2]"> /api/cli/freepi/tokens</span> for a signed-in user. Credits come from
        the service's own stats route; a number it does not report stays a dash.
      </p>
    </section>
  );
}
