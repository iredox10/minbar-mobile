import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  Bookmark,
  ChevronDown,
  Gauge,
  ListOrdered,
  Moon,
  Pause,
  Play,
  Repeat,
  Repeat1,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { Artwork } from "@/components/Artwork";
import { usePlayer } from "@/context/PlayerContext";
import { useTranslation } from "@/hooks/useTranslation";
import { getBookmarks, addBookmark, deleteBookmark } from "@/lib/db";
import { formatDuration, getPlaybackSpeedLabel } from "@/lib/utils";
import type { Bookmark as BookmarkRecord, CurrentTrack, RepeatMode } from "@/types";

const SLEEP_OPTIONS = [5, 10, 15, 30, 45, 60, 90];

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
    hasNext,
    hasPrevious,
    playTrackImmediately,
    togglePlay,
    seek,
    skipNext,
    skipPrevious,
    changeSpeed,
    sleepTimerMinutes,
    sleepRemaining,
    setSleepTimer,
    cancelSleepTimer,
  } = player;

  // ── Repeat mode lives in PlayerContext (engine honors off/all/one) ───────
  const { repeatMode, setRepeatMode } = player;
  const cycleRepeat = () => {
    setRepeatMode(nextRepeatMode(repeatMode));
  };
  const RepeatIcon = repeatMode === "one" ? Repeat1 : Repeat;

  // ── Volume / mute (not exposed by expo-audio PlayerContext; hidden) ──────
  const playerAny = player as unknown as {
    volume?: number;
    isMuted?: boolean;
    setVolume?: (v: number) => void;
    toggleMute?: () => void;
  };
  const volume = typeof playerAny.volume === "number" ? playerAny.volume : 1;
  const isMuted = playerAny.isMuted ?? false;
  const hasVolumeCtl =
    typeof playerAny.setVolume === "function" && typeof playerAny.toggleMute === "function";

  // ── Error state (engine will expose status.error) ──────────────────────────
  // TODO(engine): expose audio status.error (expo-audio useAudioPlayerStatus)
  // in PlayerContext so this retry row appears on real load failures.
  const statusError = (
    player as unknown as { status?: { error?: unknown }; error?: unknown }
  ).status?.error ??
    (player as unknown as { error?: unknown }).error ??
    null;

  // ── Sheets ─────────────────────────────────────────────────────────────────
  const [sheet, setSheet] = useState<"sleep" | "upnext" | null>(null);

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
      // retry failed; error row stays visible via status.error
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
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ChevronDown size={26} color="#94a3b8" />
        </Pressable>
        <Text className="text-sm font-medium text-slate-400">{t("nowPlaying")}</Text>
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

      {!track ? (
        <View className="flex-1 items-center justify-center px-6 pb-24">
          <View className="h-64 w-64 items-center justify-center rounded-3xl bg-slate-800/40">
            <Play size={42} color="#d4a853" />
          </View>
          <Text className="mt-8 text-center text-lg font-bold text-white">{t("noTrackPlaying")}</Text>
          <Text className="mt-2 text-center text-sm text-slate-400">{t("browseContent")}</Text>
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
          {statusError ? (
            <View className="mt-4 w-full flex-row items-center justify-between rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3">
              <Text className="flex-1 text-sm text-rose-300" numberOfLines={2}>
                {typeof statusError === "string" ? statusError : t("downloadFailedBtn")}
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
            <Pressable onPress={() => seek(position - 30)} hitSlop={10}>
              <RotateCcw size={26} color="#cbd5e1" />
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
            <Pressable onPress={() => seek(position + 30)} hitSlop={10}>
              <RotateCw size={26} color="#cbd5e1" />
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
                disabled={!hasVolumeCtl}
                accessibilityLabel={isMuted ? t("muted") : t("vol")}
                onPress={() => playerAny.toggleMute?.()}
                className={`items-center rounded-xl px-3 py-2 ${!hasVolumeCtl ? "opacity-40" : ""} ${isMuted ? "bg-rose-500/15" : ""}`}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX size={20} color={isMuted ? "#fb7185" : "#94a3b8"} />
                ) : (
                  <Volume2 size={20} color="#94a3b8" />
                )}
                <Text className={`mt-0.5 text-[10px] ${isMuted ? "text-rose-400" : "text-slate-500"}`}>
                  {isMuted ? t("muted") : t("vol")}
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

          {/* Speed + sleep */}
          {!isLive ? (
            <View className="mt-4 flex-row justify-center gap-2">
              <Pressable
                onPress={changeSpeed}
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
    </Screen>
  );
}
