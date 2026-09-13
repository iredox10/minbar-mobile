import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  Clock,
  Download,
  Heart,
  Play,
  PlayCircle,
  Search,
  Share2,
  TrendingUp,
  User,
  Check,
} from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SupportBanner } from "@/components/SupportBanner";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useTranslation } from "@/hooks/useTranslation";
import { usePlayer } from "@/context/PlayerContext";
import {
  getFeaturedSeries,
  getFeaturedSpeakers,
  getLatestEpisodes,
  getAppSettings,
  isAppwriteConfigured,
} from "@/lib/appwrite";
import { getInProgressHistory, isDownloaded } from "@/lib/db";
import {
  deleteDownloaded,
  downloadEpisode,
  getProgress,
  isDownloading,
  subscribeDownloads,
  subscribeProgress,
} from "@/lib/downloads";
import { formatDate, formatDuration } from "@/lib/utils";
import type { Episode, PlaybackHistory } from "@/types";

function SectionLoading() {
  return (
    <View className="mt-1 opacity-90">
      <View className="mb-4 h-5 w-40 rounded-md bg-slate-200 dark:bg-slate-800" />
      <View className="flex-row gap-5 px-1">
        {[0, 1, 2, 3].map((i) => (
          <View key={i} className="items-center">
            <View className="h-24 w-24 rounded-full bg-slate-200 dark:bg-slate-800" />
            <View className="mt-2.5 h-3 w-16 rounded-md bg-slate-200 dark:bg-slate-800" />
          </View>
        ))}
      </View>
    </View>
  );
}

/** Buttons on the right of an episode row: share + download (mirrors web). */
function EpisodeActions({ episode }: { episode: Episode }) {
  const { t } = useTranslation();
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

  const handleDownload = () => {
    if (downloaded) return; // web: done state is terminal, no re-download
    if (busy) {
      // web: tapping while downloading cancels
      deleteDownloaded(episode.$id).catch(() => {});
      return;
    }
    setBusy(true);
    setProgress(0);
    downloadEpisode(episode)
      .then(() => setDownloaded(true))
      .catch((err: unknown) => {
        const message = err instanceof Error && err.message ? err.message : t("downloadFailed");
        Alert.alert(t("downloadFailed"), message);
      })
      .finally(() => {
        setBusy(isDownloading(episode.$id));
        setProgress(getProgress(episode.$id));
      });
  };

  return (
    <View className="flex-row items-center">
      <Pressable
        hitSlop={8}
        onPress={() =>
          Share.share({
            title: episode.title,
            message: `Listen to "${episode.title}" on Arewa Central\narewa://episodes/${episode.$id}`,
          })
        }
      >
        <View className="h-9 w-9 items-center justify-center rounded-full bg-slate-800/70">
          <Share2 size={16} color="#94a3b8" />
        </View>
      </Pressable>
      <Pressable hitSlop={8} onPress={() => handleDownload()}>
        <View className="h-9 w-9 items-center justify-center rounded-full bg-slate-800/40">
          {downloaded ? (
            <Check size={16} color="#34d399" />
          ) : busy ? (
            progress != null ? (
              <Text className="text-[10px] font-semibold text-slate-300">{progress}%</Text>
            ) : (
              <ActivityIndicator size="small" color="#d4a853" />
            )
          ) : (
            <Download size={16} color="#94a3b8" />
          )}
        </View>
      </Pressable>
    </View>
  );
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { playTrackImmediately, playEpisode, togglePlay, seek, track: currentTrack, isPlaying } =
    usePlayer();
  const [inProgress, setInProgress] = useState<PlaybackHistory[]>([]);
  const [donationsEnabled, setDonationsEnabled] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getInProgressHistory(8).then(setInProgress).catch(() => {});
    }, []),
  );

  useEffect(() => {
    let active = true;
    getAppSettings()
      .then((s) => {
        if (active) setDonationsEnabled(!!s?.isDonationsEnabled);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const featuredSpeakers = useAsyncData(getFeaturedSpeakers, []);
  const featuredSeries = useAsyncData(getFeaturedSeries, []);
  const latestEpisodes = useAsyncData(() => getLatestEpisodes(8), []);

  const configured = isAppwriteConfigured();

  const cardGap = 12;
  const cardWidth = (width - 32 - cardGap) / 2;

  const isEpisodePlaying = (episodeId: string) =>
    currentTrack?.id === episodeId && isPlaying;

  /** Inline play like web's handlePlayEpisode — same track toggles, else loads. */
  const handlePlayEpisode = (episode: Episode) => {
    if (currentTrack?.id === episode.$id) {
      togglePlay().catch(() => {});
      return;
    }
    playEpisode({
      id: episode.$id,
      title: episode.title,
      audioUrl: episode.audioUrl,
      duration: episode.duration,
      type: "episode",
      seriesId: episode.seriesId,
      episodeNumber: episode.episodeNumber,
    }).catch(() => {});
  };

  const resume = (item: PlaybackHistory) => {
    if (!item.audioUrl) {
      router.push({ pathname: "/episodes/[id]", params: { id: item.episodeId } });
      return;
    }
    playTrackImmediately({
      id: item.episodeId,
      title: item.title ?? "",
      audioUrl: item.audioUrl,
      artworkUrl: item.artworkUrl,
      speaker: item.speaker,
      duration: item.duration,
      type: "episode",
    });
    seek(item.position);
    router.push("/player");
  };

  const speakers = featuredSpeakers.data ?? [];
  const series = featuredSeries.data ?? [];
  const episodes = latestEpisodes.data ?? [];

  return (
    <Screen>
      {/* Hero Section */}
      <View className="mx-[-16px] overflow-hidden border-b border-slate-200 bg-white dark:border-slate-800/60 dark:bg-slate-900">
        <View className="absolute right-0 top-0 h-40 w-40 rounded-full bg-primary/10" />
        <View className="absolute bottom-8 left-0 h-28 w-28 rounded-full bg-violet-500/10" />

        <View className="relative px-4 pb-12 pt-8">
          {donationsEnabled && (
            <View className="mb-4 flex-row justify-end">
              <Pressable
                onPress={() => router.push("/donate")}
                className="flex-row items-center gap-2 rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 active:bg-rose-500/20"
              >
                <Heart size={14} color="#fb7185" fill="#fb7185" style={{ opacity: 0.5 }} />
                <Text className="text-xs font-semibold tracking-wide text-rose-400">
                  {t("supportUs")}
                </Text>
              </Pressable>
            </View>
          )}

          <View className="mb-2 flex-row items-center justify-center gap-3">
            <Image
              source={require("../../assets/images/logo.png")}
              className="h-12 w-12 rounded-2xl"
              accessibilityLabel="Arewa Central"
            />
            <Text className="text-4xl font-bold text-slate-900 dark:text-white">
              {"Arewa "}
              <Text className="text-primary">Central</Text>
            </Text>
          </View>
          <Text className="mb-8 text-center text-lg text-slate-500 dark:text-slate-400">
            {t("discoverKnowledge")}
          </Text>

          {/* Search entry */}
          <Pressable
            onPress={() => router.push("/search")}
            className="flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-700/50 dark:bg-slate-900/80"
          >
            <Search size={20} color="#64748b" />
            <Text className="flex-1 text-[15px] text-slate-500">{t("searchPlaceholder")}</Text>
          </Pressable>
        </View>
      </View>

      {!configured ? (
        <View className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
          <Text className="text-sm text-amber-400">{t("configureAppwrite")}</Text>
        </View>
      ) : featuredSpeakers.loading ? (
        <View className="mt-6">
          <SectionLoading />
        </View>
      ) : (
        <>
          {/* Continue Listening — wired to playback history */}
          {inProgress.length > 0 && (
            <View className="mt-6">
              <SectionHeader
                title={t("continueListening")}
                onPress={() => router.push("/history")}
                accent="#a78bfa"
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-3 px-1"
              >
                {inProgress.map((item) => {
                  const progress =
                    item.duration > 0 ? Math.min((item.position / item.duration) * 100, 100) : 0;
                  return (
                    <Pressable
                      key={item.episodeId}
                      onPress={() => resume(item)}
                      className="w-36 active:opacity-80"
                    >
                      <View className="relative mb-2 h-36 w-full overflow-hidden rounded-xl bg-slate-800">
                        {item.artworkUrl ? (
                          <Image
                            source={{ uri: item.artworkUrl }}
                            className="h-full w-full"
                            resizeMode="cover"
                          />
                        ) : (
                          <View className="flex h-full w-full items-center justify-center bg-primary/30">
                            <PlayCircle size={28} color="#d4a853" />
                          </View>
                        )}
                        <View className="absolute inset-0 bg-slate-950/40" />
                        <View className="absolute bottom-1.5 right-1.5 h-8 w-8 items-center justify-center rounded-full bg-primary shadow-lg">
                          {isEpisodePlaying(item.episodeId) ? (
                            <View className="flex-row items-end gap-0.5">
                              {[14, 20, 11].map((h, i) => (
                                <View
                                  key={i}
                                  className="w-1 rounded-full bg-slate-900"
                                  style={{ height: h }}
                                />
                              ))}
                            </View>
                          ) : (
                            <Play size={14} color="#0f172a" fill="#0f172a" />
                          )}
                        </View>
                        <View className="absolute bottom-0 right-0 left-0 h-1 bg-black/40">
                          <View
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${progress}%` }}
                          />
                        </View>
                      </View>
                      <Text
                        numberOfLines={2}
                        className="text-xs font-medium leading-snug text-slate-900 dark:text-slate-100"
                      >
                        {item.title ?? t("episode")}
                      </Text>
                      {item.speaker ? (
                        <Text numberOfLines={1} className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-500">
                          {item.speaker}
                        </Text>
                      ) : null}
                      <Text className="mt-0.5 font-mono text-[10px] text-slate-400 dark:text-slate-600">
                        {formatDuration(item.position)} / {formatDuration(item.duration)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Featured Speakers */}
          <View className="mt-7">
            <SectionHeader
              title={t("featuredSpeakers")}
              onPress={() => router.push("/speakers")}
              accent="#d4a853"
            />
            {featuredSpeakers.error ? (
              <EmptyState title={t("noContentAvailableYet")} />
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-5 px-1"
              >
                {speakers.map((speaker, index) => (
                  <Pressable
                    key={speaker.$id}
                    onPress={() =>
                      router.push({ pathname: "/speakers/[slug]", params: { slug: speaker.slug } })
                    }
                    className="items-center active:opacity-80"
                  >
                    <View className="relative">
                      <View className="h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-slate-800/40 border-2 border-slate-300 dark:border-slate-700">
                        {speaker.imageUrl ? (
                          <Image
                            source={{ uri: speaker.imageUrl }}
                            className="h-full w-full"
                            resizeMode="cover"
                          />
                        ) : (
                          <User size={36} color="#64748b" />
                        )}
                      </View>
                      {index === 0 && (
                        <View className="absolute -right-1 -top-1 h-6 w-6 items-center justify-center rounded-full bg-primary">
                          <TrendingUp size={12} color="#0f172a" />
                        </View>
                      )}
                    </View>
                    <Text
                      numberOfLines={1}
                      className="mt-3 w-24 text-center text-sm font-medium text-slate-900 dark:text-slate-100"
                    >
                      {speaker.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Featured Series */}
          <View className="mt-7">
            <SectionHeader
              title={t("featuredSeries")}
              onPress={() => router.push("/series")}
              accent="#10b981"
            />
            {featuredSeries.error ? (
              <EmptyState title={t("noContentAvailableYet")} />
            ) : (
              <View className="flex-row flex-wrap gap-3">
                {series.slice(0, 6).map((item, index) => (
                  <Pressable
                    key={item.$id}
                    onPress={() => router.push({ pathname: "/series/[id]", params: { id: item.$id } })}
                    className="active:opacity-80"
                    style={{ width: cardWidth }}
                  >
                    <View className="relative aspect-square w-full overflow-hidden rounded-2xl bg-slate-800/40">
                      {item.artworkUrl ? (
                        <Image
                          source={{ uri: item.artworkUrl }}
                          className="h-full w-full"
                          resizeMode="cover"
                        />
                      ) : (
                        <View className="flex h-full w-full items-center justify-center">
                          <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/60">
                            <Play size={18} color="#d4a853" fill="#d4a853" className="ml-0.5" />
                          </View>
                        </View>
                      )}
                      <View className="absolute inset-0 bg-slate-950/50" />
                      <View className="absolute bottom-0 right-0 left-0 p-3">
                        <Text
                          numberOfLines={2}
                          className="font-semibold text-slate-100"
                          style={{ fontSize: 13 }}
                        >
                          {item.title}
                        </Text>
                        <Text className="mt-0.5 text-xs text-slate-400">
                          {item.episodeCount} {t("episodes")}
                        </Text>
                      </View>
                      {index === 0 && (
                        <View className="absolute left-3 top-3 rounded-lg bg-primary/90 px-2 py-1">
                          <Text className="text-xs font-medium text-slate-900">{t("popular")}</Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* New Episodes */}
          <View className="mt-7">
            <SectionHeader
              title={t("latestEpisodes")}
              onPress={() => router.push("/latest")}
              accent="#fb7185"
            />
            {latestEpisodes.error ? (
              <EmptyState title={t("noContentAvailableYet")} />
            ) : (
              <View className="gap-2.5">
                {episodes.slice(0, 5).map((episode) => {
                  const active = isEpisodePlaying(episode.$id);
                  return (
                    <Pressable
                      key={episode.$id}
                      onPress={() =>
                        router.push({ pathname: "/episodes/[id]", params: { id: episode.$id } })
                      }
                      className={
                        active
                          ? "flex-row items-center gap-3 rounded-2xl border border-primary bg-primary/5 p-3 active:opacity-80"
                          : "flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 active:opacity-80 dark:border-slate-800 dark:bg-slate-800/40"
                      }
                    >
                      <Pressable
                        onPress={() => handlePlayEpisode(episode)}
                        hitSlop={4}
                        className={
                          active
                            ? "h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-primary"
                            : "h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-slate-200 dark:bg-slate-800"
                        }
                      >
                        {active ? (
                          <View className="flex-row items-end gap-0.5">
                            {[14, 20, 11].map((h, i) => (
                              <View
                                key={i}
                                className="w-1 rounded-full bg-slate-900"
                                style={{ height: h }}
                              />
                            ))}
                          </View>
                        ) : (
                          <Play size={20} color="#94a3b8" fill="#94a3b8" />
                        )}
                      </Pressable>
                    <View className="flex-1">
                      <Text
                        numberOfLines={2}
                        className="text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-100"
                      >
                        {episode.title}
                      </Text>
                      <View className="mt-1 flex-row items-center gap-2">
                        <View className="flex-row items-center gap-1">
                          <Clock size={12} color="#94a3b8" />
                          <Text className="text-xs text-slate-500 dark:text-slate-400">
                            {formatDuration(episode.duration)}
                          </Text>
                        </View>
                        <View className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                        <Text className="text-xs text-slate-500 dark:text-slate-400">
                          {formatDate(episode.publishedAt)}
                        </Text>
                      </View>
                    </View>
                    <EpisodeActions episode={episode} />
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {/* Support Banner */}
          <SupportBanner enabled={donationsEnabled} />

          {/* Empty State */}
          {speakers.length === 0 && episodes.length === 0 && (
            <View className="py-16 text-center">
              <View className="mx-auto mb-6 h-24 w-24 items-center justify-center rounded-3xl bg-slate-800/50">
                <User className="h-12 w-12 text-slate-600" />
              </View>
              <Text className="text-center text-lg text-slate-400">{t("noContent")}</Text>
              <Text className="mt-2 text-center text-sm text-slate-500">{t("addAppwrite")}</Text>
            </View>
          )}
        </>
      )}
    </Screen>
  );
}