import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Check, Download, Heart, Layers, Play, Share2 } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { BackHeader } from "@/components/ui/BackHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SeriesCard } from "@/components/ui/SeriesCard";
import { Artwork } from "@/components/Artwork";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useTranslation } from "@/hooks/useTranslation";
import {
  getEpisodesBySeries,
  getRelatedSeries,
  getSeriesById,
  getSpeakerById,
} from "@/lib/appwrite";
import { addFavorite, isFavorite, isDownloaded, removeFavorite } from "@/lib/db";
import {
  deleteDownloaded,
  downloadEpisode,
  getProgress,
  isDownloading,
  subscribeDownloads,
  subscribeProgress,
} from "@/lib/downloads";
import { formatDate, formatDuration } from "@/lib/utils";
import { usePlayer } from "@/context/PlayerContext";
import { trackFavoriteAdd } from "@/lib/analytics";
import type { CurrentTrack, Episode } from "@/types";

function SeriesEpisodeRow({
  episode,
  index,
  artworkUrl,
  speakerName,
  seriesId,
  onPlay,
}: {
  episode: Episode;
  index: number;
  artworkUrl?: string;
  speakerName?: string;
  seriesId: string;
  onPlay: (episode: Episode, index: number) => void;
}) {
  const [downloaded, setDownloaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | undefined>(() =>
    getProgress(episode.$id),
  );

  useEffect(() => {
    let active = true;
    isDownloaded(episode.$id).then((v) => {
      if (active) setDownloaded(v);
    });
    if (active) setBusy(isDownloading(episode.$id));
    const unsubState = subscribeDownloads(() => {
      isDownloaded(episode.$id).then((v) => {
        if (active) setDownloaded(v);
      });
      if (active) setBusy(isDownloading(episode.$id));
    });
    const unsubProgress = subscribeProgress((id, pct) => {
      if (active && id === episode.$id) setProgress(pct);
    });
    return () => {
      active = false;
      unsubState();
      unsubProgress();
    };
  }, [episode.$id]);

  const toggleDownload = () => {
    if (busy) {
      deleteDownloaded(episode.$id).catch(() => {});
      return;
    }
    if (downloaded) {
      deleteDownloaded(episode.$id).catch(() => {});
      return;
    }
    setBusy(true);
    setProgress(0);
    downloadEpisode(episode, { seriesId, artworkUrl, speaker: speakerName })
      .then(() => setDownloaded(true))
      .catch(() => {})
      .finally(() => {
        setBusy(isDownloading(episode.$id));
        setProgress(getProgress(episode.$id));
      });
  };

  const shareEpisode = () => {
    Share.share({
      title: episode.title,
      message: `Listen to "${episode.title}" on Arewa Central\narewa://episodes/${episode.$id}`,
    }).catch(() => {});
  };

  return (
    <View className="flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-800/40">
      <Text className="w-6 text-center font-mono text-sm text-slate-400">
        {episode.episodeNumber || index + 1}
      </Text>
      <Pressable
        onPress={() => onPlay(episode, index)}
        className="h-11 w-11 items-center justify-center rounded-xl bg-primary/15 active:opacity-80"
      >
        <Play size={16} color="#d4a853" fill="#d4a853" />
      </Pressable>
      <Pressable onPress={() => onPlay(episode, index)} className="flex-1">
        <Text
          numberOfLines={2}
          className="text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-100"
        >
          {episode.title}
        </Text>
        <View className="mt-0.5 flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
          <Text className="text-xs text-slate-400 dark:text-slate-500">
            {formatDuration(episode.duration)}
          </Text>
          {episode.publishedAt ? (
            <>
              <Text className="text-xs text-slate-500">·</Text>
              <Text className="text-xs text-slate-400 dark:text-slate-500">
                {formatDate(episode.publishedAt)}
              </Text>
            </>
          ) : null}
          {downloaded ? (
            <>
              <Text className="text-xs text-slate-500">·</Text>
              <View className="flex-row items-center gap-1">
                <Download size={10} color="#34d399" />
                <Text className="text-xs font-medium text-emerald-400">Downloaded</Text>
              </View>
            </>
          ) : null}
        </View>
      </Pressable>
      <View className="flex-row items-center">
        <Pressable hitSlop={8} onPress={shareEpisode}>
          <View className="h-9 w-9 items-center justify-center rounded-full">
            <Share2 size={15} color="#94a3b8" />
          </View>
        </Pressable>
        <Pressable hitSlop={8} onPress={toggleDownload}>
          <View className="h-9 w-9 items-center justify-center rounded-full">
            {downloaded ? (
              <Check size={15} color="#34d399" />
            ) : busy ? (
              progress != null ? (
                <Text className="text-[10px] font-semibold text-slate-300">{progress}%</Text>
              ) : (
                <ActivityIndicator size="small" color="#d4a853" />
              )
            ) : (
              <Download size={15} color="#94a3b8" />
            )}
          </View>
        </Pressable>
      </View>
    </View>
  );
}

export default function SeriesDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { playEpisode } = usePlayer();
  const [favorite, setFavorite] = useState(false);

  const series = useAsyncData(() => getSeriesById(id ?? ""), [id]);
  const seriesId = series.data?.$id ?? "";
  const seriesTags = series.data?.tags;

  const episodes = useAsyncData(
    () => (seriesId ? getEpisodesBySeries(seriesId) : Promise.resolve([])),
    [seriesId],
  );
  const speaker = useAsyncData(
    () => (series.data?.speakerId ? getSpeakerById(series.data.speakerId) : Promise.resolve(null)),
    [series.data?.speakerId],
  );
  const related = useAsyncData(
    () =>
      seriesTags?.length
        ? getRelatedSeries(seriesTags, seriesId)
        : Promise.resolve([]),
    [seriesId, seriesTags?.length],
  );

  const loading = series.loading || episodes.loading;

  useEffect(() => {
    if (!seriesId) return;
    let active = true;
    isFavorite("series", seriesId).then((v) => {
      if (active) setFavorite(v);
    });
    return () => {
      active = false;
    };
  }, [seriesId]);

  const toggleFavorite = async () => {
    if (!series.data) return;
    if (favorite) {
      await removeFavorite("series", series.data.$id);
      setFavorite(false);
    } else {
      await addFavorite({
        type: "series",
        itemId: series.data.$id,
        title: series.data.title,
        imageUrl: series.data.artworkUrl,
        addedAt: new Date(),
      });
      trackFavoriteAdd(series.data.$id, "series", series.data.title);
      setFavorite(true);
    }
  };

  const episodeList = episodes.data ?? [];
  const totalDuration = episodeList.reduce((acc, ep) => acc + (ep.duration || 0), 0);
  const speakerName = speaker.data?.name ?? series.data?.title;

  const buildQueue = (): CurrentTrack[] =>
    episodeList.map((ep) => ({
      id: ep.$id,
      title: ep.title,
      audioUrl: ep.audioUrl,
      artworkUrl: series.data?.artworkUrl,
      speaker: speakerName,
      duration: ep.duration,
      type: "episode" as const,
      seriesId,
      episodeNumber: ep.episodeNumber,
    }));

  const handlePlayAll = () => {
    const queue = buildQueue();
    if (queue.length === 0) return;
    playEpisode(queue[0], queue).catch(() => {});
    router.push("/player");
  };

  const handlePlayEpisode = (episode: Episode, index: number) => {
    const queue = buildQueue();
    if (queue.length === 0) return;
    const target = queue[index] ?? queue.find((trk) => trk.id === episode.$id) ?? queue[0];
    playEpisode(target, queue).catch(() => {});
    router.push("/player");
  };

  return (
    <Screen>
      <BackHeader title={series.data?.title ?? t("series")} />

      {loading ? (
        <View className="py-16 items-center">
          <ActivityIndicator color="#d4a853" />
        </View>
      ) : !series.data ? (
        <EmptyState title={t("seriesNotFound")} />
      ) : (
        <>
          <View className="mb-6 flex-row gap-4">
            <Artwork uri={series.data.artworkUrl} size={104} rounded="rounded-2xl" fallbackIcon={Layers} />
            <View className="flex-1">
              <Text className="text-xl font-bold text-slate-900 dark:text-white">
                {series.data.title}
              </Text>
              {speaker.data ? (
                <Text className="mt-1 text-sm text-primary">{speaker.data.name}</Text>
              ) : null}
              <Text className="mt-1 text-xs text-slate-400">
                {episodeList.length || series.data.episodeCount} {t("episodes")} ·{" "}
                {formatDuration(totalDuration)}
              </Text>
              {series.data.description ? (
                <Text className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  {series.data.description}
                </Text>
              ) : null}
              <Pressable
                onPress={toggleFavorite}
                className="mt-3 flex-row items-center gap-1.5 self-start rounded-full border border-slate-200 px-3 py-1.5 dark:border-slate-700"
              >
                <Heart size={14} color={favorite ? "#f87171" : "#94a3b8"} fill={favorite ? "#f87171" : "transparent"} />
                <Text className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {favorite ? t("favorited") : t("favorites")}
                </Text>
              </Pressable>
            </View>
          </View>

          {episodeList.length > 0 ? (
            <Pressable
              onPress={handlePlayAll}
              className="mb-4 flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 active:opacity-90"
            >
              <Play size={18} color="#0f172a" fill="#0f172a" />
              <Text className="text-[15px] font-semibold text-slate-900">{t("playAll")}</Text>
            </Pressable>
          ) : null}

          <SectionHeader title={t("episodes")} />
          {episodes.loading ? (
            <View className="py-10 items-center">
              <ActivityIndicator color="#d4a853" />
            </View>
          ) : episodeList.length > 0 ? (
            <View className="gap-2.5">
              {episodeList.map((episode, index) => (
                <SeriesEpisodeRow
                  key={episode.$id}
                  episode={episode}
                  index={index}
                  artworkUrl={series.data?.artworkUrl}
                  speakerName={speakerName}
                  seriesId={seriesId}
                  onPlay={handlePlayEpisode}
                />
              ))}
            </View>
          ) : (
            <EmptyState title={t("noEpisodesAvailableYet")} />
          )}

          {(related.data?.length ?? 0) > 0 ? (
            <View className="mb-4 mt-6">
              <SectionHeader title={t("relatedSeries")} action={null} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-4 pr-4">
                  {related.data!.map((s) => (
                    <SeriesCard key={s.$id} series={s} wide />
                  ))}
                </View>
              </ScrollView>
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}
