import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ArrowUpRight, X } from "lucide-react";

export const DISCORD_INVITE_URL = "https://discord.gg/xVDscH5ezj";
export const LOGIN_WELCOME_TOUR_COMPLETED_KEY = "qronos_welcome_tour_completed";

export type LoginWelcomeUser = {
  id: number;
  name?: string | null;
  createdAt?: Date | string | null;
  lastSignedIn?: Date | string | null;
};

export function loginWelcomeSessionMarker(user: LoginWelcomeUser) {
  const timestamp = new Date(user.lastSignedIn ?? user.createdAt ?? 0).getTime();
  return `${user.id}:${Number.isFinite(timestamp) ? timestamp : "session"}`;
}

export function shouldShowLoginWelcomeTour(marker: string, completedMarker: string | null) {
  return Boolean(marker) && completedMarker !== marker;
}

// Authentic Discord Controller Logo SVG
function DiscordIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 127.14 96.36"
      className={className}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,45.91,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,45.91,96.12,53,91.08,65.69,84.69,65.69Z" />
    </svg>
  );
}

export function LoginWelcomeTour({ user }: { user: LoginWelcomeUser | null | undefined }) {
  const [open, setOpen] = useState(false);
  const marker = useMemo(() => (user ? loginWelcomeSessionMarker(user) : ""), [user]);

  useEffect(() => {
    if (!marker || typeof window === "undefined") {
      setOpen(false);
      return;
    }

    let completedMarker: string | null = null;
    try {
      completedMarker = sessionStorage.getItem(LOGIN_WELCOME_TOUR_COMPLETED_KEY);
    } catch {}

    setOpen(shouldShowLoginWelcomeTour(marker, completedMarker));
  }, [marker]);

  if (!user) return null;

  const completeTour = () => {
    try {
      sessionStorage.setItem(LOGIN_WELCOME_TOUR_COMPLETED_KEY, marker);
    } catch {}
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) completeTour(); }}>
      <DialogContent
        showCloseButton={false}
        className="overflow-hidden border-0 bg-transparent p-0 shadow-none sm:max-w-md focus:outline-none"
      >
        {/* Futuristic Obsidian Card Chassis */}
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.12] bg-[#090a10]/95 p-6 sm:p-8 text-white shadow-[0_30px_100px_rgba(0,0,0,0.95)] backdrop-blur-2xl text-center">
          {/* Ambient Lighting Depth Glow */}
          <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[#5865F2]/20 blur-[80px]" />
          <div className="pointer-events-none absolute -left-20 -bottom-20 h-56 w-56 rounded-full bg-emerald-500/15 blur-[80px]" />

          {/* Top Status Header */}
          <div className="relative z-10 flex items-center justify-between pb-3 border-b border-white/[0.08]">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 relative">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-emerald-400">
                10,000,000 FREE TOKENS READY
              </span>
            </div>

            <button
              type="button"
              onClick={completeTour}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.04] text-zinc-400 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
              aria-label="Close modal"
            >
              <X size={14} />
            </button>
          </div>

          {/* Dark Grey Shimmering Discord Emblem with Rotating Star Light */}
          <div className="relative z-10 my-6 flex items-center justify-center">
            {/* Rotating Star Light Orbit */}
            <div className="relative p-[2px] rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.9)]">
              {/* Rotating Star Beam */}
              <div
                className="absolute inset-[-150%] animate-[spin_4s_linear_infinite]"
                style={{
                  background: "conic-gradient(from 0deg, transparent 0deg 310deg, rgba(255,255,255,0.95) 350deg, #ffffff 360deg)",
                }}
              />
              {/* Dark Grey Shimmering Emblem Surface */}
              <div className="relative flex items-center justify-center w-24 h-24 sm:w-28 sm:h-28 rounded-[22px] bg-gradient-to-b from-[#24252e] via-[#15161f] to-[#0c0d12] border border-white/20 shadow-2xl overflow-hidden group">
                {/* Iridescent Metallic Shimmer Sweeper */}
                <div
                  className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_3s_infinite]"
                  style={{
                    background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)",
                  }}
                />
                {/* Discord Controller SVG in shimmering dark metallic platinum */}
                <DiscordIcon className="h-12 w-12 sm:h-14 sm:w-14 text-zinc-200 drop-shadow-[0_4px_16px_rgba(0,0,0,0.95)] filter brightness-110" />
              </div>
            </div>
          </div>

          {/* Title & Single Catchy Line */}
          <div className="relative z-10 space-y-2">
            <DialogTitle className="text-xl sm:text-2xl font-extrabold tracking-tight text-white leading-tight">
              Join the Developer Guild
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-zinc-400 max-w-sm mx-auto leading-relaxed">
              Connect with core gateway engineers to unlock private model drops, live outage radar, and your 10M free tokens.
            </DialogDescription>
          </div>

          {/* Actions: Big Join Discord Button & Below Small Text Link */}
          <div className="relative z-10 mt-6 flex flex-col items-center gap-3">
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noreferrer"
              onClick={completeTour}
              className="w-full flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#5865F2] to-[#4752c4] hover:from-[#6572f8] hover:to-[#525de0] text-white font-mono font-bold text-xs sm:text-sm transition-all hover:shadow-[0_0_35px_rgba(88,101,242,0.55)] hover:scale-[1.01] active:scale-[0.99] cursor-pointer border border-[#7289da]/40 shadow-xl"
            >
              <DiscordIcon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              <span>Join Official Discord</span>
              <ArrowUpRight size={15} className="opacity-90" />
            </a>

            <button
              type="button"
              onClick={completeTour}
              className="text-xs font-mono text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer py-1 underline-offset-4 hover:underline"
            >
              Continue to workspace →
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default LoginWelcomeTour;
