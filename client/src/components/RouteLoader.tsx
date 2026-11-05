import { useEffect, useRef } from "react";

const LOADING_ASSET_URL =
  "https://github.com/kumaryush18-cyber/qronos-media/releases/download/v1.0-media/route_loader.mp4";

export interface RouteLoaderProps {
  onEnded?: () => void;
}

export function RouteLoader({ onEnded }: RouteLoaderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.playbackRate = 1.5;
      video.defaultPlaybackRate = 1.5;
      video.play().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (onEnded) {
      // With 1.5x playback speed (+50% faster), 1 full cycle completes in exactly 6.67 seconds
      const timer = setTimeout(() => {
        onEnded();
      }, 6670);
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
      {/* Curved Metallic Silver Border Big Icon Container */}
      <div
        className="relative flex items-center justify-center w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 aspect-square p-[2px] rounded-[24px] overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, #f8fafc 0%, #94a3b8 20%, #ffffff 40%, #475569 65%, #cbd5e1 85%, #64748b 100%)",
          boxShadow:
            "0 0 25px rgba(226, 232, 240, 0.15), 0 10px 25px rgba(0, 0, 0, 0.7), inset 0 1px 1.5px rgba(255, 255, 255, 0.7), inset 0 -1px 1.5px rgba(0, 0, 0, 0.8)",
        }}
      >
        {/* Inner black card with curved edges clipping the media */}
        <div
          className="w-full h-full rounded-[22px] overflow-hidden flex items-center justify-center bg-[#010101]"
        >
          <video
            ref={videoRef}
            src={LOADING_ASSET_URL}
            autoPlay
            muted
            playsInline
            loop
            preload="auto"
            className="w-full h-full object-cover pointer-events-none select-none scale-105"
            onCanPlay={() => {
              if (videoRef.current) {
                videoRef.current.playbackRate = 1.5;
              }
            }}
            onError={() => onEnded?.()}
            onEnded={() => onEnded?.()}
          />
        </div>
      </div>
    </div>
  );
}

export default RouteLoader;
