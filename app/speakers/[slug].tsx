import { ActivityIndicator, Pressable, Share, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Mic, Play, Share2, UserCheck, UserPlus } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { BackHeader } from "@/components/ui/BackHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SeriesCard } from "@/components/ui/SeriesCard";
import { EpisodeRow } from "@/components/ui/EpisodeRow";
import { Artwork } from "@/components/Artwork";
import { usePlayer } from "@/context/PlayerContext";
import { useUser } from "@/context/UserContext";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useTranslation } from "@/hooks/useTranslation";
import {
  getSpeakerBySlug,
  getSeriesBySpeaker,
  getStandaloneEpisodesBySpeaker,
} from "@/lib/appwrite";
import type { CurrentTrack } from "@/types";

export default function SpeakerDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const slugParam = Array.isArray(slug) ? slug[0] ?? "" : slug ?? "";
  const { following, toggleFollow } = useUser();
  const { playEpisode } = usePlayer();

  const speaker = useAsyncData(() => getSpeakerBySlug(slugParam), [slugParam]);
  const speakerId = speaker.data?.$id ?? "";
  const isFollowing = speakerId ? following.includes(speakerId) : false;

  const series = useAsyncData(
    () => (speakerId ? getSeriesBySpeaker(speakerId) : Promise.resolve([])),
    [speakerId],
  );
  const standalone = useAsyncData(
    () => (speakerId ? getStandaloneEpisodesBySpeaker(speakerId) : Promise.resolve([])),
    [speakerId],
  );

  const loading = speaker.loading || series.loading || standalone.loading;

  const handleShare = () => {
    if (!speaker.data) return;
    Share.share({
      title: speaker.data.name,
      message: `Listen to "${speaker.data.name}" on Arewa Central\narewa://speakers/${slugParam}`,
    }).catch(() => {});
  };

  const handlePlayAll = () => {
    const episodes = standalone.data;
    if (!episodes || episodes.length === 0) return;
    const queue: CurrentTrack[] = episodes.map((ep) => ({
      id: ep.$id,
      title: ep.title,
      audioUrl: ep.audioUrl,
      artworkUrl: speaker.data?.imageUrl,
      speaker: speaker.data?.name,
      duration: ep.duration,
      type: "episode",
      seriesId: ep.seriesId,
      episodeNumber: ep.episodeNumber,
    }));
    playEpisode(queue[0], queue).catch(() => {});
    router.push("/player");
  };

  return (
    <Screen>
      <BackHeader
        title={speaker.data?.name ?? t("speakers")}
        right={
          speaker.data ? (
            <Pressable
              onPress={handleShare}
              hitSlop={8}
              accessibilityLabel={t("share")}
              className="h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-800/40"
            >
              <Share2 size={16} color="#94a3b8" />
            </Pressable>
          ) : undefined
        }
      />

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
              <Pressable
                onPress={() => {
                  if (speakerId) toggleFollow(speakerId).catch(() => {});
                }}
                className={
                  isFollowing
                    ? "mt-3 flex-row items-center gap-1.5 self-start rounded-full border border-primary/30 bg-slate-800 px-3 py-1.5"
                    : "mt-3 flex-row items-center gap-1.5 self-start rounded-full bg-primary px-3 py-1.5"
                }
              >
                {isFollowing ? (
                  <UserCheck size={14} color="#d4a853" />
                ) : (
                  <UserPlus size={14} color="#0f172a" />
                )}
                <Text
                  className={
                    isFollowing
                      ? "text-xs font-semibold text-primary"
                      : "text-xs font-semibold text-slate-900"
                  }
                >
                  {isFollowing ? t("following") : t("follow")}
                </Text>
              </Pressable>
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
              <SectionHeader
                title={t("latestEpisodes")}
                rightSlot={
                  <Pressable
                    onPress={handlePlayAll}
                    className="flex-row items-center gap-1.5 rounded-full bg-primary px-3.5 py-2"
                  >
                    <Play size={14} color="#0f172a" fill="#0f172a" />
                    <Text className="text-xs font-bold text-slate-900">{t("playAll")}</Text>
                  </Pressable>
                }
              />
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
