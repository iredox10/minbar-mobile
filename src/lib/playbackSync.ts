import type { CurrentTrack } from "../types";
import { getDeviceId, trySavePlaybackState } from "./appwrite";
import {
  getLocalPlaybackState,
  getUnsyncedPlaybackState,
  saveLocalPlaybackState,
} from "./db";
import type { SavedPlaybackState } from "./db";

/**
 * Local-first playback-state persistence (web parity: `AudioContext.syncState`
 * plus the window `online` drain in minbar).
 *
 * The mobile save path used to write straight to Appwrite inside a bare
 * try/catch, so a position saved while offline — or while Appwrite was simply
 * unconfigured — was silently lost forever. Every write now lands in the
 * AsyncStorage mirror first with `synced: false`; only a confirmed cloud write
 * flips that flag, and anything still pending is drained by
 * `syncPlaybackStateIfPending` once connectivity returns.
 */

/** Project a live track into the persisted (flattened) row shape. */
function toSavedState(
  deviceId: string,
  track: CurrentTrack,
  position: number,
  playbackSpeed: number,
  synced: boolean,
): SavedPlaybackState {
  return {
    deviceId,
    trackId: track.id,
    trackType: track.type,
    trackTitle: track.title,
    trackAudioUrl: track.audioUrl,
    trackArtworkUrl: track.artworkUrl,
    trackSpeaker: track.speaker,
    trackDuration: Math.floor(track.duration) || 0,
    trackSeriesId: track.seriesId,
    trackEpisodeNumber: track.episodeNumber,
    position: Math.floor(position) || 0,
    playbackSpeed,
    updatedAt: new Date(),
    synced,
  };
}

/** Rehydrate a stored row back into the track shape `trySavePlaybackState` takes. */
function fromSavedState(state: SavedPlaybackState): CurrentTrack {
  return {
    id: state.trackId,
    title: state.trackTitle,
    audioUrl: state.trackAudioUrl,
    artworkUrl: state.trackArtworkUrl,
    speaker: state.trackSpeaker,
    duration: state.trackDuration,
    type: state.trackType,
    seriesId: state.trackSeriesId,
    episodeNumber: state.trackEpisodeNumber,
  };
}

/**
 * Persist the playback position locally first, then attempt the cloud write.
 *
 * Never throws: losing the cloud copy is recoverable (the row simply stays
 * pending), but an exception here must not break the pause/transition handler
 * that called us.
 */
export async function persistPlaybackState(
  track: CurrentTrack,
  position: number,
  playbackSpeed: number,
): Promise<void> {
  let deviceId: string;
  try {
    deviceId = await getDeviceId();
  } catch {
    // No device id means no cloud key either — nothing durable to write.
    return;
  }

  const pending = toSavedState(deviceId, track, position, playbackSpeed, false);
  try {
    await saveLocalPlaybackState(pending);
  } catch {
    // Storage unavailable: fall through and still try the cloud copy.
  }

  try {
    const synced = await trySavePlaybackState(track, position, playbackSpeed);
    // Only a confirmed write clears the pending flag; otherwise the row is
    // left behind for syncPlaybackStateIfPending to drain.
    if (synced) await saveLocalPlaybackState({ ...pending, synced: true });
  } catch {
    // trySavePlaybackState already logs the failure; keep the mirror pending.
  }
}

/**
 * Drain a pending (unsynced) local row to the cloud.
 *
 * Called from the NetInfo reconnect listener and from the restore path. Safe to
 * call when nothing is pending or the network is still down — in the latter case
 * the write fails and the row stays pending for the next attempt.
 */
export async function syncPlaybackStateIfPending(): Promise<void> {
  try {
    const pending = await getUnsyncedPlaybackState();
    if (!pending) return;
    const synced = await trySavePlaybackState(
      fromSavedState(pending),
      pending.position,
      pending.playbackSpeed,
    );
    if (synced) {
      await saveLocalPlaybackState({ ...pending, synced: true });
    }
  } catch {
    // Still offline / storage error — retried on the next reconnect or launch.
  }
}

/**
 * The mirrored row for a track, used by the restore path when neither the cloud
 * doc nor local history yields a resume position. Returns undefined when the
 * mirror holds a different track or nothing at all.
 */
export async function getLocalPlaybackStateFor(
  trackId: string,
): Promise<SavedPlaybackState | undefined> {
  try {
    const deviceId = await getDeviceId();
    const state = await getLocalPlaybackState(deviceId);
    if (!state || state.trackId !== trackId) return undefined;
    return state;
  } catch {
    return undefined;
  }
}
