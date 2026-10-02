import { useCallback, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ListMusic, Pencil, Plus, Trash2, X } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { BackHeader } from "@/components/ui/BackHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { useTranslation } from "@/hooks/useTranslation";
import {
  createPlaylist,
  deletePlaylist,
  getPlaylistItemCounts,
  getPlaylists,
  updatePlaylist,
} from "@/lib/db";
import { formatRelativeDate } from "@/lib/utils";
import type { Playlist } from "@/types";

export default function PlaylistsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<Playlist | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

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

  const openRename = (p: Playlist) => {
    setEditing(p);
    setEditName(p.name);
    setEditDescription(p.description ?? "");
  };

  const handleRename = async () => {
    const name = editName.trim();
    if (!editing?.id || !name) return;
    const description = editDescription.trim();
    await updatePlaylist(editing.id, { name, description: description || undefined });
    setEditing(null);
    setEditName("");
    setEditDescription("");
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
              onLongPress={() => openRename(p)}
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
                  {p.createdAt ? ` · ${formatRelativeDate(new Date(p.createdAt))}` : ""}
                </Text>
                {p.description ? (
                  <Text numberOfLines={1} className="mt-0.5 text-xs text-slate-500">
                    {p.description}
                  </Text>
                ) : null}
              </View>
              <Pressable onPress={() => openRename(p)} hitSlop={10} accessibilityLabel="Rename playlist">
                <Pencil size={17} color="#94a3b8" />
              </Pressable>
              <Pressable onPress={() => handleDelete(p.id!)} hitSlop={10} accessibilityLabel="Delete playlist">
                <Trash2 size={18} color="#f87171" />
              </Pressable>
            </Pressable>
          ))}
        </View>
      )}

      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <Pressable
          onPress={() => setEditing(null)}
          className="flex-1 items-center justify-center bg-black/60 p-4"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
          >
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {t("editPlaylist")}
              </Text>
              <Pressable onPress={() => setEditing(null)} hitSlop={8}>
                <X size={20} color="#94a3b8" />
              </Pressable>
            </View>
            <Text className="mb-1 text-sm text-slate-500">{t("name")}</Text>
            <TextInput
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] text-slate-900 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-100"
              placeholderTextColor="#94a3b8"
              value={editName}
              onChangeText={setEditName}
              autoFocus
              returnKeyType="next"
              onSubmitEditing={() => undefined}
            />
            <Text className="mb-1 mt-3 text-sm text-slate-500">{t("addDescription")}</Text>
            <TextInput
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] text-slate-900 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-100"
              placeholder={t("descriptionOpt")}
              placeholderTextColor="#94a3b8"
              value={editDescription}
              onChangeText={setEditDescription}
              multiline
              returnKeyType="done"
              onSubmitEditing={handleRename}
            />
            <View className="mt-4 flex-row gap-3">
              <Pressable
                onPress={() => setEditing(null)}
                className="flex-1 items-center rounded-xl bg-slate-200 py-3 dark:bg-slate-800"
              >
                <Text className="font-medium text-slate-600 dark:text-slate-300">{t("cancel")}</Text>
              </Pressable>
              <Pressable
                onPress={handleRename}
                disabled={!editName.trim()}
                className="flex-1 items-center rounded-xl bg-primary py-3 disabled:opacity-40"
              >
                <Text className="font-medium text-slate-900">{t("save")}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}
