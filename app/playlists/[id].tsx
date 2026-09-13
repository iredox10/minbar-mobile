import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ListMusic, Play, Trash2 } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { BackHeader } from "@/components/ui/BackHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { EpisodeRow } from "@/components/ui/EpisodeRow";
import { usePlayer } from "@/context/PlayerContext";
import { useTranslation } from "@/hooks/useTranslation";
import { getPlaylistItems, getPlaylists, removePlaylistItem } from "@/lib/db";
import { getEpisodeById } from "@/lib/appwrite";
import type { CurrentTrack, Episode, Playlist } from "@/types";

export default function PlaylistDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const playlistId = Number(id ?? 0);
  const { playEpisode } = usePlayer();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const pls = await getPlaylists();
    setPlaylist(pls.find((p) => p.id === playlistId) ?? null);
    const items = await getPlaylistItems(playlistId);
    const resolved = await Promise.all(items.map((i) => getEpisodeById(i.episodeId)));
    setEpisodes(resolved.filter((e): e is Episode => e !== null));
    setLoading(false);
  }, [playlistId]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const handlePlayAll = () => {
    if (!episodes || episodes.length === 0) return;
    const queue: CurrentTrack[] = episodes.map((ep) => ({
      id: ep.$id,
      title: ep.title,
      audioUrl: ep.audioUrl,
      duration: ep.duration,
      type: "episode",
      seriesId: ep.seriesId,
      episodeNumber: ep.episodeNumber,
    }));
    playEpisode(queue[0], queue);
    router.push("/player");
  };

  const handleRemove = async (episodeId: string) => {
    const items = await getPlaylistItems(playlistId);
    const item = items.find((i) => i.episodeId === episodeId);
    if (item?.id) await removePlaylistItem(item.id);
    reload();
  };

  return (
    <Screen>
      <BackHeader
        title={playlist?.name ?? t("myPlaylist")}
        right={
          episodes && episodes.length > 0 && !loading ? (
            <Pressable
              onPress={handlePlayAll}
              className="flex-row items-center gap-1.5 rounded-full bg-primary px-3.5 py-2"
            >
              <Play size={14} color="#0f172a" fill="#0f172a" />
              <Text className="text-xs font-bold text-slate-900">{t("play")}</Text>
            </Pressable>
          ) : undefined
        }
      />

      {loading ? (
        <View className="py-16 items-center">
          <ActivityIndicator color="#d4a853" />
        </View>
      ) : playlist === null ? (
        <EmptyState title={t("noPlaylistsYetMsg")} icon={ListMusic} />
      ) : episodes && episodes.length > 0 ? (
        <View className="gap-2.5">
          {episodes.map((episode) => (
            <EpisodeRow
              key={episode.$id}
              episode={episode}
              showPlay={false}
              trailing={
                <Pressable onPress={() => handleRemove(episode.$id)} hitSlop={8}>
                  <Trash2 size={18} color="#f87171" />
                </Pressable>
              }
            />
          ))}
        </View>
      ) : (
        <EmptyState title={t("noEpisodesInPlaylist")} icon={ListMusic} />
      )}
    </Screen>
  );
}