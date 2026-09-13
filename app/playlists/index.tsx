import { useCallback, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ListMusic, Plus, Trash2 } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { BackHeader } from "@/components/ui/BackHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { useTranslation } from "@/hooks/useTranslation";
import {
  createPlaylist,
  deletePlaylist,
  getPlaylistItemCounts,
  getPlaylists,
} from "@/lib/db";
import type { Playlist } from "@/types";

export default function PlaylistsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [newName, setNewName] = useState("");

  const reload = useCallback(async () => {
    const [pls, cnts] = await Promise.all([getPlaylists(), getPlaylistItemCounts()]);
    setPlaylists(pls);
    setCounts(cnts);
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    await createPlaylist(name);
    setNewName("");
    reload();
  };

  const handleDelete = async (id: number) => {
    await deletePlaylist(id);
    reload();
  };

  return (
    <Screen>
      <BackHeader title={t("playlists")} subtitle={t("playlistsDesc")} />

      <View className="mb-4 flex-row items-center gap-3">
        <TextInput
          className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] text-slate-900 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-100"
          placeholder={t("createPlaylist")}
          placeholderTextColor="#94a3b8"
          value={newName}
          onChangeText={setNewName}
          returnKeyType="done"
          onSubmitEditing={handleCreate}
        />
        <Pressable
          onPress={handleCreate}
          className="h-11 w-11 items-center justify-center rounded-2xl bg-primary active:opacity-90"
        >
          <Plus size={20} color="#0f172a" />
        </Pressable>
      </View>

      {playlists === null ? null : playlists.length === 0 ? (
        <EmptyState title={t("noPlaylistsYet")} description={t("createFirstPlaylist")} icon={ListMusic} />
      ) : (
        <View className="gap-2.5">
          {playlists.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => router.push({ pathname: "/playlists/[id]", params: { id: String(p.id) } })}
              className="flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 active:opacity-80 dark:border-slate-800 dark:bg-slate-800/40"
            >
              <View className="h-11 w-11 items-center justify-center rounded-full bg-primary/10">
                <ListMusic size={20} color="#d4a853" />
              </View>
              <View className="flex-1">
                <Text className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">
                  {p.name}
                </Text>
                <Text className="mt-0.5 text-xs text-slate-400">
                  {counts[p.id!] ?? 0} {t("episodes")}
                </Text>
              </View>
              <Pressable onPress={() => handleDelete(p.id!)} hitSlop={10}>
                <Trash2 size={18} color="#f87171" />
              </Pressable>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}