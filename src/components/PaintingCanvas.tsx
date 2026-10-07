import React, { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { WebGLPaintingRenderer, ShaderUniforms } from '../utils/webglHelper';
import { computeLightPosition, TrajectoryMode } from '../utils/lightTrajectories';

export interface PaintingCanvasProps {
  loopDuration: number;
  trajectoryMode: TrajectoryMode;
  lightIntensity: number;
  beamRadius: number;
  impastoDepth: number;
  breezeStrength: number;
  ambientLevel: number;
  isPlaying: boolean;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  interactiveTorch: boolean;
  viewScale?: number;
  imageUrl?: string | null;
  accentColor?: string;
  audioTime?: number;
  getFrequencyData?: (barCount: number, timeOverride?: number) => Float32Array;
}

export interface PaintingCanvasHandle {
  getCanvas: () => HTMLCanvasElement | null;
  captureFrame: () => string | null;
  seek: (time: number) => void;
}

const BAR_COUNT = 32;

function lerp(start: number, end: number, amt: number): number {
  return start + (end - start) * amt;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) || 29;
    const g = parseInt(clean[1] + clean[1], 16) || 185;
    const b = parseInt(clean[2] + clean[2], 16) || 84;
    return { r, g, b };
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) return { r: 29, g: 185, b: 84 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export const PaintingCanvas = forwardRef<PaintingCanvasHandle, PaintingCanvasProps>(
  (
    {
      loopDuration,
      trajectoryMode,
      lightIntensity,
      beamRadius,
      impastoDepth,
      breezeStrength,
      ambientLevel,
      isPlaying,
      currentTime,
      onTimeUpdate,
      interactiveTorch,
      imageUrl = null,
      accentColor = '#1DB954',
      audioTime,
      getFrequencyData,
    },
    ref
  ) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const rendererRef = useRef<WebGLPaintingRenderer | null>(null);
    const animFrameRef = useRef<number | null>(null);
    const lastTimestampRef = useRef<number | null>(null);
    const timeRef = useRef<number>(currentTime);
    const audioTimeRef = useRef<number>(audioTime ?? currentTime);
    const smoothedBarsRef = useRef<Float32Array>(new Float32Array(BAR_COUNT));
    const smoothedGlowRef = useRef<Float32Array>(new Float32Array(BAR_COUNT));
    const [canvasImage, setCanvasImage] = useState<string | null>(imageUrl ?? null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
      setCanvasImage(imageUrl ?? null);
    }, [imageUrl]);

    // Interactive mouse / touch coordinates (normalized [0, 1])
    const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
    const isInteractingRef = useRef(false);

    // Keep timeRefs in sync with external clocks
    useEffect(() => {
      timeRef.current = currentTime;
    }, [currentTime]);

    useEffect(() => {
      audioTimeRef.current = audioTime ?? currentTime;
    }, [audioTime, currentTime]);

    // Render single composite frame (optional background image + minimalist frequency bar visualizer)
    const renderCurrentFrame = useCallback(
      (seekTimeOverride?: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const w = canvas.width;
        const h = canvas.height;
        const activeTime = typeof seekTimeOverride === 'number' ? seekTimeOverride : audioTimeRef.current;

        // 1. Clean minimalist dark canvas base
        const bgGrad = ctx.createRadialGradient(
          w * 0.5,
          h * 0.5,
          w * 0.05,
          w * 0.5,
          h * 0.5,
          h * 0.65
        );
        const { r, g, b } = hexToRgb(accentColor);
        bgGrad.addColorStop(0, `rgba(${Math.round(r * 0.08)}, ${Math.round(g * 0.08)}, ${Math.round(b * 0.08)}, 1)`);
        bgGrad.addColorStop(0.6, '#07080c');
        bgGrad.addColorStop(1, '#040406');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // 2. If a custom canvasImage is loaded, render WebGL layer onto offscreen canvas and composite
        if (canvasImage && rendererRef.current && glCanvasRef.current) {
          const effectiveTrajectory = interactiveTorch && pointerPos ? 'interactive' : trajectoryMode;
          const light = computeLightPosition(
            effectiveTrajectory,
            timeRef.current,
            loopDuration,
            pointerPos || undefined
          );

          const uniforms: ShaderUniforms = {
            time: timeRef.current,
            loopDuration,
            lightPos: [light.x, light.y, light.z],
            lightIntensity: lightIntensity * light.intensityFactor,
            beamRadius,
            impastoDepth,
            breezeStrength,
            ambientLevel,
            specularPower: 38.0,
            specularStrength: 1.15,
            resolution: [w, h],
          };

          rendererRef.current.render(uniforms);
          ctx.save();
          ctx.globalAlpha = 0.85;
          ctx.drawImage(glCanvasRef.current, 0, 0, w, h);
          ctx.restore();
        }

        // 3. Acquire target frequency data & smooth with linear interpolation (lerp)
        let rawBins: Float32Array;
        if (getFrequencyData) {
          rawBins = getFrequencyData(BAR_COUNT, seekTimeOverride);
        } else {
          rawBins = new Float32Array(BAR_COUNT);
          if (isPlaying || typeof seekTimeOverride === 'number') {
            for (let i = 0; i < BAR_COUNT; i++) {
              const norm = i / (BAR_COUNT - 1);
              const env = Math.exp(-Math.pow((norm - 0.35) / 0.3, 2));
              const wave =
                0.5 +
                0.35 * Math.sin(activeTime * 3.6 + i * 0.35) +
                0.15 * Math.cos(activeTime * 5.2 - i * 0.22);
              rawBins[i] = Math.max(0.05, env * wave * 0.75);
            }
          }
        }

        const smoothed = smoothedBarsRef.current;
        const smoothedGlow = smoothedGlowRef.current;

        // Spatial neighbor pre-smoothing + temporal lerp for fluent, jitter-free motion
        for (let i = 0; i < BAR_COUNT; i++) {
          const prev = rawBins[Math.max(0, i - 1)];
          const curr = rawBins[i];
          const next = rawBins[Math.min(BAR_COUNT - 1, i + 1)];
          const spatialTarget = prev * 0.22 + curr * 0.56 + next * 0.22;

          // Symmetrical bell taper towards outer edges for a balanced minimalist silhouette
          const edgeDist = Math.abs((i / (BAR_COUNT - 1)) * 2 - 1);
          const taper = 1 - 0.38 * Math.pow(edgeDist, 1.8);
          const targetVal = Math.max(0.035, Math.min(1, spatialTarget * taper));

          // Rise slightly faster than decay using linear interpolation (lerp)
          const factor = targetVal > smoothed[i] ? 0.16 : 0.09;
          smoothed[i] = lerp(smoothed[i], targetVal, factor);
          smoothedGlow[i] = lerp(smoothedGlow[i], smoothed[i], 0.11);
        }

        // 4. Layout geometry for minimalist frequency bars
        const visualizerWidth = w * 0.74;
        const startX = (w - visualizerWidth) * 0.5;
        const slotWidth = visualizerWidth / BAR_COUNT;
        const barWidth = Math.max(8, Math.round(slotWidth * 0.54));
        const barRadius = barWidth / 2;
        const maxBarHeight = h * 0.26;
        const minBarHeight = Math.max(barWidth, Math.round(h * 0.012));
        const baselineY = h * 0.56;

        // 5. Pass 1: Gentle blur glow behind the bars
        ctx.save();
        try {
          ctx.filter = 'blur(22px)';
        } catch {
          // fallback if filter unsupported
        }
        ctx.globalAlpha = 0.46;

        for (let i = 0; i < BAR_COUNT; i++) {
          const val = smoothedGlow[i];
          const barH = Math.max(minBarHeight, val * maxBarHeight * 1.08);
          const x = startX + i * slotWidth + (slotWidth - barWidth) * 0.5;
          const y = baselineY - barH * 0.5;

          const glowGrad = ctx.createLinearGradient(0, y, 0, y + barH);
          glowGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.95)`);
          glowGrad.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, 0.45)`);
          glowGrad.addColorStop(1, 'rgba(8, 10, 14, 0.0)');

          ctx.fillStyle = glowGrad;
          ctx.beginPath();
          ctx.roundRect(x - 2, y - 2, barWidth + 4, barH + 4, barRadius + 2);
          ctx.fill();
        }
        ctx.restore();

        // 6. Pass 2: Smooth frequency bars with rounded caps & subtle vertical gradient (neon accent -> translucent dark)
        ctx.save();
        ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.32)`;
        ctx.shadowBlur = 14;

        for (let i = 0; i < BAR_COUNT; i++) {
          const val = smoothed[i];
          const barH = Math.max(minBarHeight, val * maxBarHeight);
          const x = Math.round(startX + i * slotWidth + (slotWidth - barWidth) * 0.5);
          const y = Math.round(baselineY - barH * 0.5);

          const barGrad = ctx.createLinearGradient(0, y, 0, y + barH);
          barGrad.addColorStop(0, accentColor);
          barGrad.addColorStop(0.52, `rgba(${r}, ${g}, ${b}, 0.52)`);
          barGrad.addColorStop(1, 'rgba(10, 12, 18, 0.14)');

          ctx.fillStyle = barGrad;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barH, barRadius);
          ctx.fill();
        }
        ctx.restore();
      },
      [
        accentColor,
        canvasImage,
        getFrequencyData,
        interactiveTorch,
        pointerPos,
        trajectoryMode,
        loopDuration,
        lightIntensity,
        beamRadius,
        impastoDepth,
        breezeStrength,
        ambientLevel,
        isPlaying,
      ]
    );

    // Expose handle methods for recorder and stills
    useImperativeHandle(ref, () => ({
      getCanvas: () => canvasRef.current,
      captureFrame: () => {
        if (!canvasRef.current) return null;
        return canvasRef.current.toDataURL('image/jpeg', 0.95);
      },
      seek: (t: number) => {
        timeRef.current = t % loopDuration;
        audioTimeRef.current = t;
        renderCurrentFrame(t);
      },
    }));

    // Initialize Canvas and optional WebGL Texture
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const width = 1080;
      const height = 1920;
      canvas.width = width;
      canvas.height = height;

      // Initialize resting bar heights smoothly
      for (let i = 0; i < BAR_COUNT; i++) {
        if (smoothedBarsRef.current[i] === 0) {
          smoothedBarsRef.current[i] = 0.04;
          smoothedGlowRef.current[i] = 0.04;
        }
      }

      const primaryPath = canvasImage || '';

      if (!primaryPath) {
        setIsLoaded(true);
        renderCurrentFrame();
        return () => {
          if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
          }
          if (rendererRef.current) {
            rendererRef.current.destroy();
            rendererRef.current = null;
          }
        };
      }

      const offscreenGlCanvas = document.createElement('canvas');
      offscreenGlCanvas.width = width;
      offscreenGlCanvas.height = height;
      glCanvasRef.current = offscreenGlCanvas;

      const renderer = new WebGLPaintingRenderer(offscreenGlCanvas);
      rendererRef.current = renderer;

      renderer
        .loadTexture(primaryPath)
        .then(() => {
          setIsLoaded(true);
          renderCurrentFrame();
        })
        .catch(() => {
          setIsLoaded(true);
          renderCurrentFrame();
        });

      return () => {
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
        }
        renderer.destroy();
        rendererRef.current = null;
      };
    }, [canvasImage]);

    // Main animation loop (runs continuously while mounted so lerp transitions settle smoothly even when pausing)
    useEffect(() => {
      if (!isLoaded) return;

      let active = true;

      const tick = (now: number) => {
        if (!active) return;

        if (lastTimestampRef.current !== null && isPlaying) {
          const delta = (now - lastTimestampRef.current) / 1000;
          timeRef.current = (timeRef.current + delta) % loopDuration;
          audioTimeRef.current += delta;
          onTimeUpdate(timeRef.current);
        }
        lastTimestampRef.current = now;

        renderCurrentFrame();

        animFrameRef.current = requestAnimationFrame(tick);
      };

      animFrameRef.current = requestAnimationFrame(tick);

      return () => {
        active = false;
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
        }
      };
    }, [isPlaying, isLoaded, loopDuration, onTimeUpdate, renderCurrentFrame]);

    // Handle pointer interactions for tactile spotlight exploration
    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!interactiveTorch && !isInteractingRef.current) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0.05, Math.min(0.95, (e.clientY - rect.top) / rect.height));
      setPointerPos({ x, y });
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      isInteractingRef.current = true;
      handlePointerMove(e);
    };

    const handlePointerUp = () => {
      isInteractingRef.current = false;
      if (!interactiveTorch) {
        setPointerPos(null);
      }
    };

    return (
      <div
        className="relative w-full h-full flex items-center justify-center select-none bg-[#050507]"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Loading state indicator */}
        {!isLoaded && !loadError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-950 z-20">
            <div className="w-10 h-10 rounded-full border-2 border-neutral-800 border-t-neutral-200 animate-spin mb-3" />
            <span className="text-xs tracking-wider text-neutral-400 font-medium">
              Initializing Visualizer...
            </span>
          </div>
        )}

        {loadError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-950 text-red-400 p-6 z-20 text-center text-sm">
            <p className="font-semibold mb-2">Canvas Load Error</p>
            <p className="text-neutral-500 text-xs">{loadError}</p>
          </div>
        )}

        {/* The 9:16 Visualizer Canvas */}
        <canvas
          ref={canvasRef}
          className="w-full h-full object-contain rounded-none shadow-2xl"
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            aspectRatio: '9 / 16',
          }}
        />

        {/* Ambient subtle vignette overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at 50% 50%, transparent 65%, rgba(0, 0, 0, 0.45) 100%)',
          }}
        />
      </div>
    );
  }
);

PaintingCanvas.displayName = 'PaintingCanvas';

