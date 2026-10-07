/**
 * Audio Normalization Service
 * Menormalisasi AudioBuffer dari berbagai konfigurasi (mono/stereo, 44.1kHz, 48kHz, 96kHz, dll.)
 * menjadi format standar produksi:
 * - sampleRate: 44100 Hz
 * - numberOfChannels: 2 (stereo)
 * - PCM Float32
 * - duration konsisten secara deterministik dengan master timeline
 */

export async function normalizeAudioBufferToStereo44100(
  input: AudioBuffer,
  targetDurationSec?: number
): Promise<AudioBuffer> {
  if (!input || input.length === 0 || input.duration <= 0) {
    throw new Error('Audio decoding failed. Export cancelled: Audio buffer is empty or duration is zero.');
  }

  const TARGET_SAMPLE_RATE = 44100;
  const TARGET_CHANNELS = 2;
  const duration = targetDurationSec && targetDurationSec > 0 ? targetDurationSec : input.duration;
  const totalSamples = Math.max(1, Math.ceil(duration * TARGET_SAMPLE_RATE));

  // Kasus 1: Sudah 44100Hz dan stereo, serta panjang sample persis sama
  if (
    input.sampleRate === TARGET_SAMPLE_RATE &&
    input.numberOfChannels === TARGET_CHANNELS &&
    Math.abs(input.length - totalSamples) < 2
  ) {
    return input;
  }

  // Kasus 2: Sudah 44100Hz stereo, tetapi durasi perlu disesuaikan (trimming atau zero padding)
  if (input.sampleRate === TARGET_SAMPLE_RATE && input.numberOfChannels === TARGET_CHANNELS) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const result = ctx.createBuffer(TARGET_CHANNELS, totalSamples, TARGET_SAMPLE_RATE);
    if (ctx.state !== 'closed') ctx.close().catch(() => {});

    const copyLen = Math.min(input.length, totalSamples);
    result.getChannelData(0).set(input.getChannelData(0).subarray(0, copyLen));
    result.getChannelData(1).set(input.getChannelData(1).subarray(0, copyLen));
    return result;
  }

  // Kasus 3: Membutuhkan resampling dan/atau konversi mono -> stereo via OfflineAudioContext
  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;

  if (OfflineCtx) {
    try {
      const offlineCtx = new OfflineCtx(TARGET_CHANNELS, totalSamples, TARGET_SAMPLE_RATE);
      const source = offlineCtx.createBufferSource();
      source.buffer = input;

      if (input.numberOfChannels === 1) {
        // Mono to Stereo: L = mono, R = mono
        const merger = offlineCtx.createChannelMerger(2);
        source.connect(merger, 0, 0); // mono -> Left
        source.connect(merger, 0, 1); // mono -> Right
        merger.connect(offlineCtx.destination);
      } else {
        // Stereo / multi-channel: Left -> Left, Right -> Right
        source.connect(offlineCtx.destination);
      }

      source.start(0);
      const rendered = await offlineCtx.startRendering();

      if (rendered.sampleRate === TARGET_SAMPLE_RATE && rendered.numberOfChannels === TARGET_CHANNELS) {
        return rendered;
      }
    } catch (offlineErr) {
      console.warn('[AudioNormalization] OfflineAudioContext gagal, beralih ke software resampler:', offlineErr);
    }
  }

  // Kasus 4: Pure deterministic software resampler (linear interpolation + channel mapping)
  // Menjamin resampler tetap berfungsi jika Web Audio offline rendering diblokir
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const softwareBuf = ctx.createBuffer(TARGET_CHANNELS, totalSamples, TARGET_SAMPLE_RATE);
  if (ctx.state !== 'closed') ctx.close().catch(() => {});

  const outL = softwareBuf.getChannelData(0);
  const outR = softwareBuf.getChannelData(1);

  const inL = input.getChannelData(0);
  const inR = input.numberOfChannels > 1 ? input.getChannelData(1) : inL;

  const ratio = input.sampleRate / TARGET_SAMPLE_RATE;
  for (let i = 0; i < totalSamples; i++) {
    const srcIndex = i * ratio;
    const i0 = Math.floor(srcIndex);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = srcIndex - i0;

    if (i0 < input.length) {
      outL[i] = inL[i0] * (1 - frac) + (inL[i1] || 0) * frac;
      outR[i] = inR[i0] * (1 - frac) + (inR[i1] || 0) * frac;
    } else {
      outL[i] = 0;
      outR[i] = 0;
    }
  }

  return softwareBuf;
}
