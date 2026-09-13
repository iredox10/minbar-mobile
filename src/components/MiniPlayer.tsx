import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Pause, Play } from "lucide-react-native";

import { Artwork } from "@/components/Artwork";
import { usePlayer } from "@/context/PlayerContext";
import { formatDuration } from "@/lib/utils";

export function MiniPlayer() {
  const router = useRouter();
  const { track, isPlaying, isBuffering, togglePlay, position, duration } = usePlayer();

  if (!track) return null;

  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

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
        <Pressable onPress={togglePlay} hitSlop={12} className="h-10 w-10 items-center justify-center rounded-full bg-primary">
          {isBuffering ? (
            <Text className="text-sm text-slate-900">…</Text>
          ) : isPlaying ? (
            <Pause size={18} color="#0f172a" fill="#0f172a" />
          ) : (
            <Play size={18} color="#0f172a" fill="#0f172a" />
          )}
        </Pressable>
      </Pressable>
      <View className="h-0.5 w-full bg-slate-200 dark:bg-slate-800">
        <View className="h-0.5 bg-primary" style={{ width: `${progress * 100}%` }} />
      </View>
      <View className="flex-row justify-between px-4 pb-1">
        <Text className="text-[10px] text-slate-400">{formatDuration(Math.floor(position))}</Text>
        {duration > 0 ? (
          <Text className="text-[10px] text-slate-400">{formatDuration(Math.round(duration))}</Text>
        ) : null}
      </View>
    </View>
  );
}