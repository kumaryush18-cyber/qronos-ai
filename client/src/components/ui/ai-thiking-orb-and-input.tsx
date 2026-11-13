// AI Thinking Orb and Morphing Input Component
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Streamdown, Block } from "streamdown";
import { motion } from "framer-motion";
import { Copy, Check } from "lucide-react";
import { BlurReveal } from "./blur-reveal";
import { SponsoredIntelligenceCard, type SponsoredAdData } from "../SponsoredIntelligenceCard";
import "@/index.css";

/**
 * Splits markdown into logical visual lines/blocks while preserving code blocks and multi-line structures.
 */
function splitMarkdownIntoLinesAndBlocks(markdown: string): string[] {
  if (!markdown) return [];
  const rawLines = markdown.split("\n");
  const result: string[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        codeBlockLines.push(line);
        result.push(codeBlockLines.join("\n"));
        codeBlockLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeBlockLines.push(line);
      }
    } else if (inCodeBlock) {
      codeBlockLines.push(line);
    } else {
      if (trimmed.length > 0) {
        result.push(line);
      }
    }
  }

  if (codeBlockLines.length > 0) {
    result.push(codeBlockLines.join("\n"));
  }

  return result;
}

/**
 * Animated block component that blurs and reveals each line slowly as it appears.
 */
const AnimatedLineBlock = React.memo(function AnimatedLineBlock(props: any) {
  return (
    <motion.div
      initial={{ opacity: 0, filter: "blur(20px)", y: 16 }}
      animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
      transition={{
        duration: 0.85,
        delay: Math.min((props.index ?? 0) * 0.05, 0.4),
        ease: [0.22, 1, 0.36, 1],
      }}
      className="w-full my-1 leading-relaxed"
    >
      <Block {...props} />
    </motion.div>
  );
});

/* ───────────────────────────── copy ───────────────────────────── */
const COPY = {
  placeholder: "Ask anything…",
  labels: ["Thinking", "Searching", "Analyzing", "Composing"],
  done: "Done",
  answerTitle: "Answer",
  answerBody: "The answer goes here",
  reset: "New question",
  send: "Send",
};

type Phase = "idle" | "launch" | "assemble" | "think" | "resolve" | "condense" | "unfold" | "answered" | "reset";

export interface MorphOrbProps {
  onSubmit?: (
    text: string,
    onChunk: (chunk: string, meta?: { isReasoning?: boolean }) => void
  ) => Promise<string | void> | string;
  minThinkMs?: number;
  speed?: number;
  className?: string;
  placeholder?: string;
}

/* ─────────────────────────── geometry ─────────────────────────── */
const PILL_H = 60,
  BALL_SMALL = 60,
  ORB_D = 132,
  ORB_R = 66,
  CANVAS = 220;
const CARD_H = 140;
const FLY_D = 138;
const pillW = () => (typeof window !== "undefined" ? Math.min(560, window.innerWidth - 32) : 560);
const cardW = () => (typeof window !== "undefined" ? Math.min(480, window.innerWidth - 32) : 480);
const homeDy = () => (typeof window !== "undefined" ? window.innerHeight * 0.54 - 96 : 280);

/* ───────────────────────── math + easing ───────────────────────── */
type Ease = (t: number) => number;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const fmt = (v: number) => String(Math.round(v * 1e4) / 1e4);
const TAU = Math.PI * 2;

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cubicBezier(x1: number, y1: number, x2: number, y2: number): Ease {
  const cx = 3 * x1,
    bx = 3 * (x2 - x1) - cx,
    ax = 1 - cx - bx;
  const cy = 3 * y1,
    by = 3 * (y2 - y1) - cy,
    ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const solve = (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-6) return t;
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0,
      hi = 1;
    t = x;
    for (let i = 0; i < 40; i++) {
      const e = sx(t);
      if (Math.abs(e - x) < 1e-6) break;
      if (x > e) lo = t;
      else hi = t;
      t = (hi - lo) / 2 + lo;
    }
    return t;
  };
  return (x) => (x <= 0 ? 0 : x >= 1 ? 1 : sy(solve(x)));
}

const E = {
  out: cubicBezier(0.22, 1, 0.36, 1),
  io: cubicBezier(0.65, 0, 0.35, 1),
  in: cubicBezier(0.4, 0, 1, 1),
  fly: cubicBezier(0.5, 0, 0.1, 1),
  grow: cubicBezier(0.3, 0, 0.2, 1),
  vortex: cubicBezier(0.6, 0, 0.2, 1),
  spring: cubicBezier(0.34, 1.4, 0.64, 1),
  card: cubicBezier(0.65, 0, 0.2, 1),
  lin: (t: number) => t,
};

const bez = (t: number, p0: number, c: number, p2: number) =>
  (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * c + t * t * p2;

/* ───────────────────────── timeline data ───────────────────────── */
interface Track {
  ch: string;
  from: number;
  to: number;
  t0: number;
  t1: number;
  ease?: Ease;
}
const T = (ch: string, from: number, to: number, t0: number, t1: number, ease: Ease = E.io): Track => ({
  ch,
  from,
  to,
  t0,
  t1,
  ease,
});

interface Geo {
  pw: number;
  cw: number;
  H: number;
  dir: number;
}
const launchTracks = (g: Geo): Track[] => [
  T("w", g.pw, g.pw - 12, 0, 100, E.out),
  T("oInput", 1, 0, 0, 160, E.in),
  T("inScale", 1, 0.6, 0, 160, E.in),
  T("oGlow", 1, 0, 0, 300, E.out),
  T("oAur", 1, 0, 0, 300, E.out),
  T("w", g.pw - 12, BALL_SMALL, 100, 560, E.io),
  T("h", PILL_H, PILL_H + 6, 380, 500, E.out),
  T("h", PILL_H + 6, BALL_SMALL, 500, 620, E.out),
  T("oPill", 1, 0, 300, 560, E.out),
  T("oBall", 0, 1, 300, 560, E.out),
  T("u", 0, 1, 620, 1500, E.fly),
  T("w", BALL_SMALL, FLY_D, 620, 1300, E.grow),
  T("h", BALL_SMALL, FLY_D, 620, 1300, E.grow),
  T("w", FLY_D, ORB_D, 1300, 1500, E.out),
  T("h", FLY_D, ORB_D, 1300, 1500, E.out),
  T("cHalo", 0, 0.6, 620, 1500, E.out),
  T("trail", 0, 1, 700, 800, E.out),
  T("trail", 1, 0, 1300, 1500, E.in),
];

const ASSEMBLE: Track[] = [
  T("oRing", 1, 0, 0, 300, E.out),
  T("oBall", 1, 0, 0, 260, E.out),
  T("orb.k", 0, 1, 0, 800, E.out),
  T("orb.alpha", 0, 1, 0, 800, E.out),
  T("orb.spin", 0, 0.9, 0, 800, E.out),
  T("orb.pop", 1, 1.05, 0, 420, E.out),
  T("orb.pop", 1.05, 1, 420, 800, E.io),
  T("sOp", 0, 1, 300, 620, E.out),
  T("sTy", 6, 0, 300, 620, E.out),
];

const RESOLVE: Track[] = [
  T("orb.sweep", 0, 1, 0, 700, E.io),
  T("orb.spin", 0.9, 0.3, 0, 700, E.out),
  T("orb.gain", 1, 0, 0, 700, E.out),
  T("orb.floor", 0, 0.95, 400, 900, E.out),
  T("orb.rad", 0, 0.15, 400, 900, E.out),
  T("orb.pop", 1, 1.04, 600, 800, E.out),
  T("orb.pop", 1.04, 1, 800, 900, E.out),
];

const CONDENSE: Track[] = [
  T("orb.pop", 1, 1.06, 0, 120, E.out),
  T("sOp", 1, 0, 0, 160, E.in),
  T("sTy", 0, -6, 0, 160, E.in),
  T("orb.k", 1, 0, 120, 640, E.vortex),
  T("orb.vortex", 0, 1.6, 120, 640, E.vortex),
  T("oGreen", 0, 1, 260, 700, E.spring),
  T("gs", 0.55, 1, 260, 700, E.spring),
  T("pulse", 0, 1, 320, 760, E.out),
  T("oHalo", 0, 0.35, 380, 700, E.out),
  T("orb.alpha", 1, 0, 500, 800, E.out),
];

const unfoldTracks = (g: Geo, tw: number): Track[] => [
  T("w", ORB_D, 124, 0, 90, E.in),
  T("h", ORB_D, 124, 0, 90, E.in),
  T("w", 124, g.cw, 90, 700, E.card),
  T("h", 124, CARD_H, 90, 700, E.out),
  T("r", ORB_D / 2, 20, 90, 700, E.io),
  T("oGreen", 1, 0, 200, 560, E.out),
  T("oCard", 0, 1, 200, 560, E.out),
  T("oHalo", 0.35, 0, 300, 700, E.out),
  T("cHalo", 0.6, 0.22, 300, 700, E.out),
  T("hOp", 0, 1, 520, 840, E.out),
  T("dotS", 0, 1, 520, 840, E.spring),
  T("wp", 0, 1, 600, 600 + tw, E.lin),
  T("bloom", 1, 0.625, 700, 1200, E.io),
];

/* ─────────────────────────── async utils ─────────────────────────── */
function sleep(ms: number, sig?: AbortSignal) {
  return new Promise<void>((res) => {
    if (sig?.aborted) return res();
    let id = 0;
    const onAbort = () => {
      window.clearTimeout(id);
      res();
    };
    id = window.setTimeout(() => {
      sig?.removeEventListener("abort", onAbort);
      res();
    }, Math.max(0, ms));
    sig?.addEventListener("abort", onAbort, { once: true });
  });
}

/* ───────────────────────────── dotted orb ───────────────────────────── */
const RINGS = 16;
const DOT_LIST = (() => {
  const rand = mulberry32(7);
  const out: { x: number; y: number; z: number; u: number; seed: number }[] = [];
  for (let k = 0; k < RINGS; k++) {
    const y = 1 - ((k + 0.5) / RINGS) * 2;
    const r = Math.sqrt(1 - y * y);
    const m = Math.max(4, Math.round(30 * r));
    for (let j = 0; j < m; j++) {
      const a = (j / m) * TAU + k * 0.35;
      out.push({ x: Math.cos(a) * r, y, z: Math.sin(a) * r, u: (1 - y) / 2, seed: rand() * 6.283 });
    }
  }
  return out;
})();

const N = DOT_LIST.length;
const DX = Float32Array.from(DOT_LIST, (d) => d.x);
const DY = Float32Array.from(DOT_LIST, (d) => d.y);
const DZ = Float32Array.from(DOT_LIST, (d) => d.z);
const DU = Float32Array.from(DOT_LIST, (d) => d.u);
const DS = Float32Array.from(DOT_LIST, (d) => d.seed);

const G_STEPS = 24,
  A_STEPS = 48;
const COLORS: string[] = (() => {
  const out: string[] = [];
  for (let gi = 0; gi <= G_STEPS; gi++) {
    const g = gi / G_STEPS;
    const r = Math.round(lerp(235, 52, g)),
      gg = Math.round(lerp(235, 211, g)),
      b = Math.round(lerp(235, 153, g));
    for (let ai = 0; ai <= A_STEPS; ai++) out.push(`rgba(${r},${gg},${b},${(ai / A_STEPS).toFixed(3)})`);
  }
  return out;
})();

interface OrbParams {
  k: number;
  alpha: number;
  spin: number;
  rot: number;
  sweep: number;
  pop: number;
  vortex: number;
  gain: number;
  floor: number;
  rad: number;
  prog: number;
}

const ORB_KEYS = ["k", "alpha", "spin", "sweep", "pop", "vortex", "gain", "floor", "rad"] as const;

function createOrb(canvas: HTMLCanvasElement, getSpeed: () => number) {
  const P: OrbParams = {
    k: 0,
    alpha: 0,
    spin: 0,
    rot: 0,
    sweep: 0,
    pop: 1,
    vortex: 0,
    gain: 1,
    floor: 0,
    rad: 0,
    prog: 0,
  };
  const ctx = canvas.getContext("2d");
  const lit = new Float32Array(N);
  const SX = new Float32Array(N),
    SY = new Float32Array(N),
    SR = new Float32Array(N),
    SD = new Float32Array(N);
  const SC = new Int16Array(N);
  const pw = [1, 0, 0, 0];
  let time = 0,
    raf = 0,
    last = 0,
    dead = false;

  const reset = () => {
    P.k = 0;
    P.alpha = 0;
    P.spin = 0;
    P.rot = 0;
    P.sweep = 0;
    P.pop = 1;
    P.vortex = 0;
    P.gain = 1;
    P.floor = 0;
    P.rad = 0;
    P.prog = 0;
    lit.fill(0);
    pw[0] = 1;
    pw[1] = 0;
    pw[2] = 0;
    pw[3] = 0;
    time = 0;
  };
  reset();

  if (!ctx) return { P, ensure() {}, reset, destroy() {} };

  const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  canvas.width = Math.round(CANVAS * dpr);
  canvas.height = Math.round(CANVAS * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const S = 0.6,
    CP = Math.cos(0.35),
    SP = Math.sin(0.35),
    C0 = CANVAS / 2;

  const draw = (dt: number) => {
    ctx.clearRect(0, 0, CANVAS, CANVAS);
    time += dt;
    P.rot += P.spin * dt;
    const yaw = P.rot + P.vortex,
      cyw = Math.cos(yaw),
      syw = Math.sin(yaw);
    const stepW = dt / 0.35;
    for (let q = 0; q < 4; q++) {
      const d = (q === P.prog ? 1 : 0) - pw[q];
      pw[q] += Math.abs(d) <= stepW ? d : d > 0 ? stepW : -stepW;
    }
    const decay = Math.exp(-dt / 0.5);
    const h0 = (time * 300) % N,
      h3 = (time * 480) % N;
    const a1 = time * 0.8,
      b1 = Math.sin(time * 0.5) * 0.9;
    const f1x = Math.cos(b1) * Math.cos(a1),
      f1y = Math.sin(b1),
      f1z = Math.cos(b1) * Math.sin(a1);
    const a2 = time * 0.55 + 2.1,
      b2 = Math.cos(time * 0.42) * 0.9;
    const f2x = Math.cos(b2) * Math.cos(a2),
      f2y = Math.sin(b2),
      f2z = Math.cos(b2) * Math.sin(a2);
    const lat = Math.sin(time * 2.2);
    const swirlK = P.vortex * 1.5;

    for (let n = 0; n < N; n++) {
      const dx = DX[n],
        dy = DY[n],
        dz = DZ[n],
        u = DU[n];
      let pulse = 0;
      if (pw[0] > 0.001) {
        let dd = Math.abs(n - h0);
        if (dd > N - dd) dd = N - dd;
        const v = Math.max(0, 1 - dd / 16);
        pulse = Math.max(pulse, v * v * pw[0]);
      }
      if (pw[1] > 0.001) {
        const v1 = Math.max(0, (dx * f1x + dy * f1y + dz * f1z - 0.72) / 0.28);
        const v2 = Math.max(0, (dx * f2x + dy * f2y + dz * f2z - 0.72) / 0.28);
        const v = Math.max(v1, v2);
        pulse = Math.max(pulse, v * v * pw[1]);
      }
      if (pw[2] > 0.001) {
        const e = dy - lat;
        const v = Math.max(0, 1 - (e * e) / 0.02);
        pulse = Math.max(pulse, v * v * pw[2]);
      }
      if (pw[3] > 0.001) {
        let dd = Math.abs(n - h3);
        if (dd > N - dd) dd = N - dd;
        const v = Math.max(0, 1 - dd / 22);
        pulse = Math.max(pulse, v * v * pw[3]);
      }
      const l = Math.max(lit[n] * decay, pulse * P.gain);
      lit[n] = l;

      const ki = clamp01(P.k * (1 + S) - S * u);
      if (ki <= 0.001) {
        SC[n] = -1;
        continue;
      }
      const eo = E.out(ki),
        kk = eo * P.pop;
      const x1 = dx * cyw + dz * syw,
        z1 = -dx * syw + dz * cyw;
      const y2 = dy * CP - z1 * SP,
        z2 = dy * SP + z1 * CP;
      const f = 2.8 / (2.8 - z2),
        depth = (z2 + 1) / 2;
      let ox = x1 * ORB_R * kk * f,
        oy = -y2 * ORB_R * kk * f;
      if (swirlK > 0.001) {
        const sw = (1 - ki) * swirlK,
          cc = Math.cos(sw),
          ss = Math.sin(sw);
        const tx = ox * cc - oy * ss;
        oy = ox * ss + oy * cc;
        ox = tx;
      }
      const g = clamp01((P.sweep * 1.4 - u) / 0.4);
      let a =
        0.1 +
        0.035 * Math.sin(DS[n] + time * 1.6) * (1 - g) +
        0.32 * depth * depth +
        0.75 * l * (1 - g) +
        g * (0.55 + 0.4 * depth) +
        2 * g * (1 - g);
      a = Math.max(a, P.floor * (0.7 + 0.3 * depth));
      if (a > 1) a = 1;
      a *= eo * P.alpha;
      SX[n] = C0 + ox;
      SY[n] = C0 + oy;
      SD[n] = depth;
      SR[n] = (1.15 * (0.45 + 0.75 * depth) * f + 0.9 * l + g * 0.25) * (1 + P.rad) * (0.4 + 0.6 * eo);
      const ai = Math.round(a * A_STEPS),
        gi = Math.round(g * G_STEPS);
      SC[n] = ai <= 0 ? -1 : gi * (A_STEPS + 1) + ai;
    }

    for (let pass = 0; pass < 2; pass++) {
      for (let n = 0; n < N; n++) {
        const c = SC[n];
        if (c < 0) continue;
        if (SD[n] >= 0.5 !== (pass === 1)) continue;
        ctx.fillStyle = COLORS[c];
        ctx.beginPath();
        ctx.arc(SX[n], SY[n], SR[n], 0, TAU);
        ctx.fill();
      }
    }
  };

  const frame = (now: number) => {
    raf = 0;
    if (dead) return;
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)) * getSpeed();
    last = now;
    draw(dt);
    if (P.alpha > 0.002) raf = requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, CANVAS, CANVAS);
  };

  const ensure = () => {
    if (raf || dead || P.alpha <= 0.002) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  const destroy = () => {
    dead = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  return { P, ensure, reset, destroy };
}

/* ───────────────────────────── Component ───────────────────────────── */
export function AIThinkingOrbInput({
  onSubmit,
  minThinkMs = 1200,
  speed = 1,
  className = "",
  placeholder = COPY.placeholder,
}: MorphOrbProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [inputText, setInputText] = useState("");
  const [answerText, setAnswerText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statusText, setStatusText] = useState(COPY.labels[0]);
  const [path, setPath] = useState("");
  const [sponsoredAd, setSponsoredAd] = useState<SponsoredAdData | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbRef = useRef<ReturnType<typeof createOrb> | null>(null);
  const answerScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll answer container smoothly as tokens stream in
  useEffect(() => {
    if (isStreaming && answerScrollRef.current) {
      answerScrollRef.current.scrollTop = answerScrollRef.current.scrollHeight;
    }
  }, [answerText, isStreaming]);

  const handleCopy = async () => {
    if (!answerText) return;
    try {
      await navigator.clipboard.writeText(answerText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  // Setup rotating border path on input pill
  useEffect(() => {
    const updatePath = () => {
      if (pillRef.current) {
        const w = pillRef.current.offsetWidth;
        const h = pillRef.current.offsetHeight;
        if (w > 0 && h > 0) {
          setPath(`path('M 0 0 H ${w} V ${h} H 0 V 0')`);
        }
      }
    };
    updatePath();
    const ro = new ResizeObserver(updatePath);
    if (pillRef.current) ro.observe(pillRef.current);
    return () => ro.disconnect();
  }, [phase]);

  // Init canvas orb
  useEffect(() => {
    if (canvasRef.current) {
      orbRef.current = createOrb(canvasRef.current, () => speed);
    }
    return () => {
      orbRef.current?.destroy();
    };
  }, [speed]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = inputText.trim();
    if (!query || phase !== "idle") return;

    setPhase("launch");

    // Launch phase animation
    await sleep(300);
    setPhase("assemble");

    // Start 3D orb spinning
    if (orbRef.current) {
      orbRef.current.P.k = 1;
      orbRef.current.P.alpha = 1;
      orbRef.current.P.spin = 0.9;
      orbRef.current.ensure();
    }

    await sleep(400);
    setPhase("think");

    // Status label cycle
    let labelIdx = 0;
    const labelTimer = setInterval(() => {
      labelIdx = (labelIdx + 1) % COPY.labels.length;
      setStatusText(COPY.labels[labelIdx]);
      if (orbRef.current) {
        orbRef.current.P.prog = labelIdx % 4;
      }
    }, 700);

    let hasOpenedBox = false;
    let accumulatedText = "";
    let accumulatedReasoning = "";

    const openAnswerBox = () => {
      if (hasOpenedBox) return;
      hasOpenedBox = true;
      clearInterval(labelTimer);
      if (orbRef.current) {
        orbRef.current.P.k = 0;
        orbRef.current.P.alpha = 0;
      }
      setPhase("answered");
      setIsStreaming(true);
    };

    const handleChunk = (chunk: string, meta?: { isReasoning?: boolean }) => {
      openAnswerBox();
      if (meta?.isReasoning) {
        accumulatedReasoning += chunk;
      } else {
        accumulatedText += chunk;
      }

      if (accumulatedReasoning && accumulatedText) {
        setAnswerText(
          `> 💭 *Thinking process:*\n> ${accumulatedReasoning.replace(/\n/g, "\n> ")}\n\n---\n\n${accumulatedText}`
        );
      } else if (accumulatedReasoning) {
        setAnswerText(
          `> 💭 *Thinking process:*\n> ${accumulatedReasoning.replace(/\n/g, "\n> ")}`
        );
      } else {
        setAnswerText(accumulatedText);
      }
    };

    try {
      if (onSubmit) {
        const result = await onSubmit(query, handleChunk);
        if (!hasOpenedBox && typeof result === "string" && result) {
          openAnswerBox();
          setAnswerText(result);
        }
      } else {
        await sleep(minThinkMs);
        openAnswerBox();
        setAnswerText(COPY.answerBody);
      }
    } catch (err: any) {
      openAnswerBox();
      setAnswerText(err?.message || "Failed to generate answer.");
    } finally {
      clearInterval(labelTimer);
      setIsStreaming(false);
      setPhase("answered");

      // Fetch contextual sponsored intelligence card
      try {
        fetch("/api/ads/thrad/bid", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: query, assistantResponse: accumulatedText }),
        })
          .then((res) => (res.status === 200 ? res.json() : null))
          .then((ad) => {
            if (ad) setSponsoredAd(ad);
          })
          .catch(() => {});
      } catch {}
    }
  };

  const handleReset = () => {
    orbRef.current?.reset();
    setInputText("");
    setAnswerText("");
    setSponsoredAd(null);
    setIsStreaming(false);
    setCopied(false);
    setStatusText(COPY.labels[0]);
    setPhase("idle");
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full max-w-2xl mx-auto flex flex-col items-center justify-center min-h-[380px] p-4 ${className}`}
    >
      {/* 3D Dotted Canvas Container */}
      <div
        className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-all duration-700 ${
          phase === "assemble" || phase === "think" || phase === "resolve"
            ? "opacity-100 scale-100"
            : "opacity-0 scale-75"
        }`}
      >
        <div className="relative">
          <canvas
            ref={canvasRef}
            style={{ width: CANVAS, height: CANVAS }}
            className="block rounded-full drop-shadow-[0_0_40px_rgba(255,255,255,0.25)]"
          />
          {/* Status Label beneath orb */}
          <div className="text-center mt-3 font-mono text-xs text-zinc-300 tracking-wider flex items-center justify-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span>{statusText}…</span>
          </div>
        </div>
      </div>

      {/* Answer Card State - Fixed Bounded Scrolling with BlurReveal & ChatGPT-style Action Row */}
      {(phase === "unfold" || phase === "answered") && (
        <div
          className={`relative w-full max-w-2xl rounded-2xl border transition-all duration-500 bg-[#0e1017]/95 backdrop-blur-2xl p-5 sm:p-7 shadow-[0_0_60px_rgba(255,255,255,0.06)] animate-in fade-in zoom-in-95 duration-500 flex flex-col text-left overflow-hidden ${
            isStreaming
              ? "border-cyan-500/40 ring-1 ring-cyan-500/20 shadow-[0_0_50px_rgba(6,182,212,0.15)]"
              : "border-white/15"
          }`}
        >
          {/* Ambient Blue Reveal Glow behind card during streaming */}
          {isStreaming && (
            <div className="pointer-events-none absolute -inset-1 rounded-2xl bg-gradient-to-r from-blue-500/10 via-cyan-500/15 to-indigo-500/10 blur-xl opacity-75 animate-pulse" />
          )}

          <div className="relative z-10 flex items-center justify-between pb-3.5 border-b border-white/10 mb-3.5 flex-wrap gap-2 shrink-0">
            <div className="flex items-center gap-2.5">
              <span className={`w-2 h-2 rounded-full ${isStreaming ? "bg-cyan-400 animate-ping shadow-[0_0_8px_#22d3ee]" : "bg-emerald-400"}`} />
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-300 font-bold">{COPY.answerTitle}</span>
              {isStreaming ? (
                <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/25 px-2 py-0.5 rounded-full animate-pulse flex items-center gap-1.5 shadow-[0_0_12px_rgba(6,182,212,0.25)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  Streaming live…
                </span>
              ) : (
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-full">
                  Completed
                </span>
              )}
            </div>
            <button
              onClick={handleReset}
              className="text-xs font-mono text-zinc-400 hover:text-white px-3 py-1 rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition cursor-pointer"
            >
              {COPY.reset}
            </button>
          </div>

          {/* Bounded Fixed Scrolling Area with Line-by-Line Blur Reveal */}
          <div
            ref={answerScrollRef}
            className="relative z-10 max-h-[min(480px,calc(100vh-320px))] min-h-[140px] overflow-y-auto overscroll-contain pr-2 select-text text-left prose prose-invert prose-sm text-zinc-200 leading-relaxed max-w-none break-words"
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: isStreaming
                ? "rgba(6, 182, 212, 0.4) transparent"
                : "rgba(255, 255, 255, 0.2) transparent",
            }}
          >
            <Streamdown
              mode="streaming"
              parseMarkdownIntoBlocksFn={splitMarkdownIntoLinesAndBlocks}
              BlockComponent={AnimatedLineBlock}
            >
              {answerText}
            </Streamdown>
            {isStreaming && (
              <span className="inline-block w-2 h-4 ml-1.5 align-middle bg-cyan-400 animate-pulse rounded-sm shadow-[0_0_8px_#22d3ee]" />
            )}
          </div>

          {/* ChatGPT-style Action Row at the bottom */}
          {!isStreaming && answerText && (
            <>
              <div className="mt-3 pt-3 border-t border-white/[0.08] flex items-center justify-between gap-3 text-xs font-mono text-zinc-400 shrink-0">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-zinc-300 hover:text-white hover:bg-white/[0.08] hover:border-white/20 transition-all cursor-pointer font-medium active:scale-95"
                  title="Copy response to clipboard"
                >
                  {copied ? (
                    <>
                      <Check size={13} className="text-emerald-400" />
                      <span className="text-emerald-400 font-semibold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={13} className="text-zinc-400" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
                <span className="text-[11px] text-zinc-500 font-mono">
                  {answerText.length.toLocaleString()} characters
                </span>
              </div>

              {/* Native Sponsored Intelligence Card */}
              {sponsoredAd && <SponsoredIntelligenceCard ad={sponsoredAd} />}
            </>
          )}
        </div>
      )}

      {/* Main Morphing Input Pill with Rotating Border Light */}
      {(phase === "idle" || phase === "launch") && (
        <div
          ref={pillRef}
          style={{
            ["--duration" as any]: 6,
            ["--light-width" as any]: "140px",
            ["--light-color" as any]: "rgba(255,255,255,0.9)",
            ["--path" as any]: path,
            isolation: "isolate",
          }}
          className={`relative w-full rounded-full p-[1.5px] overflow-hidden transition-all duration-500 ${
            phase === "launch" ? "scale-90 opacity-0" : "scale-100 opacity-100"
          }`}
        >
          {/* Rotating Light Beam around Input Pill Border */}
          {path && (
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

          {/* Inner Input Surface - Responsive across all mobile & desktop viewports */}
          <form
            onSubmit={handleSubmit}
            className="relative z-10 flex items-center justify-between w-full min-h-[48px] sm:min-h-[56px] md:h-[60px] rounded-full bg-[#0a0c10]/95 backdrop-blur-2xl border border-white/10 px-3 sm:px-5 py-1.5 transition-all focus-within:border-white/30 shadow-lg"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={placeholder}
              className="min-w-0 flex-1 bg-transparent text-xs sm:text-sm md:text-base text-white placeholder:text-zinc-500 focus:outline-none font-sans mr-2 sm:mr-3 py-1"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="px-3.5 sm:px-5 py-1.5 sm:py-2 rounded-full text-[11px] sm:text-xs font-mono font-bold bg-white text-black hover:bg-zinc-200 disabled:opacity-40 disabled:hover:bg-white transition-all active:scale-95 cursor-pointer shadow-sm shrink-0 whitespace-nowrap"
            >
              {COPY.send}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default AIThinkingOrbInput;
