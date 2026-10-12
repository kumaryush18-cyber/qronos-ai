import { QronosGlyph } from "./QronosGlyph";

export function RouteLoader() {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black text-white selection:bg-white/20 select-none overflow-hidden"
      role="status"
      aria-live="polite"
      aria-label="Loading Qronos AI"
    >
      {/* Background ambient radial glow */}
      <div className="absolute h-96 w-96 rounded-full bg-white/[0.03] blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center text-center p-8 max-w-sm">
        {/* Orbiting Star Light Frame around Qronos Glyph */}
        <div className="relative flex items-center justify-center p-[2px] rounded-2xl overflow-hidden mb-5">
          <div
            aria-hidden="true"
            className="absolute inset-[-50%] pointer-events-none animate-spin"
            style={{
              animationDuration: "2.8s",
              animationTimingFunction: "linear",
              background:
                "conic-gradient(from 0deg, transparent 0deg, transparent 220deg, rgba(255,255,255,0.4) 280deg, rgba(255,255,255,0.95) 360deg)",
            }}
          />
          <div className="relative z-10 p-3 bg-[#0c0d12] rounded-[14px] border border-white/10 shadow-2xl">
            <QronosGlyph size={48} className="rounded-lg overflow-hidden shadow-lg" />
          </div>
        </div>

        {/* Brand and Status Copy */}
        <div className="space-y-1.5">
          <h2 className="text-base font-extrabold tracking-tight text-white font-mono flex items-center justify-center gap-1.5">
            <span>Qronos</span>
            <span className="text-zinc-500">AI</span>
          </h2>
          <div className="flex items-center justify-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] text-zinc-400 font-mono tracking-wider uppercase font-semibold">
              Connecting to Routing Mesh…
            </span>
          </div>
        </div>

        {/* Minimal Progress Bar with Shimmer */}
        <div className="w-36 h-[2px] bg-white/10 rounded-full mt-5 overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent animate-[shimmer_1.4s_infinite]" />
        </div>
      </div>
    </div>
  );
}

export default RouteLoader;
