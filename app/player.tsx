import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Modal,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  AlertCircle,
  Bookmark,
  CheckCircle2,
  ChevronDown,
  Download,
  Gauge,
  Heart,
  ListOrdered,
  ListPlus,
  Moon,
  Pause,
  Play,
  Repeat,
  Repeat1,
  RotateCcw,
  RotateCw,
  Share2,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { Artwork } from "@/components/Artwork";
import { AddToPlaylistSheet } from "@/components/AddToPlaylistSheet";
import { PlayerDownloadSheet } from "@/components/PlayerDownloadSheet";
import { usePlayer } from "@/context/PlayerContext";
import { useTranslation } from "@/hooks/useTranslation";
import {
  getBookmarks,
  addBookmark,
  deleteBookmark,
  isDownloaded,
  isFavorite,
  addFavorite,
  removeFavorite,
} from "@/lib/db";
import { getEpisodeLinks } from "@/lib/share";
import { getProgress, isDownloading, subscribeDownloads, subscribeProgress } from "@/lib/downloads";
import { trackFavoriteAdd } from "@/lib/analytics";
import { formatDuration, getPlaybackSpeedLabel, PLAYBACK_SPEEDS } from "@/lib/utils";
import type { Bookmark as BookmarkRecord, CurrentTrack, RepeatMode } from "@/types";

const SLEEP_OPTIONS = [5, 10, 15, 30, 45, 60, 90];

/** Match the native lock-screen skip intervals (src/audio/player.ts) and web PlayerPage. */
const REWIND_SECONDS = 15;
const FORWARD_SECONDS = 30;

function formatSleepRemaining(totalSeconds: number | null): string {
  if (totalSeconds === null || totalSeconds === undefined || totalSeconds <= 0) return "";
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function nextRepeatMode(mode: RepeatMode): RepeatMode {
  if (mode === "off") return "all";
  if (mode === "all") return "one";
  return "off";
}

export default function PlayerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    title?: string;
    audioUrl?: string;
    duration?: string;
  }>();

  const player = usePlayer();
  const {
    track,
    queue,
    queueIndex,
    isPlaying,
    isBuffering,
    position,
    duration,
    rate,
    volume,
    isMuted,
    audioError,
    hasNext,
    hasPrevious,
    playTrackImmediately,
    togglePlay,
    seek,
    skipNext,
    skipPrevious,
    changeSpeed,
    setSpeed,
    setVolume,
    toggleMute,
    sleepTimerMinutes,
    sleepRemaining,
    setSleepTimer,
    cancelSleepTimer,
    stop,
  } = player;

  // ── Repeat mode lives in PlayerContext (engine honors off/all/one) ───────
  const { repeatMode, setRepeatMode } = player;
  const cycleRepeat = () => {
    setRepeatMode(nextRepeatMode(repeatMode));
  };
  const RepeatIcon = repeatMode === "one" ? Repeat1 : Repeat;

  // ── Volume / mute (live TrackPlayer controls) ────────────────────────────
  const effectiveVolume = isMuted ? 0 : volume;

  // ── Sheets ─────────────────────────────────────────────────────────────────
  const [sheet, setSheet] = useState<"sleep" | "speed" | "upnext" | "download" | null>(null);
  const [playlistOpen, setPlaylistOpen] = useState(false);

  // ── Download status for the current track (web parity: PlayerPage useDownload)
  const [downloaded, setDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const downloadId = track?.id;

  // Radio streams have no audio file, so downloading is never offered for them.
  const canDownload = !!track && track.type !== "radio" && !!track.audioUrl;

  useEffect(() => {
    setDownloadError(null);
    if (!downloadId || !canDownload) {
      setDownloaded(false);
      setDownloading(false);
      setDownloadProgress(0);
      return;
    }
    const id = downloadId;
    let active = true;
    isDownloaded(id)
      .then((v) => {
        if (!active) return;
        setDownloaded(v);
        setDownloading(isDownloading(id));
        setDownloadProgress(getProgress(id) ?? 0);
      })
      .catch(() => {
        if (active) setDownloaded(false);
      });
    const unsubProgress = subscribeProgress((pid, pct) => {
      if (!active || pid !== id) return;
      setDownloadProgress(pct);
      setDownloading(true);
    });
    const unsubState = subscribeDownloads(() => {
      if (!active) return;
      setDownloading(isDownloading(id));
      setDownloadProgress(getProgress(id) ?? 0);
      isDownloaded(id)
        .then((v) => {
          if (active) setDownloaded(v);
        })
        .catch(() => {
          if (active) setDownloaded(false);
        });
    });
    return () => {
      active = false;
      unsubProgress();
      unsubState();
    };
  }, [downloadId, canDownload]);

  // ── Favorite (web parity: PlayerPage heart toggle) ─────────────────────────
  const [favorite, setFavorite] = useState(false);
  const favId = track?.id;
  const favType = track?.type;

  useEffect(() => {
    if (!favType || (favType !== "episode" && favType !== "dua") || !favId) {
      setFavorite(false);
      return;
    }
    const id = favId;
    const type = favType;
    let active = true;
    isFavorite(type, id)
      .then((v) => {
        if (active) setFavorite(v);
      })
      .catch(() => {
        if (active) setFavorite(false);
      });
    return () => {
      active = false;
    };
  }, [favId, favType]);

  const toggleFavorite = async () => {
    if (!track || (track.type !== "episode" && track.type !== "dua")) return;
    try {
      if (favorite) {
        await removeFavorite(track.type, track.id);
        setFavorite(false);
      } else {
        await addFavorite({
          type: track.type,
          itemId: track.id,
          title: track.title,
          imageUrl: track.artworkUrl,
          addedAt: new Date(),
        });
        trackFavoriteAdd(track.id, track.type, track.title);
        setFavorite(true);
      }
    } catch {
      // storage failure: leave UI unchanged
    }
  };

  // ── Bookmarks (add + remove) ───────────────────────────────────────────────
  const [bookmarkList, setBookmarkList] = useState<BookmarkRecord[]>([]);
  const bookmarked = bookmarkList.length > 0;

  const reloadBookmarks = async (episodeId: string) => {
    try {
      const marks = await getBookmarks(episodeId);
      setBookmarkList(marks);
    } catch {
      setBookmarkList([]);
    }
  };

  useEffect(() => {
    if (!track?.id) {
      setBookmarkList([]);
      return;
    }
    let active = true;
    getBookmarks(track.id)
      .then((marks) => {
        if (active) setBookmarkList(marks);
      })
      .catch(() => {
        if (active) setBookmarkList([]);
      });
    return () => {
      active = false;
    };
  }, [track?.id]);

  const toggleBookmark = async () => {
    if (!track || track.type !== "episode") return;
    try {
      if (bookmarked) {
        // Already bookmarked -> delete option: remove all marks for this episode.
        for (const mark of bookmarkList) {
          if (mark.id !== undefined) await deleteBookmark(mark.id);
        }
        setBookmarkList([]);
      } else if (position > 0) {
        await addBookmark({
          episodeId: track.id,
          episodeTitle: track.title,
          speakerName: track.speaker,
          artworkUrl: track.artworkUrl,
          audioUrl: track.audioUrl,
          position: Math.floor(position),
          createdAt: new Date(),
        });
        await reloadBookmarks(track.id);
      }
    } catch {
      // storage failure: leave UI unchanged
    }
  };

  useEffect(() => {
    if (!track && params.id && params.audioUrl) {
      playTrackImmediately({
        id: params.id,
        title: params.title ?? "",
        audioUrl: params.audioUrl,
        duration: Number(params.duration ?? 0),
        type: "episode",
      } as CurrentTrack);
    }
  }, [params.id, params.audioUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const seekBarRef = useRef<View>(null);
  const barWidthRef = useRef(0);

  const onBarLayout = (e: LayoutChangeEvent) => {
    barWidthRef.current = e.nativeEvent.layout.width;
  };

  const onBarPress = (e: { nativeEvent: { locationX: number } }) => {
    if (duration <= 0 || !barWidthRef.current) return;
    const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / barWidthRef.current));
    seek(ratio * duration);
  };

  // ── Volume bar: tap-to-set, same pattern as the seek bar ──────────────────
  const volumeBarWidthRef = useRef(0);

  const onVolumeBarLayout = (e: LayoutChangeEvent) => {
    volumeBarWidthRef.current = e.nativeEvent.layout.width;
  };

  const onVolumeBarPress = (e: { nativeEvent: { locationX: number } }) => {
    if (!volumeBarWidthRef.current) return;
    const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / volumeBarWidthRef.current));
    void setVolume(ratio);
  };

  // ── Up Next: jump + remove (engine-backed, queue preserved) ──────────────
  const handleJump = async (index: number) => {
    if (index < 0 || index >= queue.length || index === queueIndex) return;
    await player.jumpToIndex(index);
    setSheet(null);
  };

  const handleRemove = async (index: number) => {
    if (index === queueIndex) return;
    player.removeFromQueue(index);
  };

  const handleRetry = async () => {
    if (!track) return;
    try {
      await playTrackImmediately(track);
    } catch {
      // retry failed; error row stays visible via audioError
    }
  };

  // Share link with current timestamp (?t=seconds) — web parity Tier 1.
  // EpisodeDetail already honors ?t= on open, so recipients resume there.
  const handleShareTimestamp = async () => {
    if (!track || track.type !== "episode") return;
    const seconds = Math.max(0, Math.floor(position));
    const links = getEpisodeLinks(track.id, seconds > 0 ? seconds : undefined);
    try {
      await Share.share({
        title: track.title,
        message: `Listen to "${track.title}" on Arewa Central\n${links.webUrl}\n${links.deepLink}`,
        url: links.webUrl,
      });
    } catch {
      // dismissal — no-op
    }
  };

  const progress = duration > 0 ? Math.min(1, position / duration) : 0;
  const isLive = track?.type === "radio";
  const sleepLabel =
    sleepTimerMinutes === null
      ? t("sleepTimer")
      : sleepRemaining !== null && sleepRemaining !== undefined
        ? formatSleepRemaining(sleepRemaining)
        : `${sleepTimerMinutes} ${t("min")}`;

  return (
    <Screen scroll={false} className="bg-slate-950 dark:bg-slate-950">
      {/* Header */}
      <View className="flex-row items-center justify-between px-2 pb-2 pt-2">
        <Pressable
          onPress={() => {
            void stop();
            router.back();
          }}
          hitSlop={12}
          accessibilityLabel={`${t("stop")} and close`}
        >
          <ChevronDown size={26} color="#94a3b8" />
        </Pressable>
        <Text className="text-sm font-medium text-slate-400">{t("nowPlaying")}</Text>
        <View className="flex-row items-center gap-4">
          <Pressable
            onPress={() => setSheet("download")}
            hitSlop={12}
            disabled={!canDownload}
            accessibilityLabel={t("downloadEpisode")}
            className="items-center"
          >
            {downloaded ? (
              <CheckCircle2 size={22} color="#34d399" />
            ) : downloading ? (
              <Download size={22} color="#d4a853" />
            ) : downloadError ? (
              <AlertCircle size={22} color="#fb7185" />
            ) : (
              <Download size={22} color={canDownload ? "#94a3b8" : "#475569"} />
            )}
            {downloading ? (
              <Text className="mt-0.5 font-mono text-[9px] text-primary">{downloadProgress}%</Text>
            ) : null}
          </Pressable>
          <Pressable
            onPress={() => setPlaylistOpen(true)}
            hitSlop={12}
            disabled={!track || (track.type !== "episode" && track.type !== "dua")}
            accessibilityLabel={t("addToPlaylistTitle")}
          >
            <ListPlus size={22} color="#94a3b8" />
          </Pressable>
          <Pressable
            onPress={toggleFavorite}
            hitSlop={12}
            disabled={!track || (track.type !== "episode" && track.type !== "dua")}
            accessibilityLabel={favorite ? t("liked") : t("like")}
          >
            <Heart
              size={22}
              color={favorite ? "#f87171" : "#94a3b8"}
              fill={favorite ? "#f87171" : "transparent"}
            />
          </Pressable>
          <Pressable
            onPress={toggleBookmark}
            hitSlop={12}
            disabled={!track || track.type !== "episode"}
            accessibilityLabel={bookmarked ? t("delete") : "Bookmark"}
          >
            <Bookmark
              size={22}
              color={bookmarked ? "#d4a853" : "#94a3b8"}
              fill={bookmarked ? "#d4a853" : "transparent"}
            />
          </Pressable>
        </View>
      </View>

      {!track ? (
        <View className="flex-1 items-center justify-center px-6 pb-24">
          <View className="h-64 w-64 items-center justify-center rounded-3xl bg-slate-800/40">
            <Play size={42} color="#d4a853" />
          </View>
          <Text className="mt-8 text-center text-lg font-bold text-white">{t("noTrackPlaying")}</Text>
          {audioError ? (
            <Text className="mt-2 text-center text-sm text-amber-400">{audioError}</Text>
          ) : (
            <Text className="mt-2 text-center text-sm text-slate-400">{t("browseContent")}</Text>
          )}
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="items-center px-8 pb-16 pt-4"
          showsVerticalScrollIndicator={false}
        >
          <View className="relative">
            <Artwork uri={track.artworkUrl} size={320} rounded="rounded-3xl" />
            {isLive ? (
              <View className="absolute left-3 top-3 flex-row items-center gap-1 rounded-full bg-primary px-2.5 py-1">
                <View className="h-1.5 w-1.5 rounded-full bg-slate-900" />
                <Text className="text-[11px] font-bold text-slate-900">{t("liveStream")}</Text>
              </View>
            ) : null}
          </View>

          <Text className="mt-8 text-center text-xl font-bold leading-snug text-white">
            {track.title}
          </Text>
          {track.speaker ? (
            <Text className="mt-2 text-center text-[15px] text-primary">{track.speaker}</Text>
          ) : null}

          {/* Status badges: buffering + sleep remaining */}
          <View className="mt-3 flex-row items-center justify-center gap-2">
            {isBuffering ? (
              <View className="flex-row items-center gap-1.5 rounded-lg bg-slate-800 px-2 py-1">
                <ActivityIndicator size="small" color="#94a3b8" />
                <Text className="text-[11px] text-slate-400">{t("loading")}</Text>
              </View>
            ) : null}
            {sleepTimerMinutes !== null && sleepRemaining !== null && sleepRemaining !== undefined ? (
              <View className="flex-row items-center gap-1 rounded-lg bg-amber-500/20 px-2 py-1">
                <Moon size={10} color="#fbbf24" />
                <Text className="font-mono text-[11px] text-amber-300">
                  {formatSleepRemaining(sleepRemaining)}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Error state with retry */}
          {audioError ? (
            <View className="mt-4 w-full flex-row items-center justify-between rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3">
              <Text className="flex-1 text-sm text-rose-300" numberOfLines={2}>
                {audioError}
              </Text>
              <Pressable
                onPress={handleRetry}
                className="ml-3 rounded-full bg-rose-500/20 px-4 py-2 active:opacity-80"
              >
                <Text className="text-sm font-semibold text-rose-200">{t("retry")}</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Seek bar */}
          {!isLive ? (
            <View className="mt-6 w-full">
              <View ref={seekBarRef} onLayout={onBarLayout} className="h-9 justify-center">
                <Pressable onPress={onBarPress} className="h-4 justify-center">
                  <View className="h-1 w-full overflow-hidden rounded-full bg-slate-700">
                    <View
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${progress * 100}%` }}
                    />
                  </View>
                </Pressable>
              </View>
              <View className="mt-1 flex-row justify-between">
                <Text className="text-xs text-slate-400">{formatDuration(Math.floor(position))}</Text>
                <Text className="text-xs text-slate-400">{formatDuration(Math.round(duration))}</Text>
              </View>
            </View>
          ) : (
            <View className="mt-6">
              <Text className="text-sm text-slate-400">{t("liveStream")}</Text>
            </View>
          )}

          {/* Controls */}
          <View className="mt-6 flex-row items-center justify-center gap-8">
            <Pressable onPress={skipPrevious} hitSlop={10} disabled={!hasPrevious}>
              <SkipBack size={28} color={hasPrevious ? "#e2e8f0" : "#475569"} />
            </Pressable>
            <Pressable
              onPress={() => seek(Math.max(0, position - REWIND_SECONDS))}
              hitSlop={10}
              accessibilityLabel="Rewind 15 seconds"
              className="relative h-9 w-9 items-center justify-center"
            >
              <RotateCcw size={26} color="#cbd5e1" />
              <Text className="absolute inset-0 pt-0.5 text-center text-[9px] font-bold text-slate-300">
                {REWIND_SECONDS}
              </Text>
            </Pressable>
            <Pressable
              onPress={togglePlay}
              className="h-16 w-16 items-center justify-center rounded-full bg-primary active:opacity-90"
            >
              {isBuffering ? (
                <ActivityIndicator size="small" color="#0f172a" />
              ) : isPlaying ? (
                <Pause size={28} color="#0f172a" fill="#0f172a" />
              ) : (
                <Play size={28} color="#0f172a" fill="#0f172a" />
              )}
            </Pressable>
            <Pressable
              onPress={() => seek(Math.min(duration, position + FORWARD_SECONDS))}
              hitSlop={10}
              accessibilityLabel="Skip forward 30 seconds"
              className="relative h-9 w-9 items-center justify-center"
            >
              <RotateCw size={26} color="#cbd5e1" />
              <Text className="absolute inset-0 pt-0.5 text-center text-[9px] font-bold text-slate-300">
                {FORWARD_SECONDS}
              </Text>
            </Pressable>
            <Pressable onPress={skipNext} hitSlop={10} disabled={!hasNext}>
              <SkipForward size={28} color={hasNext ? "#e2e8f0" : "#475569"} />
            </Pressable>
          </View>

          {/* Secondary row: repeat / volume / up next */}
          {!isLive ? (
            <View className="mt-6 w-full flex-row items-center justify-between">
              <Pressable
                onPress={cycleRepeat}
                hitSlop={8}
                accessibilityLabel={`Repeat: ${repeatMode}`}
                className={`items-center rounded-xl px-3 py-2 ${repeatMode !== "off" ? "bg-primary/15" : ""}`}
              >
                <RepeatIcon size={20} color={repeatMode !== "off" ? "#d4a853" : "#94a3b8"} />
                <Text
                  className={`mt-0.5 text-[10px] ${repeatMode !== "off" ? "text-primary" : "text-slate-500"}`}
                >
                  {repeatMode === "one" ? t("one") : repeatMode === "all" ? t("allMode") : t("offMode")}
                </Text>
              </Pressable>

              <Pressable
                hitSlop={8}
                accessibilityLabel={isMuted ? t("muted") : t("vol")}
                onPress={() => void toggleMute()}
                className={`items-center rounded-xl px-3 py-2 ${isMuted ? "bg-rose-500/15" : ""}`}
              >
                {effectiveVolume === 0 ? (
                  <VolumeX size={20} color={isMuted ? "#fb7185" : "#94a3b8"} />
                ) : (
                  <Volume2 size={20} color="#94a3b8" />
                )}
                <Text className={`mt-0.5 text-[10px] ${isMuted ? "text-rose-400" : "text-slate-500"}`}>
                  {isMuted ? t("muted") : t("vol")}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => void handleShareTimestamp()}
                hitSlop={8}
                disabled={!track || track.type !== "episode"}
                accessibilityLabel={t("shareLink")}
                className="items-center rounded-xl px-3 py-2"
              >
                <Share2 size={20} color="#94a3b8" />
                <Text className="mt-0.5 text-[10px] text-slate-500">
                  {position > 0 ? formatDuration(Math.floor(position)) : t("share")}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setSheet("upnext")}
                hitSlop={8}
                accessibilityLabel={t("upNext")}
                className="flex-row items-center gap-1 rounded-xl bg-slate-800/70 px-3 py-2"
              >
                <ListOrdered size={14} color="#94a3b8" />
                <Text className="text-xs font-medium text-slate-300">
                  {queue.length > 0 ? queue.length : t("queue")}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {/* Volume bar: tap-to-set, same pattern as the seek bar */}
          {!isLive ? (
            <View className="mt-4 w-full">
              <View onLayout={onVolumeBarLayout} className="h-9 justify-center">
                <Pressable onPress={onVolumeBarPress} className="h-4 justify-center">
                  <View className="h-1 w-full overflow-hidden rounded-full bg-slate-700">
                    <View
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${effectiveVolume * 100}%` }}
                    />
                  </View>
                </Pressable>
              </View>
              <View className="mt-1 flex-row justify-between">
                <Text className="text-xs text-slate-400">{t("vol")}</Text>
                <Text className="text-xs text-slate-400">
                  {isMuted ? t("muted") : `${Math.round(volume * 100)}%`}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Speed + sleep */}
          {!isLive ? (
            <View className="mt-4 flex-row justify-center gap-2">
              <Pressable
                onPress={() => setSheet("speed")}
                onLongPress={() => void changeSpeed()}
                accessibilityLabel={t("playbackSpeed")}
                className="flex-row items-center gap-2 rounded-full border border-slate-700 px-4 py-2"
              >
                <Gauge size={16} color="#d4a853" />
                <Text className="text-sm font-medium text-slate-200">
                  {getPlaybackSpeedLabel(rate)}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSheet("sleep")}
                className="flex-row items-center gap-2 rounded-full border border-slate-700 px-4 py-2"
              >
                <Moon size={16} color={sleepTimerMinutes !== null ? "#d4a853" : "#94a3b8"} />
                <Text className="text-sm font-medium text-slate-200">{sleepLabel}</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      )}

      {/* ── Speed sheet: all PLAYBACK_SPEEDS (web parity: PlayerPage SpeedSheet) ── */}
      <Modal visible={sheet === "speed"} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <Pressable className="flex-1 justify-end bg-black/50" onPress={() => setSheet(null)}>
          <Pressable
            className="rounded-t-3xl border-t border-slate-700/60 bg-slate-900 p-6"
            onPress={(e) => e.stopPropagation?.()}
          >
            <View className="mx-auto mb-5 h-1 w-10 rounded-full bg-slate-600" />
            <View className="mb-5 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Gauge size={18} color="#d4a853" />
                <Text className="font-semibold text-slate-100">{t("playbackSpeed")}</Text>
              </View>
              <Pressable onPress={() => setSheet(null)} className="rounded-xl bg-slate-800 p-2" hitSlop={8}>
                <X size={16} color="#94a3b8" />
              </Pressable>
            </View>
            <View className="flex-row flex-wrap gap-2.5">
              {PLAYBACK_SPEEDS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => {
                    void setSpeed(s);
                    setSheet(null);
                  }}
                  accessibilityLabel={getPlaybackSpeedLabel(s)}
                  className={`min-w-[22%] flex-1 rounded-xl py-3 ${
                    rate === s ? "bg-primary/30" : "bg-slate-800"
                  }`}
                >
                  <Text
                    className={`text-center text-sm font-medium ${
                      rate === s ? "text-primary" : "text-slate-300"
                    }`}
                  >
                    {getPlaybackSpeedLabel(s)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Sleep sheet: 5,10,15,30,45,60,90 + cancel, remaining mm:ss ── */}
      <Modal visible={sheet === "sleep"} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <Pressable className="flex-1 justify-end bg-black/50" onPress={() => setSheet(null)}>
          <Pressable
            className="rounded-t-3xl border-t border-slate-700/60 bg-slate-900 p-6"
            onPress={(e) => e.stopPropagation?.()}
          >
            <View className="mx-auto mb-5 h-1 w-10 rounded-full bg-slate-600" />
            <View className="mb-5 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Moon size={18} color="#fbbf24" />
                <Text className="font-semibold text-slate-100">{t("sleepTimer")}</Text>
                {sleepRemaining !== null && sleepRemaining !== undefined && sleepTimerMinutes !== null ? (
                  <Text className="font-mono text-sm text-amber-400">
                    ({formatSleepRemaining(sleepRemaining)})
                  </Text>
                ) : null}
              </View>
              <Pressable onPress={() => setSheet(null)} className="rounded-xl bg-slate-800 p-2" hitSlop={8}>
                <X size={16} color="#94a3b8" />
              </Pressable>
            </View>
            <View className="flex-row flex-wrap gap-2.5">
              {SLEEP_OPTIONS.map((m) => (
                <Pressable
                  key={m}
                  onPress={() => {
                    setSleepTimer(m);
                    setSheet(null);
                  }}
                  className={`rounded-xl px-4 py-3 ${
                    sleepTimerMinutes === m ? "bg-amber-500/30" : "bg-slate-800"
                  }`}
                >
                  <Text
                    className={`text-sm font-medium ${
                      sleepTimerMinutes === m ? "text-amber-300" : "text-slate-300"
                    }`}
                  >
                    {m}m
                  </Text>
                </Pressable>
              ))}
            </View>
            {sleepTimerMinutes !== null ? (
              <Pressable
                onPress={() => {
                  cancelSleepTimer();
                  setSheet(null);
                }}
                className="mt-4 w-full rounded-xl bg-rose-500/20 py-3"
              >
                <Text className="text-center text-sm font-medium text-rose-400">{t("cancelTimer")}</Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Up Next queue sheet ── */}
      <Modal visible={sheet === "upnext"} transparent animationType="slide" onRequestClose={() => setSheet(null)}>
        <Pressable className="flex-1 justify-end bg-black/50" onPress={() => setSheet(null)}>
          <Pressable
            className="max-h-[70%] rounded-t-3xl border-t border-slate-700/60 bg-slate-900"
            onPress={(e) => e.stopPropagation?.()}
          >
            <View className="px-6 pb-3 pt-6">
              <View className="mx-auto mb-5 h-1 w-10 rounded-full bg-slate-600" />
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <ListOrdered size={18} color="#d4a853" />
                  <Text className="font-semibold text-slate-100">{t("upNext")}</Text>
                  <Text className="text-xs text-slate-500">
                    ({queue.length} {t("tracks")})
                  </Text>
                </View>
                <Pressable onPress={() => setSheet(null)} className="rounded-xl bg-slate-800 p-2" hitSlop={8}>
                  <X size={16} color="#94a3b8" />
                </Pressable>
              </View>
            </View>
            {queue.length === 0 ? (
              <Text className="px-6 py-6 text-center text-sm text-slate-400">{t("queueIsEmpty")}</Text>
            ) : (
              <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
                {queue.map((item, index) => {
                  const isCurrent = index === queueIndex;
                  return (
                    <Pressable
                      key={`${item.id}-${index}`}
                      onPress={() => void handleJump(index)}
                      className={`mb-1.5 flex-row items-center gap-3 rounded-xl p-2.5 ${
                        isCurrent ? "bg-primary/15" : ""
                      }`}
                    >
                      <Artwork uri={item.artworkUrl} size={40} rounded="rounded-lg" />
                      <View className="flex-1">
                        <Text
                          numberOfLines={1}
                          className={`text-sm ${isCurrent ? "font-semibold text-primary" : "text-slate-200"}`}
                        >
                          {item.title}
                        </Text>
                        <Text className="mt-0.5 font-mono text-[11px] text-slate-500">
                          {formatDuration(Math.round(item.duration ?? 0))}
                        </Text>
                      </View>
                      {!isCurrent ? (
                        <Pressable
                          onPress={() => void handleRemove(index)}
                          hitSlop={10}
                          className="rounded-lg p-1.5"
                          accessibilityLabel={t("delete")}
                        >
                          <Trash2 size={14} color="#64748b" />
                        </Pressable>
                      ) : isBuffering ? (
                        <ActivityIndicator size="small" color="#d4a853" />
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
      {/* ── Download sheet (web parity: PlayerPage DownloadSheet) ── */}
      {track ? (
        <PlayerDownloadSheet
          visible={sheet === "download"}
          track={track}
          onClose={() => setSheet(null)}
          onChanged={(id, isDone) => {
            if (id !== downloadId) return;
            setDownloaded(isDone);
            setDownloading(false);
            if (isDone) setDownloadError(null);
          }}
          onError={(id, message) => {
            if (id === downloadId) setDownloadError(message);
          }}
        />
      ) : null}
      {/* ── Add to Playlist sheet (web parity: PlayerPage PlaylistSheet) ── */}
      {track && (track.type === "episode" || track.type === "dua") ? (
        <AddToPlaylistSheet
          visible={playlistOpen}
          episodeId={track.id}
          onClose={() => setPlaylistOpen(false)}
        />
      ) : null}
    </Screen>
  );
}
