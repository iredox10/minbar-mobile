import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { Search as SearchIcon, X } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { BackHeader } from "@/components/ui/BackHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { EpisodeRow } from "@/components/ui/EpisodeRow";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useTranslation } from "@/hooks/useTranslation";
import { getLatestEpisodes, getSeriesById } from "@/lib/appwrite";
import type { Episode, Series } from "@/types";

async function loadLatestEpisodes(): Promise<{ episodes: Episode[]; seriesMap: Record<string, Series> }> {
  const episodes = await getLatestEpisodes(100);
  const seriesIds = [...new Set(episodes.map((e) => e.seriesId).filter(Boolean))] as string[];
  const seriesMap: Record<string, Series> = {};
  await Promise.all(
    seriesIds.map(async (id) => {
      try {
        const series = await getSeriesById(id);
        if (series) seriesMap[id] = series;
      } catch {
        // Series lookup is best-effort; rows still render without artwork.
      }
    }),
  );
  return { episodes, seriesMap };
}

export default function LatestEpisodesScreen() {
  const { t } = useTranslation();
  const { data, loading, error } = useAsyncData(loadLatestEpisodes, []);
  const [searchQuery, setSearchQuery] = useState("");

  const episodes = data?.episodes;
  const seriesMap = data?.seriesMap;

  const filtered = useMemo(() => {
    const list = episodes ?? [];
    const q = searchQuery.trim().toLowerCase();
    if (q === "") return list;
    return list.filter((e) => e.title.toLowerCase().includes(q));
  }, [episodes, searchQuery]);

  return (
    <Screen>
      <BackHeader title={t("latestEpisodes")} subtitle={t("latestEpisodesDesc")} />

      <View className="mb-6 flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-800/40">
        <SearchIcon size={18} color="#94a3b8" />
        <TextInput
          className="flex-1 py-3.5 text-[15px] text-slate-900 dark:text-slate-100"
          placeholder={t("searchEpisodes")}
          placeholderTextColor="#94a3b8"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCorrect={false}
          returnKeyType="search"
        />
        {searchQuery.length > 0 ? (
          <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
            <X size={18} color="#94a3b8" />
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View className="py-16 items-center">
          <ActivityIndicator color="#d4a853" />
        </View>
      ) : error ? (
        <EmptyState title={t("noEpisodesFound")} />
      ) : filtered.length > 0 ? (
        <View className="gap-2.5">
          {filtered.map((episode) => {
            const series = episode.seriesId ? seriesMap?.[episode.seriesId] : undefined;
            return (
              <EpisodeRow
                key={episode.$id}
                episode={episode}
                artworkUrl={series?.artworkUrl}
                speakerName={series?.title}
              />
            );
          })}
        </View>
      ) : (
        <EmptyState
          title={t("noEpisodesFound")}
          description={searchQuery.trim() ? t("tryDifferentSearchTerm") : undefined}
        />
      )}
    </Screen>
  );
}
