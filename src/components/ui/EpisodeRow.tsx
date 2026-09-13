import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Pause, Play } from "lucide-react-native";

import { Artwork } from "@/components/Artwork";
import { usePlayer } from "@/context/PlayerContext";
import { formatDuration } from "@/lib/utils";
import type { Episode } from "@/types";

interface EpisodeRowProps {
  episode: Episode;
  speakerName?: string;
  artworkUrl?: string;
  showPlay?: boolean;
  isPlaying?: boolean;
  onPress?: (episode: Episode) => void;
  onPlay?: (episode: Episode) => void;
  trailing?: ReactNode;
}

export function EpisodeRow({
  episode,
  speakerName,
  artworkUrl,
  showPlay = true,
  isPlaying: isPlayingProp,
  onPress,
  onPlay,
  trailing,
}: EpisodeRowProps) {
  const router = useRouter();
  const { track, isPlaying: playerIsPlaying, playEpisode, togglePlay } = usePlayer();

  const isCurrentTrack = track?.id === episode.$id;
  const playing = isPlayingProp ?? (isCurrentTrack && playerIsPlaying);

  const handlePress = () => {
    onPress?.(episode);
    router.push({ pathname: "/episodes/[id]", params: { id: episode.$id } });
  };

  const handlePlayPress = () => {
    if (isCurrentTrack) {
      togglePlay().catch(() => {});
    } else {
      playEpisode({
        id: episode.$id,
        title: episode.title,
        audioUrl: episode.audioUrl,
        artworkUrl,
        speaker: speakerName,
        duration: episode.duration,
        type: "episode",
        seriesId: episode.seriesId,
        episodeNumber: episode.episodeNumber,
      }).catch(() => {});
    }
    onPlay?.(episode);
  };

  return (
    <Pressable
      onPress={handlePress}
      className="flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 active:opacity-80 dark:border-slate-800 dark:bg-slate-800/40"
    >
      <Artwork uri={artworkUrl} size={54} />
      <View className="flex-1">
        <Text
          numberOfLines={2}
          className="text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-100"
        >
          {episode.title}
        </Text>
        <View className="mt-0.5 flex-row items-center gap-2">
          {speakerName ? (
            <Text numberOfLines={1} className="flex-1 text-xs text-slate-500 dark:text-slate-400">
              {speakerName}
            </Text>
          ) : null}
          {showPlay ? (
            <Text className="text-xs text-slate-400 dark:text-slate-500">
              {formatDuration(episode.duration)}
            </Text>
          ) : null}
        </View>
      </View>
      {showPlay ? (
        <Pressable
          onPress={handlePlayPress}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={playing ? "Pause" : "Play"}
          className="h-9 w-9 items-center justify-center rounded-full bg-primary/15"
        >
          {playing ? (
            <Pause size={16} color="#d4a853" fill="#d4a853" />
          ) : (
            <Play size={16} color="#d4a853" fill="#d4a853" />
          )}
        </Pressable>
      ) : null}
      {trailing}
    </Pressable>
  );
}