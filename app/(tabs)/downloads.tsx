import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Download, HardDrive, Play, RefreshCw, Trash2 } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { EmptyState } from "@/components/ui/EmptyState";
import { Artwork } from "@/components/Artwork";
import { usePlayer } from "@/context/PlayerContext";
import { useTranslation } from "@/hooks/useTranslation";
import {
  clearAllDownloads,
  deleteDownloaded,
  getStorageUsage,
  isDownloading,
  listDownloads,
  subscribeDownloads,
  subscribeProgress,
} from "@/lib/downloads";
import { formatDate, formatDuration, formatFileSize } from "@/lib/utils";
import type { DownloadedEpisode } from "@/types";

// Display-only scale for the storage usage bar (no device quota API used).
const STORAGE_BAR_REFERENCE_BYTES = 500 * 1024 * 1024;

function formatDownloadedAt(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return formatDate(date.toISOString());
}

export default function DownloadsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { playTrackImmediately } = usePlayer();
  const [items, setItems] = useState<DownloadedEpisode[] | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [usage, setUsage] = useState<{ count: number; bytes: number }>({ count: 0, bytes: 0 });
  const [retrying, setRetrying] = useState(false);
  const [clearing, setClearing] = useState(false);

  const refresh = useCallback(async () => {
    const [all, storage] = await Promise.all([listDownloads(), getStorageUsage()]);
    setItems(all);
    setUsage(storage);
  }, []);

  useEffect(() => {
    refresh();
    const unsubState = subscribeDownloads(refresh);
    const unsubProgress = subscribeProgress((episodeId, percent) => {
      setProgress((prev) => ({ ...prev, [episodeId]: percent }));
    });
    return () => {
      unsubState();
      unsubProgress();
    };
  }, [refresh]);

  const playDownload = (item: DownloadedEpisode) => {
    if (!item.localUri) return;
    playTrackImmediately({
      id: item.episodeId,
      title: item.title,
      audioUrl: item.localUri,
      artworkUrl: item.artworkUrl,
      speaker: item.speaker,
      duration: item.duration,
      type: "episode",
      seriesId: item.seriesId,
    });
    router.push("/player");
  };

  const handleDelete = async (item: DownloadedEpisode) => {
    await deleteDownloaded(item.episodeId);
    await refresh();
  };

  // Reconciles the list (prunes records whose files are gone) and refreshes.
  const handleRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await refresh();
    } finally {
      setRetrying(false);
    }
  };

  const handleClearAll = async () => {
    if (clearing) return;
    setClearing(true);
    try {
      await clearAllDownloads();
      await refresh();
    } finally {
      setClearing(false);
    }
  };

  const count = items?.length ?? 0;
  const barFill =
    usage.bytes > 0
      ? Math.min(100, Math.max(6, (usage.bytes / STORAGE_BAR_REFERENCE_BYTES) * 100))
      : 0;

  return (
    <Screen>
      <View className="mb-4 mt-2">
        <Text className="text-2xl font-bold text-slate-900 dark:text-white">{t("downloads")}</Text>
        <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("downloadsDesc")}
          {items !== null ? ` · ${count} · ${formatFileSize(usage.bytes)} ${t("used")}` : ""}
        </Text>
      </View>

      {items === null ? (
        <View className="py-16 items-center">
          <ActivityIndicator color="#d4a853" />
        </View>
      ) : items.length === 0 ? (
        <>
          <EmptyState title={t("noDownloads")} description={t("downloadToListen")} icon={Download} />
          <View className="mt-4 items-center">
            <Pressable
              onPress={handleRetry}
              disabled={retrying}
              className="flex-row items-center gap-2 rounded-full border border-slate-200 px-4 py-2 dark:border-slate-700"
            >
              {retrying ? (
                <ActivityIndicator size="small" color="#d4a853" />
              ) : (
                <RefreshCw size={15} color="#d4a853" />
              )}
              <Text className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {t("retry")}
              </Text>
            </Pressable>
          </View>
        </>
      ) : (
        <View className="gap-2.5">
          <View className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-800/40">
            <View className="flex-row items-center gap-2">
              <HardDrive size={16} color="#d4a853" />
              <Text className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {formatFileSize(usage.bytes)} {t("used")}
              </Text>
            </View>
            <View className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <View className="h-full rounded-full bg-primary" style={{ width: `${barFill}%` }} />
            </View>
            <View className="mt-3 flex-row items-center gap-2">
              <Pressable
                onPress={handleRetry}
                disabled={retrying}
                className="flex-row items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 dark:border-slate-700"
              >
                {retrying ? (
                  <ActivityIndicator size="small" color="#d4a853" />
                ) : (
                  <RefreshCw size={14} color="#d4a853" />
                )}
                <Text className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {t("retry")}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleClearAll}
                disabled={clearing}
                className="flex-row items-center gap-1.5 rounded-full border border-red-200 px-3 py-1.5 dark:border-red-900"
              >
                {clearing ? (
                  <ActivityIndicator size="small" color="#f87171" />
                ) : (
                  <Trash2 size={14} color="#f87171" />
                )}
                <Text className="text-xs font-semibold text-red-500">
                  {t("clear")} {t("all")}
                </Text>
              </Pressable>
            </View>
          </View>
          {items.map((item) => {
            const pct = progress[item.episodeId];
            const busy = pct !== undefined || isDownloading(item.episodeId);
            const downloadedAt = formatDownloadedAt(item.downloadedAt);
            return (
              <View
                key={item.episodeId}
                className="flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-800/40"
              >
                <Artwork uri={item.artworkUrl} size={54} />
                <View className="flex-1">
                  <Text
                    numberOfLines={2}
                    className="text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-100"
                  >
                    {item.title}
                  </Text>
                  <Text className="mt-0.5 text-xs text-slate-400">
                    {formatDuration(item.duration)} · {formatFileSize(item.fileSize)}
                    {downloadedAt ? ` · ${downloadedAt}` : ""}
                  </Text>
                  {busy ? (
                    <View className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <View className="h-full rounded-full bg-primary" style={{ width: `${pct ?? 0}%` }} />
                    </View>
                  ) : null}
                </View>
                {busy ? (
                  <Pressable onPress={() => handleDelete(item)} hitSlop={8}>
                    <Trash2 size={18} color="#94a3b8" />
                  </Pressable>
                ) : (
                  <View className="flex-row items-center gap-3">
                    <Pressable onPress={() => playDownload(item)} hitSlop={8}>
                      <View className="h-9 w-9 items-center justify-center rounded-full bg-primary">
                        <Play size={16} color="#0f172a" fill="#0f172a" />
                      </View>
                    </Pressable>
                    <Pressable onPress={() => handleDelete(item)} hitSlop={8}>
                      <Trash2 size={18} color="#f87171" />
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}