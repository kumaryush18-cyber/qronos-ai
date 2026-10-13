import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Award, Check, Loader2, Sparkles, X, User } from "lucide-react";
import { toast } from "sonner";
import { UserTierBadge, USER_TIER_CONFIGS, UserTier } from "@/components/UserTierBadge";
import { SectionHeader } from "../common/AdminCommon";

const TIERS: UserTier[] = ["free", "starter", "pro", "ultra"];

export function UserTierAssignmentCard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingUserId, setPendingUserId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const searchResults = trpc.admin.searchUsersForTier.useQuery(
    { query: searchQuery.trim() },
    { staleTime: 5_000 }
  );

  const assignTierMutation = trpc.admin.assignUserTier.useMutation({
    onSuccess: (data) => {
      const config = USER_TIER_CONFIGS[data.tier as UserTier];
      toast.success(`Assigned ${config.label} to user #${data.userId}`);
      setPendingUserId(null);
      void utils.admin.searchUsersForTier.invalidate();
      void utils.admin.accounts.invalidate();
      void utils.admin.overview.invalidate();
    },
    onError: (error) => {
      setPendingUserId(null);
      toast.error(error.message || "Failed to assign user tier");
    },
  });

  const handleAssignTier = (userId: number, tier: UserTier) => {
    setPendingUserId(userId);
    assignTierMutation.mutate({ userId, tier });
  };

  const users = searchResults.data ?? [];

  return (
    <section
      style={{
        backgroundColor: "oklch(0.14 0 0)",
        borderColor: "oklch(0.26 0 0)",
      }}
      className="rounded-3xl border p-5 sm:p-6 shadow-xl"
    >
      <SectionHeader
        icon={<Award size={18} className="text-white" />}
        title="Assign User Plan Badge"
        detail="Search any developer by email or name to assign their plan badge (Free, Plus, Pro, Ultra)."
      />

      <div className="mt-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-3 text-zinc-500" size={16} />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search email (e.g. developer@gmail.com) or name..."
            className="h-11 border-white/10 bg-black/60 pl-10 pr-10 text-xs font-mono text-white placeholder:text-zinc-500 focus:border-white/30"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3.5 top-3 text-zinc-400 hover:text-white cursor-pointer"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="mt-4">
        {searchResults.isLoading ? (
          <div className="flex items-center justify-center py-8 text-white font-mono">
            <Loader2 className="animate-spin mr-2" size={18} />
            <span className="text-xs text-zinc-400">Searching accounts...</span>
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-2xl border border-white/6 bg-black/30 p-6 text-center">
            <User className="mx-auto text-zinc-600 mb-2" size={24} />
            <p className="text-xs font-medium text-zinc-300">
              {searchQuery.trim()
                ? `No accounts found matching "${searchQuery}".`
                : "Type an email or name above to find any user and assign their plan badge."}
            </p>
            <p className="text-[11px] text-zinc-500 mt-1 font-mono">
              All accounts default to Free Plan until upgraded or assigned.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 font-mono">
              Found {users.length} {users.length === 1 ? "developer" : "developers"}:
            </p>
            {users.map((user) => {
              const currentTier = (user.tier as UserTier) || "free";
              const isUpdating = assignTierMutation.isPending && pendingUserId === user.id;

              return (
                <div
                  key={user.id}
                  style={{
                    backgroundColor: "oklch(0.18 0 0)",
                    borderColor: "oklch(0.26 0 0)",
                  }}
                  className="rounded-2xl border p-4 sm:p-5 transition-colors hover:border-white/20"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.06]">
                    <div className="min-w-0 flex items-center gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.08] font-bold text-sm text-white font-mono border border-white/10">
                        {user.name?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || "U"}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-white truncate">
                            {user.name || "Qronos Developer"}
                          </p>
                          <span className="text-[11px] font-mono text-zinc-500">#{user.id}</span>
                        </div>
                        <p className="text-xs text-zinc-400 truncate font-mono">{user.email || "No email"}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] uppercase font-semibold tracking-wider text-zinc-400 font-mono">
                        Current Plan:
                      </span>
                      <UserTierBadge tier={currentTier} showTag size="sm" />
                    </div>
                  </div>

                  <div className="mt-3">
                    <p className="text-[11px] font-medium text-zinc-400 mb-2 flex items-center gap-1.5 font-mono">
                      <Sparkles size={12} className="text-white" />
                      Assign Plan:
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                      {TIERS.map((tierKey) => {
                        const config = USER_TIER_CONFIGS[tierKey];
                        const isSelected = currentTier === tierKey;
                        const TierIcon = config.icon;

                        return (
                          <button
                            key={tierKey}
                            type="button"
                            disabled={isUpdating}
                            onClick={() => handleAssignTier(user.id, tierKey)}
                            className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all cursor-pointer ${
                              isSelected
                                ? "bg-white text-black border-white shadow-md ring-1 ring-white/50"
                                : "border-white/10 bg-black/40 hover:border-white/25 hover:bg-white/[0.04] text-zinc-300"
                            } ${isUpdating ? "opacity-60 cursor-not-allowed" : ""}`}
                          >
                            <div className="flex items-center gap-1 mb-1">
                              <TierIcon size={13} className={isSelected ? "text-black" : "text-zinc-400"} />
                              <span className={`text-xs font-bold ${isSelected ? "text-black" : "text-white"}`}>
                                {config.label.replace(" Plan", "")}
                              </span>
                            </div>
                            <span className="text-[9px] uppercase tracking-wider font-mono opacity-80">
                              {isSelected ? (
                                <span className="font-bold flex items-center gap-0.5 text-black">
                                  <Check size={10} /> Active
                                </span>
                              ) : (
                                config.tag
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
