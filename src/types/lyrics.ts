export type AspectRatio = '9:16' | '1:1' | '16:9';

export interface LyricLine {
  id: string;
  time: number; // in seconds
  text: string;
  translation?: string; // Sub-lyric, translation, or phonetic reading
}

export interface TrackMeta {
  title: string;
  artist: string;
  album: string;
  audioUrl: string | null;
  audioFileName?: string;
  audioFile?: File | Blob | null;
  videoUrl: string | null;
  videoFileName?: string;
  videoFile?: File | Blob | null;
  imageUrl?: string | null;
  duration: number; // in seconds
}

export type SpotifyDisplayMode = 'now_playing' | 'expanded_lyrics' | 'canvas_subtitles';

export type SpotifyTheme =
  | 'emerald'
  | 'charcoal'
  | 'midnight'
  | 'indigo'
  | 'amber'
  | 'cool_gray'
  | 'purple_orchid'
  | 'gold_kamboja'
  | 'pink_sakura'
  | 'red_amaranth'
  | 'green_poison'
  | 'dark_tree_brown';

export interface ThemeConfig {
  id: SpotifyTheme;
  name: string;
  accentColor: string; // e.g. #1DB954
  bgGradient: string;
  lyricsCardBg: string;
}
