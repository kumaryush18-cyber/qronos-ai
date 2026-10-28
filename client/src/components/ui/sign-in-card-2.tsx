import React, { useRef, useEffect, useState } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { QronosGlyph } from "@/components/QronosGlyph";
import { StarBackgroundSvg } from "@/components/StarButton";
import { Loader2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

function OnboardingGitHubLogo() {
  const logoRef = useRef<HTMLDivElement>(null);
  const [logoPath, setLogoPath] = useState<string>("");

  useEffect(() => {
    const updateLogoPath = () => {
      if (logoRef.current) {
        const w = logoRef.current.offsetWidth;
        const h = logoRef.current.offsetHeight;
        if (w > 0 && h > 0) {
          setLogoPath(`path('M 0 0 H ${w} V ${h} H 0 V 0')`);
        }
      }
    };
    updateLogoPath();
    const ro = new ResizeObserver(updateLogoPath);
    if (logoRef.current) ro.observe(logoRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={logoRef}
      style={{
        ["--duration" as any]: 3.2,
        ["--light-width" as any]: "75px",
        ["--light-color" as any]: "#FAFAFA",
        ["--path" as any]: logoPath,
        isolation: "isolate",
      }}
      className="relative mx-auto w-16 h-16 rounded-2xl overflow-hidden group select-none shrink-0 flex items-center justify-center border border-slate-200/50 hover:border-slate-100 shadow-[0_0_30px_rgba(255,255,255,0.14)] transition-all duration-300"
    >
      {/* Revolving glowing light on path */}
      {logoPath && (
        <div
          className="absolute aspect-square inset-0 animate-star-btn bg-[radial-gradient(ellipse_at_center,var(--light-color),transparent,transparent)] pointer-events-none"
          style={{
            offsetPath: "var(--path)",
            offsetDistance: "0%",
            width: "var(--light-width)",
          }}
        />
      )}

      {/* Rotating conic ray for smooth perimeter sweep */}
      <div
        aria-hidden="true"
        className="absolute inset-[-60%] pointer-events-none animate-spin opacity-80"
        style={{
          animationDuration: "3.2s",
          animationTimingFunction: "linear",
          background:
            "conic-gradient(from 0deg, transparent 0deg 270deg, rgba(255,255,255,0.25) 320deg, rgba(255,255,255,0.9) 350deg, #ffffff 360deg)",
        }}
      />

      {/* Inner background with starry backdrop and inner border */}
      <div
        aria-hidden="true"
        className="absolute inset-[2.5px] border border-white/20 z-[4] overflow-hidden rounded-[13px] pointer-events-none bg-black flex items-center justify-center"
      >
        <StarBackgroundSvg color="#000000" starColor="#ffffff" />
      </div>

      {/* Foreground GitHub Octocat SVG */}
      <div className="relative z-10 flex items-center justify-center">
        <svg
          className="w-8 h-8 fill-current text-white drop-shadow-[0_2px_12px_rgba(255,255,255,0.35)]"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
          />
        </svg>
      </div>
    </div>
  );
}

export interface SignInCardProps {
  onGitHubSignIn?: () => void;
  isLoading?: boolean;
  errorMessage?: string | null;
  isSuccess?: boolean;
  isSignup?: boolean;
  referralCode?: string | null;
  isSpecialReferralCampaign?: boolean;
  className?: string;
}

export function SignInCard({
  onGitHubSignIn,
  isLoading = false,
  errorMessage,
  isSuccess = false,
  isSignup = false,
  referralCode,
  isSpecialReferralCampaign = false,
  className,
}: SignInCardProps) {
  // For 3D card tilt effect
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useTransform(mouseY, [-300, 300], [10, -10]);
  const rotateY = useTransform(mouseX, [-300, 300], [-10, 10]);

  // For rotating star light path on button
  const btnRef = useRef<HTMLButtonElement>(null);
  const [btnPath, setBtnPath] = useState<string>("");

  useEffect(() => {
    const updateBtnPath = () => {
      if (btnRef.current) {
        const w = btnRef.current.offsetWidth;
        const h = btnRef.current.offsetHeight;
        if (w > 0 && h > 0) {
          setBtnPath(`path('M 0 0 H ${w} V ${h} H 0 V 0')`);
        }
      }
    };
    updateBtnPath();
    const ro = new ResizeObserver(updateBtnPath);
    if (btnRef.current) ro.observe(btnRef.current);
    return () => ro.disconnect();
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left - rect.width / 2);
    mouseY.set(e.clientY - rect.top - rect.height / 2);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  return (
    <div
      style={{ backgroundColor: "oklch(0 0 0)" }}
      className={cn("min-h-screen w-full relative overflow-hidden flex items-center justify-center p-4 selection:bg-white/20 selection:text-white", className)}
    >
      {/* Horizontal End-to-End Responsive Video Band at Middle (Behind & Extending Across Viewport) */}
      <div
        className="absolute top-1/2 left-0 right-0 -translate-y-1/2 w-full h-[540px] sm:h-[620px] overflow-hidden pointer-events-none z-0 [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_88%,transparent)] [-webkit-mask-image:linear-gradient(to_bottom,transparent,black_12%,black_88%,transparent)]"
      >
        <video
          src="/videos/mux_background_1080p.mp4"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="w-full h-full object-cover object-center"
        />
        {/* Soft edge gradients so it transitions cleanly into pure black */}
        <div className="absolute inset-y-0 left-0 w-8 sm:w-16 bg-gradient-to-r from-black to-transparent pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-8 sm:w-16 bg-gradient-to-l from-black to-transparent pointer-events-none" />
      </div>

      {/* 3D Perspective Card Container */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="w-full max-w-sm relative z-10"
        style={{ perspective: 1500 }}
      >
        <motion.div
          className="relative"
          style={{ rotateX, rotateY }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          whileHover={{ z: 10 }}
        >
          <div className="relative group">
            {/* Ambient Card Outer Glow */}
            <motion.div
              className="absolute -inset-[1px] rounded-2xl opacity-0 group-hover:opacity-70 transition-opacity duration-700"
              animate={{
                boxShadow: [
                  "0 0 10px 2px rgba(255,255,255,0.03)",
                  "0 0 15px 5px rgba(255,255,255,0.06)",
                  "0 0 10px 2px rgba(255,255,255,0.03)",
                ],
                opacity: [0.2, 0.4, 0.2],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut",
                repeatType: "mirror",
              }}
            />

            {/* Traveling Light Beams along all 4 Card Borders */}
            <div className="absolute -inset-[1px] rounded-2xl overflow-hidden pointer-events-none z-0">
              {/* Top beam */}
              <motion.div
                className="absolute top-0 left-0 h-[2.5px] w-[50%] bg-gradient-to-r from-transparent via-white to-transparent opacity-75"
                initial={{ filter: "blur(2px)" }}
                animate={{
                  left: ["-50%", "100%"],
                  opacity: [0.3, 0.8, 0.3],
                  filter: ["blur(1px)", "blur(2.5px)", "blur(1px)"],
                }}
                transition={{
                  left: { duration: 2.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 1 },
                  opacity: { duration: 1.2, repeat: Infinity, repeatType: "mirror" },
                  filter: { duration: 1.5, repeat: Infinity, repeatType: "mirror" },
                }}
              />

              {/* Right beam */}
              <motion.div
                className="absolute top-0 right-0 h-[50%] w-[2.5px] bg-gradient-to-b from-transparent via-white to-transparent opacity-75"
                initial={{ filter: "blur(2px)" }}
                animate={{
                  top: ["-50%", "100%"],
                  opacity: [0.3, 0.8, 0.3],
                  filter: ["blur(1px)", "blur(2.5px)", "blur(1px)"],
                }}
                transition={{
                  top: { duration: 2.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 1, delay: 0.6 },
                  opacity: { duration: 1.2, repeat: Infinity, repeatType: "mirror", delay: 0.6 },
                  filter: { duration: 1.5, repeat: Infinity, repeatType: "mirror", delay: 0.6 },
                }}
              />

              {/* Bottom beam */}
              <motion.div
                className="absolute bottom-0 right-0 h-[2.5px] w-[50%] bg-gradient-to-r from-transparent via-white to-transparent opacity-75"
                initial={{ filter: "blur(2px)" }}
                animate={{
                  right: ["-50%", "100%"],
                  opacity: [0.3, 0.8, 0.3],
                  filter: ["blur(1px)", "blur(2.5px)", "blur(1px)"],
                }}
                transition={{
                  right: { duration: 2.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 1, delay: 1.2 },
                  opacity: { duration: 1.2, repeat: Infinity, repeatType: "mirror", delay: 1.2 },
                  filter: { duration: 1.5, repeat: Infinity, repeatType: "mirror", delay: 1.2 },
                }}
              />

              {/* Left beam */}
              <motion.div
                className="absolute bottom-0 left-0 h-[50%] w-[2.5px] bg-gradient-to-b from-transparent via-white to-transparent opacity-75"
                initial={{ filter: "blur(2px)" }}
                animate={{
                  bottom: ["-50%", "100%"],
                  opacity: [0.3, 0.8, 0.3],
                  filter: ["blur(1px)", "blur(2.5px)", "blur(1px)"],
                }}
                transition={{
                  bottom: { duration: 2.5, ease: "easeInOut", repeat: Infinity, repeatDelay: 1, delay: 1.8 },
                  opacity: { duration: 1.2, repeat: Infinity, repeatType: "mirror", delay: 1.8 },
                  filter: { duration: 1.5, repeat: Infinity, repeatType: "mirror", delay: 1.8 },
                }}
              />

              {/* Corner points */}
              <motion.div
                className="absolute top-0 left-0 h-[5px] w-[5px] rounded-full bg-white/50 blur-[1px]"
                animate={{ opacity: [0.2, 0.5, 0.2] }}
                transition={{ duration: 2, repeat: Infinity, repeatType: "mirror" }}
              />
              <motion.div
                className="absolute top-0 right-0 h-[6px] w-[6px] rounded-full bg-white/70 blur-[1.5px]"
                animate={{ opacity: [0.2, 0.5, 0.2] }}
                transition={{ duration: 2.4, repeat: Infinity, repeatType: "mirror", delay: 0.5 }}
              />
              <motion.div
                className="absolute bottom-0 right-0 h-[6px] w-[6px] rounded-full bg-white/70 blur-[1.5px]"
                animate={{ opacity: [0.2, 0.5, 0.2] }}
                transition={{ duration: 2.2, repeat: Infinity, repeatType: "mirror", delay: 1 }}
              />
              <motion.div
                className="absolute bottom-0 left-0 h-[5px] w-[5px] rounded-full bg-white/50 blur-[1px]"
                animate={{ opacity: [0.2, 0.5, 0.2] }}
                transition={{ duration: 2.3, repeat: Infinity, repeatType: "mirror", delay: 1.5 }}
              />
            </div>

            {/* Frosted Obsidian Glass Card Surface Centered Over Motion Video */}
            <div
              style={{
                backgroundColor: "oklch(0.13 0 0 / 0.88)",
                borderColor: "oklch(0.28 0 0)",
                boxShadow: "0 30px 80px rgba(0,0,0,0.95), inset 0 1px 0 rgba(255,255,255,0.12)",
              }}
              className="relative backdrop-blur-2xl rounded-2xl p-7 sm:p-8 border shadow-2xl overflow-hidden z-10"
            >
              {/* Logo and Header with Onboarding GitHub Logo (Double Border Rotating Star Light Design) */}
              <div className="text-center space-y-3 mb-6">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", duration: 0.8 }}
                >
                  <OnboardingGitHubLogo />
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-xl font-bold text-white tracking-tight"
                >
                  {isSignup ? "Create Qronos AI Account" : "Welcome Back"}
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  style={{ color: "oklch(0.72 0 0)" }}
                  className="text-xs"
                >
                  Sign in with verified GitHub to access your LLM Gateway workspace
                </motion.p>
              </div>

              {/* Referral notice if applicable: 5M Tokens in Green Message */}
              {referralCode && (
                <div
                  className="mb-5 p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs font-mono text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.15)] text-left"
                >
                  <div className="flex items-center gap-2 font-bold text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>🎁 5,000,000 (5M) Tokens Bonus Activated!</span>
                  </div>
                  <div className="text-[11px] text-emerald-300/90 mt-1.5 leading-relaxed font-sans">
                    You joined via invitation. Create your account with GitHub now to receive <strong className="text-white font-mono font-bold">5,000,000 Free Coding Tokens</strong> immediately credited to your balance!
                  </div>
                </div>
              )}

              {/* Single GitHub Action Button with Landing Page Rotating Star Light Design */}
              <div className="space-y-4">
                <button
                  ref={btnRef}
                  type="button"
                  onClick={onGitHubSignIn}
                  disabled={isLoading || isSuccess}
                  style={{
                    ["--duration" as any]: 3,
                    ["--light-width" as any]: "110px",
                    ["--light-color" as any]: "#FAFAFA",
                    ["--border-width" as any]: "2px",
                    ["--path" as any]: btnPath,
                    isolation: "isolate",
                  }}
                  className="relative z-[3] overflow-hidden w-full h-11 px-5 py-2 inline-flex items-center justify-center gap-3 whitespace-nowrap rounded-xl text-sm font-semibold transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 group/star-button cursor-pointer border border-slate-200/50 hover:border-slate-100 shadow-[0_0_20px_rgba(255,255,255,0.12)]"
                >
                  {/* Revolving glowing light on path */}
                  {btnPath && (
                    <div
                      className="absolute aspect-square inset-0 animate-star-btn bg-[radial-gradient(ellipse_at_center,var(--light-color),transparent,transparent)] pointer-events-none"
                      style={{
                        offsetPath: "var(--path)",
                        offsetDistance: "0%",
                        width: "var(--light-width)",
                      }}
                    />
                  )}

                  {/* Inner background with starry backdrop */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-[2px] border border-white/15 z-[4] overflow-hidden rounded-[inherit] pointer-events-none bg-black"
                  >
                    <svg
                      width="100%"
                      height="100%"
                      preserveAspectRatio="none"
                      viewBox="0 0 100 40"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <g clipPath="url(#clip0_signin_star)">
                        <path
                          d="M32.34 26.68C32.34 26.3152 32.0445 26.02 31.68 26.02C31.3155 26.02 31.02 26.3152 31.02 26.68C31.02 27.0448 31.3155 27.34 31.68 27.34C32.0445 27.34 32.34 27.0448 32.34 26.68Z"
                          fill="black"
                        />
                        <path
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M56.1 3.96C56.4645 3.96 56.76 4.25519 56.76 4.62C56.76 4.98481 56.4645 5.28 56.1 5.28C55.9131 5.28 55.7443 5.20201 55.624 5.07762C55.5632 5.01446 55.5147 4.93904 55.4829 4.8559C55.4552 4.78243 55.44 4.70315 55.44 4.62C55.44 4.5549 55.4494 4.49174 55.4668 4.43244C55.4906 4.35188 55.5292 4.27775 55.5795 4.21329C55.7004 4.05926 55.8885 3.96 56.1 3.96ZM40.26 17.16C40.6245 17.16 40.92 17.4552 40.92 17.82C40.92 18.1848 40.6245 18.48 40.26 18.48C39.8955 18.48 39.6 18.1848 39.6 17.82C39.6 17.4552 39.8955 17.16 40.26 17.16ZM74.58 5.28C74.7701 5.28 74.9413 5.36057 75.0618 5.48882C75.073 5.50043 75.0837 5.51268 75.094 5.52557C75.1088 5.54426 75.1231 5.56359 75.1359 5.58357L75.1479 5.60291L75.1595 5.62353C75.1711 5.64481 75.1814 5.66672 75.1906 5.68928C75.2226 5.76662 75.24 5.85106 75.24 5.94C75.24 6.1585 75.1336 6.3525 74.9699 6.47238C74.9158 6.51234 74.8555 6.54393 74.7908 6.56584C74.7247 6.58775 74.6538 6.6 74.58 6.6C74.2156 6.6 73.92 6.30481 73.92 5.94C73.92 5.87684 73.929 5.8156 73.9455 5.7576C73.9596 5.70862 73.979 5.66221 74.0032 5.61903C74.0657 5.50688 74.1595 5.41471 74.2728 5.35541C74.3647 5.30707 74.4691 5.28 74.58 5.28ZM138.6 0H0V46.2H138.6V0Z"
                          fill="black"
                        />
                      </g>
                      <defs>
                        <clipPath id="clip0_signin_star">
                          <rect width="100" height="40" fill="white" />
                        </clipPath>
                      </defs>
                    </svg>
                  </div>

                  {/* Button Content */}
                  <span className="relative z-10 inline-flex items-center justify-center gap-3 whitespace-nowrap text-white font-medium w-full">
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-zinc-300" />
                        <span>Connecting to GitHub…</span>
                      </>
                    ) : (
                      <>
                        <svg className="h-5 w-5 fill-current text-white shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                          />
                        </svg>
                        <span>Continue with GitHub</span>
                        <ArrowRight size={14} className="ml-auto text-zinc-400" />
                      </>
                    )}
                  </span>
                </button>

                <p className="text-[11px] text-zinc-500 text-center leading-relaxed font-mono">
                  GitHub account must be at least 3 months old with a verified email.
                </p>

                {errorMessage && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 flex items-start gap-2">
                    <span className="font-bold text-red-400 shrink-0">Notice:</span>
                    <span>{errorMessage}</span>
                  </div>
                )}

                {isSuccess && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300 text-center font-mono">
                    Authentication successful! Entering workspace…
                  </div>
                )}

                <div className="pt-2 text-center">
                  <a
                    href="https://discord.gg/PGVmBGht7r"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-zinc-500 hover:text-white transition font-mono inline-block underline decoration-zinc-700 underline-offset-4 hover:decoration-white"
                  >
                    Need help? Contact administrator on Discord
                  </a>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

export default SignInCard;
