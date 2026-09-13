import AsyncStorage from "@react-native-async-storage/async-storage";
import TrackPlayer, { PlayerCommand } from "@rntp/player";
import type { MediaItem } from "@rntp/player";

import { getDeviceId, savePlaybackState } from "@/lib/appwrite";
import { getLocalUri } from "@/lib/downloads";
import type { CurrentTrack, RepeatMode } from "@/types";

export { albumTitleForType, mediaItemToTrack, toMediaItem } from "./tracks";
export type { AudioTrackType } from "./tracks";

let didSetup = false;

/**
 * One-time @rntp/player setup (speech content, Arewa playback channel,
 * OS remote-command capabilities). Safe to call repeatedly — later calls
 * are ignored. Throws a friendly Error only on hard setup failure so the
 * engine can surface audioError.
 */
export async function setupPlayer(): Promise<void> {
  if (didSetup) return;
  try {
    TrackPlayer.setupPlayer({
      contentType: "speech",
      android: {
        // NOTE: smallIcon is typed as required but is nullable/optional in
        // the native Kotlin config — omitted here via cast (no custom icon
        // resource shipped yet).
        notification: {
          channelId: "arewa-playback",
          channelName: "Arewa Central Playback",
        } as { channelId: string; channelName: string; smallIcon: string },
      },
    });
  } catch {
    throw new Error(
      "Audio player failed to start. Please restart the app and try again.",
    );
  }
  try {
    TrackPlayer.setCommands({
      capabilities: [
        PlayerCommand.PlayPause,
        PlayerCommand.Next,
        PlayerCommand.Previous,
        PlayerCommand.Stop,
        PlayerCommand.Seek,
        PlayerCommand.SkipForward,
        PlayerCommand.SkipBackward,
      ],
      forwardInterval: 30,
      backwardInterval: 15,
    });
  } catch {
    // Remote-command config is best-effort; playback works without it.
  }
  didSetup = true;
}

/**
 * Native (notification shade / lock screen / Control Center) presentation.
 * Pure helper — kept for engine reuse; the native session owns OS controls.
 */
export function buildLockScreenMetadata(track: CurrentTrack) {
  return {
    title: track.title || "Arewa Central",
    artist:
      track.speaker ||
      (track.type === "radio" ? "Live Radio" : track.type === "dua" ? "Dua" : "Arewa Central"),
    albumTitle:
      track.type === "radio"
        ? "Live Radio • Arewa Central"
        : track.type === "dua"
          ? "Duas • Arewa Central"
          : "Arewa Central",
    artworkUrl: track.artworkUrl,
  };
}

export function buildLockScreenOptions(track: CurrentTrack) {
  const seekable = track.type !== "radio";
  return {
    // ±10s seek buttons in the notification / lock screen (episodes & duas).
    showSeekForward: seekable,
    showSeekBackward: seekable,
    // Live radio: hides duration + scrub bar, disables seek.
    isLiveStream: track.type === "radio",
  };
}

/**
 * No-ops kept for engine compatibility. The native @rntp/player session owns
 * OS controls now — no per-player activation needed. Accepts either the old
 * (player, track) shape or a bare track.
 */
export function setActiveTrackControls(_playerOrTrack?: unknown, _track?: CurrentTrack): void {
  // Intentionally empty.
}

/** No-op kept for engine compatibility (see above). */
export function refreshLockScreenMetadata(
  _playerOrTrack?: unknown,
  _track?: CurrentTrack,
): void {
  // Intentionally empty.
}

/** No-op kept for engine compatibility (see above). */
export function deactivateLockScreen(_playerOrTrack?: unknown): void {
  // Intentionally empty.
}

// Re-export the MediaItem type for engine convenience.
export type { MediaItem };

/**
 * Prefer an on-device file when the episode was downloaded (web parity with
 * the local blob URL preference). Falls back to the remote URL.
 */
export async function resolveLocalAudio(track: CurrentTrack): Promise<string> {
  if (track.type !== "episode") return track.audioUrl;
  try {
    const localUri = await getLocalUri(track.id);
    return localUri ?? track.audioUrl;
  } catch {
    return track.audioUrl;
  }
}

/**
 * Best-effort cloud sync of playback state (device-keyed, same schema as the
 * web app). Ensures a device id exists via the appwrite lib. Never throws —
 * local history remains the source of truth when offline/unconfigured.
 */
export async function persistCloudState(
  track: CurrentTrack,
  position: number,
  playbackSpeed: number,
): Promise<void> {
  try {
    await getDeviceId();
    await savePlaybackState(track, position, playbackSpeed);
  } catch {
    // Offline or backend unavailable: ignore, will sync on next pause/finish.
  }
}

export const QUEUE_STORAGE_KEY = "arewa-db:player-queue";

export interface PersistedQueueState {
  queue: CurrentTrack[];
  index: number;
  repeat: RepeatMode;
}

/** Persist queue + index + repeat mode (best-effort). */
export async function saveQueueState(state: PersistedQueueState): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full/unavailable: playback continues without persistence.
  }
}

/** Restore persisted queue state, or null when nothing valid was stored. */
export async function loadQueueState(): Promise<PersistedQueueState | null> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedQueueState>;
    if (!Array.isArray(parsed.queue)) return null;
    const repeat: RepeatMode =
      parsed.repeat === "one" || parsed.repeat === "all" ? parsed.repeat : "off";
    const index =
      typeof parsed.index === "number" && Number.isFinite(parsed.index) ? parsed.index : 0;
    const queue = parsed.queue.filter(
      (t): t is CurrentTrack =>
        !!t && typeof t.id === "string" && typeof t.audioUrl === "string",
    );
    if (queue.length === 0) return null;
    return { queue, index, repeat };
  } catch {
    return null;
  }
}
