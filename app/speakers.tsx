import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { Screen } from "@/components/Screen";
import { BackHeader } from "@/components/ui/BackHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Artwork } from "@/components/Artwork";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useTranslation } from "@/hooks/useTranslation";
import { getAllSpeakers } from "@/lib/appwrite";
import { Mic } from "lucide-react-native";

export default function SpeakersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data, loading, error } = useAsyncData(getAllSpeakers, []);

  return (
    <Screen>
      <BackHeader title={t("allSpeakers")} subtitle={t("speakersDesc")} />

      {loading ? (
        <View className="py-16 items-center">
          <ActivityIndicator color="#d4a853" />
        </View>
      ) : error ? (
        <EmptyState title={t("noSpeakersFound")} />
      ) : data && data.length > 0 ? (
        <View className="flex-row flex-wrap justify-between gap-y-4">
          {data.map((speaker) => (
            <Pressable
              key={speaker.$id}
              onPress={() =>
                router.push({ pathname: "/speakers/[slug]", params: { slug: speaker.slug } })
              }
              className="w-[48%] active:opacity-80"
            >
              <Artwork uri={speaker.imageUrl} size={160} rounded="rounded-2xl" fallbackIcon={Mic} />
              <Text
                numberOfLines={1}
                className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100"
              >
                {speaker.name}
              </Text>
              {speaker.bio ? (
                <Text numberOfLines={2} className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {speaker.bio}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : (
        <EmptyState title={t("noSpeakersFound")} icon={Mic} />
      )}
    </Screen>
  );
}