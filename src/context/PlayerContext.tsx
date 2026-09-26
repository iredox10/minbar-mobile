import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { EmitterSubscription } from "react-native";
import TrackPlayer, {
  Event,
  PlaybackState,
  RepeatMode as NativeRepeatMode,
} from "@rntp/player";
import type { MediaItem } from "@rntp/player";

import {
  loadQueueState,
  mediaItemToTrack,
  persistCloudState,
  resolveLocalAudio,
  saveQueueState,
  setupPlayer,
  toMediaItem,
} from "@/audio/player";
import {
  addHistoryEntry,
  getPlaybackHistory,
  getSettings,
  updatePlaybackProgress,
  updateSettings,
} from "@/lib/db";
import { PLAYBACK_SPEEDS } from "@/lib/utils";
import { clearPlaybackState } from "@/lib/appwrite";
import { trackPlayComplete, trackPlayStart } from "@/lib/analytics";
import type { CurrentTrack, RepeatMode } from "@/types";

interface PlayerContextValue {
  track: CurrentTrack | null;
  queue: CurrentTrack[];
  queueIndex: number;
  repeatMode: RepeatMode;
  isPlaying: boolean;
  isBuffering: boolean;
  position: number;
  duration: number;
  rate: number;
  hasNext: boolean;
  hasPrevious: boolean;
  isReady: boolean;
  sleepTimerMinutes: number | null;
  sleepRemaining: number | null;
  volume: number;
  isMuted: boolean;
  audioError: string | null;
  playEpisode: (track: CurrentTrack, queue?: CurrentTrack[]) => Promise<void>;
  playTrackImmediately: (track: CurrentTrack) => Promise<void>;
  togglePlay: () => Promise<void>;
  seek: (seconds: number) => Promise<void>;
  skipNext: () => Promise<void>;
  skipPrevious: () => Promise<void>;
  changeSpeed: () => Promise<void>;
  setSpeed: (speed: number) => Promise<void>;
  setRepeatMode: (mode: RepeatMode) => void;
  setVolume: (v: number) => Promise<void>;
  toggleMute: () => Promise<void>;
  addToQueue: (track: CurrentTrack) => void;
  removeFromQueue: (index: number) => void;
  jumpToIndex: (index: number) => Promise<void>;
  /** Jump to a queued track from the Up Next sheet (web parity: jumpToQueueIndex). */
  jumpToQueueIndex: (index: number) => void;
  clearQueue: () => void;
  setSleepTimer: (minutes: number) => void;
  cancelSleepTimer: () => void;
  stop: () => Promise<void>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

const NATIVE_UNAVAILABLE_MESSAGE =
  "Native player unavailable — use a dev build (bunx expo run:android/ios)";

/** Module-level guard: setupPlayer() must run exactly once (double setup throws). */
let sharedSetupPromise: Promise<void> | null = null;
function ensureSetupOnce(): Promise<void> {
  if (!sharedSetupPromise) {
    sharedSetupPromise = Promise.resolve().then(() => setupPlayer());
  }
  return sharedSetupPromise;
}

function toNativeRepeatMode(mode: RepeatMode): NativeRepeatMode {
  switch (mode) {
    case "one":
      return NativeRepeatMode.One;
    case "all":
      return NativeRepeatMode.All;
    default:
      return NativeRepeatMode.Off;
  }
}

function trackMeta(track: CurrentTrack) {
  return {
    title: track.title,
    artworkUrl: track.artworkUrl,
    audioUrl: track.audioUrl,
    speaker: track.speaker,
  };
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [track, setTrack] = useState<CurrentTrack | null>(null);
  const [queue, setQueue] = useState<CurrentTrack[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [repeatMode, setRepeatModeState] = useState<RepeatMode>("off");
  const [rate, setRateState] = useState(1);
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null);
  // Poll-driven playback state (500ms getProgress()/isPlaying()/getPlaybackState()).
  const [position, setPositionState] = useState(0);
  const [polledDuration, setPolledDuration] = useState(0);
  const [isPlaying, setIsPlayingState] = useState(false);
  const [isBuffering, setIsBufferingState] = useState(false);
  const [volume, setVolumeState] = useState(1);
  const [audioError, setAudioError] = useState<string | null>(null);

  const duration = polledDuration > 0 ? polledDuration : track?.duration || 0;

  const positionRef = useRef(position);
  positionRef.current = position;
  const durationRef = useRef(duration);
  durationRef.current = duration;

  const queueRef = useRef<CurrentTrack[]>([]);
  queueRef.current = queue;
  const queueIndexRef = useRef(queueIndex);
  queueIndexRef.current = queueIndex;
  const repeatModeRef = useRef<RepeatMode>("off");
  repeatModeRef.current = repeatMode;
  const restoredRef = useRef(false);
  const trackRef = useRef<CurrentTrack | null>(track);
  trackRef.current = track;
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const playingRef = useRef(false);
  const volumeRef = useRef(1);
  volumeRef.current = volume;
  const lastVolumeRef = useRef(1);
  const nativeAvailableRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  // Resume offset for the restored queue: applied via seekTo after the first
  // play that targets the restored index.
  const resumeOffsetRef = useRef<number | null>(null);
  const resumeIndexRef = useRef(0);
  const resumeTrackIdRef = useRef<string | null>(null);
  const sleepDeadlineRef = useRef<number | null>(null);
  const lastSaveRef = useRef(0);

  const isMuted = volume === 0;

  // Persist progress when playback pauses from ANY source — in-app button,
  // notification / lock-screen pause, headset disconnect, audio interruption.
  // (OS remote presses drive the native player directly, bypassing togglePlay.)
  const saveProgressOnPause = useCallback(() => {
    const current = trackRef.current;
    if (!current || current.type === "radio") return;
    const pos = Math.floor(positionRef.current);
    const total = Math.floor(durationRef.current || current.duration || 0);
    updatePlaybackProgress(current.id, pos, total, false, trackMeta(current)).catch(() => {});
    void persistCloudState(current, pos, rateRef.current);
  }, []);

  /**
   * Shared new-track transition path: history-save the previous track
   * (completed only when pos≈dur), move JS queueIndex/track to `index`,
   * then history + analytics + cloud for the new track.
   * Idempotent — whichever runs first (manual post-skip sync or the
   * MediaItemTransition event) wins; the other becomes a no-op.
   */
  const handleTrackTransition = useCallback(async (index: number, item: MediaItem | null) => {
    const q = queueRef.current;
    if (index < 0 || index >= q.length) return;
    let next: CurrentTrack | null = q[index] ?? null;
    if (!next && item) {
      try {
        next = await mediaItemToTrack(item);
      } catch {
        next = null;
      }
    }
    if (!next) return;
    const prev = trackRef.current;
    if (prev?.id === next.id && queueIndexRef.current === index) return;
    if (prev && prev.type !== "radio") {
      const pos = Math.floor(positionRef.current);
      const total = Math.floor(durationRef.current || prev.duration || 0);
      const finished = total > 0 && pos >= total - 5;
      updatePlaybackProgress(
        prev.id,
        finished ? total : pos,
        total,
        finished,
        trackMeta(prev),
      ).catch(() => {});
    }
    queueIndexRef.current = index;
    setQueueIndex(index);
    trackRef.current = next;
    setTrack(next);
    setAudioError(null);
    addHistoryEntry({
      episodeId: next.id,
      title: next.title,
      artworkUrl: next.artworkUrl,
      audioUrl: next.audioUrl,
      speaker: next.speaker,
      position: 0,
      duration: next.duration,
    }).catch(() => {});
    if (next.type === "episode" || next.type === "radio") {
      trackPlayStart(next.id, next.type, next.title);
    }
    void persistCloudState(next, 0, rateRef.current);
  }, []);

  /** Read the native active index and run the shared transition path. */
  const syncIndexFromNative = useCallback(
    (expectedIndex: number | null) => {
      let nativeIndex: number | null = null;
      try {
        nativeIndex = TrackPlayer.getActiveMediaItemIndex();
      } catch {
        nativeIndex = null;
      }
      const q = queueRef.current;
      const target =
        nativeIndex != null && nativeIndex >= 0 && nativeIndex < q.length
          ? nativeIndex
          : expectedIndex;
      if (target == null || target < 0 || target >= q.length) return;
      void handleTrackTransition(target, null);
    },
    [handleTrackTransition],
  );

  const loadAndPlay = useCallback(async (next: CurrentTrack, index: number) => {
    if (!nativeAvailableRef.current) return;
    setAudioError(null);
    try {
      if (next.type === "radio") {
        TrackPlayer.setPlaybackSpeed(1);
      } else {
        TrackPlayer.setPlaybackSpeed(rateRef.current);
      }
      // Native queue mirrors the app queue 1:1 by index (mediaId=track.id
      // via toMediaItem). Rebuild + seek to index, then play.
      const q = queueRef.current;
      // Prefer the downloaded file for the active item (web parity).
      let activeUrl: string | undefined;
      try {
        activeUrl = await resolveLocalAudio(next);
      } catch {
        activeUrl = undefined;
      }
      const mapped = q.map((t, i) => toMediaItem(t, i === index ? activeUrl : undefined));
      TrackPlayer.setMediaItems(mapped, index);
      TrackPlayer.play();
    } catch (e) {
      setAudioError(e instanceof Error && e.message ? e.message : "Playback failed");
      return;
    }
    // Apply a pending start/resume offset after play; if the native item is
    // not ready yet, keep it pending for the next Ready state.
    const pending = pendingSeekRef.current;
    pendingSeekRef.current = null;
    if (pending != null && pending > 0) {
      try {
        TrackPlayer.seekTo(pending);
      } catch {
        pendingSeekRef.current = pending;
      }
    }
    if (next.type === "episode" || next.type === "radio") {
      trackPlayStart(next.id, next.type, next.title);
    }
    void persistCloudState(next, 0, rateRef.current);
  }, []);

  const playIndex = useCallback(
    async (index: number, startPosition?: number) => {
      const q = queueRef.current;
      if (index < 0 || index >= q.length) return;
      const next = q[index];
      const prevId = trackRef.current?.id;
      // JS state first so the UI always reflects the selection, even when
      // the native player is unavailable (e.g. Expo Go) — the error banner
      // then explains why instead of showing a blank "no track" screen.
      setQueueIndex(index);
      queueIndexRef.current = index;
      setTrack(next);
      trackRef.current = next;
      if (!nativeAvailableRef.current) {
        setAudioError(NATIVE_UNAVAILABLE_MESSAGE);
        return;
      }
      if (startPosition != null && startPosition > 0) {
        pendingSeekRef.current = startPosition;
        resumeOffsetRef.current = null;
      } else if (resumeOffsetRef.current != null) {
        // Consume the restored resume offset the first time we play; discard
        // it when the user explicitly starts a different track.
        if (index === resumeIndexRef.current && next.id === resumeTrackIdRef.current) {
          pendingSeekRef.current = resumeOffsetRef.current;
        }
        resumeOffsetRef.current = null;
        resumeTrackIdRef.current = null;
      } else if (pendingSeekRef.current != null && next.id !== prevId) {
        pendingSeekRef.current = null;
      }
      await loadAndPlay(next, index);
    },
    [loadAndPlay],
  );

  const playEpisode = useCallback(
    async (nextTrack: CurrentTrack, nextQueue?: CurrentTrack[]) => {
      const q = nextQueue && nextQueue.length > 0 ? nextQueue : [nextTrack];
      const index = q.findIndex((t) => t.id === nextTrack.id);
      const startIndex = index >= 0 ? index : 0;
      queueRef.current = q;
      setQueue(q);
      await playIndex(startIndex);
      addHistoryEntry({
        episodeId: nextTrack.id,
        title: nextTrack.title,
        artworkUrl: nextTrack.artworkUrl,
        audioUrl: nextTrack.audioUrl,
        speaker: nextTrack.speaker,
        position: 0,
        duration: nextTrack.duration,
      }).catch(() => {});
    },
    [playIndex],
  );

  const playTrackImmediately = useCallback(
    async (nextTrack: CurrentTrack) => {
      queueRef.current = [nextTrack];
      setQueue([nextTrack]);
      await playIndex(0);
      addHistoryEntry({
        episodeId: nextTrack.id,
        title: nextTrack.title,
        artworkUrl: nextTrack.artworkUrl,
        audioUrl: nextTrack.audioUrl,
        speaker: nextTrack.speaker,
        position: 0,
        duration: nextTrack.duration,
      }).catch(() => {});
    },
    [playIndex],
  );

  // Setup (once) → restore settings/queue → subscriptions + 500ms poll.
  useEffect(() => {
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | null = null;
    const subs: EmitterSubscription[] = [];
    const cleanup = () => {
      subs.forEach((s) => {
        try {
          s.remove();
        } catch {
          // Already removed.
        }
      });
      subs.length = 0;
      if (poll != null) {
        clearInterval(poll);
        poll = null;
      }
    };

    const fireSleepTimer = () => {
      sleepDeadlineRef.current = null;
      try {
        TrackPlayer.pause();
      } catch {
        // Player already torn down.
      }
      playingRef.current = false;
      setIsPlayingState(false);
      setSleepTimerMinutes(null);
      setSleepRemaining(null);
      updateSettings({ sleepTimerMinutes: undefined }).catch(() => {});
    };

    (async () => {
      try {
        await ensureSetupOnce();
      } catch {
        if (!cancelled) {
          nativeAvailableRef.current = false;
          setAudioError(NATIVE_UNAVAILABLE_MESSAGE);
          restoredRef.current = true;
          setIsReady(true);
        }
        return;
      }
      if (cancelled) return;
      nativeAvailableRef.current = true;

      try {
        const settings = await getSettings();
        if (cancelled) return;
        if (settings?.playbackSpeed) {
          setRateState(settings.playbackSpeed);
          rateRef.current = settings.playbackSpeed;
          try {
            TrackPlayer.setPlaybackSpeed(settings.playbackSpeed);
          } catch {
            // Applied on next loadAndPlay.
          }
        }
        if (settings?.sleepTimerMinutes) {
          sleepDeadlineRef.current = Date.now() + settings.sleepTimerMinutes * 60_000;
          setSleepTimerMinutes(settings.sleepTimerMinutes);
          setSleepRemaining(settings.sleepTimerMinutes * 60);
        }
      } catch {
        // Settings unavailable: defaults stand.
      }

      try {
        const saved = await loadQueueState();
        if (cancelled) return;
        if (saved && saved.queue.length > 0) {
          const idx = Math.min(Math.max(0, saved.index), saved.queue.length - 1);
          const restored = saved.queue[idx];
          queueRef.current = saved.queue;
          setQueue(saved.queue);
          queueIndexRef.current = idx;
          setQueueIndex(idx);
          trackRef.current = restored;
          setTrack(restored);
          repeatModeRef.current = saved.repeat;
          setRepeatModeState(saved.repeat);
          // Mirror the restored queue natively WITHOUT autoplay.
          try {
            let restoredUrl: string | undefined;
            try {
              restoredUrl = await resolveLocalAudio(restored);
            } catch {
              restoredUrl = undefined;
            }
            const mapped = saved.queue.map((t, i) =>
              toMediaItem(t, i === idx ? restoredUrl : undefined),
            );
            if (!cancelled) {
              TrackPlayer.setMediaItems(mapped, idx);
              TrackPlayer.setRepeatMode(toNativeRepeatMode(saved.repeat));
            }
          } catch {
            // Native mirror failed; rebuilt on next play.
          }
          // Resume offset comes from local history so it survives restarts.
          if (restored.type === "episode") {
            try {
              const hist = await getPlaybackHistory(restored.id);
              if (cancelled) return;
              if (
                hist &&
                !hist.completed &&
                hist.position > 0 &&
                hist.duration > 0 &&
                hist.position < hist.duration
              ) {
                resumeOffsetRef.current = hist.position;
                resumeIndexRef.current = idx;
                resumeTrackIdRef.current = restored.id;
              }
            } catch {
              // Best-effort resume offset; playback starts at 0 without it.
            }
          }
        }
      } catch {
        // Corrupt queue state: start fresh.
      }
      if (cancelled) {
        cleanup();
        return;
      }
      restoredRef.current = true;

      subs.push(
        TrackPlayer.addEventListener(Event.IsPlayingChanged, (e) => {
          const playing = e.playing;
          setIsPlayingState(playing);
          const was = playingRef.current;
          playingRef.current = playing;
          if (was && !playing) {
            saveProgressOnPause();
          }
        }),
      );
      subs.push(
        TrackPlayer.addEventListener(Event.MediaItemTransition, (e) => {
          // Covers notification / lock-screen next/prev: the native index
          // moved without JS involvement.
          if (e.index < 0 || e.index >= queueRef.current.length) return;
          void handleTrackTransition(e.index, e.item);
        }),
      );
      subs.push(
        TrackPlayer.addEventListener(Event.PlaybackError, (e) => {
          setAudioError(e.message || `Playback failed (${e.code})`);
        }),
      );
      subs.push(
        TrackPlayer.addEventListener(Event.PlaybackStateChanged, (e) => {
          const state = e.state;
          setIsBufferingState(state === PlaybackState.Buffering);
          if (state === PlaybackState.Error) {
            setAudioError((prev) => prev ?? "Playback error");
          } else if (state === PlaybackState.Ready) {
            const pending = pendingSeekRef.current;
            if (pending != null) {
              pendingSeekRef.current = null;
              try {
                TrackPlayer.seekTo(Math.max(0, pending));
              } catch {
                // Leave cleared; a later explicit seek will position correctly.
              }
            }
          } else if (state === PlaybackState.Ended) {
            const finished = trackRef.current;
            if (!finished || finished.type === "radio") return;
            const total = Math.floor(durationRef.current || finished.duration || 0);
            updatePlaybackProgress(finished.id, total, total, true, trackMeta(finished)).catch(
              () => {},
            );
            if (finished.type === "episode") {
              trackPlayComplete(finished.id, finished.type, finished.title, total);
            }
            void persistCloudState(finished, total, rateRef.current);
            // Native RepeatMode handles actual looping (one/all). At queue
            // end with repeat off the player stays idle — no manual advance.
          }
        }),
      );

      poll = setInterval(() => {
        if (cancelled || !nativeAvailableRef.current) return;
        // Backup sleep-timer check (covers the throttled 1s countdown).
        const deadline = sleepDeadlineRef.current;
        if (deadline != null && Date.now() >= deadline) {
          fireSleepTimer();
          return;
        }
        let pos = 0;
        let dur = 0;
        try {
          const p = TrackPlayer.getProgress();
          pos = Number.isFinite(p.position) && p.position > 0 ? p.position : 0;
          dur = Number.isFinite(p.duration) && p.duration > 0 ? p.duration : 0;
        } catch {
          return;
        }
        positionRef.current = pos;
        setPositionState(pos);
        durationRef.current = dur;
        setPolledDuration(dur);
        let playing = playingRef.current;
        try {
          playing = TrackPlayer.isPlaying();
        } catch {
          // Keep last known state.
        }
        setIsPlayingState(playing);
        const was = playingRef.current;
        playingRef.current = playing;
        if (was && !playing) {
          saveProgressOnPause();
        }
        try {
          const st = TrackPlayer.getPlaybackState();
          setIsBufferingState(st === PlaybackState.Buffering);
          if (st === PlaybackState.Error) {
            setAudioError((prev) => prev ?? "Playback error");
          }
        } catch {
          // State getters are best-effort; events carry the same signals.
        }
        if (playing) {
          const current = trackRef.current;
          if (current && current.type !== "radio" && Date.now() - lastSaveRef.current >= 10000) {
            lastSaveRef.current = Date.now();
            updatePlaybackProgress(
              current.id,
              Math.floor(pos),
              Math.floor(dur || current.duration || 0),
              false,
              trackMeta(current),
            ).catch(() => {});
          }
        }
      }, 500);

      setIsReady(true);
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [handleTrackTransition, saveProgressOnPause]);

  // Persist queue + index + repeat (after the initial restore).
  useEffect(() => {
    if (!restoredRef.current) return;
    saveQueueState({ queue, index: queueIndex, repeat: repeatMode }).catch(() => {});
  }, [queue, queueIndex, repeatMode]);

  const togglePlay = useCallback(async () => {
    if (!nativeAvailableRef.current) return;
    if (playingRef.current) {
      try {
        TrackPlayer.pause();
      } catch (e) {
        setAudioError(e instanceof Error && e.message ? e.message : "Pause failed");
        return;
      }
      playingRef.current = false;
      setIsPlayingState(false);
      saveProgressOnPause();
    } else {
      setAudioError(null);
      try {
        TrackPlayer.play();
      } catch (e) {
        setAudioError(e instanceof Error && e.message ? e.message : "Playback failed");
        return;
      }
      playingRef.current = true;
      setIsPlayingState(true);
    }
  }, [saveProgressOnPause]);

  const seek = useCallback(async (seconds: number) => {
    if (!nativeAvailableRef.current) return;
    const target = Math.max(0, seconds);
    try {
      TrackPlayer.seekTo(target);
      positionRef.current = target;
      setPositionState(target);
    } catch {
      pendingSeekRef.current = target;
    }
  }, []);

  const skipNext = useCallback(async () => {
    if (!nativeAvailableRef.current) return;
    const q = queueRef.current;
    const idx = queueIndexRef.current;
    if (q.length === 0) return;
    let expected: number | null = null;
    try {
      if (idx < q.length - 1) {
        TrackPlayer.skipToNext();
        expected = idx + 1;
      } else if (repeatModeRef.current === "all") {
        // Native repeat-all would also wrap on skipToNext; skipToIndex makes
        // the wrap target explicit.
        TrackPlayer.skipToIndex(0);
        expected = 0;
      } else {
        return;
      }
      TrackPlayer.play();
    } catch (e) {
      setAudioError(e instanceof Error && e.message ? e.message : "Skip failed");
      return;
    }
    syncIndexFromNative(expected);
  }, [syncIndexFromNative]);

  const skipPrevious = useCallback(async () => {
    if (!nativeAvailableRef.current) return;
    const q = queueRef.current;
    const idx = queueIndexRef.current;
    if (q.length === 0) return;
    let expected: number | null = null;
    try {
      if (idx > 0) {
        // V5 skipToPrevious restarts the current item when playback is past
        // ~3s; the post-call index sync below handles both outcomes.
        TrackPlayer.skipToPrevious();
        expected = idx;
      } else if (repeatModeRef.current === "all") {
        TrackPlayer.skipToIndex(q.length - 1);
        expected = q.length - 1;
      } else {
        return;
      }
      TrackPlayer.play();
    } catch (e) {
      setAudioError(e instanceof Error && e.message ? e.message : "Skip failed");
      return;
    }
    syncIndexFromNative(expected);
  }, [syncIndexFromNative]);

  const setRepeatMode = useCallback((mode: RepeatMode) => {
    setRepeatModeState(mode);
    repeatModeRef.current = mode;
    if (!nativeAvailableRef.current) return;
    try {
      TrackPlayer.setRepeatMode(toNativeRepeatMode(mode));
    } catch {
      // Re-applied on next load/restore.
    }
  }, []);

  const setVolume = useCallback(async (v: number) => {
    const clamped = Math.min(1, Math.max(0, v));
    if (clamped > 0) {
      lastVolumeRef.current = clamped;
    }
    volumeRef.current = clamped;
    setVolumeState(clamped);
    if (!nativeAvailableRef.current) return;
    try {
      TrackPlayer.setVolume(clamped);
    } catch (e) {
      setAudioError(e instanceof Error && e.message ? e.message : "Volume change failed");
    }
  }, []);

  const toggleMute = useCallback(async () => {
    if (volumeRef.current === 0) {
      const restore = lastVolumeRef.current > 0 ? lastVolumeRef.current : 1;
      volumeRef.current = restore;
      setVolumeState(restore);
      if (nativeAvailableRef.current) {
        try {
          TrackPlayer.setVolume(restore);
        } catch {
          // Volume restores on next setVolume call.
        }
      }
    } else {
      if (volumeRef.current > 0) {
        lastVolumeRef.current = volumeRef.current;
      }
      volumeRef.current = 0;
      setVolumeState(0);
      if (nativeAvailableRef.current) {
        try {
          TrackPlayer.setVolume(0);
        } catch {
          // Volume restores on next setVolume call.
        }
      }
    }
  }, []);

  const addToQueue = useCallback((nextTrack: CurrentTrack) => {
    // Append without disturbing the current track/index.
    const next = [...queueRef.current, nextTrack];
    queueRef.current = next;
    setQueue(next);
    if (!nativeAvailableRef.current) return;
    void (async () => {
      try {
        TrackPlayer.addMediaItem(await toMediaItem(nextTrack));
      } catch {
        // Mirror is rebuilt from the JS queue on the next loadAndPlay.
      }
    })();
  }, []);

  const removeFromQueue = useCallback((index: number) => {
    const q = queueRef.current;
    if (index < 0 || index >= q.length) return;
    if (nativeAvailableRef.current) {
      try {
        TrackPlayer.removeMediaItem(index);
      } catch {
        // JS queue remains the source of truth for the UI.
      }
    }
    const next = q.filter((_, i) => i !== index);
    const ci = queueIndexRef.current;
    let nextIndex = ci;
    if (index < ci) {
      nextIndex = ci - 1;
    } else if (index === ci) {
      nextIndex = next.length === 0 ? 0 : Math.min(ci, next.length - 1);
    }
    queueRef.current = next;
    setQueue(next);
    queueIndexRef.current = nextIndex;
    setQueueIndex(nextIndex);
    // The currently loaded audio is left untouched (web parity).
  }, []);

  const jumpToIndex = useCallback(
    async (index: number) => {
      if (!nativeAvailableRef.current) return;
      if (index < 0 || index >= queueRef.current.length) return;
      try {
        TrackPlayer.skipToIndex(index);
        TrackPlayer.play();
      } catch (e) {
        setAudioError(e instanceof Error && e.message ? e.message : "Skip failed");
        return;
      }
      syncIndexFromNative(index);
    },
    [syncIndexFromNative],
  );

  const clearQueue = useCallback(() => {
    // NOTE: V5 clear() stops audio natively, so unlike the old player the
    // current playback does not survive a clear. The JS queue/index reset
    // below keeps the UI consistent with the emptied native queue.
    if (nativeAvailableRef.current) {
      try {
        TrackPlayer.clear();
      } catch {
        // Queue state below is still reset.
      }
    }
    queueRef.current = [];
    setQueue([]);
    queueIndexRef.current = 0;
    setQueueIndex(0);
  }, []);

  const changeSpeed = useCallback(async () => {
    if (trackRef.current?.type === "radio") return;
    const settings = await getSettings();
    const current = settings?.playbackSpeed ?? 1;
    const next = PLAYBACK_SPEEDS[(PLAYBACK_SPEEDS.indexOf(current) + 1) % PLAYBACK_SPEEDS.length];
    setRateState(next);
    rateRef.current = next;
    if (nativeAvailableRef.current) {
      try {
        TrackPlayer.setPlaybackSpeed(next);
      } catch {
        // Applied on next loadAndPlay.
      }
    }
    await updateSettings({ playbackSpeed: next });
  }, []);

  const setSpeed = useCallback(async (next: number) => {
    setRateState(next);
    rateRef.current = next;
    if (trackRef.current?.type !== "radio" && nativeAvailableRef.current) {
      try {
        TrackPlayer.setPlaybackSpeed(next);
      } catch {
        // Applied on next loadAndPlay.
      }
    }
    await updateSettings({ playbackSpeed: next });
  }, []);

  // Sleep timer as a wall-clock deadline (not a tick counter) so it still
  // fires if the JS timer is throttled while backgrounded. The 1s interval
  // keeps the in-app countdown fresh; the 500ms poll above acts as a backup
  // check on every playback tick.
  const setSleepTimer = useCallback((minutes: number) => {
    sleepDeadlineRef.current = Date.now() + minutes * 60_000;
    setSleepTimerMinutes(minutes);
    setSleepRemaining(minutes * 60);
    updateSettings({ sleepTimerMinutes: minutes }).catch(() => {});
  }, []);

  const cancelSleepTimer = useCallback(() => {
    sleepDeadlineRef.current = null;
    setSleepTimerMinutes(null);
    setSleepRemaining(null);
    updateSettings({ sleepTimerMinutes: undefined }).catch(() => {});
  }, []);

  useEffect(() => {
    if (sleepTimerMinutes === null) return;
    const fireSleepTimer = () => {
      sleepDeadlineRef.current = null;
      try {
        TrackPlayer.pause();
      } catch {
        // Player already torn down.
      }
      playingRef.current = false;
      setIsPlayingState(false);
      setSleepTimerMinutes(null);
      setSleepRemaining(null);
      updateSettings({ sleepTimerMinutes: undefined }).catch(() => {});
    };
    const interval = setInterval(() => {
      const deadline = sleepDeadlineRef.current;
      if (deadline == null) return;
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (remaining <= 0) {
        clearInterval(interval);
        fireSleepTimer();
      } else {
        setSleepRemaining(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [sleepTimerMinutes]);

  const stop = useCallback(async () => {
    if (nativeAvailableRef.current) {
      try {
        TrackPlayer.pause();
      } catch {
        // Continue tearing down.
      }
      try {
        TrackPlayer.stop();
      } catch {
        // Continue tearing down.
      }
      try {
        TrackPlayer.clear();
      } catch {
        // Continue tearing down.
      }
    }
    pendingSeekRef.current = null;
    resumeOffsetRef.current = null;
    resumeTrackIdRef.current = null;
    playingRef.current = false;
    setIsPlayingState(false);
    setIsBufferingState(false);
    positionRef.current = 0;
    setPositionState(0);
    durationRef.current = 0;
    setPolledDuration(0);
    setTrack(null);
    trackRef.current = null;
    setQueue([]);
    setQueueIndex(0);
    queueIndexRef.current = 0;
    queueRef.current = [];
    clearPlaybackState().catch(() => {});
  }, []);

  const value = useMemo<PlayerContextValue>(
    () => ({
      track,
      queue,
      queueIndex,
      repeatMode,
      isPlaying,
      isBuffering,
      position,
      duration,
      rate,
      hasNext: queue.length > 0 && (queueIndex < queue.length - 1 || repeatMode === "all"),
      hasPrevious: queue.length > 0 && (queueIndex > 0 || repeatMode === "all"),
      isReady,
      sleepTimerMinutes,
      sleepRemaining,
      volume,
      isMuted,
      audioError,
      playEpisode,
      playTrackImmediately,
      togglePlay,
      seek,
      skipNext,
      skipPrevious,
      changeSpeed,
      setSpeed,
      setRepeatMode,
      setVolume,
      toggleMute,
      addToQueue,
      removeFromQueue,
      jumpToIndex,
      clearQueue,
      setSleepTimer,
      cancelSleepTimer,
      stop,
    }),
    [
      track,
      queue,
      queueIndex,
      repeatMode,
      isPlaying,
      isBuffering,
      position,
      duration,
      rate,
      isReady,
      sleepTimerMinutes,
      sleepRemaining,
      volume,
      isMuted,
      audioError,
      playEpisode,
      playTrackImmediately,
      togglePlay,
      seek,
      skipNext,
      skipPrevious,
      changeSpeed,
      setSpeed,
      setRepeatMode,
      setVolume,
      toggleMute,
      addToQueue,
      removeFromQueue,
      jumpToIndex,
      clearQueue,
      setSleepTimer,
      cancelSleepTimer,
      stop,
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) {
    throw new Error("usePlayer must be used within PlayerProvider");
  }
  return ctx;
}
