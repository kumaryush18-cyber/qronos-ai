import { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";
import { SignInCard } from "@/components/ui/sign-in-card-2";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { MaintenanceCountdownBanner } from "@/components/MaintenanceCountdownBanner";
import { ContactAdminModal } from "@/components/ContactAdminModal";
import { persistSessionToken } from "@/lib/sessionToken";
import {
  isSpecialReferralCampaignCode,
  normalizeReferralCampaignCode,
} from "@shared/referrals";

type LocalAuthProps = { mode: "signin" | "signup" };

export default function LocalAuth({ mode }: LocalAuthProps) {
  const search = useSearch();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isContactAdminOpen, setIsContactAdminOpen] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);

  const isSignup = mode === "signup";
  const referralCode = normalizeReferralCampaignCode(new URLSearchParams(search).get("aff"));
  const isSpecialReferralCampaign = isSpecialReferralCampaignCode(referralCode);

  const handleGitHub = () => {
    setGithubLoading(true);
    setErrorMessage(null);
    const referralQuery = referralCode ? `?aff=${encodeURIComponent(referralCode)}` : "";
    // Direct full-page navigation avoids mobile popup blockers and iframe security blocks
    window.location.assign(`/api/auth/github${referralQuery}`);
  };

  // Check URL parameters for OAuth errors
  useEffect(() => {
    const params = new URLSearchParams(search);
    const githubErr = params.get("github");
    if (githubErr) {
      if (githubErr === "account-too-new") {
        setErrorMessage("GitHub accounts must be at least 14 days old to register on Qronos AI.");
      } else if (githubErr === "email-not-allowed") {
        setErrorMessage("Your GitHub account email is not allowed. Please use a verified permanent email address.");
      } else if (githubErr === "link-required") {
        setErrorMessage("An account with this email already exists. Please verify with your administrator to link GitHub.");
      } else if (githubErr === "state-error") {
        setErrorMessage("Authorization state mismatch. Please try signing in again.");
      } else if (githubErr === "failed") {
        setErrorMessage("GitHub sign-in could not be completed. Please try again.");
      }
    }
  }, [search]);

  // Listen for OAuth message from popup if used
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      const isAllowedOrigin =
        origin === window.location.origin ||
        origin.endsWith(".run.app") ||
        origin.includes("localhost") ||
        origin.includes("qronos") ||
        origin.includes("manus.space");

      if (!isAllowedOrigin) return;

      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        setIsSuccess(true);
        setTimeout(() => {
          window.location.assign("/dashboard");
        }, 300);
      } else if (event.data?.type === "OAUTH_AUTH_ERROR") {
        setGithubLoading(false);
        const err = event.data.error;
        if (err === "account-too-new") {
          setErrorMessage("GitHub accounts must be at least 14 days old to register on Qronos AI.");
        } else if (err === "email-not-allowed") {
          setErrorMessage("Your GitHub account email is not allowed. Please use a verified permanent email address.");
        } else if (err === "link-required") {
          setErrorMessage("An account with this email already exists. Please verify with your administrator to link GitHub.");
        } else if (err === "state-error") {
          setErrorMessage("Authorization state mismatch. Please try signing in again.");
        } else {
          setErrorMessage("GitHub sign-in could not be completed. Please try again.");
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <div className="min-h-screen bg-black flex flex-col relative overflow-hidden">
      <AnnouncementBanner />
      <MaintenanceCountdownBanner />

      {/* Back to Home Link in Header */}
      <div className="absolute top-5 left-5 sm:left-8 z-30">
        <Link
          href="/"
          className="text-xs font-mono text-zinc-400 hover:text-white px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-md transition flex items-center gap-1.5"
        >
          <span>← Back to Qronos AI</span>
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <SignInCard
          onGitHubSignIn={handleGitHub}
          isLoading={githubLoading}
          errorMessage={errorMessage}
          isSuccess={isSuccess}
          isSignup={isSignup}
          referralCode={referralCode}
          isSpecialReferralCampaign={isSpecialReferralCampaign}
          onContactAdmin={() => {
            setErrorMessage(null);
            setIsContactAdminOpen(true);
          }}
        />
      </div>

      <ContactAdminModal
        isOpen={isContactAdminOpen}
        onClose={() => setIsContactAdminOpen(false)}
      />
    </div>
  );
}
