import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  HardDrive,
  Trash2,
  X,
} from "lucide-react-native";

import { useTranslation } from "@/hooks/useTranslation";
import { isDownloaded } from "@/lib/db";
import {
  deleteDownloaded,
  downloadEpisode,
  getProgress,
  isDownloading,
  listDownloads,
  subscribeDownloads,
  subscribeProgress,
} from "@/lib/downloads";
import type { CurrentTrack, DownloadedEpisode, Episode } from "@/types";

type DownloadStatus = "checking" | "idle" | "downloading" | "done" | "error";

interface Props {
  visible: boolean;
  track: CurrentTrack | null;
  onClose: () => void;
  onChanged?: (episodeId: string, downloaded: boolean) => void;
  /** Surfaces the last failure so the player action icon can show an error state. */
  onError?: (episodeId: string, message: string | null) => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: Date | string | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

export function PlayerDownloadSheet({ visible, track, onClose, onChanged, onError }: Props) {
  const { t } = useTranslation();
  const episodeId = track?.id;
  const isRadio = track?.type === "radio";
  const noAudio = !track?.audioUrl;
  const disabled = isRadio || noAudio;

  const [status, setStatus] = useState<DownloadStatus>("checking");
  const [progress, setProgress] = useState(0);
  const [record, setRecord] = useState<DownloadedEpisode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!episodeId) {
      setStatus("idle");
      setRecord(null);
      return;
    }
    try {
      const [done, list] = await Promise.all([isDownloaded(episodeId), listDownloads()]);
      if (!mounted.current) return;
      setRecord(done ? list.find((d) => d.episodeId === episodeId) ?? null : null);
      setStatus((prev) => {
        if (isDownloading(episodeId)) return "downloading";
        if (prev === "downloading") return done ? "done" : "idle";
        if (done) return "done";
        return prev === "done" ? "idle" : prev;
      });
    } catch {
      if (mounted.current) setStatus((prev) => (prev === "checking" ? "idle" : prev));
    }
  }, [episodeId]);

  // Live status: progress ticks + download-list mutations.
  useEffect(() => {
    if (!episodeId || !visible) return;
    setStatus((prev) => (prev === "done" || prev === "downloading" ? prev : "checking"));
    void refresh();
    const unsubProgress = subscribeProgress((id, pct) => {
      if (id !== episodeId) return;
      setProgress(pct);
      setStatus("downloading");
    });
    const unsubState = subscribeDownloads(() => {
      void refresh();
    });
    return () => {
      unsubProgress();
      unsubState();
    };
  }, [episodeId, visible, refresh]);

  const start = useCallback(async () => {
    if (!track || disabled) return;
    setError(null);
    setProgress(0);
    setStatus("downloading");
    if (track) onError?.(track.id, null);
    try {
      await downloadEpisode(
        {
          $id: track.id,
          title: track.title,
          slug: track.id,
          seriesId: track.seriesId,
          audioUrl: track.audioUrl,
          duration: track.duration,
          publishedAt: new Date().toISOString(),
          description: "",
          episodeNumber: track.episodeNumber ?? 0,
        } satisfies Episode,
        { seriesId: track.seriesId, artworkUrl: track.artworkUrl, speaker: track.speaker },
      );
      if (!mounted.current) return;
      setStatus("done");
      onChanged?.(track.id, true);
    } catch (err) {
      if (!mounted.current) return;
      const code = (err as Error & { code?: string })?.code;
      let message: string;
      if (code === "DOWNLOAD_WIFI") message = t("wifiOnly");
      else if (code === "DOWNLOAD_OFFLINE") message = t("offline");
      else if (err instanceof Error && err.message && err.message !== "wifi" && err.message !== "offline") {
        message = err.message;
      } else message = t("downloadFailed");
      setError(message);
      setStatus("error");
      onError?.(track.id, message);
    } finally {
      if (mounted.current) setProgress(getProgress(track.id) ?? 0);
      void refresh();
    }
  }, [track, disabled, onChanged, onError, t, refresh]);

  const remove = useCallback(async () => {
    if (!track) return;
    await deleteDownloaded(track.id);
    if (!mounted.current) return;
    setRecord(null);
    setProgress(0);
    setError(null);
    setStatus("idle");
    onChanged?.(track.id, false);
  }, [track, onChanged]);

  const cancel = useCallback(() => {
    if (!track) return;
    void deleteDownloaded(track.id).then(() => {
      if (!mounted.current) return;
      setProgress(0);
      setStatus("idle");
      onChanged?.(track.id, false);
    });
  }, [track, onChanged]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="rounded-t-3xl border-t border-slate-700/60 bg-slate-900 p-6 pb-10"
        >
          <View className="mx-auto mb-5 h-1 w-10 rounded-full bg-slate-600" />
          <View className="mb-5 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Download size={18} color="#d4a853" />
              <Text className="text-lg font-bold text-slate-100">{t("downloadEpisode")}</Text>
            </View>
            <Pressable onPress={onClose} className="rounded-xl bg-slate-800 p-2" hitSlop={8}>
              <X size={16} color="#94a3b8" />
            </Pressable>
          </View>

          {disabled ? (
            <View className="items-center py-6">
              <AlertCircle size={36} color="#475569" />
              <Text className="mt-3 text-center text-sm text-slate-400">
                {isRadio ? t("radioNoDownload") : t("noAudioToDownload")}
              </Text>
            </View>
          ) : (
            <>
              {/* Track info */}
              <View className="mb-5 flex-row items-center gap-3 rounded-2xl bg-slate-800/40 p-3">
                <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary/20">
                  <HardDrive size={14} color="#d4a853" />
                </View>
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="text-[15px] font-medium text-slate-100">
                    {track?.title}
                  </Text>
                  {track?.speaker ? (
                    <Text numberOfLines={1} className="text-xs text-slate-400">
                      {track.speaker}
                    </Text>
                  ) : null}
                </View>
              </View>

              {status === "checking" ? (
                <View className="items-center py-6">
                  <ActivityIndicator color="#d4a853" />
                </View>
              ) : null}

              {/* Idle: start download */}
              {status === "idle" ? (
                <Pressable
                  onPress={start}
                  className="w-full flex-row items-center justify-center gap-2 rounded-2xl bg-primary py-3 active:opacity-90"
                >
                  <Download size={16} color="#0f172a" />
                  <Text className="text-sm font-semibold text-slate-900">{t("download")}</Text>
                </Pressable>
              ) : null}

              {/* Downloading: progress + cancel */}
              {status === "downloading" ? (
                <View>
                  <View className="mb-2 flex-row items-center justify-between">
                    <Text className="text-sm text-slate-300">{t("downloading")}</Text>
                    <Text className="font-mono text-sm text-primary">{progress}%</Text>
                  </View>
                  <View className="mb-3 h-2 w-full overflow-hidden rounded-full bg-slate-700">
                    <View
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${progress}%` }}
                    />
                  </View>
                  <Text className="mb-3 text-center text-xs text-slate-500">{t("keepScreenOpen")}</Text>
                  <Pressable
                    onPress={cancel}
                    className="w-full items-center justify-center rounded-2xl bg-slate-800 py-3 active:opacity-80"
                  >
                    <Text className="text-sm font-medium text-slate-200">{t("cancel")}</Text>
                  </Pressable>
                </View>
              ) : null}

              {/* Done: saved state, file size, delete */}
              {status === "done" ? (
                <View className="gap-3">
                  <View className="flex-row items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                    <CheckCircle2 size={16} color="#34d399" />
                    <View className="min-w-0 flex-1">
                      <Text className="text-sm text-emerald-300">{t("downloaded")}</Text>
                      <Text numberOfLines={1} className="mt-0.5 text-xs text-emerald-400/70">
                        {[formatBytes(record?.fileSize ?? 0), formatDate(record?.downloadedAt)]
                          .filter(Boolean)
                          .join(" \u2022 ")}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-center text-xs text-slate-500">{t("downloadDisclaimer")}</Text>
                  <Pressable
                    onPress={remove}
                    className="flex-row items-center justify-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 py-3 active:opacity-80"
                  >
                    <Trash2 size={15} color="#fb7185" />
                    <Text className="text-sm font-medium text-rose-400">{t("delete")}</Text>
                  </Pressable>
                </View>
              ) : null}

              {/* Error: message + retry */}
              {status === "error" ? (
                <View className="gap-3">
                  <View className="flex-row items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3">
                    <AlertCircle size={16} color="#fb7185" />
                    <Text className="flex-1 text-sm leading-relaxed text-rose-300">
                      {error ?? t("downloadFailed")}
                    </Text>
                  </View>
                  <Pressable
                    onPress={start}
                    className="flex-row items-center justify-center gap-2 rounded-2xl bg-slate-800 py-3 active:opacity-80"
                  >
                    <Download size={16} color="#cbd5e1" />
                    <Text className="text-sm font-medium text-slate-200">{t("retry")}</Text>
                  </Pressable>
                </View>
              ) : null}
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
