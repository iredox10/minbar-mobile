import { Permission, Role } from "appwrite";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { databases, DATABASE_ID } from "./appwrite";

export const ANALYTICS_COLLECTION = "analytics";

export type AnalyticsEventType =
  | "play_start"
  | "play_complete"
  | "play_pause"
  | "download_start"
  | "download_complete"
  | "search"
  | "favorite_add"
  | "favorite_remove"
  | "radio_start"
  | "dua_view";

export interface AnalyticsEvent {
  eventType: AnalyticsEventType;
  itemId?: string;
  itemType?: "episode" | "series" | "speaker" | "radio" | "dua";
  itemTitle?: string;
  duration?: number;
  userId?: string;
  sessionId?: string;
  timestamp?: string;
}

const SESSION_KEY = "analytics_session_id";
const USER_ID_KEY = "user_id";

let sessionIdCache: string | null = null;

async function getSessionId(): Promise<string> {
  if (sessionIdCache) return sessionIdCache;
  let id = await AsyncStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await AsyncStorage.setItem(SESSION_KEY, id);
  }
  sessionIdCache = id;
  return id;
}

export async function trackEvent(event: AnalyticsEvent): Promise<void> {
  try {
    const userId = (await AsyncStorage.getItem(USER_ID_KEY)) || undefined;

    await databases.createDocument(
      DATABASE_ID,
      ANALYTICS_COLLECTION,
      "unique()",
      {
        ...event,
        userId,
        sessionId: await getSessionId(),
        timestamp: new Date().toISOString(),
      },
      [
        Permission.read(Role.any()),
        Permission.write(Role.any()),
        Permission.update(Role.any()),
        Permission.delete(Role.any()),
      ],
    );
  } catch (error) {
    console.error("Failed to track analytics event:", error);
  }
}

export function trackPlayStart(itemId: string, itemType: "episode" | "radio", itemTitle: string): void {
  trackEvent({ eventType: "play_start", itemId, itemType, itemTitle });
}

export function trackPlayComplete(itemId: string, itemType: "episode" | "radio", itemTitle: string, duration: number): void {
  trackEvent({ eventType: "play_complete", itemId, itemType, itemTitle, duration });
}

export function trackDownload(itemId: string, itemTitle: string): void {
  trackEvent({ eventType: "download_complete", itemId, itemType: "episode", itemTitle });
}

export function trackSearch(query: string): void {
  trackEvent({ eventType: "search", itemTitle: query });
}

export function trackFavoriteAdd(itemId: string, itemType: "episode" | "series" | "dua", itemTitle: string): void {
  trackEvent({ eventType: "favorite_add", itemId, itemType, itemTitle });
}

export function trackRadioStart(stationId: string, stationName: string): void {
  trackEvent({ eventType: "radio_start", itemId: stationId, itemType: "radio", itemTitle: stationName });
}

export function trackDuaView(duaId: string, duaTitle: string): void {
  trackEvent({ eventType: "dua_view", itemId: duaId, itemType: "dua", itemTitle: duaTitle });
}