import React, { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

/**
 * Per-model identity watch list editor.
 *
 * Shown on every model's provider tab. A saved list replaces the universal
 * model/provider list for that model only; the list can never be emptied, so
 * every model keeps watching at least one name.
 */
export function IdentityWatchListCard({ modelId, displayName }: { modelId: string; displayName: string }) {
  const utils = trpc.useUtils();
  const watchQuery = trpc.admin.modelIdentityWatchTerms.useQuery(
    { modelId },
    { refetchInterval: 30_000, refetchIntervalInBackground: false }
  );

  const [terms, setTerms] = useState<string[]>([]);
  const [initializedFor, setInitializedFor] = useState<string | null>(null);
  const [newTerm, setNewTerm] = useState("");

  useEffect(() => {
    if (!watchQuery.data) return;
    if (initializedFor === modelId) return;
    setTerms(watchQuery.data.terms);
    setNewTerm("");
    setInitializedFor(modelId);
  }, [modelId, watchQuery.data, initializedFor]);

  const saveMutation = trpc.admin.updateModelIdentityWatchTerms.useMutation({
    onSuccess: async (data) => {
      setTerms(data.terms);
      setInitializedFor(modelId);
      await utils.admin.modelIdentityWatchTerms.invalidate({ modelId });
      toast.success(`Identity watch list for ${displayName} saved`);
    },
    onError: (error) => toast.error(error.message),
  });

  const savedTerms = watchQuery.data?.terms ?? [];
  const isDirty =
    terms.length !== savedTerms.length || terms.some((term, index) => term !== savedTerms[index]);

  const candidate = newTerm.trim();
  const isDuplicate = terms.some((term) => term.toLowerCase() === candidate.toLowerCase());

  const addTerm = () => {
    if (!candidate) return;
    if (isDuplicate) {
      toast.error(`"${candidate}" is already watched for ${displayName}`);
      return;
    }
    if (terms.length >= 100) {
      toast.error("An identity watch list can contain at most 100 names");
      return;
    }
    setTerms((current) => [...current, candidate]);
    setNewTerm("");
  };

  const removeTerm = (term: string) => {
    if (terms.length <= 1) {
      toast.error("Keep at least one watched name — an empty list is not supported");
      return;
    }
    setTerms((current) => current.filter((entry) => entry !== term));
  };

  return (
    <div className="dashboard-card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck size={16} className="text-[#c9ff73]" />
          <h3 className="text-sm font-semibold text-white">Identity Watch List</h3>
          <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-[#a8a9b8]">{modelId}</code>
          {watchQuery.data?.source === "custom" ? (
            <Badge className="border border-[#c9ff73]/30 bg-[#c9ff73]/15 text-[9px] text-[#c9ff73]">
              Custom List Active
            </Badge>
          ) : (
            <Badge className="border border-white/10 bg-white/5 text-[9px] text-[#8e90a2]">
              Standard List (Universal)
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={saveMutation.isPending || watchQuery.isLoading || !watchQuery.data}
            onClick={() => setTerms([...(watchQuery.data?.defaults ?? [])])}
            className="h-8 border-white/10 text-white hover:bg-white/8 text-xs"
            title="Replace the chips with the full standard watch list, then save"
          >
            Restore standard list
          </Button>
          <Button
            size="sm"
            disabled={!isDirty || saveMutation.isPending || terms.length === 0}
            onClick={() => saveMutation.mutate({ modelId, terms })}
            className="h-8 bg-[#c9ff73] text-[#17210d] hover:bg-[#d7ffa0] text-xs font-semibold"
          >
            {saveMutation.isPending ? "Saving…" : "Save list"}
          </Button>
        </div>
      </div>

      <p className="text-xs text-[#8e90a2]">
        Watched names are rewritten to <span className="text-white">{displayName}</span> in user prompts before they
        reach the provider and in model replies before the client sees them. When this list is saved, nothing outside it
        is checked for a model or brand name on {displayName}. Platform infrastructure names and creator claims stay
        masked for every model, and the Qronos AI response shape is unaffected.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {terms.map((term) => (
          <span
            key={term}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-[#dedfe7]"
          >
            <span className="font-mono">{term}</span>
            <button
              type="button"
              onClick={() => removeTerm(term)}
              disabled={terms.length <= 1}
              title={
                terms.length <= 1
                  ? "At least one watched name is required"
                  : `Remove ${term} from this model's watch list`
              }
              className="rounded p-0.5 text-[#8e90a2] transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {!terms.length && (
          <span className="text-xs text-[#8e90a2]">
            {watchQuery.isLoading ? "Loading watched names…" : "No names loaded for this model."}
          </span>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          addTerm();
        }}
        className="flex gap-2"
      >
        <Input
          value={newTerm}
          onChange={(event) => setNewTerm(event.target.value)}
          maxLength={60}
          placeholder="Add a name to watch (e.g. deepseek, квен, vendor-name)"
          className="h-8 text-xs bg-black/30 border-white/10 text-white placeholder:text-[#6d6e7f]"
        />
        <Button
          type="submit"
          size="sm"
          disabled={!candidate}
          className="h-8 shrink-0 bg-white/10 text-white hover:bg-white/20 text-xs px-3"
        >
          <Plus size={13} className="mr-1" /> Add
        </Button>
      </form>

      <p className="text-[10px] text-[#6d6e7f]">
        {terms.length} watched name{terms.length === 1 ? "" : "s"} · minimum 1 · saved lists apply immediately
      </p>
    </div>
  );
}
