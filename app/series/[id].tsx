import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Heart, Layers } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { BackHeader } from "@/components/ui/BackHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EpisodeRow } from "@/components/ui/EpisodeRow";
import { Artwork } from "@/components/Artwork";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useTranslation } from "@/hooks/useTranslation";
import { getSeriesById, getEpisodesBySeries, getSpeakerById } from "@/lib/appwrite";
import { addFavorite, isFavorite, removeFavorite } from "@/lib/db";
import { trackFavoriteAdd } from "@/lib/analytics";

export default function SeriesDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [favorite, setFavorite] = useState(false);

  const series = useAsyncData(() => getSeriesById(id ?? ""), [id]);
  const seriesId = series.data?.$id ?? "";

  const episodes = useAsyncData(
    () => (seriesId ? getEpisodesBySeries(seriesId) : Promise.resolve([])),
    [seriesId],
  );
  const speaker = useAsyncData(
    () => (series.data?.speakerId ? getSpeakerById(series.data.speakerId) : Promise.resolve(null)),
    [series.data?.speakerId],
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
                {series.data.episodeCount} {t("episodes")}
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

          <SectionHeader title={t("episodes")} />
          {episodes.loading ? (
            <View className="py-10 items-center">
              <ActivityIndicator color="#d4a853" />
            </View>
          ) : episodes.data && episodes.data.length > 0 ? (
            <View className="gap-2.5">
              {episodes.data.map((episode) => (
                <EpisodeRow
                  key={episode.$id}
                  episode={episode}
                  artworkUrl={series.data?.artworkUrl}
                  speakerName={speaker.data?.name}
                />
              ))}
            </View>
          ) : (
            <EmptyState title={t("noEpisodesAvailableYet")} />
          )}
        </>
      )}
    </Screen>
  );
}