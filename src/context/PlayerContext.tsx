import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";

import {
  deactivateLockScreen,
  loadQueueState,
  persistCloudState,
  resolveLocalAudio,
  saveQueueState,
  setActiveTrackControls,
  setupPlayer,
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
  playEpisode: (track: CurrentTrack, queue?: CurrentTrack[]) => Promise<void>;
  playTrackImmediately: (track: CurrentTrack) => Promise<void>;
  togglePlay: () => Promise<void>;
  seek: (seconds: number) => Promise<void>;
  skipNext: () => Promise<void>;
  skipPrevious: () => Promise<void>;
  changeSpeed: () => Promise<void>;
  setSpeed: (speed: number) => Promise<void>;
  setRepeatMode: (mode: RepeatMode) => void;
  addToQueue: (track: CurrentTrack) => void;
  removeFromQueue: (index: number) => void;
  jumpToIndex: (index: number) => Promise<void>;
  clearQueue: () => void;
  setSleepTimer: (minutes: number) => void;
  cancelSleepTimer: () => void;
  stop: () => Promise<void>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const player = useAudioPlayer(null, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);
  const [isReady, setIsReady] = useState(false);
  const [track, setTrack] = useState<CurrentTrack | null>(null);
  const [queue, setQueue] = useState<CurrentTrack[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [repeatMode, setRepeatModeState] = useState<RepeatMode>("off");
  const [rate, setRateState] = useState(1);
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null);

  const position = status.currentTime;
  const duration =
    Number.isFinite(status.duration) && status.duration > 0
      ? status.duration
      : track?.duration || 0;

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
  const pendingSeekRef = useRef<number | null>(null);
  const lastLoadedRef = useRef(status.isLoaded);
  const sleepDeadlineRef = useRef<number | null>(null);

  const isPlaying = status.playing;
  const isBuffering = status.isBuffering;

  useEffect(() => {
    setupPlayer()
      .then(async () => {
        const settings = await getSettings();
        if (settings?.playbackSpeed) {
          setRateState(settings.playbackSpeed);
          rateRef.current = settings.playbackSpeed;
        }
        if (settings?.sleepTimerMinutes) {
          sleepDeadlineRef.current = Date.now() + settings.sleepTimerMinutes * 60_000;
          setSleepTimerMinutes(settings.sleepTimerMinutes);
          setSleepRemaining(settings.sleepTimerMinutes * 60);
        }
        try {
          const saved = await loadQueueState();
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
            // Resume offset comes from local history so it survives restarts.
            if (restored.type === "episode") {
              try {
                const hist = await getPlaybackHistory(restored.id);
                if (
                  hist &&
                  !hist.completed &&
                  hist.position > 0 &&
                  hist.duration > 0 &&
                  hist.position < hist.duration
                ) {
                  pendingSeekRef.current = hist.position;
                }
              } catch {
                // Best-effort resume offset; playback starts at 0 without it.
              }
            }
          }
        } catch {
          // Corrupt queue state: start fresh.
        }
        restoredRef.current = true;
        setIsReady(true);
      })
      .catch(() => {
        restoredRef.current = true;
        setIsReady(true);
      });
  }, []);

  const loadAndPlay = useCallback(
    async (next: CurrentTrack) => {
      if (next.type === "radio") {
        player.setPlaybackRate(1);
      } else {
        player.setPlaybackRate(rateRef.current);
      }
      // Prefer the downloaded file when available (web parity).
      const source = await resolveLocalAudio(next);
      player.replace(source);
      // Native notification shade / lock screen / Control Center + headset
      // controls. OS play/pause/seek buttons drive this same player, so the
      // in-app UI (status.playing) stays in sync with remote presses.
      // Required on Android for sustained background playback (foreground
      // service media notification); on iOS it feeds Now Playing.
      setActiveTrackControls(player, next);
      player.play();
      if (next.type === "episode" || next.type === "radio") {
        trackPlayStart(next.id, next.type, next.title);
      }
      void persistCloudState(next, 0, rateRef.current);
    },
    [player],
  );

  const playIndex = useCallback(
    async (index: number, startPosition?: number) => {
      const q = queueRef.current;
      if (index < 0 || index >= q.length) return;
      const next = q[index];
      const prevId = trackRef.current?.id;
      setQueueIndex(index);
      queueIndexRef.current = index;
      setTrack(next);
      trackRef.current = next;
      // Keep a restored resume offset only when continuing the restored track.
      if (pendingSeekRef.current != null && next.id !== prevId) {
        pendingSeekRef.current = null;
      }
      if (startPosition != null && startPosition > 0) {
        pendingSeekRef.current = startPosition;
      }
      await loadAndPlay(next);
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

  useEffect(() => {
    if (status.isLoaded && !lastLoadedRef.current && pendingSeekRef.current != null) {
      const target = pendingSeekRef.current;
      pendingSeekRef.current = null;
      player.seekTo(target).catch(() => {});
    }
    lastLoadedRef.current = status.isLoaded;
  }, [status.isLoaded, player]);

  const lastSaveRef = useRef(0);

  useEffect(() => {
    // Backup sleep-timer check on every status tick (covers throttled intervals).
    const deadline = sleepDeadlineRef.current;
    if (deadline != null && Date.now() >= deadline) {
      sleepDeadlineRef.current = null;
      player.pause();
      setSleepTimerMinutes(null);
      setSleepRemaining(null);
      updateSettings({ sleepTimerMinutes: undefined }).catch(() => {});
      return;
    }
    if (!track || track.type === "radio" || !isPlaying) return;
    if (Date.now() - lastSaveRef.current < 10000) return;
    lastSaveRef.current = Date.now();
    updatePlaybackProgress(
      track.id,
      Math.floor(position),
      Math.floor(duration || track.duration || 0),
      false,
      {
        title: track.title,
        artworkUrl: track.artworkUrl,
        audioUrl: track.audioUrl,
        speaker: track.speaker,
      },
    ).catch(() => {});
  }, [position, isPlaying, track, duration]);

  useEffect(() => {
    if (!status.didJustFinish) return;
    const finished = trackRef.current;
    if (!finished || finished.type === "radio") return;
    const total = Math.floor(durationRef.current || finished.duration || 0);
    const meta = {
      title: finished.title,
      artworkUrl: finished.artworkUrl,
      audioUrl: finished.audioUrl,
      speaker: finished.speaker,
    };
    updatePlaybackProgress(finished.id, total, total, true, meta).catch(() => {});
    if (finished.type === "episode") {
      trackPlayComplete(finished.id, finished.type, finished.title, total);
    }
    void persistCloudState(finished, total, rateRef.current);
    const mode = repeatModeRef.current;
    const idx = queueIndexRef.current;
    if (mode === "one") {
      // Replay the finished track.
      void playIndex(idx, 0);
    } else if (idx < queueRef.current.length - 1) {
      void playIndex(idx + 1);
    } else if (mode === "all" && queueRef.current.length > 0) {
      // Wrap to the start of the queue.
      void playIndex(0);
    }
    // mode === "off" at the end: stop at end — leave the player idle.
  }, [status.didJustFinish, playIndex]);

  const togglePlay = useCallback(async () => {
    const current = trackRef.current;
    if (isPlaying) {
      const pos = Math.floor(positionRef.current);
      player.pause();
      // Persist progress on pause (local history + best-effort cloud sync).
      if (current && current.type !== "radio") {
        const total = Math.floor(durationRef.current || current.duration || 0);
        updatePlaybackProgress(current.id, pos, total, false, {
          title: current.title,
          artworkUrl: current.artworkUrl,
          audioUrl: current.audioUrl,
          speaker: current.speaker,
        }).catch(() => {});
      }
      if (current) {
        void persistCloudState(current, pos, rateRef.current);
      }
    } else {
      player.play();
    }
  }, [player, isPlaying]);

  const seek = useCallback(
    async (seconds: number) => {
      const target = Math.max(0, seconds);
      if (status.isLoaded) {
        try {
          await player.seekTo(target);
        } catch {
          pendingSeekRef.current = target;
        }
      } else {
        pendingSeekRef.current = target;
      }
    },
    [player, status.isLoaded],
  );

  const skipNext = useCallback(async () => {
    const idx = queueIndexRef.current;
    if (idx < queueRef.current.length - 1) {
      await playIndex(idx + 1);
    } else if (repeatModeRef.current === "all" && queueRef.current.length > 0) {
      await playIndex(0);
    }
  }, [playIndex]);

  const skipPrevious = useCallback(async () => {
    const prev = queueIndexRef.current - 1;
    if (prev >= 0) {
      await playIndex(prev);
    } else if (repeatModeRef.current === "all" && queueRef.current.length > 0) {
      await playIndex(queueRef.current.length - 1);
    }
  }, [playIndex]);

  const setRepeatMode = useCallback((mode: RepeatMode) => {
    setRepeatModeState(mode);
    repeatModeRef.current = mode;
  }, []);

  const addToQueue = useCallback((nextTrack: CurrentTrack) => {
    // Append without disturbing the current track/index.
    const next = [...queueRef.current, nextTrack];
    queueRef.current = next;
    setQueue(next);
  }, []);

  const removeFromQueue = useCallback((index: number) => {
    const q = queueRef.current;
    if (index < 0 || index >= q.length) return;
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
      await playIndex(index);
    },
    [playIndex],
  );

  const clearQueue = useCallback(() => {
    // Empties the queue; current playback is left untouched.
    queueRef.current = [];
    setQueue([]);
    queueIndexRef.current = 0;
    setQueueIndex(0);
  }, []);

  // Persist queue + index + repeat (after the initial restore).
  useEffect(() => {
    if (!restoredRef.current) return;
    saveQueueState({ queue, index: queueIndex, repeat: repeatMode }).catch(() => {});
  }, [queue, queueIndex, repeatMode]);

  const changeSpeed = useCallback(async () => {
    if (trackRef.current?.type === "radio") return;
    const settings = await getSettings();
    const current = settings?.playbackSpeed ?? 1;
    const next = PLAYBACK_SPEEDS[(PLAYBACK_SPEEDS.indexOf(current) + 1) % PLAYBACK_SPEEDS.length];
    setRateState(next);
    rateRef.current = next;
    player.setPlaybackRate(next);
    await updateSettings({ playbackSpeed: next });
  }, [player]);

  const setSpeed = useCallback(
    async (next: number) => {
      setRateState(next);
      rateRef.current = next;
      if (trackRef.current?.type !== "radio") {
        player.setPlaybackRate(next);
      }
      await updateSettings({ playbackSpeed: next });
    },
    [player],
  );

  // Persist progress when playback pauses from ANY source — in-app button,
  // notification / lock-screen pause, headset disconnect, audio interruption.
  // (OS remote presses drive the shared player directly, bypassing togglePlay.)
  const wasPlayingRef = useRef(false);
  useEffect(() => {
    const wasPlaying = wasPlayingRef.current;
    wasPlayingRef.current = isPlaying;
    if (wasPlaying && !isPlaying) {
      const current = trackRef.current;
      if (current && current.type !== "radio") {
        const pos = Math.floor(positionRef.current);
        const total = Math.floor(durationRef.current || current.duration || 0);
        updatePlaybackProgress(current.id, pos, total, false, {
          title: current.title,
          artworkUrl: current.artworkUrl,
          audioUrl: current.audioUrl,
          speaker: current.speaker,
        }).catch(() => {});
        void persistCloudState(current, pos, rateRef.current);
      }
    }
  }, [isPlaying]);

  // Sleep timer as a wall-clock deadline (not a tick counter) so it still
  // fires if the JS timer is throttled while backgrounded. The 1s interval
  // keeps the in-app countdown fresh; the position-saver effect below acts
  // as a backup check on every playback-status update.
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
      player.pause();
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
  }, [sleepTimerMinutes, player]);

  const stop = useCallback(async () => {
    player.pause();
    deactivateLockScreen(player);
    pendingSeekRef.current = null;
    setTrack(null);
    trackRef.current = null;
    setQueue([]);
    setQueueIndex(0);
    queueIndexRef.current = 0;
    queueRef.current = [];
    clearPlaybackState().catch(() => {});
  }, [player]);

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
      playEpisode,
      playTrackImmediately,
      togglePlay,
      seek,
      skipNext,
      skipPrevious,
      changeSpeed,
      setSpeed,
      setRepeatMode,
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
      playEpisode,
      playTrackImmediately,
      togglePlay,
      seek,
      skipNext,
      skipPrevious,
      changeSpeed,
      setSpeed,
      setRepeatMode,
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