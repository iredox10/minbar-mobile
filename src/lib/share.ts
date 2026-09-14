import { Share } from "react-native";
import type { Episode } from "@/types";

/**
 * Central share-link helpers — parity with web `EpisodeDetail.tsx` share section.
 *
 * Web canonical URLs (see minbar `src/App.tsx` routes):
 *   episode → https://arewacentral.com/podcasts/episode/:id
 *   series  → https://arewacentral.com/podcasts/series/:id
 *   speaker → https://arewacentral.com/podcasts/speaker/:slug
 *   playlist (local-only on mobile) → https://arewacentral.com/playlists?name=:name
 *
 * Mobile deep links (expo `scheme` is `arewa`, routes in `app/`):
 *   episode → arewa://episodes/:id
 *   series  → arewa://series/:id
 *   speaker → arewa://speakers/:slug
 *   playlist → arewa://playlists?name=:name
 */

export const WEB_BASE_URL = "https://arewacentral.com";
export const APP_SCHEME = "arewa://";

export interface ShareLinks {
  /** Deep link opened by the installed app (`arewa://…`). */
  deepLink: string;
  /** Universal https fallback for anyone without the app. */
  webUrl: string;
}

export type ShareResult = "shared" | "dismissed";

export interface ShareTarget extends ShareLinks {
  kind: "episode" | "series" | "speaker" | "playlist";
  /** Display title (episode title / series title / speaker name / playlist name). */
  title: string;
  /** Secondary line (e.g. speaker name under an episode title). */
  subtitle?: string;
  /** Artwork URL for share-card rendering (optional). */
  artworkUri?: string;
  /** Small pill label on the share card (e.g. "Episode 12"). */
  badge?: string;
  /** Prebuilt message containing BOTH links (deep link + https fallback). */
  message: string;
}

// ─── Link builders ────────────────────────────────────────────────────────────

export function getEpisodeLinks(episodeId: string, timestampSeconds?: number): ShareLinks {
  const suffix = timestampSeconds && timestampSeconds > 0 ? `?t=${Math.floor(timestampSeconds)}` : "";
  return {
    deepLink: `${APP_SCHEME}episodes/${episodeId}${suffix}`,
    webUrl: `${WEB_BASE_URL}/podcasts/episode/${episodeId}${suffix}`,
  };
}

export function getSeriesLinks(seriesId: string): ShareLinks {
  return {
    deepLink: `${APP_SCHEME}series/${seriesId}`,
    webUrl: `${WEB_BASE_URL}/podcasts/series/${seriesId}`,
  };
}

export function getSpeakerLinks(slug: string): ShareLinks {
  return {
    deepLink: `${APP_SCHEME}speakers/${slug}`,
    webUrl: `${WEB_BASE_URL}/podcasts/speaker/${slug}`,
  };
}

export function getPlaylistLinks(name: string): ShareLinks {
  const q = `?name=${encodeURIComponent(name)}`;
  return {
    deepLink: `${APP_SCHEME}playlists${q}`,
    webUrl: `${WEB_BASE_URL}/playlists${q}`,
  };
}

// ─── ShareTarget builders (for ShareSheet) ────────────────────────────────────

function buildMessage(headline: string, links: ShareLinks): string {
  return `${headline}\n${links.webUrl}\n${links.deepLink}`;
}

export function episodeTarget(
  episode: Pick<Episode, "$id" | "title"> & { episodeNumber?: number },
  speakerName?: string,
  opts?: { artworkUri?: string },
): ShareTarget {
  const links = getEpisodeLinks(episode.$id);
  const headline = `Listen to "${episode.title}"${speakerName ? ` by ${speakerName}` : ""} on Arewa Central`;
  return {
    kind: "episode",
    title: episode.title,
    subtitle: speakerName,
    artworkUri: opts?.artworkUri,
    badge: episode.episodeNumber ? `Episode ${episode.episodeNumber}` : undefined,
    ...links,
    message: buildMessage(headline, links),
  };
}

export function seriesTarget(id: string, title: string): ShareTarget {
  const links = getSeriesLinks(id);
  return {
    kind: "series",
    title,
    ...links,
    message: buildMessage(`Listen to "${title}" on Arewa Central`, links),
  };
}

export function speakerTarget(slug: string, name: string): ShareTarget {
  const links = getSpeakerLinks(slug);
  return {
    kind: "speaker",
    title: name,
    ...links,
    message: buildMessage(`Listen to ${name} on Arewa Central`, links),
  };
}

export function playlistTarget(name: string): ShareTarget {
  const links = getPlaylistLinks(name);
  return {
    kind: "playlist",
    title: name,
    ...links,
    message: buildMessage(`Check out my playlist "${name}" on Arewa Central`, links),
  };
}

// ─── System share ─────────────────────────────────────────────────────────────

async function systemShare(title: string, message: string, webUrl: string): Promise<ShareResult> {
  // `message` already contains both the deep link and the https fallback
  // (Android merges/ignores `url`, so embedding both guarantees parity).
  // `url` is passed separately for iOS, which presents it as a link attachment.
  const result = await Share.share({ title, message, url: webUrl });
  if ("action" in result && result.action === Share.dismissedAction) return "dismissed";
  return "shared";
}

/** Share a prebuilt target (used by ShareSheet and by direct callers). */
export function shareTarget(target: ShareTarget): Promise<ShareResult> {
  return systemShare(target.title, target.message, target.webUrl);
}

export function shareEpisode(
  episode: Pick<Episode, "$id" | "title">,
  speakerName?: string,
): Promise<ShareResult> {
  return shareTarget(episodeTarget(episode, speakerName));
}

export function shareSeries(id: string, title: string): Promise<ShareResult> {
  return shareTarget(seriesTarget(id, title));
}

export function shareSpeaker(slug: string, name: string): Promise<ShareResult> {
  return shareTarget(speakerTarget(slug, name));
}

export function sharePlaylist(name: string): Promise<ShareResult> {
  return shareTarget(playlistTarget(name));
}

// ─── Clipboard (optional dep, no package.json change) ─────────────────────────

/**
 * Copy text to the clipboard.
 * Uses `expo-clipboard` when installed; returns false otherwise so callers can
 * fall back to the selectable link preview inside ShareSheet.
 * (Deliberately a dynamic `import` + `@ts-ignore` so `tsc` passes with or
 * without the optional dependency installed.)
 */
export async function copyLink(text: string): Promise<boolean> {
  try {
    // @ts-ignore - expo-clipboard is an optional dependency
    const Clipboard = await import("expo-clipboard");
    if (typeof Clipboard.setStringAsync === "function") {
      await Clipboard.setStringAsync(text);
      return true;
    }
    if (typeof Clipboard.setString === "function") {
      Clipboard.setString(text);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
