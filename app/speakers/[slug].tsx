import { ActivityIndicator, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Mic } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { BackHeader } from "@/components/ui/BackHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SeriesCard } from "@/components/ui/SeriesCard";
import { EpisodeRow } from "@/components/ui/EpisodeRow";
import { Artwork } from "@/components/Artwork";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useTranslation } from "@/hooks/useTranslation";
import {
  getSpeakerBySlug,
  getSeriesBySpeaker,
  getStandaloneEpisodesBySpeaker,
} from "@/lib/appwrite";

export default function SpeakerDetailScreen() {
  const { t } = useTranslation();
  const { slug } = useLocalSearchParams<{ slug: string }>();

  const speaker = useAsyncData(() => getSpeakerBySlug(slug ?? ""), [slug]);
  const speakerId = speaker.data?.$id ?? "";

  const series = useAsyncData(
    () => (speakerId ? getSeriesBySpeaker(speakerId) : Promise.resolve([])),
    [speakerId],
  );
  const standalone = useAsyncData(
    () => (speakerId ? getStandaloneEpisodesBySpeaker(speakerId) : Promise.resolve([])),
    [speakerId],
  );

  const loading = speaker.loading || series.loading || standalone.loading;

  return (
    <Screen>
      <BackHeader title={speaker.data?.name ?? t("speakers")} />

      {loading ? (
        <View className="py-16 items-center">
          <ActivityIndicator color="#d4a853" />
        </View>
      ) : !speaker.data ? (
        <EmptyState title={t("speakerNotFound")} />
      ) : (
        <>
          <View className="mb-6 flex-row gap-4">
            <Artwork uri={speaker.data.imageUrl} size={88} rounded="rounded-2xl" fallbackIcon={Mic} />
            <View className="flex-1">
              <Text className="text-xl font-bold text-slate-900 dark:text-white">
                {speaker.data.name}
              </Text>
              {speaker.data.bio ? (
                <Text className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  {speaker.data.bio}
                </Text>
              ) : null}
            </View>
          </View>

          {(series.data?.length ?? 0) > 0 ? (
            <View className="mb-6">
              <SectionHeader title={t("featuredSeries")} />
              <View className="flex-row flex-wrap justify-between gap-y-4">
                {series.data!.map((s) => (
                  <View key={s.$id} className="w-[48%]">
                    <SeriesCard series={s} wide />
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {(standalone.data?.length ?? 0) > 0 ? (
            <View className="mb-4">
              <SectionHeader title={t("latestEpisodes")} />
              <View className="gap-2.5">
                {standalone.data!.map((episode) => (
                  <EpisodeRow
                    key={episode.$id}
                    episode={episode}
                    artworkUrl={speaker.data?.imageUrl}
                    speakerName={speaker.data?.name}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}