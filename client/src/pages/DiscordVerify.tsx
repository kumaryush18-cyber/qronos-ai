import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { MaintenanceCountdownBanner } from "@/components/MaintenanceCountdownBanner";
import { trpc } from "@/lib/trpc";
import { ArrowRight, CheckCircle2, Loader2, LockKeyhole, MessageCircle, ShieldCheck, TriangleAlert } from "lucide-react";
import { Link, useLocation } from "wouter";
import { ThreeDButton } from "@/components/ui/3d-button";

const ERROR_COPY: Record<string, { title: string; body: string }> = {
  "not-member": {
    title: "We could not find that Discord account in the Qronos AI server.",
    body: "Join the Qronos AI Discord server first, then return here and run verification again. If you just joined, wait a moment for Discord to update your membership.",
  },
  failed: {
    title: "Discord could not complete the membership check.",
    body: "No access has been granted. Please try again in a moment; if the issue continues, rejoin the server and retry.",
  },
  "state-error": {
    title: "This verification link is no longer valid.",
    body: "For your protection, start the Discord verification step again from this page.",
  },
  "already-linked": {
    title: "This Discord account is already linked to another Qronos AI account.",
    body: "Each Discord account can be used to verify only one Qronos AI account. If this Discord account previously verified a different Qronos AI account, sign in to that account instead — or contact support for help.",
  },
};

function SystemNotices() {
  return <><AnnouncementBanner /><MaintenanceCountdownBanner /></>;
}

export default function DiscordVerify({ embedded = false }: { embedded?: boolean }) {
  const [location] = useLocation();
  const { user, loading } = useAuth();
  const verification = trpc.developer.discordVerificationStatus.useQuery(undefined, {
    enabled: Boolean(user),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const error = new URLSearchParams(location.split("?")[1] ?? "").get("error") ?? "";
  const errorCopy = ERROR_COPY[error];
  const startVerification = () => {
    window.location.assign("/api/auth/discord");
  };

  if (loading || (Boolean(user) && verification.isLoading)) {
    return <><SystemNotices /><main className="min-h-screen bg-[#010101] px-4 py-10 text-white"><div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center"><Loader2 className="animate-spin text-[#5865F2]" size={28} /></div></main></>;
  }

  if (!user) {
    return <><SystemNotices /><main className="min-h-screen bg-[#010101] px-4 py-10 text-white"><section className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center rounded-3xl border border-white/10 bg-[#07080c] p-6 text-center shadow-2xl sm:p-9"><LockKeyhole className="mx-auto text-[#5865F2]" size={28} /><p className="mt-5 text-[10px] font-mono font-bold uppercase tracking-[.19em] text-[#5865F2]">Qronos AI Access</p><h1 className="mt-2 text-2xl font-bold tracking-tight">Sign in before verifying Discord.</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-400">Discord verification is linked to your signed-in Qronos AI account and cannot be completed anonymously.</p><div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3"><Button asChild className="h-[42px] px-6 bg-white text-black hover:bg-zinc-200 font-mono font-bold"><Link href="/signin">Sign in</Link></Button><ThreeDButton href="/signin" /></div></section></main></>;
  }

  if (verification.data?.administratorBypass || verification.data?.verified) {
    return <><SystemNotices /><main className="min-h-screen bg-[#010101] px-4 py-10 text-white"><section className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center rounded-3xl border border-emerald-500/20 bg-[#07080c] p-6 text-center shadow-2xl sm:p-9"><CheckCircle2 className="mx-auto text-emerald-400" size={32} /><p className="mt-5 text-[10px] font-mono font-bold uppercase tracking-[.19em] text-emerald-400">{verification.data.administratorBypass ? "Administrator bypass" : "Discord verified"}</p><h1 className="mt-2 text-2xl font-bold tracking-tight">Your workspace is ready.</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-400">{verification.data.administratorBypass ? "This active administrator session retains recovery access without a Discord check." : "Your Qronos AI account has a confirmed server-membership record. 10,000,000 free tokens unlocked."}</p><Button asChild className="mx-auto mt-7 bg-white text-black hover:bg-zinc-200 font-mono font-bold"><Link href="/dashboard">Open dashboard <ArrowRight size={16} /></Link></Button></section></main></>;
  }

  return <><SystemNotices /><main className={`${embedded ? "min-h-screen" : "min-h-screen"} bg-[#010101] px-4 py-7 text-white sm:py-10`}><section className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_90%_5%,rgba(88,101,242,.15),transparent_40%),linear-gradient(145deg,#0c0d14,#040508_68%)] shadow-2xl"><div className="absolute right-[-75px] top-[-90px] h-56 w-56 rounded-full border border-[#5865F2]/15" /><div className="relative grid gap-7 p-5 sm:p-8 lg:grid-cols-[1.16fr_.84fr] lg:gap-10 lg:p-11"><div><div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#5865F2]/30 bg-[#5865F2]/10 text-[#5865F2]"><MessageCircle size={21} /></div><p className="mt-6 text-[10px] font-mono font-bold uppercase tracking-[.2em] text-[#5865F2]">Community Membership</p><h1 className="mt-2 max-w-xl text-3xl font-bold tracking-[-.045em] text-white sm:text-4xl">Verify Discord before entering the workspace.</h1><p className="mt-4 max-w-xl text-sm leading-6 text-zinc-300">Connect the Discord account you use with Qronos AI. We verify server membership to unlock your 10M free tokens and API key generation.</p>{errorCopy && <div role="alert" className="mt-5 flex gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/[.07] p-4 text-left"><TriangleAlert className="mt-0.5 shrink-0 text-amber-200" size={18} /><div><p className="text-sm font-semibold text-amber-100">{errorCopy.title}</p><p className="mt-1 text-xs leading-5 text-amber-100/75">{errorCopy.body}</p></div></div>}{verification.error && <div role="alert" className="mt-5 rounded-2xl border border-red-300/20 bg-red-300/[.06] p-4 text-sm leading-6 text-red-100">We could not confirm your current verification status. Refresh this page or sign in again before retrying.</div>}<div className="mt-7"><Button className="h-11 bg-gradient-to-r from-[#5865F2] to-[#4752c4] hover:from-[#6572f8] hover:to-[#525de0] text-white px-5 font-mono font-bold border border-[#7289da]/30 shadow-lg shadow-[#5865F2]/25 cursor-pointer" onClick={startVerification} disabled={verification.isFetching}><ShieldCheck size={17} />Connect Discord &amp; verify membership</Button></div></div><aside className="rounded-2xl border border-white/10 bg-black/40 p-5 sm:p-6"><p className="text-[10px] font-mono font-bold uppercase tracking-[.16em] text-zinc-400">Verification path</p><ol className="mt-5 space-y-5"><li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#5865F2]/20 text-[11px] font-mono font-bold text-[#9ba5f7]">1</span><div><p className="text-sm font-semibold">Be a community member</p><p className="mt-1 text-xs leading-5 text-zinc-400">The connected Discord account must already be a member of the Qronos AI server.</p></div></li><li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#5865F2]/20 text-[11px] font-mono font-bold text-[#9ba5f7]">2</span><div><p className="text-sm font-semibold">Connect your Discord account</p><p className="mt-1 text-xs leading-5 text-zinc-400">Discord shows its standard authorization screen. Qronos AI requests only the <code className="rounded bg-white/10 px-1 py-0.5 text-zinc-200">identify</code> scope.</p></div></li><li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#5865F2]/20 text-[11px] font-mono font-bold text-[#9ba5f7]">3</span><div><p className="text-sm font-semibold">Enter the workspace</p><p className="mt-1 text-xs leading-5 text-zinc-400">After a successful server membership check, you return directly to your dashboard with 10M free tokens unlocked.</p></div></li></ol><div className="mt-6 border-t border-white/8 pt-5"><div className="flex gap-2 text-[#5865F2]"><LockKeyhole size={15} /><p className="text-[10px] font-mono font-bold uppercase tracking-[.14em]">Privacy boundary</p></div><p className="mt-2 text-xs leading-5 text-zinc-400">Qronos AI does not save your Discord username or OAuth tokens. We retain only the 1-to-1 binding and verification timestamp. <Link href="/legal/privacy" className="text-[#5865F2] underline underline-offset-4">Read privacy policy</Link>.</p></div></aside></div></section></main></>;
}
