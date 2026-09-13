import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Download, Play, Trash2 } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { EmptyState } from "@/components/ui/EmptyState";
import { Artwork } from "@/components/Artwork";
import { usePlayer } from "@/context/PlayerContext";
import { useTranslation } from "@/hooks/useTranslation";
import {
  deleteDownloaded,
  isDownloading,
  listDownloads,
  subscribeDownloads,
  subscribeProgress,
} from "@/lib/downloads";
import { formatDuration, formatFileSize } from "@/lib/utils";
import type { DownloadedEpisode } from "@/types";

export default function DownloadsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { playTrackImmediately } = usePlayer();
  const [items, setItems] = useState<DownloadedEpisode[] | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    setItems(await listDownloads());
  }, []);

  useEffect(() => {
    refresh();
    const unsubState = subscribeDownloads(refresh);
    const unsubProgress = subscribeProgress((episodeId, percent) => {
      setProgress((prev) => ({ ...prev, [episodeId]: percent }));
    });
    return () => {
      unsubState();
      unsubProgress();
    };
  }, [refresh]);

  const playDownload = (item: DownloadedEpisode) => {
    if (!item.localUri) return;
    playTrackImmediately({
      id: item.episodeId,
      title: item.title,
      audioUrl: item.localUri,
      artworkUrl: item.artworkUrl,
      speaker: item.speaker,
      duration: item.duration,
      type: "episode",
      seriesId: item.seriesId,
    });
    router.push("/player");
  };

  const handleDelete = async (item: DownloadedEpisode) => {
    await deleteDownloaded(item.episodeId);
    await refresh();
  };

  return (
    <Screen>
      <View className="mb-4 mt-2">
        <Text className="text-2xl font-bold text-slate-900 dark:text-white">{t("downloads")}</Text>
        <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("downloadsDesc")}</Text>
      </View>

      {items === null ? (
        <View className="py-16 items-center">
          <ActivityIndicator color="#d4a853" />
        </View>
      ) : items.length === 0 ? (
        <EmptyState title={t("noDownloads")} description={t("downloadToListen")} icon={Download} />
      ) : (
        <View className="gap-2.5">
          {items.map((item) => {
            const pct = progress[item.episodeId];
            const busy = pct !== undefined || isDownloading(item.episodeId);
            return (
              <View
                key={item.episodeId}
                className="flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-800/40"
              >
                <Artwork uri={item.artworkUrl} size={54} />
                <View className="flex-1">
                  <Text
                    numberOfLines={2}
                    className="text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-100"
                  >
                    {item.title}
                  </Text>
                  <Text className="mt-0.5 text-xs text-slate-400">
                    {formatDuration(item.duration)} · {formatFileSize(item.fileSize)}
                  </Text>
                  {busy ? (
                    <View className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <View className="h-full rounded-full bg-primary" style={{ width: `${pct ?? 0}%` }} />
                    </View>
                  ) : null}
                </View>
                {busy ? (
                  <Pressable onPress={() => handleDelete(item)} hitSlop={8}>
                    <Trash2 size={18} color="#94a3b8" />
                  </Pressable>
                ) : (
                  <View className="flex-row items-center gap-3">
                    <Pressable onPress={() => playDownload(item)} hitSlop={8}>
                      <View className="h-9 w-9 items-center justify-center rounded-full bg-primary">
                        <Play size={16} color="#0f172a" fill="#0f172a" />
                      </View>
                    </Pressable>
                    <Pressable onPress={() => handleDelete(item)} hitSlop={8}>
                      <Trash2 size={18} color="#f87171" />
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}