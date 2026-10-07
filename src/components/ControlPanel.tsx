import React, { useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Sliders,
  Eye,
  Camera,
  Download,
  Info,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Sun,
  Wind,
  Layers,
  MousePointer,
  Compass
} from 'lucide-react';
import { TrajectoryMode } from '../utils/lightTrajectories';

export interface ExportProgress {
  isRecording: boolean;
  progress: number; // 0 to 100
  secondsLeft: number;
}

interface ControlPanelProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onRestart: () => void;
  currentTime: number;
  onSeek: (time: number) => void;
  loopDuration: number;
  onLoopDurationChange: (duration: number) => void;
  trajectoryMode: TrajectoryMode;
  onTrajectoryChange: (mode: TrajectoryMode) => void;
  lightIntensity: number;
  onLightIntensityChange: (val: number) => void;
  beamRadius: number;
  onBeamRadiusChange: (val: number) => void;
  impastoDepth: number;
  onImpastoDepthChange: (val: number) => void;
  breezeStrength: number;
  onBreezeStrengthChange: (val: number) => void;
  ambientLevel: number;
  onAmbientLevelChange: (val: number) => void;
  interactiveTorch: boolean;
  onToggleInteractiveTorch: () => void;
  showSpotifyOverlay: boolean;
  onToggleSpotifyOverlay: () => void;
  isGalleryMode: boolean;
  onToggleGalleryMode: () => void;
  isAudioPlaying: boolean;
  onToggleAudio: () => void;
  onExportVideo: () => void;
  onCaptureFrame: () => void;
  onOpenSpecsModal: () => void;
  exportProgress: ExportProgress | null;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  isPlaying,
  onTogglePlay,
  onRestart,
  currentTime,
  onSeek,
  loopDuration,
  onLoopDurationChange,
  trajectoryMode,
  onTrajectoryChange,
  lightIntensity,
  onLightIntensityChange,
  beamRadius,
  onBeamRadiusChange,
  impastoDepth,
  onImpastoDepthChange,
  breezeStrength,
  onBreezeStrengthChange,
  ambientLevel,
  onAmbientLevelChange,
  interactiveTorch,
  onToggleInteractiveTorch,
  showSpotifyOverlay,
  onToggleSpotifyOverlay,
  isGalleryMode,
  onToggleGalleryMode,
  isAudioPlaying,
  onToggleAudio,
  onExportVideo,
  onCaptureFrame,
  onOpenSpecsModal,
  exportProgress,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'lighting' | 'breeze' | 'modes'>('lighting');

  const progressPercent = ((currentTime % loopDuration) / loopDuration) * 100;

  return (
    <div className="w-full max-w-2xl mx-auto px-4 pb-4 select-none z-30">
      {/* Floating Glass Control Dock */}
      <div className="bg-neutral-950/85 backdrop-blur-xl border border-neutral-800/80 rounded-2xl shadow-2xl p-4 transition-all duration-300">
        {/* Main Bar: Play, Scrubber, Time, Export, Expand */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            {/* Play/Pause & Restart */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={onTogglePlay}
                title={isPlaying ? 'Pause Loop' : 'Play Loop'}
                className="w-10 h-10 rounded-xl bg-white hover:bg-neutral-200 text-black flex items-center justify-center transition-transform active:scale-95 shadow-md"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-black" />
                ) : (
                  <Play className="w-4 h-4 fill-black translate-x-0.5" />
                )}
              </button>

              <button
                onClick={onRestart}
                title="Reset to Frame 0"
                className="w-9 h-9 rounded-xl border border-neutral-800 hover:bg-neutral-800/80 text-neutral-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Seamless Loop Scrubber */}
            <div className="flex-1 flex flex-col gap-1 min-w-[140px]">
              <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400 px-0.5">
                <span className="text-neutral-200">
                  {currentTime.toFixed(2)}s
                </span>
                <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                  Seamless Loop &bull; {loopDuration}s
                </span>
              </div>
              <div className="relative flex items-center group cursor-pointer">
                <input
                  type="range"
                  min="0"
                  max={loopDuration}
                  step="0.01"
                  value={currentTime % loopDuration}
                  onChange={(e) => onSeek(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-[#1db954] focus:outline-none"
                />
              </div>
            </div>

            {/* Utility Quick Toggles */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Audio toggle */}
              <button
                onClick={onToggleAudio}
                title={isAudioPlaying ? 'Mute Gallery Room Ambience' : 'Play Subtle Room Ambience'}
                className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors ${
                  isAudioPlaying
                    ? 'border-[#1db954]/50 bg-[#1db954]/10 text-[#1db954]'
                    : 'border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800'
                }`}
              >
                {isAudioPlaying ? (
                  <Volume2 className="w-3.5 h-3.5" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5" />
                )}
              </button>

              {/* Spotify Overlay Toggle */}
              <button
                onClick={onToggleSpotifyOverlay}
                title="Toggle Spotify Mobile UI Mockup"
                className={`px-2.5 h-9 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  showSpotifyOverlay
                    ? 'border-[#1db954]/60 bg-[#1db954]/15 text-[#1db954]'
                    : 'border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Spotify</span>
              </button>

              {/* Gallery Exhibition Mode Toggle */}
              <button
                onClick={onToggleGalleryMode}
                title="Toggle Museum Gallery Exhibition Frame"
                className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-colors ${
                  isGalleryMode
                    ? 'border-neutral-600 bg-neutral-800 text-white'
                    : 'border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
              </button>

              {/* Export Video Button */}
              <button
                onClick={onExportVideo}
                disabled={Boolean(exportProgress?.isRecording)}
                title="Export Spotify Canvas Video (MP4/WebM)"
                className="px-3 h-9 rounded-xl bg-[#1db954] hover:bg-[#1ed760] disabled:bg-neutral-800 disabled:text-neutral-500 text-black font-semibold text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95 shrink-0"
              >
                {exportProgress?.isRecording ? (
                  <>
                    <div className="w-3 h-3 rounded-full border-2 border-black border-t-transparent animate-spin" />
                    <span>{exportProgress.progress}%</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden xs:inline">Export Canvas</span>
                  </>
                )}
              </button>

              {/* Expand Deck Button */}
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                title={isExpanded ? 'Collapse Settings' : 'Expand Fine-Tuning Controls'}
                className="w-9 h-9 rounded-xl border border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800 flex items-center justify-center transition-colors"
              >
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <Sliders className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Exporting Progress Bar Banner */}
          {exportProgress?.isRecording && (
            <div className="p-2.5 rounded-xl bg-[#1db954]/10 border border-[#1db954]/30 flex items-center justify-between text-xs text-[#1db954]">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#1db954] animate-pulse" />
                <span>Recording seamless loop for Spotify Canvas...</span>
              </div>
              <span className="font-mono font-semibold">{exportProgress.secondsLeft}s remaining</span>
            </div>
          )}

          {/* Expanded Drawer */}
          {isExpanded && (
            <div className="pt-3 border-t border-neutral-800/80 space-y-4 animate-in fade-in duration-200">
              {/* Tab Navigation */}
              <div className="flex items-center justify-between gap-2 border-b border-neutral-800/60 pb-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('lighting')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                      activeTab === 'lighting'
                        ? 'bg-neutral-800 text-white'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5 text-amber-300" />
                    Light Sweep
                  </button>

                  <button
                    onClick={() => setActiveTab('breeze')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                      activeTab === 'breeze'
                        ? 'bg-neutral-800 text-white'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <Wind className="w-3.5 h-3.5 text-blue-400" />
                    Impasto & Breeze
                  </button>

                  <button
                    onClick={() => setActiveTab('modes')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                      activeTab === 'modes'
                        ? 'bg-neutral-800 text-white'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5 text-emerald-400" />
                    Duration & Paths
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={onCaptureFrame}
                    className="p-1.5 rounded-lg border border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800 text-xs flex items-center gap-1"
                    title="Capture still snapshot"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Still</span>
                  </button>
                  <button
                    onClick={onOpenSpecsModal}
                    className="p-1.5 rounded-lg border border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800 text-xs flex items-center gap-1"
                    title="Spotify Canvas Guidelines"
                  >
                    <Info className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Specs</span>
                  </button>
                </div>
              </div>

              {/* Tab 1: Light Sweep Controls */}
              {activeTab === 'lighting' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  {/* Light Intensity */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-neutral-400">
                      <span>Light Intensity</span>
                      <span className="font-mono text-neutral-200">
                        {Math.round(lightIntensity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.4"
                      max="1.8"
                      step="0.05"
                      value={lightIntensity}
                      onChange={(e) => onLightIntensityChange(parseFloat(e.target.value))}
                      className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-amber-400"
                    />
                  </div>

                  {/* Beam Radius / Softness */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-neutral-400">
                      <span>Beam Diffusion</span>
                      <span className="font-mono text-neutral-200">
                        {Math.round(beamRadius * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.25"
                      max="0.95"
                      step="0.02"
                      value={beamRadius}
                      onChange={(e) => onBeamRadiusChange(parseFloat(e.target.value))}
                      className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-amber-400"
                    />
                  </div>

                  {/* Ambient Chiaroscuro Level */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-neutral-400">
                      <span>Ambient Darkness</span>
                      <span className="font-mono text-neutral-200">
                        {Math.round((1 - ambientLevel) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.08"
                      max="0.45"
                      step="0.02"
                      value={ambientLevel}
                      onChange={(e) => onAmbientLevelChange(parseFloat(e.target.value))}
                      className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-neutral-400"
                    />
                  </div>
                </div>
              )}

              {/* Tab 2: Impasto & Breeze */}
              {activeTab === 'breeze' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  {/* Impasto Relief Depth */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-neutral-400">
                      <span>Impasto Ridge Relief</span>
                      <span className="font-mono text-neutral-200">
                        {Math.round(impastoDepth * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.3"
                      max="2.0"
                      step="0.05"
                      value={impastoDepth}
                      onChange={(e) => onImpastoDepthChange(parseFloat(e.target.value))}
                      className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-blue-400"
                    />
                    <p className="text-[10px] text-neutral-500">
                      Accentuates 3D palette knife brushstrokes and shifting shadows
                    </p>
                  </div>

                  {/* Nighttime Breeze */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-neutral-400">
                      <span>Blue Flower Breeze</span>
                      <span className="font-mono text-neutral-200">
                        {Math.round(breezeStrength * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.0"
                      max="1.5"
                      step="0.05"
                      value={breezeStrength}
                      onChange={(e) => onBreezeStrengthChange(parseFloat(e.target.value))}
                      className="w-full h-1 bg-neutral-800 rounded appearance-none cursor-pointer accent-blue-400"
                    />
                    <p className="text-[10px] text-neutral-500">
                      Gentle, organic sway on blue florets; central flower stays still
                    </p>
                  </div>
                </div>
              )}

              {/* Tab 3: Duration & Trajectory Modes */}
              {activeTab === 'modes' && (
                <div className="space-y-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-neutral-400 font-medium">Loop Duration:</span>
                    <div className="flex items-center gap-1.5">
                      {[6, 8, 10, 12, 15].map((sec) => (
                        <button
                          key={sec}
                          onClick={() => onLoopDurationChange(sec)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors ${
                            loopDuration === sec
                              ? 'bg-[#1db954] text-black font-bold'
                              : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                          }`}
                        >
                          {sec}s {sec === 8 ? '(Spotify)' : ''}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-neutral-800/40">
                    <span className="text-neutral-400 font-medium">Light Trajectory:</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onTrajectoryChange('gallery_sweep')}
                        className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                          trajectoryMode === 'gallery_sweep' && !interactiveTorch
                            ? 'bg-neutral-200 text-black font-semibold'
                            : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                        }`}
                      >
                        Gallery Sweep
                      </button>
                      <button
                        onClick={() => onTrajectoryChange('diagonal_chiaroscuro')}
                        className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                          trajectoryMode === 'diagonal_chiaroscuro' && !interactiveTorch
                            ? 'bg-neutral-200 text-black font-semibold'
                            : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                        }`}
                      >
                        Diagonal Ray
                      </button>
                      <button
                        onClick={() => onTrajectoryChange('perpetual_eclipse')}
                        className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${
                          trajectoryMode === 'perpetual_eclipse' && !interactiveTorch
                            ? 'bg-neutral-200 text-black font-semibold'
                            : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                        }`}
                      >
                        Orbit Halo
                      </button>
                      <button
                        onClick={onToggleInteractiveTorch}
                        className={`px-2.5 py-1 rounded-lg text-xs flex items-center gap-1 transition-colors ${
                          interactiveTorch
                            ? 'bg-amber-400 text-black font-semibold'
                            : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                        }`}
                      >
                        <MousePointer className="w-3 h-3" />
                        Interactive Torch
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
