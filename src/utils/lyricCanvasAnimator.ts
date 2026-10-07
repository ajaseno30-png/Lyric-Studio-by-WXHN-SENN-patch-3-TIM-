/**
 * Lyric Canvas Animator Utility
 *
 * Converts CSS / Framer Motion-style animation parameters (cubic-bezier curves,
 * cross-fade opacity, scale transitions, slide offsets, and CSS blur filters)
 * into high-performance, deterministic Canvas 2D operations.
 *
 * Maps continuous export time 't' to interpolated visual properties without
 * external state, guaranteeing identical frame rendering regardless of export fps,
 * scrubbing speed, or frame skip.
 */

import { LyricLine } from '../types/lyrics';

export type CubicBezierCurve = [number, number, number, number];

export interface LyricMotionPreset {
  enterDuration: number; // in seconds (e.g. 0.6)
  exitDuration: number; // in seconds (e.g. 0.6)
  transitionDuration?: number; // in seconds (e.g. 0.7 for expanded lyrics)
  easing: CubicBezierCurve;
  enterBlur: number; // max blur in pixels on enter (e.g. 4 or 5)
  exitBlur: number; // max blur in pixels on exit
  enterTranslateY: number; // entry vertical slide in pixels (e.g. 18)
  exitTranslateY: number; // exit vertical slide in pixels (e.g. -18)
  activeScale: number; // scale when active (e.g. 1.02)
  inactiveScale: number; // scale when inactive (e.g. 1.0)
  maxGlowBlur: number; // max textShadow blur in pixels (e.g. 24)
  maxGlowAlpha: number; // glow alpha (e.g. 0.45)
  activeOpacity: number;
  pastOpacity: number;
  futureOpacity: number;
}

export interface LyricMotionState {
  phase: 'enter' | 'active' | 'exit' | 'past' | 'upcoming';
  progress: number; // 0 to 1 for current transition
  easedProgress: number; // eased progress (0 to 1)
  opacity: number;
  scale: number;
  blur: number; // blur radius in pixels (0 = crisp)
  translateY: number; // vertical offset in pixels
  translateX: number; // horizontal offset in pixels
  glowAlpha: number; // 0 to 1
  glowBlur: number; // in pixels
  accentProgress: number; // 0 to 1
}

/**
 * Standard Framer Motion and Spotify animation curve presets
 */
export const EASING_PRESETS: Record<string, CubicBezierCurve> = {
  // Framer Motion popLayout transition curve: [0.22, 1, 0.36, 1]
  framerPop: [0.22, 1, 0.36, 1],
  // Spotify lyrics glide curve: [0.25, 1, 0.5, 1]
  spotifySmooth: [0.25, 1, 0.5, 1],
  // Standard CSS ease-out: [0, 0, 0.58, 1]
  easeOut: [0, 0, 0.58, 1],
  // Standard CSS ease-in-out: [0.42, 0, 0.58, 1]
  easeInOut: [0.42, 0, 0.58, 1],
  // Linear
  linear: [0, 0, 1, 1],
};

/**
 * Preset for Now Playing Card lyrics (0.6s cross-fade, slide +16px, blur 4px)
 */
export const NOW_PLAYING_MOTION_PRESET: LyricMotionPreset = {
  enterDuration: 0.6,
  exitDuration: 0.6,
  easing: EASING_PRESETS.framerPop,
  enterBlur: 4,
  exitBlur: 4,
  enterTranslateY: 16,
  exitTranslateY: -16,
  activeScale: 1.0,
  inactiveScale: 1.0,
  maxGlowBlur: 0,
  maxGlowAlpha: 0,
  activeOpacity: 1.0,
  pastOpacity: 0.0,
  futureOpacity: 0.35,
};

/**
 * Preset for Canvas Subtitles Floating Pill (0.6s cross-fade, slide +18px, blur 5px)
 */
export const CANVAS_SUBTITLES_MOTION_PRESET: LyricMotionPreset = {
  enterDuration: 0.6,
  exitDuration: 0.6,
  easing: EASING_PRESETS.spotifySmooth,
  enterBlur: 5,
  exitBlur: 5,
  enterTranslateY: 18,
  exitTranslateY: -18,
  activeScale: 1.0,
  inactiveScale: 1.0,
  maxGlowBlur: 0,
  maxGlowAlpha: 0,
  activeOpacity: 1.0,
  pastOpacity: 0.0,
  futureOpacity: 0.4,
};

/**
 * Preset for Fullscreen Expanded Scrolling Lyrics (0.7s transition, scale 1.02, glow 24px)
 */
export const EXPANDED_LYRICS_MOTION_PRESET: LyricMotionPreset = {
  enterDuration: 0.7,
  exitDuration: 0.7,
  transitionDuration: 0.7,
  easing: EASING_PRESETS.spotifySmooth,
  enterBlur: 0,
  exitBlur: 0,
  enterTranslateY: 0,
  exitTranslateY: 0,
  activeScale: 1.02,
  inactiveScale: 1.0,
  maxGlowBlur: 24,
  maxGlowAlpha: 0.45,
  activeOpacity: 1.0,
  pastOpacity: 0.4,
  futureOpacity: 0.25,
};

/**
 * High-performance Cubic Bezier solver using Newton-Raphson method with clamp guard
 */
export function solveCubicBezier(
  t: number,
  curve: CubicBezierCurve = EASING_PRESETS.spotifySmooth
): number {
  const [p1x, p1y, p2x, p2y] = curve;
  const clampT = Math.max(0, Math.min(1, t));

  // Quick exits for boundary values
  if (clampT <= 0) return 0;
  if (clampT >= 1) return 1;

  // Newton-Raphson iteration to find parameter u such that X(u) = clampT
  let u = clampT;
  for (let i = 0; i < 6; i++) {
    const currentX =
      3 * (1 - u) * (1 - u) * u * p1x +
      3 * (1 - u) * u * u * p2x +
      u * u * u;
    const dx =
      3 * (1 - u) * (1 - u) * p1x +
      6 * (1 - u) * u * (p2x - p1x) +
      3 * u * u * (1 - p2x);

    if (Math.abs(currentX - clampT) < 0.0005 || Math.abs(dx) < 1e-6) break;
    u -= (currentX - clampT) / dx;
    u = Math.max(0, Math.min(1, u));
  }

  // Calculate Y(u)
  return (
    3 * (1 - u) * (1 - u) * u * p1y +
    3 * (1 - u) * u * u * p2y +
    u * u * u
  );
}

/**
 * Calculates the exact motion state for a specific lyric line at time 't'
 */
export function computeLyricMotionState(
  lineIndex: number,
  activeIndex: number,
  currentTime: number,
  lyrics: LyricLine[],
  preset: LyricMotionPreset = NOW_PLAYING_MOTION_PRESET,
  scaleFactor = 1.0
): LyricMotionState {
  const activeLine = lyrics[activeIndex];
  const thisLine = lyrics[lineIndex];

  // Base inactive states if not active or adjacent
  if (lineIndex < activeIndex - 1) {
    return {
      phase: 'past',
      progress: 1,
      easedProgress: 1,
      opacity: preset.pastOpacity,
      scale: preset.inactiveScale,
      blur: 0,
      translateY: 0,
      translateX: 0,
      glowAlpha: 0,
      glowBlur: 0,
      accentProgress: 0,
    };
  }

  if (lineIndex > activeIndex) {
    return {
      phase: 'upcoming',
      progress: 0,
      easedProgress: 0,
      opacity: preset.futureOpacity,
      scale: preset.inactiveScale,
      blur: 0,
      translateY: 0,
      translateX: 0,
      glowAlpha: 0,
      glowBlur: 0,
      accentProgress: 0,
    };
  }

  // Calculate time elapsed since active line began
  const lineStartTime = activeLine ? activeLine.time : (thisLine ? thisLine.time : 0);
  const dt = Math.max(0, currentTime - lineStartTime);

  // Line is the active entering line
  if (lineIndex === activeIndex) {
    const duration = preset.enterDuration || 0.6;
    const progress = Math.min(1, Math.max(0, dt / duration));
    const eased = solveCubicBezier(progress, preset.easing);

    const opacity =
      preset.futureOpacity + (preset.activeOpacity - preset.futureOpacity) * eased;
    const scale =
      preset.inactiveScale + (preset.activeScale - preset.inactiveScale) * eased;
    const blur = (1 - eased) * preset.enterBlur * scaleFactor;
    const translateY = (1 - eased) * preset.enterTranslateY * scaleFactor;
    const glowAlpha = eased * preset.maxGlowAlpha;
    const glowBlur = eased * preset.maxGlowBlur * scaleFactor;
    const accentProgress = eased;

    return {
      phase: progress < 1 ? 'enter' : 'active',
      progress,
      easedProgress: eased,
      opacity: Math.max(0, Math.min(1, opacity)),
      scale,
      blur: Math.max(0, blur),
      translateY,
      translateX: 0,
      glowAlpha,
      glowBlur,
      accentProgress,
    };
  }

  // Line is the immediately previous line transitioning out (lineIndex === activeIndex - 1)
  const exitDuration = preset.exitDuration || 0.6;
  const exitProgress = Math.min(1, Math.max(0, dt / exitDuration));
  const exitEased = solveCubicBezier(exitProgress, preset.easing);

  // Cross-fade out towards pastOpacity
  const opacity =
    preset.activeOpacity - (preset.activeOpacity - preset.pastOpacity) * exitEased;
  const scale =
    preset.activeScale - (preset.activeScale - preset.inactiveScale) * exitEased;
  const blur = exitEased * preset.exitBlur * scaleFactor;
  const translateY = exitEased * preset.exitTranslateY * scaleFactor;
  const glowAlpha = (1 - exitEased) * preset.maxGlowAlpha;
  const glowBlur = (1 - exitEased) * preset.maxGlowBlur * scaleFactor;
  const accentProgress = Math.max(0, 1 - exitEased);

  return {
    phase: exitProgress < 1 ? 'exit' : 'past',
    progress: exitProgress,
    easedProgress: exitEased,
    opacity: Math.max(0, Math.min(1, opacity)),
    scale,
    blur: Math.max(0, blur),
    translateY,
    translateX: 0,
    glowAlpha,
    glowBlur,
    accentProgress,
  };
}

/**
 * Calculates continuous, smooth deterministic auto-scroll offset for scrolling lyrics list
 */
export function computeEasedScrollOffset(
  lineCenters: number[],
  activeIndex: number,
  currentTime: number,
  lyrics: LyricLine[],
  duration = 0.7,
  easing: CubicBezierCurve = EASING_PRESETS.spotifySmooth
): number {
  if (lineCenters.length === 0) return 0;
  if (activeIndex < 0) return lineCenters[0] || 0;

  const targetCenterY =
    activeIndex < lineCenters.length
      ? lineCenters[activeIndex]
      : lineCenters[lineCenters.length - 1];

  const prevCenterY =
    activeIndex > 0 && activeIndex - 1 < lineCenters.length
      ? lineCenters[activeIndex - 1]
      : targetCenterY;

  const activeLine = lyrics[activeIndex];
  const dt = activeLine ? Math.max(0, currentTime - activeLine.time) : 1;
  const progress = Math.min(1, Math.max(0, dt / duration));
  const eased = solveCubicBezier(progress, easing);

  return prevCenterY + (targetCenterY - prevCenterY) * eased;
}

/**
 * Safely sets the canvas filter property (falls back gracefully if unsupported)
 */
export function setContextFilter(ctx: CanvasRenderingContext2D, filter: string): void {
  try {
    ctx.filter = filter;
  } catch {
    ctx.filter = 'none';
  }
}

/**
 * Applies motion state transformations (opacity, scale, blur, slide, and glow)
 * to a Canvas 2D context, executes drawing callback, and cleanly restores state.
 */
export function applyCanvasMotion(
  ctx: CanvasRenderingContext2D,
  motion: LyricMotionState,
  anchorX: number,
  anchorY: number,
  renderFn: () => void,
  glowColor = 'rgba(255, 255, 255, 1)'
): void {
  // If completely invisible, skip drawing
  if (motion.opacity <= 0.001) return;

  ctx.save();

  // 1. Opacity
  ctx.globalAlpha = Math.max(0, Math.min(1, motion.opacity));

  // 2. CSS Blur Filter
  if (motion.blur > 0.4) {
    setContextFilter(ctx, `blur(${motion.blur.toFixed(1)}px)`);
  }

  // 3. Transformations: Translation + Scale anchored around (anchorX, anchorY)
  if (motion.translateY !== 0 || motion.translateX !== 0 || motion.scale !== 1.0) {
    ctx.translate(anchorX + motion.translateX, anchorY + motion.translateY);
    if (motion.scale !== 1.0) {
      ctx.scale(motion.scale, motion.scale);
    }
    ctx.translate(-anchorX, -anchorY);
  }

  // 4. Glow / textShadow simulation
  if (motion.glowBlur > 0 && motion.glowAlpha > 0) {
    ctx.shadowBlur = motion.glowBlur;
    if (glowColor.includes('rgba')) {
      // Replace alpha with motion.glowAlpha
      ctx.shadowColor = glowColor.replace(
        /rgba\(([^,]+),([^,]+),([^,]+),([^)]+)\)/,
        `rgba($1,$2,$3,${motion.glowAlpha.toFixed(2)})`
      );
    } else {
      ctx.shadowColor = `rgba(255, 255, 255, ${motion.glowAlpha.toFixed(2)})`;
    }
  }

  // 5. Draw Content
  renderFn();

  // 6. Clean reset
  setContextFilter(ctx, 'none');
  ctx.restore();
}
