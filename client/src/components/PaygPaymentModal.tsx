import React, { useState } from "react";
import {
  Smartphone,
  Wallet,
  Zap,
  ShieldCheck,
  X,
  ArrowRight,
  Check,
  Sparkles,
  Percent,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface PaygPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPaymentMethod: (method: "upi" | "crypto", amountUsd: number) => void;
  initialAmountUsd?: number;
}

const PRESET_AMOUNTS = [
  { amount: 10, label: "$10", popular: false },
  { amount: 25, label: "$25", popular: true },
  { amount: 50, label: "$50", popular: false },
  { amount: 100, label: "$100", popular: false },
  { amount: 200, label: "$200", popular: false },
];

export function PaygPaymentModal({
  isOpen,
  onClose,
  onSelectPaymentMethod,
  initialAmountUsd = 25,
}: PaygPaymentModalProps) {
  const [selectedAmount, setSelectedAmount] = useState<number>(initialAmountUsd);
  const [selectedMethod, setSelectedMethod] = useState<"upi" | "crypto">("upi");

  const creditGrant = selectedAmount; // Direct 1:1 PAYG compute balance

  const handleProceed = (method?: "upi" | "crypto") => {
    const targetMethod = method || selectedMethod;
    onSelectPaymentMethod(targetMethod, selectedAmount);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl w-full bg-[#0d0d12] border border-white/10 text-white p-0 overflow-hidden shadow-2xl rounded-2xl z-50">
        {/* Modal Header Banner */}
        <div className="relative p-6 sm:p-7 border-b border-white/10 bg-gradient-to-br from-zinc-900/60 via-black to-black">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-white/[0.08] text-zinc-200 border border-white/20">
              <Sparkles className="w-3 h-3 text-zinc-300" />
              50% Model Discount Active
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400 font-medium">
              <Zap className="w-3 h-3 text-zinc-300" /> Pay-As-You-Go
            </span>
          </div>

          <DialogTitle className="text-2xl font-bold tracking-tight text-white flex items-center justify-between">
            Deposit Developer Compute Balance
          </DialogTitle>
          <DialogDescription className="text-sm text-zinc-400 mt-1.5 leading-relaxed">
            Choose your payment rail to deposit funds. Zero platform markup, transparent per-token nanodollar settlement, and funds never expire.
          </DialogDescription>
        </div>

        <div className="p-6 space-y-6">
          {/* Amount Selection */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                Deposit Amount
              </label>
              <span className="text-xs text-zinc-300 font-mono flex items-center gap-1">
                Adds ${creditGrant}.00 Usable Balance
              </span>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {PRESET_AMOUNTS.map((preset) => (
                <button
                  key={preset.amount}
                  type="button"
                  onClick={() => setSelectedAmount(preset.amount)}
                  className={`relative py-2.5 px-2 rounded-xl text-center font-medium transition-all text-sm cursor-pointer border ${
                    selectedAmount === preset.amount
                      ? "bg-gradient-to-b from-white via-zinc-200 to-zinc-400 text-black border-white shadow-lg shadow-white/10 font-bold"
                      : "bg-white/5 hover:bg-white/10 text-zinc-300 border-white/10"
                  }`}
                >
                  {preset.popular && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.2 text-[9px] font-bold uppercase rounded-full bg-white text-black shadow-sm">
                      Best
                    </span>
                  )}
                  {preset.label}
                  <span className="block text-[10px] font-normal text-zinc-400 mt-0.5">
                    ${preset.amount}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-3 p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between text-xs">
              <span className="text-zinc-300">
                Deposit <strong className="text-white">${selectedAmount}.00</strong>
              </span>
              <span className="text-zinc-200 font-mono font-bold flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-zinc-300" />
                Credits ${creditGrant}.00 PAYG Balance
              </span>
            </div>
          </div>

          {/* Payment Rail Options */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-300 block mb-3">
              Choose Payment Method
            </label>

            <div className="space-y-3">
              {/* Option 1: Solana Pay */}
              <button
                type="button"
                onClick={() => {
                  setSelectedMethod("crypto");
                  handleProceed("crypto");
                }}
                className={`w-full p-4 rounded-xl text-left border transition-all flex items-center justify-between gap-4 cursor-pointer group ${
                  selectedMethod === "crypto"
                    ? "bg-purple-950/30 border-purple-500/50 shadow-lg shadow-purple-950/50 ring-1 ring-purple-500/30"
                    : "bg-white/[0.03] hover:bg-white/[0.06] border-white/10"
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-white shrink-0 shadow-md">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-base">Solana Pay</span>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        Crypto • Instant
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5 leading-snug">
                      Decentralized on-chain transfer via SOL or Phantom/Solflare with immediate ledger settlement.
                    </p>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-purple-400 group-hover:translate-x-0.5 transition-transform">
                  <span>Pay with SOL</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              </button>

              {/* Option 2: Domestic UPI */}
              <button
                type="button"
                onClick={() => {
                  setSelectedMethod("upi");
                  handleProceed("upi");
                }}
                className={`w-full p-4 rounded-xl text-left border transition-all flex items-center justify-between gap-4 cursor-pointer group ${
                  selectedMethod === "upi"
                    ? "bg-zinc-900/60 border-white/30 shadow-lg shadow-white/5 ring-1 ring-white/20"
                    : "bg-white/[0.03] hover:bg-white/[0.06] border-white/10"
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-zinc-700 to-zinc-500 flex items-center justify-center text-white shrink-0 shadow-md">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-base">Domestic UPI</span>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-white/[0.08] text-zinc-200 border border-white/15">
                        Zero Fees • ₹ INR
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5 leading-snug">
                      Instant QR code transfer via Google Pay, PhonePe, Paytm, or BHIM with UTR verification.
                    </p>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-zinc-300 group-hover:translate-x-0.5 transition-transform">
                  <span>Pay with UPI</span>
                  <ArrowRight className="w-4 h-4" />
                </div>
              </button>
            </div>
          </div>

          {/* Footer Security Badge */}
          <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs text-zinc-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-zinc-300" />
              Instant automated ledger settlement
            </span>
            <span className="text-zinc-500">Credits never expire</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
