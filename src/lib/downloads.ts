import { Directory, File, Paths } from "expo-file-system";
import NetInfo from "@react-native-community/netinfo";

import {
  addDownload,
  getDownloads,
  getSettings,
  isDownloaded,
  removeDownload,
} from "@/lib/db";
import { trackDownload } from "@/lib/analytics";
import type { DownloadedEpisode, Episode } from "@/types";

interface DownloadMeta {
  seriesId?: string;
  speakerId?: string;
  artworkUrl?: string;
  speaker?: string;
}

export async function canDownloadNow(): Promise<{ ok: boolean; reason?: "wifi" | "offline" }> {
  const settings = await getSettings();
  if (!settings?.downloadWifiOnly) return { ok: true };
  const state = await NetInfo.fetch();
  if (!state.isConnected || state.isInternetReachable === false) {
    return { ok: false, reason: "offline" };
  }
  if (state.type === "cellular") {
    return { ok: false, reason: "wifi" };
  }
  return { ok: true };
}

type Listener = () => void;
type ProgressListener = (episodeId: string, percent: number) => void;

const stateListeners = new Set<Listener>();
const progressListeners = new Set<ProgressListener>();
const progressMap = new Map<string, number>();
const activeTasks = new Map<string, { cancel: () => void }>();

function notify(): void {
  stateListeners.forEach((l) => l());
}

export function subscribeDownloads(listener: Listener): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

export function subscribeProgress(listener: ProgressListener): () => void {
  progressListeners.add(listener);
  return () => progressListeners.delete(listener);
}

export function getProgress(episodeId: string): number | undefined {
  return progressMap.get(episodeId);
}

export function isDownloading(episodeId: string): boolean {
  return activeTasks.has(episodeId);
}

function downloadsDirectory(): Directory {
  const dir = new Directory(Paths.document, "downloads");
  dir.create({ idempotent: true, intermediates: true });
  return dir;
}

function fileNameFor(episodeId: string): string {
  return `${episodeId}.mp3`;
}

export async function getLocalUri(episodeId: string): Promise<string | null> {
  const file = new File(downloadsDirectory(), fileNameFor(episodeId));
  return file.exists ? file.uri : null;
}

export async function downloadEpisode(episode: Episode, meta?: Partial<DownloadMeta>): Promise<void> {
  if (await isDownloaded(episode.$id)) return;
  if (isDownloading(episode.$id)) return;

  if (!episode.audioUrl) {
    throw new Error("Episode has no audio URL");
  }

  const gate = await canDownloadNow();
  if (gate.reason) {
    const err = new Error(gate.reason) as Error & { code?: string };
    err.code = `DOWNLOAD_${gate.reason.toUpperCase()}`;
    throw err;
  }

  const dir = downloadsDirectory();
  const file = new File(dir, fileNameFor(episode.$id));
  const task = File.createDownloadTask(episode.audioUrl, file, {
    onProgress: ({ bytesWritten, totalBytes }) => {
      if (totalBytes > 0) {
        const pct = Math.min(100, Math.round((bytesWritten / totalBytes) * 100));
        progressMap.set(episode.$id, pct);
        progressListeners.forEach((l) => l(episode.$id, pct));
      }
    },
  });

  activeTasks.set(episode.$id, {
    cancel: () => task.cancel(),
  });
  notify();
  try {
    const output = await task.downloadAsync();
    if (!output) return;
    await addDownload({
      episodeId: episode.$id,
      title: episode.title,
      seriesId: meta?.seriesId,
      speakerId: meta?.speakerId,
      audioUrl: episode.audioUrl,
      artworkUrl: meta?.artworkUrl,
      speaker: meta?.speaker,
      localUri: output.uri,
      duration: episode.duration,
      downloadedAt: new Date(),
      fileSize: output.size ?? 0,
    });
    trackDownload(episode.$id, episode.title);
  } finally {
    progressMap.delete(episode.$id);
    activeTasks.delete(episode.$id);
    notify();
  }
}

export async function deleteDownloaded(episodeId: string): Promise<void> {
  if (isDownloading(episodeId)) {
    activeTasks.get(episodeId)?.cancel();
  }
  const file = new File(downloadsDirectory(), fileNameFor(episodeId));
  if (file.exists) file.delete();
  const all = await getDownloads();
  const hit = all.find((d) => d.episodeId === episodeId);
  if (hit?.id) await removeDownload(hit.id);
  notify();
}

export async function listDownloads(): Promise<DownloadedEpisode[]> {
  const all = await getDownloads();
  const withUris = await Promise.all(
    all.map(async (d) => {
      if (d.localUri) return d;
      const uri = await getLocalUri(d.episodeId);
      return uri ? { ...d, localUri: uri } : null;
    }),
  );
  const valid = withUris.filter((d): d is DownloadedEpisode => d !== null);
  const current = await getDownloads();
  if (current.length !== valid.length) {
    for (const d of current) {
      if (!valid.some((v) => v.episodeId === d.episodeId)) await removeDownload(d.id!);
    }
  }
  return valid;
}