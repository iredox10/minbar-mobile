import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Bookmark as BookmarkIcon, Clock, Play, Trash2 } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { BackHeader } from "@/components/ui/BackHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Artwork } from "@/components/Artwork";
import { usePlayer } from "@/context/PlayerContext";
import { useTranslation } from "@/hooks/useTranslation";
import { deleteBookmark, getBookmarks } from "@/lib/db";
import { formatDuration, formatRelativeDate } from "@/lib/utils";
import type { Bookmark } from "@/types";

export default function BookmarksScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { playTrackImmediately, seek } = usePlayer();
  const [items, setItems] = useState<Bookmark[] | null>(null);

  const reload = useCallback(async () => {
    setItems(await getBookmarks());
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Bookmark[]>();
    for (const b of items ?? []) {
      const list = map.get(b.episodeId) ?? [];
      list.push(b);
      map.set(b.episodeId, list);
    }
    return [...map.entries()];
  }, [items]);

  const play = (b: Bookmark) => {
    if (!b.audioUrl) {
      router.push({ pathname: "/episodes/[id]", params: { id: b.episodeId } });
      return;
    }
    playTrackImmediately({
      id: b.episodeId,
      title: b.episodeTitle,
      audioUrl: b.audioUrl,
      artworkUrl: b.artworkUrl,
      speaker: b.speakerName,
      duration: 0,
      type: "episode",
    });
    if (b.position > 0) seek(b.position);
    router.push("/player");
  };

  const remove = async (b: Bookmark) => {
    if (b.id) await deleteBookmark(b.id);
    reload();
  };

  return (
    <Screen>
      <BackHeader title={t("bookmarks")} subtitle={t("bookmarksDesc")} />

      {items === null ? null : items.length === 0 ? (
        <EmptyState title={t("noBookmarksYetText")} description={t("tapBookmarkDesc")} icon={BookmarkIcon} />
      ) : (
        <View className="gap-5">
          {grouped.map(([episodeId, bms]) => {
            const first = bms[0];
            return (
              <View key={episodeId}>
                <View className="mb-2 flex-row items-center gap-3 px-1">
                  <Artwork uri={first.artworkUrl} size={40} />
                  <View className="flex-1">
                    <Text numberOfLines={1} className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {first.episodeTitle}
                    </Text>
                    {first.speakerName ? (
                      <Text numberOfLines={1} className="text-[11px] text-slate-500">
                        {first.speakerName}
                      </Text>
                    ) : null}
                  </View>
                  <Text className="text-[11px] text-slate-400">
                    {bms.length} {bms.length === 1 ? t("markSingle") : t("marksPlural")}
                  </Text>
                </View>

                <View className="gap-2.5">
                  {bms.map((b) => (
                    <Pressable
                      key={b.id}
                      onPress={() => play(b)}
                      className="flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 active:opacity-80 dark:border-slate-800 dark:bg-slate-800/40"
                    >
                      <View className="w-14 items-center justify-center rounded-lg bg-primary/10 px-1 py-1.5">
                        <Clock size={11} color="#d4a853" />
                        <Text className="font-mono text-[11px] font-semibold text-primary">
                          {formatDuration(Math.floor(b.position))}
                        </Text>
                      </View>
                      <View className="flex-1">
                        {b.note ? (
                          <Text numberOfLines={2} className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {b.note}
                          </Text>
                        ) : (
                          <Text numberOfLines={1} className="text-sm italic text-slate-400">
                            {t("noNoteText")}
                          </Text>
                        )}
                        <Text className="mt-0.5 text-[11px] text-slate-400">
                          {t("resume")} · {formatRelativeDate(new Date(b.createdAt))}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-2">
                        <Pressable
                          onPress={() => play(b)}
                          hitSlop={8}
                          accessibilityLabel="Resume from bookmark"
                        >
                          <View className="h-9 w-9 items-center justify-center rounded-full bg-primary">
                            <Play size={15} color="#0f172a" fill="#0f172a" />
                          </View>
                        </Pressable>
                        <Pressable
                          onPress={() => remove(b)}
                          hitSlop={8}
                          accessibilityLabel="Delete bookmark"
                        >
                          <Trash2 size={18} color="#f87171" />
                        </Pressable>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}
