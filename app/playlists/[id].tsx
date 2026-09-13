import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { CircleAlert, ListMusic, Play, Trash2 } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { BackHeader } from "@/components/ui/BackHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { EpisodeRow } from "@/components/ui/EpisodeRow";
import { usePlayer } from "@/context/PlayerContext";
import { useTranslation } from "@/hooks/useTranslation";
import { getPlaylistItems, getPlaylists, removePlaylistItem } from "@/lib/db";
import { getEpisodeById } from "@/lib/appwrite";
import type { CurrentTrack, Episode, Playlist, PlaylistItem } from "@/types";

interface PlaylistRow {
  item: PlaylistItem;
  episode: Episode | null;
}

export default function PlaylistDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const playlistId = Number(id ?? 0);
  const { playEpisode } = usePlayer();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [rows, setRows] = useState<PlaylistRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const pls = await getPlaylists();
      setPlaylist(pls.find((p) => p.id === playlistId) ?? null);
      const items = await getPlaylistItems(playlistId);
      const resolved = await Promise.all(
        items.map(async (item): Promise<PlaylistRow> => {
          try {
            const episode = await getEpisodeById(item.episodeId);
            return { item, episode };
          } catch {
            // Offline / fetch failure: keep the row so it isn't silently dropped.
            return { item, episode: null };
          }
        }),
      );
      setRows(resolved);
    } finally {
      setLoading(false);
    }
  }, [playlistId]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const playable = (rows ?? []).filter((r): r is PlaylistRow & { episode: Episode } => r.episode !== null);

  const handlePlayAll = () => {
    if (playable.length === 0) return;
    const queue: CurrentTrack[] = playable.map(({ episode: ep }) => ({
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

  const handleRemove = async (playlistItemId: number) => {
    await removePlaylistItem(playlistItemId);
    reload();
  };

  return (
    <Screen>
      <BackHeader
        title={playlist?.name ?? t("myPlaylist")}
        right={
          playable.length > 0 && !loading ? (
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
      ) : rows && rows.length > 0 ? (
        <View className="gap-2.5">
          {rows.map(({ item, episode }) =>
            episode ? (
              <EpisodeRow
                key={item.id ?? item.episodeId}
                episode={episode}
                showPlay={false}
                trailing={
                  <Pressable onPress={() => handleRemove(item.id!)} hitSlop={8}>
                    <Trash2 size={18} color="#f87171" />
                  </Pressable>
                }
              />
            ) : (
              <View
                key={item.id ?? item.episodeId}
                className="flex-row items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/40"
              >
                <View className="h-[54px] w-[54px] items-center justify-center rounded-xl bg-slate-200/60 dark:bg-slate-700/40">
                  <CircleAlert size={20} color="#94a3b8" />
                </View>
                <View className="flex-1">
                  <Text
                    numberOfLines={2}
                    className="text-[15px] font-semibold leading-snug text-slate-500 dark:text-slate-400"
                  >
                    {item.episodeId}
                  </Text>
                  <Text className="mt-0.5 text-xs text-slate-400">
                    {t("episodeNotFound")}
                  </Text>
                </View>
                <Pressable onPress={() => handleRemove(item.id!)} hitSlop={8}>
                  <Trash2 size={18} color="#f87171" />
                </Pressable>
              </View>
            ),
          )}
        </View>
      ) : (
        <EmptyState title={t("noEpisodesInPlaylist")} icon={ListMusic} />
      )}
    </Screen>
  );
}
