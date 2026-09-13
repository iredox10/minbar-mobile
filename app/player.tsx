import { useEffect, useRef, useState } from "react";
import { LayoutChangeEvent, Pressable, Text, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  Bookmark,
  ChevronDown,
  Gauge,
  Moon,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
} from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { Artwork } from "@/components/Artwork";
import { usePlayer } from "@/context/PlayerContext";
import { useTranslation } from "@/hooks/useTranslation";
import { getBookmarks, addBookmark } from "@/lib/db";
import { formatDuration, getPlaybackSpeedLabel } from "@/lib/utils";
import type { CurrentTrack } from "@/types";

export default function PlayerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    title?: string;
    audioUrl?: string;
    duration?: string;
  }>();

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
  } = usePlayer();

  const seekBarRef = useRef<View>(null);
  const barWidthRef = useRef(0);
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    if (!track?.id) return;
    let active = true;
    getBookmarks(track.id).then((marks) => {
      if (active && marks.length > 0) setBookmarked(true);
    });
    return () => {
      active = false;
    };
  }, [track?.id]);

  const toggleBookmark = async () => {
    if (!track || track.type !== "episode") return;
    if (!bookmarked && position > 0) {
      await addBookmark({
        episodeId: track.id,
        episodeTitle: track.title,
        speakerName: track.speaker,
        artworkUrl: track.artworkUrl,
        audioUrl: track.audioUrl,
        position: Math.floor(position),
        createdAt: new Date(),
      });
      setBookmarked(true);
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

  const onBarLayout = (e: LayoutChangeEvent) => {
    barWidthRef.current = e.nativeEvent.layout.width;
  };

  const onBarPress = (e: { nativeEvent: { locationX: number } }) => {
    if (duration <= 0 || !barWidthRef.current) return;
    const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / barWidthRef.current));
    seek(ratio * duration);
  };

  const progress = duration > 0 ? Math.min(1, position / duration) : 0;
  const isLive = track?.type === "radio";

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
          disabled={!track || track.type !== "episode" || bookmarked}
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
        <>
          <View className="items-center px-8 pt-4">
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

            {/* Seek bar */}
            {!isLive ? (
              <View className="mt-8 w-full">
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
              <View className="mt-8">
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
                  <Text className="text-sm font-bold text-slate-900">…</Text>
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

            {/* Speed */}
            {!isLive ? (
              <View className="mt-8 flex-row justify-center gap-2">
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
                  onPress={() => {
                    if (sleepTimerMinutes !== null) {
                      cancelSleepTimer();
                    } else {
                      setSleepTimer(15);
                    }
                  }}
                  className="flex-row items-center gap-2 rounded-full border border-slate-700 px-4 py-2"
                >
                  <Moon size={16} color={sleepTimerMinutes !== null ? "#d4a853" : "#94a3b8"} />
                  <Text className="text-sm font-medium text-slate-200">
                    {sleepTimerMinutes === null
                      ? t("sleepTimer")
                      : `${Math.ceil((sleepRemaining ?? 0) / 60)} ${t("min")}`}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {/* Queue */}
          {queue.length > 1 ? (
            <View className="mt-8 border-t border-slate-800 px-6 pb-24 pt-4">
              <Text className="mb-2 text-sm font-bold text-slate-200">{t("upNext")}</Text>
              <View className="gap-1">
                {queue.map((item, index) => (
                  <Pressable
                    key={`${item.id}-${index}`}
                    onPress={() => playTrackImmediately(item)}
                    className="flex-row items-center gap-3 rounded-xl px-2 py-2"
                  >
                    <Artwork uri={item.artworkUrl} size={36} rounded="rounded-lg" />
                    <View className="flex-1">
                      <Text
                        numberOfLines={1}
                        className={`text-sm ${index === queueIndex ? "font-semibold text-primary" : "text-slate-300"}`}
                      >
                        {item.title}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}