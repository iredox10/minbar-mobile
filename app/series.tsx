import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { Layers, Search as SearchIcon, X } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { BackHeader } from "@/components/ui/BackHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Artwork } from "@/components/Artwork";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useTranslation } from "@/hooks/useTranslation";
import { getAllSeries } from "@/lib/appwrite";

export default function SeriesListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data, loading, error } = useAsyncData(getAllSeries, []);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = useMemo(
    () => [...new Set((data ?? []).map((s) => s.category).filter(Boolean))],
    [data],
  );

  const filtered = useMemo(() => {
    let result = data ?? [];
    if (selectedCategory) {
      result = result.filter((s) => s.category === selectedCategory);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q !== "") {
      result = result.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.category?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [data, searchQuery, selectedCategory]);

  return (
    <Screen>
      <BackHeader title={t("allSeries")} subtitle={t("seriesDesc")} />

      <View className="mb-4 flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-800/40">
        <SearchIcon size={18} color="#94a3b8" />
        <TextInput
          className="flex-1 py-3.5 text-[15px] text-slate-900 dark:text-slate-100"
          placeholder={t("searchSeries")}
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

      {categories.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
          className="mb-4"
        >
          <Pressable
            onPress={() => setSelectedCategory(null)}
            className={
              selectedCategory === null
                ? "rounded-lg bg-primary px-3 py-1.5"
                : "rounded-lg bg-slate-200 px-3 py-1.5 dark:bg-slate-800/60"
            }
          >
            <Text
              className={
                selectedCategory === null
                  ? "text-sm text-slate-900"
                  : "text-sm text-slate-600 dark:text-slate-300"
              }
            >
              {t("all")}
            </Text>
          </Pressable>
          {categories.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => setSelectedCategory(active ? null : cat)}
                className={
                  active
                    ? "rounded-lg bg-primary px-3 py-1.5"
                    : "rounded-lg bg-slate-200 px-3 py-1.5 dark:bg-slate-800/60"
                }
              >
                <Text
                  className={
                    active
                      ? "text-sm text-slate-900"
                      : "text-sm text-slate-600 dark:text-slate-300"
                  }
                >
                  {cat}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {loading ? (
        <View className="py-16 items-center">
          <ActivityIndicator color="#d4a853" />
        </View>
      ) : error ? (
        <EmptyState title={t("noSeriesFound")} />
      ) : filtered.length > 0 ? (
        <View className="flex-row flex-wrap justify-between gap-y-4">
          {filtered.map((series) => (
            <Pressable
              key={series.$id}
              onPress={() =>
                router.push({ pathname: "/series/[id]", params: { id: series.$id } })
              }
              className="w-[48%] active:opacity-80"
            >
              <Artwork uri={series.artworkUrl} size={160} rounded="rounded-2xl" fallbackIcon={Layers} />
              <Text
                numberOfLines={2}
                className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100"
              >
                {series.title}
              </Text>
              <Text className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                {series.episodeCount} {t("episodes")}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <EmptyState
          title={t("noSeriesFound")}
          description={searchQuery.trim() ? t("tryDifferentSearchTerm") : undefined}
          icon={Layers}
        />
      )}
    </Screen>
  );
}
