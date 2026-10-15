import React, { useEffect, useRef, useState } from "react";
import { Megaphone } from "lucide-react";
import { trpc } from "@/lib/trpc";
import "./announcement-banner.css";

export function AnnouncementBanner() {
  const announcement = trpc.public.announcement.useQuery(undefined, {
    refetchInterval: 60_000,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const text = announcement.data?.trim();
  const bannerRef = useRef<HTMLElement>(null);
  const [path, setPath] = useState<string>("");

  useEffect(() => {
    if (!text) return;
    const updatePath = () => {
      if (bannerRef.current) {
        const w = bannerRef.current.offsetWidth;
        const h = bannerRef.current.offsetHeight;
        if (w > 0 && h > 0) {
          setPath(`path('M 0 0 H ${w} V ${h} H 0 V 0')`);
        }
      }
    };

    updatePath();
    const observer = new ResizeObserver(updatePath);
    if (bannerRef.current) {
      observer.observe(bannerRef.current);
    }
    return () => observer.disconnect();
  }, [text]);

  if (!text) return null;

  return (
    <section
      ref={bannerRef}
      style={{
        ["--duration" as any]: 8,
        ["--light-width" as any]: "260px",
        ["--path" as any]: path,
      }}
      className="announcement-banner group"
      aria-label="Qronos AI announcement"
      role="status"
    >
      {/* Revolving Orbiting Star Light along the banner perimeter */}
      {path && (
        <div
          aria-hidden="true"
          className="announcement-banner__light animate-star-btn"
        />
      )}

      {/* Label Badge on Left */}
      <div className="announcement-banner__label">
        <span className="announcement-banner__label-dot" aria-hidden="true" />
        <Megaphone size={13} aria-hidden="true" className="shrink-0" />
        <span>Announcement</span>
      </div>

      {/* Continuous Marquee Stream with bold, punchy text */}
      <div className="announcement-banner__viewport">
        <div className="announcement-banner__track">
          <div className="announcement-banner__item">
            <span>{text}</span>
            <span className="announcement-banner__separator" aria-hidden="true">✦</span>
          </div>
          <div className="announcement-banner__item" aria-hidden="true">
            <span>{text}</span>
            <span className="announcement-banner__separator">✦</span>
          </div>
          <div className="announcement-banner__item" aria-hidden="true">
            <span>{text}</span>
            <span className="announcement-banner__separator">✦</span>
          </div>
          <div className="announcement-banner__item" aria-hidden="true">
            <span>{text}</span>
            <span className="announcement-banner__separator">✦</span>
          </div>
        </div>
      </div>
    </section>
  );
}
