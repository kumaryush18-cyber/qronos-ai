import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Activity, Code2, KeyRound, Loader2, RefreshCw, Terminal, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";

type ClientKind = "cli" | "code";

const WINDOWS = [
  { label: "15 min", minutes: 15 },
  { label: "1 hour", minutes: 60 },
  { label: "24 hours", minutes: 1440 },
  { label: "7 days", minutes: 10080 },
] as const;

function ago(iso: string | null | undefined) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "just now";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

function compact(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-white">{value}</p>
      {hint ? <p className="text-[10px] text-zinc-500">{hint}</p> : null}
    </div>
  );
}

/**
 * One tab for one client kind.
 *
 * "cli" is the Qronos CLI (terminal). "code" is the Qronos Code extension.
 * Managed traffic arrives through usage_events; presence and the BYOK view come
 * from the client heartbeat, because BYOK calls never reach this server.
 */
export default function AdminClientPanel({ kind }: { kind: ClientKind }) {
  const [minutes, setMinutes] = useState<number>(1440);
  const [selected, setSelected] = useState<number | null>(null);

  const overview = trpc.admin.clients.overview.useQuery(
    { client: kind, window: minutes },
    { refetchInterval: 30_000, refetchIntervalInBackground: false },
  );
  const users = trpc.admin.clients.users.useQuery(
    { client: kind, window: minutes, limit: 200 },
    { refetchInterval: 60_000 },
  );
  const models = trpc.admin.clients.models.useQuery({ client: kind, window: minutes }, { refetchInterval: 120_000 });
  const byok = trpc.admin.clients.byok.useQuery({ client: kind, limit: 200 }, { refetchInterval: 60_000 });
  const detail = trpc.admin.clients.detail.useQuery({ userId: selected ?? 1 }, { enabled: selected !== null });

  const refetchAll = () => {
    void overview.refetch();
    void users.refetch();
    void models.refetch();
    void byok.refetch();
  };

  const stats = overview.data;
  const errorRate = useMemo(() => {
    if (!stats || stats.requests === 0) return "0%";
    return `${((stats.errors / stats.requests) * 100).toFixed(1)}%`;
  }, [stats]);

  const Icon = kind === "cli" ? Terminal : Code2;
  const title = kind === "cli" ? "Qronos CLI" : "Qronos Code";
  const blurb =
    kind === "cli"
      ? "Terminal client. Presence comes from the heartbeat; usage from the gateway."
      : "VS Code extension. Presence comes from the heartbeat; usage from the gateway.";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Icon className="mt-1 text-[#c9ff73]" size={18} />
          <div>
            <h2 className="text-sm font-semibold text-white">{title}</h2>
            <p className="text-xs text-zinc-500">{blurb}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {WINDOWS.map(item => (
            <Button
              key={item.minutes}
              size="sm"
              variant="ghost"
              onClick={() => setMinutes(item.minutes)}
              className={`h-7 rounded-lg px-2 text-[11px] font-mono ${
                minutes === item.minutes ? "bg-white text-black" : "text-zinc-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              {item.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={refetchAll}
            className="h-7 rounded-lg px-2 text-[11px] text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <RefreshCw size={12} className="mr-1" /> refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Active now" value={String(stats?.activeNow ?? 0)} hint="last 15 min" />
        <Stat label="Active users" value={String(stats?.activeUsers ?? 0)} hint={`last ${minutes} min`} />
        <Stat label="Machines" value={String(stats?.activeDevices ?? 0)} hint="reporting" />
        <Stat label="Requests" value={compact(stats?.requests ?? 0)} hint="managed traffic" />
        <Stat label="Tokens" value={compact(stats?.tokens ?? 0)} />
        <Stat label="Errors" value={errorRate} hint={`${compact(stats?.errors ?? 0)} failed`} />
      </div>

      <section className="rounded-xl border border-white/10">
        <header className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
            <UsersRound size={14} /> Users
          </div>
          <span className="text-[10px] text-zinc-500">{users.data?.length ?? 0} shown</span>
        </header>
        {users.isLoading ? (
          <div className="grid h-24 place-items-center">
            <Loader2 className="animate-spin text-zinc-500" size={16} />
          </div>
        ) : (users.data?.length ?? 0) === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-zinc-500">
            No {title} activity in this window. The client reports its first heartbeat after login.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[11px]">
              <thead className="text-zinc-500">
                <tr className="border-b border-white/5">
                  <th className="px-3 py-1.5 font-medium">User</th>
                  <th className="px-3 py-1.5 font-medium">Plan</th>
                  <th className="px-3 py-1.5 font-medium">Version</th>
                  <th className="px-3 py-1.5 font-medium">Mode</th>
                  <th className="px-3 py-1.5 font-medium">Model</th>
                  <th className="px-3 py-1.5 text-right font-medium">Req</th>
                  <th className="px-3 py-1.5 text-right font-medium">Tokens</th>
                  <th className="px-3 py-1.5 text-right font-medium">Err</th>
                  <th className="px-3 py-1.5 font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {users.data?.map(row => (
                  <tr
                    key={row.userId}
                    onClick={() => setSelected(row.userId === selected ? null : row.userId)}
                    className={`cursor-pointer border-b border-white/5 hover:bg-white/[0.04] ${
                      selected === row.userId ? "bg-white/[0.06]" : ""
                    }`}
                  >
                    <td className="max-w-[220px] truncate px-3 py-1.5 text-zinc-200">
                      {row.name || row.email || `user #${row.userId}`}
                      {row.byokProviders.length > 0 && (
                        <Badge className="ml-1.5 bg-[#f0c180]/15 px-1 py-0 text-[9px] text-[#f0c180]">BYOK</Badge>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-zinc-400">{row.tier ?? "—"}</td>
                    <td className="px-3 py-1.5 font-mono text-zinc-400">{row.version ?? "—"}</td>
                    <td className="px-3 py-1.5 text-zinc-400">
                      {row.mode ?? "—"}
                      {row.os ? <span className="ml-1 text-zinc-600">· {row.os}</span> : null}
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-1.5 font-mono text-zinc-300">{row.modelId ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right text-zinc-300">{compact(row.requests)}</td>
                    <td className="px-3 py-1.5 text-right text-zinc-300">{compact(row.tokens)}</td>
                    <td className="px-3 py-1.5 text-right text-zinc-400">{compact(row.errors)}</td>
                    <td className="px-3 py-1.5 text-zinc-400">{ago(row.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected !== null && (
        <section className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-white">Machine detail · user #{selected}</p>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setSelected(null)}>
              close
            </Button>
          </div>
          {detail.isLoading ? (
            <Loader2 className="animate-spin text-zinc-500" size={14} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Machines</p>
                <ul className="space-y-1 text-[11px] text-zinc-300">
                  {(detail.data?.sessions ?? []).map((item: any) => (
                    <li key={item.id} className="rounded-lg border border-white/5 px-2 py-1 font-mono">
                      {item.client} · {item.os}/{item.arch} · v{item.version ?? "?"} · {item.modelId ?? "no model"} ·{" "}
                      {item.mode ?? "?"} · {ago(item.lastSeen as unknown as string)}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Last requests</p>
                <ul className="space-y-1 text-[11px] text-zinc-300">
                  {(detail.data?.recent ?? []).slice(0, 8).map((item: any) => (
                    <li key={item.requestId} className="flex justify-between gap-2 rounded-lg border border-white/5 px-2 py-1">
                      <span className="truncate font-mono">{item.modelId}</span>
                      <span className="text-zinc-500">
                        {item.status} · {compact(item.totalTokens ?? 0)} tok
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10">
          <header className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2 text-xs font-semibold text-white">
            <Activity size={14} /> Models in use
          </header>
          <ul className="divide-y divide-white/5 text-[11px]">
            {(models.data ?? []).length === 0 && <li className="px-3 py-4 text-center text-zinc-500">No traffic yet.</li>}
            {(models.data ?? []).map(row => (
              <li key={row.modelId} className="flex items-center justify-between gap-2 px-3 py-1.5">
                <span className="truncate font-mono text-zinc-300">{row.modelId}</span>
                <span className="shrink-0 text-zinc-500">
                  {row.users} users · {compact(row.requests)} req · {compact(row.tokens)} tok
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-white/10">
          <header className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2 text-xs font-semibold text-white">
            <KeyRound size={14} /> BYOK / custom providers
            <span className="ml-auto text-[10px] font-normal text-zinc-500">{byok.data?.length ?? 0}</span>
          </header>
          {(byok.data ?? []).length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-zinc-500">
              No custom provider reported yet. Keys are shown masked: first two and last four characters only.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-[11px]">
                <thead className="text-zinc-500">
                  <tr className="border-b border-white/5">
                    <th className="px-3 py-1.5 font-medium">User</th>
                    <th className="px-3 py-1.5 font-medium">Provider</th>
                    <th className="px-3 py-1.5 font-medium">Base URL</th>
                    <th className="px-3 py-1.5 font-medium">Key</th>
                    <th className="px-3 py-1.5 font-medium">Model</th>
                    <th className="px-3 py-1.5 font-medium">Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {byok.data?.map(row => (
                    <tr key={row.id} className="border-b border-white/5">
                      <td className="max-w-[150px] truncate px-3 py-1.5 text-zinc-200">{row.name || row.email || `#${row.userId}`}</td>
                      <td className="px-3 py-1.5 text-zinc-300">{row.providerId}</td>
                      <td className="max-w-[200px] truncate px-3 py-1.5 font-mono text-zinc-400">{row.baseUrl ?? "—"}</td>
                      <td className="px-3 py-1.5 font-mono text-zinc-300" title={row.keyFingerprint ?? ""}>
                        {row.keyMasked ?? "—"}
                      </td>
                      <td className="max-w-[160px] truncate px-3 py-1.5 font-mono text-zinc-400">{row.modelId ?? "—"}</td>
                      <td className="px-3 py-1.5 text-zinc-500">{ago(row.lastSeen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
