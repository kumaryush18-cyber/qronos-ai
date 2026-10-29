import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Wallet,
  Zap,
  Clock,
  AlertCircle,
  Coins,
  ChevronDown,
  ChevronUp,
  Smartphone,
  IndianRupee,
  Check,
  XCircle,
  Filter,
  Users,
  CreditCard,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CheckoutModal } from "@/components/CheckoutModal";
import { useAuth } from "@/_core/hooks/useAuth";
import { getStoredSessionToken } from "@/lib/sessionToken";
import { toast } from "sonner";
import { StarButton } from "@/components/StarButton";

interface TransactionItem {
  signature: string;
  slot: number;
  timestamp: number;
  date: string;
  status: "CONFIRMED" | "FAILED";
  type: string;
  source: string;
  amountSol: number;
  amountFormatted: string;
  creditsNanos: number;
  creditsFormatted: string;
  from: string;
  to: string;
  feeLamports: number;
  feeSol: number;
  description: string;
  explorerUrl: string;
  userEmail?: string | null;
  userName?: string | null;
  matchedOrder?: {
    orderId: string;
    userId: number;
    userEmail?: string | null;
    userName?: string | null;
    status: string;
  } | null;
}

interface SolanaPaidUser {
  orderId: string;
  userId: number | null;
  userEmail: string | null;
  userName: string | null;
  solAmount: number;
  solFormatted: string;
  usdAmount: number;
  usdFormatted: string;
  credits: number;
  creditsFormatted: string;
  signature: string | null;
  explorerUrl: string | null;
  timestamp: string;
  status: string;
}

interface TransactionsApiResponse {
  success: boolean;
  network: string;
  provider_source: string;
  merchant_wallet: string;
  total_transactions: number;
  total_volume_sol: number;
  transactions: TransactionItem[];
  error?: string;
}

interface UPIAdminOrder {
  orderId: string;
  userId: number | null;
  userEmail?: string | null;
  userName?: string | null;
  tierId: string;
  amountInr: number;
  credits: number;
  creditsNanos: number;
  upiId: string;
  merchantName: string;
  upiUri: string;
  status: "PENDING_PAYMENT" | "PENDING_VERIFICATION" | "COMPLETED" | "REJECTED" | "EXPIRED";
  utr: string | null;
  submittedAt: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  rejectionReason: string | null;
  createdAt: string;
  expiresAt: string;
}

interface WhopOrder {
  id: number;
  orderId: string;
  paymentId: string | null;
  userId: number | null;
  userEmail: string | null;
  amountUsd: number;
  productName: string;
  productType: string;
  tokens: number;
  status: string;
  processedAt: string;
}

export interface TransactionsWorkspaceProps {
  adminMode?: boolean;
}

export function TransactionsWorkspace({ adminMode = false }: TransactionsWorkspaceProps) {
  const { user } = useAuth();
  // STRICT: User dashboard (adminMode=false) only ever shows the logged-in user's own orders.
  // Full platform-wide settlements are only visible when explicitly opened in the Admin panel (adminMode=true).
  const isAdmin = adminMode === true;

  const [activeRail, setActiveRail] = useState<"upi" | "solana" | "whop">("upi");

  // Whop State
  const [whopOrders, setWhopOrders] = useState<WhopOrder[]>([]);
  const [whopLoading, setWhopLoading] = useState(false);
  const [whopRefreshing, setWhopRefreshing] = useState(false);
  const [whopSearchQuery, setWhopSearchQuery] = useState("");
  const [whopStats, setWhopStats] = useState({
    total_orders: 0,
    total_volume_usd: 0,
    total_tokens_credited: 0,
  });

  // Solana State
  const [data, setData] = useState<TransactionsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "CONFIRMED" | "FAILED">("ALL");
  const [copiedSignature, setCopiedSignature] = useState<string | null>(null);
  const [expandedTx, setExpandedTx] = useState<string | null>(null);

  const [solanaPaidUsers, setSolanaPaidUsers] = useState<SolanaPaidUser[]>([]);
  const [solanaPaidStats, setSolanaPaidStats] = useState<{
    total_paid_users: number;
    total_transactions: number;
    total_volume_sol: number;
    total_volume_usd: number;
    total_credits: number;
  } | null>(null);
  const [solanaViewMode, setSolanaViewMode] = useState<"paid_users" | "all_feed">("paid_users");

  // UPI State
  const [upiOrders, setUpiOrders] = useState<UPIAdminOrder[]>([]);
  const [upiLoading, setUpiLoading] = useState(false);
  const [upiRefreshing, setUpiRefreshing] = useState(false);
  const [upiFilter, setUpiFilter] = useState<"ALL" | "PENDING_VERIFICATION" | "COMPLETED" | "REJECTED">("ALL");
  const [upiSearchQuery, setUpiSearchQuery] = useState("");
  const [approvingOrderId, setApprovingOrderId] = useState<string | null>(null);
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);
  const [purgingPending, setPurgingPending] = useState(false);

  // Modal State
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  // Fetch Solana transactions
  const fetchTransactions = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    try {
      const res = await fetch("/api/solana-pay/transactions?limit=30");
      if (!res.ok) {
        throw new Error(`Failed to load transactions (HTTP ${res.status})`);
      }
      const json: TransactionsApiResponse = await res.json();
      if (!json.success && json.error) {
        throw new Error(json.error);
      }
      setData(json);
      setError(null);
      if (isManualRefresh) {
        toast.success("Solana transactions updated from Helius RPC");
      }
    } catch (err: any) {
      setError(err.message || "Unable to retrieve transaction history");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch Solana Paid Users
  const fetchSolanaPaidUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/solana-pay/paid-users");
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setSolanaPaidUsers(json.payments || []);
          setSolanaPaidStats({
            total_paid_users: json.total_paid_users || 0,
            total_transactions: json.total_transactions || 0,
            total_volume_sol: json.total_volume_sol || 0,
            total_volume_usd: json.total_volume_usd || 0,
            total_credits: json.total_credits || 0,
          });
        }
      }
    } catch (err) {
      console.warn("Error fetching Solana paid users:", err);
    }
  }, []);

  // Fetch UPI Orders
  const fetchUpiOrders = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setUpiRefreshing(true);
    else setUpiLoading(true);

    try {
      const endpoint = isAdmin ? "/api/admin/upi/orders" : "/api/upi/my-orders";
      const token = getStoredSessionToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(endpoint, { credentials: "include", headers });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setUpiOrders([]);
          return;
        }
        throw new Error(`Failed to load UPI orders (HTTP ${res.status})`);
      }
      const json = await res.json();
      setUpiOrders(json.orders || []);
      if (isManualRefresh) {
        toast.success(isAdmin ? "Settlement queue updated" : "Your UPI orders updated");
      }
    } catch (err: any) {
      setUpiOrders([]);
    } finally {
      setUpiLoading(false);
      setUpiRefreshing(false);
    }
  }, [isAdmin]);

  // Fetch Whop Orders
  const fetchWhopOrders = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setWhopRefreshing(true);
    else setWhopLoading(true);

    try {
      const endpoint = isAdmin ? "/api/admin/whop/orders" : "/api/whop/my-orders";
      const token = getStoredSessionToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(endpoint, { credentials: "include", headers });
      if (res.ok) {
        const json = await res.json();
        setWhopOrders(json.orders || []);
        if (json.total_orders !== undefined) {
          setWhopStats({
            total_orders: json.total_orders || 0,
            total_volume_usd: json.total_volume_usd || 0,
            total_tokens_credited: json.total_tokens_credited || 0,
          });
        }
        if (isManualRefresh) {
          toast.success("Whop card settlements synced");
        }
      }
    } catch (err) {
      console.warn("Error fetching Whop orders:", err);
    } finally {
      setWhopLoading(false);
      setWhopRefreshing(false);
    }
  }, [isAdmin]);

  const filteredWhopOrders = useMemo(() => {
    const baseList = isAdmin
      ? whopOrders
      : whopOrders.filter((o) => o.userId === user?.id || (user?.email && o.userEmail === user?.email));

    return baseList.filter((order) => {
      if (!whopSearchQuery.trim()) return true;
      const q = whopSearchQuery.toLowerCase();
      return (
        (order.orderId && order.orderId.toLowerCase().includes(q)) ||
        (order.userEmail && order.userEmail.toLowerCase().includes(q)) ||
        (order.productName && order.productName.toLowerCase().includes(q))
      );
    });
  }, [whopOrders, whopSearchQuery, isAdmin, user]);

  useEffect(() => {
    fetchTransactions();
    fetchSolanaPaidUsers();
    fetchUpiOrders();
    fetchWhopOrders();

    const interval = setInterval(() => {
      fetchTransactions(false);
      fetchSolanaPaidUsers();
      fetchUpiOrders(false);
      fetchWhopOrders(false);
    }, 20000);
    return () => clearInterval(interval);
  }, [fetchTransactions, fetchSolanaPaidUsers, fetchUpiOrders, fetchWhopOrders]);

  const handleCopy = async (text: string, id: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSignature(id);
      toast.success(`${label} copied`);
      setTimeout(() => setCopiedSignature(null), 1800);
    } catch {
      toast.error("Failed to copy");
    }
  };

  // UPI Approve
  const handleApproveUpiOrder = async (orderId: string) => {
    if (!isAdmin) {
      toast.error("Unauthorized: Only verified administrators can approve orders.");
      return;
    }
    setApprovingOrderId(orderId);
    try {
      const token = getStoredSessionToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/admin/upi/approve", {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ order_id: orderId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Approval failed");
      }
      toast.success(`Order ${orderId} approved! Credits allocated.`);
      fetchUpiOrders(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to approve order");
    } finally {
      setApprovingOrderId(null);
    }
  };

  // UPI Reject
  const handleRejectUpiOrder = async (orderId: string) => {
    if (!isAdmin) {
      toast.error("Unauthorized");
      return;
    }
    const reason = prompt("Enter rejection reason (visible to user):", "UTR not found in bank statement");
    if (!reason) return;

    setRejectingOrderId(orderId);
    try {
      const token = getStoredSessionToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/admin/upi/reject", {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({ order_id: orderId, reason }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Rejection failed");
      }
      toast.info(`Order ${orderId} marked as rejected.`);
      fetchUpiOrders(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to reject order");
    } finally {
      setRejectingOrderId(null);
    }
  };

  // Manual purge for abandoned pending payment logs (Admin only)
  const handlePurgePending = async () => {
    if (!confirm("Are you sure you want to purge all abandoned pending payment checkout logs?")) return;
    setPurgingPending(true);
    try {
      const token = getStoredSessionToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch("/api/admin/upi/cleanup-pending", { method: "POST", headers, credentials: "include" });
      const json = await res.json();
      if (json.success) {
        toast.success(`Purged ${json.upiDeleted} pending UPI logs & ${json.solanaDeleted} pending Solana logs`);
        fetchUpiOrders(false);
        fetchTransactions(false);
        fetchSolanaPaidUsers();
      } else {
        toast.error(json.error || "Failed to purge pending logs");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to purge pending logs");
    } finally {
      setPurgingPending(false);
    }
  };

  // Filtered Solana Transactions
  const filteredTransactions = useMemo(() => {
    if (!data?.transactions) return [];
    return data.transactions.filter((tx) => {
      // In user dashboard mode, strictly only show transactions belonging to the current user!
      if (!isAdmin) {
        const matchesUser =
          (user?.id && tx.matchedOrder?.userId === user.id) ||
          (user?.email && (tx.userEmail === user.email || tx.matchedOrder?.userEmail === user.email));
        if (!matchesUser) return false;
      }
      if (statusFilter !== "ALL" && tx.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesSig = tx.signature.toLowerCase().includes(q);
        const matchesFrom = tx.from.toLowerCase().includes(q);
        const matchesDesc = tx.description.toLowerCase().includes(q);
        const matchesAmount = tx.amountFormatted.toLowerCase().includes(q);
        const matchesEmail = (tx.userEmail || tx.matchedOrder?.userEmail || "").toLowerCase().includes(q);
        const matchesName = (tx.userName || tx.matchedOrder?.userName || "").toLowerCase().includes(q);
        return matchesSig || matchesFrom || matchesDesc || matchesAmount || matchesEmail || matchesName;
      }
      return true;
    });
  }, [data?.transactions, statusFilter, searchQuery, isAdmin, user]);

  // Filtered Solana Paid Users
  const filteredPaidUsers = useMemo(() => {
    if (!solanaPaidUsers) return [];
    const baseList = isAdmin
      ? solanaPaidUsers
      : solanaPaidUsers.filter(p => p.userId === user?.id || (user?.email && p.userEmail === user?.email));

    if (!searchQuery.trim()) return baseList;
    const q = searchQuery.toLowerCase().trim();
    return baseList.filter((p) => {
      const matchesEmail = (p.userEmail || "").toLowerCase().includes(q);
      const matchesName = (p.userName || "").toLowerCase().includes(q);
      const matchesOrderId = (p.orderId || "").toLowerCase().includes(q);
      const matchesSig = (p.signature || "").toLowerCase().includes(q);
      const matchesUser = String(p.userId || "").toLowerCase().includes(q);
      const matchesSol = String(p.solAmount).includes(q) || p.solFormatted.toLowerCase().includes(q);
      return matchesEmail || matchesName || matchesOrderId || matchesSig || matchesUser || matchesSol;
    });
  }, [solanaPaidUsers, searchQuery, isAdmin, user]);

  // Filtered UPI orders
  const filteredUpiOrders = useMemo(() => {
    const baseList = isAdmin
      ? upiOrders
      : upiOrders.filter((o) => o.userId === user?.id || (user?.email && o.userEmail === user?.email));

    return baseList.filter((order) => {
      // Exclude abandoned PENDING_PAYMENT checkout logs unless explicitly filtered
      if (order.status === "PENDING_PAYMENT" && upiFilter !== "PENDING_PAYMENT") return false;
      if (upiFilter !== "ALL" && order.status !== upiFilter) return false;
      if (upiSearchQuery.trim()) {
        const q = upiSearchQuery.toLowerCase().trim();
        const matchesId = order.orderId.toLowerCase().includes(q);
        const matchesUtr = (order.utr || "").toLowerCase().includes(q);
        const matchesUser = String(order.userId || "").toLowerCase().includes(q);
        const matchesAmount = String(order.amountInr).includes(q);
        const matchesEmail = (order.userEmail || "").toLowerCase().includes(q);
        const matchesName = (order.userName || "").toLowerCase().includes(q);
        return matchesId || matchesUtr || matchesUser || matchesAmount || matchesEmail || matchesName;
      }
      return true;
    });
  }, [upiOrders, upiFilter, upiSearchQuery, isAdmin, user]);

  const totalVolume = data?.total_volume_sol ?? 0;
  const merchantWallet = data?.merchant_wallet ?? "CUiXiA54MjUCxF1acboThD8R2CwLsqfDidiT7RWJsD7w";
  const totalUpiPending = upiOrders.filter((o) => o.status === "PENDING_VERIFICATION").length;
  const totalUpiCompleted = upiOrders.filter((o) => o.status === "COMPLETED").length;
  const totalUpiVolumeInr = upiOrders
    .filter((o) => o.status === "COMPLETED")
    .reduce((acc, curr) => acc + (curr.amountInr || 0), 0);

  return (
    <div className="space-y-6">
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => {
          setIsCheckoutOpen(false);
          fetchTransactions();
          fetchUpiOrders();
        }}
        initialRail={activeRail === "upi" ? "upi" : "crypto"}
        onSuccess={() => {
          fetchTransactions();
          fetchUpiOrders();
        }}
      />

      {/* 1. Header & Financial Inflow Hero */}
      <section
        style={{
          backgroundColor: "oklch(0.14 0 0)",
          borderColor: "oklch(0.26 0 0)",
          boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
        className="rounded-3xl border p-6 sm:p-8 shadow-2xl relative overflow-hidden"
      >
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/[0.03] blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Settlement Stream Active
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-mono text-zinc-300">
                <ShieldCheck size={12} className="text-emerald-400" />
                Zero Gateway Fees
              </span>
            </div>
            <h1 className="mt-3.5 text-2xl sm:text-4xl font-extrabold tracking-tight text-white flex items-center gap-2.5 flex-wrap">
              <span>Financial Ledger & Settlements</span>
            </h1>
            <p className="mt-2 text-xs sm:text-sm text-zinc-400 max-w-2xl leading-relaxed">
              Real-time cryptographic audit trail for Domestic UPI (INR), Solana Pay (SOL), and Whop Global Cards (USD) settlements and token disbursements.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePurgePending}
                disabled={purgingPending}
                className="h-10 px-4 rounded-full border-red-500/25 bg-red-500/10 text-xs font-mono text-red-300 hover:bg-red-500/20 hover:text-white cursor-pointer"
                title="Purge all abandoned pending payment checkout logs"
              >
                <Trash2 size={13} className={`mr-1.5 ${purgingPending ? "animate-spin" : ""}`} />
                <span>Clean Pending</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchTransactions(true);
                fetchUpiOrders(true);
                fetchWhopOrders(true);
              }}
              disabled={refreshing || upiRefreshing || whopRefreshing}
              className="h-10 px-4 rounded-full border-white/15 bg-black/40 text-xs font-mono text-zinc-200 hover:bg-white/10 hover:text-white cursor-pointer"
            >
              <RefreshCw size={13} className={`mr-1.5 ${refreshing || upiRefreshing || whopRefreshing ? "animate-spin" : ""}`} />
              <span>Sync Ledger</span>
            </Button>
            <StarButton
              backgroundColor="#000000"
              onClick={() => setIsCheckoutOpen(true)}
              className="h-10 px-5 rounded-full border border-slate-200/50 text-xs font-mono"
            >
              <Zap size={13} className="mr-1.5 inline-block text-white" />
              <span>Add Compute Reserves</span>
            </StarButton>
          </div>
        </div>
      </section>

      {/* 2. Rail Selector Bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="inline-flex p-1.5 rounded-2xl bg-neutral-900/90 border border-neutral-700/80 backdrop-blur-xl shadow-xl gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveRail("upi")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-mono font-semibold transition-all duration-200 cursor-pointer ${
              activeRail === "upi" ? "bg-white text-black shadow-md" : "text-neutral-400 hover:text-white"
            }`}
          >
            <Smartphone size={15} />
            <span>Domestic UPI (India)</span>
            {totalUpiPending > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400 text-black font-bold animate-pulse">
                {totalUpiPending}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveRail("solana")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-mono font-semibold transition-all duration-200 cursor-pointer ${
              activeRail === "solana" ? "bg-white text-black shadow-md" : "text-neutral-400 hover:text-white"
            }`}
          >
            <Wallet size={15} />
            <span>Solana Pay (SOL)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveRail("whop")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-mono font-semibold transition-all duration-200 cursor-pointer ${
              activeRail === "whop" ? "bg-white text-black shadow-md" : "text-neutral-400 hover:text-white"
            }`}
          >
            <CreditCard size={15} />
            <span>Whop (Global Cards)</span>
            {whopOrders.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-400 text-black font-bold">
                {whopOrders.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* SECTION 1: DOMESTIC UPI LEDGER                                      */}
      {/* ==================================================================== */}
      {activeRail === "upi" && (
        <div className="space-y-5">
          {/* 4 KPI Bento Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div
              style={{ backgroundColor: "oklch(0.14 0 0)", borderColor: "oklch(0.26 0 0)" }}
              className="rounded-2xl border p-5 flex flex-col justify-between shadow-xl"
            >
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold">
                  {isAdmin ? "Total UPI Orders" : "My Orders"}
                </span>
                <Smartphone size={15} className="text-white" />
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold font-mono text-white">{upiOrders.length}</p>
                <p className="mt-1 text-[11px] font-mono text-zinc-500">Direct VPA Settlements</p>
              </div>
            </div>

            <div
              style={{ backgroundColor: "oklch(0.14 0 0)", borderColor: "oklch(0.26 0 0)" }}
              className="rounded-2xl border p-5 flex flex-col justify-between shadow-xl"
            >
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold">Pending Review</span>
                <Clock size={15} className="text-amber-400" />
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold font-mono text-amber-300">{totalUpiPending}</p>
                <p className="mt-1 text-[11px] font-mono text-zinc-500">
                  {totalUpiPending > 0 ? "Under verification queue" : "All orders cleared"}
                </p>
              </div>
            </div>

            <div
              style={{ backgroundColor: "oklch(0.14 0 0)", borderColor: "oklch(0.26 0 0)" }}
              className="rounded-2xl border p-5 flex flex-col justify-between shadow-xl"
            >
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold">Approved Orders</span>
                <CheckCircle2 size={15} className="text-emerald-400" />
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold font-mono text-emerald-400">{totalUpiCompleted}</p>
                <p className="mt-1 text-[11px] font-mono text-zinc-500">Credited to compute balance</p>
              </div>
            </div>

            <div
              style={{ backgroundColor: "oklch(0.14 0 0)", borderColor: "oklch(0.26 0 0)" }}
              className="rounded-2xl border p-5 flex flex-col justify-between shadow-xl"
            >
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold">Total INR Settled</span>
                <IndianRupee size={15} className="text-white" />
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold font-mono text-white">₹{totalUpiVolumeInr.toLocaleString()}</p>
                <p className="mt-1 text-[11px] font-mono text-emerald-400">₹0.00 gateway commission</p>
              </div>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div
            style={{ backgroundColor: "oklch(0.14 0 0)", borderColor: "oklch(0.26 0 0)" }}
            className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-2xl border shadow-lg"
          >
            <div className="relative flex-1 max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <Input
                value={upiSearchQuery}
                onChange={(e) => setUpiSearchQuery(e.target.value)}
                placeholder="Search by 12-digit UTR, Order ID (TF_...), or User..."
                className="pl-9 bg-black/60 border-white/10 text-xs font-mono text-white placeholder:text-zinc-500 h-9"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-black/50 p-1 rounded-xl border border-white/10 self-start sm:self-auto">
              {(["ALL", "PENDING_VERIFICATION", "COMPLETED", "REJECTED"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setUpiFilter(filter)}
                  className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer ${
                    upiFilter === filter
                      ? "bg-white text-black font-bold shadow"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {filter === "ALL"
                    ? "All"
                    : filter === "PENDING_VERIFICATION"
                    ? `Pending (${totalUpiPending})`
                    : filter === "COMPLETED"
                    ? "Approved"
                    : "Rejected"}
                </button>
              ))}
            </div>
          </div>

          {/* Orders Stream Cards */}
          {filteredUpiOrders.length === 0 ? (
            <div className="p-12 text-center rounded-3xl border border-dashed border-white/15 bg-black/40 flex flex-col items-center justify-center gap-3">
              <Smartphone size={26} className="text-zinc-500" />
              <h3 className="text-sm font-bold text-white font-mono">No UPI settlement records</h3>
              <p className="text-xs text-zinc-400 max-w-md">
                {upiSearchQuery ? `No orders matched "${upiSearchQuery}".` : "You haven't placed any UPI payment orders yet."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUpiOrders.map((order) => {
                const isPending = order.status === "PENDING_VERIFICATION";
                const isCompleted = order.status === "COMPLETED";

                return (
                  <div
                    key={order.orderId}
                    style={{ backgroundColor: "oklch(0.18 0 0)", borderColor: "oklch(0.26 0 0)" }}
                    className="rounded-2xl border p-4 sm:p-5 transition-all hover:border-white/30 flex flex-col gap-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/[0.06]">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] border border-white/10 text-white">
                          <Smartphone size={16} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-white">{order.orderId}</span>
                            <Badge
                              className={`font-mono text-[9px] ${
                                isCompleted
                                  ? "border-0 bg-emerald-500/10 text-emerald-400"
                                  : isPending
                                  ? "border-0 bg-amber-500/10 text-amber-300"
                                  : "border-0 bg-red-400/10 text-red-300"
                              }`}
                            >
                              {isCompleted ? "● Approved" : isPending ? "Pending Verification" : order.status}
                            </Badge>
                          </div>
                          <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                            {new Date(order.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-base font-bold font-mono text-white">₹{order.amountInr.toLocaleString()}</div>
                        <div className="text-[11px] font-mono text-emerald-400 font-semibold">
                          +{order.credits.toLocaleString()} Tokens
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-zinc-400 pt-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        {order.utr ? (
                          <span className="rounded bg-black/60 px-2 py-0.5 border border-white/10 text-zinc-300">
                            UTR: {order.utr}
                          </span>
                        ) : (
                          <span className="text-amber-400">Awaiting UTR submission</span>
                        )}
                        {order.userEmail && <span>{order.userEmail}</span>}
                      </div>

                      {/* Admin Actions */}
                      {isAdmin && isPending && (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            disabled={approvingOrderId === order.orderId}
                            onClick={() => handleApproveUpiOrder(order.orderId)}
                            className="h-8 bg-white text-black hover:bg-zinc-200 font-mono text-xs font-bold"
                          >
                            {approvingOrderId === order.orderId ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} className="mr-1" />}
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={rejectingOrderId === order.orderId}
                            onClick={() => handleRejectUpiOrder(order.orderId)}
                            className="h-8 border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-mono"
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* SECTION 2: SOLANA PAY ON-CHAIN VIEW                                 */}
      {/* ==================================================================== */}
      {activeRail === "solana" && (
        <div className="space-y-5">
          {/* Solana Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div
              style={{ backgroundColor: "oklch(0.14 0 0)", borderColor: "oklch(0.26 0 0)" }}
              className="rounded-2xl border p-5 flex flex-col justify-between shadow-xl"
            >
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold">Settled Volume</span>
                <Coins size={15} className="text-white" />
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold font-mono text-white">
                  {solanaPaidStats ? solanaPaidStats.total_volume_sol.toFixed(3) : totalVolume.toFixed(3)}{" "}
                  <span className="text-sm text-zinc-400 font-normal">SOL</span>
                </p>
                <p className="mt-1 text-[11px] font-mono text-zinc-500">
                  ~${solanaPaidStats ? solanaPaidStats.total_volume_usd.toFixed(2) : (totalVolume * 250).toFixed(2)} compute
                </p>
              </div>
            </div>

            <div
              style={{ backgroundColor: "oklch(0.14 0 0)", borderColor: "oklch(0.26 0 0)" }}
              className="rounded-2xl border p-5 flex flex-col justify-between shadow-xl"
            >
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold">Paid Accounts</span>
                <Users size={15} className="text-emerald-400" />
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold font-mono text-emerald-400">
                  {solanaPaidStats?.total_paid_users ?? solanaPaidUsers.length}
                </p>
                <p className="mt-1 text-[11px] font-mono text-zinc-500">Verified on-chain users</p>
              </div>
            </div>

            <div
              style={{ backgroundColor: "oklch(0.14 0 0)", borderColor: "oklch(0.26 0 0)" }}
              className="rounded-2xl border p-5 flex flex-col justify-between shadow-xl"
            >
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold">Confirmed Txns</span>
                <CheckCircle2 size={15} className="text-white" />
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold font-mono text-white">
                  {solanaPaidStats?.total_transactions ?? data?.total_transactions ?? 0}
                </p>
                <p className="mt-1 text-[11px] font-mono text-zinc-500">100% on-chain confirmed</p>
              </div>
            </div>

            <div
              style={{ backgroundColor: "oklch(0.14 0 0)", borderColor: "oklch(0.26 0 0)" }}
              className="rounded-2xl border p-5 flex flex-col justify-between shadow-xl"
            >
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold">Merchant Wallet</span>
                <ShieldCheck size={15} className="text-white" />
              </div>
              <div className="mt-3">
                <p className="text-xs font-mono font-bold text-white truncate">{merchantWallet.slice(0, 8)}...{merchantWallet.slice(-6)}</p>
                <a
                  href={`https://explorer.solana.com/address/${merchantWallet}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-mono text-zinc-400 hover:text-white hover:underline"
                >
                  <span>Solana Explorer</span> <ExternalLink size={10} />
                </a>
              </div>
            </div>
          </div>

          {/* Transactions List */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Loader2 className="animate-spin text-zinc-400 mb-3" size={26} />
              <p className="text-xs font-mono text-zinc-400">Fetching on-chain transactions via Helius RPC…</p>
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="p-12 text-center rounded-3xl border border-dashed border-white/15 bg-black/40 flex flex-col items-center justify-center gap-3">
              <Wallet size={26} className="text-zinc-500" />
              <h3 className="text-sm font-bold text-white font-mono">No Solana Pay settlements yet</h3>
              <p className="text-xs text-zinc-400 max-w-md">
                Deposits made with Solana Pay will automatically appear in this live stream.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTransactions.map((tx) => (
                <div
                  key={tx.signature}
                  style={{ backgroundColor: "oklch(0.18 0 0)", borderColor: "oklch(0.26 0 0)" }}
                  className="rounded-2xl border p-4 sm:p-5 transition-all hover:border-white/30 flex flex-col gap-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/[0.06]">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] border border-white/10 text-white">
                        <Wallet size={16} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-white truncate max-w-[200px] sm:max-w-none">
                            {tx.signature.slice(0, 12)}...{tx.signature.slice(-8)}
                          </span>
                          <button
                            onClick={() => handleCopy(tx.signature, tx.signature, "Signature")}
                            className="text-zinc-500 hover:text-white cursor-pointer"
                          >
                            {copiedSignature === tx.signature ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                          </button>
                          <Badge className="border-0 bg-emerald-500/10 text-emerald-400 font-mono text-[9px]">
                            ● Confirmed
                          </Badge>
                        </div>
                        <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                          {new Date(tx.timestamp).toLocaleString()} • Slot #{tx.slot}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-base font-bold font-mono text-white">{tx.amountFormatted}</div>
                      <div className="text-[11px] font-mono text-emerald-400 font-semibold">{tx.creditsFormatted}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono text-zinc-400 pt-1">
                    <span className="truncate max-w-[300px]">From: {tx.from}</span>
                    <a
                      href={tx.explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-zinc-300 hover:text-white underline font-mono"
                    >
                      <span>Solana Explorer</span>
                      <ExternalLink size={11} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* SECTION 3: WHOP PAYMENTS (GLOBAL CARDS & APPLE PAY)                 */}
      {/* ==================================================================== */}
      {activeRail === "whop" && (
        <div className="space-y-5">
          {/* 4 KPI Bento Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div style={{ backgroundColor: "oklch(0.14 0 0)", borderColor: "oklch(0.26 0 0)" }} className="rounded-2xl border p-5 flex flex-col justify-between shadow-xl">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold">Total Orders</span>
                <CreditCard size={15} className="text-white" />
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold font-mono text-white">{whopOrders.length}</p>
                <p className="mt-1 text-[11px] font-mono text-zinc-500">Global Card Checkout</p>
              </div>
            </div>

            <div style={{ backgroundColor: "oklch(0.14 0 0)", borderColor: "oklch(0.26 0 0)" }} className="rounded-2xl border p-5 flex flex-col justify-between shadow-xl">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold">Gross Volume</span>
                <Zap size={15} className="text-emerald-400" />
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold font-mono text-emerald-400">
                  ${(whopStats.total_volume_usd || whopOrders.reduce((s, o) => s + (o.amountUsd || 0), 0)).toFixed(2)}
                </p>
                <p className="mt-1 text-[11px] font-mono text-zinc-500">USD Net Inflow</p>
              </div>
            </div>

            <div style={{ backgroundColor: "oklch(0.14 0 0)", borderColor: "oklch(0.26 0 0)" }} className="rounded-2xl border p-5 flex flex-col justify-between shadow-xl">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold">Tokens Disbursed</span>
                <Coins size={15} className="text-cyan-400" />
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold font-mono text-cyan-300">
                  {((whopStats.total_tokens_credited || whopOrders.reduce((s, o) => s + (o.tokens || 0), 0)) / 1_000_000).toFixed(0)}M
                </p>
                <p className="mt-1 text-[11px] font-mono text-zinc-500">Coding Tokens Credited</p>
              </div>
            </div>

            <div style={{ backgroundColor: "oklch(0.14 0 0)", borderColor: "oklch(0.26 0 0)" }} className="rounded-2xl border p-5 flex flex-col justify-between shadow-xl">
              <div className="flex items-center justify-between text-zinc-400">
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold">Fulfillment Status</span>
                <ShieldCheck size={15} className="text-emerald-400" />
              </div>
              <div className="mt-3">
                <p className="text-2xl font-bold font-mono text-white">100%</p>
                <p className="mt-1 text-[11px] font-mono text-emerald-400">Instant Automated Provision</p>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div style={{ backgroundColor: "oklch(0.14 0 0)", borderColor: "oklch(0.26 0 0)" }} className="rounded-3xl border overflow-hidden shadow-2xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <CreditCard size={18} className="text-emerald-400" />
                <h3 className="text-base font-bold font-mono text-white">Whop Payment Settlements</h3>
                <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono text-xs">
                  {filteredWhopOrders.length} Confirmed
                </Badge>
              </div>

              <div className="relative w-full sm:w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <Input
                  value={whopSearchQuery}
                  onChange={(e) => setWhopSearchQuery(e.target.value)}
                  placeholder="Filter by email or ID..."
                  className="pl-9 h-9 text-xs font-mono bg-black/60 border-white/10 text-white rounded-xl"
                />
              </div>
            </div>

            {/* Table */}
            {filteredWhopOrders.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 text-xs font-mono">
                {whopLoading ? "Loading Whop card settlements..." : "No Whop card settlements found."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-zinc-400 text-[11px] uppercase tracking-wider">
                      <th className="pb-3 font-semibold">Payment / Order ID</th>
                      <th className="pb-3 font-semibold">Customer Email</th>
                      <th className="pb-3 font-semibold">Product Purchased</th>
                      <th className="pb-3 font-semibold text-right">Amount Paid</th>
                      <th className="pb-3 font-semibold text-right">Tokens Allocated</th>
                      <th className="pb-3 font-semibold text-center">Status</th>
                      <th className="pb-3 font-semibold text-right">Settled At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {filteredWhopOrders.map((order) => (
                      <tr key={order.orderId || order.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3.5 pr-3 text-zinc-300 font-mono flex items-center gap-1.5">
                          <code className="text-xs bg-white/[0.04] px-2 py-0.5 rounded border border-white/10 select-all">
                            {order.orderId || order.paymentId}
                          </code>
                        </td>
                        <td className="py-3.5 pr-3 text-white font-medium">
                          {order.userEmail || `User #${order.userId}`}
                        </td>
                        <td className="py-3.5 pr-3">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white/[0.08] text-white border border-white/15">
                            {order.productName}
                          </span>
                        </td>
                        <td className="py-3.5 pr-3 text-right font-bold text-emerald-400 font-mono">
                          ${order.amountUsd ? order.amountUsd.toFixed(2) : "10.00"} USD
                        </td>
                        <td className="py-3.5 pr-3 text-right font-bold text-cyan-300 font-mono">
                          {order.tokens ? `+${(order.tokens / 1_000_000).toFixed(0)}M` : "+600M"}
                        </td>
                        <td className="py-3.5 text-center">
                          <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono font-bold">
                            ● Completed
                          </Badge>
                        </td>
                        <td className="py-3.5 text-right text-zinc-400 text-[11px]">
                          {order.processedAt ? new Date(order.processedAt).toLocaleString() : "Recently"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
