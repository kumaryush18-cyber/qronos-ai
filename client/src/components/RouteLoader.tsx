import { useEffect, useRef } from "react";

const LOADING_ASSET_URL = "/videos/route_loader.mp4";

export interface RouteLoaderProps {
  onEnded?: () => void;
}

export function RouteLoader({ onEnded }: RouteLoaderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const applyPlaybackRate = () => {
    const video = videoRef.current;
    if (video) {
      video.muted = true;
      video.defaultMuted = true;
      video.playbackRate = 2.0;
      video.defaultPlaybackRate = 2.0;
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = true;
      video.defaultMuted = true;
      video.playbackRate = 2.0;
      video.defaultPlaybackRate = 2.0;
      video.play().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (onEnded) {
      // With 2x playback speed, 1 full cycle completes in exactly 5.0 seconds
      const timer = setTimeout(() => {
        onEnded();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [onEnded]);

  return (
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-[#010101] overflow-hidden select-none cursor-default"
      style={{ backgroundColor: "#010101" }}
      role="status"
      aria-label="Loading Qronos AI"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onTouchStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {/* Clean Video Container without metallic silver border */}
      <div className="relative flex items-center justify-center w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 aspect-square rounded-[24px] overflow-hidden bg-[#010101]">
        <video
          ref={videoRef}
          src={LOADING_ASSET_URL}
          autoPlay
          muted
          playsInline
          loop
          preload="auto"
          className="w-full h-full object-cover pointer-events-none select-none"
          onLoadedMetadata={applyPlaybackRate}
          onCanPlay={applyPlaybackRate}
          onPlay={applyPlaybackRate}
          onError={() => onEnded?.()}
          onEnded={() => onEnded?.()}
        />
      </div>
    </div>
  );
}

export default RouteLoader;
