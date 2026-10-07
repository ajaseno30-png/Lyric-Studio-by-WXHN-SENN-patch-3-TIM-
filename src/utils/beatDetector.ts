/**
 * Web Audio API Beat & Onset Detection Engine
 * Analyzes audio PCM data to detect tempo (BPM), percussive onsets, and suggest synchronized lyric line timestamps.
 */

import { LyricLine } from '../types/lyrics';

export interface BeatAnalysisResult {
  estimatedBpm: number;
  beats: number[]; // seconds of detected beats
  majorOnsets: number[]; // prominent phrase start onsets
  waveformData: number[]; // 120-point amplitude array for mini waveform
  duration: number;
}

export interface AutoSyncOptions {
  sensitivity: 'low' | 'medium' | 'high'; // threshold multiplier
  phraseSpacing: 'auto' | '4_beats' | '8_beats'; // phrase distance
  introOffset: number; // seconds to skip intro
}

export class BeatDetector {
  /**
   * Decode audio file / blob into an AudioBuffer using Web Audio API
   */
  public static async decodeAudio(audioSource: File | Blob | ArrayBuffer): Promise<AudioBuffer> {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();

    let arrayBuffer: ArrayBuffer;
    if (audioSource instanceof ArrayBuffer) {
      arrayBuffer = audioSource;
    } else {
      arrayBuffer = await audioSource.arrayBuffer();
    }

    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      return audioBuffer;
    } finally {
      if (ctx.state !== 'closed') {
        ctx.close().catch(() => {});
      }
    }
  }

  /**
   * Analyze an AudioBuffer to extract beats, BPM, onsets, and waveform profile
   */
  public static analyzeBuffer(
    buffer: AudioBuffer,
    sensitivity: 'low' | 'medium' | 'high' = 'medium'
  ): BeatAnalysisResult {
    const sampleRate = buffer.sampleRate;
    const duration = buffer.duration;
    const channelData = buffer.getChannelData(0); // analyze primary channel
    const numSamples = channelData.length;

    // 1. Generate 120-point simplified waveform for UI preview
    const wavePoints = 120;
    const waveBlockSize = Math.floor(numSamples / wavePoints);
    const waveformData: number[] = [];

    for (let i = 0; i < wavePoints; i++) {
      let sum = 0;
      const start = i * waveBlockSize;
      const end = Math.min(start + waveBlockSize, numSamples);
      for (let j = start; j < end; j++) {
        sum += Math.abs(channelData[j]);
      }
      waveformData.push(sum / (end - start || 1));
    }
    // Normalize waveform 0..1
    const maxWave = Math.max(...waveformData, 0.001);
    for (let i = 0; i < waveformData.length; i++) {
      waveformData[i] = waveformData[i] / maxWave;
    }

    // 2. Compute energy envelope over small windows (~23ms)
    const windowSize = 1024;
    const hopSize = 512;
    const numWindows = Math.floor((numSamples - windowSize) / hopSize);
    const energies = new Float32Array(numWindows);

    for (let w = 0; w < numWindows; w++) {
      let energy = 0;
      const offset = w * hopSize;
      for (let i = 0; i < windowSize; i++) {
        const val = channelData[offset + i];
        energy += val * val;
      }
      energies[w] = energy / windowSize;
    }

    // 3. Dynamic Thresholding Peak Picking
    // Window over ~1 second of energy to find local baseline
    const historyWindows = Math.floor(sampleRate / hopSize); // ~1 sec
    const multiplier = sensitivity === 'high' ? 1.25 : sensitivity === 'medium' ? 1.5 : 1.85;

    const detectedBeats: number[] = [];
    const minBeatIntervalSamples = Math.floor(0.24 * (sampleRate / hopSize)); // min 240ms between beats (~250 BPM max)
    let lastBeatIndex = -minBeatIntervalSamples;

    for (let i = historyWindows; i < numWindows - 2; i++) {
      // Calculate local moving average
      let localSum = 0;
      for (let j = i - historyWindows; j < i; j++) {
        localSum += energies[j];
      }
      const localAvg = localSum / historyWindows;
      const threshold = localAvg * multiplier;

      // Check if current energy is local peak and exceeds threshold
      if (
        energies[i] > threshold &&
        energies[i] > energies[i - 1] &&
        energies[i] > energies[i + 1] &&
        i - lastBeatIndex > minBeatIntervalSamples
      ) {
        const timeInSeconds = (i * hopSize) / sampleRate;
        detectedBeats.push(parseFloat(timeInSeconds.toFixed(2)));
        lastBeatIndex = i;
      }
    }

    // 4. Estimate BPM from beat intervals
    let estimatedBpm = 110;
    if (detectedBeats.length >= 4) {
      const intervals: number[] = [];
      for (let i = 1; i < detectedBeats.length; i++) {
        const diff = detectedBeats[i] - detectedBeats[i - 1];
        if (diff >= 0.28 && diff <= 1.2) {
          intervals.push(diff);
        }
      }

      if (intervals.length > 0) {
        // Find median interval
        intervals.sort((a, b) => a - b);
        const medianInterval = intervals[Math.floor(intervals.length / 2)];
        const rawBpm = Math.round(60 / medianInterval);
        // Normalize BPM to reasonable pop/ballad range 65 - 160
        if (rawBpm < 65) estimatedBpm = rawBpm * 2;
        else if (rawBpm > 160) estimatedBpm = Math.round(rawBpm / 2);
        else estimatedBpm = rawBpm;
      }
    }

    // 5. Detect Major Phrase Onsets (significant energy jumps)
    const majorOnsets: number[] = [];
    const phraseIntervalSamples = Math.floor(1.8 * (sampleRate / hopSize)); // at least 1.8s between major phrases
    let lastMajorIndex = -phraseIntervalSamples;

    for (let i = historyWindows; i < numWindows - 2; i++) {
      let localSum = 0;
      for (let j = i - historyWindows; j < i; j++) {
        localSum += energies[j];
      }
      const localAvg = localSum / historyWindows;
      const majorThreshold = localAvg * (multiplier * 1.55);

      if (
        energies[i] > majorThreshold &&
        energies[i] > energies[i - 1] &&
        i - lastMajorIndex > phraseIntervalSamples
      ) {
        const timeInSeconds = (i * hopSize) / sampleRate;
        majorOnsets.push(parseFloat(timeInSeconds.toFixed(2)));
        lastMajorIndex = i;
      }
    }

    return {
      estimatedBpm,
      beats: detectedBeats,
      majorOnsets,
      waveformData,
      duration,
    };
  }

  /**
   * Suggest timestamps for N lyric lines based on beat analysis
   */
  public static suggestLyricTimestamps(
    lineCount: number,
    analysis: BeatAnalysisResult,
    options: AutoSyncOptions
  ): number[] {
    if (lineCount <= 0) return [];

    const { estimatedBpm, beats, majorOnsets, duration } = analysis;
    const { introOffset, phraseSpacing } = options;

    const secondsPerBeat = 60 / (estimatedBpm || 110);
    const suggested: number[] = [];

    // Filter beats after intro
    const validBeats = beats.filter((t) => t >= introOffset);
    const validMajors = majorOnsets.filter((t) => t >= introOffset);

    // Strategy 1: Regular Bar Spacing (4 beats or 8 beats per line)
    if (phraseSpacing === '4_beats' || phraseSpacing === '8_beats') {
      const beatsPerLine = phraseSpacing === '8_beats' ? 8 : 4;
      const lineDuration = beatsPerLine * secondsPerBeat;

      // Start on first beat after intro
      const startTime = validBeats.length > 0 ? validBeats[0] : introOffset;

      for (let i = 0; i < lineCount; i++) {
        let t = startTime + i * lineDuration;
        // Snap to nearest detected beat if one exists within 0.3s
        const nearestBeat = validBeats.find((b) => Math.abs(b - t) < 0.32);
        if (nearestBeat !== undefined) {
          t = nearestBeat;
        }
        suggested.push(parseFloat(Math.min(t, duration - 1.0).toFixed(2)));
      }
      return suggested;
    }

    // Strategy 2: Dynamic Auto (Hybrid of phrase onsets & rhythmic cadence)
    if (validMajors.length >= lineCount) {
      // We have enough major phrase onsets to directly map lines!
      for (let i = 0; i < lineCount; i++) {
        suggested.push(validMajors[i]);
      }
      return suggested;
    }

    // If fewer major onsets than lines, interpolate using beat grid
    const startPoint = validBeats.length > 0 ? validBeats[0] : Math.max(1.0, introOffset);
    const availableSpan = Math.max(10, duration - startPoint - 3.0);
    const targetSpacing = Math.max(secondsPerBeat * 3, availableSpan / lineCount);

    for (let i = 0; i < lineCount; i++) {
      const targetTime = startPoint + i * targetSpacing;
      // Snap to nearest detected beat
      let bestBeat = targetTime;
      let minDiff = 0.5;

      for (const b of validBeats) {
        const diff = Math.abs(b - targetTime);
        if (diff < minDiff) {
          minDiff = diff;
          bestBeat = b;
        }
      }

      suggested.push(parseFloat(Math.min(bestBeat, duration - 0.5).toFixed(2)));
    }

    return suggested;
  }

  /**
   * Peak-detection algorithm on audio buffer to identify rhythmic transients
   * and automatically map existing lyric lines to nearest detected beats.
   */
  public static mapLinesToNearestPeaks(
    lines: LyricLine[],
    buffer: AudioBuffer,
    searchTolerance = 2.5
  ): {
    updatedLines: LyricLine[];
    peaksFound: number;
    mappedCount: number;
  } {
    if (!lines.length) {
      return { updatedLines: [], peaksFound: 0, mappedCount: 0 };
    }

    const sampleRate = buffer.sampleRate;
    const duration = buffer.duration;
    const channelData = buffer.getChannelData(0);
    const numSamples = channelData.length;

    // Window size ~23ms, hop size ~11.6ms
    const windowSize = 1024;
    const hopSize = 512;
    const numWindows = Math.floor((numSamples - windowSize) / hopSize);

    // 1. Calculate RMS energy per window
    const energies = new Float32Array(numWindows);
    for (let w = 0; w < numWindows; w++) {
      let sum = 0;
      const offset = w * hopSize;
      for (let i = 0; i < windowSize; i++) {
        const val = channelData[offset + i];
        sum += val * val;
      }
      energies[w] = Math.sqrt(sum / windowSize);
    }

    // 2. Identify transient onset peaks (sudden rise in local energy)
    const historyWindows = Math.floor((sampleRate / hopSize) * 0.8); // 800ms window
    const minRefractoryWindows = Math.floor((sampleRate / hopSize) * 0.22); // min 220ms
    const detectedPeakTimes: number[] = [];
    let lastPeakIndex = -minRefractoryWindows;

    for (let i = historyWindows; i < numWindows - 2; i++) {
      let localSum = 0;
      for (let j = i - historyWindows; j < i; j++) {
        localSum += energies[j];
      }
      const localAvg = localSum / historyWindows;
      const threshold = localAvg * 1.32;

      // Peak condition: energy exceeds adaptive threshold and is local maximum
      if (
        energies[i] > threshold &&
        energies[i] > energies[i - 1] &&
        energies[i] >= energies[i + 1] &&
        i - lastPeakIndex >= minRefractoryWindows
      ) {
        const peakTime = parseFloat(((i * hopSize) / sampleRate).toFixed(2));
        detectedPeakTimes.push(peakTime);
        lastPeakIndex = i;
      }
    }

    if (!detectedPeakTimes.length) {
      return { updatedLines: [...lines], peaksFound: 0, mappedCount: 0 };
    }

    // 3. Map existing lyric lines to nearest detected beat peaks
    let mappedCount = 0;
    let lastMappedTime = 0.5;

    const updatedLines = lines.map((line) => {
      const origTime = line.time;

      // Find candidates that are after the previous line (+0.4s) to preserve chronological sequence
      const validCandidates = detectedPeakTimes.filter(
        (p) => p > lastMappedTime && Math.abs(p - origTime) <= searchTolerance
      );

      if (validCandidates.length > 0) {
        let closestPeak = validCandidates[0];
        let minDiff = Math.abs(closestPeak - origTime);

        for (let k = 1; k < validCandidates.length; k++) {
          const diff = Math.abs(validCandidates[k] - origTime);
          if (diff < minDiff) {
            minDiff = diff;
            closestPeak = validCandidates[k];
          }
        }

        lastMappedTime = closestPeak;
        mappedCount++;
        return {
          ...line,
          time: closestPeak,
        };
      } else {
        const forwardPeaks = detectedPeakTimes.filter((p) => p > lastMappedTime);
        if (forwardPeaks.length > 0 && Math.abs(forwardPeaks[0] - origTime) <= searchTolerance * 1.8) {
          const snapped = forwardPeaks[0];
          lastMappedTime = snapped;
          mappedCount++;
          return {
            ...line,
            time: snapped,
          };
        } else {
          lastMappedTime = Math.max(lastMappedTime + 0.8, origTime);
          return {
            ...line,
            time: parseFloat(Math.min(lastMappedTime, duration - 0.5).toFixed(2)),
          };
        }
      }
    });

    return {
      updatedLines,
      peaksFound: detectedPeakTimes.length,
      mappedCount,
    };
  }
}
