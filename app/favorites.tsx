import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Heart } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { BackHeader } from "@/components/ui/BackHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Artwork } from "@/components/Artwork";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useTranslation } from "@/hooks/useTranslation";
import { getFavorites, removeFavorite } from "@/lib/db";
import type { Favorite } from "@/types";

const TYPE_ROUTE: Record<Favorite["type"], { pathname: string; param: "id" | "slug" }> = {
  episode: { pathname: "/episodes/[id]", param: "id" },
  series: { pathname: "/series/[id]", param: "id" },
  dua: { pathname: "/duas", param: "id" },
};

export default function FavoritesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data, reload } = useAsyncData(() => getFavorites(), []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const open = (f: Favorite) => {
    const route = TYPE_ROUTE[f.type];
    if (route.pathname === "/duas") {
      router.push(route.pathname as never);
      return;
    }
    router.push({ pathname: route.pathname as never, params: { [route.param]: f.itemId } } as never);
  };

  const toggle = async (f: Favorite) => {
    await removeFavorite(f.type, f.itemId);
    reload();
  };

  return (
    <Screen>
      <BackHeader title={t("favorites")} subtitle={t("favoritesDesc")} />

      {!data ? null : data.length === 0 ? (
        <EmptyState title={t("noFavoritesYet")} description={t("tapHeartToSave")} icon={Heart} />
      ) : (
        <View className="gap-2.5">
          {data.map((f) => (
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
                <Text className="mt-0.5 text-xs capitalize text-slate-400">{t(f.type)}</Text>
              </View>
              <Pressable onPress={() => toggle(f)} hitSlop={10}>
                <Heart size={20} color="#f87171" fill="#f87171" />
              </Pressable>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}