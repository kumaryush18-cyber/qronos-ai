import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DiscordIcon, DISCORD_INVITE_URL } from "./LoginWelcomeTour";
import { StarButton } from "./StarButton";
import {
  ArrowRight,
  ArrowUpRight,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

export function openDiscordVerifyModal(errorCode?: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("qronos:open-discord-verify", { detail: { error: errorCode } }));
  }
}

export function DiscordVerifyModal({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const setOpen = (next: boolean) => {
    if (controlledOnOpenChange) controlledOnOpenChange(next);
    if (!isControlled) setInternalOpen(next);
    if (!next) setModalError(null);
  };

  useEffect(() => {
    const handleOpen = (e?: any) => {
      if (e?.detail?.error) {
        setModalError(e.detail.error);
      }
      setOpen(true);
    };
    window.addEventListener("qronos:open-discord-verify", handleOpen);
    return () => window.removeEventListener("qronos:open-discord-verify", handleOpen);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const searchError = new URLSearchParams(window.location.search).get("error");
    if (searchError) {
      setModalError(searchError);
      setOpen(true);
    }
  }, []);

  const handleJoinClick = () => {
    setHasJoined(true);
    window.open(DISCORD_INVITE_URL, "_blank", "noopener,noreferrer");
  };

  const handleVerifyClick = () => {
    window.location.assign("/api/auth/discord");
  };

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="border border-white/12 bg-[#08090f]/98 p-0 text-white w-[calc(100vw-24px)] sm:w-[calc(100vw-48px)] max-w-lg rounded-2xl sm:rounded-3xl overflow-hidden shadow-[0_25px_80px_rgba(0,0,0,0.95)] backdrop-blur-2xl max-h-[min(92vh,720px)] flex flex-col focus:outline-none">
        <div className="relative p-4 sm:p-6 md:p-8 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {/* Ambient Lighting Glows */}
          <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[#5865F2]/20 blur-[80px]" />
          <div className="pointer-events-none absolute -left-20 -bottom-20 h-56 w-56 rounded-full bg-emerald-500/15 blur-[80px]" />

          {/* Top Status Header */}
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-2.5 pb-3.5 sm:pb-4 border-b border-white/[0.08]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-[#5865F2]/15 border border-[#5865F2]/30 text-[#5865F2] shadow-lg shadow-[#5865F2]/20">
                <DiscordIcon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] sm:text-[10px] font-mono font-bold uppercase tracking-[.18em] text-[#9ba5f7] truncate">
                  Community Verification
                </p>
                <h3 className="text-xs sm:text-sm font-extrabold text-white truncate">Join &amp; Verify Discord</h3>
              </div>
            </div>
            <Badge className="border border-amber-400/30 bg-amber-400/15 text-amber-300 font-mono text-[9px] sm:text-[10px] flex items-center gap-1 shrink-0 px-2 py-0.5">
              <Sparkles size={10} />
              <span>10M Free Tokens</span>
            </Badge>
          </div>

          {/* Description */}
          <div className="relative z-10 my-3.5 sm:my-4">
            <h2 className="text-lg sm:text-2xl font-extrabold tracking-tight text-white leading-tight">
              Unlock Your Developer Workspace
            </h2>
            <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm text-zinc-300 leading-relaxed">
              Complete these 2 quick steps to join our developer community, claim your{" "}
              <strong className="text-emerald-400 font-bold">10,000,000 free tokens</strong>, and activate API key generation &amp; Playground completions.
            </p>
          </div>

          {/* Error Banner if user failed verification */}
          {modalError && (
            <div className="relative z-10 my-3 p-3.5 rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent flex items-start gap-3 shadow-md">
              <TriangleAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-amber-200">
                  {modalError === "not-member"
                    ? "Server Membership Not Found"
                    : modalError === "already-linked"
                    ? "Discord Account Already Bound"
                    : modalError === "state-error"
                    ? "Verification Session Expired"
                    : "Verification Incomplete"}
                </h4>
                <p className="text-[11px] text-zinc-300 mt-0.5 leading-relaxed">
                  {modalError === "not-member"
                    ? "We could not find your Discord account in the Qronos AI server. Please click Step 1 below to join the server first, wait a few seconds, then click Step 2."
                    : modalError === "already-linked"
                    ? "This Discord account was already used to verify another Qronos account (1-to-1 binding rule)."
                    : modalError === "state-error"
                    ? "Session timed out or cookies were blocked. Please click Step 2 to retry."
                    : "We could not verify your Discord membership. Please retry."}
                </p>
              </div>
            </div>
          )}

          {/* Two-Step Verification Flow Cards */}
          <div className="relative z-10 space-y-3 mt-4 sm:mt-5">
            {/* STEP 1: Join Discord Community */}
            <div
              className={`rounded-xl sm:rounded-2xl border p-3.5 sm:p-4.5 transition-all ${
                hasJoined
                  ? "border-emerald-500/40 bg-emerald-500/[0.06]"
                  : "border-[#5865F2]/35 bg-[#5865F2]/[0.08]"
              }`}
            >
              <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
                <div
                  className={`flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-full text-xs font-mono font-bold ${
                    hasJoined
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                      : "bg-[#5865F2]/20 text-white border border-[#5865F2]/40"
                  }`}
                >
                  {hasJoined ? "✓" : "1"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs sm:text-sm font-bold text-white">
                      Join Qronos Discord Server
                    </span>
                    {hasJoined && (
                      <span className="text-[9px] sm:text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.2 rounded">
                        Link Opened ✓
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] sm:text-xs text-zinc-400 leading-relaxed">
                    You must be an active member of our official Discord server. Click below to join in a new tab.
                  </p>
                </div>
              </div>

              <div className="mt-3 sm:mt-3.5 pl-0 sm:pl-10">
                <Button
                  type="button"
                  onClick={handleJoinClick}
                  className="h-10 w-full sm:w-auto px-4 sm:px-5 bg-gradient-to-r from-[#5865F2] to-[#4752c4] hover:from-[#6572f8] hover:to-[#525de0] text-white font-mono font-bold text-xs rounded-xl shadow-lg shadow-[#5865F2]/20 cursor-pointer border border-[#7289da]/30 flex items-center justify-center gap-2"
                >
                  <DiscordIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate">Step 1: Join Discord Community</span>
                  <ArrowUpRight size={14} className="opacity-80 shrink-0" />
                </Button>
              </div>
            </div>

            {/* STEP 2: Authorize & Verify */}
            <div
              className={`rounded-xl sm:rounded-2xl border p-3.5 sm:p-4.5 transition-all ${
                hasJoined
                  ? "border-white/20 bg-black/50 ring-1 ring-[#5865F2]/30"
                  : "border-white/10 bg-black/30 opacity-90"
              }`}
            >
              <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
                <div className="flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-full bg-white/10 border border-white/20 text-white text-xs font-mono font-bold">
                  2
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs sm:text-sm font-bold text-white block">
                    Authorize &amp; Verify Server Membership
                  </span>
                  <p className="mt-1 text-[11px] sm:text-xs text-zinc-400 leading-relaxed">
                    Discord will request standard <code className="text-[#9ba5f7] bg-white/5 px-1 py-0.2 rounded font-mono text-[10px] sm:text-xs">identify</code> permission so our verification bot confirms your server membership.
                  </p>
                </div>
              </div>

              <div className="mt-3 sm:mt-3.5 pl-0 sm:pl-10">
                <StarButton
                  backgroundColor="#06070b"
                  lightColor="rgba(88, 101, 242, 0.95)"
                  starColor="#5865F2"
                  borderWidth={2}
                  duration={3}
                  onClick={handleVerifyClick}
                  className="h-11 w-full sm:w-auto px-4 sm:px-6 rounded-xl border border-[#5865F2]/70 hover:border-[#7289da] text-xs font-mono font-bold shadow-[0_0_25px_rgba(88,101,242,0.4)] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
                  <span className="truncate">Step 2: Connect Discord &amp; Verify</span>
                  <ArrowRight size={14} className="ml-1 text-zinc-300 shrink-0" />
                </StarButton>
              </div>
            </div>
          </div>

          {/* Privacy Note */}
          <div className="relative z-10 mt-4 sm:mt-5 pt-3.5 sm:pt-4 border-t border-white/[0.08] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5 text-[10px] sm:text-[11px] text-zinc-500 font-mono">
            <span className="flex items-center gap-1.5">
              <LockKeyhole size={12} className="text-zinc-400 shrink-0" />
              Zero tokens or messages stored
            </span>
            <span className="text-emerald-400 font-semibold">1-to-1 account binding</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default DiscordVerifyModal;
