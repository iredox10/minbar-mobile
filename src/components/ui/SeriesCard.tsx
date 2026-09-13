import { Pressable, Text } from "react-native";
import { useRouter } from "expo-router";
import { Layers } from "lucide-react-native";

import { Artwork } from "@/components/Artwork";
import { useTranslation } from "@/hooks/useTranslation";
import type { Series } from "@/types";

interface SeriesCardProps {
  series: Series;
  wide?: boolean;
}

export function SeriesCard({ series, wide = false }: SeriesCardProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const width = wide ? 160 : 128;

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/series/[id]", params: { id: series.$id } })}
      className="active:opacity-80"
      style={{ width }}
    >
      <Artwork uri={series.artworkUrl} size={width} rounded="rounded-2xl" fallbackIcon={Layers} />
      <Text
        numberOfLines={1}
        className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100"
      >
        {series.title}
      </Text>
      <Text className="text-xs text-slate-400 dark:text-slate-500">
        {series.episodeCount} {t("episodes")}
      </Text>
    </Pressable>
  );
}