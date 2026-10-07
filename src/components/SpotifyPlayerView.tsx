import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LyricLine, TrackMeta, SpotifyDisplayMode, SpotifyTheme, AspectRatio } from '../types/lyrics';
import { formatPlayerTime, findActiveLyricIndex } from '../utils/lrcParser';
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
  Laptop2,
  Maximize2,
  Minimize2,
  Sparkles,
  Volume2,
  Languages,
  Tv
} from 'lucide-react';

interface SpotifyPlayerViewProps {
  trackMeta: TrackMeta;
  lyrics: LyricLine[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  displayMode: SpotifyDisplayMode;
  onChangeDisplayMode: (mode: SpotifyDisplayMode) => void;
  theme: SpotifyTheme;
  aspectRatio?: AspectRatio;
  showTranslation?: boolean;
  onToggleTranslation?: () => void;
  customVideoUrl?: string | null;
  renderCanvasContent?: React.ReactNode;
}

export const SpotifyPlayerView: React.FC<SpotifyPlayerViewProps> = ({
  trackMeta,
  lyrics,
  currentTime,
  duration,
  isPlaying,
  onTogglePlay,
  onSeek,
  displayMode,
  onChangeDisplayMode,
  theme,
  aspectRatio = '9:16',
  showTranslation = true,
  onToggleTranslation,
  customVideoUrl,
  renderCanvasContent,
}) => {
  const [isLiked, setIsLiked] = useState(true);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(true);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const activeLyricRef = useRef<HTMLDivElement | null>(null);
  const videoElemRef = useRef<HTMLVideoElement | null>(null);

  const activeIndex = findActiveLyricIndex(lyrics, currentTime);

  // Sync custom video element playback with master audio clock
  useEffect(() => {
    const video = videoElemRef.current;
    if (!video) return;

    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying]);

  // Sync video time when seeking
  useEffect(() => {
    const video = videoElemRef.current;
    if (!video) return;
    if (Math.abs(video.currentTime - (currentTime % (video.duration || 10))) > 0.3) {
      video.currentTime = currentTime % (video.duration || 10);
    }
  }, [currentTime]);

  // Smoothly auto-scroll active lyric into view
  useEffect(() => {
    if (activeLyricRef.current) {
      activeLyricRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeIndex]);

  // Theme styling configurations
  const themeStyles = {
    emerald: {
      accent: '#1DB954',
      bgGradient: 'from-[#0d2818] via-[#050e09] to-[#040406]',
      lyricsCardBg: 'bg-[#153e24]/90',
      activeSubtext: 'text-emerald-300',
    },
    charcoal: {
      accent: '#a1a1aa',
      bgGradient: 'from-[#27272a] via-[#18181b] to-[#09090b]',
      lyricsCardBg: 'bg-[#27272a]/90',
      activeSubtext: 'text-neutral-300',
    },
    midnight: {
      accent: '#1DB954',
      bgGradient: 'from-[#18181b] via-[#0a0a0c] to-[#030304]',
      lyricsCardBg: 'bg-[#18181b]/90',
      activeSubtext: 'text-emerald-300',
    },
    indigo: {
      accent: '#818cf8',
      bgGradient: 'from-[#1e1b4b] via-[#0f0e26] to-[#030304]',
      lyricsCardBg: 'bg-[#2e2a72]/90',
      activeSubtext: 'text-indigo-300',
    },
    amber: {
      accent: '#fbbf24',
      bgGradient: 'from-[#451a03] via-[#1f0d02] to-[#050507]',
      lyricsCardBg: 'bg-[#5c2404]/90',
      activeSubtext: 'text-amber-300',
    },
    // 7 New Requested Spotify Color Themes
    cool_gray: {
      accent: '#cbd5e1', // Abu-Abu yang keren (Titanium Slate)
      bgGradient: 'from-[#1e293b] via-[#0f172a] to-[#020617]',
      lyricsCardBg: 'bg-[#1e293b]/95',
      activeSubtext: 'text-slate-300',
    },
    purple_orchid: {
      accent: '#c084fc', // Dark purple orchid
      bgGradient: 'from-[#3b0764] via-[#1e0538] to-[#090111]',
      lyricsCardBg: 'bg-[#3b0764]/95',
      activeSubtext: 'text-purple-300',
    },
    gold_kamboja: {
      accent: '#fbbf24', // Gold dark kamboja
      bgGradient: 'from-[#451a03] via-[#240e02] to-[#0a0400]',
      lyricsCardBg: 'bg-[#4e1f06]/95',
      activeSubtext: 'text-amber-200',
    },
    pink_sakura: {
      accent: '#f472b6', // Pink blossom sakura
      bgGradient: 'from-[#500724] via-[#280312] to-[#0c0005]',
      lyricsCardBg: 'bg-[#5e0a2d]/95',
      activeSubtext: 'text-pink-300',
    },
    red_amaranth: {
      accent: '#f43f5e', // Red amaranth
      bgGradient: 'from-[#4c0519] via-[#23020b] to-[#0a0003]',
      lyricsCardBg: 'bg-[#5c0821]/95',
      activeSubtext: 'text-rose-300',
    },
    green_poison: {
      accent: '#22c55e', // Green poison (toxic neon)
      bgGradient: 'from-[#052e16] via-[#02180b] to-[#000a04]',
      lyricsCardBg: 'bg-[#093d1e]/95',
      activeSubtext: 'text-emerald-300',
    },
    dark_tree_brown: {
      accent: '#b45309', // Dark tree brown (woodland timber)
      bgGradient: 'from-[#2e1509] via-[#170a04] to-[#080301]',
      lyricsCardBg: 'bg-[#381a0c]/95',
      activeSubtext: 'text-amber-300',
    },
  }[theme];

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Aspect ratio container dimensions
  const containerClasses = {
    '9:16': 'w-full h-full max-w-[420px] max-h-[890px] aspect-[9/16] sm:rounded-3xl',
    '1:1': 'w-full h-full max-w-[580px] max-h-[580px] aspect-square sm:rounded-2xl',
    '16:9': 'w-full h-full max-w-[960px] max-h-[540px] aspect-[16/9] sm:rounded-2xl',
  }[aspectRatio];

  return (
    <div className="relative w-full h-full flex items-center justify-center select-none overflow-hidden font-sans p-1 sm:p-4">
      {/* Dynamic Spotify Frame Container */}
      <div
        id="spotify-capture-container"
        className={`relative ${containerClasses} bg-gradient-to-b ${themeStyles.bgGradient} flex flex-col justify-between overflow-hidden shadow-2xl border border-neutral-800/80 transition-all duration-300`}
      >
        {/* ============================================================== */}
        {/* TOP STATUS & NAVIGATION BAR (COMMON FOR 9:16 & 1:1)             */}
        {/* ============================================================== */}
        {aspectRatio !== '16:9' && (
          <div className="relative z-20 flex items-center justify-between p-4 pt-5 pb-2 text-white shrink-0">
            <button
              onClick={() =>
                onChangeDisplayMode(
                  displayMode === 'expanded_lyrics' ? 'now_playing' : 'expanded_lyrics'
                )
              }
              className="p-2 rounded-full hover:bg-white/10 active:scale-95 transition-all"
              title="Ubah Tampilan"
            >
              <ChevronDown className="w-5 h-5 text-white" />
            </button>

            <div className="flex flex-col items-center max-w-[60%] text-center">
              <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-neutral-400 truncate">
                Sedang Memutar dari Playlist
              </span>
              <span className="text-xs font-semibold text-neutral-100 truncate mt-0.5">
                {trackMeta.album || 'Nocturne Collection'}
              </span>
            </div>

            <div className="flex items-center gap-1">
              {onToggleTranslation && (
                <button
                  onClick={onToggleTranslation}
                  className={`p-1.5 rounded-full text-xs transition-colors ${
                    showTranslation
                      ? 'bg-[#1db954]/20 text-[#1db954]'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                  title={showTranslation ? 'Sembunyikan Terjemahan' : 'Tampilkan Terjemahan'}
                >
                  <Languages className="w-4 h-4" />
                </button>
              )}
              <button className="p-2 rounded-full hover:bg-white/10 active:scale-95 transition-all">
                <MoreVertical className="w-4 h-4 text-neutral-300" />
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* LAYOUT A: 16:9 SPOTIFY DESKTOP / WEB PLAYER                    */}
        {/* ============================================================== */}
        {aspectRatio === '16:9' && (
          <div className="relative z-10 flex-1 flex flex-col justify-between p-4 sm:p-6 overflow-hidden">
            {/* Top Desktop Bar */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10 text-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-[#1db954] flex items-center justify-center text-black font-bold text-xs">
                  S
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                    Spotify Web Player
                  </span>
                  <span className="text-xs font-semibold text-neutral-200 truncate">
                    {trackMeta.album || 'Nocturne Collection'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {onToggleTranslation && (
                  <button
                    onClick={onToggleTranslation}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                      showTranslation
                        ? 'bg-[#1db954]/20 text-[#1db954] border border-[#1db954]/40'
                        : 'bg-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                  >
                    <Languages className="w-3.5 h-3.5" />
                    <span>Sub-Lirik Bilingual</span>
                  </button>
                )}
                <div className="text-[11px] font-mono text-neutral-400 bg-white/5 px-2 py-0.5 rounded">
                  16:9 Widescreen
                </div>
              </div>
            </div>

            {/* Desktop Center: Left Media Cover + Right Synchronized Lyrics Stream */}
            <div className="flex-1 grid grid-cols-12 gap-5 items-center py-3 overflow-hidden">
              {/* Left Column: Video/Cover Art (5 cols) */}
              <div className="col-span-5 flex flex-col items-center justify-center">
                <div className="w-full aspect-square max-h-[280px] rounded-2xl overflow-hidden shadow-2xl border border-white/10 relative bg-black">
                  {customVideoUrl ? (
                    <video
                      ref={videoElemRef}
                      src={customVideoUrl}
                      loop
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full relative">{renderCanvasContent}</div>
                  )}
                </div>

                <div className="w-full mt-3 flex items-center justify-between px-1">
                  <div className="space-y-0.5 truncate">
                    <h2 className="text-lg font-bold text-white tracking-tight truncate">
                      {trackMeta.title}
                    </h2>
                    <p className="text-xs font-medium text-neutral-400 truncate">
                      {trackMeta.artist}
                    </p>
                  </div>
                  <button
                    onClick={() => setIsLiked(!isLiked)}
                    className="p-1.5 hover:scale-110 active:scale-95 transition-transform"
                  >
                    <Heart
                      className="w-5 h-5 transition-colors"
                      style={{
                        color: isLiked ? themeStyles.accent : '#a3a3a3',
                        fill: isLiked ? themeStyles.accent : 'transparent',
                      }}
                    />
                  </button>
                </div>
              </div>

              {/* Right Column: Synchronized Scrolling Lyrics (7 cols) */}
              <div
                ref={lyricsContainerRef}
                className="col-span-7 h-full max-h-[290px] overflow-y-auto px-4 py-2 space-y-3.5 scroll-smooth no-scrollbar rounded-2xl bg-black/30 border border-white/5"
              >
                {lyrics.map((line, index) => {
                  const isActive = index === activeIndex;
                  const isPast = index < activeIndex;

                  return (
                    <div
                      key={line.id || index}
                      ref={isActive ? activeLyricRef : null}
                      onClick={() => onSeek(line.time)}
                      className={`cursor-pointer transition-all duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] origin-left ${
                        isActive
                          ? 'text-white font-extrabold text-xl leading-snug drop-shadow-md scale-[1.02] pl-3 border-l-2 opacity-100'
                          : isPast
                          ? 'text-white/40 font-semibold text-base hover:text-white/70 pl-3 border-l-2 border-transparent opacity-40'
                          : 'text-white/25 font-semibold text-base hover:text-white/50 pl-3 border-l-2 border-transparent opacity-25'
                      }`}
                      style={{
                        borderColor: isActive ? themeStyles.accent : 'transparent',
                        textShadow: isActive ? '0 0 18px rgba(255, 255, 255, 0.35)' : 'none',
                        transition: 'all 0.7s cubic-bezier(0.25, 1, 0.5, 1), text-shadow 0.7s ease, opacity 0.7s ease',
                      }}
                    >
                      <div className="transition-all duration-700">{line.text}</div>
                      {showTranslation && line.translation && (
                        <div
                          className={`text-xs mt-0.5 transition-colors duration-700 font-medium ${
                            isActive ? themeStyles.activeSubtext : 'text-white/25'
                          }`}
                        >
                          {line.translation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Desktop Bottom Controls & Scrubber */}
            <div className="pt-2 border-t border-white/10 flex flex-col gap-1.5 shrink-0">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIsShuffle(!isShuffle)}
                    className={`p-1 ${isShuffle ? 'text-[#1db954]' : 'text-neutral-400'}`}
                  >
                    <Shuffle className="w-4 h-4" />
                  </button>
                  <button onClick={() => onSeek(Math.max(0, currentTime - 5))} className="text-white">
                    <SkipBack className="w-5 h-5 fill-white" />
                  </button>
                  <button
                    onClick={onTogglePlay}
                    className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center active:scale-95 shadow"
                  >
                    {isPlaying ? <Pause className="w-4 h-4 fill-black" /> : <Play className="w-4 h-4 fill-black translate-x-0.5" />}
                  </button>
                  <button onClick={() => onSeek(Math.min(duration, currentTime + 5))} className="text-white">
                    <SkipForward className="w-5 h-5 fill-white" />
                  </button>
                  <button
                    onClick={() => setIsRepeat(!isRepeat)}
                    className={`p-1 ${isRepeat ? 'text-[#1db954]' : 'text-neutral-400'}`}
                  >
                    <Repeat className="w-4 h-4" />
                  </button>
                </div>

                {/* Scrubber Bar */}
                <div className="flex-1 flex items-center gap-3">
                  <span className="text-[11px] font-mono text-neutral-400 min-w-[34px] text-right">
                    {formatPlayerTime(currentTime)}
                  </span>
                  <div
                    className="relative flex-1 h-1.5 bg-white/20 hover:h-2 rounded-full overflow-hidden cursor-pointer group transition-all"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pos = (e.clientX - rect.left) / rect.width;
                      onSeek(pos * duration);
                    }}
                  >
                    <div
                      className="h-full rounded-full relative transition-all"
                      style={{ width: `${progressPercent}%`, backgroundColor: themeStyles.accent }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-neutral-400 min-w-[34px]">
                    {formatPlayerTime(duration)}
                  </span>
                </div>

                {/* Right Desktop Utilities */}
                <div className="flex items-center gap-3 text-neutral-400 text-xs">
                  <Laptop2 className="w-4 h-4 text-[#1db954]" />
                  <Share2 className="w-4 h-4 hover:text-white" />
                  <ListMusic className="w-4 h-4 hover:text-white" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* LAYOUT B: 1:1 SQUARE SPOTIFY FEED / POST LAYOUT                */}
        {/* ============================================================== */}
        {aspectRatio === '1:1' && (
          <div className="relative z-10 flex-1 flex flex-col justify-between px-5 pb-5 overflow-hidden">
            {/* Split Grid: Top Visual, Bottom Controls & Lyrics */}
            <div className="flex-1 grid grid-cols-2 gap-4 items-center my-auto">
              {/* Left: Square Video Canvas */}
              <div className="aspect-square rounded-2xl overflow-hidden shadow-2xl border border-white/10 relative bg-black">
                {customVideoUrl ? (
                  <video
                    ref={videoElemRef}
                    src={customVideoUrl}
                    loop
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full relative">{renderCanvasContent}</div>
                )}
              </div>

              {/* Right: Synced Lyrics Card */}
              <div className={`h-full max-h-[220px] p-4 rounded-2xl ${themeStyles.lyricsCardBg} border border-white/10 flex flex-col justify-between overflow-hidden shadow-lg`}>
                <div className="flex items-center justify-between pb-1 border-b border-white/10">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white">
                    Lirik Spotify
                  </span>
                  {showTranslation && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/20 text-white font-medium">
                      Bilingual
                    </span>
                  )}
                </div>

                <div className="space-y-2 py-2 overflow-hidden flex-1 flex flex-col justify-center min-h-[90px] relative">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {lyrics[activeIndex] && (
                      <motion.div
                        key={lyrics[activeIndex].id || `sq-${activeIndex}`}
                        initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                        className="w-full"
                      >
                        <p className="text-white font-extrabold text-base leading-tight drop-shadow-sm truncate">
                          {lyrics[activeIndex].text}
                        </p>
                        {showTranslation && lyrics[activeIndex].translation && (
                          <p className={`text-xs font-semibold mt-1 drop-shadow-xs truncate ${themeStyles.activeSubtext}`}>
                            {lyrics[activeIndex].translation}
                          </p>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <AnimatePresence mode="popLayout" initial={false}>
                    {lyrics[activeIndex + 1] && (
                      <motion.p
                        key={lyrics[activeIndex + 1].id || `sq-next-${activeIndex + 1}`}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 0.35, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.5 }}
                        className="text-white/35 font-medium text-xs truncate pt-0.5"
                      >
                        {lyrics[activeIndex + 1].text}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                <div className="text-[10px] text-white/50 text-right">
                  Baris {activeIndex + 1} / {lyrics.length}
                </div>
              </div>
            </div>

            {/* Bottom Meta & Scrubber */}
            <div className="space-y-2 pt-2 shrink-0">
              <div className="flex items-center justify-between">
                <div className="truncate">
                  <h2 className="text-lg font-bold text-white tracking-tight truncate">
                    {trackMeta.title}
                  </h2>
                  <p className="text-xs text-neutral-400 truncate">{trackMeta.artist}</p>
                </div>
                <button onClick={() => setIsLiked(!isLiked)} className="p-1">
                  <Heart
                    className="w-5 h-5 transition-colors"
                    style={{
                      color: isLiked ? themeStyles.accent : '#a3a3a3',
                      fill: isLiked ? themeStyles.accent : 'transparent',
                    }}
                  />
                </button>
              </div>

              {/* Scrubber */}
              <div className="space-y-1">
                <div
                  className="relative h-1 w-full bg-white/20 hover:h-2 rounded-full overflow-hidden cursor-pointer group"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pos = (e.clientX - rect.left) / rect.width;
                    onSeek(pos * duration);
                  }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${progressPercent}%`, backgroundColor: themeStyles.accent }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono text-neutral-400">
                  <span>{formatPlayerTime(currentTime)}</span>
                  <span>{formatPlayerTime(duration)}</span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-between px-2 pt-1">
                <Shuffle className={`w-4 h-4 ${isShuffle ? 'text-[#1db954]' : 'text-neutral-400'}`} />
                <button onClick={() => onSeek(Math.max(0, currentTime - 5))}>
                  <SkipBack className="w-6 h-6 fill-white text-white" />
                </button>
                <button
                  onClick={onTogglePlay}
                  className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center active:scale-95 shadow-xl"
                >
                  {isPlaying ? <Pause className="w-5 h-5 fill-black" /> : <Play className="w-5 h-5 fill-black translate-x-0.5" />}
                </button>
                <button onClick={() => onSeek(Math.min(duration, currentTime + 5))}>
                  <SkipForward className="w-6 h-6 fill-white text-white" />
                </button>
                <Repeat className={`w-4 h-4 ${isRepeat ? 'text-[#1db954]' : 'text-neutral-400'}`} />
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* LAYOUT C: 9:16 VERTICAL SPOTIFY NOW PLAYING                    */}
        {/* ============================================================== */}
        {aspectRatio === '9:16' && displayMode === 'now_playing' && (
          <div className="relative z-10 flex-1 flex flex-col justify-between px-5 pb-4 overflow-y-auto overflow-x-hidden">
            {/* Visual Canvas / Video Player */}
            <div className="w-full aspect-square max-h-[320px] my-auto rounded-2xl overflow-hidden shadow-[0_20px_45px_rgba(0,0,0,0.8)] border border-white/10 relative bg-black shrink-0">
              {customVideoUrl ? (
                <video
                  ref={videoElemRef}
                  src={customVideoUrl}
                  loop
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full relative">
                  {renderCanvasContent}
                </div>
              )}
            </div>

            {/* Song Meta (Title & Artist) + Like Heart */}
            <div className="flex items-center justify-between pt-2 pb-1 shrink-0">
              <div className="space-y-0.5 max-w-[80%]">
                <h1 className="text-xl font-bold text-white tracking-tight leading-tight truncate">
                  {trackMeta.title || 'Judul Lagu'}
                </h1>
                <p className="text-sm font-medium text-neutral-400 truncate">
                  {trackMeta.artist || 'Nama Artis'}
                </p>
              </div>

              <button
                onClick={() => setIsLiked(!isLiked)}
                className="p-2 hover:scale-110 active:scale-95 transition-transform"
                title={isLiked ? 'Hapus dari Lagu yang Disukai' : 'Sukai Lagu'}
              >
                <Heart
                  className="w-6 h-6 transition-colors"
                  style={{
                    color: isLiked ? themeStyles.accent : '#a3a3a3',
                    fill: isLiked ? themeStyles.accent : 'transparent',
                  }}
                />
              </button>
            </div>

            {/* Playback Scrubber Bar */}
            <div className="space-y-1 pt-1 shrink-0">
              <div
                className="relative h-1 w-full bg-white/20 hover:h-2 transition-all rounded-full overflow-hidden cursor-pointer group"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pos = (e.clientX - rect.left) / rect.width;
                  onSeek(pos * duration);
                }}
              >
                <div
                  className="h-full rounded-full relative transition-all"
                  style={{ width: `${progressPercent}%`, backgroundColor: themeStyles.accent }}
                >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>

              <div className="flex justify-between text-[11px] font-mono text-neutral-400">
                <span>{formatPlayerTime(currentTime)}</span>
                <span>{formatPlayerTime(duration)}</span>
              </div>
            </div>

            {/* Spotify Player Control Buttons */}
            <div className="flex items-center justify-between px-1 pt-1 shrink-0">
              <button
                onClick={() => setIsShuffle(!isShuffle)}
                className={`p-1.5 transition-colors ${
                  isShuffle ? 'text-[#1db954]' : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Shuffle className="w-5 h-5" />
              </button>

              <button
                onClick={() => onSeek(Math.max(0, currentTime - 5))}
                className="p-1.5 text-white hover:text-neutral-300 active:scale-90 transition-transform"
              >
                <SkipBack className="w-7 h-7 fill-white" />
              </button>

              <button
                onClick={onTogglePlay}
                className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-transform"
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6 fill-black" />
                ) : (
                  <Play className="w-6 h-6 fill-black translate-x-0.5" />
                )}
              </button>

              <button
                onClick={() => onSeek(Math.min(duration, currentTime + 5))}
                className="p-1.5 text-white hover:text-neutral-300 active:scale-90 transition-transform"
              >
                <SkipForward className="w-7 h-7 fill-white" />
              </button>

              <button
                onClick={() => setIsRepeat(!isRepeat)}
                className={`p-1.5 transition-colors ${
                  isRepeat ? 'text-[#1db954]' : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Repeat className="w-5 h-5" />
              </button>
            </div>

            {/* The Iconic Spotify Lyrics Card at Bottom with Bilingual Support */}
            <div
              onClick={() => onChangeDisplayMode('expanded_lyrics')}
              className={`mt-2.5 p-3.5 rounded-2xl ${themeStyles.lyricsCardBg} border border-white/10 shadow-lg cursor-pointer hover:border-white/20 transition-all duration-200 group shrink-0`}
            >
              <div className="flex items-center justify-between pb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-white">
                    Lirik
                  </span>
                  {showTranslation && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/15 text-white/80 font-medium">
                      Bilingual
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-semibold text-white/80 group-hover:text-white flex items-center gap-1">
                  Perbesar
                  <Maximize2 className="w-3 h-3" />
                </span>
              </div>

              {/* Lyrics Lines Preview with Cross-fade & Sub-lyrics */}
              <div className="space-y-1 text-sm font-semibold min-h-[75px] max-h-[85px] overflow-hidden flex flex-col justify-center relative">
                <AnimatePresence mode="popLayout" initial={false}>
                  {lyrics[activeIndex] && (
                    <motion.div
                      key={lyrics[activeIndex].id || `card-${activeIndex}`}
                      initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                      exit={{ opacity: 0, y: -6, filter: 'blur(4px)' }}
                      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                      className="w-full"
                    >
                      <p className="text-white font-bold text-base leading-snug drop-shadow-sm truncate">
                        {lyrics[activeIndex].text}
                      </p>
                      {showTranslation && lyrics[activeIndex].translation && (
                        <p className={`text-xs truncate transition-colors duration-500 font-medium mt-0.5 ${themeStyles.activeSubtext}`}>
                          {lyrics[activeIndex].translation}
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence mode="popLayout" initial={false}>
                  {lyrics[activeIndex + 1] && (
                    <motion.p
                      key={lyrics[activeIndex + 1].id || `card-next-${activeIndex + 1}`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 0.35, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.5 }}
                      className="text-xs truncate text-white/35 font-medium pt-0.5"
                    >
                      {lyrics[activeIndex + 1].text}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Utility Row */}
            <div className="flex items-center justify-between pt-1.5 text-neutral-400 shrink-0">
              <div className="flex items-center space-x-1.5 text-xs">
                <Laptop2 className="w-4 h-4 text-[#1db954]" />
                <span className="text-[#1db954] font-medium text-[11px]">
                  Spotify Connect
                </span>
              </div>
              <div className="flex items-center space-x-3">
                <Share2 className="w-4 h-4 hover:text-white transition-colors cursor-pointer" />
                <ListMusic className="w-4 h-4 hover:text-white transition-colors cursor-pointer" />
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* LAYOUT D: EXPANDED FULLSCREEN SPOTIFY LYRICS                   */}
        {/* ============================================================== */}
        {aspectRatio === '9:16' && displayMode === 'expanded_lyrics' && (
          <div className="relative z-10 flex-1 flex flex-col justify-between px-6 pb-6 overflow-hidden">
            {/* Blurred Video in Background */}
            <div className="absolute inset-0 z-0 opacity-25 filter blur-2xl pointer-events-none scale-125">
              {customVideoUrl ? (
                <video src={customVideoUrl} loop playsInline muted autoPlay className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full">{renderCanvasContent}</div>
              )}
            </div>

            {/* Active Track Header Badge */}
            <div className="relative z-10 flex items-center justify-between pb-3 pt-1 border-b border-white/10">
              <div className="space-y-0.5 max-w-[70%]">
                <h3 className="text-sm font-bold text-white truncate">
                  {trackMeta.title}
                </h3>
                <p className="text-xs text-neutral-300 truncate">
                  {trackMeta.artist}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {onToggleTranslation && (
                  <button
                    onClick={onToggleTranslation}
                    className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors ${
                      showTranslation
                        ? 'bg-[#1db954]/20 text-[#1db954]'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                    title="Toggle Sub-lirik"
                  >
                    <Languages className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => onChangeDisplayMode('now_playing')}
                  className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white"
                  title="Tutup Tampilan Penuh Lirik"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Fluid Auto-Scrolling Synchronized Lyrics List with Bilingual Sub-lyrics */}
            <div
              ref={lyricsContainerRef}
              className="relative z-10 flex-1 overflow-y-auto py-8 space-y-6 scroll-smooth no-scrollbar"
            >
              {lyrics.map((line, index) => {
                const isActive = index === activeIndex;
                const isPast = index < activeIndex;

                return (
                  <div
                    key={line.id || index}
                    ref={isActive ? activeLyricRef : null}
                    onClick={() => onSeek(line.time)}
                    className={`cursor-pointer transition-all duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] origin-left ${
                      isActive
                        ? 'text-white font-extrabold text-2xl sm:text-3xl leading-snug drop-shadow-lg scale-[1.02] opacity-100'
                        : isPast
                        ? 'text-white/40 font-bold text-xl sm:text-2xl hover:text-white/70 scale-100 opacity-40'
                        : 'text-white/25 font-bold text-xl sm:text-2xl hover:text-white/50 scale-100 opacity-25'
                    }`}
                    style={{
                      textShadow: isActive ? '0 0 24px rgba(255, 255, 255, 0.45)' : 'none',
                      transition: 'all 0.7s cubic-bezier(0.25, 1, 0.5, 1), text-shadow 0.7s ease, opacity 0.7s ease',
                    }}
                  >
                    <div className="transition-all duration-700">{line.text}</div>
                    {showTranslation && line.translation && (
                      <div
                        className={`text-sm sm:text-base font-semibold mt-1 transition-colors duration-700 ${
                          isActive
                            ? themeStyles.activeSubtext
                            : isPast
                            ? 'text-white/30'
                            : 'text-white/20'
                        }`}
                      >
                        {line.translation}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Bottom Compact Mini-Player */}
            <div className="relative z-10 pt-3 border-t border-white/10 flex items-center justify-between">
              <div className="space-y-0.5 flex-1 pr-4">
                <div
                  className="relative h-1 w-full bg-white/20 rounded-full overflow-hidden cursor-pointer"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pos = (e.clientX - rect.left) / rect.width;
                    onSeek(pos * duration);
                  }}
                >
                  <div
                    className="h-full bg-white rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono text-neutral-400 pt-0.5">
                  <span>{formatPlayerTime(currentTime)}</span>
                  <span>{formatPlayerTime(duration)}</span>
                </div>
              </div>

              <button
                onClick={onTogglePlay}
                className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-lg active:scale-95 transition-transform shrink-0"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-black" />
                ) : (
                  <Play className="w-4 h-4 fill-black translate-x-0.5" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* LAYOUT E: FULL BLEED CANVAS 9:16 WITH SUBTITLES                */}
        {/* ============================================================== */}
        {aspectRatio === '9:16' && displayMode === 'canvas_subtitles' && (
          <div className="relative z-10 flex-1 flex flex-col justify-between overflow-hidden">
            {/* Full Bleed Background Canvas / Video */}
            <div className="absolute inset-0 z-0">
              {customVideoUrl ? (
                <video
                  ref={videoElemRef}
                  src={customVideoUrl}
                  loop
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full">{renderCanvasContent}</div>
              )}
            </div>

            <div className="absolute inset-0 z-0 bg-gradient-to-b from-black/60 via-transparent to-black/85 pointer-events-none" />

            <div className="flex-1" />

            {/* Dynamic Floating Synchronized Lyrics Subtitle Bar with Bilingual Subtext */}
            <div className="relative z-10 px-5 pb-6 space-y-4">
              <div className="bg-black/75 backdrop-blur-md border border-white/15 p-4 rounded-2xl shadow-2xl text-center min-h-[110px] flex flex-col justify-center overflow-hidden relative">
                <span
                  className="text-[10px] font-bold uppercase tracking-widest mb-1.5 block"
                  style={{ color: themeStyles.accent }}
                >
                  Lirik Sedang Diputar
                </span>

                <div className="relative min-h-[50px] flex items-center justify-center">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {lyrics[activeIndex] ? (
                      <motion.div
                        key={lyrics[activeIndex].id || `canvas-lyric-${activeIndex}`}
                        initial={{ opacity: 0, y: 7, filter: 'blur(5px)' }}
                        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                        exit={{ opacity: 0, y: -7, filter: 'blur(5px)' }}
                        transition={{ duration: 0.6, ease: [0.25, 1, 0.5, 1] }}
                        className="w-full"
                      >
                        <p className="text-xl sm:text-2xl font-extrabold text-white leading-tight drop-shadow-md">
                          {lyrics[activeIndex].text}
                        </p>
                        {showTranslation && lyrics[activeIndex].translation && (
                          <p className={`text-xs sm:text-sm font-semibold mt-1.5 transition-colors duration-500 ${themeStyles.activeSubtext}`}>
                            {lyrics[activeIndex].translation}
                          </p>
                        )}
                      </motion.div>
                    ) : (
                      <motion.p
                        key="canvas-empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.4 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5 }}
                        className="text-lg font-medium text-white/40 italic"
                      >
                        ...
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                {lyrics[activeIndex + 1] && (
                  <div className="overflow-hidden mt-1.5 pt-1.5 border-t border-white/10">
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.p
                        key={lyrics[activeIndex + 1].id || `canvas-next-${activeIndex + 1}`}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 0.4, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.5 }}
                        className="text-[11px] font-semibold text-white/40 truncate"
                      >
                        Selanjutnya: {lyrics[activeIndex + 1].text}
                      </motion.p>
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {/* Bottom Mini Player Controls */}
              <div className="flex items-center justify-between text-white bg-black/40 backdrop-blur-xs p-3 rounded-xl border border-white/10">
                <div className="space-y-0.5 max-w-[65%]">
                  <h4 className="text-sm font-bold truncate">{trackMeta.title}</h4>
                  <p className="text-xs text-neutral-300 truncate">{trackMeta.artist}</p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={onTogglePlay}
                    className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center active:scale-95 transition-transform"
                  >
                    {isPlaying ? <Pause className="w-4 h-4 fill-black" /> : <Play className="w-4 h-4 fill-black translate-x-0.5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
