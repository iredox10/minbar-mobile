import type { MediaItem } from "@rntp/player";

import type { CurrentTrack } from "@/types";

export type AudioTrackType = CurrentTrack["type"];

/** OS notification / lock-screen album line per track type. */
export function albumTitleForType(type: AudioTrackType): string {
  if (type === "radio") return "Live Radio • Arewa Central";
  if (type === "dua") return "Duas • Arewa Central";
  return "Arewa Central";
}

/**
 * Map an app track to an @rntp/player MediaItem.
 * mediaId=track.id, url=url??track.audioUrl, artist=track.speaker,
 * duration omitted when <= 0, isLive for radio,
 * extras carry {trackType, seriesId?, episodeNumber?} for the reverse map.
 */
export function toMediaItem(track: CurrentTrack, url?: string): MediaItem {
  const item: MediaItem = {
    mediaId: track.id,
    url: url ?? track.audioUrl,
    title: track.title || "Arewa Central",
    albumTitle: albumTitleForType(track.type),
    isLive: track.type === "radio",
    extras: {
      trackType: track.type,
      ...(track.seriesId !== undefined ? { seriesId: track.seriesId } : {}),
      ...(track.episodeNumber !== undefined ? { episodeNumber: track.episodeNumber } : {}),
    },
  };
  if (track.speaker) item.artist = track.speaker;
  if (track.artworkUrl) item.artworkUrl = track.artworkUrl;
  if (track.duration > 0) item.duration = track.duration;
  return item;
}

function mediaUrlToString(url: MediaItem["url"]): string {
  if (typeof url === "string") return url;
  if (url != null && typeof url === "object" && typeof url.uri === "string") {
    return url.uri;
  }
  // number asset refs can't round-trip to a URL.
  return "";
}

function artworkToString(artworkUrl: MediaItem["artworkUrl"]): string | undefined {
  if (typeof artworkUrl === "string") return artworkUrl;
  if (
    artworkUrl != null &&
    typeof artworkUrl === "object" &&
    typeof artworkUrl.uri === "string"
  ) {
    return artworkUrl.uri;
  }
  return undefined;
}

/**
 * Reverse-map a MediaItem back to an app track via extras.
 * duration falls back to 0, type falls back to 'episode'.
 */
export function mediaItemToTrack(item: MediaItem): CurrentTrack {
  const extras = (item.extras ?? {}) as Record<string, unknown>;
  const rawType = extras.trackType;
  const type: AudioTrackType =
    rawType === "radio" || rawType === "dua" || rawType === "episode"
      ? rawType
      : "episode";
  const seriesId = typeof extras.seriesId === "string" ? extras.seriesId : undefined;
  const episodeNumber =
    typeof extras.episodeNumber === "number" && Number.isFinite(extras.episodeNumber)
      ? extras.episodeNumber
      : undefined;
  const audioUrl = mediaUrlToString(item.url);
  const artworkUrl = artworkToString(item.artworkUrl);
  return {
    id: item.mediaId ?? (audioUrl || "unknown"),
    title: item.title || "Arewa Central",
    audioUrl,
    ...(artworkUrl ? { artworkUrl } : {}),
    ...(item.artist ? { speaker: item.artist } : {}),
    duration:
      typeof item.duration === "number" &&
      Number.isFinite(item.duration) &&
      item.duration > 0
        ? item.duration
        : 0,
    type,
    ...(seriesId !== undefined ? { seriesId } : {}),
    ...(episodeNumber !== undefined ? { episodeNumber } : {}),
  };
}
