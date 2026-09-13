import AsyncStorage from "@react-native-async-storage/async-storage";
import { requestNotificationPermissionsAsync, setAudioModeAsync } from "expo-audio";

import { getDeviceId, savePlaybackState } from "@/lib/appwrite";
import { getLocalUri } from "@/lib/downloads";
import type { CurrentTrack, RepeatMode } from "@/types";

export async function setupPlayer(): Promise<void> {
  try {
    // Throws in Expo Go (no playback service in its manifest — the
    // enableBackgroundPlayback plugin only applies to dev/prod builds).
    // Foreground playback still works; background/lock-screen won't.
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
    });
  } catch {
    // Unsupported host (e.g. Expo Go): continue with foreground playback.
  }
  try {
    await requestNotificationPermissionsAsync();
  } catch {
    // Permission prompt may be unavailable on some platforms; playback still works.
  }
}

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

const QUEUE_STORAGE_KEY = "arewa-db:player-queue";

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
