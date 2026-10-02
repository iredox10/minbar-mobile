import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  AppSettings,
  Bookmark,
  DownloadedEpisode,
  Favorite,
  PlaybackHistory,
  Playlist,
  PlaylistItem,
} from "../types";

/**
 * AsyncStorage-backed store that mirrors the web app's Dexie `db.ts` API
 * surface (function names + signatures) so callers port unchanged. Downloads &
 * playlists (which need real files / larger payloads) are added in Phase 3.
 */

function key(store: string): string {
  return `arewa-db:${store}`;
}

async function read<T>(store: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key(store));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Allocate the next auto-increment id for a collection.
 *
 * The naive `(all.length ? all[all.length - 1].id : 0) + 1` pattern assumes the
 * array is ascending-by-id *and* gap-free. Removals use `.filter()`, so after
 * deleting the highest-id row the next insert could collide with an existing id.
 * Taking the max keeps ids unique regardless of ordering or gaps.
 */
function nextId(all: { id?: number }[]): number {
  return Math.max(0, ...all.map((row) => row.id ?? 0)) + 1;
}

async function write<T>(store: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key(store), JSON.stringify(value));
}

// ─── Favorites ──────────────────────────────────────────────────────────────

export async function addFavorite(favorite: Omit<Favorite, "id">): Promise<number> {
  const all = await read<Favorite[]>("favorites", []);
  const existing = all.find((f) => f.type === favorite.type && f.itemId === favorite.itemId);
  if (existing) return existing.id ?? 1;
  const next: Favorite = { ...favorite, id: nextId(all) };
  await write("favorites", [...all, next]);
  return next.id!;
}

export async function removeFavorite(type: "episode" | "series" | "dua", itemId: string): Promise<void> {
  const all = await read<Favorite[]>("favorites", []);
  await write(
    "favorites",
    all.filter((f) => !(f.type === type && f.itemId === itemId)),
  );
}

export async function isFavorite(type: "episode" | "series" | "dua", itemId: string): Promise<boolean> {
  const all = await read<Favorite[]>("favorites", []);
  return all.some((f) => f.type === type && f.itemId === itemId);
}

export async function getFavorites(type?: "episode" | "series" | "dua"): Promise<Favorite[]> {
  const all = await read<Favorite[]>("favorites", []);
  const filtered = type ? all.filter((f) => f.type === type) : all;
  return filtered.sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime());
}

// ─── Settings ───────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: Omit<AppSettings, "id"> = {
  theme: "dark",
  playbackSpeed: 1,
  downloadWifiOnly: true,
  autoDownload: false,
};

export async function getSettings(): Promise<AppSettings | undefined> {
  return read<AppSettings | undefined>("settings", undefined);
}

export async function getOrCreateSettings(): Promise<AppSettings> {
  const existing = await getSettings();
  if (existing) return existing;
  const settings: AppSettings = { id: 1, ...DEFAULT_SETTINGS };
  await write("settings", settings);
  return settings;
}

export async function updateSettings(updates: Partial<AppSettings>): Promise<void> {
  const existing = await getSettings();
  const next: AppSettings = { ...(existing ?? DEFAULT_SETTINGS), id: existing?.id ?? 1, ...updates };
  await write("settings", next);
}

// ─── Playback history ───────────────────────────────────────────────────────

export async function addHistoryEntry(meta: {
  episodeId: string;
  title?: string;
  artworkUrl?: string;
  audioUrl?: string;
  speaker?: string;
  position?: number;
  duration?: number;
}): Promise<void> {
  const { episodeId, position, duration, ...rest } = meta;
  await updatePlaybackProgress(episodeId, position ?? 0, duration ?? 0, false, rest);
}

export async function getPlaybackHistory(episodeId: string): Promise<PlaybackHistory | undefined> {
  const all = await read<PlaybackHistory[]>("history", []);
  return all.find((h) => h.episodeId === episodeId);
}

export async function updatePlaybackProgress(
  episodeId: string,
  position: number,
  duration: number,
  completed: boolean = false,
  meta?: { title?: string; artworkUrl?: string; audioUrl?: string; speaker?: string },
): Promise<void> {
  const all = await read<PlaybackHistory[]>("history", []);
  const existing = all.find((h) => h.episodeId === episodeId);
  const record: PlaybackHistory = {
    ...(existing ?? {}),
    episodeId,
    position,
    duration,
    playedAt: new Date(),
    completed,
    ...(meta ?? {}),
  };
  if (existing) {
    await write(
      "history",
      all.map((h) => (h.episodeId === episodeId ? record : h)),
    );
  } else {
    const next = [...all, record];
    next.sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
    await write("history", next);
  }
}

export async function getRecentHistory(limit: number = 20): Promise<PlaybackHistory[]> {
  const all = await read<PlaybackHistory[]>("history", []);
  return all.sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime()).slice(0, limit);
}

export async function getInProgressHistory(limit: number = 10): Promise<PlaybackHistory[]> {
  const all = await read<PlaybackHistory[]>("history", []);
  return all
    .filter((h) => {
      if (!h.duration || h.duration === 0) return false;
      const ratio = h.position / h.duration;
      return ratio >= 0.05 && ratio <= 0.95;
    })
    .sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime())
    .slice(0, limit);
}

export async function clearHistory(): Promise<void> {
  await write("history", []);
}

export async function deleteHistoryEntry(episodeId: string): Promise<void> {
  const all = await read<PlaybackHistory[]>("history", []);
  await write(
    "history",
    all.filter((h) => h.episodeId !== episodeId),
  );
}

// ─── Playback state (local mirror of the cloud `user_playback` doc) ─────────

/**
 * Local-first mirror of the device's playback position (web parity: minbar
 * `db.ts` `SavedPlaybackState`). Written on every pause/track change *before*
 * the cloud write is attempted, so a position saved while offline or logged
 * out survives a cold start. `synced` is false until the cloud write succeeds;
 * `syncPlaybackStateIfPending` drains it once connectivity returns.
 *
 * Only one row exists per install (the app has a single stable device id), but
 * the collection is stored as an array so the deviceId lookup mirrors the web
 * Dexie table and survives a device-id change.
 */
export interface SavedPlaybackState {
  deviceId: string;
  trackId: string;
  trackType: "episode" | "radio" | "dua";
  trackTitle: string;
  trackAudioUrl: string;
  trackArtworkUrl?: string;
  trackSpeaker?: string;
  trackDuration: number;
  trackSeriesId?: string;
  trackEpisodeNumber?: number;
  position: number;
  playbackSpeed: number;
  /** Revived from the JSON string on read — see `readPlaybackStates`. */
  updatedAt: Date;
  synced: boolean;
}

/** AsyncStorage has no Date revival, so rehydrate `updatedAt` on every read. */
function readPlaybackStates(): Promise<SavedPlaybackState[]> {
  return read<SavedPlaybackState[]>("playback-state", []).then((rows) =>
    rows.map((row) => ({ ...row, updatedAt: new Date(row.updatedAt) })),
  );
}

export async function saveLocalPlaybackState(
  state: Omit<SavedPlaybackState, "id">,
): Promise<void> {
  const all = await readPlaybackStates();
  const existing = all.find((row) => row.deviceId === state.deviceId);
  if (existing) {
    await write(
      "playback-state",
      all.map((row) => (row.deviceId === state.deviceId ? { ...state } : row)),
    );
  } else {
    await write("playback-state", [...all, { ...state }]);
  }
}

export async function getLocalPlaybackState(
  deviceId: string,
): Promise<SavedPlaybackState | undefined> {
  const all = await readPlaybackStates();
  return all.find((row) => row.deviceId === deviceId);
}

export async function clearLocalPlaybackState(deviceId: string): Promise<void> {
  const all = await readPlaybackStates();
  await write(
    "playback-state",
    all.filter((row) => row.deviceId !== deviceId),
  );
}

/** The single offline-playback row awaiting a cloud write, if any. */
export async function getUnsyncedPlaybackState(): Promise<SavedPlaybackState | undefined> {
  const all = await readPlaybackStates();
  return all.find((row) => !row.synced);
}

// ─── Bookmarks ──────────────────────────────────────────────────────────────

export async function addBookmark(bookmark: Omit<Bookmark, "id">): Promise<number> {
  const all = await read<Bookmark[]>("bookmarks", []);
  const id = nextId(all);
  await write("bookmarks", [...all, { ...bookmark, id }]);
  return id;
}

export async function getBookmarks(episodeId?: string): Promise<Bookmark[]> {
  const all = await read<Bookmark[]>("bookmarks", []);
  if (episodeId) {
    return all.filter((b) => b.episodeId === episodeId).sort((a, b) => a.position - b.position);
  }
  return all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function deleteBookmark(id: number): Promise<void> {
  const all = await read<Bookmark[]>("bookmarks", []);
  await write(
    "bookmarks",
    all.filter((b) => b.id !== id),
  );
}

// ─── Downloads ──────────────────────────────────────────────────────────────

export async function addDownload(record: Omit<DownloadedEpisode, "id">): Promise<number> {
  const all = await read<DownloadedEpisode[]>("downloads", []);
  const existing = all.find((d) => d.episodeId === record.episodeId);
  if (existing) return existing.id ?? 1;
  const next: DownloadedEpisode = {
    ...record,
    id: nextId(all),
  };
  await write("downloads", [...all, next]);
  return next.id!;
}

export async function removeDownload(id: number): Promise<void> {
  const all = await read<DownloadedEpisode[]>("downloads", []);
  await write(
    "downloads",
    all.filter((d) => d.id !== id),
  );
}

export async function getDownloads(): Promise<DownloadedEpisode[]> {
  const all = await read<DownloadedEpisode[]>("downloads", []);
  return all.sort((a, b) => b.downloadedAt.getTime() - a.downloadedAt.getTime());
}

export async function isDownloaded(episodeId?: string): Promise<boolean> {
  if (!episodeId) return false;
  const all = await read<DownloadedEpisode[]>("downloads", []);
  return all.some((d) => d.episodeId === episodeId);
}

// ─── Playlists ──────────────────────────────────────────────────────────────

export async function createPlaylist(name: string, description?: string): Promise<number> {
  const all = await read<Playlist[]>("playlists", []);
  const now = new Date();
  const next: Playlist = {
    id: nextId(all),
    name,
    description,
    createdAt: now,
    updatedAt: now,
  };
  await write("playlists", [...all, next]);
  return next.id!;
}

/**
 * Update mutable playlist fields (web parity: minbar `updatePlaylist`).
 * Fields left `undefined` are preserved, so `description` survives a rename.
 */
export async function updatePlaylist(
  id: number,
  updates: { name?: string; description?: string },
): Promise<void> {
  const all = await read<Playlist[]>("playlists", []);
  await write(
    "playlists",
    all.map((p) => (p.id === id ? { ...p, ...updates, updatedAt: new Date() } : p)),
  );
}

/** Name-only convenience wrapper kept for existing call sites. */
export async function renamePlaylist(id: number, name: string): Promise<void> {
  await updatePlaylist(id, { name });
}

export async function deletePlaylist(id: number): Promise<void> {
  const playlists = await read<Playlist[]>("playlists", []);
  const items = await read<PlaylistItem[]>("playlist-items", []);
  await write(
    "playlists",
    playlists.filter((p) => p.id !== id),
  );
  await write(
    "playlist-items",
    items.filter((i) => i.playlistId !== id),
  );
}

export async function getPlaylists(): Promise<Playlist[]> {
  const all = await read<Playlist[]>("playlists", []);
  return all.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export async function getPlaylistItemCounts(): Promise<Record<number, number>> {
  const items = await read<PlaylistItem[]>("playlist-items", []);
  const counts: Record<number, number> = {};
  for (const item of items) {
    counts[item.playlistId] = (counts[item.playlistId] ?? 0) + 1;
  }
  return counts;
}

export async function getPlaylistItems(playlistId: number): Promise<PlaylistItem[]> {
  const all = await read<PlaylistItem[]>("playlist-items", []);
  return all
    .filter((i) => i.playlistId === playlistId)
    .sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime());
}

export async function addPlaylistItem(playlistId: number, episodeId: string): Promise<void> {
  const all = await read<PlaylistItem[]>("playlist-items", []);
  if (all.some((i) => i.playlistId === playlistId && i.episodeId === episodeId)) return;
  const next: PlaylistItem = {
    id: nextId(all),
    playlistId,
    episodeId,
    addedAt: new Date(),
  };
  await write("playlist-items", [...all, next]);
  const playlists = await read<Playlist[]>("playlists", []);
  await write(
    "playlists",
    playlists.map((p) => (p.id === playlistId ? { ...p, updatedAt: new Date() } : p)),
  );
}

export async function removePlaylistItem(id: number): Promise<void> {
  const all = await read<PlaylistItem[]>("playlist-items", []);
  await write(
    "playlist-items",
    all.filter((i) => i.id !== id),
  );
}

// ─── Sync helpers (Appwrite roaming, web parity with minbar sync.ts) ─────────

export async function getAllPlaylistItems(): Promise<PlaylistItem[]> {
  return read<PlaylistItem[]>("playlist-items", []);
}

export async function setPlaylistAppwriteId(id: number, appwriteId: string): Promise<void> {
  const all = await read<Playlist[]>("playlists", []);
  await write(
    "playlists",
    all.map((p) => (p.id === id ? { ...p, appwriteId, updatedAt: new Date() } : p)),
  );
}

export async function setPlaylistItemAppwriteId(id: number, appwriteId: string): Promise<void> {
  const all = await read<PlaylistItem[]>("playlist-items", []);
  await write(
    "playlist-items",
    all.map((i) => (i.id === id ? { ...i, appwriteId } : i)),
  );
}