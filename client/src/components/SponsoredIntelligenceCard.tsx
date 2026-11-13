import React, { useEffect, useRef, useState } from "react";
import { ExternalLink, Sparkles } from "lucide-react";

export interface SponsoredAdData {
  bidId?: string;
  title: string;
  description: string;
  imageUrl?: string;
  brandName?: string;
  brandLogoUrl?: string;
  ctaText?: string;
  clickUrl: string;
  renderedTrackerUrl?: string;
  viewableTrackerUrl?: string;
}

interface SponsoredIntelligenceCardProps {
  ad: SponsoredAdData | null;
  className?: string;
}

export function SponsoredIntelligenceCard({ ad, className = "" }: SponsoredIntelligenceCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [renderedFired, setRenderedFired] = useState(false);
  const [viewableFired, setViewableFired] = useState(false);

  // 1. Fire Rendered tracker on mount
  useEffect(() => {
    if (!ad || renderedFired || !ad.renderedTrackerUrl) return;

    try {
      fetch(ad.renderedTrackerUrl, { method: "GET", mode: "no-cors" }).catch(() => {});
      setRenderedFired(true);
    } catch {
      // Best-effort tracking
    }
  }, [ad, renderedFired]);

  // 2. IAB Viewability Tracker: >= 50% in viewport for at least 1 continuous second
  useEffect(() => {
    if (!ad || viewableFired || !ad.viewableTrackerUrl || !cardRef.current) return;

    let timer: NodeJS.Timeout | null = null;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          if (!timer) {
            timer = setTimeout(() => {
              if (ad.viewableTrackerUrl && !viewableFired) {
                fetch(ad.viewableTrackerUrl, { method: "GET", mode: "no-cors" }).catch(() => {});
                setViewableFired(true);
              }
            }, 1000); // 1 continuous second
          }
        } else {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(cardRef.current);

    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [ad, viewableFired]);

  if (!ad) return null;

  return (
    <div
      ref={cardRef}
      className={`my-3 p-3.5 rounded-2xl border border-white/[0.12] bg-gradient-to-br from-white/[0.04] to-black/40 backdrop-blur-xl shadow-lg transition-all hover:border-white/20 select-text text-left ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/10 text-[10px] font-mono tracking-wider uppercase text-zinc-400">
          <Sparkles size={11} className="text-[#c9ff73]" />
          <span>Sponsored Intelligence</span>
        </div>
        {ad.brandName && (
          <span className="text-[11px] font-mono text-zinc-400 truncate max-w-[140px]">
            {ad.brandName}
          </span>
        )}
      </div>

      <div className="flex items-start gap-3">
        {ad.imageUrl && (
          <img
            src={ad.imageUrl}
            alt={ad.title}
            className="w-12 h-12 rounded-xl object-cover shrink-0 border border-white/10 bg-black/40"
            loading="lazy"
          />
        )}
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-semibold text-white tracking-tight leading-snug line-clamp-1">
            {ad.title}
          </h4>
          <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed line-clamp-2">
            {ad.description}
          </p>
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-between">
        <span className="text-[10px] font-mono text-zinc-500">Verified Partner</span>
        <a
          href={ad.clickUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white text-black font-semibold text-xs hover:bg-zinc-200 transition-colors shadow-sm cursor-pointer"
        >
          <span>{ad.ctaText || "Learn More"}</span>
          <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}
