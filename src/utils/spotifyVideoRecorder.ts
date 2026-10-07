/**
 * Deterministic Spotify Canvas Video Exporter
 *
 * Menggantikan pipeline MediaRecorder real-time yang tidak stabil dengan:
 * 1. Master Clock Deterministic (frame 0 .. frame N-1 pada t = i/fps tanpa frame drop)
 * 2. Background Video Clock Lock (seeked frame-by-frame, bebas race condition)
 * 3. Master Audio PCM Extraction (AudioBuffer dari AudioEngine terjamin 100% ada untuk musik & synth)
 * 4. Genuine MP4 Packaging: H.264 (AVC) + AAC menggunakan WebCodecs + mp4-muxer
 *    dengan failover otomatis ke Server FFmpeg Transcode (/api/transcode-mp4).
 */

import { LyricLine, TrackMeta, SpotifyDisplayMode, AspectRatio, SpotifyTheme } from '../types/lyrics';
import { formatPlayerTime, findActiveLyricIndex } from './lrcParser';
import { audioBufferToWav } from './audioBufferToWav';
import { normalizeAudioBufferToStereo44100 } from './audioNormalization';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import {
  solveCubicBezier,
  computeLyricMotionState,
  computeEasedScrollOffset,
  applyCanvasMotion,
  setContextFilter,
  NOW_PLAYING_MOTION_PRESET,
  CANVAS_SUBTITLES_MOTION_PRESET,
  EXPANDED_LYRICS_MOTION_PRESET,
} from './lyricCanvasAnimator';

export interface ProgressDetails {
  currentFrame?: number;
  totalFrames?: number;
  fps?: number;
  stage?: string;
  engine?: string;
  elapsedSeconds?: number;
  throttleMode?: 'unthrottled' | 'balanced' | 'eco';
}

export interface VideoExportOptions {
  duration: number;
  trackMeta: TrackMeta;
  lyrics: LyricLine[];
  displayMode: SpotifyDisplayMode;
  aspectRatio?: AspectRatio;
  showTranslation?: boolean;
  onProgress: (progress: number, secondsLeft: number, details?: ProgressDetails) => void;
  backgroundCanvas?: HTMLCanvasElement | null;
  onSeekCanvas?: (time: number) => void;
  videoElement?: HTMLVideoElement | null;
  customVideoUrl?: string | null;
  width?: number;
  height?: number;
  quality?: '720p' | '1080p';
  fps?: 30 | 60;
  bitrate?: number;
  theme?: SpotifyTheme;
  /** Master audio buffer (PCM Float32 stereo/mono) */
  audioBuffer?: AudioBuffer | null;
  /** Mode throttling render untuk mengendalikan beban CPU/GPU perangkat */
  throttleMode?: 'unthrottled' | 'balanced' | 'eco';
  /** Kustom jeda throttling render dalam milidetik per frame */
  throttleDelayMs?: number;
  /** Paksa menggunakan server-side FFmpeg transcode */
  preferServerEncoder?: boolean;
  /** Opsi untuk mematikan web worker (menggunakan thread utama) */
  disableWorker?: boolean;
  /** Callback saat proses encoding dimulai */
  onStart?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  /** Getter waktu lagu saat ini (opsional fallback) */
  getCurrentTime?: () => number;
}

export interface ExportReport {
  requestedWidth: number;
  requestedHeight: number;
  requestedFps: number;
  requestedBitrate: number;
  songDuration: number;
  actualWidth: number;
  actualHeight: number;
  mimeType: string;
  sizeBytes: number;
  recordedSeconds: number;
  totalFrames: number;
  encoderType:
    | 'Web Worker (WebCodecs + MP4-Muxer)'
    | 'WebCodecs MP4-Muxer (H.264/AAC)'
    | 'Server FFmpeg (libx264/AAC)';
  avgDrawFps: number;
  avgBitrateMbps: number;
  hasAudioTrack: boolean;
  backgroundVideoRequested: boolean;
  backgroundVideoCoverage: number;
  warnings: string[];
}

const THEME_PALETTES: Record<
  SpotifyTheme,
  {
    bgStart: string;
    bgMid: string;
    bgEnd: string;
    accent: string;
    cardBg: string;
    textSub: string;
  }
> = {
  emerald: {
    bgStart: '#0d2818',
    bgMid: '#050e09',
    bgEnd: '#040406',
    accent: '#1DB954',
    cardBg: 'rgba(21, 62, 36, 0.94)',
    textSub: '#6ee7b7',
  },
  charcoal: {
    bgStart: '#27272a',
    bgMid: '#18181b',
    bgEnd: '#09090b',
    accent: '#a1a1aa',
    cardBg: 'rgba(39, 39, 42, 0.94)',
    textSub: '#d4d4d8',
  },
  midnight: {
    bgStart: '#18181b',
    bgMid: '#0a0a0c',
    bgEnd: '#030304',
    accent: '#1DB954',
    cardBg: 'rgba(24, 24, 27, 0.94)',
    textSub: '#6ee7b7',
  },
  indigo: {
    bgStart: '#1e1b4b',
    bgMid: '#0f0e26',
    bgEnd: '#030304',
    accent: '#818cf8',
    cardBg: 'rgba(46, 42, 114, 0.94)',
    textSub: '#a5b4fc',
  },
  amber: {
    bgStart: '#451a03',
    bgMid: '#1f0d02',
    bgEnd: '#050507',
    accent: '#fbbf24',
    cardBg: 'rgba(92, 36, 4, 0.94)',
    textSub: '#fde68a',
  },
  cool_gray: {
    bgStart: '#1e293b',
    bgMid: '#0f172a',
    bgEnd: '#020617',
    accent: '#cbd5e1',
    cardBg: 'rgba(30, 41, 59, 0.94)',
    textSub: '#e2e8f0',
  },
  purple_orchid: {
    bgStart: '#3b0764',
    bgMid: '#1e0538',
    bgEnd: '#090111',
    accent: '#c084fc',
    cardBg: 'rgba(59, 7, 100, 0.94)',
    textSub: '#e9d5ff',
  },
  gold_kamboja: {
    bgStart: '#451a03',
    bgMid: '#240e02',
    bgEnd: '#0a0400',
    accent: '#fbbf24',
    cardBg: 'rgba(78, 31, 6, 0.94)',
    textSub: '#fde68a',
  },
  pink_sakura: {
    bgStart: '#500724',
    bgMid: '#280312',
    bgEnd: '#0c0005',
    accent: '#f472b6',
    cardBg: 'rgba(94, 10, 45, 0.94)',
    textSub: '#fbcfe8',
  },
  red_amaranth: {
    bgStart: '#4c0519',
    bgMid: '#23020b',
    bgEnd: '#0a0003',
    accent: '#f43f5e',
    cardBg: 'rgba(92, 8, 33, 0.94)',
    textSub: '#fecdd3',
  },
  green_poison: {
    bgStart: '#052e16',
    bgMid: '#02180b',
    bgEnd: '#000a04',
    accent: '#22c55e',
    cardBg: 'rgba(9, 61, 30, 0.94)',
    textSub: '#86efac',
  },
  dark_tree_brown: {
    bgStart: '#2e1509',
    bgMid: '#170a04',
    bgEnd: '#080301',
    accent: '#b45309',
    cardBg: 'rgba(56, 26, 12, 0.94)',
    textSub: '#fed7aa',
  },
};

/**
 * Micro-task yielder using MessageChannel to avoid 1-second browser timer throttling in background tabs
 */
function createMicroYielder() {
  if (typeof MessageChannel !== 'undefined') {
    const channel = new MessageChannel();
    let pendingResolve: (() => void) | null = null;
    channel.port1.onmessage = () => {
      const cb = pendingResolve;
      pendingResolve = null;
      if (cb) cb();
    };
    return function yieldMicroTask(): Promise<void> {
      return new Promise((resolve) => {
        pendingResolve = resolve;
        channel.port2.postMessage(null);
      });
    };
  }
  return function yieldMicroTask(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  };
}

const yieldMicroTask = createMicroYielder();

/**
 * Small frame cache (N=5) to store recently accessed frames to eliminate
 * re-decoding lag when looping the canvas animation.
 */
export class VideoFrameCache {
  private maxFrames: number;
  private cache = new Map<number, ImageBitmap>();

  constructor(maxFrames = 5) {
    this.maxFrames = maxFrames;
  }

  public has(key: number): boolean {
    return this.cache.has(key);
  }

  public get(key: number): ImageBitmap | undefined {
    return this.cache.get(key);
  }

  public set(key: number, bitmap: ImageBitmap): void {
    if (this.cache.has(key)) return;
    if (this.cache.size >= this.maxFrames) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        const oldBmp = this.cache.get(oldestKey);
        try {
          oldBmp?.close();
        } catch {}
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, bitmap);
  }

  public clear(): void {
    for (const bmp of this.cache.values()) {
      try {
        bmp.close();
      } catch {}
    }
    this.cache.clear();
  }
}

/**
 * Promise-based queue management system that tracks pending frames effectively
 * without relying on frame count polling or while-sleep loops.
 * Includes timeout safety to strictly prevent deadlock under all hardware loads.
 */
export class PromiseQueueManager {
  private maxConcurrent: number;
  private inFlight = 0;
  private waiters: Array<() => void> = [];

  constructor(maxConcurrent = 3) {
    this.maxConcurrent = maxConcurrent;
  }

  public acquire(timeoutMs = 4000): Promise<void> {
    if (this.inFlight < this.maxConcurrent) {
      this.inFlight++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      let resolved = false;

      const fulfill = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          this.inFlight++;
          resolve();
        }
      };

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          const idx = this.waiters.indexOf(fulfill);
          if (idx !== -1) this.waiters.splice(idx, 1);
          this.inFlight++;
          resolve();
        }
      }, timeoutMs);

      this.waiters.push(fulfill);
    });
  }

  public release(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    if (this.waiters.length > 0 && this.inFlight < this.maxConcurrent) {
      const next = this.waiters.shift();
      if (next) next();
    }
  }

  public clear(): void {
    this.inFlight = 0;
    while (this.waiters.length > 0) {
      const next = this.waiters.shift();
      if (next) next();
    }
  }

  public getInFlight(): number {
    return this.inFlight;
  }
}

/**
 * Frame-accurate-ish seek helper for HTMLVideoElement.
 *
 * IMPORTANT: only the `seeked` event is accepted as a successful seek signal.
 * `playing` and `timeupdate` can fire while the element still exposes the
 * previous decoded frame, which is unsafe for deterministic frame export.
 */
async function seekVideo(video: HTMLVideoElement, time: number): Promise<boolean> {
  const TARGET_TOLERANCE = 0.006; // 6 ms
  const SEEK_TIMEOUT_MS = 1500;

  if (video.readyState >= 2 && Math.abs(video.currentTime - time) <= TARGET_TOLERANCE) {
    return true;
  }

  return new Promise((resolve) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      resolve(ok);
    };

    const onSeeked = () => {
      const positionOk = Math.abs(video.currentTime - time) <= TARGET_TOLERANCE;
      finish(positionOk && video.readyState >= 2 && video.videoWidth > 0);
    };

    const onError = () => finish(false);

    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);

    try {
      video.currentTime = time;
    } catch {
      finish(false);
      return;
    }

    timeoutId = setTimeout(() => finish(false), SEEK_TIMEOUT_MS);
  });
}

export class SpotifyVideoRecorder {
  public lastReport: ExportReport | null = null;
  private activeWorker: Worker | null = null;
  private isCancelled = false;

  /**
   * Batalkan proses ekspor yang sedang berlangsung
   */
  public cancelExport(): void {
    this.isCancelled = true;
    if (this.activeWorker) {
      try {
        this.activeWorker.postMessage({ type: 'CANCEL' });
        this.activeWorker.terminate();
      } catch {
        // ignore
      }
      this.activeWorker = null;
    }
  }

  /**
   * Main export method: Deterministic frame-by-frame rendering into genuine MP4
   */
  public async exportVideo(
    options: VideoExportOptions,
    audioElement?: HTMLAudioElement | null
  ): Promise<Blob> {
    this.isCancelled = false;

    // Validasi keberadaan dan isi audio buffer sebelum encoding
    if (!options.audioBuffer || options.audioBuffer.length === 0) {
      throw new Error('Audio buffer is empty');
    }
    if (options.audioBuffer.duration <= 0) {
      throw new Error('Audio decoding failed. Export cancelled: Audio duration is 0.');
    }

    const ratio = options.aspectRatio || '9:16';
    const quality = options.quality || '1080p';
    const fps = options.fps || 30;

    let width = options.width;
    let height = options.height;

    if (!width || !height) {
      if (quality === '720p') {
        if (ratio === '9:16') {
          width = 720;
          height = 1280;
        } else if (ratio === '1:1') {
          width = 720;
          height = 720;
        } else {
          width = 1280;
          height = 720;
        }
      } else {
        if (ratio === '9:16') {
          width = 1080;
          height = 1920;
        } else if (ratio === '1:1') {
          width = 1080;
          height = 1080;
        } else {
          width = 1920;
          height = 1080;
        }
      }
    }

    // Pastikan dimensi bernilai genap (persyaratan H.264 YUV420p encoder)
    width = Math.floor(width / 2) * 2;
    height = Math.floor(height / 2) * 2;

    const targetBitrate =
      options.bitrate ||
      (quality === '1080p'
        ? fps === 60
          ? 16_000_000
          : 11_000_000
        : fps === 60
        ? 8_500_000
        : 5_500_000);

    // Prioritas 1: Web Worker Background Pipeline (Bebas lag main thread, UI mulus)
    if (typeof Worker !== 'undefined' && !options.disableWorker && !options.preferServerEncoder) {
      try {
        console.info('[Export] Memulai Web Worker Background Engine (H.264/AAC + MP4-Muxer)');
        return await this.exportWithWorker(options, width, height, fps, targetBitrate);
      } catch (err) {
        console.warn('[Export] Web Worker Engine gagal/dialihkan, mencoba Main Thread WebCodecs:', err);
      }
    }

    // Prioritas 2: Main-Thread WebCodecs + MP4-Muxer
    const canUseWebCodecs = await this.checkWebCodecsSupport(width, height, fps, targetBitrate);

    if (canUseWebCodecs && !options.preferServerEncoder) {
      try {
        console.info('[Export] Menggunakan Browser WebCodecs + MP4-Muxer Engine (H.264/AAC)');
        return await this.exportWithWebCodecs(options, width, height, fps, targetBitrate);
      } catch (err) {
        console.warn('[Export] WebCodecs gagal, mengalihkan ke Server FFmpeg Engine:', err);
      }
    }

    // Prioritas 3: Server FFmpeg Engine
    console.info('[Export] Menggunakan Server FFmpeg Engine (/api/transcode-mp4)');
    return await this.exportWithServerFFmpeg(options, width, height, fps, targetBitrate, audioElement);
  }

  /**
   * Pipeline 1: Web Worker Background WebCodecs + MP4-Muxer
   * Seluruh kompresi H.264, AAC encoding, dan MP4 muxing berjalan di Worker thread.
   * Main thread hanya merender visual canvas dan mentransfer ImageBitmap tanpa hambatan.
   */
  private async exportWithWorker(
    options: VideoExportOptions,
    width: number,
    height: number,
    fps: number,
    targetBitrate: number
  ): Promise<Blob> {
    const totalDuration = options.duration;
    const totalFrames = Math.max(1, Math.round(totalDuration * fps));
    const frameDurationMicros = Math.round((1 / fps) * 1_000_000);

    // 1. Normalisasi audio buffer ke standard stereo 44100Hz sebelum dikirim ke worker
    if (!options.audioBuffer || options.audioBuffer.length === 0) {
      throw new Error('Audio buffer is empty');
    }
    if (options.audioBuffer.duration <= 0) {
      throw new Error('Audio decoding failed. Export cancelled: Audio duration is 0.');
    }

    const normalizedAudioBuffer = await normalizeAudioBufferToStereo44100(options.audioBuffer, totalDuration);

    if (normalizedAudioBuffer.sampleRate !== 44100 || normalizedAudioBuffer.numberOfChannels !== 2) {
      throw new Error('Audio normalization failed: expected 44100Hz stereo.');
    }

    const leftData = normalizedAudioBuffer.getChannelData(0);
    const rightData = normalizedAudioBuffer.getChannelData(1);

    // Transferable Float32 copy buffers
    const leftBuffer = leftData.slice().buffer;
    const rightBuffer = rightData.slice().buffer;

    const worker = new Worker(
      new URL('./export.worker.ts', import.meta.url),
      { type: 'module' }
    );
    this.activeWorker = worker;

    let workerError: Error | null = null;
    let framesAcknowledged = 0;
    let lastWorkerQueueSize = 0;
    let currentStage = 'Merender & Meng-encode Frame';
    const queueManager = new PromiseQueueManager(3);
    const videoFrameCache = new VideoFrameCache(5);
    let lastGoodVideoSource: CanvasImageSource | null = null;

    const hiddenCanvas = document.createElement('canvas');
    hiddenCanvas.width = width;
    hiddenCanvas.height = height;

    const ctx = hiddenCanvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) {
      this.activeWorker = null;
      worker.terminate();
      throw new Error('Canvas 2D context tidak tersedia.');
    }

    const hiddenVideo = await this.preloadVideo(options.customVideoUrl || options.trackMeta.videoUrl);

    const stats = {
      framesSent: 0,
      videoDrawn: 0,
      startTime: performance.now(),
    };

    options.onStart?.();

    try {
      // Tunggu konfirmasi inisialisasi dari Worker
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Worker inisialisasi timeout (12 detik).'));
        }, 12000);

        const onInitMsg = (e: MessageEvent) => {
          if (e.data.type === 'INIT_SUCCESS') {
            clearTimeout(timeout);
            worker.removeEventListener('message', onInitMsg);
            resolve();
          } else if (e.data.type === 'INIT_ERROR' || e.data.type === 'ERROR') {
            clearTimeout(timeout);
            worker.removeEventListener('message', onInitMsg);
            reject(new Error(e.data.error || 'Worker inisialisasi gagal.'));
          }
        };

        worker.addEventListener('message', onInitMsg);

        worker.postMessage(
          {
            type: 'INIT',
            payload: {
              width,
              height,
              fps,
              bitrate: targetBitrate,
              totalFrames,
              duration: totalDuration,
              audio: {
                sampleRate: 44100,
                numberOfChannels: 2,
                leftChannel: leftBuffer,
                rightChannel: rightBuffer,
              },
            },
          },
          [leftBuffer, rightBuffer]
        );
      });

      // Siapkan completion promise sebelum loop frame
      const completionPromise = new Promise<ArrayBuffer>((resolve, reject) => {
        worker.onmessage = (e: MessageEvent) => {
          const { type } = e.data || {};
          if (type === 'FRAME_COMPLETED' || type === 'FRAME_PROCESSED' || type === 'FRAME_ACK') {
            queueManager.release();
            if (typeof e.data.framesEncoded === 'number') {
              framesAcknowledged = Math.max(framesAcknowledged, e.data.framesEncoded);
            }
            if (typeof e.data.queueSize === 'number') {
              lastWorkerQueueSize = e.data.queueSize;
            }
          } else if (type === 'QUEUE_UPDATE') {
            if (typeof e.data.queueSize === 'number') {
              lastWorkerQueueSize = e.data.queueSize;
            }
            if (typeof e.data.framesEncoded === 'number') {
              framesAcknowledged = Math.max(framesAcknowledged, e.data.framesEncoded);
            }
          } else if (type === 'STAGE_UPDATE') {
            if (e.data.stage === 'encoding_audio') {
              currentStage = 'Menyinkronkan Master Audio AAC';
            } else if (e.data.stage === 'muxing') {
              currentStage = 'Mempaketkan Kontainer MP4 (FastStart)';
            }
          } else if (type === 'COMPLETE') {
            resolve(e.data.buffer);
          } else if (type === 'ERROR') {
            workerError = new Error(e.data.error);
            queueManager.clear();
            reject(workerError);
          }
        };

        worker.onerror = (err) => {
          workerError = new Error(err.message || 'Worker thread error.');
          queueManager.clear();
          reject(workerError);
        };
      });

      // Loop deterministik: Frame 0 sampai totalFrames - 1
      for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
        if (this.isCancelled) {
          queueManager.clear();
          throw new Error('Ekspor video dibatalkan oleh pengguna.');
        }
        if (workerError) {
          queueManager.clear();
          throw workerError;
        }

        const t = frameIndex / fps;

        // Deterministic background-video frame acquisition. A failed seek never
        // falls through to PaintingCanvas/artwork; it reuses the last good video frame.
        let currentVideoSource: CanvasImageSource | null = null;
        if (hiddenVideo && hiddenVideo.duration > 0) {
          const videoDuration = hiddenVideo.duration;
          const targetVideoTime = t % videoDuration;
          const safeTime = Math.min(Math.max(0, targetVideoTime), Math.max(0, videoDuration - 0.04));
          const frameKey = Math.round(safeTime * 30);

          const cachedBmp = videoFrameCache.get(frameKey);
          if (cachedBmp) {
            currentVideoSource = cachedBmp;
            lastGoodVideoSource = cachedBmp;
            stats.videoDrawn++;
          } else {
            const seekOk = await seekVideo(hiddenVideo, safeTime);
            if (seekOk) {
              try {
                const capturedBmp = await createImageBitmap(hiddenVideo);
                videoFrameCache.set(frameKey, capturedBmp);
                currentVideoSource = capturedBmp;
                lastGoodVideoSource = capturedBmp;
                stats.videoDrawn++;
              } catch {
                // Keep the live video element for this frame only. Never store it as
                // lastGoodVideoSource because a later failed seek can mutate it.
                currentVideoSource = hiddenVideo;
                stats.videoDrawn++;
              }
            } else {
              currentVideoSource = lastGoodVideoSource;
              if (currentVideoSource) stats.videoDrawn++;
            }
          }
        }

        // Sinkronisasi frame animasi PaintingCanvas tiap frame
        if (options.onSeekCanvas) {
          options.onSeekCanvas(t);
        }

        // Render composite Spotify frame
        this.renderCompositeFrame(
          ctx,
          width,
          height,
          t,
          totalDuration,
          currentVideoSource,
          options.backgroundCanvas,
          options
        );

        // Promise-based flow control: wait for available slot without polling while-loops
        await queueManager.acquire();

        if (this.isCancelled) {
          queueManager.clear();
          throw new Error('Ekspor video dibatalkan oleh pengguna.');
        }
        if (workerError) {
          queueManager.clear();
          throw workerError;
        }

        // Buat ImageBitmap dan transfer ke Web Worker tanpa beban memori di main thread
        const bitmap = await createImageBitmap(hiddenCanvas);
        const timestampMicros = frameIndex * frameDurationMicros;
        const isKeyframe = frameIndex % (fps * 2) === 0;

        try {
          worker.postMessage(
            {
              type: 'ENCODE_FRAME',
              payload: {
                bitmap,
                frameIndex,
                timestampMicros,
                durationMicros: frameDurationMicros,
                isKeyframe,
              },
            },
            [bitmap]
          );
        } catch (postErr) {
          queueManager.release();
          try {
            bitmap.close();
          } catch {
            // ignore
          }
          throw postErr;
        }

        stats.framesSent++;

        // Hitung estimasi waktu selesai secara akurat
        const elapsedSec = (performance.now() - stats.startTime) / 1000;
        const processedCount = Math.max(1, framesAcknowledged);
        const currentSpeedFps = Math.max(1, Math.round(processedCount / Math.max(0.1, elapsedSec)));
        const framesRemaining = Math.max(0, totalFrames - processedCount);
        const secondsLeft = Math.ceil(framesRemaining / currentSpeedFps);
        const percent = Math.min(94, Math.round((processedCount / totalFrames) * 92));

        const throttleMode = options.throttleMode || 'balanced';
        const paceDelayMs = options.throttleDelayMs ?? (
          throttleMode === 'eco' ? 14 :
          throttleMode === 'balanced' ? 4 : 0
        );

        options.onProgress(percent, secondsLeft, {
          currentFrame: frameIndex + 1,
          totalFrames,
          fps: currentSpeedFps,
          stage: currentStage,
          engine: 'Web Worker (WebCodecs + MP4-Muxer)',
          elapsedSeconds: Math.floor(elapsedSec),
          throttleMode,
        });

        // Terapkan jeda pacing throttling dengan yieldMicroTask agar tidak diperlambat browser saat tab tidak aktif
        if (paceDelayMs > 0 && typeof document !== 'undefined' && !document.hidden) {
          await new Promise((resolve) => setTimeout(resolve, paceDelayMs));
        } else {
          await yieldMicroTask();
        }
      }

      // Beritahu worker untuk finalisasi lewat 'finish' signal
      options.onProgress(95, 2, {
        currentFrame: totalFrames,
        totalFrames,
        fps: Math.round(totalFrames / ((performance.now() - stats.startTime) / 1000)),
        stage: 'Menyinkronkan Master Audio AAC',
        engine: 'Web Worker (WebCodecs + MP4-Muxer)',
      });

      worker.postMessage({ type: 'finish' });

      // Tunggu file MP4 selesai dibentuk dari background worker
      const mp4Buffer = await completionPromise;

      if (!(mp4Buffer instanceof ArrayBuffer) || mp4Buffer.byteLength < 1000) {
        throw new Error(
          `Worker menghasilkan MP4 yang kosong atau tidak valid (${mp4Buffer?.byteLength || 0} bytes).`
        );
      }

      const blob = new Blob([mp4Buffer], {
        type: 'video/mp4',
      });

      if (blob.size < 1000) {
        throw new Error(
          `MP4 hasil render terlalu kecil (${blob.size} bytes).`
        );
      }

      options.onProgress(100, 0, {
        currentFrame: totalFrames,
        totalFrames,
        stage: 'Selesai!',
        engine: 'Web Worker (WebCodecs + MP4-Muxer)',
      });

      const coverage = hiddenVideo ? stats.videoDrawn / stats.framesSent : 1;

      this.lastReport = {
        requestedWidth: width,
        requestedHeight: height,
        requestedFps: fps,
        requestedBitrate: targetBitrate,
        songDuration: totalDuration,
        actualWidth: width,
        actualHeight: height,
        mimeType: 'video/mp4',
        sizeBytes: blob.size,
        recordedSeconds: totalDuration,
        totalFrames: stats.framesSent,
        encoderType: 'Web Worker (WebCodecs + MP4-Muxer)',
        avgDrawFps: fps,
        avgBitrateMbps: (blob.size * 8) / totalDuration / 1e6,
        hasAudioTrack: true,
        backgroundVideoRequested: !!hiddenVideo,
        backgroundVideoCoverage: coverage,
        warnings: [],
      };

      return blob;
    } finally {
      videoFrameCache.clear();
      this.activeWorker = null;
      worker.terminate();
      if (hiddenVideo) {
        hiddenVideo.src = '';
        hiddenVideo.load();
      }
    }
  }

  /**
   * Cek apakah WebCodecs mendukung video H.264 (avc1) dan audio AAC (mp4a)
   */
  private async checkWebCodecsSupport(
    width: number,
    height: number,
    fps: number,
    bitrate: number
  ): Promise<boolean> {
    if (
      typeof window === 'undefined' ||
      typeof window.VideoEncoder === 'undefined' ||
      typeof window.AudioEncoder === 'undefined' ||
      typeof window.VideoFrame === 'undefined' ||
      typeof window.AudioData === 'undefined'
    ) {
      return false;
    }

    try {
      const H264_CANDIDATES = [
        'avc1.4d002a',
        'avc1.42001f',
        'avc1.4d001f',
        'avc1.640028',
        'avc1.42e01e',
        'avc1.420028',
      ];
      let videoSupported = false;
      for (const candidate of H264_CANDIDATES) {
        for (const withAvc of [true, false]) {
          try {
            const config: VideoEncoderConfig = {
              codec: candidate,
              width,
              height,
              bitrate,
              framerate: fps,
              ...(withAvc ? { avc: { format: 'avc' as const } } : {}),
            };
            const support = await VideoEncoder.isConfigSupported(config);
            if (support.supported) {
              videoSupported = true;
              break;
            }
          } catch {}
        }
        if (videoSupported) break;
      }

      const AAC_CANDIDATES = ['mp4a.40.2', 'mp4a.67', 'mp4a.40.02'];
      let audioSupported = false;
      for (const candidate of AAC_CANDIDATES) {
        try {
          const support = await AudioEncoder.isConfigSupported({
            codec: candidate,
            numberOfChannels: 2,
            sampleRate: 44100,
            bitrate: 192000,
          });
          if (support.supported) {
            audioSupported = true;
            break;
          }
        } catch {}
      }

      return videoSupported && audioSupported;
    } catch {
      return false;
    }
  }

  /**
   * Pipeline 1: Offline Deterministic WebCodecs + MP4-Muxer
   * Menghasilkan file MP4 H.264 + AAC langsung di browser secara murni offline.
   */
  private async exportWithWebCodecs(
    options: VideoExportOptions,
    width: number,
    height: number,
    fps: number,
    targetBitrate: number
  ): Promise<Blob> {
    const hiddenCanvas = document.createElement('canvas');
    hiddenCanvas.width = width;
    hiddenCanvas.height = height;

    const ctx = hiddenCanvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) throw new Error('Canvas 2D context tidak tersedia.');

    // Preload Fallback Impasto Artwork

    // Preload Custom Background Video
    const hiddenVideo = await this.preloadVideo(options.customVideoUrl || options.trackMeta.videoUrl);

    // Negosiasi AAC yang sama dengan preflight check; jangan mengandalkan codec hardcoded.
    const AAC_CANDIDATES = ['mp4a.40.2', 'mp4a.67', 'mp4a.40.02'];
    let selectedAudioCodec: string | null = null;

    for (const candidate of AAC_CANDIDATES) {
      try {
        const support = await AudioEncoder.isConfigSupported({
          codec: candidate,
          numberOfChannels: 2,
          sampleRate: 44100,
          bitrate: 192000,
        });
        if (support.supported) {
          selectedAudioCodec = candidate;
          break;
        }
      } catch {
        // Try the next AAC profile.
      }
    }

    if (!selectedAudioCodec) {
      throw new Error('No supported AAC audio profile found for WebCodecs export.');
    }

    // Inisialisasi MP4-Muxer
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width,
        height,
      },
      audio: {
        codec: 'aac',
        numberOfChannels: 2,
        sampleRate: 44100,
      },
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });

    let encoderError: Error | null = null;

    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => {
        console.error('[VideoEncoder Error]', e);
        encoderError = e;
      },
    });

    videoEncoder.configure({
      codec: 'avc1.4d002a',
      width,
      height,
      bitrate: targetBitrate,
      framerate: fps,
      avc: { format: 'avc' },
    });

    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => {
        console.error('[AudioEncoder Error]', e);
        encoderError = e;
      },
    });

    audioEncoder.configure({
      codec: selectedAudioCodec,
      numberOfChannels: 2,
      sampleRate: 44100,
      bitrate: 192000,
    });

    const totalDuration = options.duration;
    const totalFrames = Math.max(1, Math.round(totalDuration * fps));
    const frameDurationMicros = Math.round((1 / fps) * 1_000_000);

    // Normalisasi audio buffer ke standard stereo 44100Hz sebelum encoding
    if (!options.audioBuffer || options.audioBuffer.length === 0) {
      throw new Error('Audio buffer is empty');
    }
    if (options.audioBuffer.duration <= 0) {
      throw new Error('Audio decoding failed. Export cancelled: Audio duration is 0.');
    }

    const normalizedAudioBuffer = await normalizeAudioBufferToStereo44100(options.audioBuffer, totalDuration);

    if (normalizedAudioBuffer.sampleRate !== 44100) {
      throw new Error(`Audio normalization failed: sampleRate is ${normalizedAudioBuffer.sampleRate}, expected 44100`);
    }
    if (normalizedAudioBuffer.numberOfChannels !== 2) {
      throw new Error(`Audio normalization failed: numberOfChannels is ${normalizedAudioBuffer.numberOfChannels}, expected 2`);
    }

    const leftData = normalizedAudioBuffer.getChannelData(0);
    const rightData = normalizedAudioBuffer.getChannelData(1);
    const totalAudioSamples = Math.min(leftData.length, Math.floor(totalDuration * 44100));
    let audioEncodedOffset = 0;

    const videoFrameCache = new VideoFrameCache(5);
    let lastGoodVideoSource: CanvasImageSource | null = null;

    const stats = {
      framesEncoded: 0,
      videoDrawn: 0,
      startTime: performance.now(),
    };

    options.onStart?.();

    try {
      // Loop deterministik: Frame 0 sampai totalFrames - 1
      for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
        if (encoderError) throw encoderError;

        const t = frameIndex / fps;

        // Kunci clock background video ke exact time t. A failed seek reuses only
        // the last successfully decoded video frame; it never falls back to canvas artwork.
        let currentVideoSource: CanvasImageSource | null = null;
        if (hiddenVideo && hiddenVideo.duration > 0) {
          const videoDuration = hiddenVideo.duration;
          const cycleTime = t % videoDuration;
          const safeTime = Math.min(Math.max(0, cycleTime), Math.max(0, videoDuration - 0.04));
          const frameKey = Math.floor(safeTime * fps);

          const cachedBmp = videoFrameCache.get(frameKey);
          if (cachedBmp) {
            currentVideoSource = cachedBmp;
            lastGoodVideoSource = cachedBmp;
            stats.videoDrawn++;
          } else {
            const seekOk = await seekVideo(hiddenVideo, safeTime);
            if (seekOk) {
              try {
                const capturedBmp = await createImageBitmap(hiddenVideo);
                videoFrameCache.set(frameKey, capturedBmp);
                currentVideoSource = capturedBmp;
                lastGoodVideoSource = capturedBmp;
                stats.videoDrawn++;
              } catch {
                // Keep the live element for this frame only; the fallback snapshot
                // must remain an immutable ImageBitmap.
                currentVideoSource = hiddenVideo;
                stats.videoDrawn++;
              }
            } else {
              currentVideoSource = lastGoodVideoSource;
              if (currentVideoSource) stats.videoDrawn++;
            }
          }
        }

        // Sinkronisasi frame animasi PaintingCanvas tiap frame
        if (options.onSeekCanvas) {
          options.onSeekCanvas(t);
        }

        // Render composite Spotify frame
        this.renderCompositeFrame(
          ctx,
          width,
          height,
          t,
          totalDuration,
          currentVideoSource,
          options.backgroundCanvas,
          options
        );

        // Adaptive Backpressure: Kontrol antrean hardware encoder tanpa deadlock
        const MAX_ENCODER_QUEUE_LIMIT = 4;
        const waitStart = performance.now();
        while (videoEncoder.encodeQueueSize >= MAX_ENCODER_QUEUE_LIMIT) {
          if (this.isCancelled) throw new Error('Ekspor video dibatalkan oleh pengguna.');
          if (encoderError) throw encoderError;
          if (performance.now() - waitStart > 350) {
            break;
          }
          await yieldMicroTask();
        }

        // Buat VideoFrame pada exact timestamp microseconds dengan explicit VideoFrame.close() handling
        const timestampMicros = frameIndex * frameDurationMicros;
        const isKeyframe = frameIndex % (fps * 2) === 0;

        let videoFrame: VideoFrame | null = null;
        try {
          videoFrame = new VideoFrame(hiddenCanvas, {
            timestamp: timestampMicros,
            duration: frameDurationMicros,
          });
          videoEncoder.encode(videoFrame, { keyFrame: isKeyframe });
        } finally {
          // Explicit VideoFrame.close() handling to prevent GPU memory/texture leaks
          if (videoFrame) {
            try {
              videoFrame.close();
            } catch {
              // ignore if already closed
            }
          }
        }
        stats.framesEncoded++;

        // Progressive Audio Interleaving: encode audio chunk sampai video timestamp saat ini
        const targetAudioMicros = timestampMicros + frameDurationMicros;
        const targetSample = Math.min(totalAudioSamples, Math.floor((targetAudioMicros / 1_000_000) * 44100));
        const chunkSize = 1024;
        while (audioEncodedOffset + chunkSize <= targetSample && audioEncodedOffset < totalAudioSamples) {
          while (audioEncoder.encodeQueueSize > 6) {
            if (encoderError) throw encoderError;
            await yieldMicroTask();
          }
          const planarData = new Float32Array(chunkSize * 2);
          planarData.set(leftData.subarray(audioEncodedOffset, audioEncodedOffset + chunkSize), 0);
          planarData.set(rightData.subarray(audioEncodedOffset, audioEncodedOffset + chunkSize), chunkSize);

          const audioData = new AudioData({
            format: 'f32-planar',
            sampleRate: 44100,
            numberOfFrames: chunkSize,
            numberOfChannels: 2,
            timestamp: Math.round((audioEncodedOffset / 44100) * 1_000_000),
            data: planarData,
          });
          try {
            audioEncoder.encode(audioData);
          } finally {
            audioData.close();
          }
          audioEncodedOffset += chunkSize;
        }

        // Progress UI update
        const elapsedSec = (performance.now() - stats.startTime) / 1000;
        const currentSpeedFps = Math.max(1, Math.round((frameIndex + 1) / Math.max(0.1, elapsedSec)));
        const percent = Math.min(94, Math.round((frameIndex / totalFrames) * 90));
        const secondsLeft = Math.max(0, Math.ceil((totalFrames - frameIndex) / currentSpeedFps));
        const throttleMode = options.throttleMode || 'balanced';
        const paceDelayMs = options.throttleDelayMs ?? (
          throttleMode === 'eco' ? 14 :
          throttleMode === 'balanced' ? 4 : 0
        );

        options.onProgress(percent, secondsLeft, {
          currentFrame: frameIndex + 1,
          totalFrames,
          fps: currentSpeedFps,
          stage: 'Merender Frame (Main Thread WebCodecs)',
          engine: 'WebCodecs MP4-Muxer (H.264/AAC)',
          elapsedSeconds: Math.floor(elapsedSec),
          throttleMode,
        });

        // Beri jeda throttling agar beban CPU/GPU stabil tanpa lambat di background tab
        if (paceDelayMs > 0 && typeof document !== 'undefined' && !document.hidden) {
          await new Promise((r) => setTimeout(r, paceDelayMs));
        } else {
          await yieldMicroTask();
        }
      }

      // Encode sisa audio chunk (jika ada)
      options.onProgress(95, 1, {
        currentFrame: totalFrames,
        totalFrames,
        stage: 'Menyinkronkan Master Audio AAC',
        engine: 'WebCodecs MP4-Muxer (H.264/AAC)',
      });
      while (audioEncodedOffset < totalAudioSamples) {
        while (audioEncoder.encodeQueueSize > 6) {
          if (encoderError) throw encoderError;
          await yieldMicroTask();
        }

        const currentChunkSize = Math.min(1024, totalAudioSamples - audioEncodedOffset);
        const planarData = new Float32Array(currentChunkSize * 2);
        planarData.set(leftData.subarray(audioEncodedOffset, audioEncodedOffset + currentChunkSize), 0);
        planarData.set(rightData.subarray(audioEncodedOffset, audioEncodedOffset + currentChunkSize), currentChunkSize);

        const audioData = new AudioData({
          format: 'f32-planar',
          sampleRate: 44100,
          numberOfFrames: currentChunkSize,
          numberOfChannels: 2,
          timestamp: Math.round((audioEncodedOffset / 44100) * 1_000_000),
          data: planarData,
        });
        try {
          audioEncoder.encode(audioData);
        } finally {
          audioData.close();
        }
        audioEncodedOffset += currentChunkSize;
      }

      options.onProgress(98, 0, {
        currentFrame: totalFrames,
        totalFrames,
        stage: 'Mempaketkan MP4 FastStart',
        engine: 'WebCodecs MP4-Muxer (H.264/AAC)',
      });

      // Flush kedua encoder dan finalisasi container MP4
      await videoEncoder.flush();
      await audioEncoder.flush();
      muxer.finalize();

      const mp4Buffer = muxer.target.buffer;
      if (!(mp4Buffer instanceof ArrayBuffer) || mp4Buffer.byteLength < 1000) {
        throw new Error(
          `WebCodecs menghasilkan MP4 yang kosong atau tidak valid (${mp4Buffer?.byteLength || 0} bytes).`
        );
      }

      const blob = new Blob([mp4Buffer], { type: 'video/mp4' });
      if (blob.size < 1000) {
        throw new Error(`MP4 hasil render terlalu kecil (${blob.size} bytes).`);
      }

      const elapsedSec = (performance.now() - stats.startTime) / 1000;
      const coverage = hiddenVideo ? stats.videoDrawn / stats.framesEncoded : 1;

      this.lastReport = {
        requestedWidth: width,
        requestedHeight: height,
        requestedFps: fps,
        requestedBitrate: targetBitrate,
        songDuration: totalDuration,
        actualWidth: width,
        actualHeight: height,
        mimeType: 'video/mp4',
        sizeBytes: blob.size,
        recordedSeconds: totalDuration,
        totalFrames: stats.framesEncoded,
        encoderType: 'WebCodecs MP4-Muxer (H.264/AAC)',
        avgDrawFps: fps,
        avgBitrateMbps: (blob.size * 8) / totalDuration / 1e6,
        hasAudioTrack: true,
        backgroundVideoRequested: !!hiddenVideo,
        backgroundVideoCoverage: coverage,
        warnings: [],
      };

      options.onProgress(100, 0);
      return blob;
    } finally {
      videoFrameCache.clear();
      try {
        if (videoEncoder.state !== 'closed') videoEncoder.close();
      } catch {
        // ignore
      }
      try {
        if (audioEncoder.state !== 'closed') audioEncoder.close();
      } catch {
        // ignore
      }
      if (hiddenVideo) {
        hiddenVideo.src = '';
        hiddenVideo.load();
      }
    }
  }

  /**
   * Pipeline 2: Failover Server-Side FFmpeg Engine (/api/transcode-mp4)
   * Menggabungkan video stream ter-render deterministik dengan master WAV audio
   * lewat native FFmpeg libx264 + aac + moov faststart.
   */
  private async exportWithServerFFmpeg(
    options: VideoExportOptions,
    width: number,
    height: number,
    fps: number,
    targetBitrate: number,
    _audioElement?: HTMLAudioElement | null
  ): Promise<Blob> {
    const hiddenCanvas = document.createElement('canvas');
    hiddenCanvas.width = width;
    hiddenCanvas.height = height;

    const ctx = hiddenCanvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D context tidak tersedia.');

    const hiddenVideo = await this.preloadVideo(options.customVideoUrl || options.trackMeta.videoUrl);

    // Normalisasi master audio buffer ke standard stereo 44100Hz
    if (!options.audioBuffer || options.audioBuffer.length === 0) {
      throw new Error('Audio buffer is empty');
    }
    if (options.audioBuffer.duration <= 0) {
      throw new Error('Audio decoding failed. Export cancelled: Audio duration is 0.');
    }

    const normalizedAudioBuffer = await normalizeAudioBufferToStereo44100(options.audioBuffer, options.duration);
    const audioWavBlob = audioBufferToWav(normalizedAudioBuffer, options.duration);

    // Rekam frame-by-frame canvas ke stream
    const stream = hiddenCanvas.captureStream(fps);
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm',
      videoBitsPerSecond: Math.min(targetBitrate, 8_000_000),
    });

    const recordedChunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.start(100);

    const totalDuration = options.duration;
    const totalFrames = Math.max(1, Math.round(totalDuration * fps));
    const videoFrameCache = new VideoFrameCache(5);
    let lastGoodVideoSource: CanvasImageSource | null = null;
    const stats = { framesDrawn: 0, videoDrawn: 0, startTime: performance.now() };
    const renderStartTime = performance.now();

    options.onStart?.();

    let mp4Blob: Blob;

    try {
      for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
        const t = frameIndex / fps;

        // Kunci clock background video ke exact time t. A failed seek reuses only
        // the last successfully decoded video frame; it never falls back to canvas artwork.
        let currentVideoSource: CanvasImageSource | null = null;
        if (hiddenVideo && hiddenVideo.duration > 0) {
          const videoDuration = hiddenVideo.duration;
          const cycleTime = t % videoDuration;
          const safeTime = Math.min(Math.max(0, cycleTime), Math.max(0, videoDuration - 0.04));
          const frameKey = Math.floor(safeTime * fps);

          const cachedBmp = videoFrameCache.get(frameKey);
          if (cachedBmp) {
            currentVideoSource = cachedBmp;
            lastGoodVideoSource = cachedBmp;
            stats.videoDrawn++;
          } else {
            const seekOk = await seekVideo(hiddenVideo, safeTime);
            if (seekOk) {
              try {
                const capturedBmp = await createImageBitmap(hiddenVideo);
                videoFrameCache.set(frameKey, capturedBmp);
                currentVideoSource = capturedBmp;
                lastGoodVideoSource = capturedBmp;
                stats.videoDrawn++;
              } catch {
                // Keep the live element for this frame only; the fallback snapshot
                // must remain an immutable ImageBitmap.
                currentVideoSource = hiddenVideo;
                stats.videoDrawn++;
              }
            } else {
              currentVideoSource = lastGoodVideoSource;
              if (currentVideoSource) stats.videoDrawn++;
            }
          }
        }

        // Sinkronisasi frame animasi PaintingCanvas tiap frame
        if (options.onSeekCanvas) {
          options.onSeekCanvas(t);
        }

        this.renderCompositeFrame(
          ctx,
          width,
          height,
          t,
          totalDuration,
          currentVideoSource,
          options.backgroundCanvas,
          options
        );

      stats.framesDrawn++;

      const elapsedSec = (performance.now() - stats.startTime) / 1000;
      const currentSpeedFps = Math.max(1, Math.round((frameIndex + 1) / Math.max(0.1, elapsedSec)));
      const percent = Math.min(85, Math.round((frameIndex / totalFrames) * 80));
      const secondsLeft = Math.max(0, Math.ceil((totalFrames - frameIndex) / currentSpeedFps));

      options.onProgress(percent, secondsLeft, {
        currentFrame: frameIndex + 1,
        totalFrames,
        fps: currentSpeedFps,
        stage: 'Merekam Frame untuk Server FFmpeg Transcode',
        engine: 'Server FFmpeg (libx264/AAC)',
        elapsedSeconds: Math.floor(elapsedSec),
      });

      // Pace against the target timeline instead of adding render time + a full frame delay.
      const targetElapsedMs = ((frameIndex + 1) / fps) * 1000;
      const actualElapsedMs = performance.now() - renderStartTime;
      const waitMs = targetElapsedMs - actualElapsedMs;

      if (waitMs > 0) {
        await new Promise((r) => setTimeout(r, waitMs));
      } else {
        await yieldMicroTask();
      }
    }

    // Hentikan MediaRecorder dan ambil WebM video blob
    const rawVideoBlob = await new Promise<Blob>((resolve) => {
      mediaRecorder.onstop = () => {
        resolve(new Blob(recordedChunks, { type: 'video/webm' }));
      };
      mediaRecorder.stop();
    });

    options.onProgress(85, 3, {
      currentFrame: totalFrames,
      totalFrames,
      stage: 'Menginisialisasi Chunked Upload ke Server FFmpeg',
      engine: 'Server FFmpeg (libx264/AAC)',
    });

    // Chunked Upload aman proxy (menghindari HTTP 413 Request Entity Too Large pada ingress proxy)
    const CHUNK_SIZE = 3 * 1024 * 1024; // 3 MB per chunk aman di bawah limit 32MB proxy

    // Declared outside the try block so the catch block can read it. Once the
    // server has accepted /finish we must never start a second (legacy) render.
    let finishAccepted = false;

    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    // Marks an error as a temporary condition that is safe to retry.
    const transient = (message: string) => Object.assign(new Error(message), { transient: true });

    try {
      const initResp = await fetch('/api/transcode/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fps, duration: totalDuration }),
      });

      if (!initResp.ok) {
        throw new Error(`Inisialisasi server transcode gagal (HTTP ${initResp.status})`);
      }

      const { sessionId, chunkSize: serverChunkSize } = await initResp.json();
      const activeChunkSize = serverChunkSize || CHUNK_SIZE;

      // Fungsi pembantu upload potongan stream (video / audio)
      const uploadTrackChunks = async (
        blob: Blob,
        type: 'video' | 'audio',
        baseProgress: number,
        progressRange: number,
        label: string
      ) => {
        const totalChunks = Math.ceil(blob.size / activeChunkSize) || 1;
        for (let i = 0; i < totalChunks; i++) {
          const start = i * activeChunkSize;
          const end = Math.min(blob.size, start + activeChunkSize);
          const chunkBlob = blob.slice(start, end);

          const form = new FormData();
          form.append('sessionId', sessionId);
          form.append('type', type);
          form.append('chunkIndex', String(i));
          form.append('chunk', chunkBlob, `${type}-chunk-${i}`);

          // Retry transient failures. The server acknowledges already-stored
          // chunk indexes without appending them again, so retrying is safe.
          const MAX_CHUNK_ATTEMPTS = 4;
          for (let attempt = 1; ; attempt++) {
            try {
              let res: Response;
              try {
                res = await fetch('/api/transcode/chunk', {
                  method: 'POST',
                  body: form,
                });
              } catch (netErr: any) {
                throw transient(`jaringan terputus (${netErr?.message || netErr})`);
              }

              if (res.ok) break;

              const err = await res.text();
              if (res.status >= 500) throw transient(`HTTP ${res.status}: ${err}`);
              throw new Error(`Unggah chunk ${label} (${i + 1}/${totalChunks}) gagal: ${err}`);
            } catch (chunkAttemptErr: any) {
              if (!chunkAttemptErr?.transient || attempt >= MAX_CHUNK_ATTEMPTS) {
                throw chunkAttemptErr?.transient
                  ? new Error(`Unggah chunk ${label} (${i + 1}/${totalChunks}) gagal setelah ${attempt} percobaan: ${chunkAttemptErr.message}`)
                  : chunkAttemptErr;
              }
              options.onProgress(baseProgress + Math.round((i / totalChunks) * progressRange), 2, {
                currentFrame: totalFrames,
                totalFrames,
                stage: `Koneksi tidak stabil, mengulang unggah ${label} (${i + 1}/${totalChunks})...`,
                engine: 'Server FFmpeg (libx264/AAC)',
              });
              await sleep(1000 * 2 ** (attempt - 1));
            }
          }

          const currentPct = baseProgress + Math.round(((i + 1) / totalChunks) * progressRange);
          options.onProgress(currentPct, 2, {
            currentFrame: totalFrames,
            totalFrames,
            stage: `Mengunggah ${label} (${i + 1}/${totalChunks})`,
            engine: 'Server FFmpeg (libx264/AAC)',
          });
        }
        return totalChunks;
      };

      // 1. Unggah potongan video (85% -> 90%)
      const videoChunks = await uploadTrackChunks(rawVideoBlob, 'video', 85, 5, 'Stream Video');

      // 2. Unggah potongan audio master (90% -> 94%)
      const audioChunks = await uploadTrackChunks(audioWavBlob, 'audio', 90, 4, 'Master Audio WAV');

      // 3. Finalisasi dan eksekusi FFmpeg transcoding di server (95% -> 99%)
      options.onProgress(95, 2, {
        currentFrame: totalFrames,
        totalFrames,
        stage: 'Server FFmpeg Merender H.264 + AAC MP4 FastStart...',
        engine: 'Server FFmpeg (libx264/AAC)',
      });

      const finishResp = await fetch('/api/transcode/finish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, fps, duration: totalDuration, videoChunks, audioChunks }),
        });

        if (!finishResp.ok) {
          const errDetail = await finishResp.text();

          // Only a clear missing/unsupported endpoint is allowed to use the
          // legacy path.  A 429/400/500 must NOT trigger a second FFmpeg job.
          if (finishResp.status !== 404 && finishResp.status !== 405) {
            throw new Error(`Server FFmpeg transcoding gagal (HTTP ${finishResp.status}): ${errDetail}`);
          }

          throw Object.assign(
            new Error(`Chunked transcode endpoint tidak tersedia (HTTP ${finishResp.status})`),
            { fallbackToLegacy: true }
          );
        }

        const finishData = await finishResp.json();
        if (!finishData?.sessionId || finishData.sessionId !== sessionId) {
          throw new Error('Server tidak mengembalikan sessionId render yang valid.');
        }

        finishAccepted = true;

        // The finish request is now committed to the server. From this point
        // onward NEVER fall back to /api/transcode-mp4, otherwise a temporary
        // polling/network error could start a duplicate FFmpeg process.
        const POLL_INTERVAL_MS = 3000;
        const RETRY_POLL_INTERVAL_MS = 5000;
        // How long the status endpoint may be unreachable (consecutively)
        // before we give up. The render keeps running on the server meanwhile.
        const POLL_FAILURE_TOLERANCE_MS = 60_000;
        const POLL_TIMEOUT_MS = Math.max(2 * 60 * 60 * 1000, (totalDuration + 60) * 20_000 + 60_000);
        const pollStartedAt = Date.now();
        let renderDone = false;
        let failingSince: number | null = null;

        // One status request. Throws a `transient` error for conditions that
        // are worth retrying (network drop, proxy 502/503/504, garbled body)
        // and a plain Error for permanent ones (400, 404, ...).
        const fetchRenderStatus = async (): Promise<any> => {
          let statusResp: Response;
          try {
            statusResp = await fetch(`/api/transcode/status/${encodeURIComponent(sessionId)}`, {
              cache: 'no-store',
            });
          } catch (statusErr: any) {
            throw transient(`Koneksi saat mengecek status render terputus: ${statusErr?.message || statusErr}`);
          }

          if (!statusResp.ok) {
            const statusDetail = await statusResp.text().catch(() => '');
            if (statusResp.status === 404) {
              throw new Error(
                'Sesi render tidak ditemukan di server. Server kemungkinan dimulai ulang atau sesi sudah kedaluwarsa; silakan ekspor ulang.'
              );
            }
            if ([408, 502, 503, 504].includes(statusResp.status)) {
              throw transient(`Server sementara tidak dapat dijangkau (HTTP ${statusResp.status})`);
            }
            throw new Error(`Gagal mengecek status render (HTTP ${statusResp.status}): ${statusDetail}`);
          }

          try {
            return await statusResp.json();
          } catch {
            throw transient('Respons status render tidak terbaca');
          }
        };

        while (!renderDone) {
          await sleep(failingSince === null ? POLL_INTERVAL_MS : RETRY_POLL_INTERVAL_MS);

          if (Date.now() - pollStartedAt > POLL_TIMEOUT_MS) {
            throw new Error('Menunggu render server terlalu lama. Render mungkin masih berjalan; jangan mulai export kedua untuk session ini.');
          }

          let statusData: any;
          try {
            statusData = await fetchRenderStatus();
            failingSince = null;
          } catch (pollErr: any) {
            if (!pollErr?.transient) throw pollErr;

            if (failingSince === null) failingSince = Date.now();
            if (Date.now() - failingSince > POLL_FAILURE_TOLERANCE_MS) {
              throw new Error(
                `Koneksi ke server terputus lebih dari ${Math.round(POLL_FAILURE_TOLERANCE_MS / 1000)} detik (${pollErr.message}). Render mungkin masih berjalan di server; cek koneksi lalu coba lagi.`
              );
            }

            options.onProgress(95, 2, {
              currentFrame: totalFrames,
              totalFrames,
              stage: 'Koneksi tidak stabil, mencoba menyambung kembali ke server...',
              engine: 'Server FFmpeg (libx264/AAC)',
            });
            continue;
          }

          if (statusData.status === 'error') {
            throw new Error(statusData.error || 'FFmpeg gagal merender video di server.');
          }

          if (statusData.status === 'done') {
            renderDone = true;
            break;
          }

          if (statusData.status !== 'processing') {
            throw new Error(`Status render server tidak dikenal: ${String(statusData.status)}`);
          }

          const elapsedSeconds = Math.round((Date.now() - pollStartedAt) / 1000);
          options.onProgress(Math.min(99, 95 + Math.min(4, Math.floor(elapsedSeconds / 15))), 2, {
            currentFrame: totalFrames,
            totalFrames,
            stage: `Server FFmpeg masih merender... (${elapsedSeconds}s)`,
            engine: 'Server FFmpeg (libx264/AAC)',
          });
        }

        // Download with retry. The server keeps the finished MP4 until it has
        // been delivered completely, so a dropped connection can be retried.
        // Content-Length is compared with the received size to catch truncation.
        const MAX_DOWNLOAD_ATTEMPTS = 3;
        let downloadedBlob: Blob | null = null;
        for (let attempt = 1; downloadedBlob === null; attempt++) {
          try {
            let downloadResp: Response;
            try {
              downloadResp = await fetch(`/api/transcode/download/${encodeURIComponent(sessionId)}`, {
                cache: 'no-store',
              });
            } catch (netErr: any) {
              throw transient(`Koneksi terputus saat mengunduh hasil render: ${netErr?.message || netErr}`);
            }

            if (!downloadResp.ok) {
              const errDetail = await downloadResp.text().catch(() => '');
              const msg = `Gagal mengunduh hasil render server (HTTP ${downloadResp.status}): ${errDetail}`;
              throw downloadResp.status >= 500 ? transient(msg) : new Error(msg);
            }

            const expectedBytes = Number(downloadResp.headers.get('Content-Length') || 0);
            const isEncoded = !!downloadResp.headers.get('Content-Encoding');

            let blob: Blob;
            try {
              blob = await downloadResp.blob();
            } catch (bodyErr: any) {
              throw transient(`Unduhan terputus di tengah jalan: ${bodyErr?.message || bodyErr}`);
            }

            if (!isEncoded && expectedBytes > 0 && blob.size !== expectedBytes) {
              throw transient(`Ukuran unduhan tidak lengkap (${blob.size} dari ${expectedBytes} byte)`);
            }
            downloadedBlob = blob;
          } catch (dlErr: any) {
            if (!dlErr?.transient || attempt >= MAX_DOWNLOAD_ATTEMPTS) throw dlErr;
            options.onProgress(99, 2, {
              currentFrame: totalFrames,
              totalFrames,
              stage: `Unduhan terganggu, mengulang (${attempt}/${MAX_DOWNLOAD_ATTEMPTS - 1})...`,
              engine: 'Server FFmpeg (libx264/AAC)',
            });
            await sleep(2000 * attempt);
          }
        }

        mp4Blob = downloadedBlob;
    } catch (chunkErr: any) {
        if (finishAccepted || !chunkErr?.fallbackToLegacy) {
          throw chunkErr;
        }

        console.warn('[Chunked Upload Legacy Fallback]', chunkErr?.message || chunkErr);

        // Legacy fallback is intentionally restricted to the case where the
        // new endpoint is clearly unavailable. It is never used after /finish
        // has accepted a job, preventing duplicate server-side FFmpeg renders.
        const formData = new FormData();
        formData.append('video', rawVideoBlob, 'video.webm');
        formData.append('audio', audioWavBlob, 'master-audio.wav');
        formData.append('fps', String(fps));
        formData.append('duration', String(totalDuration));

        const legacyResponse = await fetch('/api/transcode-mp4', {
          method: 'POST',
          body: formData,
        });

        if (!legacyResponse.ok) {
          const errDetail = await legacyResponse.text();
          throw new Error(`Server FFmpeg transcoding gagal: ${errDetail}`);
        }

        mp4Blob = await legacyResponse.blob();
      }

    options.onProgress(100, 0);

    this.lastReport = {
      requestedWidth: width,
      requestedHeight: height,
      requestedFps: fps,
      requestedBitrate: targetBitrate,
      songDuration: totalDuration,
      actualWidth: width,
      actualHeight: height,
      mimeType: 'video/mp4',
      sizeBytes: mp4Blob.size,
      recordedSeconds: totalDuration,
      totalFrames: stats.framesDrawn,
      encoderType: 'Server FFmpeg (libx264/AAC)',
      avgDrawFps: fps,
      avgBitrateMbps: (mp4Blob.size * 8) / totalDuration / 1e6,
      hasAudioTrack: true,
      backgroundVideoRequested: !!hiddenVideo,
      backgroundVideoCoverage: hiddenVideo ? stats.videoDrawn / stats.framesDrawn : 1,
      warnings: [],
    };

    return mp4Blob;
    } finally {
      videoFrameCache.clear();
      if (hiddenVideo) {
        hiddenVideo.src = '';
        hiddenVideo.load();
      }
    }
  }

  /**
   * Meng-encode AudioBuffer ke AudioEncoder dalam paket 1024 sample (AAC)
   */
  private async encodeMasterAudioBuffer(
    audioBuffer: AudioBuffer,
    audioEncoder: AudioEncoder,
    duration: number
  ): Promise<void> {
    const sampleRate = audioBuffer.sampleRate;
    const numChannels = audioBuffer.numberOfChannels;

    if (sampleRate !== 44100 || numChannels !== 2) {
      throw new Error(
        `Audio buffer must be normalized to 44100Hz stereo before encoding. Got ${sampleRate}Hz, ${numChannels} channels.`
      );
    }

    const totalSamples = Math.min(audioBuffer.length, Math.floor(duration * 44100));
    const chunkSize = 1024; // Standar frame AAC

    const leftData = audioBuffer.getChannelData(0);
    const rightData = audioBuffer.getChannelData(1);

    for (let offset = 0; offset < totalSamples; offset += chunkSize) {
      while (audioEncoder.encodeQueueSize > 5) {
        await new Promise((r) => setTimeout(r, 6));
      }

      const currentChunkSize = Math.min(chunkSize, totalSamples - offset);
      const planarData = new Float32Array(currentChunkSize * 2);

      // f32-planar: Channel 0 (Left) diikuti Channel 1 (Right)
      planarData.set(leftData.subarray(offset, offset + currentChunkSize), 0);
      planarData.set(rightData.subarray(offset, offset + currentChunkSize), currentChunkSize);

      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate: 44100,
        numberOfFrames: currentChunkSize,
        numberOfChannels: 2,
        timestamp: Math.round((offset / 44100) * 1_000_000), // microseconds
        data: planarData,
      });

      try {
        audioEncoder.encode(audioData);
      } finally {
        audioData.close();
      }
    }
  }

  /**
   * Preload video source jika disediakan
   */
  private async preloadVideo(src?: string | null): Promise<HTMLVideoElement | null> {
    if (!src) return null;
    const vid = document.createElement('video');
    vid.crossOrigin = 'anonymous';
    vid.muted = true;
    vid.playsInline = true;
    vid.preload = 'auto';
    vid.src = src;

    return new Promise<HTMLVideoElement>((resolve) => {
      let resolved = false;
      const onReady = () => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(vid);
        }
      };
      const onError = () => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(vid);
        }
      };
      const cleanup = () => {
        vid.removeEventListener('loadeddata', onReady);
        vid.removeEventListener('canplay', onReady);
        vid.removeEventListener('error', onError);
      };

      vid.addEventListener('loadeddata', onReady);
      vid.addEventListener('canplay', onReady);
      vid.addEventListener('error', onError);
      vid.load();
      setTimeout(onReady, 2500);
    });
  }

  /**
   * Helper function for cubic bezier easing curve (matching Framer Motion [0.25, 1, 0.5, 1] or [0.22, 1, 0.36, 1])
   */
  private cubicBezierEasing(t: number, p1x = 0.25, p1y = 1, p2x = 0.5, p2y = 1): number {
    return solveCubicBezier(t, [p1x, p1y, p2x, p2y]);
  }

  /**
   * Safe setter for ctx.filter across different canvas implementations
   */
  private setCanvasFilter(ctx: CanvasRenderingContext2D, filter: string) {
    setContextFilter(ctx, filter);
  }

  /**
   * Draw backdrop video blurred by 25% opacity
   */
  private drawBackdropVideoBlur(
    ctx: CanvasRenderingContext2D,
    source: CanvasImageSource | null,
    w: number,
    h: number,
    blurRadius: number,
    opacity = 0.25,
    scaleFactor = 1.25
  ) {
    if (!source) return;
    ctx.save();
    ctx.globalAlpha = opacity;
    this.setCanvasFilter(ctx, `blur(${Math.round(blurRadius)}px)`);
    const scaledW = w * scaleFactor;
    const scaledH = h * scaleFactor;
    const offsetX = (w - scaledW) / 2;
    const offsetY = (h - scaledH) / 2;
    this.drawCover(ctx, source, offsetX, offsetY, scaledW, scaledH);
    this.setCanvasFilter(ctx, 'none');
    ctx.restore();
  }

  /**
   * Render fluid auto-scrolling synchronized lyrics list with glow, scale 1.02, accent line,
   * and 0.7s transition duration using lyricCanvasAnimator
   */
  private renderScrollingLyricsList(
    ctx: CanvasRenderingContext2D,
    lyrics: LyricLine[],
    activeIndex: number,
    currentTime: number,
    containerX: number,
    containerY: number,
    containerW: number,
    containerH: number,
    scale: number,
    themeColors: { accent: string; textSub: string; cardBg: string },
    showTranslation: boolean,
    is16x9 = false
  ) {
    if (!lyrics || lyrics.length === 0) return;

    const activeFontSize = is16x9 ? 34 : Math.round(50 * scale);
    const inactFontSize = is16x9 ? 26 : Math.round(38 * scale);
    const subFontSize = is16x9 ? 20 : Math.round(26 * scale);

    // 1. Precalculate deterministic line heights and virtual centers
    const lineHeights: number[] = [];
    const lineCenters: number[] = [];
    let accumY = 0;

    for (let i = 0; i < lyrics.length; i++) {
      const line = lyrics[i];
      const hasTrans = Boolean(showTranslation && line.translation);
      const lh = is16x9
        ? (hasTrans ? 92 : 64)
        : (hasTrans ? Math.round(124 * scale) : Math.round(86 * scale));
      lineHeights.push(lh);
      lineCenters.push(accumY + lh / 2);
      accumY += lh;
    }

    // 2. Smooth deterministic auto-scroll interpolation using lyricCanvasAnimator
    const currentScrollY = computeEasedScrollOffset(
      lineCenters,
      activeIndex,
      currentTime,
      lyrics,
      0.7,
      EXPANDED_LYRICS_MOTION_PRESET.easing
    );

    // Center anchor inside container (42% from top, matching Spotify UI)
    const viewportAnchorY = containerY + containerH * 0.42;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(containerX, containerY, containerW, containerH, Math.round(24 * scale));
    ctx.clip();

    for (let i = 0; i < lyrics.length; i++) {
      const line = lyrics[i];
      const lineY = viewportAnchorY + (lineCenters[i] - currentScrollY);

      // Cull lines far outside viewport
      if (lineY < containerY - 140 || lineY > containerY + containerH + 140) {
        continue;
      }

      const hasTrans = Boolean(showTranslation && line.translation);
      const textX = containerX + (is16x9 ? 28 : Math.round(44 * scale));
      const maxTextW = containerW - (is16x9 ? 56 : Math.round(72 * scale));

      const motion = computeLyricMotionState(
        i,
        activeIndex,
        currentTime,
        lyrics,
        EXPANDED_LYRICS_MOTION_PRESET,
        scale
      );

      // Garis aksen (accent line indicator on left)
      if (motion.accentProgress > 0) {
        const accentLineW = is16x9 ? 4 : Math.round(6 * scale);
        const accentLineH = hasTrans
          ? (is16x9 ? 66 : Math.round(88 * scale))
          : (is16x9 ? 42 : Math.round(58 * scale));
        const accentLineX = containerX + (is16x9 ? 10 : Math.round(18 * scale));
        const accentLineY = lineY - (is16x9 ? 28 : Math.round(36 * scale));

        ctx.save();
        ctx.globalAlpha = motion.accentProgress;
        ctx.fillStyle = themeColors.accent;
        ctx.beginPath();
        ctx.roundRect(accentLineX, accentLineY, accentLineW, accentLineH, Math.round(3 * scale));
        ctx.fill();
        ctx.restore();
      }

      // Draw lyric text with canvas motion (opacity, scale, glow, and blur)
      applyCanvasMotion(ctx, motion, textX, lineY, () => {
        const isCurrentOrPrev = i === activeIndex || i === activeIndex - 1;
        const baseFontSize = isCurrentOrPrev ? activeFontSize : inactFontSize;
        ctx.textAlign = 'left';
        ctx.fillStyle = i === activeIndex ? '#ffffff' : (i < activeIndex ? 'rgba(255, 255, 255, 0.95)' : '#ffffff');
        ctx.font = `${isCurrentOrPrev ? 'bold' : '600'} ${baseFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        this.drawTruncatedText(ctx, line.text, textX, lineY, maxTextW);

        if (hasTrans && line.translation) {
          ctx.shadowBlur = 0;
          ctx.fillStyle = i === activeIndex ? themeColors.textSub : (i < activeIndex ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.6)');
          ctx.font = `500 ${Math.round(subFontSize)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
          this.drawTruncatedText(
            ctx,
            line.translation,
            textX,
            lineY + (is16x9 ? 34 : Math.round(44 * scale)),
            maxTextW
          );
        }
      });
    }

    ctx.restore();
  }

  /**
   * Render Now Playing bottom lyrics card with 0.6s cross-fade, slide, and blur using lyricCanvasAnimator
   */
  private renderNowPlayingLyricsCard(
    ctx: CanvasRenderingContext2D,
    lyrics: LyricLine[],
    activeIndex: number,
    currentTime: number,
    contentX: number,
    cardY: number,
    contentW: number,
    cardH: number,
    scale: number,
    themeColors: { accent: string; textSub: string; cardBg: string },
    showTranslation: boolean
  ) {
    // Card background
    ctx.fillStyle = themeColors.cardBg;
    ctx.beginPath();
    ctx.roundRect(contentX, cardY, contentW, cardH, Math.round(28 * scale));
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Card header
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(22 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText('LIRIK', contentX + Math.round(32 * scale), cardY + Math.round(42 * scale));

    if (showTranslation) {
      const badgeX = contentX + Math.round(112 * scale);
      const badgeY = cardY + Math.round(26 * scale);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, Math.round(76 * scale), Math.round(22 * scale), Math.round(6 * scale));
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.font = `600 ${Math.round(13 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.fillText('Bilingual', badgeX + Math.round(10 * scale), badgeY + Math.round(16 * scale));
    }

    // Card maximize hint
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.font = `600 ${Math.round(17 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText('Perbesar ↗', contentX + contentW - Math.round(28 * scale), cardY + Math.round(42 * scale));

    const activeLine = lyrics[activeIndex];
    const textBaseX = contentX + Math.round(32 * scale);
    const maxTextW = contentW - Math.round(64 * scale);
    const lineTargetY = cardY + Math.round(100 * scale);

    // 1. Exiting previous line if in transition
    if (activeIndex > 0 && lyrics[activeIndex - 1]) {
      const prevLine = lyrics[activeIndex - 1];
      const prevMotion = computeLyricMotionState(
        activeIndex - 1,
        activeIndex,
        currentTime,
        lyrics,
        NOW_PLAYING_MOTION_PRESET,
        scale
      );

      applyCanvasMotion(ctx, prevMotion, textBaseX, lineTargetY, () => {
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(32 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        this.drawTruncatedText(ctx, prevLine.text, textBaseX, lineTargetY, maxTextW);

        if (showTranslation && prevLine.translation) {
          ctx.fillStyle = themeColors.textSub;
          ctx.font = `500 ${Math.round(20 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
          this.drawTruncatedText(
            ctx,
            prevLine.translation,
            textBaseX,
            lineTargetY + Math.round(30 * scale),
            maxTextW
          );
        }
      });
    }

    // 2. Entering active line with cross-fade, slide, and blur (0.6s)
    if (activeLine) {
      const activeMotion = computeLyricMotionState(
        activeIndex,
        activeIndex,
        currentTime,
        lyrics,
        NOW_PLAYING_MOTION_PRESET,
        scale
      );

      applyCanvasMotion(ctx, activeMotion, textBaseX, lineTargetY, () => {
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(32 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        this.drawTruncatedText(ctx, activeLine.text, textBaseX, lineTargetY, maxTextW);

        if (showTranslation && activeLine.translation) {
          ctx.fillStyle = themeColors.textSub;
          ctx.font = `500 ${Math.round(20 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
          this.drawTruncatedText(
            ctx,
            activeLine.translation,
            textBaseX,
            lineTargetY + Math.round(30 * scale),
            maxTextW
          );
        }
      });
    }

    // 3. Upcoming next line preview
    const nextLine = lyrics[activeIndex + 1];
    if (nextLine) {
      const nextY =
        lineTargetY +
        (showTranslation && activeLine?.translation
          ? Math.round(62 * scale)
          : Math.round(44 * scale));

      if (nextY < cardY + cardH - Math.round(16 * scale)) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffffff';
        ctx.font = `600 ${Math.round(23 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        this.drawTruncatedText(ctx, nextLine.text, textBaseX, nextY, maxTextW);
        ctx.restore();
      }
    }
  }

  /**
   * Render Canvas Subtitles pill with backdrop-blur and 0.6s cross-fade, slide, and blur using lyricCanvasAnimator
   */
  private renderCanvasSubtitlesPill(
    ctx: CanvasRenderingContext2D,
    lyrics: LyricLine[],
    activeIndex: number,
    currentTime: number,
    contentX: number,
    pillY: number,
    contentW: number,
    pillH: number,
    scale: number,
    themeColors: { accent: string; textSub: string },
    showTranslation: boolean,
    source: CanvasImageSource | null,
    w: number,
    h: number
  ) {
    const pillRadius = Math.round(26 * scale);

    // 1. True Backdrop-Blur underneath the pill
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(contentX, pillY, contentW, pillH, pillRadius);
    ctx.clip();

    if (source) {
      this.setCanvasFilter(ctx, `blur(${Math.round(20 * scale)}px)`);
      this.drawCover(ctx, source, 0, 0, w, h);
      this.setCanvasFilter(ctx, 'none');
    }

    // Semi-transparent dark glass fill
    ctx.fillStyle = 'rgba(0, 0, 0, 0.76)';
    ctx.fillRect(contentX, pillY, contentW, pillH);
    ctx.restore();

    // 2. Pill border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(contentX, pillY, contentW, pillH, pillRadius);
    ctx.stroke();

    // 3. Pill Top Tag: "LIRIK SEDANG DIPUTAR"
    ctx.textAlign = 'center';
    ctx.fillStyle = themeColors.accent;
    ctx.font = `bold ${Math.round(18 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText('LIRIK SEDANG DIPUTAR', w / 2, pillY + Math.round(30 * scale));

    const activeLine = lyrics[activeIndex];
    const hasTrans = Boolean(showTranslation && activeLine?.translation);
    const textTargetY = pillY + (hasTrans ? Math.round(68 * scale) : Math.round(82 * scale));
    const maxTextW = contentW - Math.round(48 * scale);

    // 4. Exiting line with exit cross-fade, slide, and blur (0.6s)
    if (activeIndex > 0 && lyrics[activeIndex - 1]) {
      const prevLine = lyrics[activeIndex - 1];
      const prevMotion = computeLyricMotionState(
        activeIndex - 1,
        activeIndex,
        currentTime,
        lyrics,
        CANVAS_SUBTITLES_MOTION_PRESET,
        scale
      );

      applyCanvasMotion(ctx, prevMotion, w / 2, textTargetY, () => {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(32 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        this.drawTruncatedText(ctx, prevLine.text, w / 2, textTargetY, maxTextW, true);

        if (showTranslation && prevLine.translation) {
          ctx.fillStyle = themeColors.textSub;
          ctx.font = `600 ${Math.round(20 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
          this.drawTruncatedText(
            ctx,
            prevLine.translation,
            w / 2,
            textTargetY + Math.round(26 * scale),
            maxTextW,
            true
          );
        }
      });
    }

    // 5. Entering active line with cross-fade, slide, and blur (0.6s)
    if (activeLine) {
      const activeMotion = computeLyricMotionState(
        activeIndex,
        activeIndex,
        currentTime,
        lyrics,
        CANVAS_SUBTITLES_MOTION_PRESET,
        scale
      );

      applyCanvasMotion(ctx, activeMotion, w / 2, textTargetY, () => {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(32 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        this.drawTruncatedText(ctx, activeLine.text, w / 2, textTargetY, maxTextW, true);

        if (showTranslation && activeLine.translation) {
          ctx.fillStyle = themeColors.textSub;
          ctx.font = `600 ${Math.round(20 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
          this.drawTruncatedText(
            ctx,
            activeLine.translation,
            w / 2,
            textTargetY + Math.round(26 * scale),
            maxTextW,
            true
          );
        }
      });
    }

    // 6. Next line indicator at bottom of pill
    const nextLine = lyrics[activeIndex + 1];
    if (nextLine) {
      const dividerY = pillY + pillH - Math.round(34 * scale);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(contentX + Math.round(24 * scale), dividerY);
      ctx.lineTo(contentX + contentW - Math.round(24 * scale), dividerY);
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.40)';
      ctx.font = `600 ${Math.round(17 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      this.drawTruncatedText(
        ctx,
        `Selanjutnya: ${nextLine.text}`,
        w / 2,
        dividerY + Math.round(22 * scale),
        maxTextW,
        true
      );
    }
  }

  /**
   * Render frame gabungan Spotify (16:9, 1:1, atau 9:16)
   */
  public renderCompositeFrame(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    currentTime: number,
    duration: number,
    video: CanvasImageSource | null,
    backgroundCanvas: HTMLCanvasElement | null | undefined,
    options: VideoExportOptions
  ) {
    const {
      trackMeta,
      lyrics,
      displayMode,
      aspectRatio = '9:16',
      showTranslation = true,
      theme = 'emerald',
    } = options;

    const themeColors = THEME_PALETTES[theme] || THEME_PALETTES.emerald;
    const activeIndex = findActiveLyricIndex(lyrics, currentTime);

    // A custom video is authoritative. While it is configured, PaintingCanvas
    // and artwork are NEVER valid fallbacks for a missing video frame.
    const customVideoActive = Boolean(options.customVideoUrl || options.trackMeta.videoUrl);
    let mediaSource: CanvasImageSource | null = null;
    if (video) {
      if ('videoWidth' in video) {
        const vid = video as HTMLVideoElement;
        if (vid.videoWidth > 0 || vid.readyState >= 2) mediaSource = vid;
      } else {
        mediaSource = video;
      }
    } else if (!customVideoActive && backgroundCanvas && backgroundCanvas.width > 0) {
      mediaSource = backgroundCanvas;
    }

    // 1. Draw Spotify Gradient Base Background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, themeColors.bgStart);
    bgGrad.addColorStop(0.4, themeColors.bgMid);
    bgGrad.addColorStop(1, themeColors.bgEnd);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // ==============================================================
    // LAYOUT 1: 16:9 LANDSCAPE (SPOTIFY DESKTOP WEB PLAYER)
    // ==============================================================
    if (aspectRatio === '16:9') {
      // If expanded_lyrics mode in 16:9, render backdrop video blur 25%
      if (displayMode === 'expanded_lyrics') {
        this.drawBackdropVideoBlur(ctx, mediaSource, w, h, 36, 0.25, 1.25);
      }

      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('SPOTIFY WEB PLAYER', 80, 65);

      ctx.fillStyle = '#ffffff';
      ctx.font = '600 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(trackMeta.album || 'Nocturne Collection', w - 80, 65);

      const mediaSize = Math.round(h * 0.58);
      const mediaX = 80;
      const mediaY = 110;

      this.drawMediaSource(ctx, video, backgroundCanvas, mediaX, mediaY, mediaSize, mediaSize, 28, customVideoActive);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 40px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      this.drawTruncatedText(ctx, trackMeta.title, mediaX, mediaY + mediaSize + 55, mediaSize);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.font = '500 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      this.drawTruncatedText(ctx, trackMeta.artist, mediaX, mediaY + mediaSize + 95, mediaSize);

      const panelX = mediaX + mediaSize + 60;
      const panelY = 110;
      const panelW = w - panelX - 80;
      const panelH = Math.round(h * 0.68);

      // Scrolling Lyrics Container on Desktop Right Column
      ctx.fillStyle = themeColors.cardBg;
      ctx.beginPath();
      ctx.roundRect(panelX, panelY, panelW, panelH, 28);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Fluid auto-scrolling lyrics list with glow textShadow, scale 1.02, accent line, and 0.7s transition
      this.renderScrollingLyricsList(
        ctx,
        lyrics,
        activeIndex,
        currentTime,
        panelX + 16,
        panelY + 16,
        panelW - 32,
        panelH - 32,
        1.0,
        themeColors,
        showTranslation,
        true
      );

      const scrubY = h - 90;
      const scrubX = 80;
      const scrubW = w - 160;
      const progress = duration > 0 ? currentTime / duration : 0;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.roundRect(scrubX, scrubY, scrubW, 8, 4);
      ctx.fill();

      ctx.fillStyle = themeColors.accent;
      ctx.beginPath();
      ctx.roundRect(scrubX, scrubY, scrubW * progress, 8, 4);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(scrubX + scrubW * progress, scrubY + 4, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.font = '500 20px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(formatPlayerTime(currentTime), scrubX, scrubY + 32);
      ctx.textAlign = 'right';
      ctx.fillText(formatPlayerTime(duration), scrubX + scrubW, scrubY + 32);
      return;
    }

    // ==============================================================
    // LAYOUT 2: 1:1 SQUARE (SPOTIFY FEED POST & EXPANDED LYRICS)
    // ==============================================================
    if (aspectRatio === '1:1') {
      if (displayMode === 'expanded_lyrics') {
        // Dedicated 1:1 Fullscreen Expanded Scrolling Lyrics
        this.drawBackdropVideoBlur(ctx, mediaSource, w, h, 28, 0.25, 1.25);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = '600 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SEDANG MEMUTAR DARI PLAYLIST', w / 2, 52);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(`${trackMeta.title} • ${trackMeta.artist}`, w / 2, 86);

        // Fluid auto-scrolling lyrics list across full width
        const scrollX = Math.round(w * 0.08);
        const scrollY = 110;
        const scrollW = w - scrollX * 2;
        const scrollH = h - 230;

        this.renderScrollingLyricsList(
          ctx,
          lyrics,
          activeIndex,
          currentTime,
          scrollX,
          scrollY,
          scrollW,
          scrollH,
          1.0,
          themeColors,
          showTranslation,
          false
        );

        const barY = h - 90;
        const barX = scrollX;
        const barW = scrollW;
        const progress = duration > 0 ? currentTime / duration : 0;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW, 8, 4);
        ctx.fill();

        ctx.fillStyle = themeColors.accent;
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW * progress, 8, 4);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(barX + barW * progress, barY + 4, 10, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.font = '500 20px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(formatPlayerTime(currentTime), barX, barY + 34);
        ctx.textAlign = 'right';
        ctx.fillText(formatPlayerTime(duration), barX + barW, barY + 34);
        return;
      }

      // 1:1 Now Playing Split View
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '600 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SEDANG MEMUTAR DARI PLAYLIST', w / 2, 55);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(trackMeta.album || 'Nocturne Collection', w / 2, 90);

      const sqSize = Math.round(w * 0.42);
      const sqX = Math.round(w * 0.06);
      const sqY = 135;

      this.drawMediaSource(ctx, video, backgroundCanvas, sqX, sqY, sqSize, sqSize, 24, customVideoActive);

      const lyrX = sqX + sqSize + Math.round(w * 0.04);
      const lyrY = 135;
      const lyrW = w - lyrX - sqX;
      const lyrH = sqSize;

      // Render Synced Lyrics Card with 0.6s Cross-Fade, Slide, and Blur
      this.renderNowPlayingLyricsCard(
        ctx,
        lyrics,
        activeIndex,
        currentTime,
        lyrX,
        lyrY,
        lyrW,
        lyrH,
        1.0,
        themeColors,
        showTranslation
      );

      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 38px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      this.drawTruncatedText(ctx, trackMeta.title, sqX, sqY + sqSize + 60, w - sqX * 2);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.font = '500 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      this.drawTruncatedText(ctx, trackMeta.artist, sqX, sqY + sqSize + 100, w - sqX * 2);

      const barY = h - 160;
      const barX = sqX;
      const barW = w - sqX * 2;
      const progress = duration > 0 ? currentTime / duration : 0;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, 8, 4);
      ctx.fill();

      ctx.fillStyle = themeColors.accent;
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW * progress, 8, 4);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(barX + barW * progress, barY + 4, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.font = '500 20px monospace';
      ctx.fillText(formatPlayerTime(currentTime), barX, barY + 34);
      ctx.textAlign = 'right';
      ctx.fillText(formatPlayerTime(duration), barX + barW, barY + 34);

      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = '500 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('Spotify Feed Post', w / 2, h - 35);
      return;
    }

    // ==============================================================
    // LAYOUT 3: 9:16 VERTICAL SPOTIFY (3 DEDICATED BRANCHES)
    // ==============================================================
    const scale = w / 1080;

    // --------------------------------------------------------------
    // BRANCH 3A: EXPANDED FULLSCREEN SPOTIFY LYRICS (9:16)
    // --------------------------------------------------------------
    if (displayMode === 'expanded_lyrics') {
      // 1. Backdrop Video Blur 25% (scale 125%, blur 32px)
      this.drawBackdropVideoBlur(ctx, mediaSource, w, h, 32 * scale, 0.25, 1.25);

      // 2. Active Track Header Badge
      const headerY = Math.round(75 * scale);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(38 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      this.drawTruncatedText(ctx, trackMeta.title, Math.round(80 * scale), headerY, Math.round(w * 0.65));

      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = `500 ${Math.round(26 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      this.drawTruncatedText(ctx, trackMeta.artist, Math.round(80 * scale), headerY + Math.round(42 * scale), Math.round(w * 0.65));

      if (showTranslation) {
        const badgeX = w - Math.round(210 * scale);
        const badgeY = headerY - Math.round(20 * scale);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.beginPath();
        ctx.roundRect(badgeX, badgeY, Math.round(130 * scale), Math.round(40 * scale), Math.round(10 * scale));
        ctx.fill();
        ctx.fillStyle = themeColors.accent;
        ctx.font = `bold ${Math.round(20 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('Bilingual', badgeX + Math.round(65 * scale), badgeY + Math.round(27 * scale));
      }

      // Top divider line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(Math.round(80 * scale), headerY + Math.round(70 * scale));
      ctx.lineTo(w - Math.round(80 * scale), headerY + Math.round(70 * scale));
      ctx.stroke();

      // 3. Fluid Auto-Scrolling Synchronized Lyrics List
      const lyricsContainerX = Math.round(w * 0.08);
      const lyricsContainerY = headerY + Math.round(90 * scale);
      const lyricsContainerW = Math.round(w * 0.84);
      const lyricsContainerH = Math.round(h * 0.73);

      this.renderScrollingLyricsList(
        ctx,
        lyrics,
        activeIndex,
        currentTime,
        lyricsContainerX,
        lyricsContainerY,
        lyricsContainerW,
        lyricsContainerH,
        scale,
        themeColors,
        showTranslation,
        false
      );

      // 4. Bottom Compact Mini-Player Scrubber & Controls
      const scrubX = Math.round(80 * scale);
      const scrubY = h - Math.round(140 * scale);
      const scrubW = w - scrubX * 2 - Math.round(80 * scale);
      const progress = duration > 0 ? currentTime / duration : 0;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.roundRect(scrubX, scrubY, scrubW, Math.round(8 * scale), Math.round(4 * scale));
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(scrubX, scrubY, scrubW * progress, Math.round(8 * scale), Math.round(4 * scale));
      ctx.fill();

      ctx.beginPath();
      ctx.arc(scrubX + scrubW * progress, scrubY + Math.round(4 * scale), Math.round(8 * scale), 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.font = `500 ${Math.round(22 * scale)}px monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(formatPlayerTime(currentTime), scrubX, scrubY + Math.round(36 * scale));
      ctx.textAlign = 'right';
      ctx.fillText(formatPlayerTime(duration), scrubX + scrubW, scrubY + Math.round(36 * scale));

      // Mini play button icon circle
      const playBtnX = w - Math.round(110 * scale);
      const playBtnY = scrubY + Math.round(4 * scale);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(playBtnX, playBtnY, Math.round(26 * scale), 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.moveTo(playBtnX - Math.round(6 * scale), playBtnY - Math.round(10 * scale));
      ctx.lineTo(playBtnX + Math.round(12 * scale), playBtnY);
      ctx.lineTo(playBtnX - Math.round(6 * scale), playBtnY + Math.round(10 * scale));
      ctx.closePath();
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = `500 ${Math.round(18 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.fillText('Spotify Fullscreen Lyrics', w / 2, h - Math.round(28 * scale));
      return;
    }

    // --------------------------------------------------------------
    // BRANCH 3B: CANVAS SUBTITLES (9:16)
    // --------------------------------------------------------------
    if (displayMode === 'canvas_subtitles') {
      this.drawMediaSource(ctx, video, backgroundCanvas, 0, 0, w, h, 0, customVideoActive);

      const vig = ctx.createLinearGradient(0, 0, 0, h);
      vig.addColorStop(0, 'rgba(0,0,0,0.65)');
      vig.addColorStop(0.35, 'rgba(0,0,0,0.1)');
      vig.addColorStop(0.65, 'rgba(0,0,0,0.25)');
      vig.addColorStop(1, 'rgba(0,0,0,0.88)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);

      // Top bar
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = `600 ${Math.round(22 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('SEDANG MEMUTAR DARI PLAYLIST', w / 2, Math.round(85 * scale));

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(28 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.fillText(trackMeta.album || 'Nocturne Collection', w / 2, Math.round(128 * scale));

      // Floating Subtitles Pill with Backdrop-Blur and 0.6s Cross-Fade, Slide, and Blur
      const pillContentX = Math.round(w * 0.08);
      const pillW = Math.round(w * 0.84);
      const pillY = Math.round(h * 0.73);
      const pillH = Math.round(175 * scale);

      this.renderCanvasSubtitlesPill(
        ctx,
        lyrics,
        activeIndex,
        currentTime,
        pillContentX,
        pillY,
        pillW,
        pillH,
        scale,
        themeColors,
        showTranslation,
        mediaSource,
        w,
        h
      );

      // Bottom Meta & Mini Scrubber
      const metaY = Math.round(h * 0.885);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(34 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      this.drawTruncatedText(ctx, trackMeta.title, pillContentX, metaY, pillW - 70);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.font = `500 ${Math.round(24 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      this.drawTruncatedText(ctx, trackMeta.artist, pillContentX, metaY + Math.round(36 * scale), pillW - 70);

      const progressY = Math.round(h * 0.935);
      const progress = duration > 0 ? currentTime / duration : 0;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.roundRect(pillContentX, progressY, pillW, Math.round(6 * scale), Math.round(3 * scale));
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(pillContentX, progressY, pillW * progress, Math.round(6 * scale), Math.round(3 * scale));
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = `500 ${Math.round(18 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Spotify Canvas Subtitles', w / 2, h - Math.round(24 * scale));
      return;
    }

    // --------------------------------------------------------------
    // BRANCH 3C: NOW PLAYING WITH ARTWORK + BOTTOM LYRICS CARD (9:16)
    // --------------------------------------------------------------
    const cardSize = Math.round(w * 0.82);
    const cardX = (w - cardSize) / 2;
    const cardY = Math.round(h * 0.11);

    this.drawMediaSource(
      ctx,
      video,
      backgroundCanvas,
      cardX,
      cardY,
      cardSize,
      cardSize,
      Math.round(36 * scale),
      customVideoActive
    );

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = `600 ${Math.round(22 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('SEDANG MEMUTAR DARI PLAYLIST', w / 2, Math.round(85 * scale));

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(28 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText(trackMeta.album || 'Nocturne Collection', w / 2, Math.round(128 * scale));

    const titleY = Math.round(h * 0.6);
    const contentX = Math.round(w * 0.09);
    const contentW = Math.round(w * 0.82);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(48 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    this.drawTruncatedText(ctx, trackMeta.title, contentX, titleY, contentW - 70);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.font = `500 ${Math.round(32 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    this.drawTruncatedText(ctx, trackMeta.artist, contentX, titleY + Math.round(48 * scale), contentW - 70);

    ctx.fillStyle = themeColors.accent;
    ctx.beginPath();
    ctx.arc(
      contentX + contentW - Math.round(24 * scale),
      titleY + Math.round(12 * scale),
      Math.round(20 * scale),
      0,
      Math.PI * 2
    );
    ctx.fill();

    const progressY = Math.round(h * 0.68);
    const progress = duration > 0 ? currentTime / duration : 0;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.roundRect(contentX, progressY, contentW, Math.round(8 * scale), Math.round(4 * scale));
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(
      contentX,
      progressY,
      contentW * progress,
      Math.round(8 * scale),
      Math.round(4 * scale)
    );
    ctx.fill();

    ctx.beginPath();
    ctx.arc(
      contentX + contentW * progress,
      progressY + Math.round(4 * scale),
      Math.round(9 * scale),
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.font = `500 ${Math.round(22 * scale)}px monospace`;
    ctx.fillText(formatPlayerTime(currentTime), contentX, progressY + Math.round(38 * scale));
    ctx.textAlign = 'right';
    ctx.fillText(formatPlayerTime(duration), contentX + contentW, progressY + Math.round(38 * scale));

    // Bottom Spotify Lyrics Card with 0.6s Cross-Fade, Slide, and Blur
    const lyricsCardY = Math.round(h * 0.74);
    const lyricsCardH = Math.round(h * 0.22);

    this.renderNowPlayingLyricsCard(
      ctx,
      lyrics,
      activeIndex,
      currentTime,
      contentX,
      lyricsCardY,
      contentW,
      lyricsCardH,
      scale,
      themeColors,
      showTranslation
    );

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = `500 ${Math.round(18 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText('Spotify Now Playing', w / 2, h - Math.round(28 * scale));
  }

  private drawMediaSource(
    ctx: CanvasRenderingContext2D,
    video: CanvasImageSource | null,
    backgroundCanvas: HTMLCanvasElement | null | undefined,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    borderRadius = 0,
    customVideoActive = false
  ) {
    let source: CanvasImageSource | null = null;

    if (video) {
      if ('videoWidth' in video) {
        const vid = video as HTMLVideoElement;
        if (vid.videoWidth > 0 || vid.readyState >= 2) {
          source = vid;
        }
      } else {
        source = video;
      }
    } else if (!customVideoActive && backgroundCanvas && backgroundCanvas.width > 0) {
      // PaintingCanvas is only a legitimate source when no custom video is active.
      source = backgroundCanvas;
    }

    if (borderRadius > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(dx, dy, dw, dh, borderRadius);
      ctx.clip();
    }

    if (source) {
      this.drawCover(ctx, source, dx, dy, dw, dh);
    } else {
      const grad = ctx.createLinearGradient(dx, dy, dx + dw, dy + dh);
      grad.addColorStop(0, '#1c1c24');
      grad.addColorStop(1, '#0b0b0f');
      ctx.fillStyle = grad;
      ctx.fillRect(dx, dy, dw, dh);
    }

    if (borderRadius > 0) {
      ctx.restore();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = Math.max(1, Math.round(dw * 0.003));
      ctx.beginPath();
      ctx.roundRect(dx, dy, dw, dh, borderRadius);
      ctx.stroke();
    }
  }

  private drawCover(
    ctx: CanvasRenderingContext2D,
    source: CanvasImageSource,
    dx: number,
    dy: number,
    dw: number,
    dh: number
  ) {
    const sw =
      (source as HTMLVideoElement).videoWidth ||
      (source as HTMLImageElement).naturalWidth ||
      (source as HTMLCanvasElement).width ||
      (source as ImageBitmap).width ||
      dw;
    const sh =
      (source as HTMLVideoElement).videoHeight ||
      (source as HTMLImageElement).naturalHeight ||
      (source as HTMLCanvasElement).height ||
      (source as ImageBitmap).height ||
      dh;

    if (!sw || !sh) {
      ctx.drawImage(source, dx, dy, dw, dh);
      return;
    }

    const srcAspect = sw / sh;
    const dstAspect = dw / dh;

    let sx = 0;
    let sy = 0;
    let sWidth = sw;
    let sHeight = sh;

    if (srcAspect > dstAspect) {
      sWidth = sh * dstAspect;
      sx = (sw - sWidth) / 2;
    } else {
      sHeight = sw / dstAspect;
      sy = (sh - sHeight) / 2;
    }

    ctx.drawImage(source, sx, sy, sWidth, sHeight, dx, dy, dw, dh);
  }

  private drawTruncatedText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    isCentered = false
  ) {
    if (!text) return;
    let currentText = text;
    let metrics = ctx.measureText(currentText);

    if (metrics.width > maxWidth) {
      while (currentText.length > 3 && metrics.width > maxWidth) {
        currentText = currentText.slice(0, -1);
        metrics = ctx.measureText(currentText + '...');
      }
      currentText += '...';
    }

    ctx.fillText(currentText, x, y);
  }

  public downloadBlob(blob: Blob, filename = 'spotify-video-lirik.mp4') {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2500);
  }
}
