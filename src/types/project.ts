import { LyricLine, AspectRatio, SpotifyDisplayMode, SpotifyTheme, TrackMeta } from './lyrics';

export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  trackMeta: {
    title: string;
    artist: string;
    album: string;
    duration: number;
    audioFileName?: string;
    videoFileName?: string;
  };
  lyricsCount: number;
  hasAudio: boolean;
  hasVideo: boolean;
  aspectRatio: AspectRatio;
  displayMode: SpotifyDisplayMode;
  theme: SpotifyTheme;
  showTranslation: boolean;
  thumbnailUrl?: string | null;
}

export interface ProjectData {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  trackMeta: TrackMeta;
  lyrics: LyricLine[];
  aspectRatio: AspectRatio;
  displayMode: SpotifyDisplayMode;
  theme: SpotifyTheme;
  showTranslation: boolean;
  audioBlob?: Blob | null;
  videoBlob?: Blob | null;
  thumbnailUrl?: string | null;
}
