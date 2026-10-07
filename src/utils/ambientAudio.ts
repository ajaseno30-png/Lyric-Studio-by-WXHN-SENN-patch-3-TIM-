/**
 * Gentle gallery room ambience generator using Web Audio API
 * Generates an ultra-subtle, deep physical room presence tone (warm analog air)
 * Completely optional, muted by default.
 */

export class AmbientAudioEngine {
  private ctx: AudioContext | null = null;
  private isPlaying = false;
  private gainNode: GainNode | null = null;
  private noiseNode: AudioBufferSourceNode | null = null;

  public toggle(): boolean {
    if (this.isPlaying) {
      this.stop();
      return false;
    } else {
      this.start();
      return true;
    }
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public start() {
    if (this.isPlaying) return;

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      // Create 5 seconds of looped organic brown/pink noise
      const bufferSize = this.ctx.sampleRate * 5;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);

      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        // Warm brown noise integration
        lastOut = (lastOut + 0.02 * white) / 1.02;
        data[i] = lastOut * 0.15;
      }

      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = buffer;
      noiseSource.loop = true;
      this.noiseNode = noiseSource;

      // Lowpass filter for deep, quiet nighttime acoustic dampening
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(260, this.ctx.currentTime);
      filter.Q.setValueAtTime(1.2, this.ctx.currentTime);

      // Master gain node
      const masterGain = this.ctx.createGain();
      masterGain.gain.setValueAtTime(0.001, this.ctx.currentTime);
      masterGain.gain.exponentialRampToValueAtTime(0.08, this.ctx.currentTime + 3.0); // smooth 3s fade in
      this.gainNode = masterGain;

      noiseSource.connect(filter);
      filter.connect(masterGain);
      masterGain.connect(this.ctx.destination);

      noiseSource.start();
      this.isPlaying = true;
    } catch (e) {
      console.warn('AudioContext autoplay blocked or unsupported:', e);
    }
  }

  public stop() {
    if (!this.isPlaying || !this.gainNode || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
    this.gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

    setTimeout(() => {
      if (this.noiseNode) {
        try {
          this.noiseNode.stop();
          this.noiseNode.disconnect();
        } catch {
          // ignore
        }
      }
      if (this.ctx) {
        this.ctx.close();
      }
      this.isPlaying = false;
    }, 1300);
  }
}
