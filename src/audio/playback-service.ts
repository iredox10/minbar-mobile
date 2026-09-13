/**
 * @rntp/player (v5.9.2) background service registration.
 *
 * API names verified against node_modules/@rntp/player/src:
 * - audio.ts exports `registerBackgroundEventHandler(factory)` (Android-only,
 *   no-op on iOS/web) and `registerPlaybackSession(session)` (since 5.9.1).
 * - There is NO `registerPlaybackService` in V5 — that was the V4 name.
 * - Events come from the `Event` enum (events/index.ts) via
 *   `addEventListener(Event.X, listener)`.
 *
 * Design: `setCommands` defaults to `handling: 'native'` (see
 * interfaces/PlayerConfig.ts), so transport keys are executed natively without
 * JS. This module therefore only needs to EXIST so Android has a headless-JS
 * handler registered for killed-state/background delivery. Handlers below are
 * deliberately minimal, log-free, and best-effort mirrors of the native
 * actions (they only run when a command uses `handling: 'js'`/`'hybrid'`).
 *
 * NOT handled here: `Event.MediaItemTransition` — queue/UI state is owned by
 * the UI context (PlayerContext), which subscribes via `addEventListener`.
 *
 * The playback engine owns `setupPlayer()` — do NOT call it from this module.
 */
import { PermissionsAndroid, Platform, type Permission } from "react-native";
import TrackPlayer, { Event } from "@rntp/player";
import type { BackgroundEvent } from "@rntp/player";

/**
 * V4-era duck event name. It has no member in the V5 `Event` enum (verified
 * against src/events/*) and ducking is handled natively via audio focus, so
 * this is matched for forward-compat only and intentionally does nothing.
 */
const LEGACY_REMOTE_DUCK = "event.remote-duck" as Event;

let registered = false;

/**
 * Register the Android headless-JS background event handler. Safe to call on
 * any platform (`registerBackgroundEventHandler` is an Android-only no-op
 * elsewhere) and idempotent — subsequent calls are ignored.
 *
 * Must run at the JS entry point (root index.js) so the handler is registered
 * even when the app was killed and Android spins up headless JS for a media
 * key / notification action.
 */
export function registerTrackPlayerService(): void {
  if (registered) return;
  registered = true;
  TrackPlayer.registerBackgroundEventHandler(() => async (event: BackgroundEvent) => {
    try {
      switch (event.type) {
        case Event.RemotePlay:
          TrackPlayer.play();
          break;
        case Event.RemotePause:
          TrackPlayer.pause();
          break;
        case Event.RemoteNext:
          TrackPlayer.skipToNext();
          break;
        case Event.RemotePrevious:
          TrackPlayer.skipToPrevious();
          break;
        case Event.RemoteStop:
          TrackPlayer.stop();
          break;
        case Event.RemoteSeek:
          TrackPlayer.seekTo(event.position);
          break;
        case Event.RemoteSkipForward:
          TrackPlayer.seekBy(event.interval);
          break;
        case Event.RemoteSkipBackward:
          TrackPlayer.seekBy(-event.interval);
          break;
        case LEGACY_REMOTE_DUCK:
          // Native audio-focus ducking handles this; no JS action needed.
          break;
        default:
          break;
      }
    } catch {
      // Best-effort only: background budget is ~5s, never throw past the bridge.
    }
  });
}

/**
 * Request Android 13+ (API 33+) runtime POST_NOTIFICATIONS permission for the
 * media notification. Resolves true when notifications may be posted (granted
 * or not applicable), false when denied/unavailable.
 *
 * Uses only `PermissionsAndroid` from react-native — no new dependencies.
 */
export async function requestMediaNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    const permissions = PermissionsAndroid.PERMISSIONS as { POST_NOTIFICATIONS?: Permission };
    const postNotifications = permissions.POST_NOTIFICATIONS;
    // RN versions predating API 33 have no POST_NOTIFICATIONS constant; the
    // runtime permission model doesn't apply there — treat as granted.
    if (!postNotifications) return true;
    if (await PermissionsAndroid.check(postNotifications)) return true;
    const result = await PermissionsAndroid.request(postNotifications);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}
