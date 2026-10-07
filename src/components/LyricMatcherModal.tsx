import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LyricLine } from '../types/lyrics';
import { formatTime, parseLRC, exportLRC, DEFAULT_DEMO_LYRICS } from '../utils/lrcParser';
import { BeatDetector, BeatAnalysisResult, AutoSyncOptions } from '../utils/beatDetector';
import {
  X,
  Play,
  Pause,
  Clock,
  Plus,
  Trash2,
  Download,
  Upload,
  RotateCcw,
  Check,
  Sparkles,
  FileText,
  Sliders,
  ChevronRight,
  Music,
  Zap,
  Activity,
  AudioWaveform,
  SlidersHorizontal,
  Volume2,
  Languages
} from 'lucide-react';

interface LyricMatcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  lyrics: LyricLine[];
  onSaveLyrics: (lyrics: LyricLine[]) => void;
  currentTime: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  duration: number;
  getAudioBuffer?: () => Promise<AudioBuffer | null>;
  audioFileName?: string;
}

export const LyricMatcherModal: React.FC<LyricMatcherModalProps> = ({
  isOpen,
  onClose,
  lyrics: initialLyrics,
  onSaveLyrics,
  currentTime,
  isPlaying,
  onTogglePlay,
  onSeek,
  duration,
  getAudioBuffer,
  audioFileName,
}) => {
  const [workingLyrics, setWorkingLyrics] = useState<LyricLine[]>(initialLyrics);
  const [activeTab, setActiveTab] = useState<'sync' | 'auto_sync' | 'paste'>('sync');
  const [rawText, setRawText] = useState<string>('');
  const [currentSyncIndex, setCurrentSyncIndex] = useState<number>(0);
  const listContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-Sync States
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<BeatAnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [sensitivity, setSensitivity] = useState<'low' | 'medium' | 'high'>('medium');
  const [phraseSpacing, setPhraseSpacing] = useState<'auto' | '4_beats' | '8_beats'>('auto');
  const [introOffset, setIntroOffset] = useState<number>(2.0);
  const [suggestedTimes, setSuggestedTimes] = useState<number[]>([]);
  const [syncAppliedBadge, setSyncAppliedBadge] = useState<boolean>(false);
  const [showTranslationInput, setShowTranslationInput] = useState<boolean>(true);
  const [isPeakSyncing, setIsPeakSyncing] = useState<boolean>(false);
  const [previousLyricsBackup, setPreviousLyricsBackup] = useState<LyricLine[] | null>(null);
  const [peakSyncToast, setPeakSyncToast] = useState<{ mapped: number; total: number; peaks: number } | null>(null);

  // Sync internal state when opened
  useEffect(() => {
    if (isOpen) {
      setWorkingLyrics([...initialLyrics]);
      const idx = initialLyrics.findIndex((l) => l.time > currentTime);
      setCurrentSyncIndex(idx !== -1 ? Math.max(0, idx - 1) : 0);
      setSyncAppliedBadge(false);
    }
  }, [isOpen, initialLyrics]);

  // Recalculate suggested timestamps when options or analysis changes
  useEffect(() => {
    if (analysisResult && workingLyrics.length > 0) {
      const times = BeatDetector.suggestLyricTimestamps(
        workingLyrics.length,
        analysisResult,
        { sensitivity, phraseSpacing, introOffset }
      );
      setSuggestedTimes(times);
    }
  }, [analysisResult, workingLyrics.length, sensitivity, phraseSpacing, introOffset]);

  // Execute Web Audio API Beat Analysis
  const handleRunBeatAnalysis = async () => {
    if (!getAudioBuffer) {
      setAnalysisError('Audio Buffer tidak tersedia.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const buffer = await getAudioBuffer();
      if (!buffer) {
        throw new Error('Gagal memproses data audio dengan Web Audio API.');
      }

      const result = BeatDetector.analyzeBuffer(buffer, sensitivity);
      setAnalysisResult(result);

      // Compute suggested times
      const times = BeatDetector.suggestLyricTimestamps(
        workingLyrics.length,
        result,
        { sensitivity, phraseSpacing, introOffset }
      );
      setSuggestedTimes(times);
    } catch (err) {
      console.error('Beat analysis failed:', err);
      setAnalysisError('Terjadi kesalahan saat mendeteksi detak audio.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Apply suggested timestamps to working lyrics
  const handleApplyAutoSync = () => {
    if (!suggestedTimes.length || suggestedTimes.length !== workingLyrics.length) return;

    const updated = workingLyrics.map((line, idx) => ({
      ...line,
      time: suggestedTimes[idx] ?? line.time,
    }));

    setWorkingLyrics(updated);
    setSyncAppliedBadge(true);
    setActiveTab('sync');
    setCurrentSyncIndex(0);

    setTimeout(() => {
      setSyncAppliedBadge(false);
    }, 4000);
  };

  // Run direct peak-detection algorithm on audio buffer to map existing lyric lines to nearest beats
  const handleDirectAutoSyncLyrics = async () => {
    if (!getAudioBuffer) {
      alert('Audio Buffer tidak tersedia untuk analisis.');
      return;
    }

    setIsPeakSyncing(true);
    try {
      const buffer = await getAudioBuffer();
      if (!buffer) {
        throw new Error('Gagal mendapatkan AudioBuffer.');
      }

      // Save backup for Undo
      setPreviousLyricsBackup([...workingLyrics]);

      // Execute peak-detection mapping
      const result = BeatDetector.mapLinesToNearestPeaks(workingLyrics, buffer);

      setWorkingLyrics(result.updatedLines);
      setPeakSyncToast({
        mapped: result.mappedCount,
        total: workingLyrics.length,
        peaks: result.peaksFound,
      });

      // Keep toast visible for 7 seconds
      setTimeout(() => {
        setPeakSyncToast(null);
      }, 7000);
    } catch (err) {
      console.error('Direct Auto-Sync Lyrics failed:', err);
      alert('Gagal mendeteksi ketukan audio. Pastikan file audio valid.');
    } finally {
      setIsPeakSyncing(false);
    }
  };

  const handleUndoPeakSync = () => {
    if (previousLyricsBackup) {
      setWorkingLyrics(previousLyricsBackup);
      setPreviousLyricsBackup(null);
      setPeakSyncToast(null);
    }
  };

  if (!isOpen) return null;

  // Stamp current time on active line and advance to next
  const handleStampCurrentLine = () => {
    if (workingLyrics.length === 0) return;

    const updated = [...workingLyrics];
    if (currentSyncIndex < updated.length) {
      updated[currentSyncIndex] = {
        ...updated[currentSyncIndex],
        time: parseFloat(currentTime.toFixed(2)),
      };
      setWorkingLyrics(updated);

      if (currentSyncIndex < updated.length - 1) {
        setCurrentSyncIndex(currentSyncIndex + 1);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      handleStampCurrentLine();
    }
  };

  const adjustTimestamp = (index: number, delta: number) => {
    const updated = [...workingLyrics];
    const newTime = Math.max(0, parseFloat((updated[index].time + delta).toFixed(2)));
    updated[index] = { ...updated[index], time: newTime };
    setWorkingLyrics(updated);
  };

  const updateLineText = (index: number, text: string) => {
    const updated = [...workingLyrics];
    updated[index] = { ...updated[index], text };
    setWorkingLyrics(updated);
  };

  const updateLineTranslation = (index: number, translation: string) => {
    const updated = [...workingLyrics];
    updated[index] = { ...updated[index], translation: translation || undefined };
    setWorkingLyrics(updated);
  };

  const deleteLine = (index: number) => {
    const updated = workingLyrics.filter((_, i) => i !== index);
    setWorkingLyrics(updated);
    if (currentSyncIndex >= updated.length) {
      setCurrentSyncIndex(Math.max(0, updated.length - 1));
    }
  };

  const addLine = () => {
    const newLine: LyricLine = {
      id: `line-${Date.now()}`,
      time: parseFloat(currentTime.toFixed(2)),
      text: 'Baris lirik baru...',
      translation: '',
    };
    const updated = [...workingLyrics, newLine].sort((a, b) => a.time - b.time);
    setWorkingLyrics(updated);
  };

  const handleImportRawText = () => {
    const lines = rawText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) return;

    if (lines[0].includes('[') && lines[0].includes(']')) {
      const parsed = parseLRC(rawText);
      setWorkingLyrics(parsed);
    } else {
      const step = duration > 0 ? duration / (lines.length + 1) : 3.5;
      const parsed: LyricLine[] = lines.map((text, idx) => ({
        id: `line-${Date.now()}-${idx}`,
        time: parseFloat((idx * step).toFixed(2)),
        text,
      }));
      setWorkingLyrics(parsed);
    }
    setActiveTab('sync');
    setCurrentSyncIndex(0);
  };

  const handleSave = () => {
    onSaveLyrics(workingLyrics);
    onClose();
  };

  const handleDownloadLRC = () => {
    const lrcContent = exportLRC(workingLyrics);
    const blob = new Blob([lrcContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lyrics-spotify.lrc';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="relative w-full max-w-4xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl flex flex-col max-h-[94vh] overflow-hidden text-neutral-100">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-neutral-800 bg-neutral-950/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1db954]/15 border border-[#1db954]/30 flex items-center justify-center text-[#1db954]">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                Matching Lirik & Audio
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1db954]/20 text-[#1db954] font-mono">
                  Spotify Synced
                </span>
              </h2>
              <p className="text-xs text-neutral-400">
                Cocokkan ketukan waktu lirik secara manual atau gunakan deteksi beat otomatis
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center justify-between px-3 sm:px-5 pt-2 sm:pt-3 border-b border-neutral-800/80 bg-neutral-900/80 overflow-x-auto no-scrollbar gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              onClick={() => setActiveTab('sync')}
              className={`px-3 sm:px-3.5 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'sync'
                  ? 'border-[#1db954] text-white bg-neutral-800/60'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-[#1db954]" />
              <span>Sinkronisasi ({workingLyrics.length})</span>
            </button>

            {/* Auto-Sync Tab */}
            <button
              onClick={() => {
                setActiveTab('auto_sync');
                if (!analysisResult && !isAnalyzing) {
                  handleRunBeatAnalysis();
                }
              }}
              className={`px-3 sm:px-3.5 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'auto_sync'
                  ? 'border-amber-400 text-white bg-neutral-800/60'
                  : 'border-transparent text-amber-400/90 hover:text-amber-300'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Auto-Sync Beat</span>
              <span className="text-[9px] px-1 py-0.2 rounded bg-amber-400/20 text-amber-300 font-bold hidden sm:inline">
                BARU
              </span>
            </button>

            <button
              onClick={() => setActiveTab('paste')}
              className={`px-3 sm:px-3.5 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'paste'
                  ? 'border-blue-400 text-white bg-neutral-800/60'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              <span>Tempel / Impor</span>
            </button>
          </div>

          <div className="flex items-center gap-2 pb-1 shrink-0">
            <button
              onClick={handleDownloadLRC}
              title="Download file .LRC"
              className="px-2.5 py-1 text-xs text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg border border-neutral-800 flex items-center gap-1 transition-colors whitespace-nowrap"
            >
              <Download className="w-3 h-3" />
              <span className="hidden sm:inline">Ekspor .LRC</span>
              <span className="sm:hidden">.LRC</span>
            </button>
          </div>
        </div>

        {/* Playback Mini Bar inside Modal */}
        <div className="p-3 sm:px-5 bg-neutral-950/85 border-b border-neutral-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center justify-between sm:justify-start gap-2.5">
            <div className="flex items-center gap-2">
              <button
                onClick={onTogglePlay}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white hover:bg-neutral-200 text-black flex items-center justify-center shadow transition-transform active:scale-95 shrink-0"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-black" />
                ) : (
                  <Play className="w-4 h-4 fill-black translate-x-0.5" />
                )}
              </button>

              <div className="flex flex-col">
                <span className="font-mono text-xs font-bold text-white">
                  {formatTime(currentTime)}
                </span>
                <span className="text-[10px] text-neutral-400 truncate max-w-[130px] sm:max-w-[200px]">
                  {audioFileName ? audioFileName : 'Audio Lofi Demo'}
                </span>
              </div>
            </div>

            {/* Quick seek buttons for mobile ease */}
            <div className="flex items-center gap-1 sm:hidden">
              <button
                onClick={() => onSeek(Math.max(0, currentTime - 3))}
                className="px-2 py-1 bg-neutral-900 border border-neutral-800 text-[10px] rounded-lg text-neutral-400 active:scale-95"
              >
                -3s
              </button>
              <button
                onClick={() => onSeek(Math.min(duration, currentTime + 3))}
                className="px-2 py-1 bg-neutral-900 border border-neutral-800 text-[10px] rounded-lg text-neutral-400 active:scale-95"
              >
                +3s
              </button>
            </div>
          </div>

          {/* Contextual Action in Toolbar */}
          {activeTab === 'sync' && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {/* Dedicated Auto-Sync Lyrics Button */}
              <button
                onClick={handleDirectAutoSyncLyrics}
                disabled={isPeakSyncing}
                title="Pindai detak transient audio & petakan baris lirik ke beat terdekat secara otomatis"
                className="flex-1 sm:flex-initial px-3 sm:px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 disabled:opacity-50 text-black text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 transition-all active:scale-95"
              >
                {isPeakSyncing ? (
                  <>
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-black border-t-transparent animate-spin" />
                    <span>Mendeteksi...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5 fill-black" />
                    <span>Auto-Sync Lyrics</span>
                  </>
                )}
              </button>

              <button
                onClick={handleStampCurrentLine}
                className="flex-1 sm:flex-initial px-3 sm:px-4 py-2 rounded-xl bg-[#1db954] hover:bg-[#1ed760] text-black text-xs font-bold transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5 sm:gap-2"
              >
                <Clock className="w-4 h-4" />
                <span className="truncate">Tandai #{currentSyncIndex + 1}</span>
                <span className="hidden sm:inline">(Spasi)</span>
              </button>
            </div>
          )}

          {activeTab === 'auto_sync' && analysisResult && (
            <button
              onClick={handleApplyAutoSync}
              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Terapkan Saran Waktu ({suggestedTimes.length} Baris)</span>
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5" ref={listContainerRef}>
          {/* TAB 1: SINKRONISASI BARIS (MANUAL / TAP-TO-SYNC) */}
          {activeTab === 'sync' && (
            <div className="space-y-3">
              {/* Notification Banner when direct Auto-Sync Lyrics was run */}
              {peakSyncToast && (
                <div className="p-3 rounded-xl bg-amber-400/15 border border-amber-400/40 flex items-center justify-between text-xs text-amber-300 animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 fill-amber-400 text-amber-400 shrink-0" />
                    <span>
                      <strong>Auto-Sync Lyrics Berhasil:</strong> {peakSyncToast.mapped} dari {peakSyncToast.total} baris lirik otomatis dipetakan ke detak transient audio terdekat ({peakSyncToast.peaks} peak terdeteksi)!
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {previousLyricsBackup && (
                      <button
                        onClick={handleUndoPeakSync}
                        className="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[11px] font-semibold transition-colors flex items-center gap-1 border border-neutral-700"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Urungkan (Undo)
                      </button>
                    )}
                    <button
                      onClick={() => setPeakSyncToast(null)}
                      className="text-neutral-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Notification Banner when Auto-Sync was applied */}
              {syncAppliedBadge && (
                <div className="p-3 rounded-xl bg-[#1db954]/15 border border-[#1db954]/40 flex items-center justify-between text-xs text-[#1db954] animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    <span>Waktu setiap baris lirik berhasil disinkronkan otomatis berdasarkan detak audio!</span>
                  </div>
                  <button
                    onClick={() => setSyncAppliedBadge(false)}
                    className="text-neutral-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-neutral-400 pb-1">
                <div className="flex items-center gap-3">
                  <span>Daftar Baris & Timestamp</span>
                  <button
                    onClick={() => setShowTranslationInput(!showTranslationInput)}
                    className={`text-[11px] flex items-center gap-1.5 px-2 py-0.5 rounded transition-colors ${
                      showTranslationInput
                        ? 'bg-[#1db954]/20 text-[#1db954] font-medium'
                        : 'bg-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                  >
                    <Languages className="w-3 h-3" />
                    <span>{showTranslationInput ? 'Kolom Terjemahan Aktif' : '+ Tampilkan Terjemahan'}</span>
                  </button>
                </div>
                <button
                  onClick={addLine}
                  className="text-xs text-[#1db954] hover:underline flex items-center gap-1 font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Tambah Baris
                </button>
              </div>

              {workingLyrics.length === 0 ? (
                <div className="py-12 text-center text-neutral-500 space-y-2">
                  <Music className="w-8 h-8 mx-auto text-neutral-600" />
                  <p className="text-sm">Belum ada baris lirik.</p>
                  <button
                    onClick={() => setActiveTab('paste')}
                    className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs"
                  >
                    Tempel teks lirik sekarang
                  </button>
                </div>
              ) : (
                workingLyrics.map((line, index) => {
                  const isCurrentSync = currentSyncIndex === index;
                  const isPlayingActive =
                    currentTime >= line.time &&
                    (index === workingLyrics.length - 1 || currentTime < workingLyrics[index + 1].time);

                  return (
                    <div
                      key={line.id || index}
                      className={`p-2.5 sm:p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 ${
                        isCurrentSync
                          ? 'bg-[#1db954]/15 border-[#1db954]/60 shadow-lg'
                          : isPlayingActive
                          ? 'bg-neutral-800/90 border-neutral-700'
                          : 'bg-neutral-950/60 border-neutral-800/70 hover:border-neutral-700'
                      }`}
                    >
                      {/* Top sub-row on mobile / Left group on desktop */}
                      <div className="flex items-center justify-between sm:justify-start gap-1.5 sm:gap-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setCurrentSyncIndex(index)}
                            title="Jadikan target sinkronisasi"
                            className={`w-6 h-6 rounded-lg text-[11px] font-mono font-bold flex items-center justify-center shrink-0 transition-colors ${
                              isCurrentSync
                                ? 'bg-[#1db954] text-black'
                                : 'bg-neutral-800 text-neutral-400 hover:text-white'
                            }`}
                          >
                            {index + 1}
                          </button>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => adjustTimestamp(index, -0.2)}
                              title="-0.2 detik"
                              className="px-1.5 py-1 text-[10px] rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-mono active:scale-95"
                            >
                              -0.2
                            </button>
                            <span className="font-mono text-xs font-semibold px-1 text-white min-w-[54px] text-center">
                              {formatTime(line.time)}
                            </span>
                            <button
                              onClick={() => adjustTimestamp(index, 0.2)}
                              title="+0.2 detik"
                              className="px-1.5 py-1 text-[10px] rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-mono active:scale-95"
                            >
                              +0.2
                            </button>
                          </div>

                          <button
                            onClick={() => {
                              onSeek(line.time);
                              if (!isPlaying) onTogglePlay();
                            }}
                            title="Dengarkan mulai baris ini"
                            className="p-1.5 rounded-lg bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 hover:text-white shrink-0 transition-colors"
                          >
                            <Play className="w-3 h-3 fill-current" />
                          </button>
                        </div>

                        {/* Mobile quick actions: Stamp & Delete */}
                        <div className="flex items-center gap-1 sm:hidden">
                          <button
                            onClick={() => {
                              const updated = [...workingLyrics];
                              updated[index] = { ...updated[index], time: parseFloat(currentTime.toFixed(2)) };
                              setWorkingLyrics(updated);
                            }}
                            title="Set ke detik saat ini"
                            className="p-1.5 text-neutral-400 hover:text-[#1db954] rounded bg-neutral-900 border border-neutral-800"
                          >
                            <Clock className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteLine(index)}
                            title="Hapus baris"
                            className="p-1.5 text-neutral-500 hover:text-red-400 rounded bg-neutral-900 border border-neutral-800"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Main Lyric text input & sub-lyric input */}
                      <div className="flex-1 flex flex-col gap-1 min-w-0 w-full">
                        <input
                          type="text"
                          value={line.text}
                          onChange={(e) => updateLineText(index, e.target.value)}
                          placeholder="Lirik utama..."
                          className={`w-full bg-neutral-900/50 sm:bg-transparent px-2.5 py-1 text-xs rounded-lg border border-neutral-800/60 sm:border-transparent hover:border-neutral-700 focus:border-[#1db954] focus:outline-none transition-colors ${
                            isPlayingActive ? 'text-white font-bold' : 'text-neutral-200'
                          }`}
                        />
                        {showTranslationInput && (
                          <input
                            type="text"
                            value={line.translation || ''}
                            onChange={(e) => updateLineTranslation(index, e.target.value)}
                            placeholder="Terjemahan / Sub-lirik (opsional)..."
                            className="w-full bg-neutral-900/40 sm:bg-transparent px-2.5 py-1 text-[11px] rounded-lg border border-neutral-800/40 sm:border-transparent hover:border-neutral-800 focus:border-amber-400 focus:outline-none text-neutral-400 italic placeholder:text-neutral-600"
                          />
                        )}
                      </div>

                      {/* Desktop only Stamp & Delete */}
                      <div className="hidden sm:flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => {
                            const updated = [...workingLyrics];
                            updated[index] = { ...updated[index], time: parseFloat(currentTime.toFixed(2)) };
                            setWorkingLyrics(updated);
                          }}
                          title="Set ke detik saat ini"
                          className="p-1.5 text-neutral-400 hover:text-[#1db954] rounded hover:bg-neutral-800"
                        >
                          <Clock className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteLine(index)}
                          title="Hapus baris"
                          className="p-1.5 text-neutral-500 hover:text-red-400 rounded hover:bg-neutral-800"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: AUTO-SYNC BEAT (WEB AUDIO API ENGINE) */}
          {activeTab === 'auto_sync' && (
            <div className="space-y-5">
              {/* Feature Introduction Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                    <Zap className="w-4 h-4" />
                    <span>Deteksi Ketukan Musik (Web Audio API Beat Detection)</span>
                  </div>
                  <p className="text-xs text-neutral-300 max-w-xl">
                    Menganalisis fluks energi gelombang suara audio, mendeteksi tempo (BPM), dan memetakan titik awal setiap baris lirik agar sinkron dengan ritme musik secara otomatis.
                  </p>
                </div>

                <button
                  onClick={handleRunBeatAnalysis}
                  disabled={isAnalyzing}
                  className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:bg-neutral-800 text-black font-bold text-xs flex items-center gap-2 shadow-lg transition-transform active:scale-95 shrink-0"
                >
                  {isAnalyzing ? (
                    <>
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-black border-t-transparent animate-spin" />
                      <span>Menganalisis Audio...</span>
                    </>
                  ) : (
                    <>
                      <Activity className="w-4 h-4" />
                      <span>{analysisResult ? 'Pindai Ulang Detak' : 'Mulai Analisis Detak'}</span>
                    </>
                  )}
                </button>
              </div>

              {analysisError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                  {analysisError}
                </div>
              )}

              {/* Analysis Dashboard (BPM, Beats count, Waveform) */}
              {analysisResult && (
                <div className="space-y-4">
                  {/* Stats Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 space-y-1">
                      <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">
                        Perkiraan BPM
                      </span>
                      <div className="text-xl font-mono font-bold text-amber-300 flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-amber-400" />
                        <span>{analysisResult.estimatedBpm}</span>
                        <span className="text-xs font-normal text-neutral-400">BPM</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 space-y-1">
                      <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">
                        Detak Terdeteksi
                      </span>
                      <div className="text-xl font-mono font-bold text-white">
                        {analysisResult.beats.length}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 space-y-1">
                      <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">
                        Frasa Musik Kuat
                      </span>
                      <div className="text-xl font-mono font-bold text-[#1db954]">
                        {analysisResult.majorOnsets.length}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 space-y-1">
                      <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">
                        Jumlah Baris Lirik
                      </span>
                      <div className="text-xl font-mono font-bold text-blue-400">
                        {workingLyrics.length}
                      </div>
                    </div>
                  </div>

                  {/* Visual Waveform Energy Profile */}
                  <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-neutral-400">
                      <span className="flex items-center gap-1.5">
                        <AudioWaveform className="w-3.5 h-3.5 text-amber-400" />
                        Profil Energi Audio & Titik Detak Terdeteksi
                      </span>
                      <span className="font-mono text-neutral-500">{formatTime(duration)}</span>
                    </div>

                    <div className="relative h-16 w-full bg-neutral-950/95 rounded-xl overflow-hidden flex items-end px-2 py-1.5 gap-[3px] border border-neutral-800/70">
                      {/* Gentle blur glow behind the frequency bars */}
                      <div
                        className="absolute inset-x-2 bottom-1.5 top-1.5 flex items-end gap-[3px] pointer-events-none opacity-40 blur-md"
                        aria-hidden="true"
                      >
                        {analysisResult.waveformData.map((val, idx) => (
                          <div
                            key={`glow-${idx}`}
                            className="flex-1 rounded-full bg-gradient-to-b from-amber-400 via-amber-400/50 to-transparent transition-all duration-150 ease-out"
                            style={{ height: `${Math.max(10, val * 100)}%` }}
                          />
                        ))}
                      </div>

                      {/* Smooth frequency bars with rounded caps & vertical gradient */}
                      {analysisResult.waveformData.map((val, idx) => (
                        <div
                          key={idx}
                          className="relative z-10 flex-1 rounded-full bg-gradient-to-b from-amber-400 via-amber-400/45 to-neutral-950/20 transition-all duration-150 ease-out"
                          style={{ height: `${Math.max(10, val * 100)}%` }}
                        />
                      ))}

                      {/* Visual Playhead */}
                      <div
                        className="absolute inset-y-0 z-20 w-0.5 bg-white/90 shadow-[0_0_8px_rgba(255,255,255,0.8)] pointer-events-none transition-all duration-75"
                        style={{ left: `${(currentTime / (duration || 1)) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Tuning Parameter Controls */}
                  <div className="p-4 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                      Pengaturan Algoritma Auto-Sync
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                      {/* Sensitivity */}
                      <div className="space-y-1.5">
                        <label className="text-neutral-400 font-medium">Kepekaan Deteksi Beat:</label>
                        <div className="flex rounded-lg bg-neutral-900 p-0.5 border border-neutral-800">
                          {(['low', 'medium', 'high'] as const).map((lvl) => (
                            <button
                              key={lvl}
                              onClick={() => setSensitivity(lvl)}
                              className={`flex-1 py-1 text-[11px] font-medium rounded-md capitalize transition-colors ${
                                sensitivity === lvl
                                  ? 'bg-amber-400 text-black font-bold'
                                  : 'text-neutral-400 hover:text-white'
                              }`}
                            >
                              {lvl === 'low' ? 'Rendah' : lvl === 'medium' ? 'Sedang' : 'Tinggi'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Phrase Spacing */}
                      <div className="space-y-1.5">
                        <label className="text-neutral-400 font-medium">Jarak Baris / Frasa:</label>
                        <div className="flex rounded-lg bg-neutral-900 p-0.5 border border-neutral-800">
                          <button
                            onClick={() => setPhraseSpacing('auto')}
                            className={`flex-1 py-1 text-[11px] font-medium rounded-md transition-colors ${
                              phraseSpacing === 'auto'
                                ? 'bg-amber-400 text-black font-bold'
                                : 'text-neutral-400 hover:text-white'
                            }`}
                          >
                            Otomatis
                          </button>
                          <button
                            onClick={() => setPhraseSpacing('4_beats')}
                            className={`flex-1 py-1 text-[11px] font-medium rounded-md transition-colors ${
                              phraseSpacing === '4_beats'
                                ? 'bg-amber-400 text-black font-bold'
                                : 'text-neutral-400 hover:text-white'
                            }`}
                          >
                            4 Ketukan
                          </button>
                          <button
                            onClick={() => setPhraseSpacing('8_beats')}
                            className={`flex-1 py-1 text-[11px] font-medium rounded-md transition-colors ${
                              phraseSpacing === '8_beats'
                                ? 'bg-amber-400 text-black font-bold'
                                : 'text-neutral-400 hover:text-white'
                            }`}
                          >
                            8 Ketukan
                          </button>
                        </div>
                      </div>

                      {/* Intro Offset */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-neutral-400">
                          <span>Lewati Intro Musik:</span>
                          <span className="font-mono text-amber-300">{introOffset.toFixed(1)}s</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="15"
                          step="0.5"
                          value={introOffset}
                          onChange={(e) => setIntroOffset(parseFloat(e.target.value))}
                          className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Suggested Timestamps Table Preview */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-neutral-400">
                      <span>Pratinjau Saran Waktu untuk Tiap Baris Lirik</span>
                      <span className="text-[11px] text-amber-300">
                        Klik tombol Play untuk menguji titik waktu tiap baris
                      </span>
                    </div>

                    <div className="rounded-xl border border-neutral-800 overflow-hidden divide-y divide-neutral-800/80 bg-neutral-950/70">
                      {workingLyrics.map((line, idx) => {
                        const sugTime = suggestedTimes[idx] ?? line.time;
                        const diff = sugTime - line.time;

                        return (
                          <div
                            key={line.id || idx}
                            className="p-2.5 flex items-center justify-between gap-3 text-xs hover:bg-neutral-900/60 transition-colors"
                          >
                            <span className="w-5 text-neutral-500 font-mono text-center">
                              {idx + 1}
                            </span>

                            <div className="flex-1 truncate font-medium text-neutral-200">
                              {line.text}
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-neutral-500 text-[11px] font-mono line-through">
                                {formatTime(line.time)}
                              </span>

                              <ChevronRight className="w-3.5 h-3.5 text-neutral-600" />

                              <span className="font-mono font-bold text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20 min-w-[62px] text-center">
                                {formatTime(sugTime)}
                              </span>

                              <button
                                onClick={() => {
                                  onSeek(sugTime);
                                  if (!isPlaying) onTogglePlay();
                                }}
                                title="Dengarkan di titik waktu yang disarankan"
                                className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white"
                              >
                                <Play className="w-3 h-3 fill-current" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Big Apply Button */}
                  <div className="pt-2 flex justify-end">
                    <button
                      onClick={handleApplyAutoSync}
                      className="w-full sm:w-auto px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold text-xs flex items-center justify-center gap-2 shadow-xl shadow-amber-400/20 transition-transform active:scale-95"
                    >
                      <Check className="w-4 h-4" />
                      <span>Terapkan Saran Waktu Auto-Sync ke Semua Baris</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TEMPEL / IMPOR LIRIK (RAW TEXT & .LRC) */}
          {activeTab === 'paste' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-neutral-300">
                  Tempel Lirik Lagu (Satu Baris Per Kalimat atau Format .LRC)
                </label>
                <p className="text-[11px] text-neutral-400">
                  Teks lirik akan otomatis dipecah menjadi baris-baris berurutan untuk dicocokkan dengan audio.
                </p>
              </div>

              <textarea
                rows={11}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={`Contoh:\nDi dalam temaram malam yang sunyi\nKelopak bunga perlahan bernapas\nCahaya lembut merayap di atas kanvas\nMenyingkap rahasia bayangan yang terlelap...`}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-xs text-neutral-200 font-mono focus:border-[#1db954] focus:outline-none resize-none"
              />

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setRawText(DEFAULT_DEMO_LYRICS.map((l) => l.text).join('\n'))}
                  className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white bg-neutral-800 rounded-lg"
                >
                  Muat Contoh Lirik Demo
                </button>
                <button
                  onClick={handleImportRawText}
                  className="px-4 py-2 bg-[#1db954] hover:bg-[#1ed760] text-black text-xs font-bold rounded-xl transition-transform active:scale-95"
                >
                  Proses & Cocokkan Lirik
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950/80 flex items-center justify-between gap-3">
          <div className="text-xs text-neutral-400 hidden sm:block">
            Tip: Gunakan tab <span className="text-amber-300 font-semibold">Auto-Sync Beat</span> untuk mencocokkan tempo lagu secara otomatis menggunakan Web Audio API.
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-neutral-700 hover:bg-neutral-800 text-neutral-300 text-xs font-medium"
            >
              Batal
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-[#1db954] hover:bg-[#1ed760] text-black text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-[#1db954]/20 transition-transform active:scale-95"
            >
              <Check className="w-4 h-4" />
              Terapkan Lirik Tersinkronisasi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
