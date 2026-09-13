export interface AppSettingsDoc {
  $id: string;
  paystackUrl?: string;
  flutterwaveUrl?: string;
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  isDonationsEnabled: boolean;
}

export interface Speaker {
  $id: string;
  name: string;
  slug: string;
  bio: string;
  imageUrl: string;
  featured: boolean;
  createdAt: string;
}

export interface Series {
  $id: string;
  title: string;
  slug: string;
  speakerId: string;
  description: string;
  artworkUrl: string;
  category: string;
  tags?: string[];
  episodeCount: number;
  createdAt: string;
}

export interface Episode {
  $id: string;
  title: string;
  slug: string;
  seriesId?: string;
  speakerId?: string;
  audioUrl: string;
  duration: number;
  publishedAt: string;
  description: string;
  episodeNumber: number;
  tags?: string[];
  isStandalone?: boolean;
}

export interface Dua {
  $id: string;
  title: string;
  arabic: string;
  transliteration?: string;
  translation: string;
  reference: string;
  category: DuaCategory;
  audioUrl?: string;
  sortOrder: number;
}

export type DuaCategory = 'prophetic' | 'quranic' | 'morning' | 'evening' | 'sleep' | 'travel' | 'eating' | 'general';

export interface RadioStation {
  $id: string;
  name: string;
  streamUrl: string;
  logoUrl?: string;
  description?: string;
  isLive: boolean;
}

export interface DownloadedEpisode {
  id?: number;
  episodeId: string;
  title: string;
  seriesId?: string;
  speakerId?: string;
  audioUrl: string;
  artworkUrl?: string;
  speaker?: string;
  localUri?: string;
  localBlobUrl?: string; // transient url generated at runtime
  blob?: Blob; // stored natively in indexeddb
  duration: number;
  downloadedAt: Date;
  fileSize: number;
}

export interface Favorite {
  id?: number;
  type: 'episode' | 'series' | 'dua';
  itemId: string;
  title: string;
  imageUrl?: string;
  addedAt: Date;
}

export interface Playlist {
  id?: number;
  appwriteId?: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlaylistItem {
  id?: number;
  appwriteId?: string;
  playlistId: number;
  episodeId: string;
  addedAt: Date;
}

export interface PlaybackHistory {
  id?: number;
  episodeId: string;
  position: number;
  duration: number;
  playedAt: Date;
  completed: boolean;
  // Enriched fields stored at write time for Continue Listening widget
  title?: string;
  artworkUrl?: string;
  audioUrl?: string;
  speaker?: string;
}

export interface Bookmark {
  id?: number;
  episodeId: string;
  episodeTitle: string;
  speakerName?: string;
  artworkUrl?: string;
  audioUrl: string;
  position: number;
  note?: string;
  createdAt: Date;
}

export interface AppSettings {
  id?: number;
  theme: 'light' | 'dark' | 'system';
  playbackSpeed: number;
  sleepTimerMinutes?: number;
  downloadWifiOnly: boolean;
  autoDownload: boolean;
}

export type PlayerState = 'idle' | 'loading' | 'playing' | 'paused';

export type RepeatMode = 'off' | 'one' | 'all';

export interface User {
  $id: string;
  name: string;
  email: string;
  prefs?: {
    language?: 'en' | 'ha';
    following?: string[]; // Array of speaker IDs
  };
}

export interface CurrentTrack {
  id: string;
  title: string;
  audioUrl: string;
  artworkUrl?: string;
  speaker?: string;
  duration: number;
  type: 'episode' | 'radio' | 'dua';
  seriesId?: string;
  episodeNumber?: number;
}

export interface QueueItem {
  id: string;
  title: string;
  audioUrl: string;
  artworkUrl?: string;
  speaker?: string;
  duration: number;
  type: 'episode' | 'radio' | 'dua';
  seriesId?: string;
  episodeNumber?: number;
}