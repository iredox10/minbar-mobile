import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Clock, Layers, Mic, Search as SearchIcon, X } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Screen } from "@/components/Screen";
import { Artwork } from "@/components/Artwork";
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
const MAX_RECENTS = 8;

const POPULAR_TOPICS = [
  "Tafsir",
  "Sira",
  "Hadisi",
  "Fikihu",
  "Aure",
  "Matasa",
  "Sallah",
  "Ramadan",
  "Tauhid",
];

type SearchTab = "all" | "episodes" | "speakers" | "series";

interface Results {
  episodes: Episode[];
  series: Series[];
  speakers: Speaker[];
}

export default function SearchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string | string[] }>();
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<SearchTab>("all");
  const [recents, setRecents] = useState<string[]>([]);
  const [results, setResults] = useState<Results>({ episodes: [], series: [], speakers: [] });
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  // Autofocus input on mount (web parity: autoFocus).
  useEffect(() => {
    const incoming = params.q;
    const q = Array.isArray(incoming) ? incoming[0] : incoming;
    if (q) setQuery(q);
    // only honor initial param
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q]);

  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(id);
  }, []);

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

  /** Save a recent search (max 8), mirroring web's saveSearch on play/link tap. */
  const saveRecent = useCallback(
    (term: string) => {
      const q = term.trim();
      if (!q) return;
      trackSearch(q);
      setRecents((prev) => {
        const next = [q, ...prev.filter((r) => r !== q)].slice(0, MAX_RECENTS);
        AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );

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
    saveRecent(q);
  };

  const clearAll = () => {
    persistRecents([]);
  };

  const hasQuery = query.trim().length > 0;
  const total =
    results.episodes.length + results.series.length + results.speakers.length;

  const tabs = useMemo(
    () =>
      [
        {
          id: "all" as SearchTab,
          label: t("all"),
          count: total,
        },
        { id: "episodes" as SearchTab, label: t("episode"), count: results.episodes.length },
        { id: "speakers" as SearchTab, label: t("speakers"), count: results.speakers.length },
        { id: "series" as SearchTab, label: t("series"), count: results.series.length },
      ],
    [t, total, results.episodes.length, results.speakers.length, results.series.length],
  );

  const filteredEpisodes =
    activeTab === "all" || activeTab === "episodes" ? results.episodes : [];
  const filteredSpeakers =
    activeTab === "all" || activeTab === "speakers" ? results.speakers : [];
  const filteredSeries =
    activeTab === "all" || activeTab === "series" ? results.series : [];
  const hasFilteredResults =
    filteredEpisodes.length > 0 ||
    filteredSpeakers.length > 0 ||
    filteredSeries.length > 0;

  // Enrich episode rows with artwork / speaker names from sibling results.
  const seriesById = useMemo(() => {
    const map: Record<string, Series> = {};
    for (const s of results.series) map[s.$id] = s;
    return map;
  }, [results.series]);
  const speakerById = useMemo(() => {
    const map: Record<string, Speaker> = {};
    for (const s of results.speakers) map[s.$id] = s;
    return map;
  }, [results.speakers]);

  const artworkForEpisode = (episode: Episode) =>
    episode.seriesId ? seriesById[episode.seriesId]?.artworkUrl : undefined;
  const speakerForEpisode = (episode: Episode) =>
    (episode.speakerId ? speakerById[episode.speakerId]?.name : undefined) ??
    (episode.seriesId ? seriesById[episode.seriesId]?.title : undefined);

  return (
    <Screen>
      <View className="mb-2 mt-2">
        <Text className="text-2xl font-bold text-slate-900 dark:text-white">{t("search")}</Text>
      </View>

      <View className="mb-4 flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-800/40">
        <SearchIcon size={18} color="#94a3b8" />
        <TextInput
          ref={inputRef}
          className="flex-1 py-3.5 text-[15px] text-slate-900 dark:text-slate-100"
          placeholder={t("searchPlaceholder")}
          placeholderTextColor="#94a3b8"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoFocus
          returnKeyType="search"
          onSubmitEditing={handleSubmit}
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <X size={18} color="#94a3b8" />
          </Pressable>
        ) : null}
      </View>

      {hasQuery ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 pb-1"
          className="mb-4"
        >
          {tabs.map((tab) => (
            <Pressable
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              className={
                activeTab === tab.id
                  ? "rounded-full bg-primary px-4 py-2"
                  : "rounded-full bg-slate-200 px-4 py-2 dark:bg-slate-800"
              }
            >
              <Text
                className={
                  activeTab === tab.id
                    ? "text-sm font-semibold text-slate-900"
                    : "text-sm font-medium text-slate-500 dark:text-slate-400"
                }
              >
                {tab.label} ({tab.count})
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {loading ? (
        <View className="py-16 items-center">
          <ActivityIndicator color="#d4a853" />
        </View>
      ) : hasQuery ? (
        !hasFilteredResults && !loading ? (
          <EmptyState title={t("noResultsFound")} description={t("tryDifferentKeywords")} icon={SearchIcon} />
        ) : (
          <View className="gap-6">
            {filteredSpeakers.length > 0 ? (
              <View>
                <SectionHeader title={t("speakers")} />
                <View className="gap-2.5">
                  {filteredSpeakers.map((speaker) => (
                    <Pressable
                      key={speaker.$id}
                      onPress={() => {
                        saveRecent(query);
                        router.push({ pathname: "/speakers/[slug]", params: { slug: speaker.slug } });
                      }}
                      className="flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 active:opacity-80 dark:border-slate-800 dark:bg-slate-800/40"
                    >
                      <Artwork
                        uri={speaker.imageUrl}
                        size={48}
                        rounded="rounded-full"
                        fallbackIcon={Mic}
                      />
                      <Text className="flex-1 text-[15px] font-medium text-slate-900 dark:text-slate-100">
                        {speaker.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {filteredSeries.length > 0 ? (
              <View>
                <SectionHeader title={t("series")} />
                <View className="gap-2.5">
                  {filteredSeries.map((series) => (
                    <Pressable
                      key={series.$id}
                      onPress={() => {
                        saveRecent(query);
                        router.push({ pathname: "/series/[id]", params: { id: series.$id } });
                      }}
                      className="flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 active:opacity-80 dark:border-slate-800 dark:bg-slate-800/40"
                    >
                      <Artwork
                        uri={series.artworkUrl}
                        size={54}
                        rounded="rounded-xl"
                        fallbackIcon={Layers}
                      />
                      <View className="flex-1">
                        <Text
                          numberOfLines={2}
                          className="text-[15px] font-medium leading-snug text-slate-900 dark:text-slate-100"
                        >
                          {series.title}
                        </Text>
                        <Text className="mt-0.5 text-xs text-slate-400">
                          {series.episodeCount} {t("episodes")}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {filteredEpisodes.length > 0 ? (
              <View>
                <SectionHeader title={t("episodes")} />
                <View className="gap-2.5">
                  {filteredEpisodes.map((episode) => (
                    <EpisodeRow
                      key={episode.$id}
                      episode={episode}
                      artworkUrl={artworkForEpisode(episode)}
                      speakerName={speakerForEpisode(episode)}
                      onPress={() => saveRecent(query)}
                      onPlay={() => saveRecent(query)}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        )
      ) : (
        // Recents + popular topics when query is empty (web parity).
        <View className="gap-6">
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

          <View>
            <View className="mb-3 px-1">
              <Text className="font-bold text-slate-900 dark:text-slate-100">
                {t("browseTopics")}
              </Text>
            </View>
            <View className="flex-row flex-wrap gap-2.5">
              {POPULAR_TOPICS.map((topic) => (
                <Pressable
                  key={topic}
                  onPress={() => setQuery(topic)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 active:opacity-80 dark:border-slate-800 dark:bg-slate-800/40"
                  style={{ width: "48%" }}
                >
                  <Text className="text-[15px] font-medium text-slate-700 dark:text-slate-200">
                    {topic}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      )}
    </Screen>
  );
}
