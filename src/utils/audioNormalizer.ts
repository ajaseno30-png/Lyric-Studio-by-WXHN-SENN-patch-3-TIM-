/**
 * Deterministic Audio Buffer Normalizer
 *
 * Menjamin bahwa AudioBuffer yang masuk ke encoder (WebCodecs / WAV / FFmpeg)
 * selalu memenuhi standar produksi yang seragam:
 * - Sample Rate: Tepat 44.100 Hz
 * - Channel: Tepat 2 (Stereo)
 *   * Jika Mono: L = mono, R = mono (upmix bersih)
 *   * Jika Stereo: L = original L, R = original R
 * - Format: PCM Float32 (-1.0 s/d 1.0)
 * - Durasi: Konsisten penuh dengan target durasi master timeline
 */

export async function normalizeAudioBuffer(
  originalBuffer: AudioBuffer,
  targetDurationSec: number
): Promise<AudioBuffer> {
  if (!originalBuffer || originalBuffer.length === 0 || originalBuffer.duration <= 0) {
    throw new Error('Audio decoding failed. Export cancelled: Audio buffer is empty or invalid.');
  }

  const TARGET_SAMPLE_RATE = 44100;
  const TARGET_CHANNELS = 2;
  const targetSamples = Math.max(1, Math.round(targetDurationSec * TARGET_SAMPLE_RATE));

  // 1. Coba normalisasi menggunakan OfflineAudioContext (C++ native hardware resampler & channel mixer)
  try {
    const OfflineCtx =
      window.OfflineAudioContext ||
      (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;

    if (OfflineCtx) {
      const offlineCtx = new OfflineCtx(TARGET_CHANNELS, targetSamples, TARGET_SAMPLE_RATE);
      const source = offlineCtx.createBufferSource();
      source.buffer = originalBuffer;

      // Web Audio API standar secara otomatis melakukan upmix mono (1ch) -> stereo (2ch)
      // dengan mendistribusikan sinyal secara simetris ke L dan R (channelInterpretation = 'speakers').
      source.connect(offlineCtx.destination);
      source.start(0);

      const renderedBuffer = await offlineCtx.startRendering();

      // Validasi ketat hasil normalisasi
      validateBuffer(renderedBuffer, TARGET_SAMPLE_RATE, TARGET_CHANNELS, targetSamples);
      return renderedBuffer;
    }
  } catch (err) {
    console.warn('[AudioNormalizer] OfflineAudioContext gagal, beralih ke pure Float32 resampler:', err);
  }

  // 2. Fallback Pure PCM Resampler & Stereo Upmixer (Deterministik jika OfflineAudioContext tidak tersedia)
  const fallbackBuffer = resampleAndUpmixPure(originalBuffer, targetSamples, TARGET_SAMPLE_RATE);
  validateBuffer(fallbackBuffer, TARGET_SAMPLE_RATE, TARGET_CHANNELS, targetSamples);
  return fallbackBuffer;
}

/**
 * Validasi tegas hasil normalisasi sebelum diserahkan ke encoder
 */
function validateBuffer(
  buffer: AudioBuffer,
  expectedSampleRate: number,
  expectedChannels: number,
  expectedMinSamples: number
): void {
  if (buffer.sampleRate !== expectedSampleRate) {
    throw new Error(
      `Audio normalization failed: expected sample rate ${expectedSampleRate} Hz, got ${buffer.sampleRate} Hz`
    );
  }
  if (buffer.numberOfChannels !== expectedChannels) {
    throw new Error(
      `Audio normalization failed: expected ${expectedChannels} channels (stereo), got ${buffer.numberOfChannels} channels`
    );
  }
  if (buffer.length === 0 || buffer.duration <= 0) {
    throw new Error('Audio normalization failed: rendered buffer duration is zero or empty.');
  }
}

/**
 * Pure Float32 Linear Interpolation Resampler & Stereo Upmixer
 */
function resampleAndUpmixPure(
  src: AudioBuffer,
  targetLength: number,
  targetSampleRate: number
): AudioBuffer {
  // Buat AudioBuffer mock/real
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const destBuffer = ctx.createBuffer(2, targetLength, targetSampleRate);
  if (ctx.state !== 'closed') ctx.close().catch(() => {});

  const destL = destBuffer.getChannelData(0);
  const destR = destBuffer.getChannelData(1);

  const srcChannels = src.numberOfChannels;
  const srcL = src.getChannelData(0);
  const srcR = srcChannels > 1 ? src.getChannelData(1) : srcL; // Upmix mono: L=mono, R=mono

  const ratio = src.sampleRate / targetSampleRate;
  const srcLen = src.length;

  for (let i = 0; i < targetLength; i++) {
    const srcIndex = i * ratio;
    const indexFloor = Math.floor(srcIndex);
    const indexCeil = Math.min(srcLen - 1, indexFloor + 1);
    const frac = srcIndex - indexFloor;

    if (indexFloor < srcLen) {
      destL[i] = srcL[indexFloor] * (1 - frac) + (srcL[indexCeil] || 0) * frac;
      destR[i] = srcR[indexFloor] * (1 - frac) + (srcR[indexCeil] || 0) * frac;
    } else {
      destL[i] = 0; // Pad dengan keheningan jika audio asli lebih pendek dari target
      destR[i] = 0;
    }
  }

  return destBuffer;
}
