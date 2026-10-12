import React, { useEffect, useRef } from "react";
import * as THREE from "three";

export interface VortexHourglassProps {
  background?: string;
  topRadius?: number;
  waistRadius?: number;
  waistPosition?: number;
  bottomRadius?: number;
  twist?: number;
  zoom?: number;
  speed?: number;
  direction?: "left" | "right";
  lineOptions?: {
    count?: number;
    color?: string;
    glow?: number;
  };
  dots?: boolean;
  dotOptions?: {
    count?: number;
    size?: number;
    color?: string;
    glow?: number;
    flicker?: number;
  };
  comets?: boolean;
  cometOptions?: {
    count?: number;
    speed?: number;
    color?: string;
    glow?: number;
    tail?: number;
    delay?: number;
    collide?: number;
  };
  repel?: boolean;
  repelOptions?: {
    radius?: number;
    strength?: number;
  };
  className?: string;
  style?: React.CSSProperties;
}

const DEFAULT_LINE_OPTS = { count: 240, color: "#ffffff", glow: 10 };
const DEFAULT_DOT_OPTS = { count: 8000, size: 20, color: "#ffffff", glow: 10, flicker: 10 };
const DEFAULT_COMET_OPTS = { count: 10, speed: 6, color: "#eca8d6", glow: 6, tail: 19, delay: 8, collide: 6 };
const DEFAULT_REPEL_OPTS = { radius: 60, strength: 10 };

const TWO_PI = 2 * Math.PI;
const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);
const zoomToFov = (zoom: number) => clamp(134 - zoom, 1, 175);
const TICK_INTERVAL = 1 / 30;

function hermiteEase(t: number, edge0: number, edge1: number): number {
  if (t <= edge0) return 0;
  if (t >= edge1) return 1;
  const x = (t - edge0) / (edge1 - edge0);
  return 1 - (1 - x) * (1 - x) * (1 - x);
}

function buildSpline(points: [number, number][]): (t: number) => number {
  const len = points.length;
  const slopes: number[] = [];
  for (let i = 0; i < len - 1; i++) {
    slopes[i] = (points[i + 1][1] - points[i][1]) / (points[i + 1][0] - points[i][0]);
  }
  const tangents: number[] = [slopes[0]];
  for (let i = 1; i < len - 1; i++) {
    tangents[i] = slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2;
  }
  tangents[len - 1] = slopes[len - 2];

  for (let i = 0; i < len - 1; i++) {
    if (Math.abs(slopes[i]) < 1e-12) {
      tangents[i] = tangents[i + 1] = 0;
      continue;
    }
    const t0 = tangents[i] / slopes[i];
    const t1 = tangents[i + 1] / slopes[i];
    const mag = t0 * t0 + t1 * t1;
    if (mag > 9) {
      const s = 3 / Math.sqrt(mag);
      tangents[i] = s * t0 * slopes[i];
      tangents[i + 1] = s * t1 * slopes[i];
    }
  }

  return (x: number) => {
    if (x <= points[0][0]) return points[0][1];
    if (x >= points[len - 1][0]) return points[len - 1][1];
    let idx = 0;
    while (idx < len - 2 && points[idx + 1][0] < x) idx++;
    const span = points[idx + 1][0] - points[idx][0];
    const s = (x - points[idx][0]) / span;
    const s2 = s * s;
    const s3 = s2 * s;
    return (
      (2 * s3 - 3 * s2 + 1) * points[idx][1] +
      (s3 - 2 * s2 + s) * span * tangents[idx] +
      (-2 * s3 + 3 * s2) * points[idx + 1][1] +
      (s3 - s2) * span * tangents[idx + 1]
    );
  };
}

function sampleLut(fn: (t: number) => number): Float32Array {
  const lut = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    lut[i] = fn(i / 1023);
  }
  return lut;
}

function readLut(lut: Float32Array, t: number): number {
  if (t <= 0) return lut[0];
  const maxIdx = lut.length - 1;
  if (t >= 1) return lut[maxIdx];
  const scaled = t * maxIdx;
  const idx = scaled | 0;
  return lut[idx] + (lut[idx + 1] - lut[idx]) * (scaled - idx);
}

export function VortexHourglass({
  background = "#000000",
  topRadius = 380,
  waistRadius = 53,
  waistPosition = 50,
  bottomRadius = 1150,
  twist = 3,
  zoom = 75,
  speed = 10,
  direction = "right",
  lineOptions = DEFAULT_LINE_OPTS,
  dots = true,
  dotOptions = DEFAULT_DOT_OPTS,
  comets = true,
  cometOptions = DEFAULT_COMET_OPTS,
  repel = true,
  repelOptions = DEFAULT_REPEL_OPTS,
  className,
  style,
}: VortexHourglassProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const mergedLine = { ...DEFAULT_LINE_OPTS, ...lineOptions };
  const mergedDot = { ...DEFAULT_DOT_OPTS, ...dotOptions };
  const mergedComet = { ...DEFAULT_COMET_OPTS, ...cometOptions };
  const mergedRepel = { ...DEFAULT_REPEL_OPTS, ...repelOptions };

  const configRef = useRef({
    floorRadius: bottomRadius / 60,
    waistRadius: waistRadius / 60,
    crownRadius: topRadius / 60,
    waistAt: 1 - waistPosition / 100,
    twist,
    zoom,
    flowDir: direction === "left" ? -1 : 1,
    flowSpeed: (speed / 100) * (direction === "left" ? -1 : 1),
    lineCount: mergedLine.count,
    lineColor: mergedLine.color,
    lineGlow: (mergedLine.glow / 10) * 1,
    showDots: dots,
    dotCount: mergedDot.count,
    dotSize: mergedDot.size / 1000,
    dotColor: mergedDot.color,
    dotGlow: (mergedDot.glow / 10) * 4.2,
    dotFlicker: mergedDot.flicker / 10,
    showComets: comets,
    cometCount: mergedComet.count,
    cometSpeed: (mergedComet.speed / 10) * 0.15,
    cometColor: mergedComet.color,
    cometGlow: (mergedComet.glow / 10) * 1,
    cometTail: mergedComet.tail,
    cometDelay: mergedComet.delay,
    collideForce: mergedComet.collide / 10,
    hoverRepel: repel,
    repelRadius: mergedRepel.radius,
    repelStrength: mergedRepel.strength,
    running: true,
  });

  // Keep configRef synchronized with any updated props
  useEffect(() => {
    configRef.current = {
      floorRadius: bottomRadius / 60,
      waistRadius: waistRadius / 60,
      crownRadius: topRadius / 60,
      waistAt: 1 - waistPosition / 100,
      twist,
      zoom,
      flowDir: direction === "left" ? -1 : 1,
      flowSpeed: (speed / 100) * (direction === "left" ? -1 : 1),
      lineCount: mergedLine.count,
      lineColor: mergedLine.color,
      lineGlow: (mergedLine.glow / 10) * 1,
      showDots: dots,
      dotCount: mergedDot.count,
      dotSize: mergedDot.size / 1000,
      dotColor: mergedDot.color,
      dotGlow: (mergedDot.glow / 10) * 4.2,
      dotFlicker: mergedDot.flicker / 10,
      showComets: comets,
      cometCount: mergedComet.count,
      cometSpeed: (mergedComet.speed / 10) * 0.15,
      cometColor: mergedComet.color,
      cometGlow: (mergedComet.glow / 10) * 1,
      cometTail: mergedComet.tail,
      cometDelay: mergedComet.delay,
      collideForce: mergedComet.collide / 10,
      hoverRepel: repel,
      repelRadius: mergedRepel.radius,
      repelStrength: mergedRepel.strength,
      running: true,
    };
  }, [
    bottomRadius,
    waistRadius,
    topRadius,
    waistPosition,
    twist,
    zoom,
    direction,
    speed,
    mergedLine,
    dots,
    mergedDot,
    comets,
    mergedComet,
    repel,
    mergedRepel,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let animId = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const disposables: { dispose: () => void }[] = [];
    let onPointerMove: ((e: PointerEvent) => void) | null = null;
    let onPointerLeave: (() => void) | null = null;

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.25;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(zoomToFov(configRef.current.zoom), 1, 0.1, 500);
      const rootGroup = new THREE.Group();
      scene.add(rootGroup);

      const repelUniforms = {
        uMouse: { value: new THREE.Vector2(0, 0) },
        uAspect: { value: 1 },
        uRadius: { value: 0.2 },
        uStrength: { value: 0 },
      };

      const injectRepelShader = <T extends THREE.Material>(material: T): T => {
        material.onBeforeCompile = (shader) => {
          shader.uniforms.uMouse = repelUniforms.uMouse;
          shader.uniforms.uAspect = repelUniforms.uAspect;
          shader.uniforms.uRadius = repelUniforms.uRadius;
          shader.uniforms.uStrength = repelUniforms.uStrength;
          shader.vertexShader = shader.vertexShader
            .replace(
              "void main() {",
              `
              uniform vec2 uMouse;
              uniform float uAspect;
              uniform float uRadius;
              uniform float uStrength;
              void main() {
              `
            )
            .replace(
              "#include <fog_vertex>",
              `
              #include <fog_vertex>
              if (uStrength > 0.0 && uRadius > 0.0 && gl_Position.w > 0.0) {
                vec2 ndc = gl_Position.xy / gl_Position.w;
                vec2 off = ndc - uMouse;
                float dist = length(off * vec2(uAspect, 1.0));
                float f = uStrength * exp(-(dist * dist) / (2.0 * uRadius * uRadius));
                float m = length(off);
                if (m > 1e-4) {
                  ndc += (off / m) * f;
                  gl_Position.xy = ndc * gl_Position.w;
                }
              }
              `
            );
        };
        return material;
      };

      const track = <T extends { dispose: () => void }>(res: T): T => {
        disposables.push(res);
        return res;
      };

      interface LineStrand {
        lane: number;
        speed: number;
        pulse: number;
        wobblePhase: number;
        from: number;
        to: number;
        bright: number;
        offset: number;
        pts: Float32Array;
        cols: Float32Array;
      }

      interface DotItem {
        s: number;
        lane: number;
        strand: number;
        pulse: number;
        flickerRate: number;
        bright: number;
      }

      interface CometItem {
        bright: number;
        lane: number;
        speed: number;
        pulse: number;
        wobblePhase: number;
        base: number;
        boost: number;
        boostMul: number;
        racing: boolean;
        s: number;
        idle: number;
        idleFor: number;
        trail: Float32Array;
        trailCol: Float32Array;
        geo: THREE.BufferGeometry;
        line: THREE.Line;
        head: THREE.Sprite;
      }

      interface Shockwave {
        active: boolean;
        x: number;
        y: number;
        z: number;
        at: number;
        amp: number;
      }

      let strands: LineStrand[] = [];
      let linePos = new Float32Array(0);
      let lineCol = new Float32Array(0);
      let lineGeo: THREE.BufferGeometry | null = null;

      let dotsData: DotItem[] = [];
      let totalDots = 0;
      let dotMesh: THREE.InstancedMesh | null = null;
      let dotColors = new Float32Array(0);
      let dotPosArr = new Float32Array(0);
      let dotVelArr = new Float32Array(0);
      let dotAccelArr = new Float32Array(0);
      let dotScaleArr = new Float32Array(0);
      let dotShockPhaseArr = new Float32Array(0);
      let dotIntensityArr = new Float32Array(0);
      let dotAlphaArr = new Float32Array(0);
      let hasPhysicsActivity = false;

      let cometsList: CometItem[] = [];
      let shockwaves: Shockwave[] = [];
      let hasShockwaves = false;
      const matrixHelper = new THREE.Matrix4();

      const colorPalette = {
        strand: new THREE.Color(),
        dot: new THREE.Color(),
        comet: new THREE.Color(),
      };
      const cacheColors = { line: "", dot: "", comet: "" };

      const syncPalette = (cfg: typeof configRef.current) => {
        if (cfg.lineColor !== cacheColors.line) {
          colorPalette.strand.set(cfg.lineColor);
          cacheColors.line = cfg.lineColor;
        }
        if (cfg.dotColor !== cacheColors.dot) {
          colorPalette.dot.set(cfg.dotColor);
          cacheColors.dot = cfg.dotColor;
        }
        if (cfg.cometColor !== cacheColors.comet) {
          colorPalette.comet.set(cfg.cometColor);
          cacheColors.comet = cfg.cometColor;
          for (const c of cometsList) {
            c.head.material.color.setRGB(
              1.2 * colorPalette.comet.r,
              1.2 * colorPalette.comet.g,
              1.2 * colorPalette.comet.b
            );
          }
        }
      }

      let curveSampler = {
        writePoint(
          out: Float32Array,
          idx: number,
          tVal: number,
          lane: number,
          flow: number,
          amp: number,
          phase: number,
          tSeconds: number
        ) {},
        lane: (idx: number, total: number) => (idx / total) * TWO_PI,
      };

      const createHeadTexture = (): THREE.CanvasTexture => {
        const c = document.createElement("canvas");
        c.width = c.height = 32;
        const ctx = c.getContext("2d");
        if (ctx) {
          const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
          grad.addColorStop(0, "rgba(255,255,255,0.95)");
          grad.addColorStop(0.3, "rgba(255,140,255,0.45)");
          grad.addColorStop(0.7, "rgba(180,60,220,0.1)");
          grad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, 32, 32);
        }
        const tex = new THREE.CanvasTexture(c);
        tex.needsUpdate = true;
        return track(tex);
      }

      const rebuildScene = () => {
        const cfg = configRef.current;
        for (let i = rootGroup.children.length - 1; i >= 0; i--) {
          rootGroup.remove(rootGroup.children[i]);
        }
        for (const res of disposables) {
          res.dispose();
        }
        disposables.length = 0;

        const waistAt = clamp(cfg.waistAt, 0.08, 0.92);
        const fRadius = cfg.floorRadius;
        const cRadius = cfg.crownRadius;
        const twistAngle = cfg.twist * TWO_PI;

        const radiusLut = sampleLut(
          buildSpline([
            [0, fRadius],
            [0.24 * waistAt, 0.667 * fRadius],
            [0.5 * waistAt, 0.3 * fRadius],
            [0.76 * waistAt, 0.08 * fRadius],
            [waistAt, cfg.waistRadius],
            [waistAt + 0.3 * (1 - waistAt), 0.2 * cRadius],
            [waistAt + 0.6 * (1 - waistAt), 0.44 * cRadius],
            [1, cRadius],
          ])
        );

        const heightLut = sampleLut(
          buildSpline([
            [0, 0],
            [0.1, 0.2],
            [0.2, 0.8],
            [0.35, 2.0],
            [0.5, 3.8],
            [0.75, 7.0],
            [1, 10.0],
          ])
        );

        const twistLut = sampleLut(
          buildSpline([
            [0, 0],
            [0.15, 0.15 * twistAngle],
            [0.25, 0.25 * twistAngle],
            [0.45, 0.55 * twistAngle],
            [0.6, 0.7 * twistAngle],
            [0.8, 0.88 * twistAngle],
            [1, twistAngle],
          ])
        );

        curveSampler = {
          writePoint(out, idx, tVal, lane, flow, amp, phase, tSeconds) {
            const rad = readLut(radiusLut, tVal);
            const h = readLut(heightLut, tVal);
            const rot = readLut(twistLut, tVal) + lane + flow;
            const rMod = rad + Math.sin(25 * tVal + phase + 0.3 * tSeconds) * amp * rad;
            out[idx] = Math.cos(rot) * rMod;
            out[idx + 1] = h;
            out[idx + 2] = Math.sin(rot) * rMod;
          },
          lane: (i, tot) => (i / tot) * TWO_PI,
        };

        camera.fov = zoomToFov(cfg.zoom);
        camera.updateProjectionMatrix();
        syncPalette(cfg);

        // Lines Geometry
        const lineCount = Math.max(3, Math.round(cfg.lineCount));
        const totalSegments = 399 * lineCount * 2;
        linePos = new Float32Array(3 * totalSegments);
        lineCol = new Float32Array(3 * totalSegments);

        lineGeo = track(new THREE.BufferGeometry());
        lineGeo.setAttribute("position", new THREE.BufferAttribute(linePos, 3).setUsage(THREE.DynamicDrawUsage));
        lineGeo.setAttribute("color", new THREE.BufferAttribute(lineCol, 3).setUsage(THREE.DynamicDrawUsage));

        const lineMat = track(
          injectRepelShader(
            new THREE.LineBasicMaterial({
              vertexColors: true,
              transparent: true,
              opacity: 0.5,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            })
          )
        );

        const lineSegmentsMesh = new THREE.LineSegments(lineGeo, lineMat);
        lineSegmentsMesh.frustumCulled = false;
        rootGroup.add(lineSegmentsMesh);

        strands = [];
        for (let i = 0; i < lineCount; i++) {
          strands.push({
            lane: curveSampler.lane(i, lineCount),
            speed: 0.95 + 0.1 * Math.random(),
            pulse: Math.random() * TWO_PI,
            wobblePhase: Math.random() * TWO_PI,
            from: 0,
            to: 1,
            bright: 0.5,
            offset: 399 * i * 6,
            pts: new Float32Array(1200),
            cols: new Float32Array(1200),
          });
        }

        // Dots InstancedMesh
        totalDots = cfg.showDots ? Math.max(0, Math.round(cfg.dotCount)) : 0;
        dotsData = [];
        for (let i = 0; i < totalDots; i++) {
          const s = Math.random() < 0.5 ? 0.2 + 0.4 * Math.random() : 0.05 + 0.9 * Math.random();
          const stIdx = Math.floor(Math.random() * strands.length);
          dotsData.push({
            s,
            lane: strands[stIdx].lane,
            strand: stIdx,
            pulse: Math.random() * TWO_PI,
            flickerRate: 0.15 + 4.5 * Math.random(),
            bright: 0.04 + Math.pow(Math.random(), 1.5) * 0.96,
          });
        }

        dotPosArr = new Float32Array(3 * totalDots);
        dotVelArr = new Float32Array(3 * totalDots);
        dotAccelArr = new Float32Array(3 * totalDots);
        dotScaleArr = new Float32Array(totalDots).fill(1);
        new Float32Array(totalDots);
        dotShockPhaseArr = new Float32Array(totalDots);
        dotIntensityArr = new Float32Array(totalDots);
        dotAlphaArr = new Float32Array(totalDots).fill(1);
        dotColors = new Float32Array(3 * totalDots);
        hasPhysicsActivity = false;

        if (totalDots > 0) {
          const planeGeo = track(new THREE.PlaneGeometry(1, 1));
          const dotMat = track(
            injectRepelShader(
              new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0.9,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
              })
            )
          );
          dotMesh = new THREE.InstancedMesh(planeGeo, dotMat, totalDots);
          dotMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          dotMesh.instanceColor = new THREE.InstancedBufferAttribute(dotColors, 3);
          dotMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
          dotMesh.frustumCulled = false;
          rootGroup.add(dotMesh);
        } else {
          dotMesh = null;
        }

        // Comets
        shockwaves = [];
        for (let i = 0; i < 16; i++) {
          shockwaves.push({ active: false, x: 0, y: 0, z: 0, at: 0, amp: 1 });
        }
        hasShockwaves = false;

        const headTexture = createHeadTexture();
        const cometCount = cfg.showComets ? Math.max(0, Math.round(cfg.cometCount)) : 0;
        const tailSegments = Math.max(2, Math.round(cfg.cometTail));
        cometsList = [];

        for (let i = 0; i < cometCount; i++) {
          const trailPts = new Float32Array(3 * tailSegments);
          const trailCols = new Float32Array(3 * tailSegments);
          const geo = track(new THREE.BufferGeometry());
          geo.setAttribute("position", new THREE.BufferAttribute(trailPts, 3).setUsage(THREE.DynamicDrawUsage));
          geo.setAttribute("color", new THREE.BufferAttribute(trailCols, 3).setUsage(THREE.DynamicDrawUsage));

          const lineMatComet = track(
            injectRepelShader(
              new THREE.LineBasicMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.9,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
              })
            )
          );
          const lineMesh = new THREE.Line(geo, lineMatComet);
          lineMesh.frustumCulled = false;

          const spriteMat = track(
            new THREE.SpriteMaterial({
              map: headTexture,
              transparent: true,
              opacity: 0,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
              color: new THREE.Color(
                1.2 * colorPalette.comet.r,
                1.2 * colorPalette.comet.g,
                1.2 * colorPalette.comet.b
              ),
            })
          );
          const headSprite = new THREE.Sprite(spriteMat);
          headSprite.scale.set(0.35, 0.35, 1);

          rootGroup.add(lineMesh);
          rootGroup.add(headSprite);

          const strandRef = strands[Math.floor(Math.random() * strands.length)];
          const spd = cfg.cometSpeed * (0.7 + 0.6 * Math.random());
          cometsList.push({
            bright: 0.7 + 0.3 * Math.random(),
            lane: strandRef.lane,
            speed: spd,
            pulse: strandRef.speed,
            wobblePhase: strandRef.wobblePhase,
            base: spd,
            boost: 0,
            boostMul: 1,
            racing: false,
            s: 0,
            idle: 0,
            idleFor: 0.4 + (i / cometCount) * cfg.cometDelay,
            trail: trailPts,
            trailCol: trailCols,
            geo,
            line: lineMesh,
            head: headSprite,
          });
        }

        syncViewport();
      }

      // Camera orientation targeting the waist & crown
      const camDist = 5 / Math.tan((67 * Math.PI) / 180 / 2);
      const camDir = new THREE.Vector3(3.4, -0.6, 10).normalize();
      const targetCenter = new THREE.Vector3(0, 5, 0);
      camera.position.copy(targetCenter).addScaledVector(camDir, camDist);
      camera.lookAt(targetCenter);

      let currentHeight = 1;
      const syncViewport = () => {
        if (!container || !renderer) return;
        const w = container.clientWidth || 1;
        const h = container.clientHeight || 1;
        currentHeight = h;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        repelUniforms.uAspect.value = w / h;
        repelUniforms.uRadius.value = clamp(configRef.current.repelRadius / (h / 2), 0.01, 3);
        if (!configRef.current.running) {
          renderer.render(scene, camera);
        }
      }

      resizeObserver = new ResizeObserver(syncViewport);
      resizeObserver.observe(container);

      let targetRepel = 0;
      onPointerMove = (e: PointerEvent) => {
        const rect = container.getBoundingClientRect();
        if (rect.width && rect.height) {
          repelUniforms.uMouse.value.set(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -(((e.clientY - rect.top) / rect.height) * 2 - 1)
          );
          targetRepel =
            configRef.current.hoverRepel && configRef.current.running
              ? 0.45 * clamp(configRef.current.repelStrength / 100, 0, 1)
              : 0;
        }
      };
      onPointerLeave = () => {
        targetRepel = 0;
      };

      container.addEventListener("pointermove", onPointerMove);
      container.addEventListener("pointerleave", onPointerLeave);
      container.addEventListener("pointercancel", onPointerLeave);

      rebuildScene();

      let startTime = 0;
      let accumFlow = 0;
      let tickAccum = 0;
      let frameCounter = 0;
      let lastTime = performance.now();

      const animate = (time: number) => {
        animId = requestAnimationFrame(animate);
        const cfg = configRef.current;
        const deltaSec = Math.min((time - lastTime) / 1000, 0.04);
        lastTime = time;

        if (!cfg.running) {
          renderer?.render(scene, camera);
          return;
        }

        if (startTime === 0) startTime = time;
        const elapsed = (time - startTime) / 1000;
        const lineIntro = hermiteEase(elapsed, 0, 2);
        const dotIntro = hermiteEase(elapsed, 1.2, 3);
        const cometIntro = hermiteEase(elapsed, 3, 5);

        syncPalette(cfg);

        const targetFov = zoomToFov(cfg.zoom);
        if (camera.fov !== targetFov) {
          camera.fov = targetFov;
          camera.updateProjectionMatrix();
        }

        repelUniforms.uRadius.value = clamp(cfg.repelRadius / (currentHeight / 2), 0.01, 3);
        accumFlow += deltaSec * cfg.flowSpeed;

        const uStrength = repelUniforms.uStrength;
        uStrength.value += (targetRepel - uStrength.value) * Math.min(1, 12 * deltaSec);

        // Lines tick
        tickAccum += deltaSec;
        if (tickAccum >= TICK_INTERVAL && lineGeo) {
          tickAccum -= TICK_INTERVAL;

          const strandHead = lineIntro; // sweeps from 0 to 1 over the first 2 seconds
          const tipEase = 0.15;

          for (const s of strands) {
            const flowOffset = accumFlow * s.speed;
            const glow = s.bright * cfg.lineGlow;
            const baseBright = 0.15 + 1.5 * glow;
            const pulseFactor =
              Math.min(0.5 * glow * (0.9 + 0.1 * Math.sin(0.18 * elapsed + s.pulse)), 0.7) *
              Math.min(3 * lineIntro, 1);
            const span = s.to - s.from;
            const d = s.pts;
            const m = s.cols;

            for (let i = 0; i < 400; i++) {
              const segT = i / 399;
              const tPos = s.from + segT * span;
              const idx3 = 3 * i;
              curveSampler.writePoint(d, idx3, tPos, s.lane, flowOffset, 0.008, s.wobblePhase, elapsed);

              if (hasShockwaves) {
                let offX = 0,
                  offY = 0,
                  offZ = 0;
                let activeCount = false;
                for (let k = 0; k < 16; k++) {
                  const sw = shockwaves[k];
                  if (!sw.active) continue;
                  const age = elapsed - sw.at;
                  if (age > 2.5) {
                    sw.active = false;
                    continue;
                  }
                  activeCount = true;
                  const dx = d[idx3] - sw.x;
                  const dy = d[idx3 + 1] - sw.y;
                  const dz = d[idx3 + 2] - sw.z;
                  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                  if (dist < 0.001 || dist > 3) continue;
                  const ringDist = Math.abs(dist - 5 * age);
                  if (ringDist > 1.2) continue;
                  const wave = Math.cos((ringDist / 1.2) * (Math.PI / 2));
                  const damp = Math.exp(-age / 0.8);
                  const invDist = 1 / Math.max(dist, 0.3);
                  const force = 0.5 * sw.amp * 0.04 * wave * damp * invDist;
                  offX += (dx / dist) * force;
                  offY += (dy / dist) * force;
                  offZ += (dz / dist) * force;
                }
                if (!activeCount) hasShockwaves = false;
                d[idx3] += offX;
                d[idx3 + 1] += offY;
                d[idx3 + 2] += offZ;
              }

              // End-cap fade at top and bottom edges (segT 0 to 1 along curve)
              let endCapFade = 1;
              if (segT < 0.15) {
                const f = segT / 0.15;
                endCapFade = f * f;
              } else if (segT > 0.85) {
                const f = (1 - segT) / 0.15;
                endCapFade = f * f;
              }

              // Progressive draw-in head during intro
              let sweepFade = 1;
              if (segT > strandHead) {
                sweepFade = 0;
              } else if (segT > strandHead - tipEase) {
                const f = (strandHead - segT) / tipEase;
                sweepFade = f * f;
              }

              const colIntensity = endCapFade * baseBright * sweepFade * pulseFactor;
              m[idx3] = colorPalette.strand.r * colIntensity;
              m[idx3 + 1] = colorPalette.strand.g * colIntensity;
              m[idx3 + 2] = colorPalette.strand.b * colIntensity;
            }

            let segOffset = s.offset;
            for (let i = 0; i < 399; i++) {
              const p0 = 3 * i;
              const p1 = (i + 1) * 3;
              linePos[segOffset] = d[p0];
              linePos[segOffset + 1] = d[p0 + 1];
              linePos[segOffset + 2] = d[p0 + 2];
              lineCol[segOffset] = m[p0];
              lineCol[segOffset + 1] = m[p0 + 1];
              lineCol[segOffset + 2] = m[p0 + 2];

              linePos[segOffset + 3] = d[p1];
              linePos[segOffset + 4] = d[p1 + 1];
              linePos[segOffset + 5] = d[p1 + 2];
              lineCol[segOffset + 3] = m[p1];
              lineCol[segOffset + 4] = m[p1 + 1];
              lineCol[segOffset + 5] = m[p1 + 2];
              segOffset += 6;
            }
          }
          (lineGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
          (lineGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
        }

        // Dots Tick
        if (dotMesh && totalDots > 0) {
          const sz = cfg.dotSize;
          for (let i = 0; i < totalDots; i++) {
            const dot = dotsData[i];
            const strandRef = strands[dot.strand] || strands[0];
            const flowOffset = accumFlow * strandRef.speed;
            const idx3 = 3 * i;
            curveSampler.writePoint(
              dotPosArr,
              idx3,
              dot.s,
              dot.lane,
              flowOffset,
              0.008,
              strandRef.wobblePhase,
              elapsed
            );

            if (dotShockPhaseArr[i] > 0) {
              dotShockPhaseArr[i] += deltaSec;
              const phase = dotShockPhaseArr[i];
              if (phase < 0.6) {
                const f = phase / 0.6;
                dotAlphaArr[i] = (1 + 0.3 * (1 - f)) * (1 - f * f);
                dotIntensityArr[i] = 6 * (1 - f * f) * (1 - f * f);
              } else {
                dotAlphaArr[i] = 0;
                dotIntensityArr[i] = 0;
              }
              if (phase > 8) {
                dotShockPhaseArr[i] = 0;
                dotAlphaArr[i] = 1;
                dotIntensityArr[i] = 0;
              }
            }

            const alpha = dotAlphaArr[i];
            const finalSize = sz * dotScaleArr[i] * alpha;
            matrixHelper.makeScale(finalSize, finalSize, finalSize);
            matrixHelper.setPosition(
              dotPosArr[idx3] + dotVelArr[idx3],
              dotPosArr[idx3 + 1] + dotVelArr[idx3 + 1],
              dotPosArr[idx3 + 2] + dotVelArr[idx3 + 2]
            );
            dotMesh.setMatrixAt(i, matrixHelper);

            const flicker =
              1 -
              cfg.dotFlicker +
              cfg.dotFlicker *
                (0.08 + 0.92 * Math.pow(Math.max(0, Math.sin(elapsed * dot.flickerRate + dot.pulse)), 2.5));
            const brightVal =
              dot.bright *
              flicker *
              cfg.dotGlow *
              dotIntro *
              (1 + dotIntensityArr[i]) *
              alpha;

            dotColors[idx3] = colorPalette.dot.r * brightVal;
            dotColors[idx3 + 1] = colorPalette.dot.g * brightVal;
            dotColors[idx3 + 2] = colorPalette.dot.b * brightVal;
          }

          dotMesh.instanceMatrix.needsUpdate = true;
          if (dotMesh.instanceColor) dotMesh.instanceColor.needsUpdate = true;
          (dotMesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * dotIntro;
        }

        // Comets Tick
        for (const comet of cometsList) {
          const segCount = comet.trail.length / 3;
          if (!comet.racing) {
            comet.head.material.opacity = 0;
            if (cometIntro >= 0.3) {
              comet.idle += deltaSec;
              if (comet.idle > comet.idleFor) {
                comet.racing = true;
                comet.s = cfg.flowDir < 0 ? 0.95 : 0.03;
                comet.base = cfg.cometSpeed * (0.7 + 0.6 * Math.random());
                comet.speed = comet.base;
                comet.boost = 0;
                comet.boostMul = 1;
                const rStrand = strands[Math.floor(Math.random() * strands.length)];
                comet.lane = rStrand.lane;
                comet.pulse = rStrand.speed;
                comet.wobblePhase = rStrand.wobblePhase;
              }
            }
            continue;
          }

          if (comet.boost > 0) {
            comet.boost -= deltaSec;
            if (comet.boost <= 0) {
              comet.boost = 0;
              comet.boostMul = 1;
            } else {
              comet.boostMul = 1 + 0.6 * (comet.boost / 0.4);
            }
            comet.speed = comet.base * comet.boostMul;
          }

          comet.s += deltaSec * comet.speed * cfg.flowDir;
          if (cfg.flowDir < 0 ? comet.s < 0.03 : comet.s > 0.95) {
            comet.racing = false;
            comet.idle = 0;
            comet.idleFor = cfg.cometDelay * (0.6 + 0.8 * Math.random());
            comet.trailCol.fill(0);
            (comet.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
            comet.head.material.opacity = 0;
            continue;
          }

          const flowPos = accumFlow * comet.pulse;
          const fadeEnvelope = clamp((comet.s - 0.03) / 0.1, 0, 1) * clamp((0.95 - comet.s) / 0.1, 0, 1);

          for (let i = 0; i < segCount; i++) {
            const segS = clamp(comet.s - 0.005 * i * cfg.flowDir, 0.005, 0.995);
            const idx3 = 3 * i;
            curveSampler.writePoint(comet.trail, idx3, segS, comet.lane, flowPos, 0.008, comet.wobblePhase, elapsed);
            const trailFalloff = Math.pow(1 - i / segCount, 2);
            const cometBright = comet.bright * cfg.cometGlow * trailFalloff * fadeEnvelope;
            const boostBoost = cometIntro * (i < 3 ? 1.3 : 1);

            comet.trailCol[idx3] = colorPalette.comet.r * cometBright * boostBoost;
            comet.trailCol[idx3 + 1] = colorPalette.comet.g * cometBright * boostBoost;
            comet.trailCol[idx3 + 2] = colorPalette.comet.b * cometBright * boostBoost;
          }

          comet.head.position.set(comet.trail[0], comet.trail[1], comet.trail[2]);
          const boostScale = comet.boost > 0 ? 1 + (comet.boostMul - 1) * 0.8 : 1;
          comet.head.material.opacity = 0.35 * fadeEnvelope * cometIntro * boostScale;
          comet.head.scale.set(0.35 * boostScale, 0.35 * boostScale, 1);

          (comet.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
          (comet.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
        }

        // Collisions between comets and dots
        if (++frameCounter % 2 === 0 && totalDots > 0) {
          const force = cfg.collideForce;
          if (force > 0) {
            const hitRadiusSq = 0.8 * 0.8;
            for (const c of cometsList) {
              if (!c.racing) continue;
              const cx = c.trail[0];
              const cy = c.trail[1];
              const cz = c.trail[2];
              if (cx === 0 && cy === 0 && cz === 0) continue;

              for (let d = 0; d < totalDots; d += 3) {
                const dx = dotPosArr[3 * d] - cx;
                const dy = dotPosArr[3 * d + 1] - cy;
                const dz = dotPosArr[3 * d + 2] - cz;
                if (dx * dx + dy * dy + dz * dz < hitRadiusSq && dotShockPhaseArr[d] === 0) {
                  dotShockPhaseArr[d] = 0.001;
                  dotIntensityArr[d] = 6 * force;
                  dotScaleArr[d] = 1 + 0.3 * force;

                  hasPhysicsActivity = true;
                  const px = dotPosArr[3 * d];
                  const py = dotPosArr[3 * d + 1];
                  const pz = dotPosArr[3 * d + 2];
                  hasShockwaves = true;

                  let oldest = Infinity;
                  let slot = 0;
                  for (let w = 0; w < 16; w++) {
                    if (!shockwaves[w].active) {
                      slot = w;
                      break;
                    }
                    if (shockwaves[w].at < oldest) {
                      oldest = shockwaves[w].at;
                      slot = w;
                    }
                  }
                  shockwaves[slot] = { active: true, x: px, y: py, z: pz, at: elapsed, amp: force };

                  c.boost = 0.4;
                  c.boostMul = 1 + 0.6 * force;
                  c.speed = c.base * c.boostMul;
                }
              }
            }
          }
        }

        renderer?.render(scene, camera);
      };

      animId = requestAnimationFrame(animate);
    } catch (err) {
      console.warn("[VortexHourglass] Failed to initialize WebGL:", err);
    }

    return () => {
      cancelAnimationFrame(animId);
      if (onPointerMove) container.removeEventListener("pointermove", onPointerMove);
      if (onPointerLeave) {
        container.removeEventListener("pointerleave", onPointerLeave);
        container.removeEventListener("pointercancel", onPointerLeave);
      }
      resizeObserver?.disconnect();
      for (const res of disposables) {
        res.dispose();
      }
      renderer?.dispose();
      renderer?.forceContextLoss();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background,
        overflow: "hidden",
        ...style,
      }}
    >
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
    </div>
  );
}
