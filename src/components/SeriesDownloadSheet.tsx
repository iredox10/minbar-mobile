import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from "react-native";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Circle,
  Download,
  ListChecks,
  X,
} from "lucide-react-native";

import { useTranslation } from "@/hooks/useTranslation";
import { isDownloaded } from "@/lib/db";
import { downloadSeries, downloadSeriesById, getProgress } from "@/lib/downloads";
import type { Episode, Series } from "@/types";

type ItemStatus = "pending" | "downloading" | "done" | "skipped" | "failed";

interface Props {
  visible: boolean;
  series: Series | null;
  speakerName?: string;
  /** All series episodes (already loaded by the screen). */
  episodes: Episode[];
  onClose: () => void;
}

/**
 * SeriesDownloadSheet — mobile parity for web's "Download all" queue modal
 * (`minbar/src/pages/SeriesDetail.tsx:194-205, 303-311, 466-575`).
 *
 * Shows the pending episode list with per-item done / current / pending / failed
 * icons, a progress bar, Cancel and Start Download. Per-episode failures come
 * back in `failedIds` and the sheet offers a Retry for just those.
 */
export function SeriesDownloadSheet({
  visible,
  series,
  speakerName,
  episodes,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [statuses, setStatuses] = useState<Record<string, ItemStatus>>({});
  const [checking, setChecking] = useState(false);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const queueable = useMemo(() => episodes.filter((e) => !!e?.audioUrl), [episodes]);
  const pending = useMemo(
    () => queueable.filter((e) => (statuses[e.$id] ?? "pending") !== "done"),
    [queueable, statuses],
  );
  const failedEpisodes = useMemo(
    () =>
      failedIds.map((id) => queueable.find((e) => e.$id === id)).filter(Boolean) as Episode[],
    [failedIds, queueable],
  );

  const totals = useMemo(() => {
    const list = Object.values(statuses);
    return {
      done: list.filter((s) => s === "done" || s === "skipped").length,
      total: queueable.length,
    };
  }, [statuses, queueable.length]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Snapshot which episodes are already on disk whenever the sheet opens.
  useEffect(() => {
    if (!visible) return;
    let active = true;
    setChecking(true);
    setFinished(false);
    setError(null);
    setFailedIds([]);
    void Promise.all(
      queueable.map(async (ep) => [ep.$id, await isDownloaded(ep.$id)] as const),
    ).then((pairs) => {
      if (!active || !mounted.current) return;
      setStatuses(Object.fromEntries(pairs.map(([id, done]) => [id, done ? "done" : "pending"])));
      setChecking(false);
    });
    return () => {
      active = false;
    };
  }, [visible, queueable]);
  const run = useCallback(
    async (episodesToRun: Episode[], useById: boolean) => {
      if (!series || episodesToRun.length === 0) return;
      setRunning(true);
      setFinished(false);
      setError(null);
      setFailedIds([]);
      setStatuses((prev) => {
        const next = { ...prev };
        for (const ep of episodesToRun) next[ep.$id] = "pending";
        return next;
      });
      const onProgress = (p: {
        completed: number;
        current: number;
        currentEpisodeId?: string;
      }) => {
        if (!mounted.current) return;
        setStatuses((prev) => {
          const next = { ...prev };
          // Everything before the current episode already settled (ok or skipped).
          for (let i = 0; i < p.current - 1; i += 1) {
            const ep = episodesToRun[i];
            if (ep && next[ep.$id] === "downloading") next[ep.$id] = "done";
          }
          if (p.currentEpisodeId) next[p.currentEpisodeId] = "downloading";
          return next;
        });
      };
      try {
        const result = useById
          ? await downloadSeriesById(series.$id, { series, speaker: speakerName, onProgress })
          : await downloadSeries(episodesToRun, {
              metaFor: () => ({
                seriesId: series.$id,
                artworkUrl: series.artworkUrl,
                speaker: speakerName,
              }),
              onProgress,
            });
        if (!mounted.current) return;
        setFailedIds(result.failedIds);
        setStatuses((prev) => {
          const next = { ...prev };
          for (const id of result.failedIds) next[id] = "failed";
          for (const ep of episodesToRun) {
            if (next[ep.$id] === "pending" || next[ep.$id] === "downloading") {
              next[ep.$id] = "done";
            }
          }
          return next;
        });
        setFinished(true);
      } catch (err) {
        if (!mounted.current) return;
        const code = (err as Error & { code?: string })?.code;
        setError(
          code === "DOWNLOAD_WIFI"
            ? t("wifiOnly")
            : code === "DOWNLOAD_OFFLINE"
              ? t("offline")
              : err instanceof Error &&
                  err.message &&
                  err.message !== "wifi" &&
                  err.message !== "offline"
                ? err.message
                : t("downloadFailed"),
        );
      } finally {
        if (mounted.current) setRunning(false);
      }
    },
    [series, speakerName, t],
  );

  const pct = totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : 0;
  const nothingLeft = totals.total > 0 && pending.length === 0;


  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        className="flex-1 justify-end bg-black/50"
        onPress={() => {
          if (!running) onClose();
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="max-h-[80vh] rounded-t-3xl border-t border-slate-700/60 bg-slate-900 p-6 pb-10"
        >
          <View className="mx-auto mb-5 h-1 w-10 rounded-full bg-slate-600" />
          <View className="mb-4 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <ListChecks size={18} color="#d4a853" />
              <Text className="text-lg font-bold text-slate-100">{t("downloadAll")}</Text>
            </View>
            <Pressable
              onPress={onClose}
              disabled={running}
              className="rounded-xl bg-slate-800 p-2"
              hitSlop={8}
            >
              <X size={16} color="#94a3b8" />
            </Pressable>
          </View>

          <View className="mb-3 rounded-xl bg-slate-800/50 p-3">
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="text-sm text-slate-300">
                {totals.done} / {totals.total} {t("episodes")}
              </Text>
              {running ? (
                <View className="flex-row items-center gap-1">
                  <ActivityIndicator size="small" color="#d4a853" />
                  <Text className="text-xs text-primary">{t("downloading")}</Text>
                </View>
              ) : finished ? (
                <View className="flex-row items-center gap-1">
                  <CheckCircle2 size={12} color="#34d399" />
                  <Text className="text-xs text-emerald-400">{t("downloaded")}</Text>
                </View>
              ) : null}
            </View>
            <View className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
              <View className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </View>
          </View>

          {error ? (
            <View className="mb-3 flex-row items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3">
              <AlertCircle size={16} color="#fb7185" />
              <Text className="flex-1 text-sm text-rose-300">{error}</Text>
            </View>
          ) : null}

          {checking ? (
            <View className="items-center py-6">
              <ActivityIndicator color="#d4a853" />
            </View>
          ) : queueable.length === 0 ? (
            <View className="items-center py-6">
              <AlertCircle size={32} color="#475569" />
              <Text className="mt-3 text-sm text-slate-400">{t("noAudioToDownload")}</Text>
            </View>
          ) : (
            <ScrollView className="mb-4 max-h-[36vh]" showsVerticalScrollIndicator={false}>
              <View className="gap-1.5">
                {queueable.map((ep, index) => {
                  const status = statuses[ep.$id] ?? "pending";
                  const livePct = status === "downloading" ? getProgress(ep.$id) : undefined;
                  return (
                    <View
                      key={ep.$id}
                      className="flex-row items-center gap-3 rounded-xl bg-slate-800/40 px-3 py-2"
                    >
                      <View className="h-5 w-5 items-center justify-center">
                        {status === "done" || status === "skipped" ? (
                          <Check size={14} color="#34d399" />
                        ) : status === "failed" ? (
                          <AlertCircle size={14} color="#fb7185" />
                        ) : status === "downloading" ? (
                          <ActivityIndicator size="small" color="#d4a853" />
                        ) : (
                          <Circle size={14} color="#475569" />
                        )}
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text numberOfLines={1} className="text-sm text-slate-200">
                          {ep.episodeNumber || index + 1}. {ep.title}
                        </Text>
                        {livePct != null ? (
                          <Text className="text-xs text-primary">{livePct}%</Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          )}
          {/* Running: can't dismiss without cancelling (downloads.ts has no
              queue abort) — the sheet stays open and blocks backdrop close. */}
          {running ? (
            <View className="gap-2">
              <Text className="text-center text-xs text-slate-500">{t("keepScreenOpen")}</Text>
              <Pressable
                onPress={onClose}
                className="w-full items-center justify-center rounded-2xl bg-slate-800 py-3 active:opacity-80"
              >
                <Text className="text-sm font-medium text-slate-200">{t("cancel")}</Text>
              </Pressable>
            </View>
          ) : failedEpisodes.length > 0 ? (
            <View className="flex-row gap-2.5">
              <Pressable
                onPress={onClose}
                className="flex-1 items-center justify-center rounded-2xl bg-slate-800 py-3 active:opacity-80"
              >
                <Text className="text-sm font-medium text-slate-300">{t("cancel")}</Text>
              </Pressable>
              <Pressable
                onPress={() => run(failedEpisodes, false)}
                className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-3 active:opacity-90"
              >
                <Download size={16} color="#0f172a" />
                <Text className="text-sm font-semibold text-slate-900">{t("retry")}</Text>
              </Pressable>
            </View>
          ) : nothingLeft ? (
            <Pressable
              onPress={onClose}
              className="w-full items-center justify-center rounded-2xl bg-primary py-3 active:opacity-90"
            >
              <Text className="text-sm font-semibold text-slate-900">{t("downloaded")}</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => run(queueable, true)}
              disabled={queueable.length === 0}
              className="w-full flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-3 active:opacity-90"
            >
              <Download size={16} color="#0f172a" />
              <Text className="text-sm font-semibold text-slate-900">{t("downloadAll")}</Text>
            </Pressable>
          )}

          <Text className="mt-3 text-center text-xs text-slate-500">{t("downloadDisclaimer")}</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
