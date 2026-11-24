import React from "react";
import { Activity } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { clockLabel, durationLabel, shortModel, slotLabel, statusTone, tokensLabel } from "./freepi-routing-format";

type RoutingEvent = {
  key: string;
  slot: number | null;
  model: string;
  status: number;
  ms: number;
  inputTokens: number | null;
  outputTokens: number | null;
  at: string;
};

const STATUS_TONE: Record<"good" | "warn" | "bad" | "idle", string> = {
  good: "text-[#c9ff73]",
  warn: "text-[#ffcd82]",
  bad: "text-[#ff9b9b]",
  idle: "text-[#9fa0ad]",
};

/**
 * The live routing window.
 *
 * A free-model request goes straight from a user's machine to the service, so the
 * gateway never sees it; the CLI reports one small event per attempt instead.
 * This block reads the window the gateway keeps in memory.
 *
 * It is a window, not a ledger: it empties on the next deploy, and the block says
 * so, because a number nobody can reproduce is worse than a number with a caveat.
 * One line per attempt, newest first, and a line never wraps.
 */
export function FreepiRoutingBlock() {
  const routing = trpc.admin.freepiRouting.useQuery(undefined, {
    // Five seconds while the panel is open and in front of you; TanStack does not
    // poll a hidden tab by default, so a background panel costs nothing.
    refetchInterval: 5_000,
  });
  const events: RoutingEvent[] = (routing.data?.events ?? []) as RoutingEvent[];
  const total = routing.data?.total ?? 0;

  return (
    <section className="rounded-xl border border-white/8 bg-black/15 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Activity size={14} className="text-[#c9ff73]" />
        <p className="text-xs font-bold text-white">Live routing</p>
        <span className="text-[10px] text-[#858697]">
          {total === 0 ? "nothing yet" : `${total} in the window`} · last {events.length} shown · resets on deploy
        </span>
      </div>

      {events.length === 0 ? (
        <p className="mt-3 text-[10px] text-[#7f8190]">
          No request has been reported yet. One line appears here as soon as a free model answers.
        </p>
      ) : (
        <div className="mt-3 overflow-hidden">
          <div className="flex items-center gap-3 border-b border-white/6 pb-1 text-[9px] font-bold uppercase tracking-[.12em] text-[#7f8190]">
            <span className="w-14 shrink-0">time</span>
            <span className="w-12 shrink-0">slot</span>
            <span className="min-w-0 flex-1">model</span>
            <span className="w-8 shrink-0 text-right">code</span>
            <span className="w-10 shrink-0 text-right">time</span>
            <span className="w-16 shrink-0 text-right">in / out</span>
          </div>
          <ul className="mt-1 divide-y divide-white/5">
            {events.map((event, index) => (
              <li
                key={`${event.at}-${index}`}
                className="flex items-center gap-3 py-[3px] font-mono text-[10px] whitespace-nowrap"
              >
                <span className="w-14 shrink-0 text-[#9fa0ad]">{clockLabel(event.at)}</span>
                <span className="w-12 shrink-0 text-[#c6c7d2]">{slotLabel(event.slot, event.key)}</span>
                {/* The only field that may be cut, so the numbers never move. */}
                <span className="min-w-0 flex-1 truncate text-white" title={event.model}>
                  {shortModel(event.model, 18)}
                </span>
                <span className={`w-8 shrink-0 text-right ${STATUS_TONE[statusTone(event.status)]}`}>
                  {event.status === 0 ? "—" : event.status}
                </span>
                <span className="w-10 shrink-0 text-right text-[#9fa0ad]">{durationLabel(event.ms)}</span>
                <span className="w-16 shrink-0 text-right text-[#c6c7d2]">
                  {tokensLabel(event.inputTokens, event.outputTokens)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 text-[10px] leading-5 text-[#7f8190]">
        A line is one attempt: the key that served it, the status the service answered, how long it took, and the
        tokens the service itself reported. A dash means it did not report a number, not that the request was free.
        Nothing here is a prompt, an answer or a key.
      </p>
    </section>
  );
}
