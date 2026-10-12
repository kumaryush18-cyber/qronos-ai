import { motion } from "framer-motion";

interface InfergateGlyphProps {
  className?: string;
  size?: number;
  label?: string;
}

export function InfergateGlyph({ className = "", size = 34, label = "Infergate Nexus Mark" }: InfergateGlyphProps) {
  return (
    <motion.div
      className={`relative inline-flex items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
      whileHover={{ scale: 1.06, rotate: 2 }}
      transition={{ type: "spring", stiffness: 350, damping: 20 }}
    >
      {/* Outer ambient glow */}
      <div
        className="absolute inset-0 rounded-xl bg-gradient-to-tr from-cyan-500/30 via-violet-500/35 to-amber-400/25 blur-md pointer-events-none"
        style={{ transform: "scale(1.15)" }}
      />

      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full relative z-10 drop-shadow-[0_2px_12px_rgba(139,92,246,0.35)]"
      >
        <defs>
          <linearGradient id="infergate-grad-outer" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
          <linearGradient id="infergate-grad-core" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#a855f7" />
            <stop offset="50%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
          <radialGradient id="infergate-core-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#c084fc" stopOpacity="0.8" />
            <stop offset="70%" stopColor="#818cf8" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Outer faceted gateway ring */}
        <polygon
          points="50,6 90,26 90,74 50,94 10,74 10,26"
          stroke="url(#infergate-grad-outer)"
          strokeWidth="4"
          strokeLinejoin="round"
          className="opacity-90"
        />

        {/* Inner concentric portal facet */}
        <polygon
          points="50,18 80,33 80,67 50,82 20,67 20,33"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />

        {/* Glowing nexus core */}
        <circle cx="50" cy="50" r="18" fill="url(#infergate-core-glow)" />

        {/* The Gateway Monolith "I" & Flux lines */}
        {/* Left vertical gate pillar */}
        <path
          d="M40 34 L40 66"
          stroke="url(#infergate-grad-core)"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        {/* Right vertical gate pillar */}
        <path
          d="M60 34 L60 66"
          stroke="url(#infergate-grad-core)"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        {/* Central high-energy bridge photon */}
        <path
          d="M32 50 L68 50"
          stroke="#ffffff"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="opacity-95"
        />

        {/* Core singularity emitter */}
        <circle cx="50" cy="50" r="4" fill="#ffffff" />
      </svg>
    </motion.div>
  );
}
