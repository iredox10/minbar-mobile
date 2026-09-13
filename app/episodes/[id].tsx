import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Download, Heart, ListPlus, Play, Share2, SkipForward } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { BackHeader } from "@/components/ui/BackHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EpisodeRow } from "@/components/ui/EpisodeRow";
import { Artwork } from "@/components/Artwork";
import { AddToPlaylistSheet } from "@/components/AddToPlaylistSheet";
import { ShareSheet } from "@/components/ShareSheet";
import { episodeTarget } from "@/lib/share";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useTranslation } from "@/hooks/useTranslation";
import { formatDuration, formatDate } from "@/lib/utils";
import { usePlayer } from "@/context/PlayerContext";
import {
  getEpisodeById,
  getEpisodesBySeries,
  getSeriesById,
  getSpeakerById,
  getRelatedEpisodes,
} from "@/lib/appwrite";
import {
  addFavorite,
  getPlaybackHistory,
  isFavorite,
  isDownloaded as isEpisodeDownloaded,
  removeFavorite,
} from "@/lib/db";
import {
  deleteDownloaded,
  downloadEpisode,
  getProgress,
  isDownloading,
  subscribeProgress,
} from "@/lib/downloads";
import { trackFavoriteAdd } from "@/lib/analytics";
import type { Episode } from "@/types";

function timestampToSeconds(timeStr: string): number {
  const parts = timeStr.split(":").map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return parts[0] * 60 + parts[1];
}

export default function EpisodeDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id, t: tParam } = useLocalSearchParams<{ id: string; t?: string }>();
  const { playEpisode, seek } = usePlayer();

  const rawT = Array.isArray(tParam) ? tParam[0] : tParam;
  const parsedT = rawT ? parseInt(rawT, 10) : 0;
  const startAt = Number.isFinite(parsedT) && parsedT > 0 ? parsedT : 0;

  const [favorite, setFavorite] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [savedPosition, setSavedPosition] = useState(0);

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
  const seriesEpisodes = useAsyncData(
    () =>
      ep?.seriesId ? getEpisodesBySeries(ep.seriesId) : Promise.resolve([] as Episode[]),
    [ep?.seriesId],
  );
  const related = useAsyncData(
    () => (ep?.tags?.length ? getRelatedEpisodes(ep.tags, ep.$id) : Promise.resolve([])),
    [ep?.$id, ep?.tags?.length],
  );

  // Saved playback position (deep-link ?t= overrides history).
  useEffect(() => {
    if (!id || typeof id !== "string") return;
    if (startAt > 0) {
      setSavedPosition(startAt);
      return;
    }
    let active = true;
    getPlaybackHistory(id)
      .then((h) => {
        if (active) setSavedPosition(h?.position ?? 0);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id, startAt]);

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

  const handlePlay = async (startSeconds?: number) => {
    if (!ep) return;
    const start = startSeconds ?? savedPosition;
    await playEpisode({
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
    if (start > 0) {
      await seek(start);
    }
    router.push("/player");
  };

  const handlePlayEpisode = async (next: Episode) => {
    await playEpisode({
      id: next.$id,
      title: next.title,
      audioUrl: next.audioUrl,
      artworkUrl: series.data?.artworkUrl,
      speaker: speaker.data?.name ?? series.data?.title,
      duration: next.duration,
      type: "episode",
      seriesId: next.seriesId,
      episodeNumber: next.episodeNumber,
    });
    router.push("/player");
  };

  const handleTimestampPress = (seconds: number) => {
    void handlePlay(seconds);
  };

  const renderDescription = (text: string): ReactNode => {
    const regex = /(\d{1,2}:\d{2}(?::\d{2})?)/g;
    const nodes: ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let key = 0;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        nodes.push(<Text key={`d-${key++}`}>{text.substring(lastIndex, match.index)}</Text>);
      }
      const timeStr = match[0];
      const seconds = timestampToSeconds(timeStr);
      nodes.push(
        <Text
          key={`d-${key++}`}
          onPress={() => handleTimestampPress(seconds)}
          className="font-mono text-primary"
        >
          {timeStr}
        </Text>,
      );
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
      nodes.push(<Text key={`d-${key++}`}>{text.substring(lastIndex)}</Text>);
    }
    return nodes.length > 0 ? nodes : text;
  };

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

  const seriesEps = seriesEpisodes.data ?? [];
  const moreFromSeries = seriesEps.filter((e) => e.$id !== ep?.$id).slice(0, 8);
  const filteredRelated = (related.data ?? []).filter(
    (r) => !seriesEps.some((se) => se.$id === r.$id),
  );

  const currentEpNumber = ep?.episodeNumber ?? 0;
  const nextEpisode =
    seriesEps
      .filter((e) => (e.episodeNumber ?? 0) > currentEpNumber)
      .sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0))[0] ?? null;

  const savedProgressPercent =
    ep && ep.duration > 0 ? (savedPosition / ep.duration) * 100 : 0;

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
              {savedPosition > 0 ? (
                <Text className="mt-1 text-xs font-medium text-primary">
                  {Math.round(savedProgressPercent)}% {t("listened")}
                </Text>
              ) : null}
            </View>
          </View>

          {savedPosition > 0 ? (
            <View className="mb-4 h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <View
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(100, savedProgressPercent)}%` }}
              />
            </View>
          ) : null}

          <Pressable
            onPress={() => {
              void handlePlay();
            }}
            className="mb-4 flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 active:opacity-90"
          >
            <Play size={18} color="#0f172a" fill="#0f172a" />
            <Text className="text-[15px] font-semibold text-slate-900">
              {savedPosition > 0 ? t("resume") : t("play")}
            </Text>
          </Pressable>

          {nextEpisode ? (
            <Pressable
              onPress={() => {
                void handlePlayEpisode(nextEpisode);
              }}
              className="mb-4 flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 active:opacity-80 dark:border-slate-800 dark:bg-slate-800/40"
            >
              <Artwork uri={series.data?.artworkUrl} size={40} />
              <View className="flex-1">
                <Text className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {t("nextEpisode")}
                </Text>
                <Text
                  numberOfLines={1}
                  className="text-sm font-medium text-slate-700 dark:text-slate-200"
                >
                  {nextEpisode.title}
                </Text>
              </View>
              <SkipForward size={16} color="#d4a853" />
            </Pressable>
          ) : null}

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
            <Pressable
              onPress={() => setShareOpen(true)}
              className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-3 active:opacity-80 dark:border-slate-800 dark:bg-slate-800/40"
            >
              <Share2 size={18} color="#94a3b8" />
              <Text className="text-sm font-medium text-slate-700 dark:text-slate-200">{t("share")}</Text>
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
                {renderDescription(ep.description)}
              </Text>
            </View>
          ) : null}

          {moreFromSeries.length > 0 ? (
            <View className="mb-4">
              <SectionHeader title={t("moreFromThisSeries")} action={null} />
              <View className="gap-2.5">
                {moreFromSeries.map((s) => (
                  <EpisodeRow key={s.$id} episode={s} artworkUrl={series.data?.artworkUrl} />
                ))}
              </View>
            </View>
          ) : null}

          {filteredRelated.length > 0 ? (
            <View className="mb-4">
              <SectionHeader title={t("relatedContent")} action={null} />
              <View className="gap-2.5">
                {filteredRelated.map((r) => (
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
          <ShareSheet
            visible={shareOpen}
            onClose={() => setShareOpen(false)}
            target={episodeTarget(ep, speaker.data?.name ?? series.data?.title)}
          />
        </>
      )}
    </Screen>
  );
}
