import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";

import { setupPlayer } from "@/audio/player";
import { addHistoryEntry, getSettings, updatePlaybackProgress, updateSettings } from "@/lib/db";
import { PLAYBACK_SPEEDS } from "@/lib/utils";
import type { CurrentTrack } from "@/types";

interface PlayerContextValue {
  track: CurrentTrack | null;
  queue: CurrentTrack[];
  queueIndex: number;
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
  const [rate, setRateState] = useState(1);
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null);

  const position = status.currentTime;
  const duration =
    Number.isFinite(status.duration) && status.duration > 0
      ? status.duration
      : track?.duration || 0;

  const queueRef = useRef<CurrentTrack[]>([]);
  queueRef.current = queue;
  const queueIndexRef = useRef(queueIndex);
  queueIndexRef.current = queueIndex;
  const trackRef = useRef<CurrentTrack | null>(track);
  trackRef.current = track;
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const pendingSeekRef = useRef<number | null>(null);
  const lastLoadedRef = useRef(status.isLoaded);

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
        setIsReady(true);
      })
      .catch(() => setIsReady(true));
  }, []);

  const loadAndPlay = useCallback(
    (next: CurrentTrack) => {
      if (next.type === "radio") {
        player.setPlaybackRate(1);
      } else {
        player.setPlaybackRate(rateRef.current);
      }
      player.replace(next.audioUrl);
      player.setActiveForLockScreen(
        true,
        {
          title: next.title,
          artist: next.speaker,
          artworkUrl: next.artworkUrl,
        },
        { isLiveStream: next.type === "radio" },
      );
      player.play();
    },
    [player],
  );

  const playIndex = useCallback(
    async (index: number) => {
      const q = queueRef.current;
      if (index < 0 || index >= q.length) return;
      const next = q[index];
      setQueueIndex(index);
      setTrack(next);
      trackRef.current = next;
      pendingSeekRef.current = null;
      loadAndPlay(next);
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
    if (!track || track.type === "radio") return;
    const total = Math.floor(duration || track.duration || 0);
    updatePlaybackProgress(track.id, total, total, true, {
      title: track.title,
      artworkUrl: track.artworkUrl,
      audioUrl: track.audioUrl,
      speaker: track.speaker,
    }).catch(() => {});
    if (queueIndexRef.current < queueRef.current.length - 1) {
      playIndex(queueIndexRef.current + 1);
    }
  }, [status.didJustFinish, track, duration, playIndex]);

  const togglePlay = useCallback(async () => {
    if (isPlaying) {
      player.pause();
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
    await playIndex(queueIndexRef.current + 1);
  }, [playIndex]);

  const skipPrevious = useCallback(async () => {
    const prev = queueIndexRef.current - 1;
    if (prev >= 0) {
      await playIndex(prev);
    }
  }, [playIndex]);

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

  const setSleepTimer = useCallback(
    (minutes: number) => {
      setSleepTimerMinutes(minutes);
      setSleepRemaining(minutes * 60);
    },
    [],
  );

  const cancelSleepTimer = useCallback(() => {
    setSleepTimerMinutes(null);
    setSleepRemaining(null);
  }, []);

  useEffect(() => {
    if (sleepTimerMinutes === null) return;
    const interval = setInterval(() => {
      setSleepRemaining((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(interval);
          player.pause();
          setSleepTimerMinutes(null);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [sleepTimerMinutes, player]);

  const stop = useCallback(async () => {
    player.pause();
    player.setActiveForLockScreen(false);
    pendingSeekRef.current = null;
    setTrack(null);
    setQueue([]);
    setQueueIndex(0);
    queueRef.current = [];
  }, [player]);

  const value = useMemo<PlayerContextValue>(
    () => ({
      track,
      queue,
      queueIndex,
      isPlaying,
      isBuffering,
      position,
      duration,
      rate,
      hasNext: queueIndex < queue.length - 1,
      hasPrevious: queueIndex > 0,
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
      setSleepTimer,
      cancelSleepTimer,
      stop,
    }),
    [
      track,
      queue,
      queueIndex,
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