import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Heart, Trash2 } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { BackHeader } from "@/components/ui/BackHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Artwork } from "@/components/Artwork";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useTranslation } from "@/hooks/useTranslation";
import { getFavorites, removeFavorite } from "@/lib/db";
import { cn, formatRelativeDate } from "@/lib/utils";
import type { Favorite } from "@/types";

type TabType = "all" | Favorite["type"];

export default function FavoritesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const { data, reload } = useAsyncData(() => getFavorites(), []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const favorites = useMemo(() => data ?? [], [data]);

  const counts = useMemo(
    () => ({
      all: favorites.length,
      episode: favorites.filter((f) => f.type === "episode").length,
      series: favorites.filter((f) => f.type === "series").length,
      dua: favorites.filter((f) => f.type === "dua").length,
    }),
    [favorites],
  );

  const tabs: { id: TabType; label: string; count: number }[] = useMemo(
    () => [
      { id: "all", label: t("all"), count: counts.all },
      { id: "episode", label: t("episodes"), count: counts.episode },
      { id: "series", label: t("series"), count: counts.series },
      { id: "dua", label: t("duas"), count: counts.dua },
    ],
    [counts, t],
  );

  const filtered = activeTab === "all" ? favorites : favorites.filter((f) => f.type === activeTab);

  const open = (f: Favorite) => {
    if (f.type === "dua") {
      // Duas screen agent honors `focus` to expand/scroll to the dua.
      router.push({ pathname: "/duas", params: { focus: f.itemId } } as never);
      return;
    }
    if (f.type === "series") {
      router.push({ pathname: "/series/[id]", params: { id: f.itemId } } as never);
      return;
    }
    router.push({ pathname: "/episodes/[id]", params: { id: f.itemId } } as never);
  };

  const remove = async (f: Favorite) => {
    await removeFavorite(f.type, f.itemId);
    reload();
  };

  return (
    <Screen>
      <BackHeader title={t("favorites")} subtitle={t("favoritesDesc")} />

      {favorites.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-4 -mx-4 px-4"
          contentContainerClassName="gap-2"
        >
          {tabs.map((tab) => {
            const selected = tab.id === activeTab;
            return (
              <Pressable
                key={tab.id}
                onPress={() => setActiveTab(tab.id)}
                className={cn(
                  "rounded-full px-4 py-2",
                  selected ? "bg-primary" : "border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-800/40",
                )}
              >
                <Text
                  className={cn(
                    "text-sm",
                    selected ? "font-semibold text-slate-900" : "text-slate-500 dark:text-slate-300",
                  )}
                >
                  {tab.label} ({tab.count})
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {!data ? null : favorites.length === 0 ? (
        <EmptyState title={t("noFavoritesYet")} description={t("tapHeartToSave")} icon={Heart} />
      ) : filtered.length === 0 ? (
        <EmptyState title={t("noItemsInFavorites")} icon={Heart} />
      ) : (
        <View className="gap-2.5">
          {filtered.map((f) => (
            <Pressable
              key={`${f.type}-${f.itemId}`}
              onPress={() => open(f)}
              className="flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 active:opacity-80 dark:border-slate-800 dark:bg-slate-800/40"
            >
              <Artwork uri={f.imageUrl} size={48} />
              <View className="flex-1">
                <Text
                  numberOfLines={2}
                  className="text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-100"
                >
                  {f.title}
                </Text>
                <Text className="mt-0.5 text-xs capitalize text-slate-400">
                  {t(f.type)} · {formatRelativeDate(new Date(f.addedAt))}
                </Text>
              </View>
              <Pressable onPress={() => remove(f)} hitSlop={10} accessibilityLabel="Remove favorite">
                <Trash2 size={18} color="#f87171" />
              </Pressable>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}
