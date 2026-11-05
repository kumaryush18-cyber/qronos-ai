import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  ShieldAlert,
  ShieldCheck,
  Plus,
  Trash2,
  Key,
  RefreshCw,
  Cpu,
  Layers,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Lock,
  Eye,
  Copy,
  Check,
  Clock,
  AlertTriangle,
  Flame,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";

interface SafetyAuditRecord {
  id: number;
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
  model: string;
  triggerType: string;
  matchedKeywords: string | null;
  userInput: string;
  outputShown: string;
  ipAddress: string | null;
  createdAt: string;
}

export function AdminJailbreakSection() {
  const utils = trpc.useUtils();
  const configQuery = trpc.admin.getJailbreakShieldConfig.useQuery(undefined, {
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const safetyLogsQuery = trpc.admin.safetyAudit.useQuery(
    { limit: 20, offset: 0 },
    { refetchInterval: 10_000, refetchIntervalInBackground: false }
  );

  const [jailbreakDetectionEnabled, setJailbreakDetectionEnabled] = useState(true);
  const [scanMode, setScanMode] = useState<"hybrid_windowed" | "full_sliding_window" | "structural_only">("hybrid_windowed");
  const [strictness, setStrictness] = useState<"high" | "medium" | "low">("high");
  const [contentSafetyEnabled, setContentSafetyEnabled] = useState(true);
  const [apiKeys, setApiKeys] = useState<string[]>([]);
  const [apiKeyEnabled, setApiKeyEnabled] = useState<boolean[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const [selectedRecord, setSelectedRecord] = useState<SafetyAuditRecord | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (configQuery.data) {
      const jbEnabled = (configQuery.data as any)?.jailbreakDetectionEnabled ?? configQuery.data.enabled ?? true;
      setJailbreakDetectionEnabled(jbEnabled);
      setScanMode(configQuery.data.scanMode ?? "hybrid_windowed");
      setStrictness(configQuery.data.strictness ?? "high");
      setContentSafetyEnabled(configQuery.data.contentSafetyEnabled ?? true);
      setApiKeys(configQuery.data.maskedKeys ?? configQuery.data.apiKeys ?? []);
      setApiKeyEnabled(configQuery.data.apiKeyEnabled ?? configQuery.data.apiKeys?.map(() => true) ?? []);
      setIsDirty(false);
    }
  }, [configQuery.data]);

  const updateMutation = trpc.admin.updateJailbreakShieldConfig.useMutation({
    onSuccess: (data) => {
      toast.success("Jailbreak Shield configuration saved successfully!");
      setApiKeys(data.maskedKeys);
      setApiKeyEnabled(data.apiKeyEnabled ?? data.apiKeys.map(() => true));
      setIsDirty(false);
      void utils.admin.getJailbreakShieldConfig.invalidate();
    },
    onError: (err) => {
      toast.error(`Failed to save configuration: ${err.message}`);
    },
  });

  const clearMutation = trpc.admin.clearSafetyAuditLogs.useMutation({
    onSuccess: () => {
      toast.success("All safety audit and jailbreak logs have been permanently deleted.");
      void safetyLogsQuery.refetch();
      void utils.admin.safetyAudit.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to clear logs");
    },
  });

  const handleAddKey = () => {
    setApiKeys([...apiKeys, ""]);
    setApiKeyEnabled([...apiKeyEnabled, true]);
    setIsDirty(true);
  };

  const handleKeyChange = (index: number, value: string) => {
    const updated = [...apiKeys];
    updated[index] = value;
    setApiKeys(updated);
    setIsDirty(true);
  };

  const handleToggleKey = (index: number) => {
    const updated = [...apiKeyEnabled];
    updated[index] = !updated[index];
    setApiKeyEnabled(updated);
    setIsDirty(true);
  };

  const handleRemoveKey = (index: number) => {
    const updatedKeys = apiKeys.filter((_, i) => i !== index);
    const updatedEnabled = apiKeyEnabled.filter((_, i) => i !== index);
    setApiKeys(updatedKeys);
    setApiKeyEnabled(updatedEnabled);
    setIsDirty(true);
  };

  const handleSave = () => {
    updateMutation.mutate({
      enabled: jailbreakDetectionEnabled,
      jailbreakDetectionEnabled,
      contentSafetyEnabled,
      scanMode,
      strictness,
      apiKeys: apiKeys.filter((k) => k.trim().length > 0),
      apiKeyEnabled,
    });
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const activeKeyCount = apiKeys.filter((_, i) => apiKeyEnabled[i] !== false).length;
  const recentLogs: SafetyAuditRecord[] = (safetyLogsQuery.data?.logs ?? []) as SafetyAuditRecord[];

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-emerald-400" />
              Jailbreak & Prompt Shield
            </h2>
            <Badge variant="outline" className="font-mono text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
              NeMoGuard + Nemotron 8B Active
            </Badge>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            NVIDIA NeMoGuard multi-key rotation pool, Nemotron 8B content safety guard, and real-time prompt interception.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={updateMutation.isPending || (!isDirty && !configQuery.isLoading)}
            className="bg-emerald-500 hover:bg-emerald-600 text-black font-semibold font-mono text-xs shadow-lg shadow-emerald-500/20"
          >
            {updateMutation.isPending ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
            )}
            Save Configuration
          </Button>
        </div>
      </div>

      {/* Main Status & Quick Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Jailbreak Guard</span>
            <Switch
              checked={jailbreakDetectionEnabled}
              onCheckedChange={(val) => {
                setJailbreakDetectionEnabled(val);
                setIsDirty(true);
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${jailbreakDetectionEnabled ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`} />
            <span className="text-sm font-semibold text-white">
              {jailbreakDetectionEnabled ? "NeMoGuard Jailbreak ON" : "Jailbreak Guard Paused"}
            </span>
          </div>
          <p className="text-[11px] text-zinc-500">
            Detects and blocks system prompt overrides, persona hijacking, and instruction extractions via NeMoGuard and structural shields.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Content Moderation</span>
            <Switch
              checked={contentSafetyEnabled}
              onCheckedChange={(val) => {
                setContentSafetyEnabled(val);
                setIsDirty(true);
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Flame className={`w-4 h-4 ${contentSafetyEnabled ? "text-rose-400" : "text-zinc-500"}`} />
            <span className="text-sm font-semibold text-white">
              {contentSafetyEnabled ? "Nemotron 8B Safety ON" : "Content Safety Paused"}
            </span>
          </div>
          <p className="text-[11px] text-zinc-500">
            Blocks Sexual/NSFW content, Violence, Weapons, Hate speech, and Malware violations using NVIDIA Nemotron 8B.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm space-y-3">
          <span className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Active Key Pool</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-white">{activeKeyCount}</span>
            <span className="text-xs text-zinc-400">/ {apiKeys.length} keys active</span>
          </div>
          <p className="text-[11px] text-zinc-500">
            Requests cycle round-robin across active slots with automated 429 rate limit failover.
          </p>
        </div>
      </div>

      {/* Scanning Methodology Settings */}
      <div className="p-5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm space-y-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          Payload Scanning & Context Windowing Methodology
        </h3>
        <p className="text-xs text-zinc-400">
          How NeMoGuard processes large inputs (such as 1 lakh token coding chats) within its model context limit:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          <div
            onClick={() => {
              setScanMode("hybrid_windowed");
              setIsDirty(true);
            }}
            className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
              scanMode === "hybrid_windowed"
                ? "border-emerald-500/60 bg-emerald-500/[0.06] text-white"
                : "border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold">Hybrid Anchored (Recommended)</span>
              {scanMode === "hybrid_windowed" && <Badge className="text-[9px] bg-emerald-500 text-black">Active</Badge>}
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Extracts Head (first 1,000 chars) + Tail (last 1,000 chars) and slices 512-token windows around suspicious trigger keywords. Fast and cost-effective.
            </p>
          </div>

          <div
            onClick={() => {
              setScanMode("full_sliding_window");
              setIsDirty(true);
            }}
            className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
              scanMode === "full_sliding_window"
                ? "border-indigo-500/60 bg-indigo-500/[0.06] text-white"
                : "border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold">Full Sliding Window</span>
              {scanMode === "full_sliding_window" && <Badge className="text-[9px] bg-indigo-500 text-white">Active</Badge>}
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Sequentially slices non-code prompt text into 1,500-character windows with 300-char overlap. Comprehensive coverage for dense text payloads.
            </p>
          </div>

          <div
            onClick={() => {
              setScanMode("structural_only");
              setIsDirty(true);
            }}
            className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
              scanMode === "structural_only"
                ? "border-amber-500/60 bg-amber-500/[0.06] text-white"
                : "border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold">Structural Only ($0 Cost)</span>
              {scanMode === "structural_only" && <Badge className="text-[9px] bg-amber-500 text-black">Active</Badge>}
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Disables external NeMoGuard API calls entirely. Uses only local regular expressions and syntactic intent heuristics with zero latency.
            </p>
          </div>
        </div>
      </div>

      {/* API Key Pool Management */}
      <div className="p-5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-emerald-400" />
              NVIDIA NeMoGuard API Key Pool (Round-Robin)
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Obtain free API keys with 1,000 credits each from{" "}
              <a
                href="https://build.nvidia.com"
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 hover:underline inline-flex items-center gap-1 font-mono text-[11px]"
              >
                build.nvidia.com <ExternalLink className="w-3 h-3" />
              </a>
              . Add multiple keys to distribute requests and bypass the 40 RPM limit.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleAddKey}
            className="border-zinc-700 hover:bg-zinc-800 text-xs font-mono text-white"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Key Slot
          </Button>
        </div>

        {apiKeys.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-zinc-800 rounded-lg">
            <Lock className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-xs text-zinc-400">No external NeMoGuard API keys configured.</p>
            <p className="text-[11px] text-zinc-500 mt-1">
              Qronos AI is currently running on the local deterministic structural shield.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={handleAddKey}
              className="mt-3 border-zinc-700 text-xs text-emerald-400 hover:text-emerald-300"
            >
              Add First Key
            </Button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {apiKeys.map((keyVal, idx) => {
              const isEnabled = apiKeyEnabled[idx] !== false;
              return (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-zinc-800 bg-zinc-950/60"
                >
                  <Badge variant="outline" className="font-mono text-xs text-zinc-400 border-zinc-800 min-w-[50px] justify-center">
                    Slot #{idx + 1}
                  </Badge>
                  <div className="flex-1">
                    <Input
                      type="text"
                      placeholder="nvapi-..."
                      value={keyVal}
                      onChange={(e) => handleKeyChange(idx, e.target.value)}
                      className="h-8 font-mono text-xs bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-zinc-400">
                      {isEnabled ? "Enabled" : "Disabled"}
                    </span>
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={() => handleToggleKey(idx)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveKey(idx)}
                      className="h-8 w-8 p-0 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Live Interception & Incident Feed */}
      <div className="p-5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              Live Blocked Jailbreak & Safety Incident Stream
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Real-time audit log of prompts intercepted and neutralized by NeMoGuard, Nemotron 8B, and the structural shield.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void safetyLogsQuery.refetch()}
              disabled={safetyLogsQuery.isFetching}
              className="border-zinc-700 hover:bg-zinc-800 text-xs font-mono text-white"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${safetyLogsQuery.isFetching ? "animate-spin" : ""}`} />
              Refresh Feed
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={clearMutation.isPending || recentLogs.length === 0}
                  className="border-rose-900/40 text-rose-400 hover:bg-rose-500/10 text-xs font-mono"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Clear All Logs
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-zinc-950 border-zinc-800 text-white">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-white flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    Permanently delete all safety logs?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-zinc-400 text-xs">
                    This action will permanently delete all safety audit records, prompt injection detections, and scrubbed upstream leaks from both the database and memory. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => clearMutation.mutate()}
                    className="bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                  >
                    Delete All Logs
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {recentLogs.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-zinc-800 rounded-lg">
            <CheckCircle2 className="w-7 h-7 text-emerald-400/60 mx-auto mb-1.5" />
            <p className="text-xs text-zinc-400">No safety incidents recorded yet.</p>
            <p className="text-[11px] text-zinc-500">Blocked jailbreaks and prompt injections will appear here live.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentLogs.slice(0, 8).map((log) => {
              const isContentViolation = log.triggerType.startsWith("content_violation");
              const isJailbreak = log.triggerType === "prompt_extraction" || log.triggerType.includes("jailbreak");

              return (
                <div
                  key={log.id}
                  className="p-3 rounded-lg border border-zinc-800/80 bg-zinc-950/60 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                        isContentViolation
                          ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                          : isJailbreak
                          ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                          : "bg-blue-500/15 text-blue-300 border-blue-500/30"
                      }`}>
                        {isContentViolation ? "Content Safety Violation" : isJailbreak ? "Jailbreak Blocked" : "Identity Probe"}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-emerald-400">
                        {log.userEmail || (log.userId ? `User #${log.userId}` : "Playground / Anonymous")}
                      </span>
                      <span className="font-mono text-zinc-400 text-[11px]">Model: {log.model}</span>
                      <span className="text-zinc-500 text-[10px] flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(log.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-zinc-300 font-mono text-[11px] truncate">
                      "{log.userInput}"
                    </p>
                    {log.matchedKeywords && (
                      <p className="text-[10px] text-rose-400">
                        Trigger: <span className="text-zinc-300">{log.matchedKeywords}</span>
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-center">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedRecord(log)}
                      className="h-7 px-2 text-xs text-emerald-400 hover:bg-emerald-500/10 font-mono"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      Inspect Payload
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Full Record Inspection Dialog */}
      <Dialog open={selectedRecord !== null} onOpenChange={(open) => !open && setSelectedRecord(null)}>
        <DialogContent className="max-w-2xl bg-zinc-950 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-white">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              Safety Incident #{selectedRecord?.id} Inspection
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400">
              Complete payload details and system persona delivered to the caller.
            </DialogDescription>
          </DialogHeader>

          {selectedRecord && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
                  <span className="text-zinc-500 block text-[10px]">USER / CALLER EMAIL</span>
                  <span className="font-mono text-emerald-400 font-semibold">{selectedRecord.userEmail || "Anonymous / Web Playground"}</span>
                </div>
                <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
                  <span className="text-zinc-500 block text-[10px]">TARGET MODEL</span>
                  <span className="font-mono text-white">{selectedRecord.model}</span>
                </div>
                <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800">
                  <span className="text-zinc-500 block text-[10px]">EVENT CLASSIFICATION</span>
                  <span className="font-mono text-amber-400">{selectedRecord.triggerType}</span>
                </div>
              </div>

              {/* Full User Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-rose-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Full Inbound User Payload (Blocked)
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(selectedRecord.userInput, "modal-input")}
                    className="h-6 px-1.5 text-[10px] text-zinc-400 hover:text-white"
                  >
                    {copiedId === "modal-input" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span className="ml-1">Copy</span>
                  </Button>
                </div>
                <pre className="p-3 rounded-lg bg-black border border-zinc-800 text-zinc-200 font-mono text-xs whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                  {selectedRecord.userInput}
                </pre>
              </div>

              {/* Output Shown */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Neutral Persona Delivered to User ($0 Spent)
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(selectedRecord.outputShown, "modal-output")}
                    className="h-6 px-1.5 text-[10px] text-zinc-400 hover:text-white"
                  >
                    {copiedId === "modal-output" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span className="ml-1">Copy</span>
                  </Button>
                </div>
                <pre className="p-3 rounded-lg bg-zinc-900/80 border border-zinc-800 text-emerald-300 font-mono text-xs whitespace-pre-wrap max-h-32 overflow-y-auto leading-relaxed">
                  {selectedRecord.outputShown}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
