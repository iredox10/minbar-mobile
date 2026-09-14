import { ID, Query } from "appwrite";
import {
  DATABASE_ID,
  USER_FAVORITES_COLLECTION,
  USER_HISTORY_COLLECTION,
  USER_PLAYLIST_ITEMS_COLLECTION,
  USER_PLAYLISTS_COLLECTION,
  databases,
  isAppwriteConfigured,
} from "./appwrite";
import {
  addFavorite,
  addPlaylistItem,
  createPlaylist,
  getAllPlaylistItems,
  getFavorites,
  getPlaylistItems,
  getPlaylists,
  getRecentHistory,
  setPlaylistAppwriteId,
  setPlaylistItemAppwriteId,
  updatePlaybackProgress,
} from "./db";

function toDate(value: unknown, fallback = new Date()): Date {
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

export async function syncFavorites(userId: string): Promise<void> {
  if (!userId || !isAppwriteConfigured()) return;
  try {
    const cloud = await databases.listDocuments(DATABASE_ID, USER_FAVORITES_COLLECTION, [
      Query.equal("userId", userId),
      Query.limit(100),
    ]);
    const local = await getFavorites();

    for (const doc of cloud.documents) {
      const d = doc as unknown as { type: "episode" | "series" | "dua"; itemId: string; title: string; imageUrl?: string; addedAt: string };
      if (!local.some((f) => f.type === d.type && f.itemId === d.itemId)) {
        await addFavorite({
          type: d.type,
          itemId: d.itemId,
          title: d.title,
          imageUrl: d.imageUrl,
          addedAt: toDate(d.addedAt),
        });
      }
    }

    for (const fav of local) {
      const exists = cloud.documents.some(
        (d: unknown) => {
          const c = d as { type: string; itemId: string };
          return c.type === fav.type && c.itemId === fav.itemId;
        },
      );
      if (!exists) {
        await databases.createDocument(DATABASE_ID, USER_FAVORITES_COLLECTION, ID.unique(), {
          userId,
          type: fav.type,
          itemId: fav.itemId,
          title: fav.title,
          imageUrl: fav.imageUrl ?? "",
          addedAt: fav.addedAt instanceof Date ? fav.addedAt.toISOString() : new Date(fav.addedAt).toISOString(),
        });
      }
    }
  } catch (error) {
    console.error("Sync favorites failed:", error);
  }
}

export async function syncHistory(userId: string): Promise<void> {
  if (!userId || !isAppwriteConfigured()) return;
  try {
    const cloud = await databases.listDocuments(DATABASE_ID, USER_HISTORY_COLLECTION, [
      Query.equal("userId", userId),
      Query.limit(100),
    ]);
    const local = await getRecentHistory(5000);

    for (const doc of cloud.documents) {
      const d = doc as unknown as {
        episodeId: string; position: number; duration: number; playedAt: string;
        completed: boolean; title?: string; artworkUrl?: string; audioUrl?: string; speaker?: string;
      };
      const existing = local.find((h) => h.episodeId === d.episodeId);
      if (!existing) {
        await updatePlaybackProgress(d.episodeId, d.position, d.duration, d.completed, {
          title: d.title, artworkUrl: d.artworkUrl, audioUrl: d.audioUrl, speaker: d.speaker,
        });
      } else if (toDate(d.playedAt) > toDate(existing.playedAt)) {
        await updatePlaybackProgress(d.episodeId, d.position, d.duration, d.completed, {
          title: d.title ?? existing.title,
          artworkUrl: d.artworkUrl ?? existing.artworkUrl,
          audioUrl: d.audioUrl ?? existing.audioUrl,
          speaker: d.speaker ?? existing.speaker,
        });
      }
    }

    for (const hist of local) {
      const cloudDoc = cloud.documents.find(
        (d: unknown) => (d as { episodeId: string }).episodeId === hist.episodeId,
      ) as unknown as { $id: string; playedAt: string } | undefined;
      const playedAt = hist.playedAt instanceof Date ? hist.playedAt.toISOString() : new Date(hist.playedAt).toISOString();
      if (!cloudDoc) {
        await databases.createDocument(DATABASE_ID, USER_HISTORY_COLLECTION, ID.unique(), {
          userId,
          episodeId: hist.episodeId,
          position: Math.floor(hist.position),
          duration: Math.floor(hist.duration),
          playedAt,
          completed: hist.completed,
          title: hist.title ?? "",
          artworkUrl: hist.artworkUrl ?? "",
          audioUrl: hist.audioUrl ?? "",
          speaker: hist.speaker ?? "",
        });
      } else if (toDate(hist.playedAt) > toDate(cloudDoc.playedAt)) {
        await databases.updateDocument(DATABASE_ID, USER_HISTORY_COLLECTION, cloudDoc.$id, {
          position: Math.floor(hist.position),
          duration: Math.floor(hist.duration),
          playedAt,
          completed: hist.completed,
        });
      }
    }
  } catch (error) {
    console.error("Sync history failed:", error);
  }
}

export async function syncPlaylists(userId: string): Promise<void> {
  if (!userId || !isAppwriteConfigured()) return;
  try {
    const cloudPlaylists = await databases.listDocuments(DATABASE_ID, USER_PLAYLISTS_COLLECTION, [
      Query.equal("userId", userId),
      Query.limit(100),
    ]);
    const localPlaylists = await getPlaylists();
    const byAppwriteId = new Map(localPlaylists.filter((p) => p.appwriteId).map((p) => [p.appwriteId!, p]));

    for (const doc of cloudPlaylists.documents) {
      const d = doc as unknown as { $id: string; name: string; description?: string; createdAt: string; updatedAt: string };
      let local = byAppwriteId.get(d.$id) ?? localPlaylists.find((p) => p.name === d.name);
      if (!local) {
        const id = await createPlaylist(d.name, d.description);
        await setPlaylistAppwriteId(id, d.$id);
      } else if (!local.appwriteId || toDate(d.updatedAt) > toDate(local.updatedAt)) {
        const { renamePlaylist } = await import("./db");
        await renamePlaylist(local.id!, d.name);
        await setPlaylistAppwriteId(local.id!, d.$id);
      }
    }

    const refreshed = await getPlaylists();
    for (const pl of refreshed) {
      if (!pl.appwriteId) {
        const created = await databases.createDocument(DATABASE_ID, USER_PLAYLISTS_COLLECTION, ID.unique(), {
          userId,
          name: pl.name,
          description: pl.description ?? "",
          createdAt: (pl.createdAt instanceof Date ? pl.createdAt : new Date(pl.createdAt)).toISOString(),
          updatedAt: (pl.updatedAt instanceof Date ? pl.updatedAt : new Date(pl.updatedAt)).toISOString(),
        });
        await setPlaylistAppwriteId(pl.id!, created.$id);
      }
    }

    const cloudItems = await databases.listDocuments(DATABASE_ID, USER_PLAYLIST_ITEMS_COLLECTION, [
      Query.equal("userId", userId),
      Query.limit(500),
    ]);
    const playlistsNow = await getPlaylists();
    const localIdByCloud = new Map(
      playlistsNow.filter((p) => p.appwriteId).map((p) => [p.appwriteId!, p.id!]),
    );
    const allLocalItems = await getAllPlaylistItems();

    for (const doc of cloudItems.documents) {
      const d = doc as unknown as { $id: string; playlistId: string; episodeId: string };
      const localPlId = localIdByCloud.get(d.playlistId);
      if (!localPlId) continue;
      const items = await getPlaylistItems(localPlId);
      const existing = items.find((i) => i.episodeId === d.episodeId);
      if (!existing) {
        await addPlaylistItem(localPlId, d.episodeId);
        const after = (await getPlaylistItems(localPlId)).find((i) => i.episodeId === d.episodeId);
        if (after?.id) await setPlaylistItemAppwriteId(after.id, d.$id);
      } else if (!existing.appwriteId && existing.id) {
        await setPlaylistItemAppwriteId(existing.id, d.$id);
      }
    }

    const itemsNow = await getAllPlaylistItems();
    const playlistsFinal = await getPlaylists();
    const cloudIdByLocal = new Map(
      playlistsFinal.filter((p) => p.appwriteId).map((p) => [p.id!, p.appwriteId!]),
    );
    void allLocalItems;
    for (const item of itemsNow) {
      if (!item.appwriteId && item.id) {
        const cloudPlId = cloudIdByLocal.get(item.playlistId);
        if (!cloudPlId) continue;
        const created = await databases.createDocument(DATABASE_ID, USER_PLAYLIST_ITEMS_COLLECTION, ID.unique(), {
          userId,
          playlistId: cloudPlId,
          episodeId: item.episodeId,
          addedAt: (item.addedAt instanceof Date ? item.addedAt : new Date(item.addedAt)).toISOString(),
        });
        await setPlaylistItemAppwriteId(item.id, created.$id);
      }
    }
  } catch (error) {
    console.error("Sync playlists failed:", error);
  }
}

export async function syncUserData(userId: string): Promise<void> {
  await Promise.all([syncFavorites(userId), syncHistory(userId), syncPlaylists(userId)]);
}
