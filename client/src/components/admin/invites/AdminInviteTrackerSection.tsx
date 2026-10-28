import React, { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  UserPlus,
  Play,
  Square,
  RefreshCw,
  Trophy,
  Users,
  Clock,
  Calendar,
  ChevronDown,
  ChevronUp,
  Search,
  Trash2,
  Share2,
  Check,
  Award,
  Sparkles,
  ExternalLink,
  History,
  Eye,
  ArrowUpRight,
  ShieldCheck,
  AlertCircle,
  Copy,
  Download,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { StarBorderCard } from "@/components/StarBorderCard";
import { SectionHeader, Metric } from "../common/AdminCommon";
import {
  InviteTrackerSessionSummary,
  InviteTrackerLeaderboardEntry,
  InviteTrackerInvitedUser,
} from "../types";

export function AdminInviteTrackerSection() {
  const utils = trpc.useUtils();

  // Query state
  const { data, isLoading, isFetching, refetch } = trpc.admin.inviteTracker.useQuery(undefined, {
    refetchInterval: (query) => (query.state.data?.activeSession ? 6_000 : 30_000),
  });

  const activeSession = data?.activeSession ?? null;
  const history = data?.history ?? [];

  // Automated Milestone Campaign state
  const milestoneConfigQuery = trpc.admin.inviteMilestoneConfig.useQuery();
  const milestoneGrantsQuery = trpc.admin.inviteMilestoneGrantsOverview.useQuery();

  const [milestoneInvitesRequired, setMilestoneInvitesRequired] = useState(5);
  const [milestoneTokenGrantMillion, setMilestoneTokenGrantMillion] = useState(10);
  const [milestonePaygGrantDollars, setMilestonePaygGrantDollars] = useState(0);
  const [milestoneExpiryHours, setMilestoneExpiryHours] = useState(48);
  const [milestoneEnabled, setMilestoneEnabled] = useState(true);
  const [resetTimerOnSave, setResetTimerOnSave] = useState(true);
  const [showGrantsHistory, setShowGrantsHistory] = useState(false);

  useEffect(() => {
    if (milestoneConfigQuery.data) {
      setMilestoneInvitesRequired(milestoneConfigQuery.data.invitesRequired ?? 5);
      setMilestoneTokenGrantMillion(milestoneConfigQuery.data.tokenGrantMillion ?? 10);
      setMilestonePaygGrantDollars(milestoneConfigQuery.data.paygGrantDollars ?? 0);
      setMilestoneExpiryHours(milestoneConfigQuery.data.expiryHours ?? 48);
      setMilestoneEnabled(milestoneConfigQuery.data.enabled !== false);
    }
  }, [milestoneConfigQuery.data]);

  const saveMilestoneMutation = trpc.admin.saveInviteMilestoneConfig.useMutation({
    onSuccess: () => {
      toast.success("Automated invite milestone campaign configuration saved!");
      utils.admin.inviteMilestoneConfig.invalidate();
      utils.admin.inviteMilestoneGrantsOverview.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to save milestone campaign");
    },
  });

  // Local form & control state
  const [newSessionName, setNewSessionName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedUsersByReferrer, setExpandedUsersByReferrer] = useState<Record<string, boolean>>({});
  const [expandedHistoryCards, setExpandedHistoryCards] = useState<Record<string, boolean>>({});
  const [isConfirmingStop, setIsConfirmingStop] = useState(false);
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);

  // Live timer for active session
  const [elapsedText, setElapsedText] = useState("00:00:00");

  useEffect(() => {
    if (!activeSession?.startedAt) {
      setElapsedText("00:00:00");
      return;
    }

    const updateTimer = () => {
      const startMs = new Date(activeSession.startedAt).getTime();
      const nowMs = Date.now();
      const diffSec = Math.max(0, Math.floor((nowMs - startMs) / 1000));

      const hrs = Math.floor(diffSec / 3600);
      const mins = Math.floor((diffSec % 3600) / 60);
      const secs = diffSec % 60;

      const pad = (n: number) => n.toString().padStart(2, "0");
      if (hrs > 0) {
        setElapsedText(`${pad(hrs)}:${pad(mins)}:${pad(secs)}`);
      } else {
        setElapsedText(`${pad(mins)}:${pad(secs)}`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeSession?.startedAt]);

  // Mutations
  const startMutation = trpc.admin.startInviteTracker.useMutation({
    onSuccess: (session) => {
      toast.success(`Started new tracking session: "${session.name}"!`);
      setNewSessionName("");
      setIsConfirmingStop(false);
      utils.admin.inviteTracker.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to start invite tracker session");
    },
  });

  const stopMutation = trpc.admin.stopInviteTracker.useMutation({
    onSuccess: (stoppedSession) => {
      toast.success(`Session "${stoppedSession.name}" stopped and archived to history!`);
      setIsConfirmingStop(false);
      // Automatically keep the newly stopped session collapsed or ready in history
      setExpandedHistoryCards((prev) => ({ ...prev, [stoppedSession.id]: true }));
      utils.admin.inviteTracker.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to stop invite tracker session");
    },
  });

  const deleteHistoryMutation = trpc.admin.deleteInviteTrackerHistory.useMutation({
    onSuccess: () => {
      toast.success("Tracking session deleted from history");
      utils.admin.inviteTracker.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to delete session from history");
    },
  });

  const clearAllHistoryMutation = trpc.admin.clearInviteTrackerHistory.useMutation({
    onSuccess: () => {
      toast.success("Invite history cleared");
      utils.admin.inviteTracker.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to clear history");
    },
  });

  const handleStart = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const defaultName = `Invite Sprint #${history.length + 1}`;
    startMutation.mutate({ name: newSessionName.trim() || defaultName });
  };

  const handleStop = () => {
    stopMutation.mutate();
  };

  const toggleReferrerUsers = (key: string) => {
    setExpandedUsersByReferrer((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleHistoryCard = (id: string) => {
    setExpandedHistoryCards((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copySessionSummary = async (session: InviteTrackerSessionSummary) => {
    const lines = [
      `📊 Qronos AI Invite Tracker — ${session.name}`,
      `⏱ Period: ${format(new Date(session.startedAt), "PPp")} ${session.endedAt ? `to ${format(new Date(session.endedAt), "PPp")}` : "(Live)"}`,
      `🎯 Total Invites: ${session.totalInvites} | Unique Inviters: ${session.uniqueInviters}`,
      "",
      "🏆 Leaderboard Rankings:",
      ...session.leaderboard.map(
        (l, i) => `${i + 1}. ${l.referrerEmail} — ${l.inviteCount} developer invite${l.inviteCount === 1 ? "" : "s"}`
      ),
    ];
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopiedSessionId(session.id);
    toast.success("Session summary copied to clipboard!");
    setTimeout(() => setCopiedSessionId(null), 2500);
  };

  const downloadSessionCsv = (session: InviteTrackerSessionSummary) => {
    const csvRows = [
      ["Rank", "Referrer Email", "Referrer Name", "Total Invites", "Invited Developer Email", "Invited Developer Name", "Joined Timestamp"],
    ];

    session.leaderboard.forEach((entry, idx) => {
      if (entry.invitedUsers.length === 0) {
        csvRows.push([
          (idx + 1).toString(),
          entry.referrerEmail,
          entry.referrerName,
          entry.inviteCount.toString(),
          "",
          "",
          "",
        ]);
      } else {
        entry.invitedUsers.forEach((user) => {
          csvRows.push([
            (idx + 1).toString(),
            entry.referrerEmail,
            entry.referrerName,
            entry.inviteCount.toString(),
            user.email,
            user.name,
            user.joinedAt,
          ]);
        });
      }
    });

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.map((e) => e.map((val) => `"${val.replace(/"/g, '""')}"`).join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `qronos_invites_${session.id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV report downloaded!");
  };

  // Filtered leaderboard for active session
  const filteredActiveLeaderboard = useMemo(() => {
    if (!activeSession) return [];
    if (!searchQuery.trim()) return activeSession.leaderboard;
    const q = searchQuery.toLowerCase();
    return activeSession.leaderboard.filter(
      (entry) =>
        entry.referrerEmail.toLowerCase().includes(q) ||
        entry.referrerName.toLowerCase().includes(q) ||
        entry.invitedUsers.some((u) => u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q))
    );
  }, [activeSession, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Top Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <UserPlus size={19} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
                Live Invite Tracker
                {activeSession && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 animate-pulse">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                    ACTIVE
                  </span>
                )}
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                Monitor real-time user invitations, track referral contest rankings, and preserve audit histories.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 font-mono text-xs gap-1.5"
          >
            <RefreshCw size={13} className={isFetching ? "animate-spin text-emerald-400" : ""} />
            {isFetching ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* 1. AUTOMATED INVITE MILESTONE CAMPAIGN CARD (EXPIRING PACKS) */}
      <div
        style={{
          backgroundColor: "oklch(0.14 0 0)",
          borderColor: milestoneEnabled ? "oklch(0.28 0.05 145)" : "oklch(0.24 0 0)",
          boxShadow: "0 20px 50px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
        className="rounded-3xl border p-6 sm:p-7 space-y-6 relative overflow-hidden"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 font-mono flex items-center gap-1.5">
                <Sparkles size={13} />
                <span>Automated Milestone Engine</span>
              </span>
              <Badge
                className={`font-mono text-[10px] ${
                  milestoneEnabled
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                }`}
              >
                {milestoneEnabled ? "● Campaign Active" : "Paused"}
              </Badge>
              {milestoneConfigQuery.data?.campaignStartedAt && (
                <span className="text-[11px] font-mono text-zinc-400">
                  Tracking since {format(new Date(milestoneConfigQuery.data.campaignStartedAt), "MMM d, h:mm a")}
                </span>
              )}
            </div>

            <h2 className="text-lg sm:text-xl font-bold font-mono text-white tracking-tight">
              Milestone Reward Packs & Expiring Grants
            </h2>
            <p className="text-xs text-zinc-400 max-w-3xl leading-relaxed font-mono">
              Configure automated reward grants. When any developer reaches the required invite milestone, the system
              instantly deposits an expiring token pack. Expired unspent tokens are automatically drained by the backend.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowGrantsHistory(!showGrantsHistory)}
              className="h-8 border-white/10 bg-white/[0.04] text-xs font-mono text-zinc-300"
            >
              <History size={13} className="mr-1.5" />
              {showGrantsHistory ? "Hide Grants" : `View Grants (${milestoneGrantsQuery.data?.length ?? 0})`}
            </Button>
          </div>
        </div>

        {/* 4 Configuration Inputs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Invites Required */}
          <div className="rounded-2xl border border-white/10 bg-black/60 p-4 space-y-1.5">
            <label className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Users size={12} className="text-emerald-400" />
              <span>Invites Required</span>
            </label>
            <Input
              type="number"
              min={1}
              max={100}
              value={milestoneInvitesRequired}
              onChange={(e) => setMilestoneInvitesRequired(Math.max(1, parseInt(e.target.value) || 1))}
              className="h-10 bg-black/80 font-mono text-base font-bold text-white border-white/10 focus:border-emerald-500"
              placeholder="5"
            />
            <p className="text-[10px] font-mono text-zinc-500">e.g. 5 invites per pack</p>
          </div>

          {/* 2. Token Grant (M Tokens) */}
          <div className="rounded-2xl border border-white/10 bg-black/60 p-4 space-y-1.5">
            <label className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Zap size={12} className="text-emerald-400" />
              <span>Token Grant (M)</span>
            </label>
            <Input
              type="number"
              min={0}
              max={1000}
              value={milestoneTokenGrantMillion}
              onChange={(e) => setMilestoneTokenGrantMillion(Math.max(0, parseInt(e.target.value) || 0))}
              className="h-10 bg-black/80 font-mono text-base font-bold text-white border-white/10 focus:border-emerald-500"
              placeholder="10"
            />
            <p className="text-[10px] font-mono text-zinc-500">
              = {(milestoneTokenGrantMillion * 1_000_000).toLocaleString()} Coding Tokens
            </p>
          </div>

          {/* 3. PAYG Grant ($ USD) */}
          <div className="rounded-2xl border border-white/10 bg-black/60 p-4 space-y-1.5">
            <label className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <span>PAYG Grant ($ USD)</span>
            </label>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={milestonePaygGrantDollars}
              onChange={(e) => setMilestonePaygGrantDollars(Math.max(0, parseFloat(e.target.value) || 0))}
              className="h-10 bg-black/80 font-mono text-base font-bold text-white border-white/10 focus:border-emerald-500"
              placeholder="0.00"
            />
            <p className="text-[10px] font-mono text-zinc-500">Optional dollar grant (or 0)</p>
          </div>

          {/* 4. Expiration Window (Hours) */}
          <div className="rounded-2xl border border-white/10 bg-black/60 p-4 space-y-1.5">
            <label className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Clock size={12} className="text-emerald-400" />
              <span>Expiry Window (Hours)</span>
            </label>
            <Input
              type="number"
              min={1}
              max={720}
              value={milestoneExpiryHours}
              onChange={(e) => setMilestoneExpiryHours(Math.max(1, parseInt(e.target.value) || 1))}
              className="h-10 bg-black/80 font-mono text-base font-bold text-white border-white/10 focus:border-emerald-500"
              placeholder="48"
            />
            <p className="text-[10px] font-mono text-zinc-500">e.g. 48 hours from unlock</p>
          </div>
        </div>

        {/* Controls Row: Status Toggle, Reset Checkbox & Save Button */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-white/[0.08]">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 text-xs font-mono">
            <label className="flex items-center gap-2 cursor-pointer text-zinc-300">
              <input
                type="checkbox"
                checked={milestoneEnabled}
                onChange={(e) => setMilestoneEnabled(e.target.checked)}
                className="rounded border-white/20 bg-black text-emerald-500 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
              />
              <span>Campaign Active</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-zinc-400">
              <input
                type="checkbox"
                checked={resetTimerOnSave}
                onChange={(e) => setResetTimerOnSave(e.target.checked)}
                className="rounded border-white/20 bg-black text-emerald-500 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
              />
              <span>Start tracking from save time (reset baseline)</span>
            </label>
          </div>

          <Button
            type="button"
            disabled={saveMilestoneMutation.isPending}
            onClick={() =>
              saveMilestoneMutation.mutate({
                enabled: milestoneEnabled,
                invitesRequired: milestoneInvitesRequired,
                tokenGrantMillion: milestoneTokenGrantMillion,
                paygGrantDollars: milestonePaygGrantDollars,
                expiryHours: milestoneExpiryHours,
                resetCampaignTimer: resetTimerOnSave,
              })
            }
            className="bg-emerald-500 hover:bg-emerald-600 text-black font-mono font-bold text-xs h-9 px-6 cursor-pointer shadow-lg shadow-emerald-950/40"
          >
            {saveMilestoneMutation.isPending ? "Saving Campaign..." : "Save Milestone Campaign"}
          </Button>
        </div>

        {/* Active Rule Explanation Box */}
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 text-xs font-mono space-y-1">
          <p className="text-emerald-300 font-bold flex items-center gap-1.5">
            <Sparkles size={13} className="text-emerald-400" />
            Active Automation Rule:
          </p>
          <p className="text-zinc-400 leading-relaxed">
            Every <strong className="text-white">{milestoneInvitesRequired} developers</strong> who join unlocks an
            automatic <strong className="text-white">+{milestoneTokenGrantMillion}M Coding Tokens pack</strong>{" "}
            {milestonePaygGrantDollars > 0 && `(+$${milestonePaygGrantDollars.toFixed(2)} PAYG)`} valid for{" "}
            <strong className="text-white">{milestoneExpiryHours} hours</strong>. If user invites{" "}
            {milestoneInvitesRequired * 2} developers, Pack #2 unlocks below Pack #1 with its own independent{" "}
            {milestoneExpiryHours}h down-counter. Expired tokens are automatically reclaimed.
          </p>
        </div>

        {/* Expandable Grants Table */}
        {showGrantsHistory && (
          <div className="rounded-2xl border border-white/10 bg-black/60 p-4 space-y-3">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-300">
              Recent Milestone Grants ({milestoneGrantsQuery.data?.length ?? 0})
            </h3>
            {milestoneGrantsQuery.data?.length === 0 ? (
              <p className="text-xs font-mono text-zinc-500">No milestone grants awarded yet in this campaign.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-white/10 text-[10px] text-zinc-500 uppercase">
                      <th className="pb-2">User</th>
                      <th className="pb-2">Pack #</th>
                      <th className="pb-2">Invites</th>
                      <th className="pb-2">Grant (M)</th>
                      <th className="pb-2">Remaining</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">Expires</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {milestoneGrantsQuery.data?.map((g) => (
                      <tr key={g.id}>
                        <td className="py-2 text-white">{g.userEmail || `User #${g.userId}`}</td>
                        <td className="py-2 text-emerald-400 font-bold">#{g.milestoneCycle}</td>
                        <td className="py-2 text-zinc-400">{g.invitesCountAtGrant}</td>
                        <td className="py-2 text-white">{(Number(g.grantedTokens) / 1_000_000).toFixed(0)}M</td>
                        <td className="py-2 text-zinc-300">{(Number(g.remainingTokens) / 1_000_000).toFixed(2)}M</td>
                        <td className="py-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] ${
                              g.status === "active"
                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                : g.status === "consumed"
                                ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                                : "bg-zinc-800 text-zinc-400"
                            }`}
                          >
                            {g.status}
                          </span>
                        </td>
                        <td className="py-2 text-zinc-500">{format(new Date(g.expiresAt), "MMM d, h:mm a")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ACTIVE TRACKING CARD (When running) */}
      {activeSession ? (
        <StarBorderCard lightWidth={220} duration={6} className="rounded-3xl border border-emerald-500/30 overflow-hidden shadow-2xl shadow-emerald-950/30">
          <div className="p-5 sm:p-7 bg-[#0b0d11]/95 rounded-[23px] space-y-6">
            {/* Header row with status & live timer */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-white/10">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-400">
                    Live Tracking In Progress
                  </span>
                  <span className="text-zinc-600">•</span>
                  <span className="text-xs font-mono text-zinc-400">
                    Started {format(new Date(activeSession.startedAt), "MMM d, h:mm a")} ({formatDistanceToNow(new Date(activeSession.startedAt), { addSuffix: true })})
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold font-mono text-white tracking-tight">
                  {activeSession.name}
                </h2>
              </div>

              {/* Stop & Timer Control */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06]">
                  <Clock size={14} className="text-emerald-400" />
                  <span className="text-xs font-mono font-bold text-emerald-300">
                    {elapsedText}
                  </span>
                </div>

                {isConfirmingStop ? (
                  <div className="flex items-center gap-2 animate-in fade-in zoom-in-95 duration-150">
                    <span className="text-xs font-medium text-amber-300">Stop & archive now?</span>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={stopMutation.isPending}
                      onClick={handleStop}
                      className="h-9 px-3 bg-red-600 hover:bg-red-700 text-white font-mono font-bold text-xs gap-1.5 shadow-lg shadow-red-900/30"
                    >
                      <Square size={13} className="fill-current" />
                      {stopMutation.isPending ? "Stopping..." : "Confirm Stop"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setIsConfirmingStop(false)}
                      className="h-9 px-2.5 text-zinc-400 hover:text-white text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsConfirmingStop(true)}
                    className="h-9 border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 hover:text-red-200 font-mono font-bold text-xs gap-1.5 transition-all shadow-sm cursor-pointer"
                  >
                    <Square size={13} className="fill-current text-red-400" />
                    Stop Tracking
                  </Button>
                )}
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-bold">Total New Invites</span>
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <UserPlus size={16} />
                  </div>
                </div>
                <p className="mt-2 text-2xl sm:text-3xl font-bold font-mono text-white">
                  {activeSession.totalInvites.toLocaleString()}
                </p>
                <p className="mt-1 text-[11px] text-zinc-400">
                  Accounts created via referral since session start
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-bold">Active Referrers</span>
                  <div className="p-1.5 rounded-lg bg-white/10 text-zinc-300">
                    <Users size={16} />
                  </div>
                </div>
                <p className="mt-2 text-2xl sm:text-3xl font-bold font-mono text-white">
                  {activeSession.uniqueInviters.toLocaleString()}
                </p>
                <p className="mt-1 text-[11px] text-zinc-400">
                  Unique developers who referred at least 1 account
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-amber-400 font-bold">Top Referrer</span>
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                    <Trophy size={16} />
                  </div>
                </div>
                <p className="mt-2 text-sm sm:text-base font-bold font-mono text-white truncate" title={activeSession.leaderboard[0]?.referrerEmail || "None"}>
                  {activeSession.leaderboard[0]?.referrerEmail || "None yet"}
                </p>
                <p className="mt-1 text-[11px] text-amber-300/80 font-mono">
                  {activeSession.leaderboard[0] ? `${activeSession.leaderboard[0].inviteCount} invites so far` : "Waiting for first invite"}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400 font-bold">Session Duration</span>
                  <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400">
                    <Clock size={16} />
                  </div>
                </div>
                <p className="mt-2 text-2xl sm:text-3xl font-bold font-mono text-cyan-300">
                  {elapsedText}
                </p>
                <p className="mt-1 text-[11px] text-zinc-400">
                  Continuous live monitoring elapsed
                </p>
              </div>
            </div>

            {/* Live Leaderboard Area */}
            <div className="space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Trophy size={16} className="text-amber-400" />
                  <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-white">
                    Live Leaderboard Rankings ({activeSession.leaderboard.length})
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative w-full sm:w-64">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <Input
                      placeholder="Filter by email or name..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-8 pl-8 text-xs font-mono bg-black/40 border-white/10 text-white placeholder:text-zinc-600 rounded-xl"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copySessionSummary(activeSession)}
                    className="h-8 border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-mono text-zinc-300 gap-1.5 cursor-pointer"
                  >
                    {copiedSessionId === activeSession.id ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    Copy Summary
                  </Button>
                </div>
              </div>

              {/* Table / List */}
              {activeSession.leaderboard.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/30 p-8 text-center space-y-2.5">
                  <div className="grid h-12 w-12 mx-auto place-items-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <UserPlus size={22} className="animate-pulse" />
                  </div>
                  <p className="text-sm font-semibold text-white">Awaiting New Developer Invites</p>
                  <p className="text-xs text-zinc-400 max-w-md mx-auto">
                    Session initialized at zero. Share invitation links with users. Whenever a new developer joins using an affiliate code, their inviter will appear here automatically.
                  </p>
                </div>
              ) : filteredActiveLeaderboard.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-center text-xs text-zinc-400 font-mono">
                  No inviters matching &quot;{searchQuery}&quot; found in this session.
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-black/40 overflow-hidden divide-y divide-white/8">
                  {filteredActiveLeaderboard.map((entry, index) => {
                    const isTopThree = index < 3;
                    const rankBadgeColor =
                      index === 0
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                        : index === 1
                        ? "bg-zinc-300/20 text-zinc-200 border-zinc-400/30"
                        : index === 2
                        ? "bg-amber-700/20 text-amber-500 border-amber-700/30"
                        : "bg-white/5 text-zinc-400 border-white/10";

                    const isExpanded = !!expandedUsersByReferrer[`active_${entry.referrerUserId}`];
                    const percentage = activeSession.totalInvites > 0 ? Math.round((entry.inviteCount / activeSession.totalInvites) * 100) : 0;

                    return (
                      <div key={entry.referrerUserId} className="p-4 hover:bg-white/[0.02] transition-colors">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span
                              className={`h-7 w-7 rounded-lg grid place-items-center text-xs font-mono font-bold border shrink-0 ${rankBadgeColor}`}
                            >
                              {index + 1}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-bold text-white">
                                  {entry.referrerEmail}
                                </span>
                                {entry.referrerName && entry.referrerName !== entry.referrerEmail && (
                                  <span className="text-xs text-zinc-400">
                                    ({entry.referrerName})
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] font-mono text-zinc-500">
                                User ID: #{entry.referrerUserId}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            {/* Bar & Count */}
                            <div className="text-right">
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                <UserPlus size={12} />
                                {entry.inviteCount} {entry.inviteCount === 1 ? "Invite" : "Invites"}
                              </span>
                              <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                                {percentage}% of session total
                              </div>
                            </div>

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => toggleReferrerUsers(`active_${entry.referrerUserId}`)}
                              className="h-8 px-2.5 rounded-lg text-xs font-mono text-zinc-300 hover:text-white hover:bg-white/10 gap-1 cursor-pointer"
                            >
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              <span>{isExpanded ? "Hide" : "Details"}</span>
                            </Button>
                          </div>
                        </div>

                        {/* Collapsible invited users list */}
                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t border-white/5 space-y-2 bg-black/30 rounded-xl p-3">
                            <p className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
                              Invited Developers During This Session ({entry.invitedUsers.length}):
                            </p>
                            <div className="grid gap-1.5 sm:grid-cols-2">
                              {entry.invitedUsers.map((user) => (
                                <div
                                  key={user.userId + user.joinedAt}
                                  className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/5 text-xs font-mono"
                                >
                                  <span className="text-zinc-200 truncate" title={user.email}>
                                    {user.email}
                                  </span>
                                  <span className="text-[10px] text-zinc-500 shrink-0">
                                    {format(new Date(user.joinedAt), "MMM d, h:mm a")}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </StarBorderCard>
      ) : (
        /* IDLE MODE: Start New Session Card */
        <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-[#111318] to-[#0c0d12] p-6 sm:p-8 space-y-5 shadow-2xl">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
              <Play size={22} className="ml-0.5 fill-current" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Start a New Invite Tracking Session
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed max-w-2xl">
                Ready to track a new contest or sprint? Clicking <strong>Start</strong> will begin monitoring new user signups from this exact moment. All counters start fresh from zero. When you stop the session, it will automatically collapse into the history list below.
              </p>
            </div>
          </div>

          <form onSubmit={handleStart} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
            <Input
              placeholder={`Session title (e.g., Invite Sprint #${history.length + 1})`}
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              className="h-11 bg-black/40 border-white/15 text-white font-mono text-sm placeholder:text-zinc-600 rounded-xl max-w-md focus-visible:ring-emerald-500"
            />
            <Button
              type="submit"
              disabled={startMutation.isPending}
              className="h-11 px-6 bg-emerald-500 hover:bg-emerald-600 text-black font-mono font-bold text-xs gap-2 rounded-xl shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
            >
              <Play size={14} className="fill-current" />
              {startMutation.isPending ? "Starting..." : "Start Live Tracker"}
            </Button>
          </form>
        </div>
      )}

      {/* HISTORY OF PAST SESSIONS SECTION */}
      <div className="space-y-4 pt-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <History size={16} className="text-zinc-400" />
            <h2 className="text-sm font-bold font-mono uppercase tracking-wider text-zinc-300">
              History of Invite Sessions ({history.length})
            </h2>
          </div>

          {history.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (window.confirm("Are you sure you want to clear all archived session history? This cannot be undone.")) {
                  clearAllHistoryMutation.mutate();
                }
              }}
              disabled={clearAllHistoryMutation.isPending}
              className="h-7 px-2.5 text-[11px] font-mono text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
            >
              <Trash2 size={12} className="mr-1" />
              Clear All History
            </Button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/[0.015] p-8 text-center text-xs font-mono text-zinc-500">
            No completed invite sessions in history yet. When you stop an active tracking session, its finalized leaderboard will collapse and be preserved here.
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((session, sIdx) => {
              const isExpanded = !!expandedHistoryCards[session.id];
              const startDate = new Date(session.startedAt);
              const endDate = session.endedAt ? new Date(session.endedAt) : new Date();

              const diffMinutes = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60)));
              const durationLabel =
                diffMinutes >= 60
                  ? `${Math.floor(diffMinutes / 60)}h ${diffMinutes % 60}m`
                  : `${diffMinutes} mins`;

              const topInviter = session.leaderboard[0];

              return (
                <div
                  key={session.id}
                  className="rounded-2xl border border-white/10 bg-[#0c0d12]/90 overflow-hidden transition-all shadow-md"
                >
                  {/* Collapsed Header Bar */}
                  <div
                    onClick={() => toggleHistoryCard(session.id)}
                    className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <span className="h-2 w-2 rounded-full bg-zinc-500 shrink-0" />
                        <h3 className="text-base font-bold font-mono text-white">
                          {session.name}
                        </h3>
                        <Badge variant="outline" className="text-[10px] font-mono border-white/15 text-zinc-400">
                          Completed
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-zinc-400">
                        <span>{format(startDate, "MMM d, yyyy · h:mm a")}</span>
                        <span>→</span>
                        <span>{format(endDate, "h:mm a")}</span>
                        <span className="text-zinc-600">•</span>
                        <span className="text-zinc-400 font-semibold">{durationLabel} duration</span>
                      </div>
                    </div>

                    {/* Summary Badges & Controls */}
                    <div className="flex items-center gap-3 self-end md:self-center">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-xl text-xs font-mono font-bold bg-white/5 border border-white/10 text-white">
                          {session.totalInvites} {session.totalInvites === 1 ? "Invite" : "Invites"}
                        </span>
                        {topInviter && (
                          <span className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-mono bg-amber-500/10 border border-amber-500/20 text-amber-300">
                            <Trophy size={12} />
                            Top: {topInviter.referrerEmail} ({topInviter.inviteCount})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 border-l border-white/10 pl-3">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Copy session summary"
                          onClick={(e) => {
                            e.stopPropagation();
                            copySessionSummary(session);
                          }}
                          className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10"
                        >
                          {copiedSessionId === session.id ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Download CSV report"
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadSessionCsv(session);
                          }}
                          className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10"
                        >
                          <Download size={14} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Delete session"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Delete "${session.name}" from history?`)) {
                              deleteHistoryMutation.mutate({ id: session.id });
                            }
                          }}
                          className="h-8 w-8 text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 size={14} />
                        </Button>
                        <div className="p-1 text-zinc-400">
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Card Content: Historical Breakdown */}
                  {isExpanded && (
                    <div className="border-t border-white/10 p-5 bg-black/40 space-y-4">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-zinc-400 font-bold uppercase tracking-wider">
                          Historical Final Leaderboard ({session.leaderboard.length} referrers)
                        </span>
                        <span className="text-zinc-500">
                          Total Invites Credited: {session.totalInvites}
                        </span>
                      </div>

                      {session.leaderboard.length === 0 ? (
                        <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02] text-xs font-mono text-zinc-500 text-center">
                          Zero invites recorded during this session window.
                        </div>
                      ) : (
                        <div className="rounded-xl border border-white/10 overflow-hidden divide-y divide-white/5">
                          {session.leaderboard.map((entry, idx) => (
                            <div key={entry.referrerUserId} className="p-3.5 bg-black/20 hover:bg-white/[0.02] transition-colors">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="flex items-center gap-2.5">
                                  <span className="h-6 w-6 rounded-md grid place-items-center text-xs font-mono font-bold bg-white/5 border border-white/10 text-zinc-300">
                                    {idx + 1}
                                  </span>
                                  <div>
                                    <span className="font-mono text-xs font-bold text-white">
                                      {entry.referrerEmail}
                                    </span>
                                    {entry.referrerName && entry.referrerName !== entry.referrerEmail && (
                                      <span className="text-[11px] text-zinc-400 ml-1.5">
                                        ({entry.referrerName})
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-3">
                                  <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    {entry.inviteCount} {entry.inviteCount === 1 ? "Invite" : "Invites"}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => toggleReferrerUsers(`hist_${session.id}_${entry.referrerUserId}`)}
                                    className="h-7 px-2 text-[11px] font-mono text-zinc-400 hover:text-white"
                                  >
                                    {expandedUsersByReferrer[`hist_${session.id}_${entry.referrerUserId}`] ? "Hide Accounts" : `View Accounts (${entry.invitedUsers.length})`}
                                  </Button>
                                </div>
                              </div>

                              {expandedUsersByReferrer[`hist_${session.id}_${entry.referrerUserId}`] && (
                                <div className="mt-2.5 pt-2.5 border-t border-white/5 space-y-1">
                                  <div className="grid gap-1.5 sm:grid-cols-2">
                                    {entry.invitedUsers.map((user) => (
                                      <div
                                        key={user.userId + user.joinedAt}
                                        className="flex items-center justify-between gap-2 p-1.5 rounded-md bg-white/[0.03] text-[11px] font-mono"
                                      >
                                        <span className="text-zinc-300 truncate">{user.email}</span>
                                        <span className="text-[10px] text-zinc-500 shrink-0">
                                          {format(new Date(user.joinedAt), "MMM d, h:mm a")}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
