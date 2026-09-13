import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Bookmark as BookmarkIcon, Play, Trash2 } from "lucide-react-native";

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
        <View className="gap-2.5">
          {items.map((b) => (
            <View
              key={b.id}
              className="flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-800/40"
            >
              <Artwork uri={b.artworkUrl} size={48} />
              <View className="flex-1">
                <Text
                  numberOfLines={2}
                  className="text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-100"
                >
                  {b.episodeTitle}
                </Text>
                <Text className="mt-0.5 text-xs text-slate-400">
                  {formatDuration(Math.floor(b.position))}
                  {b.speakerName ? ` · ${b.speakerName}` : ""}
                  {` · ${formatRelativeDate(b.createdAt)}`}
                </Text>
                {b.note ? (
                  <Text numberOfLines={1} className="mt-1 text-xs italic text-slate-500">
                    {b.note}
                  </Text>
                ) : null}
              </View>
              <View className="flex-row items-center gap-3">
                <Pressable onPress={() => play(b)} hitSlop={8}>
                  <View className="h-9 w-9 items-center justify-center rounded-full bg-primary">
                    <Play size={15} color="#0f172a" fill="#0f172a" />
                  </View>
                </Pressable>
                <Pressable onPress={() => remove(b)} hitSlop={8}>
                  <Trash2 size={18} color="#f87171" />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}