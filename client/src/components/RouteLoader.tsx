import { useEffect } from "react";

const LOADING_ASSET_URL =
  "https://res.cloudinary.com/dhrh8heb5/video/upload/ar_1.0,c_crop,g_center,w_500,fps_15,e_accelerate:40/gemini_generated_video_d86dda13_ey5bf3.gif";

export interface RouteLoaderProps {
  onEnded?: () => void;
}

export function RouteLoader({ onEnded }: RouteLoaderProps) {
  useEffect(() => {
    if (onEnded) {
      // With e_accelerate:40 (+40% faster), 1 full cycle finishes in exactly 7.14 seconds
      const timer = setTimeout(() => {
        onEnded();
      }, 7140);
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
          className="w-full h-full rounded-[22px] overflow-hidden flex items-center justify-center"
          style={{ backgroundColor: "#010101" }}
        >
          <img
            src={LOADING_ASSET_URL}
            alt="Qronos AI Loading"
            draggable={false}
            className="w-full h-full object-contain pointer-events-none select-none p-1.5"
            onError={() => onEnded?.()}
          />
        </div>
      </div>
    </div>
  );
}

export default RouteLoader;
