import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { ArrowLeftRight, Boxes, ChartNoAxesCombined, Check, ChevronDown, CreditCard, FlaskConical, Gift, KeyRound, LayoutDashboard, LifeBuoy, LogOut, PanelLeft, Receipt, Settings2, Shield, Terminal, UserRound } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ThreeDButton } from "@/components/ui/3d-button";
import { QRONOS_POST_LOGOUT_PATH } from "../../../shared/authNavigation";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { DiscordIcon } from "./LoginWelcomeTour";
import { StarButton } from "./StarButton";
import { DiscordVerifyModal, openDiscordVerifyModal } from "./DiscordVerifyModal";
import { AnnouncementBanner } from "./AnnouncementBanner";
import { MaintenanceCountdownBanner } from "./MaintenanceCountdownBanner";
import { QronosGlyph } from "./QronosGlyph";
import { PearlAvatar } from "@/components/ui/pearl-avatar";
import { UserTierBadge } from "@/components/UserTierBadge";
import { NotificationBell } from "@/components/NotificationBell";
import "./dashboard-shell.css";

const menuItems = [
  { icon: LayoutDashboard, label: "Overview", path: "/dashboard" },
  { icon: Terminal, label: "Playground", path: "/dashboard/playground" },
  { icon: Boxes, label: "Models", path: "/models" },
  { icon: CreditCard, label: "Pricing", path: "/dashboard/pricing" },
  { icon: KeyRound, label: "API keys", path: "/dashboard/keys" },
  { icon: Gift, label: "Referrals", path: "/dashboard/referrals" },
  { icon: ChartNoAxesCombined, label: "Usage logs", path: "/dashboard/usage" },
  { icon: ArrowLeftRight, label: "Transactions", path: "/dashboard/transactions" },
  { icon: UserRound, label: "Profile", path: "/dashboard/profile" },
  { icon: Shield, label: "Admin", path: "/admin", adminOnly: true },
  { icon: Settings2, label: "Settings", path: "/admin/settings", adminOnly: true },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              Sign in to continue
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Access to this dashboard requires a Qronos AI account. Create one or sign in to continue.
            </p>
          </div>
          <div className="w-full flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild size="lg" className="h-[42px] px-6 shadow-lg hover:shadow-xl transition-all"><Link href="/signin">Sign in</Link></Button>
            <ThreeDButton href="/signin" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
      <DiscordVerifyModal />
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const isDiscordVerified = Boolean((user as any)?.discordVerifiedAt || (user as any)?.isAdminSession);
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();

  const handleSignOut = async () => {
    await logout();
    setLocation(QRONOS_POST_LOGOUT_PATH);
  };

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="dashboard-sidebar-header">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="dashboard-sidebar-brand min-w-0">
                  <QronosGlyph size={28} className="dashboard-sidebar-brand__glyph" />
                  <div><span>Qronos <span>AI</span></span><small>LLM Gateway</small></div>
                </div>
              ) : <QronosGlyph size={24} className="dashboard-sidebar-brand__glyph dashboard-sidebar-brand__glyph--collapsed" />}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {menuItems.filter(item => !item.adminOnly || user?.isAdminSession === true || user?.role === "admin").map(item => {
                const isActive =
                  location === item.path ||
                  (item.path === "/models" && (location === "/dashboard/models" || location.startsWith("/models/") || location.startsWith("/dashboard/models/"))) ||
                  (item.path === "/dashboard/playground" && (location === "/dashboard/playground" || location === "/playground")) ||
                  (item.path === "/dashboard/pricing" && (location === "/dashboard/pricing" || location === "/pricing"));
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-10 transition-all font-normal`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset className="dashboard-inset">
        <header className="dashboard-topbar">
          <div className="dashboard-topbar__brand">
            {isMobile && <SidebarTrigger className="dashboard-topbar__trigger shrink-0" />}
            <Link href="/dashboard" className="dashboard-topbar__logo shrink-0" aria-label="Qronos AI dashboard home">
              <QronosGlyph size={24} className="dashboard-topbar__glyph" />
              <span>Qronos <span>AI</span></span>
            </Link>
            <span className="dashboard-topbar__divider hidden sm:block" />
            <span className="dashboard-topbar__section hidden sm:inline-block truncate max-w-[120px] md:max-w-[200px]">{activeMenuItem?.label ?? "Workspace"}</span>
          </div>
          <div className="dashboard-topbar__actions">
            <span className="dashboard-topbar__status shrink-0 hidden sm:inline-flex">
              <i /> <span className="hidden sm:inline">Gateway </span>ready
            </span>
            <Link href="/dashboard/playground" className="hidden md:inline-block hover:text-white transition-colors">Playground</Link>
            <Link href="/models" className="hidden md:inline-block hover:text-white transition-colors">Models</Link>
            <Link href="/dashboard/pricing" className="hidden md:inline-block hover:text-white transition-colors">Pricing</Link>
            <Link href="/docs" className="hidden lg:inline-block hover:text-white transition-colors">Documentation</Link>

            {/* Discord Verification Status Button / Badge */}
            {isDiscordVerified ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#5865F2]/10 border border-[#5865F2]/25 text-[10px] font-mono font-bold text-[#9ba5f7] shadow-[0_0_12px_rgba(88,101,242,0.15)]">
                <DiscordIcon className="w-3 h-3 text-[#5865F2]" />
                <Check size={11} className="text-emerald-400 stroke-[3]" />
                <span className="hidden sm:inline">Discord Verified</span>
                <span className="sm:hidden">Verified</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={openDiscordVerifyModal}
                className="inline-block shrink-0 cursor-pointer focus:outline-none"
              >
                <StarButton
                  backgroundColor="#06070b"
                  lightColor="rgba(88, 101, 242, 0.95)"
                  starColor="#5865F2"
                  borderWidth={1.5}
                  duration={3.5}
                  className="h-7 sm:h-8 px-2.5 sm:px-3 rounded-full border border-[#5865F2]/60 hover:border-[#7289da] text-[10px] sm:text-xs font-mono font-bold shadow-[0_0_18px_rgba(88,101,242,0.35)]"
                >
                  <DiscordIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-[#5865F2]" />
                  <span className="hidden min-[480px]:inline">Verify Discord</span>
                  <span className="min-[480px]:hidden">Verify</span>
                  <span className="hidden md:inline-block ml-0.5 text-[9px] uppercase tracking-wider text-amber-300 font-bold bg-amber-400/15 border border-amber-400/30 px-1 py-0.2 rounded">
                    10M Free
                  </span>
                </StarButton>
              </button>
            )}

            {/* Notification Bell */}
            <NotificationBell />

            {/* User Profile & Account Dropdown in Topbar */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full pl-1.5 pr-2.5 py-1 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-all focus:outline-none cursor-pointer">
                  <PearlAvatar
                    size={28}
                    letter={user?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || "Q"}
                  />
                  <div className="flex flex-col text-left hidden sm:flex">
                    <span className="text-xs font-semibold text-white leading-none">
                      {user?.name ? user.name.split(" ")[0] : "Account"}
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono leading-none mt-0.5 max-w-[110px] truncate">
                      {user?.email || ""}
                    </span>
                  </div>
                  <ChevronDown size={11} className="text-zinc-400 ml-0.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-[#0c0d12] border border-white/10 text-white rounded-2xl p-1.5 shadow-2xl">
                <div className="px-2.5 py-2 border-b border-white/[0.08] mb-1">
                  <p className="text-xs font-bold text-white truncate">{user?.name || "Developer"}</p>
                  <p className="text-[11px] font-mono text-zinc-400 truncate mt-0.5">{user?.email || "-"}</p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <UserTierBadge tier={(user as any)?.tier} size="xs" showTag />
                  </div>
                </div>
                <DropdownMenuItem onClick={() => setLocation("/dashboard/profile")} className="cursor-pointer text-xs font-mono py-2 rounded-xl hover:bg-white/[0.08]">
                  <UserRound className="mr-2 h-3.5 w-3.5 text-zinc-400" />
                  <span>Profile & Account</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocation("/dashboard/keys")} className="cursor-pointer text-xs font-mono py-2 rounded-xl hover:bg-white/[0.08]">
                  <KeyRound className="mr-2 h-3.5 w-3.5 text-zinc-400" />
                  <span>API Keys</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocation("/dashboard/transactions")} className="cursor-pointer text-xs font-mono py-2 rounded-xl hover:bg-white/[0.08]">
                  <ArrowLeftRight className="mr-2 h-3.5 w-3.5 text-zinc-400" />
                  <span>Transactions</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void handleSignOut()} className="cursor-pointer text-xs font-mono py-2 rounded-xl text-red-400 focus:text-red-300 hover:bg-red-500/10 mt-1 border-t border-white/[0.06]">
                  <LogOut className="mr-2 h-3.5 w-3.5" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <AnnouncementBanner />
        <MaintenanceCountdownBanner />
        <main className="dashboard-main">{children}</main>
        <footer className="dashboard-footer">
          <div><QronosGlyph size={20} className="dashboard-footer__glyph" /><span>Qronos <span>AI</span> developer workspace</span></div>
          <p>Curated models. Visible limits. Deliberate building. Credits are digital goods delivered instantly and are non-refundable once consumed.</p>
          <nav aria-label="Dashboard footer">
            <Link href="/models">Models</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/docs">Docs</Link>
            <Link href="/legal/terms">Terms of Service</Link>
            <Link href="/legal/privacy">Privacy Policy</Link>
            <Link href="/legal/refund">Refund Policy</Link>
            <a
              href="https://discord.gg/PGVmBGht7r"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1"
            >
              Contact Details (Discord)
            </a>
          </nav>
        </footer>
      </SidebarInset>
    </>
  );
}
