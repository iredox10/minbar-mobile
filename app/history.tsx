import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { History as HistoryIcon, Play } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { BackHeader } from "@/components/ui/BackHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Artwork } from "@/components/Artwork";
import { usePlayer } from "@/context/PlayerContext";
import { useTranslation } from "@/hooks/useTranslation";
import { clearHistory, getRecentHistory } from "@/lib/db";
import { formatRelativeDate } from "@/lib/utils";
import type { PlaybackHistory } from "@/types";

export default function HistoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { playTrackImmediately, seek } = usePlayer();
  const [items, setItems] = useState<PlaybackHistory[] | null>(null);

  const reload = useCallback(async () => {
    setItems(await getRecentHistory(50));
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const resume = (item: PlaybackHistory) => {
    if (!item.audioUrl) {
      router.push({ pathname: "/episodes/[id]", params: { id: item.episodeId } });
      return;
    }
    playTrackImmediately({
      id: item.episodeId,
      title: item.title ?? "",
      audioUrl: item.audioUrl,
      artworkUrl: item.artworkUrl,
      speaker: item.speaker,
      duration: item.duration,
      type: "episode",
    });
    if (item.position > 0 && !item.completed) {
      seek(item.position);
    }
    router.push("/player");
  };

  const handleClear = async () => {
    await clearHistory();
    reload();
  };

  return (
    <Screen>
      <BackHeader
        title={t("playbackHistory")}
        subtitle={t("historyDesc")}
        right={
          items && items.length > 0 ? (
            <Pressable onPress={handleClear} hitSlop={8}>
              <Text className="text-sm font-medium text-primary">{t("clear")}</Text>
            </Pressable>
          ) : undefined
        }
      />

      {items === null ? null : items.length === 0 ? (
        <EmptyState title={t("noPlaybackHistory")} description={t("startListening")} icon={HistoryIcon} />
      ) : (
        <View className="gap-2.5">
          {items.map((item, index) => (
            <Pressable
              key={`${item.episodeId}-${index}`}
              onPress={() => resume(item)}
              className="flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 active:opacity-80 dark:border-slate-800 dark:bg-slate-800/40"
            >
              <Artwork uri={item.artworkUrl} size={48} />
              <View className="flex-1">
                <Text
                  numberOfLines={2}
                  className="text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-100"
                >
                  {item.title ?? item.episodeId}
                </Text>
                <Text className="mt-0.5 text-xs text-slate-400">
                  {item.speaker ? `${item.speaker} · ` : ""}
                  {formatRelativeDate(item.playedAt)}
                  {item.completed ? "" : item.duration > 0 ? ` · ${t("resume")}` : ""}
                </Text>
              </View>
              <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/15">
                <Play size={15} color="#d4a853" fill="#d4a853" />
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}