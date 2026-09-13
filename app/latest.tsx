import { ActivityIndicator, View } from "react-native";

import { Screen } from "@/components/Screen";
import { BackHeader } from "@/components/ui/BackHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { EpisodeRow } from "@/components/ui/EpisodeRow";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useTranslation } from "@/hooks/useTranslation";
import { getLatestEpisodes } from "@/lib/appwrite";

export default function LatestEpisodesScreen() {
  const { t } = useTranslation();
  const { data, loading, error } = useAsyncData(() => getLatestEpisodes(30), []);

  return (
    <Screen>
      <BackHeader title={t("latestEpisodes")} subtitle={t("latestEpisodesDesc")} />

      {loading ? (
        <View className="py-16 items-center">
          <ActivityIndicator color="#d4a853" />
        </View>
      ) : error ? (
        <EmptyState title={t("noEpisodesFound")} />
      ) : data && data.length > 0 ? (
        <View className="gap-2.5">
          {data.map((episode) => (
            <EpisodeRow key={episode.$id} episode={episode} />
          ))}
        </View>
      ) : (
        <EmptyState title={t("noEpisodesFound")} />
      )}
    </Screen>
  );
}