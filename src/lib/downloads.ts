import { Directory, File, Paths } from "expo-file-system";
import NetInfo from "@react-native-community/netinfo";

import {
  addDownload,
  getDownloads,
  getSettings,
  isDownloaded,
  removeDownload,
} from "@/lib/db";
import { getEpisodesBySeries, getLatestEpisodes } from "@/lib/appwrite";
import { trackDownload } from "@/lib/analytics";
import type { DownloadedEpisode, Episode, Series } from "@/types";

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

export async function getStorageUsage(): Promise<{ count: number; bytes: number }> {
  const all = await getDownloads();
  return {
    count: all.length,
    bytes: all.reduce((sum, d) => sum + (d.fileSize ?? 0), 0),
  };
}

export async function clearAllDownloads(): Promise<void> {
  for (const task of activeTasks.values()) {
    try {
      task.cancel();
    } catch {
      // ignore cancel errors for tasks that already settled
    }
  }
  activeTasks.clear();
  progressMap.clear();
  const dir = downloadsDirectory();
  const all = await getDownloads();
  for (const d of all) {
    const file = new File(dir, fileNameFor(d.episodeId));
    try {
      if (file.exists) file.delete();
    } catch {
      // file may already be gone; db record is still removed below
    }
    if (d.id != null) {
      try {
        await removeDownload(d.id);
      } catch {
        // keep clearing the rest even if one record fails
      }
    }
  }
  notify();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isGateError(err: unknown): boolean {
  const code = (err as Error & { code?: string })?.code;
  return code === "DOWNLOAD_WIFI" || code === "DOWNLOAD_OFFLINE";
}

function gateError(reason: "wifi" | "offline"): Error {
  const err = new Error(reason) as Error & { code?: string };
  err.code = `DOWNLOAD_${reason.toUpperCase()}`;
  return err;
}

export interface DownloadSeriesProgress {
  current: number;
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  currentEpisodeId?: string;
}

export interface DownloadSeriesResult extends DownloadSeriesProgress {
  failedIds: string[];
}

export type DownloadSeriesProgressCallback = (progress: DownloadSeriesProgress) => void;

export interface DownloadSeriesOptions {
  meta?: Partial<DownloadMeta>;
  metaFor?: (episode: Episode) => Partial<DownloadMeta> | undefined;
  onProgress?: DownloadSeriesProgressCallback;
  /** Attempts per episode including the first try. Default 3 (initial + 2 retries). */
  maxAttempts?: number;
}

const DOWNLOAD_SERIES_DEFAULT_ATTEMPTS = 3;
const DOWNLOAD_SERIES_RETRY_DELAY_MS = 750;

/**
 * downloadSeries — sequential "Download All" queue (mobile parity for web
 * `useDownloads` processQueue). Episodes download one at a time in order,
 * already-downloaded episodes are skipped, and each episode is retried up to
 * 2 extra times on transient failure. Wifi/offline gates from
 * `downloadEpisode` are kept: a gate failure aborts the remaining queue.
 */
export async function downloadSeries(
  episodes: Episode[],
  opts?: DownloadSeriesOptions,
): Promise<DownloadSeriesResult> {
  const maxAttempts = Math.max(1, opts?.maxAttempts ?? DOWNLOAD_SERIES_DEFAULT_ATTEMPTS);
  const total = episodes.length;
  const result: DownloadSeriesResult = {
    current: 0,
    total,
    completed: 0,
    failed: 0,
    skipped: 0,
    failedIds: [],
  };
  const emit = (currentEpisodeId?: string): void => {
    opts?.onProgress?.({ ...result, currentEpisodeId });
  };

  // Fail fast before emitting progress so callers can surface wifi/offline UI.
  const gate = await canDownloadNow();
  if (!gate.ok && total > 0) {
    throw gateError(gate.reason ?? "offline");
  }

  for (let i = 0; i < episodes.length; i++) {
    const episode = episodes[i];
    result.current = i + 1;
    emit(episode.$id);

    if (await isDownloaded(episode.$id)) {
      result.skipped += 1;
      result.completed += 1;
      emit(episode.$id);
      continue;
    }

    let ok = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await downloadEpisode(episode, opts?.metaFor?.(episode) ?? opts?.meta);
        ok = true;
        break;
      } catch (err) {
        if (isGateError(err)) throw err;
        if (attempt < maxAttempts) await sleep(DOWNLOAD_SERIES_RETRY_DELAY_MS * attempt);
      }
    }
    if (ok) {
      result.completed += 1;
    } else {
      result.failed += 1;
      result.failedIds.push(episode.$id);
    }
    emit(episode.$id);
  }
  return result;
}

/**
 * checkAutoDownload — filters a latest-episodes feed down to the episodes that
 * are eligible for auto-download.
 *
 * Returns [] unless the `autoDownload` setting is ON and the device passes the
 * wifi/offline gates; otherwise it returns the episodes that have an audioUrl
 * and are neither downloaded nor already downloading.
 *
 * Prefer calling `runAutoDownload(followedSpeakerIds)` — this is the low-level
 * filter; that wrapper adds the followed-speaker scoping, the dedupe guard and
 * the never-throw contract used by the app-foreground trigger.
 */
export async function checkAutoDownload(latest: Episode[]): Promise<Episode[]> {
  const settings = await getSettings();
  if (!settings?.autoDownload) return [];
  const gate = await canDownloadNow();
  if (!gate.ok) return [];
  const candidates: Episode[] = [];
  for (const episode of latest) {
    if (!episode?.audioUrl) continue;
    if (isDownloading(episode.$id)) continue;
    if (await isDownloaded(episode.$id)) continue;
    candidates.push(episode);
  }
  return candidates;
}

// ─── Auto download ───────────────────────────────────────────────────────────

/** How many of the latest episodes to consider per auto-download run. */
const AUTO_DOWNLOAD_FEED_LIMIT = 25;

export interface RunAutoDownloadOptions {
  onProgress?: DownloadSeriesProgressCallback;
  /** Override the latest-episodes feed size. */
  limit?: number;
}

// Single-flight guard so repeated foregrounds cannot queue the same episodes twice.
let autoDownloadInFlight: Promise<DownloadSeriesResult> | null = null;

/**
 * runAutoDownload — fetch the latest episodes and queue any that belong to a
 * followed ("subscribed") speaker.
 *
 * This is the trigger `checkAutoDownload` was written for. It is safe to call
 * on every app foreground:
 *  - returns early when the `autoDownload` setting is off, no speakers are
 *    followed, or the device is offline / not on wifi (via `canDownloadNow`),
 *  - de-duplicates concurrent runs (a foreground storm cannot double-queue),
 *  - never throws — every failure path returns the partial/empty result and
 *    logs a warning, so it can be fired from a mount/AppState effect.
 */
export function runAutoDownload(
  followedSpeakerIds: string[],
  opts?: RunAutoDownloadOptions,
): Promise<DownloadSeriesResult> {
  if (autoDownloadInFlight) return autoDownloadInFlight;

  const speakerIds = (followedSpeakerIds ?? []).filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  const run = (async (): Promise<DownloadSeriesResult> => {
    const empty: DownloadSeriesResult = {
      current: 0,
      total: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      failedIds: [],
    };
    try {
      const settings = await getSettings();
      if (!settings?.autoDownload) return empty;
      if (speakerIds.length === 0) return empty;

      // Belt-and-braces offline check: canDownloadNow only consults NetInfo
      // when the wifi-only gate is on.
      const net = await NetInfo.fetch();
      if (!net.isConnected || net.isInternetReachable === false) return empty;

      const latest = await getLatestEpisodes(opts?.limit ?? AUTO_DOWNLOAD_FEED_LIMIT);
      const wanted = new Set(speakerIds);
      const fromSubs = latest.filter((e) => !!e?.speakerId && wanted.has(e.speakerId));

      const candidates = await checkAutoDownload(fromSubs);
      if (candidates.length === 0) return empty;

      return await downloadSeries(candidates, {
        onProgress: opts?.onProgress,
        metaFor: (episode) => ({
          seriesId: episode.seriesId,
          speakerId: episode.speakerId,
        }),
      });
    } catch (error) {
      // Auto-download is a background nicety: log and bail, never surface.
      console.warn("Auto download skipped:", error);
      return empty;
    } finally {
      autoDownloadInFlight = null;
    }
  })();

  autoDownloadInFlight = run;
  return run;
}