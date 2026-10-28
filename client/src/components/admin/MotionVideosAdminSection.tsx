import React, { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Film, Download, ExternalLink, Play, Pause, Volume2, VolumeX, Maximize2, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";

interface VideoCardProps {
  title: string;
  category: string;
  filename: string;
  src: string;
  size: string;
  description: string;
}

function VideoPreviewCard({ title, category, filename, src, size, description }: VideoCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [copied, setCopied] = useState(false);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  const copyUrl = async () => {
    const fullUrl = `${window.location.origin}${src}`;
    await navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    toast.success("Video local link copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        backgroundColor: "oklch(0.12 0 0)",
        borderColor: "oklch(0.24 0 0)",
      }}
      className="rounded-2xl border p-4 sm:p-5 flex flex-col justify-between space-y-4 shadow-xl overflow-hidden group transition-all duration-300 hover:border-white/20"
    >
      <div className="space-y-3">
        {/* Header Tags */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Badge className="bg-white/10 text-white border border-white/15 font-mono text-[10px] font-bold">
            {category}
          </Badge>
          <span className="text-[11px] font-mono text-zinc-400 bg-black/40 px-2.5 py-0.5 rounded-full border border-white/10">
            {size}
          </span>
        </div>

        {/* Video Player */}
        <div className="relative rounded-xl overflow-hidden aspect-video bg-black border border-white/10 group/player">
          <video
            ref={videoRef}
            src={src}
            autoPlay
            loop
            muted
            playsInline
            controls
            className="w-full h-full object-cover"
          />

          {/* Quick Floating Overlay Controls */}
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 opacity-0 group-hover/player:opacity-100 transition-opacity bg-black/70 backdrop-blur-md p-1 rounded-lg border border-white/15">
            <button
              type="button"
              onClick={togglePlay}
              className="p-1.5 text-zinc-300 hover:text-white transition-colors"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause size={13} /> : <Play size={13} />}
            </button>
            <button
              type="button"
              onClick={toggleMute}
              className="p-1.5 text-zinc-300 hover:text-white transition-colors"
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
            </button>
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-zinc-300 hover:text-white transition-colors"
              title="Open video in new tab"
            >
              <Maximize2 size={13} />
            </a>
          </div>
        </div>

        {/* Video Info */}
        <div className="space-y-1">
          <h3 className="text-sm sm:text-base font-bold text-white font-mono tracking-tight">
            {title}
          </h3>
          <p className="text-xs text-zinc-400 font-mono leading-relaxed">
            {description}
          </p>
          <p className="text-[10px] text-zinc-500 font-mono pt-0.5 select-all">
            Asset: <span className="text-zinc-300 font-semibold">{filename}</span>
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between gap-2 flex-wrap">
        <Button
          type="button"
          onClick={copyUrl}
          variant="outline"
          className="h-8 px-3 rounded-lg border-white/15 bg-black/40 text-xs font-mono text-zinc-300 hover:text-white hover:bg-white/10 cursor-pointer"
        >
          {copied ? <Check size={12} className="mr-1.5 text-emerald-400" /> : <Sparkles size={12} className="mr-1.5 text-zinc-400" />}
          <span>{copied ? "Copied" : "Copy Link"}</span>
        </Button>

        <a
          href={src}
          download={filename}
          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-white text-black hover:bg-zinc-200 text-xs font-mono font-bold transition-all shadow-sm"
        >
          <Download size={12} />
          <span>Download MP4</span>
        </a>
      </div>
    </div>
  );
}

export function MotionVideosAdminSection() {
  return (
    <section
      style={{
        backgroundColor: "oklch(0.14 0 0)",
        borderColor: "oklch(0.26 0 0)",
        boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
      className="rounded-3xl border p-5 sm:p-7 shadow-2xl space-y-6 mt-6"
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            <p className="text-[10px] font-bold uppercase tracking-[.18em] font-mono text-zinc-400">
              MotionSites AI Video Showcase
            </p>
            <Badge className="bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 font-mono text-[10px]">
              2 Full HD Assets Loaded
            </Badge>
          </div>
          <h2 className="mt-1 text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
            <Film size={20} className="text-cyan-400" />
            <span>High-Definition Animated Motion Backgrounds</span>
          </h2>
          <p className="mt-1 text-xs text-zinc-400 max-w-2xl leading-relaxed">
            Locally hosted 1080p full-resolution video assets downloaded from MotionSites AI. View, play, and inspect them below with zero CloudFront access restrictions.
          </p>
        </div>
      </div>

      {/* 2-Video Responsive Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <VideoPreviewCard
          title="Lunar Surface & Giant Planet Crescent"
          category="Space / Dark"
          filename="lunar-crescent-bwxlb9yeti.mp4"
          src="/videos/lunar-crescent-bwxlb9yeti.mp4"
          size="31.8 MB"
          description="High-definition cinematic render of a rocky cratered moon surface overlooking a massive crescent planet with atmospheric glow."
        />

        <VideoPreviewCard
          title="Surreal Architectural Arch in Water"
          category="Surreal / Dark"
          filename="water-arch-l61516jisf.mp4"
          src="/videos/water-arch-l61516jisf.mp4"
          size="1.2 MB"
          description="Monolithic stone gateway standing in calm night waters between shadowy mountain ranges with shimmering light reflections."
        />
      </div>
    </section>
  );
}

export default MotionVideosAdminSection;
