import { useState } from "react";
import { StarButton } from "@/components/StarButton";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { AnnouncementBanner } from "./AnnouncementBanner";
import { MaintenanceCountdownBanner } from "./MaintenanceCountdownBanner";
import { Menu, X, ArrowRight, Terminal, LayoutDashboard } from "lucide-react";

const navItems = [
  { href: "/models", label: "Models" },
  { href: "/pricing", label: "Pricing" },
  { href: "/playground", label: "Playground", icon: Terminal },
  { href: "/docs", label: "Docs" },
  { href: "mailto:contact@qronos.me", label: "Support", isExternal: true },
];

export function PublicNav() {
  const [location] = useLocation();
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <header className="fixed top-3 left-0 right-0 z-50 transition-all duration-500">
        <nav className="relative mx-auto w-full max-w-[1344px] before:absolute before:inset-x-0 before:top-0 before:z-10 before:h-px before:bg-white/10 after:absolute after:inset-x-0 after:bottom-0 after:z-10 after:h-px after:bg-white/10 lg:w-[calc(100%-3.5rem)] bg-[#010101]/80 backdrop-blur-xl border-x border-white/[0.07] rounded-none sm:rounded-xl">
          <div className="flex h-14 items-center justify-between px-5 transition-all duration-500">
            {/* Brand Logo */}
            <Link
              href="/"
              className="flex items-center gap-2.5 group text-decoration-none"
              aria-label="Qronos AI home"
            >
              <img
                src="/images/qronos-logo.png"
                alt="Qronos AI"
                className="h-6 sm:h-7 w-auto object-contain transition-all duration-300 group-hover:brightness-125"
              />
              <span className="hidden sm:inline-block text-[10px] font-mono tracking-wider px-2 py-0.5 rounded border border-white/10 text-zinc-400 bg-white/[0.04]">
                LLM GATEWAY
              </span>
            </Link>

            {/* Desktop Navigation Links */}
            <div className="hidden md:flex items-center gap-9">
              {navItems.map((item) => {
                const isActive = location === item.href;
                if (item.isExternal) {
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      className="text-xs uppercase tracking-wider font-mono font-medium transition-colors duration-300 relative group py-1 text-white/70 hover:text-[#c9ff73]"
                    >
                      <span>{item.label}</span>
                      <span className="absolute -bottom-0.5 left-0 h-px transition-all duration-300 bg-[#c9ff73] w-0 group-hover:w-full" />
                    </a>
                  );
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`text-xs uppercase tracking-wider font-mono font-medium transition-colors duration-300 relative group py-1 ${
                      isActive ? "text-white" : "text-white/70 hover:text-white"
                    }`}
                  >
                    <span>{item.label}</span>
                    <span
                      className={`absolute -bottom-0.5 left-0 h-px transition-all duration-300 bg-white ${
                        isActive ? "w-full" : "w-0 group-hover:w-full"
                      }`}
                    />
                  </Link>
                );
              })}
            </div>

            {/* Actions & Star Button */}
            <div className="hidden md:flex items-center gap-3">
              {user ? (
                <Link href="/dashboard">
                  <StarButton
                    backgroundColor="#010101"
                    className="h-8 border border-slate-200/50 px-4 text-xs font-mono"
                  >
                    <LayoutDashboard size={13} className="mr-1.5 inline-block text-white" />
                    <span>DASHBOARD</span>
                  </StarButton>
                </Link>
              ) : (
                <>
                  <Link
                    href="/signin"
                    className="text-xs font-mono uppercase tracking-wider text-zinc-400 hover:text-white px-3 py-1.5 transition"
                  >
                    Sign In
                  </Link>
                  <Link href="/signup">
                    <StarButton
                      backgroundColor="#010101"
                      className="h-8 border border-slate-200/50 px-4 text-xs font-mono"
                    >
                      <span>GET STARTED</span>
                      <ArrowRight size={13} className="ml-1 inline-block" />
                    </StarButton>
                  </Link>
                </>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-white/80 hover:text-white transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

          {/* Precision Corner Crosshair Accents */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 z-20 size-3 -translate-x-1/2 -translate-y-1/2 before:absolute before:left-1/2 before:top-0 before:h-full before:w-px before:-translate-x-1/2 before:bg-[linear-gradient(to_bottom,transparent,rgba(226,232,240,0.65)_50%,transparent)] after:absolute after:left-0 after:top-1/2 after:h-px after:w-full after:-translate-y-1/2 after:bg-[linear-gradient(to_right,transparent,rgba(226,232,240,0.65)_50%,transparent)]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-0 z-20 size-3 translate-x-1/2 -translate-y-1/2 before:absolute before:left-1/2 before:top-0 before:h-full before:w-px before:-translate-x-1/2 before:bg-[linear-gradient(to_bottom,transparent,rgba(226,232,240,0.65)_50%,transparent)] after:absolute after:left-0 after:top-1/2 after:h-px after:w-full after:-translate-y-1/2 after:bg-[linear-gradient(to_right,transparent,rgba(226,232,240,0.65)_50%,transparent)]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 left-0 z-20 size-3 -translate-x-1/2 translate-y-1/2 before:absolute before:left-1/2 before:top-0 before:h-full before:w-px before:-translate-x-1/2 before:bg-[linear-gradient(to_bottom,transparent,rgba(226,232,240,0.65)_50%,transparent)] after:absolute after:left-0 after:top-1/2 after:h-px after:w-full after:-translate-y-1/2 after:bg-[linear-gradient(to_right,transparent,rgba(226,232,240,0.65)_50%,transparent)]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 right-0 z-20 size-3 translate-x-1/2 translate-y-1/2 before:absolute before:left-1/2 before:top-0 before:h-full before:w-px before:-translate-x-1/2 before:bg-[linear-gradient(to_bottom,transparent,rgba(226,232,240,0.65)_50%,transparent)] after:absolute after:left-0 after:top-1/2 after:h-px after:w-full after:-translate-y-1/2 after:bg-[linear-gradient(to_right,transparent,rgba(226,232,240,0.65)_50%,transparent)]"
          />
        </nav>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 top-16 bg-[#08090d]/95 backdrop-blur-2xl z-40 p-6 flex flex-col justify-between">
            <div className="space-y-6 pt-6">
              {navItems.map((item) => {
                if (item.isExternal) {
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="block text-2xl font-light text-zinc-200 hover:text-[#c9ff73]"
                    >
                      {item.label}
                    </a>
                  );
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="block text-2xl font-light text-zinc-200 hover:text-white"
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <div className="space-y-3 pb-8">
              {user ? (
                <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)} className="block w-full">
                  <StarButton backgroundColor="#000000" className="w-full py-3">
                    <LayoutDashboard size={14} className="mr-1.5 inline-block" />
                    <span>DASHBOARD</span>
                  </StarButton>
                </Link>
              ) : (
                <>
                  <Link href="/signup" onClick={() => setMobileMenuOpen(false)} className="block w-full">
                    <StarButton backgroundColor="#000000" className="w-full py-3">
                      <span>GET STARTED</span>
                      <ArrowRight size={14} className="ml-1 inline-block" />
                    </StarButton>
                  </Link>
                  <Link
                    href="/signin"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block text-center py-2 text-sm text-zinc-400 hover:text-white"
                  >
                    Sign In
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>
      <div className="h-16" />
      <AnnouncementBanner />
      <MaintenanceCountdownBanner />
    </>
  );
}
