/**
 * Mathematical trajectories that guarantee C1/C2 continuous seamless loops
 */

export type TrajectoryMode = 'gallery_sweep' | 'diagonal_chiaroscuro' | 'perpetual_eclipse' | 'interactive';

export interface TrajectoryPoint {
  x: number;
  y: number;
  z: number;
  intensityFactor: number;
}

export function computeLightPosition(
  mode: TrajectoryMode,
  time: number,
  duration: number,
  interactivePos?: { x: number; y: number }
): TrajectoryPoint {
  if (mode === 'interactive' && interactivePos) {
    return {
      x: interactivePos.x,
      y: interactivePos.y,
      z: 0.35,
      intensityFactor: 1.0,
    };
  }

  const phase = (time % duration) / duration;
  const theta = 2 * Math.PI * phase;

  switch (mode) {
    case 'gallery_sweep': {
      // Soft horizontal glide across the petals with subtle vertical breathing
      const x = 0.5 + 0.38 * Math.sin(theta);
      const y = 0.50 + 0.12 * Math.cos(theta) + 0.05 * Math.sin(2 * theta);
      const z = 0.32 + 0.06 * Math.sin(theta + Math.PI / 4);
      // Subtle pulse in intensity that also loops seamlessly
      const intensityFactor = 0.95 + 0.15 * Math.cos(theta);
      return { x, y, z, intensityFactor };
    }

    case 'diagonal_chiaroscuro': {
      // Slanted beam drifting from top-left through the flower heart to bottom-right
      const x = 0.5 + 0.36 * Math.sin(theta);
      const y = 0.5 + 0.32 * Math.sin(theta - 0.4);
      const z = 0.28 + 0.08 * Math.cos(theta);
      const intensityFactor = 0.92 + 0.18 * Math.cos(theta);
      return { x, y, z, intensityFactor };
    }

    case 'perpetual_eclipse': {
      // Slow elliptical halo orbiting the central bloom
      const x = 0.5 + 0.28 * Math.cos(theta);
      const y = 0.52 + 0.26 * Math.sin(theta);
      const z = 0.30 + 0.05 * Math.sin(2 * theta);
      const intensityFactor = 1.0 + 0.1 * Math.sin(theta);
      return { x, y, z, intensityFactor };
    }

    default:
      return { x: 0.5, y: 0.5, z: 0.35, intensityFactor: 1.0 };
  }
}
