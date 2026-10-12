import React, { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, LogIn, Check, CheckCheck, Loader2, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link, useLocation } from "wouter";
import { QronosGlyph } from "./QronosGlyph";
import { StarBorderCard } from "@/components/StarBorderCard";

function formatMessageTime(date: Date | string) {
  const d = new Date(date);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatFullTimestamp(date: Date | string) {
  const d = new Date(date);
  return `${d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  })} at ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

function getDateSeparator(date: Date | string) {
  const d = new Date(date);
  const now = new Date();

  if (d.toDateString() === now.toDateString()) {
    return "Today";
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

export function SupportChatWidget() {
  const { user } = useAuth();
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");

  const utils = trpc.useUtils();
  const { data: unreadCount = 0 } = trpc.support.getUnreadCount.useQuery(undefined, {
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: isOpen ? 30_000 : 120_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const { data: history = [] } = trpc.support.getHistory.useQuery(undefined, {
    enabled: !!user && isOpen,
    staleTime: 10_000,
    refetchInterval: isOpen ? 15_000 : false,
  });

  const markAsRead = trpc.support.markAsRead.useMutation({
    onSuccess: () => {
      utils.support.getUnreadCount.invalidate();
    },
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const prevHistoryLengthRef = useRef(0);
  const justSentRef = useRef(false);
  const wasOpenRef = useRef(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [unreadSinceScrollUp, setUnreadSinceScrollUp] = useState(0);

  const sendMessage = trpc.support.sendMessage.useMutation({
    onSuccess: () => {
      setInput("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      utils.support.getHistory.invalidate();
      utils.support.getUnreadCount.invalidate();
    },
  });

  useEffect(() => {
    if (isOpen && user) {
      markAsRead.mutate();
    }
  }, [isOpen, user]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const atBottom = distanceFromBottom <= 60;
    isAtBottomRef.current = atBottom;
    if (atBottom) {
      setShowScrollToBottom(false);
      setUnreadSinceScrollUp(0);
    } else {
      setShowScrollToBottom(true);
    }
  };

  const scrollToBottom = () => {
    isAtBottomRef.current = true;
    setShowScrollToBottom(false);
    setUnreadSinceScrollUp(0);
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }

    const isInitialOpen = !wasOpenRef.current;
    wasOpenRef.current = true;

    const currentLength = history.length;
    const prevLength = prevHistoryLengthRef.current;
    const hasNewMessages = currentLength > prevLength;
    prevHistoryLengthRef.current = currentLength;

    if (isInitialOpen) {
      isAtBottomRef.current = true;
      setShowScrollToBottom(false);
      setUnreadSinceScrollUp(0);
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
      }, 50);
      return;
    }

    if (!hasNewMessages) return;

    if (justSentRef.current) {
      justSentRef.current = false;
      isAtBottomRef.current = true;
      setShowScrollToBottom(false);
      setUnreadSinceScrollUp(0);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
      return;
    }

    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      setUnreadSinceScrollUp((prev) => prev + (currentLength - prevLength));
    }
  }, [history, isOpen]);

  // Hide the floating widget on the admin panel
  if (location.startsWith("/admin") || location.startsWith("/dashboard/admin")) {
    return null;
  }

  return (
    <div
      id="qronos-support-widget"
      className="fixed bottom-4 right-3 sm:bottom-6 sm:right-6 z-[9999] flex flex-col items-end pointer-events-auto max-w-[calc(100vw-1.5rem)] select-none"
    >
      {/* Floating Notification Tooltip Pill */}
      <AnimatePresence>
        {!isOpen && unreadCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.85 }}
            onClick={() => setIsOpen(true)}
            className="mb-3 mr-1 cursor-pointer select-none rounded-2xl rounded-br-sm border border-white/20 bg-[#0c0d12]/95 px-4 py-2.5 text-xs font-mono font-semibold text-white shadow-2xl backdrop-blur-md transition-all hover:scale-105 flex items-center gap-2.5 max-w-[calc(100vw-2rem)]"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="truncate">Message from Support Desk</span>
            <span className="flex h-5 min-w-[20px] px-1.5 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-extrabold text-black shadow-sm font-mono">
              {unreadCount}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Chat Window Box with Rotating Star Light on Border */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="mb-3 w-[calc(100vw-1.5rem)] xs:w-[360px] sm:w-[390px] relative z-10"
          >
            <StarBorderCard
              lightWidth={220}
              duration={7}
              lightColor="rgba(255, 255, 255, 0.95)"
              className="rounded-3xl shadow-[0_32px_90px_rgba(0,0,0,0.9)] overflow-hidden"
            >
              <div className="flex h-[500px] max-h-[calc(100dvh-6rem)] flex-col bg-[#0c0d12]/98 rounded-[23px] overflow-hidden text-white select-text">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-white/10 bg-black/60 px-4 py-3 min-w-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] border border-white/10 overflow-hidden shadow-sm">
                      <QronosGlyph size={20} className="rounded" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-bold text-white leading-tight truncate">
                        Qronos AI Support
                      </div>
                      <div className="text-[10px] font-mono text-emerald-400 flex items-center gap-1.5 truncate mt-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block animate-pulse shrink-0" />
                        <span>Online · Sub-8ms Routing Desk</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors shrink-0 cursor-pointer"
                    title="Close chat window"
                  >
                    <X size={17} />
                  </button>
                </div>

                {/* Content Area */}
                {!user ? (
                  <div className="flex flex-1 flex-col items-center justify-center p-6 text-center min-w-0">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-zinc-400 mb-3 border border-white/10">
                      <LogIn size={24} />
                    </div>
                    <h4 className="text-sm font-bold text-white">Sign in to reach support</h4>
                    <p className="mt-1 text-xs text-zinc-400 max-w-xs leading-relaxed">
                      Log in to your Qronos AI account to start a live support conversation with our routing desk.
                    </p>
                    <Link
                      href="/signin"
                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2 text-xs font-mono font-bold text-black shadow hover:bg-zinc-200 transition-colors"
                    >
                      <LogIn size={13} />
                      <span>Sign In</span>
                    </Link>
                  </div>
                ) : (
                  <>
                    <div
                      ref={scrollContainerRef}
                      onScroll={handleScroll}
                      className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:16px_16px] min-w-0"
                    >
                      {history.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center p-4 min-w-0">
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.08] border border-white/10 mb-3 overflow-hidden shadow-lg">
                            <QronosGlyph size={28} className="rounded" />
                          </div>
                          <p className="text-xs font-bold text-white font-mono">Routing Desk Assistant</p>
                          <p className="text-[11px] text-zinc-400 mt-1 max-w-[240px] leading-relaxed">
                            Ask about model pools, token rates, custom quotas, or API keys. Our engineering team typically replies within minutes.
                          </p>
                        </div>
                      ) : (
                        history.map((msg, index) => {
                          const isUser = msg.senderRole === "user";
                          const prevMsg = index > 0 ? history[index - 1] : null;
                          const showDateHeader =
                            !prevMsg ||
                            new Date(prevMsg.createdAt).toDateString() !== new Date(msg.createdAt).toDateString();

                          return (
                            <div key={msg.id} className="space-y-2 min-w-0">
                              {showDateHeader && (
                                <div className="flex justify-center my-2">
                                  <span className="rounded-full border border-white/10 bg-[#17181e] px-2.5 py-0.5 text-[9px] font-mono text-zinc-400 shadow-sm">
                                    {getDateSeparator(msg.createdAt)}
                                  </span>
                                </div>
                              )}

                              {isUser ? (
                                <div className="flex justify-end min-w-0">
                                  <div
                                    title={formatFullTimestamp(msg.createdAt)}
                                    className="max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed bg-white text-black font-semibold rounded-br-xs shadow-md min-w-0 break-words [overflow-wrap:anywhere]"
                                  >
                                    <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.content}</div>
                                    <div className="flex items-center justify-end gap-1 text-[9px] mt-1 text-black/60 font-mono font-normal">
                                      <span>{formatMessageTime(msg.createdAt)}</span>
                                      <span title={msg.isRead ? "Read by support team" : "Delivered"}>
                                        {msg.isRead ? (
                                          <CheckCheck size={11} className="text-black" />
                                        ) : (
                                          <Check size={11} className="text-black/60" />
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start gap-2 justify-start min-w-0">
                                  <div className="size-6 sm:size-7 shrink-0 mt-0.5 rounded-full bg-white/[0.08] border border-white/15 flex items-center justify-center overflow-hidden shadow-sm">
                                    <QronosGlyph size={14} className="rounded" />
                                  </div>
                                  <div
                                    title={formatFullTimestamp(msg.createdAt)}
                                    className="max-w-[80%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed bg-white/[0.08] text-white border border-white/10 rounded-bl-xs shadow-sm min-w-0 break-words [overflow-wrap:anywhere]"
                                  >
                                    <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.content}</div>
                                    <div className="text-[9px] mt-1 text-right text-zinc-400 font-mono font-normal">
                                      {formatMessageTime(msg.createdAt)}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Floating Scroll to Bottom Button */}
                    <AnimatePresence>
                      {showScrollToBottom && (
                        <motion.button
                          initial={{ opacity: 0, y: 6, scale: 0.9 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 6, scale: 0.9 }}
                          onClick={scrollToBottom}
                          className="absolute bottom-16 right-4 z-20 flex items-center gap-1 rounded-full border border-white/20 bg-[#121318]/95 px-3 py-1 text-[10px] font-mono font-medium text-white shadow-2xl backdrop-blur-md hover:bg-[#1a1b22] transition-all cursor-pointer"
                        >
                          <ChevronDown size={12} className="text-white" />
                          <span>Latest</span>
                          {unreadSinceScrollUp > 0 && (
                            <span className="ml-0.5 flex h-3.5 min-w-[14px] px-1 items-center justify-center rounded-full bg-white text-[8px] font-extrabold text-black font-mono">
                              {unreadSinceScrollUp}
                            </span>
                          )}
                        </motion.button>
                      )}
                    </AnimatePresence>

                    {/* Input Bar */}
                    <div className="border-t border-white/10 bg-[#101116] p-2.5 min-w-0">
                      <div className="flex items-end gap-2 min-w-0">
                        <textarea
                          ref={textareaRef}
                          rows={1}
                          value={input}
                          onChange={(e) => {
                            setInput(e.target.value);
                            e.target.style.height = "auto";
                            e.target.style.height = `${Math.min(e.target.scrollHeight, 110)}px`;
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              // Enter adds natural newline
                            }
                          }}
                          placeholder="Type your message to support..."
                          disabled={sendMessage.isPending}
                          className="flex-1 min-w-0 resize-none rounded-2xl border border-white/10 bg-black/60 px-3.5 py-2 text-xs text-white placeholder:text-zinc-500 focus:border-white/30 focus:outline-none max-h-[110px] leading-relaxed transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (input.trim() && !sendMessage.isPending) {
                              justSentRef.current = true;
                              sendMessage.mutate({ content: input.trim() });
                            }
                          }}
                          disabled={!input.trim() || sendMessage.isPending}
                          title="Send message"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-black font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:bg-zinc-200 active:scale-95 mb-0.5 shadow-sm cursor-pointer"
                        >
                          {sendMessage.isPending ? (
                            <Loader2 size={13} className="animate-spin text-black" />
                          ) : (
                            <Send size={13} className="-ml-[1px] mt-[1px]" />
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </StarBorderCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Circular Chat Launcher Icon with Rotating Star Light Rim */}
      <div className="relative inline-flex items-center justify-center rounded-full p-[1.5px] overflow-hidden shadow-2xl">
        {/* Revolving Star Light Beam along circular border rim */}
        <div
          aria-hidden="true"
          className="absolute inset-[-60%] pointer-events-none animate-spin"
          style={{
            animationDuration: "3s",
            animationTimingFunction: "linear",
            background:
              "conic-gradient(from 0deg, transparent 0deg, transparent 240deg, rgba(255,255,255,0.3) 300deg, rgba(255,255,255,0.95) 360deg)",
          }}
        />

        <button
          id="qronos-chat-trigger"
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Open support chat"
          className={`relative z-10 flex h-13 w-13 sm:h-14 sm:w-14 items-center justify-center rounded-full transition-all duration-300 cursor-pointer active:scale-95 shadow-xl ${
            isOpen ? "bg-[#14151b] text-white" : "bg-[#0c0d12] text-white hover:bg-[#121318]"
          }`}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={isOpen ? "close" : "open"}
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {isOpen ? <X size={22} className="text-white" /> : <MessageCircle size={24} className="text-white fill-white/10" />}
            </motion.div>
          </AnimatePresence>

          {!isOpen && unreadCount > 0 && (
            <motion.div
              key="unread-badge"
              initial={{ scale: 0 }}
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 0.35 }}
              className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] px-1 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-mono font-extrabold text-black shadow-lg ring-2 ring-[#0c0d12] animate-pulse"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </motion.div>
          )}
        </button>
      </div>
    </div>
  );
}

export default SupportChatWidget;
