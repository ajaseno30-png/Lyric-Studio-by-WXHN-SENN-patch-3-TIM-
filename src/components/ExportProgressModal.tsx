import React from 'react';
import { Cpu, Film, Sparkles, X, CheckCircle2, Clock, Zap, Activity } from 'lucide-react';

export interface ExportProgressData {
  percent: number;
  secondsLeft: number;
  currentFrame?: number;
  totalFrames?: number;
  fps?: number;
  stage?: string;
  engine?: string;
  elapsedSeconds?: number;
  throttleMode?: 'unthrottled' | 'balanced' | 'eco';
}

interface ExportProgressModalProps {
  isOpen: boolean;
  progress: ExportProgressData | null;
  trackTitle: string;
  artistName: string;
  resolution: string;
  fps: number;
  themeColor?: string;
  onCancel?: () => void;
}

function formatDuration(sec: number): string {
  if (sec <= 0 || !isFinite(sec)) return '0s';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  if (m > 0) {
    return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  }
  return `${s}s`;
}

export const ExportProgressModal: React.FC<ExportProgressModalProps> = ({
  isOpen,
  progress,
  trackTitle,
  artistName,
  resolution,
  fps,
  themeColor = '#1db954',
  onCancel,
}) => {
  if (!isOpen || !progress) return null;

  const percent = Math.min(100, Math.max(0, progress.percent));
  const currentFrame = progress.currentFrame || 0;
  const totalFrames = progress.totalFrames || 0;
  const currentFps = progress.fps || 0;
  const elapsedSec = progress.elapsedSeconds || 0;
  const stage = progress.stage || 'Memproses Frame Video...';
  const engine = progress.engine || 'Web Worker (WebCodecs + MP4-Muxer)';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 select-none">
      <div className="relative w-full max-w-lg bg-neutral-900/95 border border-neutral-800 rounded-3xl p-6 sm:p-7 shadow-2xl text-white overflow-hidden space-y-6">
        {/* Glow ambient background aura */}
        <div
          className="absolute -top-24 -right-24 w-64 h-64 rounded-full blur-3xl opacity-20 pointer-events-none transition-colors"
          style={{ backgroundColor: themeColor }}
        />
        <div
          className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full blur-3xl opacity-15 pointer-events-none transition-colors"
          style={{ backgroundColor: themeColor }}
        />

        {/* Header */}
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg shrink-0 transition-colors"
              style={{ backgroundColor: `${themeColor}22`, border: `1px solid ${themeColor}55` }}
            >
              <Film className="w-5 h-5" style={{ color: themeColor }} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2">
                <span>Mengekspor Video MP4</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-neutral-300 font-mono">
                  {resolution} &bull; {fps} FPS
                </span>
              </h2>
              <p className="text-xs text-neutral-400 truncate max-w-[260px] sm:max-w-[340px]">
                {trackTitle} &bull; <span className="text-neutral-500">{artistName}</span>
              </p>
            </div>
          </div>

          {onCancel && (
            <button
              onClick={onCancel}
              title="Batalkan Ekspor"
              className="p-1.5 rounded-xl hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Worker & Throttle Badge Indicator */}
        <div className="relative flex items-center justify-between px-3.5 py-2 rounded-xl bg-neutral-950/70 border border-neutral-800/80 text-xs">
          <div className="flex items-center gap-2 text-neutral-300">
            <span className="relative flex h-2 w-2">
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{ backgroundColor: themeColor }}
              />
              <span
                className="relative inline-flex rounded-full h-2 w-2"
                style={{ backgroundColor: themeColor }}
              />
            </span>
            <span className="font-semibold text-[11px] truncate">{engine}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-neutral-300">
            {progress.throttleMode === 'eco' ? (
              <>
                <span className="text-emerald-400 font-semibold">Mode Eco</span>
                <span className="text-neutral-500">&bull; CPU Throttled</span>
              </>
            ) : progress.throttleMode === 'unthrottled' ? (
              <>
                <span className="text-amber-400 font-semibold">Mode Maksimal</span>
                <span className="text-neutral-500">&bull; Full Speed</span>
              </>
            ) : (
              <>
                <span className="text-[#1db954] font-semibold">Mode Seimbang</span>
                <span className="text-neutral-500">&bull; Paced</span>
              </>
            )}
          </div>
        </div>

        {/* Main Progress Bar Area */}
        <div className="relative space-y-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5 truncate max-w-[280px]">
              <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: themeColor }} />
              <span className="truncate">{stage}</span>
            </span>
            <span className="font-mono text-2xl sm:text-3xl font-black tracking-tight" style={{ color: themeColor }}>
              {percent}%
            </span>
          </div>

          {/* Glowing Animated Progress Track */}
          <div className="relative w-full h-3.5 bg-neutral-950 rounded-full overflow-hidden border border-neutral-800 p-0.5 shadow-inner">
            <div
              className="h-full rounded-full transition-all duration-200 relative overflow-hidden"
              style={{
                width: `${percent}%`,
                background: `linear-gradient(90deg, ${themeColor}dd, ${themeColor})`,
              }}
            >
              {/* Shimmer light effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full animate-[shimmer_1.8s_infinite]" />
            </div>
          </div>

          {/* Sub-label: Frame count */}
          <div className="flex items-center justify-between text-[11px] text-neutral-400 font-mono">
            <span>
              {totalFrames > 0 ? (
                <>
                  Frame <strong className="text-white">{currentFrame}</strong> / {totalFrames}
                </>
              ) : (
                'Menyiapkan frame...'
              )}
            </span>
            <span>{percent < 100 ? `${100 - percent}% tersisa` : 'Finalisasi container'}</span>
          </div>
        </div>

        {/* Metrics Grid Cards */}
        <div className="relative grid grid-cols-3 gap-2.5 sm:gap-3 text-center">
          {/* Sisa Waktu */}
          <div className="p-3 rounded-2xl bg-neutral-950/60 border border-neutral-800/80 space-y-1">
            <div className="flex items-center justify-center gap-1 text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
              <Clock className="w-3 h-3" />
              <span>Sisa Waktu</span>
            </div>
            <p className="font-mono text-sm sm:text-base font-bold text-white">
              ~{formatDuration(progress.secondsLeft)}
            </p>
          </div>

          {/* Waktu Berjalan */}
          <div className="p-3 rounded-2xl bg-neutral-950/60 border border-neutral-800/80 space-y-1">
            <div className="flex items-center justify-center gap-1 text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
              <Activity className="w-3 h-3" />
              <span>Berjalan</span>
            </div>
            <p className="font-mono text-sm sm:text-base font-bold text-white">
              {formatDuration(elapsedSec)}
            </p>
          </div>

          {/* Kecepatan Render */}
          <div className="p-3 rounded-2xl bg-neutral-950/60 border border-neutral-800/80 space-y-1">
            <div className="flex items-center justify-center gap-1 text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
              <Zap className="w-3 h-3" />
              <span>Kecepatan</span>
            </div>
            <p className="font-mono text-sm sm:text-base font-bold text-white">
              {currentFps > 0 ? `${currentFps} FPS` : 'Menghitung...'}
            </p>
          </div>
        </div>

        {/* Informative Tip */}
        <p className="text-[11px] text-neutral-400 text-center leading-relaxed">
          Rendering dilakukan secara <span className="text-neutral-200 font-medium">offline & frame-by-frame</span> pada kualitas master tanpa kehilangan frame. Video MP4 H.264 & audio AAC akan otomatis terunduh setelah selesai.
        </p>

        {/* Footer cancel button if provided */}
        {onCancel && (
          <div className="pt-1 flex justify-center">
            <button
              onClick={onCancel}
              className="text-xs text-neutral-400 hover:text-red-400 transition-colors py-1 px-3 rounded-lg hover:bg-neutral-800/60"
            >
              Batalkan Ekspor
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
