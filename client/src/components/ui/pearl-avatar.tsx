import React from "react";
import { cn } from "@/lib/utils";

interface PearlAvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  letter?: string;
  size?: number;
  className?: string;
  duration?: number;
}

export const PearlAvatar: React.FC<PearlAvatarProps> = ({
  letter = "Q",
  size = 32,
  duration = 3,
  className = "",
  ...props
}) => {
  const fontSize = Math.max(10, Math.floor(size * 0.42));

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
      }}
      className={cn(
        "relative rounded-full p-[1px] overflow-hidden group select-none shrink-0 inline-flex items-center justify-center transition-transform duration-200 hover:scale-105",
        className
      )}
      {...props}
    >
      {/* Razor-Thin Revolving Star Light Beam along circular border rim */}
      <div
        aria-hidden="true"
        className="absolute inset-[-60%] pointer-events-none animate-spin"
        style={{
          animationDuration: `${duration}s`,
          animationTimingFunction: "linear",
          background:
            "conic-gradient(from 0deg, transparent 0deg, transparent 270deg, rgba(255,255,255,0.2) 315deg, rgba(255,255,255,0.75) 345deg, #ffffff 360deg)",
        }}
      />

      {/* Subtle radial center glow on hover */}
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none bg-white/10 blur-xs"
      />

      {/* Inner Avatar Surface */}
      <div
        className="relative z-10 w-full h-full rounded-full bg-[#0c0d12] border border-white/10 flex items-center justify-center font-mono font-bold text-white shadow-inner"
        style={{ fontSize: `${fontSize}px` }}
      >
        <span>{letter}</span>
      </div>
    </div>
  );
};

export default PearlAvatar;
