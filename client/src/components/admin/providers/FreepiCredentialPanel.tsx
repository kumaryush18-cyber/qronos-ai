import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyRound, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { SectionHeader } from "../common/AdminCommon";

/**
 * The free-pi token pool.
 *
 * Eight encrypted slots. You paste a token, the server checks it with free-pi
 * before saving, and the panel keeps only the last six characters of a
 * fingerprint so nothing readable is ever on screen.
 *
 * A free-pi token is a secret with a hard rule from free-pi itself: one live
 * request at a time per token. More slots simply let more people wait less.
 */
export function FreepiCredentialPanel() {
  const utils = trpc.useUtils();
  const credentials = trpc.admin.freepiCredentials.useQuery(undefined, { refetchInterval: 20_000 });
  const slots = credentials.data?.slots ?? [];
  const poolSize = credentials.data?.poolSize ?? 8;
  const slotNumbers = Array.from({ length: poolSize }, (_, index) => index);

  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [labels, setLabels] = useState<Record<number, string>>({});
  const [busySlot, setBusySlot] = useState<number | null>(null);

  const refresh = async () => {
    await Promise.all([
      utils.admin.freepiCredentials.invalidate(),
      utils.admin.activity.invalidate(),
    ]);
  };

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
        title="free-pi token pool"
        detail="The four free models (Particle, DeepSeek V4.1 Flash, GLM 5.3 Flash, DeepSeek V4 Flash) run on these tokens. Each one is checked with free-pi before it is saved, then encrypted at rest. The CLI of every signed-in user reads this pool, so no one has to save a token on their own machine."
      />

      <div className="mt-5 flex flex-wrap items-center gap-2 text-[10px] text-[#858697]">
        <Badge className="border-0 bg-white/6 text-[#c6c7d2]">
          {savedCount} of {poolSize} slots filled
        </Badge>
        <span>One live request per token, as free-pi requires. {Math.max(savedCount, 1)} token(s) means {Math.max(savedCount, 1)} request(s) at the same moment.</span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {slotNumbers.map((slot) => {
          const saved = slots.find((item) => item.slot === slot);
          const draft = drafts[slot] ?? "";
          const label = labels[slot] ?? "";
          const pending = busySlot === slot;
          return (
            <div key={slot} className="rounded-xl border border-white/8 bg-black/15 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-white">free-pi slot {slot + 1}</p>
                  <p className="mt-1 font-mono text-[10px] text-[#858697]">
                    {saved
                      ? `Stored · •••${saved.fingerprintSuffix}${saved.label ? ` · ${saved.label}` : ""}`
                      : "Empty"}
                  </p>
                </div>
                <Badge
                  className={`border-0 text-[10px] ${
                    saved ? "bg-[#c9ff73]/10 text-[#c9ff73]" : "bg-white/6 text-[#9fa0ad]"
                  }`}
                >
                  {saved ? "Ready" : "Empty"}
                </Badge>
              </div>

              <label
                className="mt-4 block text-[10px] font-bold uppercase tracking-[.12em] text-[#9b9ca9]"
                htmlFor={`freepi-token-${slot}`}
              >
                {saved ? "Replace this token" : "Add a token"}
              </label>
              <Input
                id={`freepi-token-${slot}`}
                value={draft}
                onChange={(event) => setDrafts((current) => ({ ...current, [slot]: event.target.value }))}
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                placeholder="Paste the free-pi token"
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
        Only a non-reversible fingerprint suffix is visible here. Tokens are encrypted with the server secret, never
        written to logs or audit rows, and read by the CLI endpoint
        <span className="font-mono text-[#c6c7d2]"> /api/cli/freepi/tokens</span> for a signed-in user.
      </p>
    </section>
  );
}
