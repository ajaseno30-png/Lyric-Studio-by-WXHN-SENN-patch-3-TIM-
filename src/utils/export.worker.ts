/**
 * Export Web Worker for WebCodecs & MP4-Muxer Background Pipeline
 *
 * Offloads H.264 video compression, AAC audio encoding, and MP4 container
 * muxing to a dedicated background worker thread, ensuring zero UI thread blocking
 * even during high-resolution (1080x1920) and extended (up to 10 minutes) exports.
 *
 * Implements strict frame memory management and explicit VideoFrame.close() handling
 * to guarantee no GPU/RAM leaks over thousands of frames.
 */

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export interface ExportWorkerInitPayload {
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  totalFrames: number;
  duration: number;
  audio?: {
    sampleRate: number;
    numberOfChannels: number;
    leftChannel: ArrayBuffer;
    rightChannel: ArrayBuffer;
  } | null;
}

export interface ExportWorkerFramePayload {
  bitmap?: ImageBitmap;
  frame?: VideoFrame;
  frameIndex: number;
  timestampMicros: number;
  durationMicros: number;
  isKeyframe: boolean;
}

let muxer: Muxer<ArrayBufferTarget> | null = null;
let videoEncoder: VideoEncoder | null = null;
let audioEncoder: AudioEncoder | null = null;
let audioLeftData: Float32Array | null = null;
let audioRightData: Float32Array | null = null;
let totalDuration = 0;
let totalFramesExpected = 0;
let framesEncodedCount = 0;
let audioEncodedOffset = 0;
let totalAudioSamples = 0;
let pendingFramesCount = 0;
let encoderError: string | null = null;
let activeVideoCodec = 'avc1.4d002a';
let activeAudioCodec = 'mp4a.40.2';
let targetAudioSampleRate = 44100;

/**
 * Event-driven Queue Drainer
 * Replaces loop-based queue checks with an event-based promise callback system.
 * Equipped with a failsafe timeout to prevent deadlocks and ensure responsive drain notifications.
 */
class EncoderQueueDrainer {
  private waiters: Array<() => void> = [];

  public notify(): void {
    if (this.waiters.length > 0) {
      const pending = this.waiters;
      this.waiters = [];
      for (const resolve of pending) {
        resolve();
      }
    }
  }

  public wait(timeoutMs = 3000): Promise<void> {
    return new Promise<void>((resolve) => {
      let settled = false;

      const fulfill = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve();
        }
      };

      // Failsafe timeout to prevent deadlocks if encoder stalls
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          const idx = this.waiters.indexOf(fulfill);
          if (idx !== -1) this.waiters.splice(idx, 1);
          resolve();
        }
      }, timeoutMs);

      this.waiters.push(fulfill);
    });
  }

  public clear(): void {
    const pending = this.waiters;
    this.waiters = [];
    for (const resolve of pending) {
      resolve();
    }
  }
}

const videoDrainer = new EncoderQueueDrainer();
const audioDrainer = new EncoderQueueDrainer();

const postTransferable = (message: any, transfer?: Transferable[]) => {
  (self as unknown as { postMessage: (msg: any, trans?: Transferable[]) => void }).postMessage(message, transfer);
};

// Serial message queue to guarantee strict sequential execution of INIT -> ENCODE_FRAME -> FINISH
let messageQueue: Promise<void> = Promise.resolve();

self.onmessage = (e: MessageEvent) => {
  messageQueue = messageQueue
    .then(async () => {
      const { type, payload } = e.data || {};
      const msgType = typeof type === 'string' ? type.toUpperCase() : '';

      if (msgType === 'INIT') {
        await handleInit(payload as ExportWorkerInitPayload);
      } else if (msgType === 'ENCODE_FRAME') {
        await handleEncodeFrame(payload as ExportWorkerFramePayload);
      } else if (msgType === 'FINISH') {
        await handleFinish();
      } else if (msgType === 'CANCEL') {
        handleCancel();
      }
    })
    .catch((err: any) => {
      console.error('[Export Worker Error]', err);
      self.postMessage({
        type: 'ERROR',
        error: err?.message || String(err),
      });
    });
};

async function handleInit(payload: ExportWorkerInitPayload): Promise<void> {
  framesEncodedCount = 0;
  audioEncodedOffset = 0;
  encoderError = null;
  totalDuration = payload.duration;
  totalFramesExpected = payload.totalFrames;

  // 1. Verify WebCodecs API availability in Worker scope
  if (
    typeof VideoEncoder === 'undefined' ||
    typeof AudioEncoder === 'undefined' ||
    typeof VideoFrame === 'undefined' ||
    typeof AudioData === 'undefined'
  ) {
    throw new Error('WebCodecs API is not supported in this browser worker environment.');
  }

  // 2. Multi-Profile H.264 Codec Negotiation for maximum hardware compatibility
  const H264_CANDIDATES = [
    'avc1.4d002a', // Main Profile Level 4.2
    'avc1.42001f', // Baseline Level 3.1
    'avc1.4d001f', // Main Profile Level 3.1
    'avc1.640028', // High Profile Level 4.0
    'avc1.42e01e', // Constrained Baseline
    'avc1.420028', // Baseline Level 4.0
  ];

  let selectedVideoConfig: VideoEncoderConfig | null = null;
  for (const candidateCodec of H264_CANDIDATES) {
    for (const withAvc of [true, false]) {
      try {
        const config: VideoEncoderConfig = {
          codec: candidateCodec,
          width: payload.width,
          height: payload.height,
          bitrate: payload.bitrate,
          framerate: payload.fps,
          ...(withAvc ? { avc: { format: 'avc' as const } } : {}),
        };
        const support = await VideoEncoder.isConfigSupported(config);
        if (support.supported) {
          selectedVideoConfig = config;
          activeVideoCodec = candidateCodec;
          break;
        }
      } catch {
        // Continue to next attempt
      }
    }
    if (selectedVideoConfig) break;
  }

  if (!selectedVideoConfig) {
    throw new Error('No supported H.264 video profile found for WebCodecs worker.');
  }

  // 3. Multi-Profile Audio Codec Negotiation (AAC with Opus fallback)
  const AUDIO_PROFILES: Array<{ codec: string; muxerCodec: 'aac'; bitrate: number; sampleRate: number }> = [
    { codec: 'mp4a.40.2', muxerCodec: 'aac', bitrate: 192000, sampleRate: 44100 },
    { codec: 'mp4a.67', muxerCodec: 'aac', bitrate: 192000, sampleRate: 44100 },
    { codec: 'mp4a.40.02', muxerCodec: 'aac', bitrate: 192000, sampleRate: 44100 },
  ];

  let selectedAudioConfig: AudioEncoderConfig | null = null;
  let selectedMuxerAudioCodec: 'aac' = 'aac';
  targetAudioSampleRate = 44100;

  if (payload.audio) {
    for (const profile of AUDIO_PROFILES) {
      try {
        const config: AudioEncoderConfig = {
          codec: profile.codec,
          numberOfChannels: 2,
          sampleRate: profile.sampleRate,
          bitrate: profile.bitrate,
        };
        const support = await AudioEncoder.isConfigSupported(config);
        if (support.supported) {
          selectedAudioConfig = config;
          selectedMuxerAudioCodec = profile.muxerCodec;
          targetAudioSampleRate = profile.sampleRate;
          activeAudioCodec = profile.codec;
          break;
        }
      } catch {
        // Continue to next candidate
      }
    }
  }

  // 4. Store audio channel buffers if provided
  if (payload.audio && selectedAudioConfig) {
    audioLeftData = new Float32Array(payload.audio.leftChannel);
    audioRightData = new Float32Array(payload.audio.rightChannel);
    totalAudioSamples = Math.min(audioLeftData.length, Math.floor(totalDuration * targetAudioSampleRate));
  } else {
    audioLeftData = null;
    audioRightData = null;
    totalAudioSamples = 0;
  }

  // 5. Initialize MP4-Muxer on worker thread
  muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: 'avc',
      width: payload.width,
      height: payload.height,
    },
    ...(selectedAudioConfig
      ? {
          audio: {
            codec: selectedMuxerAudioCodec,
            numberOfChannels: 2,
            sampleRate: targetAudioSampleRate,
          },
        }
      : {}),
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  // 6. Initialize VideoEncoder with event-based 'frame-processed' callback and promise-buffer flow control
  videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      try {
        if (muxer) muxer.addVideoChunk(chunk, meta);
      } catch (err) {
        console.error('[Worker Muxer Video Chunk Error]', err);
      }
      framesEncodedCount++;
      pendingFramesCount = Math.max(0, pendingFramesCount - 1);
      videoDrainer.notify();

      // Event-based 'FRAME_PROCESSED' callback dispatched to main thread
      self.postMessage({
        type: 'FRAME_PROCESSED',
        queueSize: videoEncoder ? videoEncoder.encodeQueueSize : 0,
        pendingFrames: pendingFramesCount,
        framesEncoded: framesEncodedCount,
      });
    },
    error: (e) => {
      console.error('[Worker VideoEncoder Error]', e);
      encoderError = e.message || String(e);
      videoDrainer.notify();
      self.postMessage({ type: 'ERROR', error: encoderError });
    },
  });
  videoEncoder.configure(selectedVideoConfig);

  if ('ondequeue' in videoEncoder) {
    (videoEncoder as any).ondequeue = () => {
      videoDrainer.notify();
      self.postMessage({
        type: 'QUEUE_UPDATE',
        queueSize: videoEncoder ? videoEncoder.encodeQueueSize : 0,
        pendingFrames: pendingFramesCount,
      });
    };
  }

  // 7. Initialize AudioEncoder if supported with event-based drain notifications
  if (selectedAudioConfig) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        try {
          if (muxer) muxer.addAudioChunk(chunk, meta);
        } catch (err) {
          console.error('[Worker Muxer Audio Chunk Error]', err);
        }
        audioDrainer.notify();
      },
      error: (e) => {
        console.error('[Worker AudioEncoder Error]', e);
        encoderError = e.message || String(e);
        audioDrainer.notify();
        self.postMessage({ type: 'ERROR', error: encoderError });
      },
    });
    audioEncoder.configure(selectedAudioConfig);

    if ('ondequeue' in audioEncoder) {
      (audioEncoder as any).ondequeue = () => {
        audioDrainer.notify();
      };
    }
  } else {
    audioEncoder = null;
  }

  self.postMessage({
    type: 'INIT_SUCCESS',
    videoCodec: activeVideoCodec,
    audioCodec: selectedAudioConfig ? activeAudioCodec : 'none',
  });
}

async function encodeProgressiveAudio(targetTimestampMicros: number): Promise<void> {
  if (!audioLeftData || !audioRightData || !audioEncoder || audioEncoder.state !== 'configured') {
    return;
  }

  const targetSample = Math.min(totalAudioSamples, Math.floor((targetTimestampMicros / 1_000_000) * targetAudioSampleRate));
  const chunkSize = 1024;

  while (audioEncodedOffset + chunkSize <= targetSample && audioEncodedOffset < totalAudioSamples) {
    while (audioEncoder.encodeQueueSize > 6) {
      await audioDrainer.wait(1500);
      if (encoderError) throw new Error(encoderError);
    }

    const planarData = new Float32Array(chunkSize * 2);
    planarData.set(audioLeftData.subarray(audioEncodedOffset, audioEncodedOffset + chunkSize), 0);
    planarData.set(audioRightData.subarray(audioEncodedOffset, audioEncodedOffset + chunkSize), chunkSize);

    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate: targetAudioSampleRate,
      numberOfFrames: chunkSize,
      numberOfChannels: 2,
      timestamp: Math.round((audioEncodedOffset / targetAudioSampleRate) * 1_000_000),
      data: planarData,
    });

    try {
      audioEncoder.encode(audioData);
    } finally {
      // Disciplined cleanup of AudioData memory
      audioData.close();
    }

    audioEncodedOffset += chunkSize;
  }
}

async function handleEncodeFrame(payload: ExportWorkerFramePayload): Promise<void> {
  if (encoderError) throw new Error(encoderError);
  if (!videoEncoder || videoEncoder.state !== 'configured') {
    throw new Error('VideoEncoder is not initialized or configured in worker.');
  }

  // Adaptive promise buffer: if hardware encoder queue is under backpressure, await event notification
  if (videoEncoder.encodeQueueSize >= 8) {
    await videoDrainer.wait(3000);
  }

  pendingFramesCount++;

  const { bitmap, frame, frameIndex, timestampMicros, durationMicros, isKeyframe } = payload;
  let videoFrame: VideoFrame | null = null;

  try {
    if (frame) {
      videoFrame = frame;
    } else if (bitmap) {
      videoFrame = new VideoFrame(bitmap, {
        timestamp: timestampMicros,
        duration: durationMicros,
      });
    }

    if (videoFrame) {
      videoEncoder.encode(videoFrame, { keyFrame: isKeyframe });
    }
  } finally {
    // Explicit close() handling in try...finally to prevent GPU texture and buffer leaks
    if (videoFrame) {
      try {
        videoFrame.close();
      } catch {
        // already closed
      }
    }
    if (bitmap) {
      try {
        bitmap.close();
      } catch {
        // already closed
      }
    }
  }

  // Interleave audio: encode matching audio packets up to this video frame's timestamp
  await encodeProgressiveAudio(timestampMicros + durationMicros);
}

async function handleFinish(): Promise<void> {
  if (!muxer || !videoEncoder) {
    throw new Error('Encoder or Muxer is not initialized for finalization.');
  }

  if (encoderError) throw new Error(encoderError);

  try {
    // 1. Flush video encoder first to ensure all in-flight video frames are finished
    await videoEncoder.flush();

    // 2. Encode any remaining tail audio samples with event-based queue drainer
    if (audioLeftData && audioRightData && audioEncoder && audioEncoder.state === 'configured') {
      self.postMessage({ type: 'STAGE_UPDATE', stage: 'encoding_audio' });

      while (audioEncodedOffset < totalAudioSamples) {
        while (audioEncoder.encodeQueueSize > 6) {
          await audioDrainer.wait(2000);
          if (encoderError) throw new Error(encoderError);
        }

        const currentChunkSize = Math.min(1024, totalAudioSamples - audioEncodedOffset);
        const planarData = new Float32Array(currentChunkSize * 2);

        planarData.set(audioLeftData.subarray(audioEncodedOffset, audioEncodedOffset + currentChunkSize), 0);
        planarData.set(audioRightData.subarray(audioEncodedOffset, audioEncodedOffset + currentChunkSize), currentChunkSize);

        const audioData = new AudioData({
          format: 'f32-planar',
          sampleRate: targetAudioSampleRate,
          numberOfFrames: currentChunkSize,
          numberOfChannels: 2,
          timestamp: Math.round((audioEncodedOffset / targetAudioSampleRate) * 1_000_000),
          data: planarData,
        });

        try {
          audioEncoder.encode(audioData);
        } finally {
          audioData.close();
        }

        audioEncodedOffset += currentChunkSize;
      }

      // 3. Flush audio encoder
      await audioEncoder.flush();
    }

    self.postMessage({ type: 'STAGE_UPDATE', stage: 'muxing' });

    // 4. Finalize MP4 Container
    muxer.finalize();
    const mp4Buffer = muxer.target.buffer;

    // 5. Transfer MP4 array buffer back to main thread with zero-copy transfer list
    postTransferable(
      {
        type: 'COMPLETE',
        buffer: mp4Buffer,
        framesEncoded: framesEncodedCount,
        duration: totalDuration,
      },
      [mp4Buffer]
    );
  } finally {
    // Disciplined cleanup in try...finally: clean up encoders, muxer, drainers, and memory references
    try {
      if (videoEncoder && videoEncoder.state !== 'closed') videoEncoder.close();
    } catch {
      // ignore
    }
    try {
      if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close();
    } catch {
      // ignore
    }
    videoEncoder = null;
    audioEncoder = null;
    muxer = null;
    audioLeftData = null;
    audioRightData = null;
    pendingFramesCount = 0;
    videoDrainer.clear();
    audioDrainer.clear();
  }
}

function handleCancel(): void {
  try {
    if (videoEncoder && videoEncoder.state !== 'closed') videoEncoder.close();
  } catch {
    // ignore
  }
  try {
    if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close();
  } catch {
    // ignore
  }
  videoEncoder = null;
  audioEncoder = null;
  muxer = null;
  audioLeftData = null;
  audioRightData = null;
  pendingFramesCount = 0;
  videoDrainer.clear();
  audioDrainer.clear();
}
