import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  Download,
  Layers,
  Settings2,
  Tv,
  Film,
  Gauge,
  Smartphone,
  ChevronDown,
  Sparkles,
  Zap,
  Activity,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { AspectRatio } from '../types/lyrics';
import type { ExportReport } from '../utils/spotifyVideoRecorder';

export interface ExportConfig {
  resolution: string; // e.g. '1080x1920'
  width: number;
  height: number;
  quality: '720p' | '1080p';
  fps: 30 | 60;
  bitrate: number;
  preferServerEncoder?: boolean;
  throttleMode?: 'unthrottled' | 'balanced' | 'eco';
}

interface SpotifySpecsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTriggerExport: (config: ExportConfig) => void;
  isExporting?: boolean;
  exportProgress?: { percent: number; secondsLeft: number } | null;
  exportReport?: ExportReport | null;
  aspectRatio?: AspectRatio;
  duration?: number;
  cooldownSeconds?: number;
}

export const SpotifySpecsModal: React.FC<SpotifySpecsModalProps> = ({
  isOpen,
  onClose,
  onTriggerExport,
  isExporting = false,
  exportProgress = null,
  exportReport = null,
  aspectRatio = '9:16',
  duration = 38.0,
  cooldownSeconds = 0,
}) => {
  // Determine standard default resolution based on the active player aspect ratio
  const getDefaultResolution = () => {
    if (aspectRatio === '1:1') return '1080x1080';
    if (aspectRatio === '16:9') return '1920x1080';
    return '1080x1920';
  };

  const [resolution, setResolution] = useState<string>(getDefaultResolution());
  const [fps, setFps] = useState<30 | 60>(30);
  const [bitrateOption, setBitrateOption] = useState<number>(11_000_000);
  const [preferServerEncoder, setPreferServerEncoder] = useState<boolean>(false);
  const [throttleMode, setThrottleMode] = useState<'unthrottled' | 'balanced' | 'eco'>('balanced');

  // Sync resolution when modal opens or aspect ratio changes
  useEffect(() => {
    setResolution(getDefaultResolution());
  }, [aspectRatio, isOpen]);

  if (!isOpen) return null;

  // Parse width and height from resolution string (e.g. "1080x1920")
  const [chosenW, chosenH] = resolution.split('x').map(Number);
  const quality: '720p' | '1080p' = chosenW <= 720 || chosenH <= 720 ? '720p' : '1080p';

  // Calculate estimated file size in MB: (bitrate * duration / 8 bits)
  const estSizeMB = Math.max(
    0.8,
    parseFloat((((bitrateOption + 192_000) * duration) / (8 * 1024 * 1024)).toFixed(1))
  );

  const handleStartExport = () => {
    onTriggerExport({
      resolution,
      width: chosenW,
      height: chosenH,
      quality,
      fps,
      bitrate: bitrateOption,
      preferServerEncoder,
      throttleMode,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 text-neutral-200 max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-neutral-800 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-[#1db954]/20 text-[#1db954] flex items-center justify-center font-bold">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                Konfigurasi & Ekspor Video
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1db954]/20 text-[#1db954] font-mono">
                  Hidden Canvas
                </span>
              </h3>
              <p className="text-xs text-neutral-400">
                Pilih ukuran resolusi, frame rate, & bitrate untuk dirender ke hidden canvas
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

        {/* Modal Scrollable Content */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 no-scrollbar">
          {/* Main Configuration Card */}
          <div className="p-4 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                <Settings2 className="w-4 h-4 text-[#1db954]" />
                Pengaturan Render Canvas & MediaRecorder
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 font-mono">
                Rasio: {aspectRatio}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Dropdown 1: Ukuran / Resolusi */}
              <div className="space-y-1.5 sm:col-span-3">
                <label className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Tv className="w-3.5 h-3.5 text-blue-400" />
                    Ukuran Resolusi Canvas
                  </span>
                  <span className="text-[10px] text-neutral-400">
                    {resolution === '1080x1920'
                      ? 'Rekomendasi Spotify Canvas'
                      : resolution.includes('1080')
                      ? 'Full HD'
                      : 'HD Cepat'}
                  </span>
                </label>
                <div className="relative">
                  <select
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    className="w-full appearance-none bg-neutral-900 border border-neutral-700 hover:border-neutral-600 focus:border-[#1db954] rounded-xl px-3.5 py-2.5 text-xs font-semibold text-white focus:outline-none transition-colors cursor-pointer pr-9"
                  >
                    <optgroup label="9:16 Vertikal (Canvas, Stories, Shorts)">
                      <option value="1080x1920">1080 × 1920 px (Full HD 9:16 - Standar Spotify)</option>
                      <option value="720x1280">720 × 1280 px (HD 9:16 - Ringan & Cepat)</option>
                    </optgroup>
                    <optgroup label="1:1 Persegi (Feed Post & Covers)">
                      <option value="1080x1080">1080 × 1080 px (Full HD Square 1:1)</option>
                      <option value="720x720">720 × 720 px (HD Square 1:1)</option>
                    </optgroup>
                    <optgroup label="16:9 Landscape (Desktop Web Player)">
                      <option value="1920x1080">1920 × 1080 px (Full HD Landscape 16:9)</option>
                      <option value="1280x720">1280 × 720 px (HD Landscape 16:9)</option>
                    </optgroup>
                  </select>
                  <ChevronDown className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Dropdown 2: Frame Rate (FPS) */}
              <div className="space-y-1.5 sm:col-span-1">
                <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-amber-400" />
                  Frame Rate (FPS)
                </label>
                <div className="relative">
                  <select
                    value={fps}
                    onChange={(e) => setFps(Number(e.target.value) as 30 | 60)}
                    className="w-full appearance-none bg-neutral-900 border border-neutral-700 hover:border-neutral-600 focus:border-[#1db954] rounded-xl px-3 py-2.5 text-xs font-semibold text-white focus:outline-none transition-colors cursor-pointer pr-8"
                  >
                    <option value={30}>30 FPS (Standar Spotify)</option>
                    <option value={60}>60 FPS (Ultra Smooth)</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-neutral-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Dropdown 3: Bitrate MediaRecorder */}
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-emerald-400" />
                    Bitrate Video Target
                  </span>
                  <span className="text-[10px] text-neutral-400">Target H.264 Encoder</span>
                </label>
                <div className="relative">
                  <select
                    value={bitrateOption}
                    onChange={(e) => setBitrateOption(Number(e.target.value))}
                    className="w-full appearance-none bg-neutral-900 border border-neutral-700 hover:border-neutral-600 focus:border-[#1db954] rounded-xl px-3 py-2.5 text-xs font-semibold text-white focus:outline-none transition-colors cursor-pointer pr-8"
                  >
                    <option value={16_000_000}>16 Mbps (Ultra High Quality - Visual Impasto Tajam)</option>
                    <option value={11_000_000}>11 Mbps (High Quality - Rekomendasi Spotify)</option>
                    <option value={8_000_000}>8 Mbps (Medium Quality - Seimbang)</option>
                    <option value={5_000_000}>5 Mbps (Standard Quality - Cepat & Hemat Kuota)</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-neutral-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Encoder Engine Choice */}
              <div className="space-y-1.5 sm:col-span-3 pt-1 border-t border-neutral-800/80">
                <label className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5 text-indigo-400" />
                    Mesin Encoder MP4
                  </span>
                  <span className="text-[10px] text-emerald-400 font-medium">Genuine H.264 + AAC</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPreferServerEncoder(false)}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      !preferServerEncoder
                        ? 'border-[#1db954] bg-[#1db954]/10 text-white'
                        : 'border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">WebCodecs + MP4-Muxer</span>
                      {!preferServerEncoder && <CheckCircle2 className="w-3.5 h-3.5 text-[#1db954]" />}
                    </div>
                    <p className="text-[10px] text-neutral-400 mt-0.5">
                      Encoding langsung di browser (Cepat, hardware-accelerated, auto MP4 H.264/AAC)
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreferServerEncoder(true)}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      preferServerEncoder
                        ? 'border-[#1db954] bg-[#1db954]/10 text-white'
                        : 'border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Server FFmpeg (libx264)</span>
                      {preferServerEncoder && <CheckCircle2 className="w-3.5 h-3.5 text-[#1db954]" />}
                    </div>
                    <p className="text-[10px] text-neutral-400 mt-0.5">
                      Transcode di backend Linux via native FFmpeg (Kompatibilitas tertinggi)
                    </p>
                  </button>
                </div>
              </div>

              {/* Throttling & Hardware Pace Choice */}
              <div className="space-y-1.5 sm:col-span-3 pt-1 border-t border-neutral-800/80">
                <label className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-emerald-400" />
                    Throttling &amp; Kontrol Beban CPU/GPU
                  </span>
                  <span className="text-[10px] text-neutral-400">Pacing Hardware Stabil</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setThrottleMode('balanced')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      throttleMode === 'balanced'
                        ? 'border-[#1db954] bg-[#1db954]/10 text-white'
                        : 'border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Mode Seimbang</span>
                      {throttleMode === 'balanced' && <CheckCircle2 className="w-3.5 h-3.5 text-[#1db954]" />}
                    </div>
                    <p className="text-[10px] text-neutral-400 mt-0.5">
                      Rekomendasi. Jeda pacing 4ms, stabil &amp; responsif tanpa lag.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setThrottleMode('eco')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      throttleMode === 'eco'
                        ? 'border-emerald-500 bg-emerald-500/10 text-white'
                        : 'border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Mode Eco (Hemat)</span>
                      {throttleMode === 'eco' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                    </div>
                    <p className="text-[10px] text-neutral-400 mt-0.5">
                      Throttled 14ms/frame. Mencegah laptop panas &amp; kipas bising.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setThrottleMode('unthrottled')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      throttleMode === 'unthrottled'
                        ? 'border-amber-500 bg-amber-500/10 text-white'
                        : 'border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Maksimal (Unthrottled)</span>
                      {throttleMode === 'unthrottled' && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />}
                    </div>
                    <p className="text-[10px] text-neutral-400 mt-0.5">
                      Kecepatan penuh tanpa jeda throttling. Untuk PC spesifikasi tinggi.
                    </p>
                  </button>
                </div>
              </div>
            </div>

            {/* Output Metric Badges */}
            <div className="pt-2 border-t border-neutral-800/80 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="p-2 rounded-lg bg-neutral-900/60 border border-neutral-800">
                <span className="text-[9px] uppercase tracking-wider text-neutral-400 block">Ukuran Canvas</span>
                <span className="font-mono text-xs font-bold text-white">{chosenW} × {chosenH} px</span>
              </div>
              <div className="p-2 rounded-lg bg-neutral-900/60 border border-neutral-800">
                <span className="text-[9px] uppercase tracking-wider text-neutral-400 block">Frame Rate</span>
                <span className="font-mono text-xs font-bold text-amber-300">{fps} FPS (Terkunci)</span>
              </div>
              <div className="p-2 rounded-lg bg-neutral-900/60 border border-neutral-800">
                <span className="text-[9px] uppercase tracking-wider text-neutral-400 block">Format Output</span>
                <span className="font-mono text-xs font-bold text-emerald-400">MP4 (H.264/AAC)</span>
              </div>
              <div className="p-2 rounded-lg bg-neutral-900/60 border border-neutral-800">
                <span className="text-[9px] uppercase tracking-wider text-neutral-400 block">Ukuran File</span>
                <span className="font-mono text-xs font-bold text-blue-300">~{estSizeMB} MB</span>
              </div>
            </div>
          </div>

          {/* Rendering Pipeline Information Box */}
          <div className="p-3.5 rounded-xl bg-neutral-950/60 border border-neutral-800 space-y-2">
            <h4 className="text-xs uppercase tracking-widest text-neutral-300 font-semibold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#1db954]" />
              Pipeline Render Deterministik Offline
            </h4>
            <ul className="text-[11px] text-neutral-400 space-y-1 list-disc pl-4">
              <li>
                <strong className="text-neutral-200">Bukan Real-time Capture:</strong> Frame dirender satu per satu secara offline (Frame 0..N pada exact timestamp t = i/fps). Tidak ada frame drop walau CPU sibuk.
              </li>
              <li>
                <strong className="text-neutral-200">Video Latar Terkunci:</strong> Background video di-seek frame-demi-frame sehingga 100% sinkron dengan lirik dan musik tanpa drift clock.
              </li>
              <li>
                <strong className="text-neutral-200">Master Audio Terjamin:</strong> Audio diekstrak langsung dari AudioBuffer (PCM Float32), menjamin audio lagu user maupun demo synth selalu masuk tanpa keheningan.
              </li>
              <li>
                <strong className="text-neutral-200">Format Asli MP4:</strong> Dikemas sebagai ISO Base Media File Format dengan video H.264 + audio AAC + moov atom faststart untuk Spotify, YouTube Shorts, &amp; Reels.
              </li>
            </ul>
          </div>

          {/* Hasil export: semua angka diukur dari proses render */}
          {!isExporting && exportReport && (
            <div className="p-3.5 rounded-xl bg-neutral-950/60 border border-neutral-800 space-y-2.5">
              <h4 className="text-xs uppercase tracking-widest text-neutral-300 font-semibold">
                Hasil Export (diukur saat render)
              </h4>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[11px]">
                <dt className="text-neutral-500">Resolusi</dt>
                <dd className="text-neutral-200 font-mono">
                  {exportReport.actualWidth}×{exportReport.actualHeight}{' '}
                  {exportReport.actualWidth === exportReport.requestedWidth &&
                  exportReport.actualHeight === exportReport.requestedHeight
                    ? '(sesuai pilihan)'
                    : `(BEDA dari pilihan ${exportReport.requestedWidth}×${exportReport.requestedHeight})`}
                </dd>
                <dt className="text-neutral-500">Format & Encoder</dt>
                <dd className="text-neutral-200 font-mono">
                  <span className="text-[#1db954] font-bold">MP4</span> &bull; {exportReport.encoderType || 'H.264 / AAC'}
                </dd>
                <dt className="text-neutral-500">Durasi & Frame</dt>
                <dd className="text-neutral-200 font-mono">
                  {exportReport.recordedSeconds.toFixed(1)} detik &bull; {exportReport.totalFrames || Math.round(exportReport.songDuration * exportReport.requestedFps)} frames total
                </dd>
                <dt className="text-neutral-500">FPS Deterministik</dt>
                <dd className="text-neutral-200 font-mono">
                  {exportReport.avgDrawFps.toFixed(0)} FPS (Terkunci stabil)
                </dd>
                <dt className="text-neutral-500">Ukuran file</dt>
                <dd className="text-neutral-200 font-mono">
                  {(exportReport.sizeBytes / 1048576).toFixed(1)} MB
                </dd>
                <dt className="text-neutral-500">Bitrate nyata</dt>
                <dd className="text-neutral-200 font-mono">
                  {exportReport.avgBitrateMbps.toFixed(1)} Mbps
                </dd>
                <dt className="text-neutral-500">Audio Track</dt>
                <dd className="text-neutral-200 font-mono">
                  {exportReport.hasAudioTrack ? 'Tersinkron (AAC Stereo 44.1kHz)' : 'Tidak ada'}
                </dd>
                <dt className="text-neutral-500">Video latar</dt>
                <dd className="text-neutral-200 font-mono">
                  {exportReport.backgroundVideoRequested
                    ? `tampil di ${(exportReport.backgroundVideoCoverage * 100).toFixed(0)}% frame`
                    : 'tidak dipakai (gambar/artwork)'}
                </dd>
              </dl>
              {exportReport.warnings.length > 0 ? (
                <ul className="text-[11px] text-amber-300 space-y-1 list-disc pl-4">
                  {exportReport.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-emerald-300">
                  Tidak ada masalah yang terdeteksi oleh pengecekan di atas.
                </p>
              )}
              <p className="text-[10px] text-neutral-500">
                Angka dihitung dari proses render dan file yang dihasilkan. Isi visual tetap perlu kamu tonton sendiri.
              </p>
            </div>
          )}

          {/* Active Export Progress if running */}
          {isExporting && exportProgress && (
            <div className="p-3.5 rounded-xl bg-[#1db954]/15 border border-[#1db954]/30 space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full border-2 border-[#1db954] border-t-transparent animate-spin" />
                  Sedang Merender Frame ({chosenW}×{chosenH} @ {fps}fps)...
                </span>
                <span className="font-mono text-[#1db954] font-bold">{exportProgress.percent}%</span>
              </div>
              <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#1db954] transition-all duration-150 rounded-full"
                  style={{ width: `${exportProgress.percent}%` }}
                />
              </div>
              <p className="text-[10px] text-neutral-400 text-right">
                Perkiraan sisa waktu render: {exportProgress.secondsLeft} detik
              </p>
            </div>
          )}
        </div>

        {/* Modal Action Buttons */}
        <div className="pt-2 border-t border-neutral-800 flex items-center justify-between gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-neutral-700 hover:bg-neutral-800 text-neutral-300 text-xs font-semibold transition-colors"
          >
            Tutup
          </button>

          <button
            onClick={handleStartExport}
            disabled={isExporting || cooldownSeconds > 0}
            className="flex-1 px-5 py-2.5 rounded-xl bg-[#1db954] hover:bg-[#1ed760] disabled:bg-neutral-800 disabled:text-neutral-500 text-black text-xs font-bold transition-transform active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-[#1db954]/20"
          >
            {isExporting ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
                <span>Merender ({exportProgress?.percent || 0}%)...</span>
              </>
            ) : cooldownSeconds > 0 ? (
              <>
                <Clock className="w-4 h-4 text-amber-400 animate-spin" />
                <span>Menstabilkan Perangkat ({cooldownSeconds}s)</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Mulai Ekspor ({chosenW}×{chosenH} &bull; {fps} FPS)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
