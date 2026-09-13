import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";

import { Screen } from "@/components/Screen";
import { BackHeader } from "@/components/ui/BackHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Artwork } from "@/components/Artwork";
import { useAsyncData } from "@/hooks/useAsyncData";
import { useTranslation } from "@/hooks/useTranslation";
import { getAllSpeakers } from "@/lib/appwrite";
import { Mic, Search as SearchIcon, X } from "lucide-react-native";

export default function SpeakersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data, loading, error } = useAsyncData(getAllSpeakers, []);
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q === "") return data ?? [];
    return (data ?? []).filter((s) => s.name.toLowerCase().includes(q));
  }, [data, searchQuery]);

  const featuredSpeakers = useMemo(() => filtered.filter((s) => s.featured), [filtered]);
  const otherSpeakers = useMemo(() => filtered.filter((s) => !s.featured), [filtered]);

  return (
    <Screen>
      <BackHeader title={t("allSpeakers")} subtitle={t("speakersDesc")} />

      <View className="mb-6 flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-800/40">
        <SearchIcon size={18} color="#94a3b8" />
        <TextInput
          className="flex-1 py-3.5 text-[15px] text-slate-900 dark:text-slate-100"
          placeholder={t("searchSpeakers")}
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
        <EmptyState title={t("noSpeakersFound")} />
      ) : filtered.length > 0 ? (
        <View className="gap-8">
          {featuredSpeakers.length > 0 ? (
            <View>
              <Text className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {t("featured")}
              </Text>
              <View className="flex-row flex-wrap justify-between gap-y-4">
                {featuredSpeakers.map((speaker) => (
                  <Pressable
                    key={speaker.$id}
                    onPress={() =>
                      router.push({ pathname: "/speakers/[slug]", params: { slug: speaker.slug } })
                    }
                    className="w-[48%] items-center rounded-2xl border border-slate-200 bg-white p-4 active:opacity-80 dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <Artwork uri={speaker.imageUrl} size={80} rounded="rounded-full" fallbackIcon={Mic} />
                    <Text
                      numberOfLines={1}
                      className="mt-3 text-center text-sm font-medium text-slate-900 dark:text-slate-100"
                    >
                      {speaker.name}
                    </Text>
                    {speaker.bio ? (
                      <Text numberOfLines={2} className="mt-1 text-center text-xs text-slate-500 dark:text-slate-400">
                        {speaker.bio}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {otherSpeakers.length > 0 ? (
            <View>
              <Text className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
                {featuredSpeakers.length > 0 ? t("allSpeakers") : t("speakers")}
              </Text>
              <View className="gap-2.5">
                {otherSpeakers.map((speaker) => (
                  <Pressable
                    key={speaker.$id}
                    onPress={() =>
                      router.push({ pathname: "/speakers/[slug]", params: { slug: speaker.slug } })
                    }
                    className="flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 active:opacity-80 dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <Artwork uri={speaker.imageUrl} size={56} rounded="rounded-full" fallbackIcon={Mic} />
                    <View className="flex-1">
                      <Text
                        numberOfLines={1}
                        className="text-[15px] font-medium text-slate-900 dark:text-slate-100"
                      >
                        {speaker.name}
                      </Text>
                      {speaker.bio ? (
                        <Text numberOfLines={1} className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                          {speaker.bio}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <EmptyState
          title={t("noSpeakersFound")}
          description={searchQuery.trim() ? t("tryDifferentSearchTerm") : undefined}
          icon={Mic}
        />
      )}
    </Screen>
  );
}
