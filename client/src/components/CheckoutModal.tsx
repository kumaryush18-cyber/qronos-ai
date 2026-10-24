import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  X,
  Smartphone,
  Zap,
  Check,
  Lock,
  Wallet,
  CreditCard,
  ArrowRight,
  ArrowUpRight,
  Loader2,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StarButton } from "@/components/StarButton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  UPI_TIERS,
  CODING_PLAN_TIERS,
  getCodingPlanTier,
  USD_TO_INR_RATE,
  getWhopPaygCheckoutUrl,
  getWhopTokenPlanCheckoutUrl,
  type UPITier,
  type CodingPlanTier,
} from "@shared/paymentTiers";

export interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRail?: "crypto" | "upi";
  initialPackageUsd?: number;
  initialAmountSol?: number;
  userId?: number;
  isPayg?: boolean;
  isCodingPlan?: boolean;
  codingPlanTierId?: string;
  codingTokens?: number;
  planName?: string;
  onSuccess?: (details: any) => void;
}

interface SolanaOrderData {
  order_id: string;
  usd_amount: number;
  sol_amount: number;
  amount_sol: number;
  sol_usd_price: number;
  solana_pay_url: string;
  reference_pubkey: string;
  merchant_pubkey: string;
  expires_in_seconds: number;
  created_at?: string;
  status?: string;
}

interface UPIOrderData {
  order_id: string;
  amount_inr: number;
  credits: number;
  credits_nanos?: number;
  upi_id: string;
  upi_uri: string;
  direct_upi_uri?: string;
  dynamic_upi_uri?: string;
  status: "PENDING_PAYMENT" | "PENDING_VERIFICATION" | "COMPLETED" | "REJECTED" | "EXPIRED";
  expires_at?: string;
}

export function CheckoutModal({
  isOpen,
  onClose,
  initialRail = "upi",
  initialPackageUsd = 25,
  initialAmountSol,
  userId,
  isPayg = false,
  isCodingPlan = false,
  codingPlanTierId,
  planName,
  onSuccess,
}: CheckoutModalProps) {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [activeRail, setActiveRail] = useState<"upi" | "crypto">(
    initialRail === "crypto" ? "crypto" : "upi"
  );
  const [selectedUsd, setSelectedUsd] = useState(initialPackageUsd);

  // Solana Pay states
  const [solOrder, setSolOrder] = useState<SolanaOrderData | null>(null);
  const [isLoadingSolOrder, setIsLoadingSolOrder] = useState(false);
  const [solOrderError, setSolOrderError] = useState<string | null>(null);
  const [solVerificationStatus, setSolVerificationStatus] = useState<"IDLE" | "POLLING" | "CONFIRMED" | "EXPIRED">("IDLE");
  const [solConfirmedSignature, setSolConfirmedSignature] = useState<string | null>(null);
  const [solSecondsRemaining, setSolSecondsRemaining] = useState(600);
  const [solLivePrice, setSolLivePrice] = useState<number | null>(null);
  const [isPhantomSending, setIsPhantomSending] = useState(false);
  const [phantomError, setPhantomError] = useState<string | null>(null);

  // UPI states
  const [upiOrder, setUpiOrder] = useState<UPIOrderData | null>(null);
  const [isLoadingUpiOrder, setIsLoadingUpiOrder] = useState(false);
  const [upiOrderError, setUpiOrderError] = useState<string | null>(null);
  const [enteredUtr, setEnteredUtr] = useState("");
  const [isSubmittingUtr, setIsSubmittingUtr] = useState(false);
  const [utrError, setUtrError] = useState<string | null>(null);
  const [upiStatus, setUpiStatus] = useState<"PAY" | "PENDING_VERIFICATION" | "CONFIRMED">("PAY");

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const solPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const solCountdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const upiPollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const utils = trpc.useUtils();

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (initialPackageUsd) setSelectedUsd(initialPackageUsd);
    if (initialRail) setActiveRail(initialRail === "crypto" ? "crypto" : "upi");
  }, [initialPackageUsd, initialRail, isOpen]);

  const matchedCodingPlan = isCodingPlan
    ? (getCodingPlanTier(codingPlanTierId || selectedUsd) || CODING_PLAN_TIERS[0])
    : undefined;

  const totalInr = Math.round(selectedUsd * USD_TO_INR_RATE);

  const whopCheckoutUrl = isCodingPlan
    ? getWhopTokenPlanCheckoutUrl(codingPlanTierId || (matchedCodingPlan?.id ?? "plus"), user?.email)
    : getWhopPaygCheckoutUrl(selectedUsd, user?.email);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(label);
      toast.success(`${label} copied to clipboard!`);
      setTimeout(() => setCopiedKey(null), 2500);
    } catch {
      toast.error("Failed to copy text");
    }
  };

  // ---------------------------------------------------------------------------
  // Solana Pay Logic
  // ---------------------------------------------------------------------------
  const fetchSolLivePrice = useCallback(async () => {
    try {
      const res = await fetch("/api/solana-pay/sol-price");
      if (res.ok) {
        const d = await res.json();
        if (d.price_usd) setSolLivePrice(d.price_usd);
      }
    } catch {}
  }, []);

  const createSolOrder = useCallback(async () => {
    setIsLoadingSolOrder(true);
    setSolOrderError(null);
    setSolVerificationStatus("IDLE");
    setSolConfirmedSignature(null);

    if (solPollIntervalRef.current) clearInterval(solPollIntervalRef.current);
    if (solCountdownIntervalRef.current) clearInterval(solCountdownIntervalRef.current);

    try {
      const res = await fetch("/api/solana-pay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          usd_amount: selectedUsd,
          sol_amount: initialAmountSol,
          is_payg: isPayg,
          is_coding_plan: isCodingPlan,
          coding_plan_tier_id: matchedCodingPlan?.id,
          label: isCodingPlan ? "Qronos AI Token Plan" : isPayg ? "Qronos AI PAYG" : "Qronos AI",
          message: isCodingPlan
            ? `${matchedCodingPlan?.tokensMillions || 100}M Token Plan`
            : isPayg
            ? `PAYG Deposit $${selectedUsd}`
            : "Compute Credits",
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || errJson.details || `Gateway returned status ${res.status}`);
      }

      const data: SolanaOrderData = await res.json();
      setSolOrder(data);
      if (data.sol_usd_price) setSolLivePrice(data.sol_usd_price);
      setSolSecondsRemaining(data.expires_in_seconds || 600);
      setSolVerificationStatus("POLLING");
    } catch (err: any) {
      setSolOrderError(err.message || "Failed to create Solana Pay order");
    } finally {
      setIsLoadingSolOrder(false);
    }
  }, [userId, selectedUsd, initialAmountSol, isPayg, isCodingPlan, matchedCodingPlan]);

  // Solana 1.5s Poller
  useEffect(() => {
    if (activeRail !== "crypto" || !isOpen || !solOrder || solVerificationStatus !== "POLLING") {
      if (solPollIntervalRef.current) clearInterval(solPollIntervalRef.current);
      return;
    }

    const checkVerification = async () => {
      try {
        const res = await fetch("/api/solana-pay/verify-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: solOrder.order_id,
            reference_pubkey: solOrder.reference_pubkey,
          }),
        });

        const result = await res.json().catch(() => ({}));
        if (res.ok && (result.status === "PAID" || result.status === "COMPLETED")) {
          if (solPollIntervalRef.current) clearInterval(solPollIntervalRef.current);
          if (solCountdownIntervalRef.current) clearInterval(solCountdownIntervalRef.current);

          setSolConfirmedSignature(result.signature);
          setSolVerificationStatus("CONFIRMED");
          toast.success("Payment Confirmed! Your Qronos AI tokens have been allocated.");
          (utils as any)?.creditAccounts?.getMyAccount?.invalidate?.();
          if (onSuccess) onSuccess(result.signature);
        } else if (result.status === "EXPIRED") {
          setSolVerificationStatus("EXPIRED");
        }
      } catch {}
    };

    solPollIntervalRef.current = setInterval(checkVerification, 1500);
    return () => {
      if (solPollIntervalRef.current) clearInterval(solPollIntervalRef.current);
    };
  }, [activeRail, isOpen, solOrder, solVerificationStatus, utils, onSuccess]);

  // Phantom Wallet 1-Click Pay
  const handlePhantomPay = async () => {
    if (!solOrder) return;
    setPhantomError(null);
    setIsPhantomSending(true);

    try {
      const provider = (window as any).solana || (window as any).phantom?.solana;
      if (!provider?.isPhantom) {
        throw new Error("Phantom Wallet extension not detected. Please install Phantom or scan the QR code.");
      }

      const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
      const resp = await provider.connect();
      const payerPublicKey = new PublicKey(resp.publicKey.toString());
      const merchantPublicKey = new PublicKey(solOrder.merchant_pubkey);
      const referencePublicKey = new PublicKey(solOrder.reference_pubkey);

      const lamports = Math.round(solOrder.sol_amount * LAMPORTS_PER_SOL);
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payerPublicKey,
          toPubkey: merchantPublicKey,
          lamports,
        })
      );
      tx.instructions[0].keys.push({
        pubkey: referencePublicKey,
        isWritable: false,
        isSigner: false,
      });

      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = payerPublicKey;

      const { signature } = await provider.signAndSendTransaction(tx);
      toast.success("Transaction submitted to Solana Mainnet! Confirming...");

      const verifyRes = await fetch("/api/solana-pay/verify-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: solOrder.order_id,
          reference_pubkey: solOrder.reference_pubkey,
          tx_signature: signature,
        }),
      });

      if (verifyRes.ok) {
        setSolConfirmedSignature(signature);
        setSolVerificationStatus("CONFIRMED");
        toast.success("Payment Confirmed! Your plan is active.");
        if (onSuccess) onSuccess(signature);
      }
    } catch (err: any) {
      setPhantomError(err.message || "Failed to submit transaction via Phantom");
    } finally {
      setIsPhantomSending(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Domestic UPI Logic
  // ---------------------------------------------------------------------------
  const createUpiOrder = useCallback(async () => {
    setIsLoadingUpiOrder(true);
    setUpiOrderError(null);
    setUpiStatus("PAY");
    setEnteredUtr("");
    setUtrError(null);

    try {
      const res = await fetch("/api/upi/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          tier_id: matchedCodingPlan?.id || `plan_${selectedUsd}`,
          amount_inr: totalInr,
          amount_usd: selectedUsd,
          credits: matchedCodingPlan ? matchedCodingPlan.tokensMillions : 100,
          is_payg: isPayg,
          is_coding_plan: isCodingPlan,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || errJson.detail || `Gateway returned status ${res.status}`);
      }

      const data: UPIOrderData = await res.json();
      setUpiOrder(data);
    } catch (err: any) {
      setUpiOrderError(err.message || "Failed to create UPI order");
    } finally {
      setIsLoadingUpiOrder(false);
    }
  }, [userId, selectedUsd, totalInr, isPayg, isCodingPlan, matchedCodingPlan]);

  const handleSubmitUtr = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!upiOrder) return;

    const cleanUtr = enteredUtr.trim();
    if (!/^\d{12}$/.test(cleanUtr)) {
      setUtrError("Bank UTR must be exactly 12 numeric digits.");
      return;
    }

    setUtrError(null);
    setIsSubmittingUtr(true);

    try {
      const res = await fetch("/api/upi/submit-utr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: upiOrder.order_id,
          utr: cleanUtr,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || data.detail || "Failed to submit UTR");
      }

      setUpiStatus("PENDING_VERIFICATION");
      toast.success("UTR submitted! Verifying against banking settlements...");
    } catch (err: any) {
      setUtrError(err.message || "Failed to submit UTR");
      toast.error(err.message || "Failed to submit UTR");
    } finally {
      setIsSubmittingUtr(false);
    }
  };

  // Poll UPI status if pending
  useEffect(() => {
    if (activeRail !== "upi" || !isOpen || !upiOrder || upiStatus !== "PENDING_VERIFICATION") {
      if (upiPollIntervalRef.current) clearInterval(upiPollIntervalRef.current);
      return;
    }

    const checkUpiStatus = async () => {
      try {
        const res = await fetch(`/api/upi/order-status/${upiOrder.order_id}`);
        if (res.ok) {
          const d = await res.json();
          if (d.status === "COMPLETED") {
            if (upiPollIntervalRef.current) clearInterval(upiPollIntervalRef.current);
            setUpiStatus("CONFIRMED");
            toast.success("Payment verified! Your Qronos AI plan is now active.");
            if (onSuccess) onSuccess(d);
          }
        }
      } catch {}
    };

    upiPollIntervalRef.current = setInterval(checkUpiStatus, 2500);
    return () => {
      if (upiPollIntervalRef.current) clearInterval(upiPollIntervalRef.current);
    };
  }, [activeRail, isOpen, upiOrder, upiStatus, onSuccess]);

  // Load orders on open or rail toggle
  useEffect(() => {
    if (isOpen) {
      if (activeRail === "crypto") {
        fetchSolLivePrice();
        createSolOrder();
      } else if (activeRail === "upi") {
        createUpiOrder();
      }
    } else {
      if (solPollIntervalRef.current) clearInterval(solPollIntervalRef.current);
      if (solCountdownIntervalRef.current) clearInterval(solCountdownIntervalRef.current);
      if (upiPollIntervalRef.current) clearInterval(upiPollIntervalRef.current);
      setSolOrder(null);
      setUpiOrder(null);
      setSolVerificationStatus("IDLE");
      setUpiStatus("PAY");
      setEnteredUtr("");
      setUtrError(null);
    }
  }, [isOpen, activeRail, selectedUsd]);

  if (!isOpen || !mounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-2xl animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-xl bg-[#090a10]/98 border border-white/[0.14] rounded-3xl shadow-[0_30px_100px_rgba(0,0,0,0.95)] overflow-hidden text-neutral-100 flex flex-col max-h-[92vh] backdrop-blur-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient Subtle Multi-Glow */}
        <div className="pointer-events-none absolute -top-32 -right-32 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-32 w-72 h-72 bg-white/[0.04] rounded-full blur-3xl" />

        {/* Top Header */}
        <div className="relative px-6 py-5 border-b border-white/[0.08] flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-gradient-to-b from-white/20 via-zinc-400/10 to-transparent border border-white/20 text-white shadow-[0_0_15px_rgba(255,255,255,0.08)]">
              <Zap size={18} className="text-zinc-200 drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  {planName || (isCodingPlan ? `${matchedCodingPlan?.name || "Token"} Plan` : `PAYG Compute Recharge`)}
                </h2>
                <span className="text-[10px] uppercase font-mono px-2.5 py-0.5 rounded-full font-bold border border-white/25 bg-white/[0.06] text-transparent bg-clip-text bg-gradient-to-b from-white via-zinc-200 to-zinc-400 shadow-sm">
                  {isCodingPlan ? `${(matchedCodingPlan?.tokensMillions ?? 0) >= 1000 ? `${((matchedCodingPlan?.tokensMillions ?? 0) / 1000).toFixed(1)}B` : `${matchedCodingPlan?.tokensMillions || 100}M`} Tokens Receiving` : "60% Off Rates"}
                </span>
              </div>
              <p className="text-xs text-zinc-400 font-mono mt-0.5">
                ${selectedUsd}.00 USD <span className="text-zinc-500">· ₹{totalInr.toLocaleString()} INR</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-full text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.1] transition-all flex items-center justify-center cursor-pointer"
            aria-label="Close checkout"
          >
            <X size={15} />
          </button>
        </div>

        {/* Segmented Rail Switcher */}
        <div className="px-6 pt-4">
          <div className="p-1 rounded-2xl bg-white/[0.04] border border-white/[0.08] grid grid-cols-2 gap-1 text-xs font-mono">
            {/* UPI Tab */}
            <button
              type="button"
              onClick={() => setActiveRail("upi")}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl transition-all cursor-pointer ${
                activeRail === "upi"
                  ? "bg-white text-black font-bold shadow-md scale-[1.01]"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              <Smartphone size={14} className={activeRail === "upi" ? "text-zinc-900" : "text-zinc-300"} />
              <span>Domestic UPI (₹)</span>
            </button>

            {/* Solana Pay Tab */}
            <button
              type="button"
              onClick={() => setActiveRail("crypto")}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl transition-all cursor-pointer ${
                activeRail === "crypto"
                  ? "bg-white text-black font-bold shadow-md scale-[1.01]"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              <Wallet size={14} className={activeRail === "crypto" ? "text-purple-700" : "text-purple-400"} />
              <span>Solana Pay ($)</span>
            </button>
          </div>

          {/* Whop 1-Click Checkout Option */}
          {whopCheckoutUrl && (
            <div className="mt-3">
              <a
                href={whopCheckoutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full p-3 rounded-xl border border-orange-500/40 bg-gradient-to-r from-orange-950/40 via-amber-950/30 to-orange-950/20 hover:border-orange-500/80 text-white font-mono text-xs font-bold flex items-center justify-between transition-all group shadow-md shadow-orange-950/20"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-orange-500 to-amber-500 flex items-center justify-center text-white shrink-0">
                    <CreditCard size={15} />
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <span>Cards, Apple/Google Pay, PayPal & Crypto</span>
                      <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30 font-bold">
                        Whop • 1-Click
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-400 font-normal">
                      Instant checkout for {isCodingPlan && matchedCodingPlan ? matchedCodingPlan.name : `$${selectedUsd} PAYG`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-orange-400 font-semibold group-hover:translate-x-0.5 transition-transform text-[11px]">
                  <span>Pay on Whop</span>
                  <ExternalLink size={12} />
                </div>
              </a>
            </div>
          )}
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {/* ================================================================ */}
          {/* TAB 1: DOMESTIC UPI                                              */}
          {/* ================================================================ */}
          {activeRail === "upi" && (
            <div className="space-y-4">
              {isLoadingUpiOrder ? (
                <div className="py-16 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-zinc-400" />
                  <p className="mt-3 text-xs font-mono text-zinc-400">Generating secure UPI dynamic payment QR...</p>
                </div>
              ) : upiOrderError ? (
                <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs text-center space-y-2">
                  <p>{upiOrderError}</p>
                  <Button size="sm" onClick={createUpiOrder} className="bg-red-500/20 text-white hover:bg-red-500/30 font-mono text-xs">
                    Retry Order
                  </Button>
                </div>
              ) : upiStatus === "CONFIRMED" ? (
                <div className="py-10 text-center space-y-3">
                  <div className="h-14 w-14 rounded-2xl bg-white/10 border border-white/20 text-white shadow-[0_0_20px_rgba(255,255,255,0.15)] mx-auto flex items-center justify-center">
                    <CheckCircle2 size={32} />
                  </div>
                  <h3 className="text-lg font-bold text-white">Payment Confirmed!</h3>
                  <p className="text-xs text-zinc-400 font-mono">Your plan has been activated successfully.</p>
                  <Button onClick={onClose} className="bg-white text-black font-mono font-bold text-xs h-10 px-6 mt-2">
                    Enter Workspace
                  </Button>
                </div>
              ) : (
                <>
                  {/* Dynamic QR Box */}
                  <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02] flex flex-col sm:flex-row items-center gap-6 justify-between">
                    <div className="bg-white p-3 rounded-2xl shadow-xl shrink-0">
                      {upiOrder?.upi_uri ? (
                        <QRCodeSVG
                          value={upiOrder.upi_uri}
                          size={140}
                          level="M"
                        />
                      ) : (
                        <div className="w-[140px] h-[140px] flex items-center justify-center bg-zinc-100 rounded-xl">
                          <Loader2 className="animate-spin text-zinc-400" size={24} />
                        </div>
                      )}
                    </div>

                    <div className="space-y-2.5 text-center sm:text-left flex-1 min-w-0">
                      <div>
                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block">Scan with any UPI App</span>
                        <div className="text-2xl font-mono font-extrabold text-white mt-0.5">
                          ₹{totalInr.toLocaleString()} <span className="text-xs text-zinc-400 font-sans font-normal">INR</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 justify-center sm:justify-start">
                        <span className="text-xs font-mono text-zinc-300 bg-white/[0.04] border border-white/10 px-3 py-1.5 rounded-lg inline-flex items-center gap-2">
                          <Smartphone size={13} className="text-zinc-400" />
                          <span>GPay · PhonePe · Paytm · CRED</span>
                        </span>
                      </div>

                      <p className="text-[11px] text-zinc-400 leading-snug">
                        Open your UPI app, scan the dynamic QR code, and submit the 12-digit UTR below.
                      </p>
                    </div>
                  </div>

                  {/* UTR Verification Input */}
                  <form onSubmit={handleSubmitUtr} className="space-y-2 pt-1">
                    <label className="text-xs font-mono text-zinc-300 block">
                      Enter 12-Digit Bank Reference (UTR):
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        maxLength={12}
                        value={enteredUtr}
                        onChange={(e) => {
                          setEnteredUtr(e.target.value.replace(/\D/g, ""));
                          setUtrError(null);
                        }}
                        placeholder="e.g. 428910482910"
                        className="flex-1 bg-black/80 border border-white/15 focus:border-white/40 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white placeholder:text-zinc-600 focus:outline-none"
                      />
                      <Button
                        type="submit"
                        disabled={isSubmittingUtr || enteredUtr.length !== 12}
                        className="h-10 px-4 rounded-xl bg-white text-black hover:bg-zinc-200 font-mono font-bold text-xs cursor-pointer shrink-0 disabled:opacity-40"
                      >
                        {isSubmittingUtr ? <Loader2 size={13} className="animate-spin" /> : "Verify & Activate"}
                      </Button>
                    </div>
                    {utrError && <p className="text-[11px] text-red-400 font-mono">{utrError}</p>}
                    {upiStatus === "PENDING_VERIFICATION" && (
                      <p className="text-[11px] text-amber-300 font-mono animate-pulse flex items-center gap-1.5 pt-1">
                        <Loader2 size={12} className="animate-spin" />
                        <span>Verifying UTR with banking gateway...</span>
                      </p>
                    )}
                  </form>
                </>
              )}
            </div>
          )}

          {/* ================================================================ */}
          {/* TAB 2: SOLANA PAY (CRYPTO)                                       */}
          {/* ================================================================ */}
          {activeRail === "crypto" && (
            <div className="space-y-4">
              {isLoadingSolOrder ? (
                <div className="py-16 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-zinc-400" />
                  <p className="mt-3 text-xs font-mono text-zinc-400">Connecting to Solana Mainnet-Beta RPC...</p>
                </div>
              ) : solOrderError ? (
                <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs text-center space-y-2">
                  <p>{solOrderError}</p>
                  <Button size="sm" onClick={createSolOrder} className="bg-red-500/20 text-white hover:bg-red-500/30 font-mono text-xs">
                    Retry Order
                  </Button>
                </div>
              ) : solVerificationStatus === "CONFIRMED" ? (
                <div className="py-10 text-center space-y-3">
                  <div className="h-14 w-14 rounded-2xl bg-white/10 border border-white/20 text-white shadow-[0_0_20px_rgba(255,255,255,0.15)] mx-auto flex items-center justify-center">
                    <CheckCircle2 size={32} />
                  </div>
                  <h3 className="text-lg font-bold text-white">Payment Confirmed on Solana!</h3>
                  <p className="text-xs text-zinc-400 font-mono truncate max-w-sm mx-auto">
                    Tx: {solConfirmedSignature?.slice(0, 16)}...
                  </p>
                  <Button onClick={onClose} className="bg-white text-black font-mono font-bold text-xs h-10 px-6 mt-2">
                    Enter Workspace
                  </Button>
                </div>
              ) : (
                <>
                  {/* Solana Pay QR Container */}
                  <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02] flex flex-col sm:flex-row items-center gap-6 justify-between">
                    <div className="bg-white p-3 rounded-2xl shadow-xl shrink-0">
                      <QRCodeSVG
                        value={solOrder?.solana_pay_url || "solana:"}
                        size={140}
                        level="M"
                      />
                    </div>

                    <div className="space-y-2 text-center sm:text-left flex-1 min-w-0">
                      <div>
                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block">Solana Pay · Direct Scan</span>
                        <div className="text-2xl font-mono font-extrabold text-white mt-0.5">
                          {solOrder?.sol_amount?.toFixed(4) || (selectedUsd / (solLivePrice || 145)).toFixed(4)} <span className="text-xs text-purple-400 font-sans font-bold">SOL</span>
                        </div>
                      </div>

                      <p className="text-[11px] font-mono text-zinc-400">
                        Oracle: 1 SOL ≈ ${solLivePrice?.toFixed(2) || "145.00"} USD
                      </p>

                      <div className="pt-2 flex items-center gap-2 justify-center sm:justify-start">
                        <StarButton
                          type="button"
                          onClick={handlePhantomPay}
                          disabled={isPhantomSending}
                          lightColor="#C084FC"
                          backgroundColor="#0f0c1b"
                          starColor="rgba(192, 132, 252, 0.4)"
                          lightWidth={130}
                          duration={3.2}
                          className="h-10 px-5 rounded-full border border-purple-400/40 hover:border-purple-300 text-white font-mono text-xs font-bold shadow-[0_0_25px_rgba(168,85,247,0.35)] cursor-pointer"
                        >
                          <span className="relative z-10 flex items-center gap-2">
                            {isPhantomSending ? <Loader2 size={13} className="animate-spin text-purple-300" /> : <Wallet size={13} className="text-purple-300" />}
                            <span>1-Click Phantom Pay</span>
                            <span className="text-purple-300 font-bold ml-0.5">»</span>
                          </span>
                        </StarButton>
                      </div>
                    </div>
                  </div>

                  {phantomError && <p className="text-[11px] text-red-400 font-mono text-center">{phantomError}</p>}

                  {/* Polling Notice */}
                  <div className="flex items-center justify-center gap-2 text-[11px] text-zinc-400 pt-1 font-mono">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                    </span>
                    <span>Monitoring Solana Mainnet-Beta confirmations...</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer Guarantee Strip */}
        <div className="px-6 py-3.5 bg-black/60 border-t border-white/[0.08] flex items-center justify-between text-[10px] font-mono text-zinc-500">
          <span className="flex items-center gap-1.5">
            <Lock size={11} className="text-zinc-400" />
            <span>256-bit Encrypted Checkout</span>
          </span>
          <span>Instant Token Allocation</span>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
export default CheckoutModal;
