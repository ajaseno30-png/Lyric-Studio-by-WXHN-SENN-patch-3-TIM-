/**
 * Nocturne: Spotify Lyric Video Studio
 * Studio Pembuat Video Lirik dengan Tampilan Pemutar Spotify yang Sedang Berputar
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PaintingCanvas, PaintingCanvasHandle } from './components/PaintingCanvas';
import { SpotifyPlayerView } from './components/SpotifyPlayerView';
import { LyricMatcherModal } from './components/LyricMatcherModal';
import { MediaUploadModal } from './components/MediaUploadModal';
import { SpotifySpecsModal } from './components/SpotifySpecsModal';
import { SPOTIFY_THEME_OPTIONS } from './components/ThemeSelectorModal';
import { ProjectManagerModal } from './components/ProjectManagerModal';
import { ExportProgressModal, ExportProgressData } from './components/ExportProgressModal';
import { LyricLine, TrackMeta, SpotifyDisplayMode, SpotifyTheme, AspectRatio } from './types/lyrics';
import { ProjectData } from './types/project';
import { DEFAULT_DEMO_LYRICS } from './utils/lrcParser';
import { AudioEngine } from './utils/audioEngine';
import { SpotifyVideoRecorder, ExportReport } from './utils/spotifyVideoRecorder';
import { getProject, saveProject } from './utils/projectStorage';
import {
  Sparkles,
  Music,
  Video,
  Clock,
  Upload,
  Download,
  Maximize2,
  Minimize2,
  Sliders,
  HelpCircle,
  Layers,
  FileText,
  Play,
  Pause,
  RotateCcw,
  Smartphone,
  Square,
  Tv,
  Languages,
  Palette,
  FolderKanban,
  Save,
  CheckCircle2,
  ChevronDown,
  Check
} from 'lucide-react';

export default function App() {
  const canvasHandleRef = useRef<PaintingCanvasHandle | null>(null);
  const audioEngineRef = useRef<AudioEngine>(new AudioEngine());
  const videoRecorderRef = useRef<SpotifyVideoRecorder>(new SpotifyVideoRecorder());

  // Project Management State
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [currentProjectName, setCurrentProjectName] = useState<string>('Proyek Spotify Lirik');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Track Metadata & Media
  const [trackMeta, setTrackMeta] = useState<TrackMeta>({
    title: 'Nocturne in Dim Light',
    artist: 'Susena & Ensemble',
    album: 'Midnight Impasto Collection',
    audioUrl: null,
    audioFileName: undefined,
    videoUrl: null,
    videoFileName: undefined,
    imageUrl: null,
    duration: 38.0,
  });

  // Synced Lyrics
  const [lyrics, setLyrics] = useState<LyricLine[]>(DEFAULT_DEMO_LYRICS);

  // Playback State
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(38.0);

  // Display Settings
  const [displayMode, setDisplayMode] = useState<SpotifyDisplayMode>('now_playing');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [showTranslation, setShowTranslation] = useState<boolean>(true);
  const [theme, setTheme] = useState<SpotifyTheme>('emerald');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Modals & Popups
  const [isMatcherOpen, setIsMatcherOpen] = useState<boolean>(false);
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
  const [isSpecsOpen, setIsSpecsOpen] = useState<boolean>(false);
  const [isThemeDropdownOpen, setIsThemeDropdownOpen] = useState<boolean>(false);
  const themeDropdownRef = useRef<HTMLDivElement | null>(null);

  // Export State & Throttling
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportCooldown, setExportCooldown] = useState<number>(0);
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [exportReport, setExportReport] = useState<ExportReport | null>(null);
  const [exportProgress, setExportProgress] = useState<ExportProgressData | null>(null);
  const [activeExportConfig, setActiveExportConfig] = useState<{ resolution: string; fps: number } | null>(null);

  const startExportCooldown = (seconds = 8) => {
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    setExportCooldown(seconds);
    cooldownTimerRef.current = setInterval(() => {
      setExportCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    };
  }, []);

  // Close theme dropdown popup when clicking outside or pressing Escape
  useEffect(() => {
    if (!isThemeDropdownOpen) return;

    const handlePointerDownOutside = (e: MouseEvent) => {
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(e.target as Node)) {
        setIsThemeDropdownOpen(false);
      }
    };

    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsThemeDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDownOutside);
    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('mousedown', handlePointerDownOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [isThemeDropdownOpen]);

  // Setup AudioEngine listeners
  useEffect(() => {
    const audio = audioEngineRef.current;
    audio.initDemoAudio();

    const unsubscribe = audio.subscribe((time, playing) => {
      setCurrentTime(time);
      setIsPlaying(playing);
      const curDur = audio.getDuration();
      if (curDur > 0) setDuration(curDur);
    });

    return () => {
      unsubscribe();
      audio.destroy();
    };
  }, []);

  const handleTogglePlay = () => {
    const audio = audioEngineRef.current;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
  };

  const handleSeek = (time: number) => {
    audioEngineRef.current.seek(time);
    setCurrentTime(time);
  };

  const handleRestart = () => {
    handleSeek(0);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  };

  const handleSaveCurrentProject = async (customName?: string) => {
    const name = (customName || currentProjectName || trackMeta.title || 'Proyek Lirik').trim();
    const id = currentProjectId || ('proj_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));

    const projectData: ProjectData = {
      id,
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      trackMeta: {
        ...trackMeta,
      },
      lyrics,
      aspectRatio,
      displayMode,
      theme,
      showTranslation,
      audioBlob: trackMeta.audioFile || null,
      videoBlob: trackMeta.videoFile || null,
    };

    await saveProject(projectData);
    setCurrentProjectId(id);
    setCurrentProjectName(name);
    localStorage.setItem('spotify_lyric_last_project_id', id);
    setHasUnsavedChanges(false);
    showToast(`Proyek "${name}" berhasil disimpan!`);
  };

  const handleLoadProject = async (project: ProjectData, notify = true) => {
    audioEngineRef.current.pause();
    setIsPlaying(false);

    let newAudioUrl: string | null = null;
    if (project.audioBlob) {
      newAudioUrl = await audioEngineRef.current.loadUserAudio(
        project.audioBlob,
        project.trackMeta.audioFileName || 'audio.mp3'
      );
    } else {
      audioEngineRef.current.initDemoAudio();
    }

    let newVideoUrl: string | null = null;
    if (project.videoBlob) {
      newVideoUrl = URL.createObjectURL(project.videoBlob);
    }

    setTrackMeta({
      title: project.trackMeta.title,
      artist: project.trackMeta.artist,
      album: project.trackMeta.album,
      duration: project.trackMeta.duration,
      audioUrl: newAudioUrl,
      audioFileName: project.trackMeta.audioFileName,
      audioFile: project.audioBlob || null,
      videoUrl: newVideoUrl,
      videoFileName: project.trackMeta.videoFileName,
      videoFile: project.videoBlob || null,
    });

    setLyrics(project.lyrics || []);
    setAspectRatio(project.aspectRatio || '9:16');
    setDisplayMode(project.displayMode || 'now_playing');
    setTheme(project.theme || 'emerald');
    setShowTranslation(project.showTranslation ?? true);
    setCurrentProjectId(project.id);
    setCurrentProjectName(project.name);
    localStorage.setItem('spotify_lyric_last_project_id', project.id);
    setHasUnsavedChanges(false);
    handleSeek(0);
    if (notify) {
      showToast(`Proyek "${project.name}" berhasil dibuka!`);
    }
  };

  // Restore project on initial mount if available
  useEffect(() => {
    const restoreLastProject = async () => {
      const lastId = localStorage.getItem('spotify_lyric_last_project_id');
      if (lastId) {
        try {
          const saved = await getProject(lastId);
          if (saved) {
            await handleLoadProject(saved, false);
            showToast(`Melanjutkan proyek: "${saved.name}"`);
          }
        } catch (e) {
          console.warn('Gagal memuat proyek tersimpan terakhir:', e);
        }
      }
    };
    restoreLastProject();
  }, []);

  // Shortcut Ctrl+S / Cmd+S to quick-save project
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveCurrentProject();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [trackMeta, lyrics, aspectRatio, displayMode, theme, showTranslation, currentProjectId, currentProjectName]);

  // Upload Handlers
  const handleUploadAudio = async (file: File) => {
    const url = await audioEngineRef.current.loadUserAudio(file);
    setTrackMeta((prev) => ({
      ...prev,
      audioUrl: url,
      audioFileName: file.name,
      audioFile: file,
      title: file.name.replace(/\.[^/.]+$/, ''), // auto-fill title from filename
    }));
    setHasUnsavedChanges(true);
  };

  const handleUploadVideo = (file: File) => {
    const url = URL.createObjectURL(file);
    setTrackMeta((prev) => ({
      ...prev,
      videoUrl: url,
      videoFileName: file.name,
      videoFile: file,
    }));
    setHasUnsavedChanges(true);
  };

  const handleResetToDefaultCanvas = () => {
    setTrackMeta((prev) => ({
      ...prev,
      videoUrl: null,
      videoFileName: undefined,
      videoFile: null,
      imageUrl: null,
    }));
    setHasUnsavedChanges(true);
  };

  // Video Export Handler with Offline Deterministic MP4 Rendering & Throttling
  const exportVideo = async (config?: {
    resolution?: string;
    width?: number;
    height?: number;
    quality?: '720p' | '1080p';
    fps?: 30 | 60;
    bitrate?: number;
    preferServerEncoder?: boolean;
    throttleMode?: 'unthrottled' | 'balanced' | 'eco';
  }) => {
    // Throttling: cegah ekspor beruntun atau bersamaan
    if (isExporting) {
      showToast('Proses ekspor video sedang berjalan. Harap tunggu hingga selesai.');
      return;
    }
    if (exportCooldown > 0) {
      showToast(`Harap tunggu ${exportCooldown} detik (cooldown throttling) untuk menstabilkan resource perangkat.`);
      return;
    }

    const quality = config?.quality || '1080p';
    const fps = config?.fps || 30;
    const width = config?.width;
    const height = config?.height;
    const bitrate = config?.bitrate;
    const preferServerEncoder = config?.preferServerEncoder;
    const throttleMode = config?.throttleMode || 'balanced';

    const chosenResolution =
      width && height ? `${width}×${height}` : quality === '1080p' ? '1080×1920' : '720×1280';
    setActiveExportConfig({
      resolution: chosenResolution,
      fps,
    });

    const canvas = canvasHandleRef.current?.getCanvas();
    const audioElement = audioEngineRef.current.getAudioElement();

    setExportReport(null);
    setIsExporting(true);
    setExportProgress({
      percent: 0,
      secondsLeft: Math.ceil(duration),
      stage: 'Menyiapkan Pipeline Web Worker...',
      engine: 'Web Worker (WebCodecs + MP4-Muxer)',
      throttleMode,
    });

    // Hentikan audio real-time: rendering frame dilakukan offline tanpa perlu memutar suara di speaker
    audioEngineRef.current.pause();

    try {
      // Ekstrak master audio buffer (PCM Float32) langsung dari AudioEngine
      const audioBuffer = await audioEngineRef.current.getAudioBuffer();

      const blob = await videoRecorderRef.current.exportVideo(
        {
          duration,
          trackMeta,
          lyrics,
          displayMode,
          aspectRatio,
          showTranslation,
          backgroundCanvas: canvas,
          onSeekCanvas: (t) => {
            canvasHandleRef.current?.seek(t);
          },
          customVideoUrl: trackMeta.videoUrl,
          width,
          height,
          quality,
          fps,
          bitrate,
          theme,
          audioBuffer,
          preferServerEncoder,
          throttleMode,
          onProgress: (percent, secondsLeft, details) => {
            setExportProgress({
              percent,
              secondsLeft,
              ...details,
            });
          },
        },
        audioElement
      );

      setExportReport(videoRecorderRef.current.lastReport);
      console.info(
        `[Export Sukses] Ukuran: ${(blob.size / 1048576).toFixed(1)} MB (${blob.type}), ` +
        `Engine: ${videoRecorderRef.current.lastReport?.encoderType || 'H.264/AAC'}`
      );
      const ratioSlug = aspectRatio.replace(':', 'x');
      const resSlug = width && height ? `${width}x${height}` : quality;
      videoRecorderRef.current.downloadBlob(
        blob,
        `spotify-lirik-${trackMeta.title.toLowerCase().replace(/\s+/g, '-')}-${ratioSlug}-${resSlug}-${fps}fps.mp4`
      );
    } catch (err: any) {
      console.error('Export error:', err);
      showToast(`Gagal mengekspor video: ${err?.message || 'Pastikan browser mendukung WebCodecs atau server aktif'}`);
    } finally {
      setIsExporting(false);
      setExportProgress(null);
      setActiveExportConfig(null);
      // Aktifkan cooldown throttling 8 detik agar perangkat menstabilkan memori & CPU
      startExportCooldown(8);
    }
  };

  const handleExportVideo = exportVideo;

  // Fullscreen Toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const activeThemeOption = SPOTIFY_THEME_OPTIONS.find((t) => t.id === theme) || SPOTIFY_THEME_OPTIONS[0];

  return (
    <div className="relative w-screen h-screen bg-[#050507] text-neutral-100 flex flex-col justify-between overflow-hidden select-none">
      {/* Top Global Navigation Bar - Responsive */}
      <header className="relative z-30 px-2.5 sm:px-4 py-2 sm:py-2.5 bg-neutral-950/95 backdrop-blur-md border-b border-neutral-800/80 flex items-center justify-between gap-2">
        {/* Brand / Title */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          <div
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl text-black flex items-center justify-center font-bold shadow-md transition-colors shrink-0"
            style={{ backgroundColor: activeThemeOption.color }}
          >
            <Music className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-black" />
          </div>
          <div>
            <h1 className="text-xs sm:text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
              <span>Spotify Studio</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-white/10 text-neutral-300 font-mono hidden md:inline">
                Now Playing UI
              </span>
            </h1>
            <div className="flex items-center gap-1.5 text-[10px] text-neutral-400">
              <span className="text-neutral-300 font-medium truncate max-w-[130px] sm:max-w-[200px]">
                {currentProjectName}
              </span>
              {hasUnsavedChanges ? (
                <span className="text-amber-400 flex items-center gap-1 text-[9px] bg-amber-400/10 px-1.5 py-0.2 rounded font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Belum Disimpan
                </span>
              ) : (
                <span className="text-[#1db954] flex items-center gap-1 text-[9px] bg-[#1db954]/10 px-1.5 py-0.2 rounded font-medium">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  Tersimpan
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Primary Action Buttons */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Projects Button */}
          <button
            onClick={() => setIsProjectModalOpen(true)}
            title="Kelola & Buka Daftar Proyek Tersimpan"
            className="px-2 sm:px-2.5 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/80 text-neutral-200 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow active:scale-95"
          >
            <FolderKanban className="w-3.5 h-3.5 text-[#1db954]" />
            <span className="hidden sm:inline">Proyek</span>
          </button>

          {/* Quick Save Project Button */}
          <button
            onClick={() => handleSaveCurrentProject()}
            title="Simpan Proyek Saat Ini (Ctrl+S)"
            className={`px-2 sm:px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors shadow active:scale-95 ${
              hasUnsavedChanges
                ? 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/50 text-amber-300'
                : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700/80 text-neutral-300'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Simpan</span>
            {hasUnsavedChanges && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>

          {/* Matching Lyrics Button */}
          <button
            onClick={() => setIsMatcherOpen(true)}
            title="Buka Editor Matching Lirik & Audio"
            className="px-2 sm:px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/80 text-neutral-200 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow active:scale-95"
          >
            <Clock className="w-3.5 h-3.5 text-[#1db954]" />
            <span className="hidden sm:inline">Matching Lirik</span>
            <span className="sm:hidden">Lirik</span>
          </button>

          {/* Upload Audio / Video Button */}
          <button
            onClick={() => setIsUploadOpen(true)}
            title="Unggah Bahan Audio & Video Canvas"
            className="px-2 sm:px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/80 text-neutral-200 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow active:scale-95"
          >
            <Upload className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Unggah Media</span>
            <span className="sm:hidden">Media</span>
          </button>

          {/* Export Video Button - Opens Configuration Modal */}
          <button
            onClick={() => setIsSpecsOpen(true)}
            disabled={isExporting}
            className="px-2.5 sm:px-3.5 py-1.5 rounded-xl bg-[#1db954] hover:bg-[#1ed760] disabled:bg-neutral-800 disabled:text-neutral-500 text-black text-xs font-bold flex items-center gap-1.5 shadow-md shadow-[#1db954]/20 transition-all active:scale-95"
            title="Buka Konfigurasi & Ekspor Video"
          >
            {isExporting ? (
              <>
                <div className="w-3.5 h-3.5 rounded-full border-2 border-black border-t-transparent animate-spin" />
                <span>{exportProgress?.percent || 0}%</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Ekspor Video</span>
                <span className="sm:hidden">Ekspor</span>
              </>
            )}
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 text-xs transition-colors hidden sm:flex items-center justify-center"
            title="Layar Penuh"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </header>

      {/* Secondary Controls Ribbon (Ratio, Mode, Bilingual, Standalone Theme Dropdown) */}
      <div className="relative z-30 px-2.5 sm:px-4 py-1.5 bg-neutral-950/90 backdrop-blur-sm border-b border-neutral-800/60 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar">
          {/* Aspect Ratio Switcher */}
          <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-xl p-0.5 text-xs shrink-0">
            <button
              onClick={() => setAspectRatio('9:16')}
              title="9:16 Vertikal (Canvas, Reels, Shorts, TikTok)"
              className={`px-2 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 whitespace-nowrap ${
                aspectRatio === '9:16'
                  ? 'bg-neutral-800 text-white font-bold shadow'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Smartphone className="w-3 h-3 text-[#1db954]" />
              <span>9:16</span>
            </button>
            <button
              onClick={() => setAspectRatio('1:1')}
              title="1:1 Kotak (Feed Persegi)"
              className={`px-2 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 whitespace-nowrap ${
                aspectRatio === '1:1'
                  ? 'bg-neutral-800 text-white font-bold shadow'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Square className="w-3 h-3 text-blue-400" />
              <span>1:1</span>
            </button>
            <button
              onClick={() => setAspectRatio('16:9')}
              title="16:9 Landscape (Desktop Web Player)"
              className={`px-2 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 whitespace-nowrap ${
                aspectRatio === '16:9'
                  ? 'bg-neutral-800 text-white font-bold shadow'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Tv className="w-3 h-3 text-amber-400" />
              <span>16:9</span>
            </button>
          </div>

          {/* Sub-Lyric Bilingual Toggle */}
          <button
            onClick={() => setShowTranslation(!showTranslation)}
            title={showTranslation ? 'Sembunyikan Sub-Lirik' : 'Tampilkan Sub-Lirik Bilingual'}
            className={`px-2.5 py-1 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
              showTranslation
                ? 'bg-[#1db954]/20 border-[#1db954]/40 text-[#1db954]'
                : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
            }`}
          >
            <Languages className="w-3 h-3" />
            <span>Bilingual</span>
          </button>

          {/* Mode Switcher for 9:16 */}
          {aspectRatio === '9:16' && (
            <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-xl p-0.5 text-xs shrink-0">
              <button
                onClick={() => setDisplayMode('now_playing')}
                className={`px-2 py-1 rounded-lg font-medium transition-colors whitespace-nowrap ${
                  displayMode === 'now_playing' ? 'bg-neutral-800 text-white shadow font-bold' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Player
              </button>
              <button
                onClick={() => setDisplayMode('expanded_lyrics')}
                className={`px-2 py-1 rounded-lg font-medium transition-colors whitespace-nowrap ${
                  displayMode === 'expanded_lyrics' ? 'bg-neutral-800 text-white shadow font-bold' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Lirik Penuh
              </button>
              <button
                onClick={() => setDisplayMode('canvas_subtitles')}
                className={`px-2 py-1 rounded-lg font-medium transition-colors whitespace-nowrap ${
                  displayMode === 'canvas_subtitles' ? 'bg-neutral-800 text-white shadow font-bold' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Canvas
              </button>
            </div>
          )}
        </div>

        {/* Standalone Theme Selector Button & Clean Dropdown Popup */}
        <div ref={themeDropdownRef} className="relative shrink-0">
          <button
            onClick={() => setIsThemeDropdownOpen((prev) => !prev)}
            title="Pilih Tema Warna Spotify"
            aria-expanded={isThemeDropdownOpen}
            aria-haspopup="listbox"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] transition-colors whitespace-nowrap ${
              isThemeDropdownOpen
                ? 'bg-neutral-800 border-neutral-600 text-white shadow-md'
                : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-neutral-200'
            }`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/20"
              style={{ backgroundColor: activeThemeOption.color }}
            />
            <span className="font-medium">{activeThemeOption.name}</span>
            <ChevronDown
              className={`w-3 h-3 text-neutral-400 transition-transform duration-200 ${
                isThemeDropdownOpen ? 'rotate-180 text-white' : ''
              }`}
            />
          </button>

          {isThemeDropdownOpen && (
            <div
              role="listbox"
              className="absolute right-0 top-full mt-2 w-64 sm:w-72 bg-neutral-900/95 backdrop-blur-xl border border-neutral-800 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150"
            >
              <div className="px-2.5 py-1.5 border-b border-neutral-800/80 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-[#1db954]" />
                  <span>Tema Warna Spotify</span>
                </span>
                <span className="text-[10px] text-neutral-500 font-mono">
                  {SPOTIFY_THEME_OPTIONS.length}
                </span>
              </div>

              <div className="mt-1.5 max-h-72 overflow-y-auto space-y-1 pr-0.5 no-scrollbar">
                {SPOTIFY_THEME_OPTIONS.map((option) => {
                  const isSelected = theme === option.id;
                  return (
                    <button
                      key={option.id}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        setTheme(option.id);
                        setHasUnsavedChanges(true);
                        setIsThemeDropdownOpen(false);
                      }}
                      className={`w-full px-2.5 py-2 rounded-xl text-left transition-colors flex items-center justify-between gap-2.5 ${
                        isSelected
                          ? 'bg-neutral-800 text-white font-semibold border border-neutral-700/80'
                          : 'text-neutral-300 hover:bg-neutral-800/60 hover:text-white border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/20 shadow-xs"
                          style={{ backgroundColor: option.color }}
                        />
                        <div className="truncate">
                          <div className="text-xs leading-tight truncate">{option.name}</div>
                          <div className="text-[10px] text-neutral-500 truncate mt-0.5">
                            {option.desc}
                          </div>
                        </div>
                      </div>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-[#1db954] shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Preview: Spotify Now Playing Screen with Multi-Ratio & Bilingual Sub-lyrics */}
      <main className="relative flex-1 w-full h-full flex items-center justify-center p-1 sm:p-4 overflow-hidden">
        {/* Background ambient lighting glow */}
        <div
          className="absolute inset-0 pointer-events-none opacity-25"
          style={{
            background: 'radial-gradient(circle at 50% 50%, rgba(29, 185, 84, 0.25) 0%, transparent 70%)',
          }}
        />

        {/* Center Phone / Device Frame with Spotify UI */}
        <SpotifyPlayerView
          trackMeta={trackMeta}
          lyrics={lyrics}
          currentTime={currentTime}
          duration={duration}
          isPlaying={isPlaying}
          onTogglePlay={handleTogglePlay}
          onSeek={handleSeek}
          displayMode={displayMode}
          onChangeDisplayMode={setDisplayMode}
          theme={theme}
          aspectRatio={aspectRatio}
          showTranslation={showTranslation}
          onToggleTranslation={() => setShowTranslation(!showTranslation)}
          customVideoUrl={trackMeta.videoUrl}
          renderCanvasContent={
            <PaintingCanvas
              ref={canvasHandleRef}
              loopDuration={8}
              trajectoryMode="gallery_sweep"
              lightIntensity={1.08}
              beamRadius={0.54}
              impastoDepth={1.12}
              breezeStrength={0.75}
              ambientLevel={0.2}
              isPlaying={isPlaying}
              currentTime={currentTime % 8}
              onTimeUpdate={() => {}}
              interactiveTorch={false}
              imageUrl={trackMeta.imageUrl ?? null}
              accentColor={activeThemeOption.color}
              audioTime={currentTime}
              getFrequencyData={(barCount, timeOverride) =>
                audioEngineRef.current.getFrequencyData(barCount, timeOverride)
              }
            />
          }
        />
      </main>

      {/* Bottom Floating Quick Ribbon */}
      <footer className="relative z-30 px-4 py-2.5 bg-neutral-950/85 backdrop-blur-md border-t border-neutral-800/80 flex items-center justify-between text-xs text-neutral-400">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#1db954] animate-pulse" />
            <span className="font-semibold text-neutral-300">
              {trackMeta.audioFileName ? 'Audio Kustom' : 'Demo Audio Lofi'}
            </span>
          </div>
          <span className="text-neutral-600">&bull;</span>
          <span>
            {lyrics.length} Baris Lirik Tersinkron
          </span>
        </div>

        {/* Export Banner Status if active */}
        {isExporting && exportProgress && (
          <div className="flex items-center gap-2 text-[#1db954] font-medium animate-pulse">
            <span>Sedang merender video tampilan Spotify ({exportProgress.percent}%)...</span>
            <span className="font-mono text-xs">{exportProgress.secondsLeft}s</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSpecsOpen(true)}
            className="hover:text-white flex items-center gap-1 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5 text-[#1db954]" />
            <span className="hidden sm:inline">Panduan Spotify Canvas</span>
          </button>
        </div>
      </footer>

      {/* Modals */}
      <ProjectManagerModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        currentProjectId={currentProjectId}
        onLoadProject={(proj) => handleLoadProject(proj, true)}
        onSaveCurrentProject={handleSaveCurrentProject}
        currentProjectName={currentProjectName}
        hasUnsavedChanges={hasUnsavedChanges}
      />

      <LyricMatcherModal
        isOpen={isMatcherOpen}
        onClose={() => setIsMatcherOpen(false)}
        lyrics={lyrics}
        onSaveLyrics={(newLyrics) => {
          setLyrics(newLyrics);
          setHasUnsavedChanges(true);
        }}
        currentTime={currentTime}
        isPlaying={isPlaying}
        onTogglePlay={handleTogglePlay}
        onSeek={handleSeek}
        duration={duration}
        getAudioBuffer={() => audioEngineRef.current.getAudioBuffer()}
        audioFileName={trackMeta.audioFileName}
      />

      <MediaUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        trackMeta={trackMeta}
        onUpdateTrackMeta={(meta) => {
          setTrackMeta(meta);
          setHasUnsavedChanges(true);
        }}
        onUploadAudioFile={handleUploadAudio}
        onUploadVideoFile={handleUploadVideo}
        onResetToDefaultCanvas={handleResetToDefaultCanvas}
      />

      <SpotifySpecsModal
        isOpen={isSpecsOpen}
        onClose={() => setIsSpecsOpen(false)}
        onTriggerExport={handleExportVideo}
        isExporting={isExporting}
        exportProgress={exportProgress}
        exportReport={exportReport}
        aspectRatio={aspectRatio}
        duration={duration}
        cooldownSeconds={exportCooldown}
      />

      {/* Prominent Real-time Background Worker Export Modal */}
      <ExportProgressModal
        isOpen={isExporting}
        progress={exportProgress}
        trackTitle={trackMeta.title}
        artistName={trackMeta.artist}
        resolution={activeExportConfig?.resolution || '1080×1920'}
        fps={activeExportConfig?.fps || 30}
        themeColor={activeThemeOption.color}
        onCancel={() => {
          videoRecorderRef.current.cancelExport();
          setIsExporting(false);
          showToast('Ekspor video dibatalkan.');
        }}
      />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-neutral-900/95 border border-[#1db954]/60 text-white rounded-full text-xs font-semibold shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 className="w-4 h-4 text-[#1db954] shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
