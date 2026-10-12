import React, { useRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface StarBorderCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  lightWidth?: number;
  duration?: number;
  lightColor?: string;
  glow?: boolean;
}

export function StarBorderCard({
  children,
  lightWidth = 160,
  duration = 8,
  lightColor = "rgba(255, 255, 255, 0.85)",
  glow = true,
  className,
  style,
  ...props
}: StarBorderCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState<string>("");

  useEffect(() => {
    const updatePath = () => {
      if (containerRef.current) {
        const w = containerRef.current.offsetWidth;
        const h = containerRef.current.offsetHeight;
        if (w > 0 && h > 0) {
          setPath(`path('M 0 0 H ${w} V ${h} H 0 V 0')`);
        }
      }
    };

    updatePath();
    const observer = new ResizeObserver(updatePath);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        ["--duration" as any]: duration,
        ["--light-width" as any]: `${lightWidth}px`,
        ["--light-color" as any]: lightColor,
        ["--path" as any]: path,
        isolation: "isolate",
        ...style,
      }}
      className={cn(
        "relative rounded-2xl p-[1px] overflow-hidden group transition-all duration-300",
        className
      )}
      {...props}
    >
      {/* Revolving Orbiting Light Beam along border path */}
      {path && glow && (
        <div
          aria-hidden="true"
          className="absolute aspect-square inset-0 animate-star-btn pointer-events-none z-0"
          style={{
            offsetPath: "var(--path)",
            offsetDistance: "0%",
            width: "var(--light-width)",
            background:
              "radial-gradient(ellipse at center, var(--light-color) 0%, rgba(255,255,255,0.4) 30%, transparent 70%)",
            filter: "blur(2px)",
          }}
        />
      )}

      {/* Inner Card Surface */}
      <div className="relative z-10 h-full w-full rounded-[15px] bg-[#0c0d12]/95 backdrop-blur-xl border border-white/[0.08] transition-all duration-300 group-hover:border-white/20 group-hover:bg-[#0f1118]">
        {children}
      </div>
    </div>
  );
}
