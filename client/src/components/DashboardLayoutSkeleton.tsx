import { QronosGlyph } from './QronosGlyph';

export function DashboardLayoutSkeleton() {
  return (
    <div className="flex min-h-screen bg-black text-white selection:bg-white/20">
      {/* Sidebar skeleton */}
      <div
        style={{
          backgroundColor: "oklch(0.14 0 0)",
          borderColor: "oklch(0.26 0 0)",
        }}
        className="w-[280px] border-r p-4 space-y-6 hidden md:block"
      >
        {/* Logo area */}
        <div className="flex items-center gap-3 px-2 pt-2">
          <QronosGlyph size={28} className="rounded-lg overflow-hidden shrink-0 opacity-80" />
          <div className="space-y-1.5">
            <div className="h-3.5 w-20 bg-white/10 rounded animate-pulse" />
            <div className="h-2 w-14 bg-white/5 rounded animate-pulse" />
          </div>
        </div>

        {/* Menu items */}
        <div className="space-y-2.5 px-1 mt-6">
          <div className="h-9 w-full bg-white/[0.08] rounded-xl animate-pulse" />
          <div className="h-9 w-full bg-white/[0.04] rounded-xl animate-pulse" />
          <div className="h-9 w-full bg-white/[0.04] rounded-xl animate-pulse" />
          <div className="h-9 w-full bg-white/[0.04] rounded-xl animate-pulse" />
          <div className="h-9 w-full bg-white/[0.04] rounded-xl animate-pulse" />
        </div>
      </div>

      {/* Main content skeleton */}
      <div className="flex-1 p-6 sm:p-8 space-y-6 bg-black">
        {/* Top header skeleton */}
        <div
          style={{
            backgroundColor: "oklch(0.14 0 0)",
            borderColor: "oklch(0.26 0 0)",
          }}
          className="rounded-3xl border p-6 sm:p-8 space-y-3 shadow-xl"
        >
          <div className="h-4 w-36 bg-white/10 rounded-full animate-pulse" />
          <div className="h-8 w-64 bg-white/15 rounded-xl animate-pulse" />
          <div className="h-3 w-96 max-w-full bg-white/5 rounded animate-pulse" />
        </div>

        {/* 3 cards skeleton */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div
            style={{
              backgroundColor: "oklch(0.14 0 0)",
              borderColor: "oklch(0.26 0 0)",
            }}
            className="h-44 rounded-3xl border p-6 animate-pulse"
          />
          <div
            style={{
              backgroundColor: "oklch(0.14 0 0)",
              borderColor: "oklch(0.26 0 0)",
            }}
            className="h-44 rounded-3xl border p-6 animate-pulse"
          />
          <div
            style={{
              backgroundColor: "oklch(0.14 0 0)",
              borderColor: "oklch(0.26 0 0)",
            }}
            className="h-44 rounded-3xl border p-6 animate-pulse"
          />
        </div>

        {/* Bottom card skeleton */}
        <div
          style={{
            backgroundColor: "oklch(0.14 0 0)",
            borderColor: "oklch(0.26 0 0)",
          }}
          className="h-64 rounded-3xl border p-6 animate-pulse"
        />
      </div>
    </div>
  );
}

export default DashboardLayoutSkeleton;
