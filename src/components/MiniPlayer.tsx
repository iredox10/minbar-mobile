import { useMemo, useRef, useState } from "react";
import { LayoutChangeEvent, PanResponder, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight, Pause, Play, RotateCcw, RotateCw } from "lucide-react-native";

import { Artwork } from "@/components/Artwork";
import { usePlayer } from "@/context/PlayerContext";
import { formatDuration } from "@/lib/utils";

/** Skip intervals match the native lock-screen commands (src/audio/player.ts). */
const REWIND_SECONDS = 15;
const FORWARD_SECONDS = 30;

export function MiniPlayer() {
  const router = useRouter();
  const { track, isPlaying, isBuffering, togglePlay, position, duration, seek, skipNext, hasNext } =
    usePlayer();

  // ── Scrub: tap seeks immediately, drag previews then commits on release ───
  const barWidthRef = useRef(0);
  const [scrubTarget, setScrubTarget] = useState<number | null>(null);

  const targetFromX = (x: number): number | null => {
    if (duration <= 0 || !barWidthRef.current) return null;
    const ratio = Math.max(0, Math.min(1, x / barWidthRef.current));
    return ratio * duration;
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => duration > 0,
        onMoveShouldSetPanResponder: () => duration > 0,
        onPanResponderGrant: (e) => {
          const target = targetFromX(e.nativeEvent.locationX);
          if (target == null) return;
          setScrubTarget(target);
          seek(target);
        },
        onPanResponderMove: (e) => {
          const target = targetFromX(e.nativeEvent.locationX);
          if (target != null) setScrubTarget(target);
        },
        onPanResponderRelease: () => {
          if (scrubTarget != null) seek(scrubTarget);
          setScrubTarget(null);
        },
        onPanResponderTerminate: () => setScrubTarget(null),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [duration, scrubTarget, seek],
  );

  if (!track) return null;

  const displayPosition = scrubTarget ?? position;
  const progress = duration > 0 ? Math.min(1, displayPosition / duration) : 0;

  return (
    <View className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <Pressable
        onPress={() => router.push("/player")}
        className="flex-row items-center gap-3 px-4 py-2.5"
      >
        <Artwork uri={track.artworkUrl} size={46} rounded="rounded-xl" />
        <View className="flex-1">
          <Text numberOfLines={1} className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">
            {track.title}
          </Text>
          {track.speaker ? (
            <Text numberOfLines={1} className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {track.speaker}
            </Text>
          ) : null}
        </View>
        {/* Controls: rewind 15s / play-pause / forward 30s / next track */}
        <View className="flex-row items-center">
          <Pressable
            onPress={() => seek(Math.max(0, position - REWIND_SECONDS))}
            hitSlop={8}
            disabled={duration <= 0}
            accessibilityLabel={`Rewind ${REWIND_SECONDS} seconds`}
            className="h-9 w-8 items-center justify-center"
          >
            <RotateCcw size={19} color={duration > 0 ? "#64748b" : "#cbd5e1"} />
            <Text className="absolute inset-0 pt-0.5 text-center text-[8px] font-bold text-slate-500">
              {REWIND_SECONDS}
            </Text>
          </Pressable>
          <Pressable
            onPress={togglePlay}
            hitSlop={12}
            accessibilityLabel={isPlaying ? "Pause" : "Play"}
            className="h-10 w-10 items-center justify-center rounded-full bg-primary"
          >
            {isBuffering ? (
              <Text className="text-sm text-slate-900">…</Text>
            ) : isPlaying ? (
              <Pause size={18} color="#0f172a" fill="#0f172a" />
            ) : (
              <Play size={18} color="#0f172a" fill="#0f172a" />
            )}
          </Pressable>
          <Pressable
            onPress={() => seek(Math.min(duration, position + FORWARD_SECONDS))}
            hitSlop={8}
            disabled={duration <= 0}
            accessibilityLabel={`Skip forward ${FORWARD_SECONDS} seconds`}
            className="h-9 w-8 items-center justify-center"
          >
            <RotateCw size={19} color={duration > 0 ? "#64748b" : "#cbd5e1"} />
            <Text className="absolute inset-0 pt-0.5 text-center text-[8px] font-bold text-slate-500">
              {FORWARD_SECONDS}
            </Text>
          </Pressable>
          <Pressable
            onPress={skipNext}
            hitSlop={8}
            disabled={!hasNext}
            accessibilityLabel="Next track"
            className="h-9 w-8 items-center justify-center"
          >
            <ChevronRight size={19} color={hasNext ? "#64748b" : "#cbd5e1"} />
          </Pressable>
        </View>
      </Pressable>
      {/* Seekable progress strip (tap or drag to seek) */}
      <View
        onLayout={(e: LayoutChangeEvent) => {
          barWidthRef.current = e.nativeEvent.layout.width;
        }}
        {...panResponder.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel="Seek"
        accessibilityValue={{
          min: 0,
          max: Math.max(0, Math.round(duration)),
          now: Math.max(0, Math.round(displayPosition)),
        }}
        className="h-4 w-full justify-center"
      >
        <View className="h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <View className="h-full rounded-full bg-primary" style={{ width: `${progress * 100}%` }} />
        </View>
      </View>
      <View className="flex-row justify-between px-4 pb-1">
        <Text className="text-[10px] text-slate-400">
          {formatDuration(Math.floor(displayPosition))}
        </Text>
        {duration > 0 ? (
          <Text className="text-[10px] text-slate-400">{formatDuration(Math.round(duration))}</Text>
        ) : null}
      </View>
    </View>
  );
}