import { useCallback, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { ListPlus, Plus, X } from "lucide-react-native";

import { useTranslation } from "@/hooks/useTranslation";
import { addPlaylistItem, createPlaylist, getPlaylists } from "@/lib/db";
import type { Playlist } from "@/types";

interface Props {
  visible: boolean;
  episodeId: string;
  onClose: () => void;
  onAdded?: () => void;
}

export function AddToPlaylistSheet({ visible, episodeId, onClose, onAdded }: Props) {
  const { t } = useTranslation();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [newName, setNewName] = useState("");

  const reload = useCallback(async () => {
    setPlaylists(await getPlaylists());
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (visible) reload();
    }, [visible, reload]),
  );

  const addTo = async (playlistId: number) => {
    await addPlaylistItem(playlistId, episodeId);
    onAdded?.();
    onClose();
  };

  const createAndAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    const id = await createPlaylist(name);
    await addPlaylistItem(id, episodeId);
    onAdded?.();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-slate-950/60" onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="mt-auto rounded-t-3xl border-t border-slate-800 bg-white p-6 pb-10 dark:bg-slate-900"
        >
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-lg font-bold text-slate-900 dark:text-white">
              {t("addToPlaylistTitle")}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={20} color="#94a3b8" />
            </Pressable>
          </View>

          {playlists.length === 0 ? (
            <Text className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              {t("noPlaylistsYetMsg")}
            </Text>
          ) : (
            <View className="mb-4 gap-1.5">
              {playlists.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => addTo(p.id!)}
                  className="flex-row items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 active:opacity-80 dark:border-slate-800 dark:bg-slate-800/40"
                >
                  <ListPlus size={18} color="#d4a853" />
                  <Text className="flex-1 text-[15px] text-slate-900 dark:text-slate-100">
                    {p.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <View className="flex-row items-center gap-2">
            <TextInput
              className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] text-slate-900 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-100"
              value={newName}
              onChangeText={setNewName}
              placeholder={t("createPlaylist")}
              placeholderTextColor="#94a3b8"
              returnKeyType="done"
              onSubmitEditing={createAndAdd}
            />
            <Pressable
              onPress={createAndAdd}
              className="h-11 w-11 items-center justify-center rounded-2xl bg-primary active:opacity-90"
            >
              <Plus size={20} color="#0f172a" />
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}