import React, { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { StarBackgroundSvg } from "@/components/StarButton";

export interface PearlAvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  letter?: string;
  size?: number;
  className?: string;
  duration?: number;
  backgroundColor?: string;
}

export const PearlAvatar: React.FC<PearlAvatarProps> = ({
  letter = "Q",
  size = 32,
  duration = 3,
  backgroundColor = "#000000",
  className = "",
  style,
  ...props
}) => {
  const avatarRef = useRef<HTMLDivElement>(null);
  const fontSize = Math.max(10, Math.floor(size * 0.44));

  useEffect(() => {
    if (avatarRef.current) {
      const el = avatarRef.current;
      el.style.setProperty("--path", `path('M 0 0 H ${el.offsetWidth} V ${el.offsetHeight} H 0 V 0')`);
    }
  }, [size]);

  return (
    <div
      ref={avatarRef}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        ["--duration" as any]: duration,
        ["--light-width" as any]: `${Math.round(size * 1.5)}px`,
        ["--light-color" as any]: "#FAFAFA",
        isolation: "isolate",
        ...style,
      }}
      className={cn(
        "relative rounded-full overflow-hidden select-none shrink-0 inline-flex items-center justify-center transition-all active:scale-95 group border border-slate-200/40 hover:border-slate-100 shadow-[0_0_12px_rgba(255,255,255,0.08)]",
        className
      )}
      {...props}
    >
      {/* Revolving glowing light on path */}
      <div
        className="absolute aspect-square inset-0 animate-star-btn bg-[radial-gradient(ellipse_at_center,var(--light-color),transparent,transparent)] pointer-events-none"
        style={{
          offsetPath: "var(--path)",
          offsetDistance: "0%",
          width: "var(--light-width)",
        }}
      />

      {/* Rotating conic star beam for smooth circular perimeter sweep */}
      <div
        aria-hidden="true"
        className="absolute inset-[-60%] pointer-events-none animate-spin opacity-80"
        style={{
          animationDuration: `${duration}s`,
          animationTimingFunction: "linear",
          background:
            "conic-gradient(from 0deg, transparent 0deg, transparent 270deg, rgba(255,255,255,0.2) 315deg, rgba(255,255,255,0.85) 345deg, #ffffff 360deg)",
        }}
      />

      {/* Inner background with starry backdrop and inner border */}
      <div
        aria-hidden="true"
        className="absolute inset-[2px] border border-white/20 z-[4] overflow-hidden rounded-full pointer-events-none"
        style={{ backgroundColor }}
      >
        <StarBackgroundSvg color={backgroundColor} starColor="#ffffff" />
      </div>

      {/* Center Avatar Letter/Content */}
      <span
        className="relative z-10 font-mono font-bold text-white flex items-center justify-center"
        style={{ fontSize: `${fontSize}px` }}
      >
        {letter}
      </span>
    </div>
  );
};

export default PearlAvatar;
