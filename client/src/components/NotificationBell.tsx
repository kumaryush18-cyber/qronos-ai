import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Bell,
  CheckCheck,
  Megaphone,
  Sparkles,
  AlertTriangle,
  Info,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const unreadQuery = trpc.notifications.unreadCount.useQuery(undefined, {
    staleTime: 30_000,
    refetchInterval: 45_000,
    refetchOnWindowFocus: true,
  });

  const listQuery = trpc.notifications.list.useQuery(undefined, {
    enabled: open,
    refetchInterval: open ? 30_000 : false,
  });

  const markRead = trpc.notifications.markAsRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });

  const markAllRead = trpc.notifications.markAllAsRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });

  const unreadCount = unreadQuery.data ?? 0;
  const notifications = listQuery.data ?? [];

  const getIcon = (type: string) => {
    switch (type) {
      case "alert":
        return <AlertTriangle size={15} className="text-amber-400 shrink-0" />;
      case "update":
        return <Sparkles size={15} className="text-cyan-400 shrink-0" />;
      case "info":
        return <Info size={15} className="text-blue-400 shrink-0" />;
      default:
        return <Megaphone size={15} className="text-[#c9ff73] shrink-0" />;
    }
  };

  const formatTime = (dateInput: Date | string) => {
    try {
      const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
      return formatDistanceToNow(d, { addSuffix: true });
    } catch {
      return "recently";
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer focus:outline-none"
          aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ""}`}
        >
          <Bell size={16} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-mono font-bold text-white shadow-lg shadow-rose-500/50 animate-in zoom-in">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 sm:w-96 rounded-2xl border border-white/10 bg-[#0f1015]/95 p-0 text-white shadow-2xl backdrop-blur-2xl z-50"
      >
        <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">Notifications</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-rose-500/20 border border-rose-500/30 px-1.5 py-0.5 text-[10px] font-mono font-bold text-rose-300">
                {unreadCount} new
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              disabled={markAllRead.isPending}
              onClick={() => markAllRead.mutate()}
              className="h-7 px-2 text-[11px] font-mono text-zinc-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
            >
              {markAllRead.isPending ? (
                <Loader2 size={12} className="animate-spin mr-1" />
              ) : (
                <CheckCheck size={13} className="mr-1 text-emerald-400" />
              )}
              Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-[380px] overflow-y-auto">
          {listQuery.isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 size={18} className="animate-spin text-zinc-500" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-zinc-500">
              <Bell size={24} className="opacity-30 mb-2" />
              <p className="text-xs font-mono font-medium">No notifications yet</p>
              <p className="text-[11px] text-zinc-600 mt-0.5">Announcements and alerts will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {notifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    if (!item.isRead) {
                      markRead.mutate({ notificationId: item.id });
                    }
                  }}
                  className={`group flex items-start gap-3 p-3.5 transition-colors cursor-pointer ${
                    item.isRead
                      ? "opacity-65 hover:opacity-100 hover:bg-white/[0.02]"
                      : "bg-white/[0.03] hover:bg-white/[0.06]"
                  }`}
                >
                  <div className="mt-0.5">{getIcon(item.type)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-xs font-semibold truncate ${item.isRead ? "text-zinc-300" : "text-white"}`}>
                        {item.title}
                      </p>
                      {!item.isRead && (
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                      )}
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-zinc-400 break-words whitespace-pre-line">
                      {item.message}
                    </p>
                    <p className="mt-1.5 text-[10px] font-mono text-zinc-500">
                      {formatTime(item.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
