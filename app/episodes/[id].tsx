import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Download, Heart, ListPlus, Play } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { BackHeader } from "@/components/ui/BackHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EpisodeRow } from "@/components/ui/EpisodeRow";
import { Artwork } from "@/components/Artwork";
import { AddToPlaylistSheet } from "@/components/AddToPlaylistSheet";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useTranslation } from "@/hooks/useTranslation";
import { formatDuration, formatDate } from "@/lib/utils";
import { usePlayer } from "@/context/PlayerContext";
import {
  getEpisodeById,
  getSeriesById,
  getSpeakerById,
  getRelatedEpisodes,
} from "@/lib/appwrite";
import { addFavorite, isFavorite, isDownloaded as isEpisodeDownloaded, removeFavorite } from "@/lib/db";
import {
  deleteDownloaded,
  downloadEpisode,
  getProgress,
  isDownloading,
  subscribeProgress,
} from "@/lib/downloads";
import { trackFavoriteAdd } from "@/lib/analytics";

export default function EpisodeDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { playEpisode } = usePlayer();

  const [favorite, setFavorite] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const episode = useAsyncData(() => getEpisodeById(id ?? ""), [id]);
  const ep = episode.data;
  const epId = ep?.$id;

  const series = useAsyncData(
    () => (ep?.seriesId ? getSeriesById(ep.seriesId) : Promise.resolve(null)),
    [ep?.seriesId],
  );
  const speaker = useAsyncData(
    () => (ep?.speakerId ? getSpeakerById(ep.speakerId) : Promise.resolve(null)),
    [ep?.speakerId],
  );
  const related = useAsyncData(
    () => (ep?.tags?.length ? getRelatedEpisodes(ep.tags, ep.$id) : Promise.resolve([])),
    [ep?.$id, ep?.tags?.length],
  );

  const refreshDownloadState = useCallback(async () => {
    if (!epId) return;
    setDownloaded(await isEpisodeDownloaded(epId));
    setProgress(getProgress(epId));
  }, [epId]);

  useEffect(() => {
    if (!epId) return;
    let active = true;
    isFavorite("episode", epId).then((v) => {
      if (active) setFavorite(v);
    });
    refreshDownloadState();
    const unsub = subscribeProgress((id2, pct) => {
      if (id2 === epId) setProgress(pct);
    });
    return () => {
      active = false;
      unsub();
    };
  }, [epId, refreshDownloadState]);

  const toggleFavorite = async () => {
    if (!ep) return;
    if (favorite) {
      await removeFavorite("episode", ep.$id);
      setFavorite(false);
    } else {
      await addFavorite({
        type: "episode",
        itemId: ep.$id,
        title: ep.title,
        imageUrl: series.data?.artworkUrl,
        addedAt: new Date(),
      });
      trackFavoriteAdd(ep.$id, "episode", ep.title);
      setFavorite(true);
    }
  };

  const toggleDownload = async () => {
    if (!ep) return;
    setDownloadError(null);
    if (downloaded || isDownloading(ep.$id)) {
      await deleteDownloaded(ep.$id);
      await refreshDownloadState();
    } else {
      downloadEpisode(ep, {
        seriesId: ep.seriesId,
        speakerId: ep.speakerId,
        artworkUrl: series.data?.artworkUrl,
        speaker: speaker.data?.name ?? series.data?.title,
      })
        .then(() => refreshDownloadState())
        .catch((e: Error & { code?: string }) => {
          if (e.code === "DOWNLOAD_WIFI") setDownloadError(t("wifiOnly"));
          else if (e.code === "DOWNLOAD_OFFLINE") setDownloadError(t("offline"));
        });
    }
  };

  const loading = episode.loading;
  const downloading = progress !== undefined;

  return (
    <Screen>
      <BackHeader title={t("episode")} />

      {loading ? (
        <View className="py-16 items-center">
          <ActivityIndicator color="#d4a853" />
        </View>
      ) : !ep ? (
        <EmptyState title={t("episodeNotFound")} />
      ) : (
        <>
          <View className="mb-5 flex-row gap-4">
            <Artwork uri={series.data?.artworkUrl} size={104} rounded="rounded-2xl" />
            <View className="flex-1">
              <Text className="text-lg font-bold leading-snug text-slate-900 dark:text-white">
                {ep.title}
              </Text>
              {speaker.data ? (
                <Text className="mt-1 text-sm text-primary">{speaker.data.name}</Text>
              ) : series.data ? (
                <Text className="mt-1 text-sm text-primary">{series.data.title}</Text>
              ) : null}
              <View className="mt-1 flex-row items-center gap-2 text-xs">
                <Text className="text-xs text-slate-400">{formatDuration(ep.duration)}</Text>
                <Text className="text-xs text-slate-500">·</Text>
                <Text className="text-xs text-slate-400">{formatDate(ep.publishedAt)}</Text>
              </View>
            </View>
          </View>

          <Pressable
            onPress={() => {
              playEpisode({
                id: ep.$id,
                title: ep.title,
                audioUrl: ep.audioUrl,
                artworkUrl: series.data?.artworkUrl,
                speaker: speaker.data?.name ?? series.data?.title,
                duration: ep.duration,
                type: "episode",
                seriesId: ep.seriesId,
                episodeNumber: ep.episodeNumber,
              });
              router.push("/player");
            }}
            className="mb-4 flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 active:opacity-90"
          >
            <Play size={18} color="#0f172a" fill="#0f172a" />
            <Text className="text-[15px] font-semibold text-slate-900">{t("play")}</Text>
          </Pressable>

          <View className="mb-6 flex-row justify-between gap-3">
            <Pressable
              onPress={toggleFavorite}
              className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-3 active:opacity-80 dark:border-slate-800 dark:bg-slate-800/40"
            >
              <Heart size={18} color={favorite ? "#f87171" : "#94a3b8"} fill={favorite ? "#f87171" : "transparent"} />
              <Text className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("favorites")}</Text>
            </Pressable>
            <Pressable
              onPress={toggleDownload}
              className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-3 active:opacity-80 dark:border-slate-800 dark:bg-slate-800/40"
            >
              <Download size={18} color={downloaded || downloading ? "#d4a853" : "#94a3b8"} />
              <Text className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {downloading ? `${progress}%` : downloaded ? t("downloaded") : t("download")}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSheetOpen(true)}
              className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-3 active:opacity-80 dark:border-slate-800 dark:bg-slate-800/40"
            >
              <ListPlus size={18} color="#94a3b8" />
              <Text className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("playlists")}</Text>
            </Pressable>
          </View>

          {downloadError ? (
            <Text className="mb-6 text-center text-xs font-medium text-amber-500">
              {downloadError}
            </Text>
          ) : null}

          {ep.description ? (
            <View className="mb-6">
              <SectionHeader title={t("aboutThisEpisode")} action={null} />
              <Text className="leading-relaxed text-slate-600 dark:text-slate-300">
                {ep.description}
              </Text>
            </View>
          ) : null}

          {(related.data?.length ?? 0) > 0 ? (
            <View className="mb-4">
              <SectionHeader title={t("relatedContent")} action={null} />
              <View className="gap-2.5">
                {related.data!.map((r) => (
                  <EpisodeRow key={r.$id} episode={r} artworkUrl={series.data?.artworkUrl} />
                ))}
              </View>
            </View>
          ) : null}

          <AddToPlaylistSheet
            visible={sheetOpen}
            episodeId={ep.$id}
            onClose={() => setSheetOpen(false)}
          />
        </>
      )}
    </Screen>
  );
}