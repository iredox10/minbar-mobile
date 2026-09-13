import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Clock, Search as SearchIcon, X } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { EpisodeRow } from "@/components/ui/EpisodeRow";
import { useTranslation } from "@/hooks/useTranslation";
import {
  searchEpisodes,
  searchSeries,
  searchSpeakers,
} from "@/lib/appwrite";
import { trackSearch } from "@/lib/analytics";
import type { Episode, Series, Speaker } from "@/types";

const RECENTS_KEY = "recentSearches";
const DEBOUNCE_MS = 400;

interface Results {
  episodes: Episode[];
  series: Series[];
  speakers: Speaker[];
}

export default function SearchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<string[]>([]);
  const [results, setResults] = useState<Results>({ episodes: [], series: [], speakers: [] });
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(RECENTS_KEY)
      .then((raw) => {
        if (raw) setRecents(JSON.parse(raw) as string[]);
      })
      .catch(() => {});
  }, []);

  const persistRecents = useCallback((next: string[]) => {
    setRecents(next);
    AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults({ episodes: [], series: [], speakers: [] });
      return;
    }
    setLoading(true);
    try {
      const [episodes, series, speakers] = await Promise.all([
        searchEpisodes(q),
        searchSeries(q),
        searchSpeakers(q),
      ]);
      setResults({ episodes, series, speakers });
    } catch {
      setResults({ episodes: [], series: [], speakers: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => runSearch(query), DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, runSearch]);

  const handleSubmit = () => {
    const q = query.trim();
    if (!q) return;
    runSearch(q);
    trackSearch(q);
    persistRecents([q, ...recents.filter((r) => r !== q)].slice(0, 8));
  };

  const clearAll = () => {
    persistRecents([]);
  };

  const hasQuery = query.trim().length > 0;
  const total =
    results.episodes.length + results.series.length + results.speakers.length;

  return (
    <Screen>
      <View className="mb-2 mt-2">
        <Text className="text-2xl font-bold text-slate-900 dark:text-white">{t("search")}</Text>
      </View>

      <View className="mb-6 flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-800/40">
        <SearchIcon size={18} color="#94a3b8" />
        <TextInput
          className="flex-1 py-3.5 text-[15px] text-slate-900 dark:text-slate-100"
          placeholder={t("searchPlaceholder")}
          placeholderTextColor="#94a3b8"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={handleSubmit}
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <X size={18} color="#94a3b8" />
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View className="py-16 items-center">
          <ActivityIndicator color="#d4a853" />
        </View>
      ) : hasQuery ? (
        total === 0 ? (
          <EmptyState title={t("noResultsFound")} description={t("tryDifferentKeywords")} icon={SearchIcon} />
        ) : (
          <View className="gap-6">
            {results.speakers.length > 0 ? (
              <View>
                <SectionHeader title={t("speakers")} />
                <View className="gap-2.5">
                  {results.speakers.map((speaker) => (
                    <Pressable
                      key={speaker.$id}
                      onPress={() => router.push({ pathname: "/speakers/[slug]", params: { slug: speaker.slug } })}
                      className="flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 active:opacity-80 dark:border-slate-800 dark:bg-slate-800/40"
                    >
                      <Text className="flex-1 text-[15px] font-medium text-slate-900 dark:text-slate-100">
                        {speaker.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {results.series.length > 0 ? (
              <View>
                <SectionHeader title={t("series")} />
                <View className="gap-2.5">
                  {results.series.map((series) => (
                    <Pressable
                      key={series.$id}
                      onPress={() => router.push({ pathname: "/series/[id]", params: { id: series.$id } })}
                      className="flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-800/40"
                    >
                      <Text className="flex-1 text-[15px] font-medium text-slate-900 dark:text-slate-100">
                        {series.title}
                      </Text>
                      <Text className="text-xs text-slate-400">
                        {series.episodeCount} {t("episodes")}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {results.episodes.length > 0 ? (
              <View>
                <SectionHeader title={t("episodes")} />
                <View className="gap-2.5">
                  {results.episodes.map((episode) => (
                    <EpisodeRow key={episode.$id} episode={episode} />
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        )
      ) : (
        // Recent searches
        <View className="gap-2">
          <View className="flex-row items-center justify-between px-1">
            <Text className="font-bold text-slate-900 dark:text-slate-100">
              {t("recentSearches")}
            </Text>
            {recents.length > 0 ? (
              <Pressable onPress={clearAll} hitSlop={8}>
                <Text className="text-sm text-primary">{t("clear")}</Text>
              </Pressable>
            ) : null}
          </View>
          {recents.length === 0 ? (
            <EmptyState title={t("noResultsFound")} description={t("tryDifferentKeywords")} icon={SearchIcon} />
          ) : (
            recents.map((r) => (
              <Pressable
                key={r}
                onPress={() => setQuery(r)}
                className="flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40"
              >
                <Clock size={16} color="#94a3b8" />
                <Text className="flex-1 text-[15px] text-slate-700 dark:text-slate-300">{r}</Text>
              </Pressable>
            ))
          )}
        </View>
      )}
    </Screen>
  );
}