import React, { useState, useMemo } from "react";
import {
  CreditCard,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  RefreshCw,
  Search,
  Copy,
  Check,
  Coins,
  DollarSign,
  ArrowUpRight,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  Receipt,
  User,
  Mail,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Link } from "wouter";

export interface PaymentItem {
  orderId: string;
  paymentId: string | null;
  userId: number | null;
  userEmail: string | null;
  productId: string;
  planName: string;
  amountUsd: number;
  credits: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export function PaymentsWorkspace({ adminMode = false }: { adminMode?: boolean }) {
  const utils = trpc.useUtils();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "COMPLETED" | "PENDING" | "FAILED">("ALL");

  // Queries
  const devQuery = trpc.developer.dodoPayments.useQuery(undefined, {
    enabled: !adminMode,
    refetchInterval: 10_000,
  });

  const adminQuery = trpc.admin.dodoPayments.useQuery(undefined, {
    enabled: adminMode,
    refetchInterval: 10_000,
  });

  const activeQuery = adminMode ? adminQuery : devQuery;

  // Sync mutations
  const devSync = trpc.developer.syncDodoPayments.useMutation({
    onSuccess: () => {
      utils.developer.dodoPayments.invalidate();
      utils.developer.wallet.invalidate();
      toast.success("Payments synchronized with gateway");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to sync payments");
    },
  });

  const adminSync = trpc.admin.syncDodoPayments.useMutation({
    onSuccess: (data) => {
      utils.admin.dodoPayments.invalidate();
      toast.success(`Gateway synchronized (${data.synced} payment records inspected)`);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to sync payments");
    },
  });

  const isSyncing = adminMode ? adminSync.isPending : devSync.isPending;

  const handleRefresh = () => {
    if (adminMode) {
      adminSync.mutate();
    } else {
      devSync.mutate();
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const rawPayments = (activeQuery.data ?? []) as PaymentItem[];

  // Filtered payments
  const filteredPayments = useMemo(() => {
    return rawPayments.filter((p) => {
      // Status filter
      if (statusFilter !== "ALL") {
        const normalized = p.status.toUpperCase();
        if (statusFilter === "COMPLETED" && normalized !== "COMPLETED" && normalized !== "SUCCEEDED") {
          return false;
        }
        if (statusFilter === "PENDING" && normalized !== "PENDING" && normalized !== "PROCESSING") {
          return false;
        }
        if (statusFilter === "FAILED" && normalized !== "FAILED" && normalized !== "CANCELLED") {
          return false;
        }
      }

      // Search term filter
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        p.orderId.toLowerCase().includes(term) ||
        (p.paymentId && p.paymentId.toLowerCase().includes(term)) ||
        p.planName.toLowerCase().includes(term) ||
        (p.userEmail && p.userEmail.toLowerCase().includes(term)) ||
        (p.userId && String(p.userId).includes(term))
      );
    });
  }, [rawPayments, statusFilter, searchTerm]);

  // Summary metrics
  const metrics = useMemo(() => {
    let totalSpend = 0;
    let totalCredits = 0;
    let completedCount = 0;
    let pendingCount = 0;

    for (const p of rawPayments) {
      const isCompleted = p.status === "COMPLETED" || p.status === "SUCCEEDED";
      if (isCompleted) {
        totalSpend += p.amountUsd;
        totalCredits += p.credits;
        completedCount++;
      } else if (p.status === "PENDING" || p.status === "PROCESSING") {
        pendingCount++;
      }
    }

    return { totalSpend, totalCredits, completedCount, pendingCount };
  }, [rawPayments]);

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return isoStr;
    }
  };

  const renderStatusBadge = (statusStr: string) => {
    const s = statusStr.toUpperCase();
    if (s === "COMPLETED" || s === "SUCCEEDED") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#befe6c]/15 text-[#befe6c] border border-[#befe6c]/30">
          <CheckCircle2 size={13} className="shrink-0" />
          <span>Completed</span>
        </span>
      );
    }
    if (s === "PENDING" || s === "PROCESSING") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
          <Clock size={13} className="shrink-0 animate-pulse" />
          <span>Pending</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/30">
        <XCircle size={13} className="shrink-0" />
        <span>{s === "CANCELLED" ? "Cancelled" : "Failed"}</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#befe6c]">
              {adminMode ? "Platform Billing" : "Payment Records"}
            </span>
            <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-white/10 text-white/80">
              Card Payments
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
            {adminMode ? "Card Payment Settlements" : "Payment History"}
          </h1>
          <p className="mt-1 text-xs text-[#9fa0af]">
            {adminMode
              ? "All recent card checkout sessions, webhook fulfillment records, and credit issuances."
              : "Review your recent card purchase receipts, checkout statuses, and credited balance."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isSyncing || activeQuery.isFetching}
            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
          >
            <RefreshCw
              size={14}
              className={`mr-1.5 ${isSyncing || activeQuery.isFetching ? "animate-spin" : ""}`}
            />
            {isSyncing ? "Syncing..." : "Refresh"}
          </Button>

          {!adminMode && (
            <Link href="/dashboard/pricing">
              <Button size="sm" className="bg-[#befe6c] text-[#0d1406] hover:bg-[#cbf781] font-semibold">
                <Sparkles size={14} className="mr-1.5" />
                Buy Credits
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-[#121215] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#9fa0af]">
              {adminMode ? "Total Card Volume" : "Total Card Spend"}
            </span>
            <DollarSign size={15} className="text-[#befe6c]" />
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-white">
            ${metrics.totalSpend.toFixed(2)}
          </p>
          <p className="mt-0.5 text-[11px] text-[#6f7181]">Completed USD transactions</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#121215] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#9fa0af]">
              {adminMode ? "Credits Provisioned" : "Credits Received"}
            </span>
            <Coins size={15} className="text-[#c8ff74]" />
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-[#c8ff74]">
            {metrics.totalCredits.toLocaleString()}
          </p>
          <p className="mt-0.5 text-[11px] text-[#6f7181]">Via card payments</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#121215] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#9fa0af]">Completed Orders</span>
            <CheckCircle2 size={15} className="text-emerald-400" />
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-white">{metrics.completedCount}</p>
          <p className="mt-0.5 text-[11px] text-[#6f7181]">Fulfilled & active</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#121215] p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#9fa0af]">Pending Sessions</span>
            <Clock size={15} className="text-amber-400" />
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-white">{metrics.pendingCount}</p>
          <p className="mt-0.5 text-[11px] text-[#6f7181]">Awaiting completion</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#0e0e11] p-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(["ALL", "COMPLETED", "PENDING", "FAILED"] as const).map((filterKey) => (
            <button
              key={filterKey}
              type="button"
              onClick={() => setStatusFilter(filterKey)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                statusFilter === filterKey
                  ? "bg-[#befe6c]/15 text-[#befe6c] border border-[#befe6c]/30"
                  : "text-[#8e90a0] hover:text-white hover:bg-white/5 border border-transparent"
              }`}
            >
              {filterKey === "ALL"
                ? "All Transactions"
                : filterKey.charAt(0) + filterKey.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <div className="relative min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6e7080]" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={adminMode ? "Search ID, email, plan..." : "Search orders or plan..."}
            className="h-9 pl-9 text-xs bg-[#16161a] border-white/10 text-white placeholder:text-[#6e7080]"
          />
        </div>
      </div>

      {/* Transactions Table / List */}
      <div className="rounded-xl border border-white/10 bg-[#09090c] overflow-hidden">
        {activeQuery.isLoading ? (
          <div className="py-16 text-center">
            <RefreshCw className="mx-auto h-7 w-7 animate-spin text-[#befe6c]" />
            <p className="mt-3 text-xs text-[#9fa0af]">Loading payment records...</p>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-[#141419]">
              <Receipt size={22} className="text-[#8e90a0]" />
            </div>
            <h3 className="mt-4 text-sm font-bold text-white">No payment transactions found</h3>
            <p className="mt-1 text-xs text-[#8e90a0] max-w-sm mx-auto">
              {searchTerm || statusFilter !== "ALL"
                ? "No records matched your search or status filter criteria."
                : adminMode
                ? "No card payments have been recorded across the platform yet."
                : "You haven't made any card payments yet. Pick a credit plan to fuel your high-throughput models."}
            </p>
            {!adminMode && !searchTerm && statusFilter === "ALL" && (
              <div className="mt-4">
                <Link href="/dashboard/pricing">
                  <Button size="sm" className="bg-[#befe6c] text-[#0d1406] hover:bg-[#cbf781] font-semibold">
                    Explore Pricing Plans
                  </Button>
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-[#121216] text-[#8e90a0] font-semibold">
                  <th className="py-3 px-4">Plan & Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Credits Added</th>
                  <th className="py-3 px-4">Date & Time</th>
                  {adminMode && <th className="py-3 px-4">User</th>}
                  <th className="py-3 px-4 text-right">Order / Payment ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-[#d7d8e2]">
                {filteredPayments.map((payment) => {
                  return (
                    <tr
                      key={payment.orderId}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      {/* Plan & Amount */}
                      <td className="py-3.5 px-4 font-medium text-white">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                            <CreditCard size={15} className="text-[#befe6c]" />
                          </div>
                          <div>
                            <div className="font-semibold text-white flex items-center gap-1.5">
                              <span>{payment.planName || "Card Plan"}</span>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/10 text-[#d8d9e6]">
                                ${payment.amountUsd.toFixed(2)}
                              </span>
                            </div>
                            <span className="text-[11px] text-[#787a8b] font-mono">
                              Card Checkout
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {renderStatusBadge(payment.status)}
                      </td>

                      {/* Credits */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 font-mono font-semibold text-[#c8ff74]">
                          +{payment.credits.toLocaleString()}
                        </span>
                      </td>

                      {/* Date & Time */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-[#a7a8b6]">
                        {formatDate(payment.createdAt)}
                      </td>

                      {/* User (Admin only) */}
                      {adminMode && (
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col">
                            <span className="text-white font-medium truncate max-w-[170px]">
                              {payment.userEmail || `User #${payment.userId}`}
                            </span>
                            {payment.userId && (
                              <span className="text-[10px] font-mono text-[#787a8b]">
                                ID: {payment.userId}
                              </span>
                            )}
                          </div>
                        </td>
                      )}

                      {/* Order / Payment ID */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <code className="text-[11px] font-mono text-[#989aa8] bg-black/40 px-2 py-0.5 rounded border border-white/8">
                            {payment.paymentId
                              ? payment.paymentId.slice(0, 14) + "..."
                              : payment.orderId.slice(0, 16) + "..."}
                          </code>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(
                                payment.paymentId || payment.orderId,
                                payment.paymentId ? "Payment ID" : "Order ID"
                              )
                            }
                            className="p-1 rounded text-[#787a8b] hover:text-white hover:bg-white/10 transition-colors"
                            title="Copy ID"
                          >
                            {copiedId === (payment.paymentId || payment.orderId) ? (
                              <Check size={13} className="text-[#befe6c]" />
                            ) : (
                              <Copy size={13} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
