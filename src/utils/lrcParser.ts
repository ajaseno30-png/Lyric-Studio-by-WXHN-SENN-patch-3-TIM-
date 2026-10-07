import { LyricLine } from '../types/lyrics';

/**
 * Format seconds to mm:ss.xx format
 */
export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00.00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hundredths = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
}

/**
 * Format seconds to standard Spotify mm:ss format
 */
export function formatPlayerTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Parse standard LRC format string into LyricLine array
 */
export function parseLRC(lrcText: string): LyricLine[] {
  const lines = lrcText.split('\n');
  const result: LyricLine[] = [];
  const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    let match;
    timeRegex.lastIndex = 0;
    const matches: number[] = [];

    while ((match = timeRegex.exec(rawLine)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const hundredths = match[3] ? parseFloat(`0.${match[3]}`) : 0;
      matches.push(minutes * 60 + seconds + hundredths);
    }

    const rawContent = rawLine.replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, '').trim();

    // Check for delimiter for sub-lyric/translation (// or |)
    let text = rawContent;
    let translation: string | undefined = undefined;

    if (rawContent.includes('//')) {
      const parts = rawContent.split('//');
      text = parts[0].trim();
      translation = parts.slice(1).join('//').trim();
    } else if (rawContent.includes(' | ')) {
      const parts = rawContent.split(' | ');
      text = parts[0].trim();
      translation = parts.slice(1).join(' | ').trim();
    }

    if (matches.length > 0 && text) {
      for (const time of matches) {
        result.push({
          id: `line-${i}-${Math.random().toString(36).substring(2, 7)}`,
          time,
          text,
          translation,
        });
      }
    } else if (!matches.length && text) {
      // If no timestamp, assign an incrementing placeholder
      result.push({
        id: `line-${i}-${Math.random().toString(36).substring(2, 7)}`,
        time: result.length * 4.0,
        text,
        translation,
      });
    }
  }

  // Sort chronologically
  return result.sort((a, b) => a.time - b.time);
}

/**
 * Convert LyricLine array into LRC string format
 */
export function exportLRC(lyrics: LyricLine[]): string {
  return lyrics
    .map((line) => {
      const mins = Math.floor(line.time / 60).toString().padStart(2, '0');
      const secs = Math.floor(line.time % 60).toString().padStart(2, '0');
      const hundredths = Math.floor((line.time % 1) * 100).toString().padStart(2, '0');
      const content = line.translation ? `${line.text} // ${line.translation}` : line.text;
      return `[${mins}:${secs}.${hundredths}] ${content}`;
    })
    .join('\n');
}

/**
 * Find the currently active lyric line index based on current playback time
 */
export function findActiveLyricIndex(lyrics: LyricLine[], currentTime: number): number {
  if (!lyrics.length) return -1;
  let activeIndex = -1;

  for (let i = 0; i < lyrics.length; i++) {
    if (currentTime >= lyrics[i].time) {
      activeIndex = i;
    } else {
      break;
    }
  }

  return activeIndex;
}

/**
 * Default sample lyrics with bilingual translations for instant demonstration
 */
export const DEFAULT_DEMO_LYRICS: LyricLine[] = [
  { id: '1', time: 1.5, text: 'Di dalam temaram malam yang sunyi', translation: 'In the quiet twilight of the midnight hour' },
  { id: '2', time: 5.8, text: 'Kelopak bunga perlahan bernapas', translation: 'Petals of the flower begin to breathe' },
  { id: '3', time: 10.2, text: 'Cahaya lembut merayap di atas kanvas', translation: 'Soft light slowly sweeps across the canvas' },
  { id: '4', time: 14.6, text: 'Menyingkap rahasia bayangan yang terlelap', translation: 'Revealing slumbering shadows beneath' },
  { id: '5', time: 19.4, text: 'Saat hembusan angin malam berbisik pelan', translation: 'As the gentle nighttime breeze softly whispers' },
  { id: '6', time: 24.0, text: 'Warna indigo menari di sudut kenangan', translation: 'Deep indigo dances in memory’s embrace' },
  { id: '7', time: 28.8, text: 'Kutemukan damai di balik keheningan', translation: 'Finding peace behind the timeless stillness' },
  { id: '8', time: 33.5, text: 'Sebuah nocturne abadi yang takkan pudar', translation: 'An eternal nocturne that never fades' },
];
