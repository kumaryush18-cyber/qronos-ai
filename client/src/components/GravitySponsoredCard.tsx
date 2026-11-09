import React, { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { ExternalLink } from "lucide-react";

export interface GravitySponsoredCardProps {
  messages?: Array<{ role: string; content: string }>;
  className?: string;
}

export function GravitySponsoredCard({ messages = [], className = "" }: GravitySponsoredCardProps) {
  const adQuery = trpc.ads.getPlaygroundAd.useQuery(
    { messages },
    { refetchOnWindowFocus: false, staleTime: 60_000 }
  );

  const ad = adQuery.data;
  const impFired = useRef(false);

  useEffect(() => {
    if (ad?.impUrl && !impFired.current) {
      impFired.current = true;
      const img = new Image();
      img.src = ad.impUrl;
    }
  }, [ad?.impUrl]);

  if (!ad) return null;

  return (
    <div className={`mt-3 pt-3 border-t border-white/[0.08] ${className}`}>
      <div className="rounded-xl border border-white/10 bg-black/50 p-3 hover:border-white/20 transition-all text-xs font-mono group">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2">
            {ad.favicon && (
              <img src={ad.favicon} alt="" className="w-4 h-4 rounded object-contain shrink-0" />
            )}
            <span className="font-semibold text-white group-hover:text-[#c9ff73] transition-colors">
              {ad.brandName || "Featured Developer Tool"}
            </span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/5 border border-white/10 text-zinc-400">
            Sponsored
          </span>
        </div>

        {ad.title && (
          <p className="text-zinc-200 font-sans font-medium text-xs mb-1 line-clamp-1">
            {ad.title}
          </p>
        )}

        {ad.brandImage && (
          <div className="mb-2.5 rounded-lg overflow-hidden border border-white/10 max-h-36 bg-black/40 flex items-center justify-center">
            <img src={ad.brandImage} alt={ad.brandName || "Sponsored Ad"} className="w-full h-full object-cover" />
          </div>
        )}

        <p className="text-zinc-400 font-sans text-xs line-clamp-2 leading-relaxed mb-2.5">
          {ad.adText}
        </p>

        <a
          href={ad.clickUrl || ad.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/10 hover:bg-[#c9ff73] text-white hover:text-black border border-white/15 text-[11px] font-semibold transition-all"
        >
          <span>{ad.cta || "Learn More"}</span>
          <ExternalLink size={11} />
        </a>
      </div>
    </div>
  );
}
