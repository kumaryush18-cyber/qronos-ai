import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Radio,
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  AlertTriangle,
  Play,
  CheckCircle2,
  XCircle,
  Smartphone,
  Search,
  Filter,
  Layers,
  Clock,
  Zap,
  Flame,
  X,
  ArrowUpDown,
  Terminal,
  Code2,
} from "lucide-react";

export type LiveRequest = {
  requestId: string;
  userId: number;
  modelId: string;
  status: "success" | "rejected" | "provider_error" | "cancelled";
  source: "api" | "playground";
  /** qronos_change - code = Qronos Code extension, cli = Qronos CLI, api = anything else */
  client?: "code" | "cli" | "api";
  stream: boolean;
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
  latencyMs?: number;
  ttftMs?: number | null;
  durationMs?: number | null;
  stopReason?: string | null;
  outcome?: "success" | "truncated" | "client_disconnected" | "upstream_error" | "rejected";
  provider?: string;
  errorMessage?: string;
  rawErrorMessage?: string;
  userName?: string | null;
  createdAt: string;
  reasoningReturned?: boolean;
};

const OUTCOME_LABEL: Record<string, { text: string; cls: string; dot: string }> = {
  success: {
    text: "Success",
    cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25",
    dot: "#10b981",
  },
  truncated: {
    text: "Truncated",
    cls: "text-amber-300 bg-amber-500/10 border-amber-500/25",
    dot: "#f59e0b",
  },
  client_disconnected: {
    text: "Client Disconnected",
    cls: "text-rose-400 bg-rose-500/10 border-rose-500/25",
    dot: "#f43f5e",
  },
  upstream_error: {
    text: "Upstream Error",
    cls: "text-red-400 bg-red-500/10 border-red-500/25",
    dot: "#ef4444",
  },
  rejected: {
    text: "Rejected",
    cls: "text-orange-300 bg-orange-500/10 border-orange-500/25",
    dot: "#f97316",
  },
};

function resolveOutcome(row: LiveRequest): "success" | "truncated" | "client_disconnected" | "upstream_error" | "rejected" {
  if (row.outcome) return row.outcome;
  if (row.rawErrorMessage?.includes("[CLIENT_DISCONNECT]") || row.status === "cancelled") return "client_disconnected";
  if (row.stopReason === "max_tokens" || row.stopReason === "length") return "truncated";
  if (row.status === "rejected") return "rejected";
  if (row.status === "provider_error") return "upstream_error";
  return "success";
}

const MAX_ROWS = 300;

function playAlertChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.2);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(440, now + 0.12);
    gain2.gain.setValueAtTime(0.25, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.38);
  } catch {
    /* AudioContext may be restricted before user interaction */
  }
}

async function sendSystemNotification(req: LiveRequest) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const outcome = resolveOutcome(req);
  const userDisplay = req.userName ? `${req.userName} (User #${req.userId})` : `User #${req.userId}`;
  const providerDisplay = req.provider || "Default Provider";
  const errorDisplay = req.rawErrorMessage
    ? `\nDiagnostic: ${req.rawErrorMessage}`
    : req.errorMessage
    ? `\nError: ${req.errorMessage}`
    : "";

  const title = `🚨 Live Failure: ${req.modelId}`;
  const body = `User: ${userDisplay}\nModel: ${req.modelId}\nProvider: ${providerDisplay}\nOutcome: ${outcome}${errorDisplay}`;

  const notificationOptions = {
    body,
    icon: "/favicon/favicon-192x192.png",
    badge: "/favicon/favicon-32x32.png",
    vibrate: [300, 100, 300, 100, 300],
    tag: `live-fail-${req.requestId}`,
    renotify: true,
    requireInteraction: true,
    data: {
      url: "/admin?tab=live-requests",
      requestId: req.requestId,
    },
  };

  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && "showNotification" in reg) {
        await reg.showNotification(title, notificationOptions);
        return;
      }
    } catch {}

    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "SHOW_NOTIFICATION",
        title,
        options: notificationOptions,
      });
      return;
    }
  }

  try {
    const notif = new Notification(title, notificationOptions);
    notif.onclick = () => {
      window.focus();
      notif.close();
    };
  } catch {}
}

export default function LiveRequestLog() {
  const [rows, setRows] = useState<LiveRequest[]>([]);
  const [connected, setConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [sessionFailures, setSessionFailures] = useState(0);
  const [lastAlert, setLastAlert] = useState<{ title: string; detail: string; time: string } | null>(null);

  // Filters
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all"); // qronos_change - Code vs CLI
  const [nonSuccessOnly, setNonSuccessOnly] = useState<boolean>(false);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Notification & Audio states
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      return Notification.permission;
    }
    return "default";
  });

  const [desktopAlerts, setDesktopAlerts] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("qronos_live_req_notif") ?? localStorage.getItem("tokenforge_live_req_notif");
    return stored === "true";
  });

  const [soundAlerts, setSoundAlerts] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("qronos_live_req_sound") ?? localStorage.getItem("tokenforge_live_req_sound");
    return stored !== "false";
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const isSnapshotDoneRef = useRef(false);
  const desktopAlertsRef = useRef(desktopAlerts);
  const soundAlertsRef = useRef(soundAlerts);

  // Register Service Worker for Mobile & Desktop OS notifications
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
        console.warn("ServiceWorker registration notice:", err);
      });
    }
  }, []);

  useEffect(() => {
    desktopAlertsRef.current = desktopAlerts;
    localStorage.setItem("qronos_live_req_notif", desktopAlerts ? "true" : "false");
  }, [desktopAlerts]);

  useEffect(() => {
    soundAlertsRef.current = soundAlerts;
    localStorage.setItem("qronos_live_req_sound", soundAlerts ? "true" : "false");
  }, [soundAlerts]);

  const handleToggleDesktopAlerts = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      alert("System notifications are not supported by this browser.");
      return;
    }

    if (Notification.permission === "granted") {
      setDesktopAlerts(prev => !prev);
      return;
    }

    if (Notification.permission === "denied") {
      alert("Notifications are blocked in your browser settings. Please allow notifications for Qronos AI.");
      return;
    }

    try {
      const result = await Notification.requestPermission();
      setNotifPermission(result);
      if (result === "granted") {
        setDesktopAlerts(true);
      }
    } catch {}
  };

  const handleTestAlert = () => {
    const sampleReq: LiveRequest = {
      requestId: "test-alert-id",
      userId: 1,
      userName: "Administrator",
      modelId: "claude-opus-5.5",
      provider: "Direct High-Speed Slot",
      status: "provider_error",
      outcome: "upstream_error",
      source: "api",
      stream: true,
      inputTokens: 120,
      outputTokens: 0,
      errorMessage: "Diagnostic: Simulated test alert notification",
      createdAt: new Date().toISOString(),
    };

    if (soundAlerts) playAlertChime();
    if (desktopAlerts && Notification.permission === "granted") {
      sendSystemNotification(sampleReq);
    }
    setLastAlert({
      title: "Test System Alert Triggered",
      detail: `User: Administrator · Provider: Direct High-Speed Slot · Simulated 5xx`,
      time: new Date().toLocaleTimeString(),
    });
  };

  useEffect(() => {
    const source = new EventSource("/api/admin/live-requests");
    isSnapshotDoneRef.current = false;

    source.onopen = () => {
      setConnected(true);
      setRows([]);
      isSnapshotDoneRef.current = false;
    };

    source.onerror = () => {
      setConnected(false);
      isSnapshotDoneRef.current = false;
    };

    source.addEventListener("snapshot_done", () => {
      isSnapshotDoneRef.current = true;
    });

    source.addEventListener("request", event => {
      try {
        const row = JSON.parse(event.data) as LiveRequest;
        setRows(prev => [row, ...prev].slice(0, MAX_ROWS));

        const outcome = resolveOutcome(row);
        const isFailure = outcome === "upstream_error" || outcome === "rejected" || outcome === "client_disconnected" || row.status === "provider_error";

        if (isFailure) {
          setSessionFailures(n => n + 1);

          if (isSnapshotDoneRef.current) {
            if (soundAlertsRef.current) playAlertChime();
            if (desktopAlertsRef.current && Notification.permission === "granted") {
              sendSystemNotification(row);
            }
            setLastAlert({
              title: `Live Failure · ${row.modelId}`,
              detail: `User: ${row.userName ?? `User #${row.userId}`} · Provider: ${row.provider ?? "Default"} · ${outcome}`,
              time: new Date().toLocaleTimeString(),
            });
          }
        }
      } catch {}
    });

    return () => {
      source.close();
    };
  }, []);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [rows, autoScroll]);

  // Provider Metrics Breakdown
  const providerStats = useMemo(() => {
    const map = new Map<string, { total: number; success: number; truncated: number; failed: number; ttftSum: number; ttftCount: number }>();

    for (const r of rows) {
      const p = (r.provider || "Default").split("(")[0].trim();
      const current = map.get(p) || { total: 0, success: 0, truncated: 0, failed: 0, ttftSum: 0, ttftCount: 0 };
      current.total += 1;

      const outcome = resolveOutcome(r);
      if (outcome === "success") current.success += 1;
      else if (outcome === "truncated") current.truncated += 1;
      else current.failed += 1;

      if (r.ttftMs && r.ttftMs > 0) {
        current.ttftSum += r.ttftMs;
        current.ttftCount += 1;
      }

      map.set(p, current);
    }

    return Array.from(map.entries()).map(([name, data]) => ({
      name,
      total: data.total,
      success: data.success,
      truncated: data.truncated,
      failed: data.failed,
      successPct: Math.round((data.success / data.total) * 100),
      truncatedPct: Math.round((data.truncated / data.total) * 100),
      failedPct: Math.round((data.failed / data.total) * 100),
      avgTtftMs: data.ttftCount > 0 ? Math.round(data.ttftSum / data.ttftCount) : null,
    })).sort((a, b) => b.total - a.total);
  }, [rows]);

  const nonSuccessCount = useMemo(() => {
    return rows.filter(r => resolveOutcome(r) !== "success").length;
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      const outcome = resolveOutcome(row);
      const isSuccess = outcome === "success";

      if (nonSuccessOnly && isSuccess) return false;

      if (outcomeFilter !== "all") {
        if (outcomeFilter === "non_success" && isSuccess) return false;
        if (outcomeFilter !== "non_success" && outcome !== outcomeFilter) return false;
      }

      if (sourceFilter !== "all") {
        const src = row.source || "api";
        if (src !== sourceFilter) return false;
      }

      if (clientFilter !== "all") {
        const client = row.client || "api";
        if (client !== clientFilter) return false;
      }

      if (selectedProvider) {
        const p = (row.provider || "Default").split("(")[0].trim();
        if (p !== selectedProvider) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesModel = row.modelId.toLowerCase().includes(q);
        const matchesUser = (row.userName || "").toLowerCase().includes(q) || String(row.userId).includes(q);
        const matchesReq = row.requestId.toLowerCase().includes(q);
        const matchesErr = (row.rawErrorMessage || row.errorMessage || "").toLowerCase().includes(q);
        const matchesProvider = (row.provider || "").toLowerCase().includes(q);
        if (!matchesModel && !matchesUser && !matchesReq && !matchesErr && !matchesProvider) return false;
      }

      return true;
    });
  }, [rows, nonSuccessOnly, outcomeFilter, sourceFilter, clientFilter, selectedProvider, searchQuery]);

  return (
    <section
      style={{
        backgroundColor: "oklch(0.14 0 0)",
        borderColor: "oklch(0.26 0 0)",
        boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
      className="rounded-3xl border p-5 sm:p-7 shadow-2xl space-y-6"
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[.18em] font-mono text-zinc-400">Live request monitor</p>
            {sessionFailures > 0 && (
              <span className="flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-[10px] font-mono font-semibold text-red-300">
                <AlertTriangle size={11} /> {sessionFailures} {sessionFailures === 1 ? "failure" : "failures"} in session
              </span>
            )}
          </div>
          <h2 className="mt-1 text-xl font-extrabold text-white tracking-tight">Real-Time Telemetry & Provider Diagnostics</h2>
          <p className="mt-1 text-xs text-zinc-400">
            Real-time SSE token stream monitoring, client-disconnect cancellation, and per-provider latency percentiles.
          </p>
        </div>

        {/* Action Controls & Notification Settings */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Connection status */}
          <span className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-mono font-medium ${connected ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-red-500/25 bg-red-500/10 text-red-300"}`}>
            <Radio size={12} className={connected ? "animate-pulse text-emerald-400" : "text-red-400"} />
            <span>{connected ? "Connected" : "Reconnecting…"}</span>
          </span>

          {/* Mobile / Browser System Notification Toggle */}
          <button
            type="button"
            onClick={handleToggleDesktopAlerts}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-mono font-medium transition-colors cursor-pointer ${
              desktopAlerts && notifPermission === "granted"
                ? "border-white/30 bg-white text-black font-bold shadow-md"
                : "border-white/12 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
            }`}
          >
            {desktopAlerts && notifPermission === "granted" ? <Smartphone size={13} /> : <BellOff size={13} />}
            <span>{desktopAlerts && notifPermission === "granted" ? "Device: ON" : "Device: OFF"}</span>
          </button>

          {/* Sound alert toggle */}
          <button
            type="button"
            onClick={() => setSoundAlerts(v => !v)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-mono font-medium transition-colors cursor-pointer ${
              soundAlerts
                ? "border-white/30 bg-white text-black font-bold shadow-md"
                : "border-white/12 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
            }`}
          >
            {soundAlerts ? <Volume2 size={13} /> : <VolumeX size={13} />}
            <span>{soundAlerts ? "Sound: ON" : "Sound: OFF"}</span>
          </button>

          {/* Test Alert Button */}
          <button
            type="button"
            onClick={handleTestAlert}
            className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-mono font-bold text-white hover:bg-white/20 transition-colors cursor-pointer shadow-sm"
          >
            <Play size={11} className="fill-current text-white" /> Test Alert
          </button>

          {/* Auto scroll toggle */}
          <button
            type="button"
            onClick={() => setAutoScroll(value => !value)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-mono transition-colors cursor-pointer ${autoScroll ? "border-white/20 bg-white/10 text-white font-bold" : "border-white/10 text-zinc-500 hover:bg-white/5"}`}
          >
            {autoScroll ? "Auto-scroll: On" : "Auto-scroll: Off"}
          </button>
        </div>
      </div>

      {/* Latest Failure Toast Banner */}
      {lastAlert && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-950/30 px-3.5 py-2.5 text-[11px] text-red-200 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-300">
              <AlertTriangle size={13} />
            </span>
            <div>
              <p className="font-semibold text-red-200">{lastAlert.title}</p>
              <p className="text-[10px] text-red-300/80">{lastAlert.detail}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] text-red-300/60">{lastAlert.time}</span>
            <button
              type="button"
              onClick={() => setLastAlert(null)}
              className="rounded p-1 text-red-300/60 hover:bg-red-500/20 hover:text-red-200"
              aria-label="Dismiss alert"
            >
              <XCircle size={14} />
            </button>
          </div>
        </div>
      )}

      {/* =========================================================
          PER-PROVIDER PERFORMANCE CARDS (ANALYTICS BENTO)
      ========================================================= */}
      {providerStats.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
            <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px] text-white">
              <Layers size={13} className="text-[#c9ff73]" />
              <span>Provider Performance Breakdown ({providerStats.length} Active Upstreams)</span>
            </div>
            {selectedProvider && (
              <button
                type="button"
                onClick={() => setSelectedProvider(null)}
                className="flex items-center gap-1 text-[11px] text-emerald-400 hover:underline cursor-pointer"
              >
                <span>Filtered: {selectedProvider}</span>
                <X size={12} />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {providerStats.map((stat) => {
              const isSelected = selectedProvider === stat.name;
              return (
                <div
                  key={stat.name}
                  onClick={() => setSelectedProvider(isSelected ? null : stat.name)}
                  style={{
                    backgroundColor: isSelected ? "oklch(0.20 0 0)" : "oklch(0.16 0 0)",
                    borderColor: isSelected ? "#c9ff73" : "oklch(0.24 0 0)",
                  }}
                  className={`rounded-2xl border p-3.5 transition-all cursor-pointer hover:border-white/30 shadow-md ${
                    isSelected ? "ring-1 ring-[#c9ff73]/50" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-xs text-white truncate font-mono">{stat.name}</span>
                    <span className="font-mono text-[10px] text-zinc-400 bg-white/5 px-2 py-0.5 rounded-md">
                      {stat.total} reqs
                    </span>
                  </div>

                  {/* Multi-Segment Proportion Bar */}
                  <div className="mt-2.5 h-1.5 w-full rounded-full bg-white/10 overflow-hidden flex">
                    <div style={{ width: `${stat.successPct}%` }} className="bg-emerald-400 h-full" title={`Success: ${stat.successPct}%`} />
                    <div style={{ width: `${stat.truncatedPct}%` }} className="bg-amber-400 h-full" title={`Truncated: ${stat.truncatedPct}%`} />
                    <div style={{ width: `${stat.failedPct}%` }} className="bg-rose-500 h-full" title={`Failed: ${stat.failedPct}%`} />
                  </div>

                  <div className="mt-2.5 flex items-center justify-between text-[10px] font-mono">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400 font-bold">{stat.successPct}% ok</span>
                      {stat.failedPct > 0 && <span className="text-rose-400 font-bold">{stat.failedPct}% err</span>}
                      {stat.truncatedPct > 0 && <span className="text-amber-300 font-bold">{stat.truncatedPct}% tr</span>}
                    </div>
                    <div>
                      {stat.avgTtftMs !== null ? (
                        <span
                          className={`font-semibold ${
                            stat.avgTtftMs > 10000
                              ? "text-rose-400"
                              : stat.avgTtftMs > 3000
                              ? "text-amber-300"
                              : "text-zinc-400"
                          }`}
                          title={`Average TTFT: ${(stat.avgTtftMs / 1000).toFixed(2)}s (${stat.avgTtftMs}ms)`}
                        >
                          TTFT: {(stat.avgTtftMs / 1000).toFixed(2)}s
                        </span>
                      ) : (
                        <span className="text-zinc-600">TTFT: —</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =========================================================
          CONTROLS & COMPREHENSIVE FILTER BAR
      ========================================================= */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Quick "Non-Success Only" Toggle Button with Count Badge */}
          <button
            type="button"
            onClick={() => setNonSuccessOnly(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono transition-all cursor-pointer ${
              nonSuccessOnly
                ? "bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold shadow-sm"
                : "bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10"
            }`}
          >
            <AlertTriangle size={12} className={nonSuccessOnly ? "text-rose-400" : "text-zinc-500"} />
            <span>Non-Success Only</span>
            {nonSuccessCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                nonSuccessOnly ? "bg-rose-500 text-white" : "bg-white/10 text-zinc-300"
              }`}>
                {nonSuccessCount}
              </span>
            )}
          </button>

          {/* Outcome Category Select Dropdown */}
          <div className="relative">
            <select
              aria-label="Filter by outcome category"
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value)}
              className="h-8 pl-3 pr-7 rounded-xl border border-white/10 bg-black/60 text-xs font-mono text-zinc-300 focus:outline-none focus:border-white/30 cursor-pointer appearance-none"
            >
              <option value="all" className="bg-neutral-900 text-white">All Outcomes</option>
              <option value="non_success" className="bg-neutral-900 text-white">Non-Success (Any)</option>
              <option value="success" className="bg-neutral-900 text-white">Success Only</option>
              <option value="truncated" className="bg-neutral-900 text-white">Truncated (max_tokens)</option>
              <option value="client_disconnected" className="bg-neutral-900 text-white">Client Disconnected</option>
              <option value="upstream_error" className="bg-neutral-900 text-white">Upstream Error (5xx)</option>
              <option value="rejected" className="bg-neutral-900 text-white">Rejected (Preflight)</option>
            </select>
            <Filter size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          </div>

          {/* Source Filter Select Dropdown (API vs Playground) */}
          <div className="relative">
            <select
              aria-label="Filter by request source"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="h-8 pl-3 pr-7 rounded-xl border border-white/10 bg-black/60 text-xs font-mono text-zinc-300 focus:outline-none focus:border-white/30 cursor-pointer appearance-none"
            >
              <option value="all" className="bg-neutral-900 text-white">All Sources</option>
              <option value="api" className="bg-neutral-900 text-white">API Traffic Only</option>
              <option value="playground" className="bg-neutral-900 text-white">Playground Only</option>
            </select>
            <Filter size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          </div>

          {/* qronos_change - Client Filter (CLI vs VS Code extension vs SDK) */}
          <div className="relative">
            <select
              aria-label="Filter by client"
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="h-8 pl-3 pr-7 rounded-xl border border-white/10 bg-black/60 text-xs font-mono text-zinc-300 focus:outline-none focus:border-white/30 cursor-pointer appearance-none"
            >
              <option value="all" className="bg-neutral-900 text-white">All Clients</option>
              <option value="cli" className="bg-neutral-900 text-white">Qronos CLI Only</option>
              <option value="code" className="bg-neutral-900 text-white">Qronos Code Only</option>
              <option value="api" className="bg-neutral-900 text-white">API Only</option>
            </select>
            <Filter size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          </div>

          {/* Active Provider Filter Indicator */}
          {selectedProvider && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#c9ff73]/15 border border-[#c9ff73]/30 text-[#c9ff73] text-xs font-mono">
              <span>Provider: {selectedProvider}</span>
              <button
                type="button"
                onClick={() => setSelectedProvider(null)}
                className="hover:text-white cursor-pointer ml-1"
              >
                <X size={12} />
              </button>
            </div>
          )}
        </div>

        {/* Search input */}
        <div className="relative min-w-[240px] max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search model, user, request ID..."
            className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-white/10 bg-black/60 text-xs font-mono text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* =========================================================
          LIVE STREAM TABLE
      ========================================================= */}
      <div className="max-h-[34rem] overflow-y-auto overscroll-contain rounded-xl border border-white/8 bg-[#121413]/50" ref={scrollRef}>
        <table className="w-full min-w-[1050px] border-collapse text-left text-[11px]">
          <thead className="sticky top-0 z-10 bg-[#171a18] shadow-sm">
            <tr className="text-[9px] uppercase tracking-[.1em] text-[#858697]">
              <th className="px-3 py-2 w-6"></th>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2">Provider</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Outcome</th>
              <th className="px-3 py-2">Finish Reason</th>
              <th className="px-3 py-2 text-right">In / Out</th>
              <th className="px-3 py-2 text-right">TTFT</th>
              <th className="px-3 py-2 text-right">Duration</th>
              <th className="px-3 py-2 min-w-[16rem]">Diagnostic / Error</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-3 py-12 text-center text-[#858697]">
                  <div className="mx-auto flex w-max items-center gap-2 text-[12px]">
                    {rows.length === 0 ? (
                      <>
                        <Loader2 className="animate-spin text-[#c9ff73]" size={15} /> Listening for live incoming requests…
                      </>
                    ) : (
                      <span>No requests match the active filters ({rows.length} requests in session).</span>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filteredRows.map(row => {
                const outcome = resolveOutcome(row);
                const outcomeConfig = OUTCOME_LABEL[outcome] || OUTCOME_LABEL.success;
                const isFail = outcome === "upstream_error" || outcome === "rejected" || outcome === "client_disconnected" || row.status === "provider_error";

                const stopReason = row.stopReason || (outcome === "success" ? "end_turn" : "none");
                const ttft = row.ttftMs;
                const duration = row.durationMs ?? row.latencyMs;

                return (
                  <tr
                    key={row.requestId}
                    className={`border-t border-white/6 transition-colors ${
                      isFail
                        ? outcome === "client_disconnected"
                          ? "bg-rose-500/[0.04] hover:bg-rose-500/[0.08]"
                          : "bg-red-500/[0.04] hover:bg-red-500/[0.08]"
                        : outcome === "truncated"
                        ? "bg-amber-500/[0.03] hover:bg-amber-500/[0.06]"
                        : "hover:bg-white/[.02]"
                    }`}
                  >
                    {/* Status Dot */}
                    <td className="px-3 py-2">
                      <span
                        className="inline-block h-2 w-2 rounded-full shadow-xs"
                        style={{ background: outcomeConfig.dot }}
                        aria-hidden="true"
                        title={outcomeConfig.text}
                      />
                    </td>

                    {/* Time */}
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[10px] text-[#a9aab8]">
                      {new Date(row.createdAt).toLocaleTimeString()}
                    </td>

                    {/* User */}
                    <td className="max-w-[8rem] truncate px-3 py-2 font-medium text-[#e6e6ee]" title={row.userName ? `${row.userName} (ID: ${row.userId})` : `User #${row.userId}`}>
                      {row.userName ?? `user:${row.userId}`}
                    </td>

                    {/* Model with Compaction & Reasoning Badges */}
                    <td className="max-w-[13rem] truncate px-3 py-2 font-mono text-[#e6e6ee]" title={row.modelId}>
                      {(() => {
                        const visualTagMatch = row.provider?.match(/\((image:[^)]+|multimodal|document)\)/i);
                        const visualTag = visualTagMatch ? visualTagMatch[1] : null;

                        return (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold">{row.modelId}</span>
                            {visualTag && (
                              <span
                                className="inline-flex items-center gap-1 rounded border border-cyan-400/40 bg-cyan-500/20 px-1.5 py-0.2 text-[8.5px] font-bold font-mono tracking-wide text-cyan-300 shadow-sm"
                                title={`Multimodal Image Recency: ${visualTag}`}
                              >
                                🖼️ {visualTag}
                              </span>
                            )}
                            {(() => {
                              if (!row.rawErrorMessage || !row.rawErrorMessage.includes("[CompactTrigger")) return null;
                              const match = row.rawErrorMessage.match(/\[CompactTrigger:\s*([0-9,kM\.]+)\s*->\s*([0-9,kM\.]+)\s*(?:\(ua:\s*([^)]*)\))?\]/i);
                              const tokenTransition = match ? `${match[1]} → ${match[2]}` : null;
                              const rawUa = (match?.[3] || "").toLowerCase();
                              let harness = "Agent";
                              if (rawUa.includes("claude-code") || rawUa.includes("claude-cli")) harness = "Claude Code";
                              else if (rawUa.includes("hermes")) harness = "Hermes";
                              else if (rawUa.includes("pi-") || rawUa.includes("pi/") || rawUa.includes("pi-coding")) harness = "Pi";
                              else if (rawUa.includes("cursor")) harness = "Cursor";
                              else if (rawUa.includes("aider")) harness = "Aider";
                              else if (rawUa.includes("cline")) harness = "Cline";
                              else if (rawUa.includes("roo")) harness = "Roo Code";
                              else if (rawUa.includes("openhands") || rawUa.includes("all-hands")) harness = "OpenHands";
                              else if (match?.[3]) harness = match[3].split(/[\s/]/)[0].slice(0, 14);

                              return (
                                <span
                                  className="inline-flex items-center gap-1 rounded border border-purple-400/40 bg-purple-500/20 px-1.5 py-0.2 text-[8.5px] font-bold tracking-wide text-purple-200 shadow-sm"
                                  title={`Context Compaction Triggered!\nClient / Harness: ${match?.[3] || "CLI / Agent"}\nDiagnostic: ${row.rawErrorMessage}`}
                                >
                                  <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
                                  <span>COMPACTED · {harness}</span>
                                  {tokenTransition && <span className="opacity-80 font-mono text-[8px]">({tokenTransition})</span>}
                                </span>
                              );
                            })()}
                            {(row.reasoningReturned || (row.rawErrorMessage && row.rawErrorMessage.includes("[ReasoningFallback"))) && (
                              <span
                                className="inline-flex items-center gap-1 rounded border border-amber-400/40 bg-amber-500/20 px-1.5 py-0.2 text-[8.5px] font-bold tracking-wide text-amber-300 shadow-sm"
                                title="Reasoning fallback: model returned empty content, output reasoning was returned to user"
                              >
                                ⚡ REASONING
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* Provider */}
                    <td className="max-w-[13rem] px-3 py-2 font-medium text-[#c9ff73]" title={row.provider ?? "Default"}>
                      {(() => {
                        const visualTagMatch = row.provider?.match(/\((image:[^)]+|multimodal|document)\)/i);
                        const visualTag = visualTagMatch ? visualTagMatch[1] : null;
                        const cleanProvider = row.provider ? row.provider.split("(")[0].trim() : "Default";

                        return (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="truncate">{cleanProvider}</span>
                            {visualTag && (
                              <span
                                className="inline-flex items-center gap-0.5 rounded border border-cyan-400/30 bg-cyan-500/10 px-1 py-0.2 text-[8px] font-mono text-cyan-300"
                                title={`Multimodal Tag: ${visualTag}`}
                              >
                                ({visualTag})
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* Source: API vs Playground */}
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[10px]">
                      {row.source === "playground" ? (
                        <span
                          className="inline-flex items-center gap-1 rounded border border-purple-400/40 bg-purple-500/15 px-1.5 py-0.5 text-[9px] font-bold text-purple-300 shadow-xs"
                          title="Request executed from Web Playground"
                        >
                          <Play size={9} className="fill-purple-300/40 text-purple-300" />
                          PLAYGROUND
                        </span>
                      ) : row.client === "cli" ? (
                        /* qronos_change - terminal CLI, not a generic API caller */
                        <span
                          className="inline-flex items-center gap-1 rounded border border-amber-400/40 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-300"
                          title="Request sent by the Qronos CLI (x-qronos-client: cli)"
                        >
                          <Terminal size={9} className="text-amber-300" />
                          QRONOS CLI
                        </span>
                      ) : row.client === "code" ? (
                        /* qronos_change - VS Code extension */
                        <span
                          className="inline-flex items-center gap-1 rounded border border-sky-400/40 bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-bold text-sky-300"
                          title="Request sent by the Qronos Code VS Code extension"
                        >
                          <Code2 size={9} className="text-sky-300" />
                          QRONOS CODE
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 rounded border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400"
                          title="Request executed via API Key / SDK"
                        >
                          <Terminal size={9} className="text-emerald-400" />
                          API
                        </span>
                      )}
                    </td>

                    {/* Outcome Badge */}
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-mono font-bold ${outcomeConfig.cls}`}>
                        {outcomeConfig.text}
                      </span>
                    </td>

                    {/* Finish Reason Badge */}
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[10px]">
                      <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] ${
                        stopReason === "max_tokens" || stopReason === "length"
                          ? "border-amber-400/40 bg-amber-500/15 text-amber-300 font-bold"
                          : stopReason === "tool_use" || stopReason === "tool_calls"
                          ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-300 font-bold"
                          : stopReason === "refusal"
                          ? "border-rose-400/40 bg-rose-500/15 text-rose-300 font-bold"
                          : "border-white/10 bg-white/5 text-zinc-400"
                      }`}>
                        {stopReason}
                      </span>
                    </td>

                    {/* In / Out Tokens */}
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[10px] tabular-nums text-[#e6e6ee]">
                      {row.inputTokens.toLocaleString()} / {row.outputTokens.toLocaleString()}
                    </td>

                    {/* TTFT (Time To First Token) - in seconds */}
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[10px] tabular-nums">
                      {ttft != null ? (
                        <span
                          className={`${
                            ttft > 30000
                              ? "text-red-400 font-bold bg-red-500/20 px-1 py-0.5 rounded"
                              : ttft > 10000
                              ? "text-amber-300 font-bold bg-amber-500/20 px-1 py-0.5 rounded"
                              : "text-[#a9aab8]"
                          }`}
                          title={`Time To First Token: ${(ttft / 1000).toFixed(2)}s (${ttft.toLocaleString()}ms)`}
                        >
                          {(ttft / 1000).toFixed(2)}s
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>

                    {/* Total Duration - in seconds */}
                    <td
                      className="whitespace-nowrap px-3 py-2 text-right font-mono text-[10px] tabular-nums text-[#a9aab8]"
                      title={duration != null ? `Total Duration: ${(duration / 1000).toFixed(2)}s (${duration.toLocaleString()}ms)` : undefined}
                    >
                      {duration != null ? `${(duration / 1000).toFixed(2)}s` : "—"}
                    </td>

                    {/* Diagnostic / Error */}
                    <td
                      className={`max-w-[20rem] px-3 py-2 text-[10px] ${
                        isFail ? "text-red-300" : "text-[#858697]"
                      }`}
                      title={row.rawErrorMessage || row.errorMessage || undefined}
                    >
                      {row.rawErrorMessage ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide ${
                                row.rawErrorMessage.includes("[CLIENT_DISCONNECT]") || outcome === "client_disconnected"
                                  ? "border-rose-400/40 bg-rose-500/15 text-rose-300"
                                  : row.rawErrorMessage.includes("[PRE-FLIGHT]")
                                  ? "border-amber-400/40 bg-amber-500/15 text-amber-300"
                                  : row.rawErrorMessage.includes("Timeout")
                                  ? "border-orange-400/40 bg-orange-500/15 text-orange-300"
                                  : "border-red-400/40 bg-red-500/15 text-red-200"
                              }`}
                            >
                              {row.rawErrorMessage.includes("[CLIENT_DISCONNECT]") || outcome === "client_disconnected"
                                ? "CLIENT"
                                : row.rawErrorMessage.includes("[PRE-FLIGHT]")
                                ? "PRE-FLIGHT"
                                : row.rawErrorMessage.includes("Timeout")
                                ? "TIMEOUT"
                                : "UPSTREAM"}
                            </span>
                            <span className="font-mono font-medium text-red-200 break-all text-[10px]">
                              {row.rawErrorMessage.replace(/^\[(?:CLIENT_DISCONNECT|PRE-FLIGHT|TIMEOUT|UPSTREAM)\]\s*/, "")}
                            </span>
                          </div>
                          {row.errorMessage && row.errorMessage !== row.rawErrorMessage && (
                            <span className="text-[9px] text-[#858697] truncate block">
                              Client: {row.errorMessage}
                            </span>
                          )}
                        </div>
                      ) : (
                        row.errorMessage || (isFail ? "Upstream failure" : "—")
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-3 text-[10px] text-[#858697]">
        <p>
          Showing {filteredRows.length} of {rows.length} requests in session memory. Immediate socket abortion active.
        </p>
        <p className="flex items-center gap-1 text-[#a9aab8]">
          <CheckCircle2 size={11} className="text-[#c9ff73]" /> Telemetry stream active · Zero client payload storage
        </p>
      </div>
    </section>
  );
}
