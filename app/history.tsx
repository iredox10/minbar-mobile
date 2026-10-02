import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { CheckCircle2, History as HistoryIcon, Play, Share2, Trash2 } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { BackHeader } from "@/components/ui/BackHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Artwork } from "@/components/Artwork";
import { ShareSheet } from "@/components/ShareSheet";
import { usePlayer } from "@/context/PlayerContext";
import { useTranslation } from "@/hooks/useTranslation";
import { getEpisodeById, isAppwriteConfigured } from "@/lib/appwrite";
import { clearHistory, deleteHistoryEntry, getRecentHistory } from "@/lib/db";
import { episodeTarget, type ShareTarget } from "@/lib/share";
import { formatDuration, formatRelativeDate } from "@/lib/utils";
import type { PlaybackHistory } from "@/types";

/** History row enriched with live Appwrite episode data (web parity with History.tsx). */
interface HistoryItem extends PlaybackHistory {
  episodeTitle?: string;
  episodeNumber?: number;
}

export default function HistoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { playTrackImmediately, seek } = usePlayer();
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [shareTargetItem, setShareTargetItem] = useState<ShareTarget | null>(null);

  const reload = useCallback(async () => {
    const raw = await getRecentHistory(50);
    // History rows cache title/speaker at play time; fill any title gaps from
    // Appwrite when it is reachable (web History.tsx enriches the same way).
    if (!isAppwriteConfigured()) {
      setItems(raw);
      return;
    }
    try {
      const enriched = await Promise.all(
        raw.map(async (h): Promise<HistoryItem> => {
          if (h.title) return h;
          const episode = await getEpisodeById(h.episodeId);
          if (!episode) return h;
          return {
            ...h,
            episodeTitle: episode.title,
            episodeNumber: episode.episodeNumber,
          };
        }),
      );
      setItems(enriched);
    } catch {
      // Offline / Appwrite failure → fall back to cached history rows.
      setItems(raw);
    }
  }, []);

  const displayTitle = (item: HistoryItem) => item.episodeTitle ?? item.title ?? item.episodeId;
  const share = (item: HistoryItem) => {
    setShareTargetItem(
      episodeTarget(
        {
          $id: item.episodeId,
          title: displayTitle(item),
          episodeNumber: item.episodeNumber,
        },
        item.speaker,
        { artworkUri: item.artworkUrl },
      ),
    );
  };

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

  const handleDeleteRow = async (episodeId: string) => {
    setItems((prev) => (prev ? prev.filter((h) => h.episodeId !== episodeId) : prev));
    try {
      await deleteHistoryEntry(episodeId);
    } catch {
      // local filter already applied
    }
  };

  const handleClear = async () => {
    await clearHistory();
    reload();
  };

  const progress = (item: PlaybackHistory) => {
    if (!item.duration || item.duration <= 0) return 0;
    return Math.min((item.position / item.duration) * 100, 100);
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
          {items.map((item, index) => {
            const pct = progress(item);
            const remaining = Math.max(item.duration - item.position, 0);
            return (
              <View
                key={`${item.episodeId}-${index}`}
                className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-800/40"
              >
                <View className="flex-row items-center gap-3">
                  <Pressable
                    onPress={() => resume(item)}
                    className="flex-1 flex-row items-center gap-3 active:opacity-80"
                  >
                    <Artwork uri={item.artworkUrl} size={48} />
                    <View className="flex-1">
                      <Text
                        numberOfLines={2}
                        className="text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-100"
                      >
                        {displayTitle(item)}
                      </Text>
                      <Text className="mt-0.5 text-xs text-slate-400">
                        {item.speaker ? `${item.speaker} · ` : ""}
                        {formatRelativeDate(new Date(item.playedAt))}
                        {item.completed
                          ? ` · ${t("listened")}`
                          : item.duration > 0
                            ? ` · ${formatDuration(Math.floor(remaining))} ${t("left")}`
                            : ""}
                      </Text>
                    </View>
                    <View className="h-9 w-9 items-center justify-center rounded-full bg-primary/15">
                      {item.completed ? (
                        <CheckCircle2 size={16} color="#10b981" />
                      ) : (
                        <Play size={15} color="#d4a853" fill="#d4a853" />
                      )}
                    </View>
                  </Pressable>
                  <Pressable onPress={() => share(item)} hitSlop={8} accessibilityLabel={t("share")}>
                    <Share2 size={17} color="#94a3b8" />
                  </Pressable>
                  <Pressable onPress={() => handleDeleteRow(item.episodeId)} hitSlop={8} accessibilityLabel="Delete history entry">
                    <Trash2 size={18} color="#f87171" />
                  </Pressable>
                </View>
                {!item.completed && pct > 0 ? (
                  <View className="ml-[60px] mt-2 h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <View className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      <ShareSheet
        visible={shareTargetItem !== null}
        onClose={() => setShareTargetItem(null)}
        target={shareTargetItem}
      />
    </Screen>
  );
}
