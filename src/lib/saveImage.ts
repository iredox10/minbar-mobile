import * as Sharing from "expo-sharing";
/**
 * Guarded wrapper around the media library so a missing native module can
 * never crash the JS bundle at import time.
 *
 * `expo-media-library`'s root entry is the new "Next" API, which calls
 * `requireNativeModule("ExpoMediaLibraryNext")` as a top-level side effect.
 * When that native module is absent from the installed build (e.g. a dev
 * binary generated before the package was added, or Expo Go), merely
 * `import * as MediaLibrary from "expo-media-library"` throws while the
 * module graph is being evaluated. Because route modules are evaluated
 * eagerly by expo-router, that throw also made `app/episodes/[id].tsx` look
 * like it had "no default export".
 *
 * So we never import it statically. We resolve the legacy entry lazily and
 * fall back to the share sheet, which needs no media-library permission.
 */

/** Shape of the legacy media-library surface we actually use. */
type LegacyMediaLibrary = {
  requestPermissionsAsync(writeOnly?: boolean): Promise<{ granted: boolean }>;
  saveToLibraryAsync(localUri: string): Promise<void>;
};

let cached: LegacyMediaLibrary | null | undefined;

/**
 * Lazily resolve the legacy media library, or `null` when unavailable.
 * Cached so the probe cost is paid at most once per app session.
 */
function getLegacyMediaLibrary(): LegacyMediaLibrary | null {
  if (cached !== undefined) return cached;
  try {
    // Legacy entry binds the long-standing `ExpoMediaLibrary` module name.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("expo-media-library/legacy") as LegacyMediaLibrary;
  } catch (error) {
    console.warn(
      "[saveImage] expo-media-library unavailable; falling back to the share sheet.",
      error,
    );
    cached = null;
  }
  return cached;
}

export type SaveImageResult = "saved" | "permission-denied" | "shared" | "unavailable";

/**
 * Persist a captured PNG to the device.
 *
 * Tries the media library first so the image lands in the user's Photos /
 * gallery, then degrades to the system share sheet (which is what the
 * "save" affordance effectively is when no gallery module is present).
 */
export async function saveImageToLibrary(
  uri: string,
  dialogTitle?: string,
): Promise<SaveImageResult> {
  const MediaLibrary = getLegacyMediaLibrary();

  if (MediaLibrary) {
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) return "permission-denied";
      await MediaLibrary.saveToLibraryAsync(uri);
      return "saved";
    } catch (error) {
      // Permission prompt or write rejected on this platform — fall through
      // to the share sheet rather than surfacing a hard failure.
      console.warn("[saveImage] media library save failed; trying share sheet.", error);
    }
  }

  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        dialogTitle,
        UTI: "public.png",
      });
      return "shared";
    }
  } catch (error) {
    console.warn("[saveImage] share fallback failed.", error);
  }

  return "unavailable";
}
