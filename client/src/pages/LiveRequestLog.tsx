import { useEffect, useRef, useState } from "react";
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
} from "lucide-react";

type LiveRequest = {
  requestId: string;
  userId: number;
  modelId: string;
  status: "success" | "rejected" | "provider_error" | "cancelled";
  source: "api" | "playground";
  stream: boolean;
  inputTokens: number;
  outputTokens: number;
  latencyMs?: number;
  provider?: string;
  errorMessage?: string;
  rawErrorMessage?: string;
  userName?: string | null;
  createdAt: string;
};

const STATUS_LABEL: Record<LiveRequest["status"], { text: string; cls: string; dot: string }> = {
  success: { text: "Success", cls: "text-[#c9ff73] bg-[#c9ff73]/10 border-[#c9ff73]/25", dot: "bg-[#4ade80]" },
  provider_error: { text: "Provider error", cls: "text-red-300 bg-red-400/10 border-red-300/25", dot: "bg-red-500" },
  rejected: { text: "Rejected", cls: "text-amber-200 bg-amber-300/10 border-amber-300/25", dot: "bg-amber-400" },
  cancelled: { text: "Cancelled", cls: "text-[#a9aab8] bg-white/6 border-white/12", dot: "bg-[#a9aab8]" },
};

const MAX_ROWS = 300;

function playAlertChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Tone 1: 587.33 Hz (D5 alert)
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

    // Tone 2: 440 Hz (A4 alert low tone)
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

/**
 * Dispatches an OS-level mobile/desktop notification.
 * On Android Chrome and mobile browsers, this MUST use ServiceWorkerRegistration.showNotification()
 * so the notification pops up in the Android notification tray, heads-up banner, and lock screen.
 */
async function sendSystemNotification(req: LiveRequest) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const userDisplay = req.userName ? `${req.userName} (User #${req.userId})` : `User #${req.userId}`;
  const providerDisplay = req.provider || "Default Provider";
  const statusDisplay = req.status === "provider_error" ? "Provider Error (5xx)" : "Rejected Request";
  const errorDisplay = req.rawErrorMessage
    ? `\nDiagnostic: ${req.rawErrorMessage}`
    : req.errorMessage
    ? `\nError: ${req.errorMessage}`
    : "";

  const title = `🚨 Live Failure: ${req.modelId}`;
  const body = `User: ${userDisplay}\nModel: ${req.modelId}\nProvider: ${providerDisplay}\nStatus: ${statusDisplay}${errorDisplay}`;

  const notificationOptions = {
    body,
    icon: "/favicon/favicon-192x192.png",
    badge: "/favicon/favicon-32x32.png",
    vibrate: [300, 100, 300, 100, 300], // Vibrates Android phone/tablet
    tag: `live-fail-${req.requestId}`,
    renotify: true,
    requireInteraction: true,
    data: {
      url: "/admin?tab=live-requests",
      requestId: req.requestId,
    },
  };

  // Primary Path: ServiceWorkerRegistration (Required for Android / Mobile Chrome)
  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && "showNotification" in reg) {
        await reg.showNotification(title, notificationOptions);
        return;
      }
    } catch {
      // fallback to message or standard constructor
    }

    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "SHOW_NOTIFICATION",
        title,
        options: notificationOptions,
      });
      return;
    }
  }

  // Fallback Path: Standard desktop Notification constructor
  try {
    const notif = new Notification(title, notificationOptions);
    notif.onclick = () => {
      window.focus();
      notif.close();
    };
  } catch {
    /* ignore fallback errors */
  }
}

export default function LiveRequestLog() {
  const [rows, setRows] = useState<LiveRequest[]>([]);
  const [connected, setConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [sessionFailures, setSessionFailures] = useState(0);
  const [lastAlert, setLastAlert] = useState<{ title: string; detail: string; time: string } | null>(null);

  // Notification & Audio states
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      return Notification.permission;
    }
    return "default";
  });

  const [desktopAlerts, setDesktopAlerts] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("tokenforge_live_req_notif");
    return stored === "true";
  });

  const [soundAlerts, setSoundAlerts] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("tokenforge_live_req_sound");
    return stored !== "false";
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const isSnapshotDoneRef = useRef(false);
  const desktopAlertsRef = useRef(desktopAlerts);
  const soundAlertsRef = useRef(soundAlerts);

  // Register Service Worker for Mobile & Desktop OS notifications
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(() => {
        // Service worker active
      }).catch((err) => {
        console.warn("ServiceWorker registration notice:", err);
      });
    }
  }, []);

  useEffect(() => {
    desktopAlertsRef.current = desktopAlerts;
    localStorage.setItem("tokenforge_live_req_notif", desktopAlerts ? "true" : "false");
  }, [desktopAlerts]);

  useEffect(() => {
    soundAlertsRef.current = soundAlerts;
    localStorage.setItem("tokenforge_live_req_sound", soundAlerts ? "true" : "false");
  }, [soundAlerts]);

  // Request browser / mobile notification permission
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
      alert("Notifications are blocked in your browser or device settings. Please go to Site Settings in your mobile/desktop browser to allow notifications for TokenForge.");
      return;
    }

    try {
      const result = await Notification.requestPermission();
      setNotifPermission(result);
      if (result === "granted") {
        setDesktopAlerts(true);
        // Fire a test confirmation system notification right away
        await sendSystemNotification({
          requestId: "test-welcome-" + Date.now(),
          userId: 1,
          userName: "Admin",
          modelId: "Live Alert Ready",
          provider: "TokenForge",
          status: "provider_error",
          source: "api",
          stream: false,
          inputTokens: 0,
          outputTokens: 0,
          errorMessage: "System notifications are active! You will receive mobile/desktop alerts when any request fails.",
          createdAt: new Date().toISOString(),
        });
      } else {
        setDesktopAlerts(false);
      }
    } catch {
      /* ignore */
    }
  };

  const handleTestAlert = async () => {
    if (soundAlerts) {
      playAlertChime();
    }
    const sampleReq: LiveRequest = {
      requestId: "sample-" + Date.now(),
      userId: 42,
      userName: "baba40404",
      modelId: "claude-opus-5",
      provider: "Kiro",
      status: "provider_error",
      source: "api",
      stream: true,
      inputTokens: 1200,
      outputTokens: 0,
      latencyMs: 342,
      errorMessage: "502 Bad Gateway: Upstream provider connection timeout",
      createdAt: new Date().toISOString(),
    };

    if (Notification.permission === "default") {
      const perm = await Notification.requestPermission();
      setNotifPermission(perm);
      if (perm === "granted") {
        setDesktopAlerts(true);
        await sendSystemNotification(sampleReq);
      }
    } else if (Notification.permission === "granted") {
      await sendSystemNotification(sampleReq);
    }

    setLastAlert({
      title: `Test Alert Triggered: ${sampleReq.modelId}`,
      detail: `User: ${sampleReq.userName} · Provider: ${sampleReq.provider} · ${sampleReq.errorMessage}`,
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

        const isFailure = row.status === "provider_error" || row.status === "rejected";

        if (isFailure) {
          setSessionFailures(n => n + 1);

          // Only trigger audible/browser notifications for real-time incoming failures (not backlog snapshot)
          if (isSnapshotDoneRef.current) {
            if (soundAlertsRef.current) {
              playAlertChime();
            }

            if (desktopAlertsRef.current && Notification.permission === "granted") {
              sendSystemNotification(row);
            }

            setLastAlert({
              title: `Live Failure · ${row.modelId}`,
              detail: `User: ${row.userName ?? `User #${row.userId}`} · Provider: ${row.provider ?? "Default"} · ${row.errorMessage || row.status}`,
              time: new Date().toLocaleTimeString(),
            });
          }
        }
      } catch {
        /* ignore malformed event */
      }
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

  return (
    <section className="dashboard-card space-y-4">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[.13em] text-[#858697]">Live request monitor</p>
            {sessionFailures > 0 && (
              <span className="flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-300">
                <AlertTriangle size={11} /> {sessionFailures} {sessionFailures === 1 ? "failure" : "failures"} in session
              </span>
            )}
          </div>
          <h2 className="mt-1 text-lg font-bold text-white">Real-time requests & failure alerts</h2>
          <p className="mt-1 text-[10px] text-[#9091a3]">
            Instant mobile & desktop system push notifications with vibration whenever a request fails.
          </p>
        </div>

        {/* Action Controls & Notification Settings */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Connection status */}
          <span className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium ${connected ? "border-[#c9ff73]/25 bg-[#c9ff73]/10 text-[#c9ff73]" : "border-red-500/25 bg-red-500/10 text-red-300"}`}>
            <Radio size={12} className={connected ? "animate-pulse text-[#c9ff73]" : "text-red-400"} />
            <span>{connected ? "Connected" : "Reconnecting…"}</span>
          </span>

          {/* Mobile / Browser System Notification Toggle */}
          <button
            type="button"
            onClick={handleToggleDesktopAlerts}
            title={
              notifPermission === "denied"
                ? "Notifications blocked in device settings"
                : desktopAlerts
                ? "Click to disable mobile/system notifications"
                : "Click to enable mobile/system push notifications"
            }
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
              desktopAlerts && notifPermission === "granted"
                ? "border-[#c9ff73]/30 bg-[#c9ff73]/15 text-[#c9ff73]"
                : notifPermission === "denied"
                ? "border-red-500/30 bg-red-500/10 text-red-300"
                : "border-white/12 bg-white/5 text-[#a9aab8] hover:bg-white/10 hover:text-white"
            }`}
          >
            {desktopAlerts && notifPermission === "granted" ? <Smartphone size={13} /> : <BellOff size={13} />}
            <span>
              {notifPermission === "denied"
                ? "System Alerts Blocked"
                : desktopAlerts && notifPermission === "granted"
                ? "Device Alerts: ON"
                : "Device Alerts: OFF"}
            </span>
          </button>

          {/* Sound alert toggle */}
          <button
            type="button"
            onClick={() => setSoundAlerts(v => !v)}
            title="Toggle audio tone chime on failure"
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
              soundAlerts
                ? "border-[#c9ff73]/30 bg-[#c9ff73]/15 text-[#c9ff73]"
                : "border-white/12 bg-white/5 text-[#a9aab8] hover:bg-white/10 hover:text-white"
            }`}
          >
            {soundAlerts ? <Volume2 size={13} /> : <VolumeX size={13} />}
            <span>{soundAlerts ? "Sound: ON" : "Sound: OFF"}</span>
          </button>

          {/* Test Alert Button */}
          <button
            type="button"
            onClick={handleTestAlert}
            title="Trigger a test phone/system alert notification & audio chime"
            className="flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-[#e6e6ee] hover:bg-white/10 hover:text-white transition-colors"
          >
            <Play size={11} className="fill-current text-[#c9ff73]" /> Test System Alert
          </button>

          {/* Auto scroll toggle */}
          <button
            type="button"
            onClick={() => setAutoScroll(value => !value)}
            className={`rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors ${autoScroll ? "border-white/20 bg-white/10 text-[#e6e6ee]" : "border-white/10 text-[#858697] hover:bg-white/5"}`}
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

      {/* Live Table */}
      <div className="max-h-[34rem] overflow-y-auto overscroll-contain rounded-xl border border-white/8 bg-[#121413]/50" ref={scrollRef}>
        <table className="w-full min-w-[900px] border-collapse text-left text-[11px]">
          <thead className="sticky top-0 z-10 bg-[#171a18] shadow-sm">
            <tr className="text-[9px] uppercase tracking-[.1em] text-[#858697]">
              <th className="px-3 py-2 w-8">Status</th>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2">Provider</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">In / Out</th>
              <th className="px-3 py-2 text-right">Latency</th>
              <th className="px-3 py-2 min-w-[18rem]">Error Diagnostic & Raw Upstream</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-12 text-center text-[#858697]">
                  <div className="mx-auto flex w-max items-center gap-2 text-[12px]">
                    <Loader2 className="animate-spin text-[#c9ff73]" size={15} /> Listening for live incoming requests…
                  </div>
                </td>
              </tr>
            ) : (
              rows.map(row => {
                const status = STATUS_LABEL[row.status] ?? STATUS_LABEL.cancelled;
                const isFail = row.status === "provider_error" || row.status === "rejected";
                return (
                  <tr
                    key={row.requestId}
                    className={`border-t border-white/6 transition-colors ${
                      isFail ? "bg-red-500/[0.04] hover:bg-red-500/[0.08]" : "hover:bg-white/[.02]"
                    }`}
                  >
                    <td className="px-3 py-2">
                      <span className="live-dot" style={{ background: status.dot }} aria-hidden="true" />
                      <span className="sr-only">{status.text}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[10px] text-[#a9aab8]">
                      {new Date(row.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="max-w-[10rem] truncate px-3 py-2 font-medium text-[#e6e6ee]" title={row.userName ? `${row.userName} (ID: ${row.userId})` : `User #${row.userId}`}>
                      {row.userName ?? `user:${row.userId}`}
                    </td>
                    <td className="max-w-[11rem] truncate px-3 py-2 font-mono text-[#e6e6ee]" title={row.modelId}>
                      {row.modelId}
                    </td>
                    <td className="max-w-[15rem] truncate px-3 py-2 font-medium text-[#c9ff73]" title={row.provider ?? "Default"}>
                      {row.provider ? (
                        <span className="inline-flex items-center gap-1.5 flex-wrap">
                          {row.provider.includes("(") ? (() => {
                            const [name, ...rest] = row.provider.split("(");
                            const rawTag = rest.join("(").replace(/\)+$/, "").trim();
                            const isCurrent = rawTag.toLowerCase().includes("current");
                            const isHistorical = rawTag.toLowerCase().includes("back");
                            const badgeCls = isCurrent
                              ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
                              : isHistorical
                              ? "border-amber-400/40 bg-amber-500/15 text-amber-300"
                              : "border-sky-400/30 bg-sky-500/15 text-sky-300";
                            return (
                              <>
                                <span>{name.trim()}</span>
                                <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide ${badgeCls}`}>
                                  {rawTag}
                                </span>
                              </>
                            );
                          })() : (
                            row.provider
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-[#a9aab8]">{row.source}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-bold ${status.cls}`}>
                        {status.text}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[10px] tabular-nums text-[#e6e6ee]">
                      {row.inputTokens.toLocaleString()} / {row.outputTokens.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[10px] tabular-nums text-[#a9aab8]">
                      {row.latencyMs != null ? `${row.latencyMs}ms` : "—"}
                    </td>
                    <td
                      className={`max-w-[24rem] px-3 py-2 text-[10px] ${
                        isFail ? "text-red-300" : "text-[#858697]"
                      }`}
                      title={row.rawErrorMessage || row.errorMessage || undefined}
                    >
                      {row.rawErrorMessage ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide ${
                                row.rawErrorMessage.includes("[PRE-FLIGHT]")
                                  ? "border-amber-400/40 bg-amber-500/15 text-amber-300"
                                  : row.rawErrorMessage.includes("Timeout")
                                  ? "border-orange-400/40 bg-orange-500/15 text-orange-300"
                                  : "border-red-400/40 bg-red-500/15 text-red-200"
                              }`}
                            >
                              {row.rawErrorMessage.includes("[PRE-FLIGHT]")
                                ? "PRE-FLIGHT"
                                : row.rawErrorMessage.includes("Timeout")
                                ? "TIMEOUT"
                                : "UPSTREAM"}
                            </span>
                            <span className="font-mono font-medium text-red-200 break-all">
                              {row.rawErrorMessage.replace(/^\[(?:PRE-FLIGHT|TIMEOUT|UPSTREAM)\]\s*/, "")}
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

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-3 text-[10px] text-[#858697]">
        <p>
          Capturing up to {MAX_ROWS} live requests in memory. Phone & system notifications pop up on your device lock screen and notification tray.
        </p>
        <p className="flex items-center gap-1 text-[#a9aab8]">
          <CheckCircle2 size={11} className="text-[#c9ff73]" /> System Service Worker notification engine active
        </p>
      </div>
    </section>
  );
}
