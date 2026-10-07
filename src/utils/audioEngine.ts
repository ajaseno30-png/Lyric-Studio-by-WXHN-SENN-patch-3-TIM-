/**
 * Audio Engine supporting both User-Uploaded Audio Files and Built-in Ambient Melody
 */

export class AudioEngine {
  private audioElement: HTMLAudioElement | null = null;
  private synthCtx: AudioContext | null = null;
  private synthMasterGain: GainNode | null = null;
  private isSynthesized = false;
  private synthInterval: number | null = null;
  private duration = 40.0; // demo length
  private currentTime = 0;
  private isPlaying = false;
  private loopEnabled = true;
  private listeners: Set<(time: number, isPlaying: boolean) => void> = new Set();
  private animFrame: number | null = null;
  private currentFile: File | Blob | null = null;
  private cachedAudioBuffer: AudioBuffer | null = null;
  private decodeError: string | null = null;

  // Auto-fade configuration & state
  private baseVolume = 1.0;
  private loopFadeInDuration = 1.2; // seconds at start of loop
  private loopFadeOutDuration = 1.5; // seconds at end of loop
  private transitionFadeMs = 180; // ms for segment transitions
  private transitionEnvelope = 1.0;
  private transitionAnimFrame: number | null = null;
  private seekTimeoutId: number | null = null;
  private pauseTimeoutId: number | null = null;
  private isLoopTransitioning = false;

  constructor() {
    this.audioElement = new Audio();
    this.audioElement.preload = 'auto';

    this.audioElement.addEventListener('timeupdate', () => {
      if (this.audioElement && !this.isSynthesized) {
        this.currentTime = this.audioElement.currentTime;
        this.applyCurrentGain();
        this.notify();
      }
    });

    this.audioElement.addEventListener('ended', () => {
      if (this.loopEnabled && this.audioElement && !this.isSynthesized) {
        this.handleSeamlessAudioLoop();
      } else {
        this.isPlaying = false;
        this.notify();
      }
    });

    this.audioElement.addEventListener('loadedmetadata', () => {
      if (this.audioElement && !isNaN(this.audioElement.duration)) {
        this.duration = this.audioElement.duration;
        this.notify();
      }
    });
  }

  public subscribe(cb: (time: number, isPlaying: boolean) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    this.listeners.forEach((cb) => cb(this.currentTime, this.isPlaying));
  }

  public setLoop(enabled: boolean) {
    this.loopEnabled = enabled;
  }

  public getLoop(): boolean {
    return this.loopEnabled;
  }

  /**
   * Computes a smooth cosine S-curve gain multiplier (0.0 .. 1.0)
   * for fade-in at the start of a loop and fade-out at the end of a loop.
   */
  private computeLoopFadeGain(time: number, duration: number): number {
    if (duration <= 0) return 1.0;

    const effectiveFadeIn = Math.min(this.loopFadeInDuration, duration * 0.25);
    const effectiveFadeOut = Math.min(this.loopFadeOutDuration, duration * 0.25);

    if (effectiveFadeIn > 0 && time < effectiveFadeIn) {
      const p = Math.max(0, Math.min(1, time / effectiveFadeIn));
      return 0.5 - 0.5 * Math.cos(p * Math.PI);
    }

    if (effectiveFadeOut > 0 && time > duration - effectiveFadeOut) {
      const rem = Math.max(0, duration - time);
      const p = Math.max(0, Math.min(1, rem / effectiveFadeOut));
      return 0.5 - 0.5 * Math.cos(p * Math.PI);
    }

    return 1.0;
  }

  /**
   * Applies combined loop boundary fade and segment transition envelope
   * to both HTMLAudioElement and Web Audio synth master gain.
   */
  private applyCurrentGain() {
    const dur = this.getDuration();
    const loopGain = this.computeLoopFadeGain(this.currentTime, dur);
    const effectiveGain = Math.max(
      0,
      Math.min(1, this.baseVolume * loopGain * this.transitionEnvelope)
    );

    if (this.audioElement && !this.isSynthesized) {
      try {
        this.audioElement.volume = effectiveGain;
      } catch {
        // ignore if volume is read-only on certain mobile webviews
      }
    }

    if (this.synthCtx && this.synthMasterGain) {
      try {
        this.synthMasterGain.gain.setTargetAtTime(
          Math.max(0.0001, effectiveGain),
          this.synthCtx.currentTime,
          0.025
        );
      } catch {
        // ignore
      }
    }
  }

  /**
   * Animates `transitionEnvelope` smoothly from `fromVal` to `toVal` over `durationMs`
   * using a cosine ease-in-out curve to prevent clicks during segment transitions.
   */
  private animateTransitionEnvelope(
    fromVal: number,
    toVal: number,
    durationMs: number,
    onComplete?: () => void
  ) {
    if (this.transitionAnimFrame) {
      cancelAnimationFrame(this.transitionAnimFrame);
      this.transitionAnimFrame = null;
    }

    if (durationMs <= 0) {
      this.transitionEnvelope = toVal;
      this.applyCurrentGain();
      onComplete?.();
      return;
    }

    const startTime = performance.now();
    this.transitionEnvelope = fromVal;
    this.applyCurrentGain();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.max(0, Math.min(1, elapsed / durationMs));
      const eased = 0.5 - 0.5 * Math.cos(progress * Math.PI);
      this.transitionEnvelope = fromVal + (toVal - fromVal) * eased;
      this.applyCurrentGain();

      if (progress < 1) {
        this.transitionAnimFrame = requestAnimationFrame(step);
      } else {
        this.transitionAnimFrame = null;
        this.transitionEnvelope = toVal;
        this.applyCurrentGain();
        onComplete?.();
      }
    };

    this.transitionAnimFrame = requestAnimationFrame(step);
  }

  /**
   * Handles seamless loop restart with smooth auto-fade-in when track reaches the end.
   */
  private handleSeamlessAudioLoop() {
    if (this.isLoopTransitioning) return;
    this.isLoopTransitioning = true;

    this.currentTime = 0;
    if (this.audioElement && !this.isSynthesized) {
      this.audioElement.currentTime = 0;
      this.transitionEnvelope = 0.01;
      this.applyCurrentGain();
      this.audioElement.play().catch((e) => console.warn('Audio loop play error:', e));
    }

    this.animateTransitionEnvelope(0.01, 1.0, this.transitionFadeMs, () => {
      this.isLoopTransitioning = false;
    });
    this.notify();
  }

  private clearTransitionTimers() {
    if (this.transitionAnimFrame) {
      cancelAnimationFrame(this.transitionAnimFrame);
      this.transitionAnimFrame = null;
    }
    if (this.seekTimeoutId) {
      clearTimeout(this.seekTimeoutId);
      this.seekTimeoutId = null;
    }
    if (this.pauseTimeoutId) {
      clearTimeout(this.pauseTimeoutId);
      this.pauseTimeoutId = null;
    }
  }

  public async loadUserAudio(file: File | Blob, fileName?: string): Promise<string> {
    this.clearTransitionTimers();
    this.stopSynth();
    this.currentFile = file;
    this.cachedAudioBuffer = null;
    this.decodeError = null;
    const url = URL.createObjectURL(file);
    if (this.audioElement) {
      this.audioElement.src = url;
      this.audioElement.load();
      this.isSynthesized = false;
    }

    // Pre-decode audio buffer in background
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const arrayBuf = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuf);
      if (ctx.state !== 'closed') ctx.close().catch(() => {});
      if (!decoded || decoded.length === 0 || decoded.duration <= 0) {
        throw new Error('Decoded audio has 0 length or duration.');
      }
      this.cachedAudioBuffer = decoded;
    } catch (e: any) {
      console.error('Audio decode failure on load:', e);
      this.decodeError = e?.message || 'Format file audio tidak valid atau tidak didukung.';
    }

    return url;
  }

  public async getAudioBuffer(targetDuration?: number): Promise<AudioBuffer> {
    if (this.currentFile) {
      if (this.cachedAudioBuffer) {
        if (this.cachedAudioBuffer.length === 0 || this.cachedAudioBuffer.duration <= 0) {
          throw new Error('Audio decoding failed. Export cancelled: Audio buffer is empty or duration is zero.');
        }
        return this.cachedAudioBuffer;
      }

      if (this.decodeError) {
        throw new Error(`Audio decoding failed. Export cancelled: ${this.decodeError}`);
      }

      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        const arrayBuf = await this.currentFile.arrayBuffer();
        this.cachedAudioBuffer = await ctx.decodeAudioData(arrayBuf);
        if (ctx.state !== 'closed') ctx.close().catch(() => {});

        if (!this.cachedAudioBuffer || this.cachedAudioBuffer.length === 0 || this.cachedAudioBuffer.duration <= 0) {
          throw new Error('Audio decoding failed. Export cancelled: Decoded buffer has 0 length.');
        }

        return this.cachedAudioBuffer;
      } catch (e: any) {
        console.error('Fatal audio decode error in getAudioBuffer:', e);
        throw new Error(`Audio decoding failed. Export cancelled: ${e?.message || 'File audio tidak dapat di-decode.'}`);
      }
    }

    // Jika audio lagu user gagal atau belum ada, tapi bukan mode synthesizer demo
    if (!this.isSynthesized) {
      throw new Error('Audio decoding failed. Export cancelled: File audio belum dimuat atau tidak valid.');
    }

    // Render synthesizer demo audio menggunakan Audio Graph yang IDENTIK dengan live preview:
    // Triangle Oscillator + 800Hz Lowpass Filter + Exponential Gain Envelope (44100Hz Stereo)
    try {
      const demoBuffer = await this.renderDemoSynthOffline(targetDuration || this.duration);
      this.cachedAudioBuffer = demoBuffer;
      return demoBuffer;
    } catch (err: any) {
      console.error('Fatal demo synth rendering error:', err);
      throw new Error(`Audio decoding failed. Export cancelled: Gagal mensintesis audio demo (${err?.message})`);
    }
  }

  /**
   * Single source-of-truth offline renderer untuk synth demo track
   * Memastikan waveform, frekuensi, gain envelope, lowpass filter, dan stereo channel
   * 100% IDENTIK antara live playback dan hasil rekaman video.
   */
  private async renderDemoSynthOffline(targetDurationSec?: number): Promise<AudioBuffer> {
    const sampleRate = 44100;
    const duration = targetDurationSec && targetDurationSec > 0 ? targetDurationSec : this.duration || 38.0;
    const totalSamples = Math.max(1, Math.floor(sampleRate * duration));

    const OfflineCtx =
      window.OfflineAudioContext ||
      (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;

    if (OfflineCtx) {
      const offlineCtx = new OfflineCtx(2, totalSamples, sampleRate);
      const masterGain = offlineCtx.createGain();
      const effectiveFadeIn = Math.min(this.loopFadeInDuration, duration * 0.25);
      const effectiveFadeOut = Math.min(this.loopFadeOutDuration, duration * 0.25);

      masterGain.gain.setValueAtTime(0.0001, 0);
      if (effectiveFadeIn > 0) {
        masterGain.gain.linearRampToValueAtTime(1.0, effectiveFadeIn);
      } else {
        masterGain.gain.setValueAtTime(1.0, 0);
      }
      if (effectiveFadeOut > 0 && duration > effectiveFadeIn + effectiveFadeOut) {
        masterGain.gain.setValueAtTime(1.0, duration - effectiveFadeOut);
        masterGain.gain.linearRampToValueAtTime(0.0001, duration);
      }
      masterGain.connect(offlineCtx.destination);

      const notes = [
        220, 261.63, 329.63, 392,       // Am7 (A3, C4, E4, G4)
        174.61, 220, 261.63, 329.63,   // Fmaj7 (F3, A3, C4, E4)
        196, 246.94, 293.66, 392,       // G6 (G3, B3, D4, G4)
        164.81, 207.65, 246.94, 329.63  // E7 (E3, G#3, B3, E4)
      ];

      const interval = 0.48;
      let noteIdx = 0;

      for (let t = 0; t < duration - 0.1; t += interval) {
        const freq = notes[noteIdx % notes.length];
        noteIdx++;

        const osc = offlineCtx.createOscillator();
        const filter = offlineCtx.createBiquadFilter();
        const gain = offlineCtx.createGain();

        // Exact parameters identical to triggerChime()
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, t);

        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.04, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);

        osc.start(t);
        osc.stop(t + 1.25);
      }

      return await offlineCtx.startRendering();
    }

    // Pure mathematical software synthesis fallback jika OfflineAudioContext diblokir
    // Menghasilkan sinyal audio triangle wave asli dengan exponential decay sehingga tidak hening/silent
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const synthBuf = ctx.createBuffer(2, totalSamples, sampleRate);
    if (ctx.state !== 'closed') ctx.close().catch(() => {});

    const left = synthBuf.getChannelData(0);
    const right = synthBuf.getChannelData(1);
    const notes = [
      220, 261.63, 329.63, 392,
      174.61, 220, 261.63, 329.63,
      196, 246.94, 293.66, 392,
      164.81, 207.65, 246.94, 329.63
    ];
    const interval = 0.48;
    let noteIdx = 0;

    for (let t = 0; t < duration - 0.1; t += interval) {
      const freq = notes[noteIdx % notes.length];
      noteIdx++;
      const startSample = Math.floor(t * sampleRate);
      const noteSampleLength = Math.floor(1.2 * sampleRate);
      const endSample = Math.min(totalSamples, startSample + noteSampleLength);

      for (let s = startSample; s < endSample; s++) {
        const timeInNote = (s - startSample) / sampleRate;
        const absTime = s / sampleRate;
        const phase = (timeInNote * freq) % 1;
        const tri = 4 * Math.abs(phase - 0.5) - 1;
        const env = timeInNote < 0.05
          ? (timeInNote / 0.05) * 0.04
          : 0.04 * Math.exp(-3 * (timeInNote - 0.05));
        const loopFade = this.computeLoopFadeGain(absTime, duration);
        const val = tri * env * loopFade;
        left[s] += val;
        right[s] += val;
      }
    }

    return synthBuf;
  }

  public getCurrentFile(): File | Blob | null {
    return this.currentFile;
  }

  public async initDemoAudio() {
    // If no user audio is loaded, synthesize a gentle lofi ambient musical piece
    this.isSynthesized = true;
    this.duration = 38.0;
  }

  public play() {
    this.clearTransitionTimers();
    this.isPlaying = true;

    // Auto-fade in smoothly when starting or resuming playback
    const startEnvelope = Math.min(this.transitionEnvelope, 0.05);
    this.transitionEnvelope = startEnvelope;
    this.applyCurrentGain();

    if (!this.isSynthesized && this.audioElement && this.audioElement.src) {
      this.audioElement.play().catch((e) => console.warn('Audio play error:', e));
    } else {
      this.startSynthPlayback();
    }

    this.animateTransitionEnvelope(startEnvelope, 1.0, this.transitionFadeMs);
    this.startProgressTicker();
  }

  public pause() {
    this.clearTransitionTimers();
    if (!this.isPlaying) {
      this.notify();
      return;
    }

    this.isPlaying = false;
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
    this.notify();

    // Smooth micro fade-out before halting underlying audio hardware to avoid clicks
    const fadeOutMs = 120;
    const currentEnv = this.transitionEnvelope;
    this.animateTransitionEnvelope(currentEnv, 0.0001, fadeOutMs);

    this.pauseTimeoutId = window.setTimeout(() => {
      this.pauseTimeoutId = null;
      if (!this.isPlaying) {
        if (this.audioElement && !this.isSynthesized) {
          this.audioElement.pause();
        }
        this.stopSynthPlayback();
        this.transitionEnvelope = 1.0;
      }
    }, fadeOutMs + 10);
  }

  /**
   * Transitions to a new timestamp with an automatic micro fade-out / fade-in
   * when actively playing so segment jumps never produce harsh cuts or clicks.
   */
  public seek(seconds: number) {
    const dur = this.getDuration();
    const targetTime = Math.max(0, Math.min(seconds, dur));
    const timeDelta = Math.abs(targetTime - this.currentTime);
    this.currentTime = targetTime;
    this.notify();

    // If paused or tiny adjustment, seek immediately without transition delay
    if (!this.isPlaying || timeDelta <= 0.08) {
      if (this.audioElement && !this.isSynthesized) {
        this.audioElement.currentTime = targetTime;
      }
      this.applyCurrentGain();
      return;
    }

    // Active playback segment transition: quick dip fade-out -> seek -> smooth fade-in
    if (this.seekTimeoutId) {
      clearTimeout(this.seekTimeoutId);
      this.seekTimeoutId = null;
    }

    const fadeOutHalfMs = 55;
    const fadeInHalfMs = this.transitionFadeMs;

    this.animateTransitionEnvelope(this.transitionEnvelope, 0.02, fadeOutHalfMs);

    this.seekTimeoutId = window.setTimeout(() => {
      this.seekTimeoutId = null;
      if (!this.isSynthesized && this.audioElement) {
        this.audioElement.currentTime = targetTime;
      } else if (this.isSynthesized && this.isPlaying) {
        // Trigger a gentle note on the new segment entry
        this.restartSynthSegmentAt(targetTime);
      }
      this.animateTransitionEnvelope(0.02, 1.0, fadeInHalfMs);
    }, fadeOutHalfMs);
  }

  public getCurrentTime(): number {
    return this.currentTime;
  }

  public getDuration(): number {
    if (!this.isSynthesized && this.audioElement && !isNaN(this.audioElement.duration) && this.audioElement.duration > 0) {
      return this.audioElement.duration;
    }
    return this.duration;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getAudioElement(): HTMLAudioElement | null {
    return this.audioElement;
  }

  /**
   * Returns normalized frequency band energies [0.0 .. 1.0] across `barCount` bars
   * for the current playback timestamp (or an explicit `timeOverride` during seek/export).
   */
  public getFrequencyData(barCount = 32, timeOverride?: number): Float32Array {
    const bins = new Float32Array(barCount);
    const isSeekingOverride = typeof timeOverride === 'number';
    if (!this.isPlaying && !isSeekingOverride) {
      return bins;
    }

    const dur = this.getDuration();
    const rawTime = isSeekingOverride ? timeOverride! : this.currentTime;
    const t = dur > 0 ? ((rawTime % dur) + dur) % dur : Math.max(0, rawTime);
    const loopFade = this.computeLoopFadeGain(t, dur) * (isSeekingOverride ? 1.0 : this.transitionEnvelope);

    // 1. If a decoded user AudioBuffer is available, extract real multi-band spectral energy
    if (!this.isSynthesized && this.cachedAudioBuffer && this.cachedAudioBuffer.length > 0) {
      const buf = this.cachedAudioBuffer;
      const sr = buf.sampleRate || 44100;
      const ch0 = buf.getChannelData(0);
      const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0;
      const totalSamples = ch0.length;
      const centerSample = Math.min(totalSamples - 1, Math.max(0, Math.floor(t * sr)));
      const windowSize = 512;
      const startSample = Math.max(0, Math.min(totalSamples - windowSize, centerSample - (windowSize >> 1)));

      for (let b = 0; b < barCount; b++) {
        const normPos = b / Math.max(1, barCount - 1);
        // Logarithmic frequency mapping from ~55 Hz (sub/bass) to ~7500 Hz (air/presence)
        const targetFreq = 55 * Math.pow(136, normPos);
        const omega = (2 * Math.PI * targetFreq) / sr;
        const coeff = 2 * Math.cos(omega);
        let s1 = 0;
        let s2 = 0;
        let rmsAccum = 0;
        const step = 2;
        const count = windowSize / step;

        for (let i = 0; i < windowSize; i += step) {
          const idx = startSample + i;
          const sample = (ch0[idx] + ch1[idx]) * 0.5;
          // Hann window weight
          const hann = 0.5 * (1 - Math.cos((2 * Math.PI * i) / windowSize));
          const windowed = sample * hann;
          const s0 = windowed + coeff * s1 - s2;
          s2 = s1;
          s1 = s0;
          rmsAccum += sample * sample;
        }

        const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
        const mag = Math.sqrt(Math.max(0, power)) / (count * 0.18);
        const rms = Math.sqrt(rmsAccum / count);
        // Blend resonant band magnitude with local RMS envelope and frequency tilt compensation
        const tilt = 0.85 + normPos * 0.9;
        const combined = Math.min(1, (mag * 0.72 * tilt + rms * 0.45) * loopFade);
        bins[b] = Math.pow(combined, 0.78);
      }

      return bins;
    }

    // 2. Synthesized melodic lofi spectrum based on harmonic chord progression & note envelope
    const interval = 0.48;
    const notePhase = (t % interval) / interval;
    const noteTime = t % interval;
    const attackDecay =
      noteTime < 0.05
        ? noteTime / 0.05
        : Math.exp(-2.6 * (noteTime - 0.05));

    const chordIdx = Math.floor(t / (interval * 4)) % 4;
    const chordCenters = [0.28, 0.22, 0.32, 0.25];
    const center = chordCenters[chordIdx];

    for (let b = 0; b < barCount; b++) {
      const u = b / Math.max(1, barCount - 1);
      // Warm low-mid bell distribution + harmonic overtones
      const bell = Math.exp(-Math.pow((u - center) / 0.28, 2));
      const overtone1 = Math.exp(-Math.pow((u - (center + 0.26)) / 0.18, 2)) * 0.65;
      const overtone2 = Math.exp(-Math.pow((u - (center + 0.48)) / 0.15, 2)) * 0.38;
      const waveMotion =
        0.5 +
        0.3 * Math.sin(t * 3.4 + b * 0.38) +
        0.2 * Math.cos(t * 5.1 - b * 0.24 + notePhase * Math.PI);

      const rawEnergy = (0.14 + (bell + overtone1 + overtone2) * (0.42 + 0.58 * attackDecay) * waveMotion) * loopFade;
      bins[b] = Math.max(0.04, Math.min(0.96, rawEnergy));
    }

    return bins;
  }

  private startProgressTicker() {
    let lastTime = performance.now();
    const tick = () => {
      if (!this.isPlaying) return;
      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      const dur = this.getDuration();

      if (this.isSynthesized) {
        this.currentTime += dt;
        if (this.currentTime >= dur) {
          this.currentTime = 0; // loop demo with smooth auto-fade
          this.animateTransitionEnvelope(0.02, 1.0, this.transitionFadeMs);
        }
      } else if (this.audioElement) {
        this.currentTime = this.audioElement.currentTime;
        // Seamless loop wrap-around if approaching the very end of user audio
        if (this.loopEnabled && dur > 0 && this.currentTime >= dur - 0.03 && !this.isLoopTransitioning) {
          this.handleSeamlessAudioLoop();
        }
      }

      this.applyCurrentGain();
      this.notify();
      this.animFrame = requestAnimationFrame(tick);
    };

    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.animFrame = requestAnimationFrame(tick);
  }

  private ensureSynthMasterGain() {
    if (!this.synthCtx) return;
    if (!this.synthMasterGain) {
      this.synthMasterGain = this.synthCtx.createGain();
      this.synthMasterGain.gain.setValueAtTime(1.0, this.synthCtx.currentTime);
      this.synthMasterGain.connect(this.synthCtx.destination);
    }
  }

  private restartSynthSegmentAt(targetTime: number) {
    if (!this.synthCtx || !this.isPlaying) return;
    const notes = [
      220, 261.63, 329.63, 392,
      174.61, 220, 261.63, 329.63,
      196, 246.94, 293.66, 392,
      164.81, 207.65, 246.94, 329.63
    ];
    let noteIdx = Math.max(0, Math.floor(targetTime / 0.48));
    if (this.synthInterval) clearInterval(this.synthInterval);

    this.triggerChime(notes[noteIdx % notes.length]);
    noteIdx++;

    this.synthInterval = window.setInterval(() => {
      if (!this.isPlaying || !this.synthCtx) return;
      const freq = notes[noteIdx % notes.length];
      this.triggerChime(freq);
      noteIdx++;
    }, 480);
  }

  // Melodic synthesizer for the demo track
  private startSynthPlayback() {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!this.synthCtx) {
        this.synthCtx = new AudioCtx();
      }
      if (this.synthCtx.state === 'suspended') {
        this.synthCtx.resume();
      }
      this.ensureSynthMasterGain();
      this.applyCurrentGain();

      // Play soft warm piano chords arpeggio
      const notes = [
        220, 261.63, 329.63, 392, // Am7 (A3, C4, E4, G4)
        174.61, 220, 261.63, 329.63, // Fmaj7 (F3, A3, C4, E4)
        196, 246.94, 293.66, 392, // G6 (G3, B3, D4, G4)
        164.81, 207.65, 246.94, 329.63 // E7 (E3, G#3, B3, E4)
      ];

      let noteIdx = Math.max(0, Math.floor(this.currentTime / 0.48));
      if (this.synthInterval) clearInterval(this.synthInterval);

      this.synthInterval = window.setInterval(() => {
        if (!this.isPlaying || !this.synthCtx) return;
        const freq = notes[noteIdx % notes.length];
        this.triggerChime(freq);
        noteIdx++;
      }, 480);
    } catch {
      // AudioContext fallback
    }
  }

  private triggerChime(freq: number) {
    if (!this.synthCtx) return;
    try {
      this.ensureSynthMasterGain();
      const osc = this.synthCtx.createOscillator();
      const gain = this.synthCtx.createGain();
      const filter = this.synthCtx.createBiquadFilter();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, this.synthCtx.currentTime);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, this.synthCtx.currentTime);

      gain.gain.setValueAtTime(0.0001, this.synthCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.04, this.synthCtx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.synthCtx.currentTime + 1.2);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.synthMasterGain || this.synthCtx.destination);

      osc.start();
      osc.stop(this.synthCtx.currentTime + 1.25);
    } catch {
      // ignore
    }
  }

  private stopSynthPlayback() {
    if (this.synthInterval) {
      clearInterval(this.synthInterval);
      this.synthInterval = null;
    }
  }

  private stopSynth() {
    this.stopSynthPlayback();
    if (this.synthMasterGain) {
      try {
        this.synthMasterGain.disconnect();
      } catch {
        // ignore
      }
      this.synthMasterGain = null;
    }
    if (this.synthCtx) {
      try {
        this.synthCtx.close();
      } catch {
        // ignore
      }
      this.synthCtx = null;
    }
  }

  public destroy() {
    this.clearTransitionTimers();
    this.pause();
    this.stopSynth();
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = '';
      this.audioElement = null;
    }
    this.listeners.clear();
  }
}
