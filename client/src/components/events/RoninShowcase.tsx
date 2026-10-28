import React, { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Trophy, Zap } from "lucide-react";

const VERT_SHADER = `#version 300 es
in vec2 p;
void main() {
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

const FRAG_SHADER = `#version 300 es
precision highp float;
uniform sampler2D img;
uniform vec2 r;
uniform float t;
uniform vec2 m;
uniform vec2 o;
uniform float ia;
out vec4 fragColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float dn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

vec2 curl(vec2 p) {
  float e = 0.05;
  float n1 = dn(p + vec2(0.0, e)), n2 = dn(p - vec2(0.0, e));
  float n3 = dn(p + vec2(e, 0.0)), n4 = dn(p - vec2(e, 0.0));
  return vec2(n1 - n2, -(n3 - n4)) / (2.0 * e);
}

float lum(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

vec3 BLUE(float y) {
  return mix(vec3(0.0, 0.29, 0.485), vec3(0.0, 0.243, 0.465), y);
}

vec3 grain(vec3 c, float amt) {
  return c + (hash(gl_FragCoord.xy + fract(t * 7.0) * 91.0) - 0.5) * amt * 0.55;
}

void main() {
  vec2 uv = gl_FragCoord.xy / r;
  float SA = r.x / r.y;
  vec2 cam = (m - 0.5) * vec2(0.02, 0.014) + vec2(sin(t * 0.11), sin(t * 0.083 + 1.0)) * 0.004;
  float t1 = t;

  // Exact vertical sizing so head & sword are 100% visible and not cut off
  float Z = 1.0;
  float W = ia * Z;

  // Flush right: touches the card right end with zero gap
  float x0 = SA - W + 0.005;
  vec2 iu = vec2((uv.x * SA - x0) / W, 0.5 + (uv.y - 0.5) / Z) + cam;

  // Breathing animation centered on chest
  iu = (iu - vec2(0.55, 0.55)) * (1.0 - 0.006 * sin(t1 * 0.9)) + vec2(0.55, 0.55);

  // Background smoothly blends from dark obsidian on the left (where text lives) into Klein blue on the right
  vec3 darkObsidian = vec3(0.04, 0.045, 0.06);
  vec3 c = mix(darkObsidian, BLUE(uv.y), smoothstep(0.2, 0.7, uv.x));

  float inside = step(0.0, iu.x) * step(iu.x, 1.0) * step(0.0, iu.y) * step(iu.y, 1.0);

  if (inside > 0.0) {
    vec3 b0 = texture(img, iu).rgb;
    float bg = smoothstep(0.14, 0.04, length(b0 - BLUE(iu.y)));

    // Wisps streaming up and to the right from shoulders
    float wisp = (1.0 - bg) * smoothstep(0.62, 0.8, iu.y) * smoothstep(0.12, 0.3, iu.x);
    float ph = fract(t1 / 3.2), ph2 = fract(t1 / 3.2 + 0.5), w = abs(ph - 0.5) * 2.0;
    vec2 dir = vec2(0.035, 0.06) + curl(iu * vec2(5.0, 7.0) + t1 * 0.1) * 0.006;
    vec2 a1 = iu - dir * (ph - 0.5) * wisp;
    vec2 a2 = iu - dir * (ph2 - 0.5) * wisp;
    vec3 col = mix(texture(img, a1).rgb, texture(img, a2).rgb, w);

    // Light running down the katana blade (hilt -> tip)
    vec2 A = vec2(0.07, 0.74), B = vec2(0.74, 0.17);
    vec2 pa = iu - A, ba = B - A;
    float hh = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float dist = length((pa - ba * hh) * vec2(ia, 1.0));
    float runner = fract(t1 * 0.22);
    float band = exp(-pow((hh - runner * 1.3 + 0.15) / 0.06, 2.0));
    float steel = smoothstep(0.55, 0.85, lum(col)) * smoothstep(0.06, 0.01, dist);
    col += vec3(0.75, 0.88, 1.0) * steel * band * 0.9;
    col += vec3(0.7, 0.85, 1.0) * exp(-dist * 120.0) * band * 0.25;

    // Red flecks on robe smoulder
    float red = smoothstep(0.25, 0.45, col.r - max(col.g, col.b)) * (1.0 - bg);
    col += col * red * 0.45 * (0.5 + 0.5 * sin(t1 * 2.3 + iu.x * 40.0 + iu.y * 30.0));

    // Melt edges smoothly
    float e = smoothstep(0.0, 0.06, iu.x) * smoothstep(0.0, 0.03, iu.y) * smoothstep(1.0, 0.97, iu.y);
    c = mix(c, col, e);
  }

  // Drifting silver sparks and red embers
  for (int i = 0; i < 2; i++) {
    float k = float(i);
    float sc = k < 0.5 ? 42.0 : 24.0;
    vec2 g = vec2(uv.x * SA * sc - t1 * (1.2 + k), uv.y * sc - t1 * (2.2 + k * 1.5));
    vec2 id = floor(g), f = fract(g) - 0.5;
    float rn = hash(id + k * 9.0);
    f += 0.25 * vec2(sin(t1 * 1.7 + rn * 40.0), cos(t1 * 1.3 + rn * 20.0));
    float s = smoothstep(0.08, 0.0, length(f * vec2(1.0, 0.55))) * step(k < 0.5 ? 0.975 : 0.985, rn);
    float near = smoothstep(SA - W * 1.1, SA - W * 0.2, uv.x * SA) * smoothstep(0.2, 0.7, uv.y);
    c += (k < 0.5 ? vec3(0.75, 0.85, 1.0) : vec3(1.0, 0.2, 0.18)) * s * near * (0.5 + 0.5 * sin(t1 * 5.0 + rn * 60.0));
  }

  // Hand-inked fine paper grain
  c *= 1.0 + 0.04 * (dn(uv * vec2(SA, 1.0) * 220.0) - 0.5);
  fragColor = vec4(grain(c, 0.02), 1.0);
}
`;

export function SwordsmanHero({
  ongoingCount = 1,
  upcomingCount = 2,
}: {
  ongoingCount?: number;
  upcomingCount?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
    if (!gl) return;

    let animId: number;
    let isDisposed = false;

    const createShader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };

    const prog = gl.createProgram()!;
    gl.attachShader(prog, createShader(gl.VERTEX_SHADER, VERT_SHADER));
    gl.attachShader(prog, createShader(gl.FRAGMENT_SHADER, FRAG_SHADER));
    gl.bindAttribLocation(prog, 0, "p");
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const U = (name: string) => gl.getUniformLocation(prog, name);
    const ur = U("r"), ut = U("t"), um = U("m"), uo = U("o"), uia = U("ia");
    gl.uniform1i(U("img"), 0);

    const loadTexture = (src: string): Promise<HTMLImageElement | null> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          if (isDisposed) return resolve(null);
          const tex = gl.createTexture();
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          gl.generateMipmap(gl.TEXTURE_2D);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          resolve(img);
        };
        img.onerror = () => resolve(null);
        img.src = src;
      });
    };

    const handleResize = () => {
      if (!canvas || !containerRef.current) return;
      const d = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth || containerRef.current.clientWidth || 900;
      const height = canvas.clientHeight || containerRef.current.clientHeight || 420;
      canvas.width = width * d;
      canvas.height = height * d;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const ro = new ResizeObserver(handleResize);
    ro.observe(canvas);
    if (containerRef.current) ro.observe(containerRef.current);
    handleResize();

    let mx = 0.5, my = 0.5, tx = 0.5, ty = 0.5;
    let isVisible = true;

    const handlePointerMove = (e: PointerEvent) => {
      if (!canvas) return;
      const b = canvas.getBoundingClientRect();
      tx = (e.clientX - b.left) / b.width;
      ty = 1 - (e.clientY - b.top) / b.height;
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    const io = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
    });
    io.observe(canvas);

    loadTexture("/ronin/scene.jpg").then((sceneImg) => {
      if (!sceneImg || isDisposed) return;
      gl.useProgram(prog);
      gl.uniform1f(uia, sceneImg.width / sceneImg.height);
      gl.uniform2f(uo, 0.5, 0.5);

      const t0 = performance.now();
      const render = (now: number) => {
        if (isDisposed) return;
        animId = requestAnimationFrame(render);
        if (!isVisible) return;

        mx += (tx - mx) * 0.05;
        my += (ty - my) * 0.05;

        gl.uniform2f(ur, canvas.width, canvas.height);
        gl.uniform1f(ut, (now - t0) / 1000);
        gl.uniform2f(um, mx, my);

        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };

      animId = requestAnimationFrame(render);
    });

    return () => {
      isDisposed = true;
      cancelAnimationFrame(animId);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
      const loseContext = gl.getExtension("WEBGL_lose_context");
      if (loseContext) loseContext.loseContext();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        backgroundColor: "#07080d",
        borderColor: "oklch(0.28 0 0)",
        boxShadow: "0 25px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.08)",
      }}
      className="relative overflow-hidden rounded-3xl border min-h-[380px] sm:min-h-[420px] md:min-h-[460px] flex items-center p-6 sm:p-10 shadow-2xl transition-all"
    >
      {/* Interactive WebGL2 Animated Swordsman Canvas */}
      <canvas
        ref={canvasRef}
        data-bg
        className="absolute inset-0 w-full h-full pointer-events-none z-0 block"
        style={{
          backgroundImage: "url(/ronin/scene.jpg)",
          backgroundPosition: "right center",
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat",
        }}
      />

      {/* Subtle overlay gradient on mobile so text remains 100% readable while swordsman animates on right */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/40 to-transparent pointer-events-none z-[1] sm:hidden" />

      {/* Clean Events Page Hero Content (No copied graphic novel text) */}
      <div className="relative z-10 max-w-xl space-y-4">
        {/* Status Tags */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400 backdrop-blur-md shadow-[0_0_15px_rgba(16,185,129,0.2)]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            {ongoingCount} Ongoing Challenge
          </span>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-[10px] font-mono text-zinc-300 backdrop-blur-md">
            <Sparkles size={11} className="text-zinc-200" />
            {upcomingCount} Upcoming Drops
          </span>
        </div>

        {/* Big Catchy Metallic Silver Headline for the Events Hub */}
        <div className="space-y-2 pt-1">
          <h1
            className="text-3xl sm:text-5xl lg:text-6xl font-black font-mono tracking-tight uppercase select-none leading-[0.95]"
            style={{
              background:
                "linear-gradient(180deg, #FFFFFF 0%, #F4F4F5 25%, #A1A1AA 55%, #FFFFFF 85%, #71717A 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0px 2px 16px rgba(255, 255, 255, 0.4))",
            }}
          >
            COMMUNITY EVENTS &amp; SPRINTS
          </h1>
          <p className="text-xs sm:text-sm text-zinc-300 font-mono leading-relaxed max-w-lg">
            Participate in high-scale developer challenges, unlock milestone token packs, and test your agentic pipelines against frontier model quotas.
          </p>
        </div>

        {/* Feature Highlights Pills */}
        <div className="pt-2 flex items-center gap-3 text-xs font-mono text-zinc-400 flex-wrap">
          <span className="flex items-center gap-1.5 text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
            <Trophy size={13} className="text-emerald-400" /> +10M Tokens per 5 Invites
          </span>
          <span className="text-zinc-500">•</span>
          <span className="text-zinc-300">Independent 48-Hour Pack Timers</span>
        </div>
      </div>
    </div>
  );
}

// Backwards-compatible export
export const RoninShowcase = SwordsmanHero;
export default SwordsmanHero;
