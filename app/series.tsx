import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Layers } from "lucide-react-native";

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

  return (
    <Screen>
      <BackHeader title={t("allSeries")} subtitle={t("seriesDesc")} />

      {loading ? (
        <View className="py-16 items-center">
          <ActivityIndicator color="#d4a853" />
        </View>
      ) : error ? (
        <EmptyState title={t("noSeriesFound")} />
      ) : data && data.length > 0 ? (
        <View className="flex-row flex-wrap justify-between gap-y-4">
          {data.map((series) => (
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
        <EmptyState title={t("noSeriesFound")} icon={Layers} />
      )}
    </Screen>
  );
}