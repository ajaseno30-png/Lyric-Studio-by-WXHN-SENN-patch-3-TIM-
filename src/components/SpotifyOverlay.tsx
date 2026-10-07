import React, { useState } from 'react';
import {
  ChevronDown,
  MoreVertical,
  Heart,
  Shuffle,
  SkipBack,
  Play,
  Pause,
  SkipForward,
  Repeat,
  Share2,
  ListMusic,
  Laptop2
} from 'lucide-react';

interface SpotifyOverlayProps {
  isVisible: boolean;
  opacity: number;
  songTitle?: string;
  artistName?: string;
}

export const SpotifyOverlay: React.FC<SpotifyOverlayProps> = ({
  isVisible,
  opacity,
  songTitle = 'Nocturne: Petals in Dim Light',
  artistName = 'Sculptural Impasto Studio',
}) => {
  const [isLiked, setIsLiked] = useState(true);
  const [isPlayingMock, setIsPlayingMock] = useState(true);

  if (!isVisible) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6 z-10 select-none text-white transition-opacity duration-300"
      style={{ opacity }}
    >
      {/* Top Bar Safe Zone */}
      <div className="flex items-center justify-between pt-4">
        <div className="p-2 rounded-full bg-black/30 backdrop-blur-md">
          <ChevronDown className="w-6 h-6 text-white" />
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] uppercase font-bold tracking-[0.18em] text-neutral-400">
            Playing From Album
          </span>
          <span className="text-xs font-semibold text-neutral-200 mt-0.5">
            Midnight Gallery (Spotify Canvas)
          </span>
        </div>
        <div className="p-2 rounded-full bg-black/30 backdrop-blur-md">
          <MoreVertical className="w-5 h-5 text-white" />
        </div>
      </div>

      {/* Center Safe Zone Indicator (Dotted Safe Area guidelines for artists) */}
      <div className="flex-1 flex items-center justify-center pointer-events-none">
        <div className="w-[88%] h-[68%] border border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-between p-3 opacity-40">
          <span className="text-[9px] uppercase tracking-widest text-white/50 bg-black/50 px-2 py-0.5 rounded">
            Safe Viewing Zone
          </span>
          <span className="text-[9px] uppercase tracking-widest text-white/40 bg-black/50 px-2 py-0.5 rounded">
            Focal Impasto Center
          </span>
        </div>
      </div>

      {/* Bottom Player Safe Zone */}
      <div className="pb-6 space-y-4">
        {/* Track Title and Like */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h2 className="text-xl font-bold tracking-tight text-white drop-shadow-md">
              {songTitle}
            </h2>
            <p className="text-sm font-medium text-neutral-300 drop-shadow">
              {artistName}
            </p>
          </div>
          <button
            onClick={() => setIsLiked(!isLiked)}
            className="pointer-events-auto p-2 hover:scale-110 active:scale-95 transition-transform"
          >
            <Heart
              className={`w-6 h-6 transition-colors ${
                isLiked ? 'text-[#1db954] fill-[#1db954]' : 'text-neutral-300'
              }`}
            />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="relative h-1 w-full bg-white/20 rounded-full overflow-hidden backdrop-blur-xs">
            <div className="h-full w-[38%] bg-white rounded-full relative">
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow" />
            </div>
          </div>
          <div className="flex justify-between text-[11px] font-medium text-neutral-400">
            <span>1:18</span>
            <span>3:42</span>
          </div>
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-between px-2">
          <Shuffle className="w-5 h-5 text-[#1db954]" />
          <SkipBack className="w-7 h-7 text-white fill-white" />
          <button
            onClick={() => setIsPlayingMock(!isPlayingMock)}
            className="pointer-events-auto w-14 h-14 rounded-full bg-white text-black flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-transform"
          >
            {isPlayingMock ? (
              <Pause className="w-6 h-6 fill-black" />
            ) : (
              <Play className="w-6 h-6 fill-black translate-x-0.5" />
            )}
          </button>
          <SkipForward className="w-7 h-7 text-white fill-white" />
          <Repeat className="w-5 h-5 text-neutral-400" />
        </div>

        {/* Bottom Utility Row */}
        <div className="flex items-center justify-between pt-1 text-neutral-400">
          <div className="flex items-center space-x-2 text-xs">
            <Laptop2 className="w-4 h-4 text-[#1db954]" />
            <span className="text-[#1db954] font-medium">Studio Monitors</span>
          </div>
          <div className="flex items-center space-x-4">
            <Share2 className="w-5 h-5 hover:text-white transition-colors" />
            <ListMusic className="w-5 h-5 hover:text-white transition-colors" />
          </div>
        </div>
      </div>
    </div>
  );
};
