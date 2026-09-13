import type { ComponentType } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  Activity,
  Bookmark,
  BookOpen,
  Heart,
  History,
  Layers,
  ListMusic,
  Radio,
  Users,
} from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

interface LibraryEntry {
  key: string;
  title: string;
  description: string;
  icon: ComponentType<{ size?: number; color?: string }>;
  route?: { pathname: string; params?: Record<string, string> };
}

const ROUTES: Record<string, LibraryEntry["route"]> = {
  favorites: { pathname: "/favorites" },
  playlists: { pathname: "/playlists" },
  history: { pathname: "/history" },
  bookmarks: { pathname: "/bookmarks" },
  speakers: { pathname: "/speakers" },
  series: { pathname: "/series" },
  latest: { pathname: "/latest" },
  radio: { pathname: "/radio" },
  duas: { pathname: "/duas" },
  stats: { pathname: "/stats" },
};

export default function LibraryScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const entries: LibraryEntry[] = [
    { key: "favorites", title: t("favorites"), description: t("favoritesDesc"), icon: Heart, route: ROUTES.favorites },
    { key: "playlists", title: t("playlists"), description: t("playlistsDesc"), icon: ListMusic, route: ROUTES.playlists },
    { key: "history", title: t("history"), description: t("historyDesc"), icon: History, route: ROUTES.history },
    { key: "bookmarks", title: t("bookmarks"), description: t("bookmarksDesc"), icon: Bookmark, route: ROUTES.bookmarks },
    { key: "speakers", title: t("speakers"), description: t("speakersDesc"), icon: Users, route: ROUTES.speakers },
    { key: "series", title: t("series"), description: t("seriesDesc"), icon: Layers, route: ROUTES.series },
    { key: "latest", title: t("latestEpisodes"), description: t("latestEpisodesDesc"), icon: BookOpen, route: ROUTES.latest },
    { key: "radio", title: t("radio"), description: t("liveRadioDesc"), icon: Radio, route: ROUTES.radio },
    { key: "duas", title: t("duas"), description: t("duasDesc"), icon: BookOpen, route: ROUTES.duas },
    { key: "stats", title: t("listeningStats"), description: t("resumeWhereYouLeftOff"), icon: Activity, route: ROUTES.stats },
  ];

  const go = (route?: LibraryEntry["route"], fallbackTitle?: string) => {
    if (route) {
      router.push(route as never);
    } else {
      router.push({ pathname: "/coming-soon", params: { title: fallbackTitle ?? "" } });
    }
  };

  return (
    <Screen>
      <View className="mb-4 mt-2">
        <Text className="text-2xl font-bold text-slate-900 dark:text-white">
          {t("myLibrary")}
        </Text>
        <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("allContent")}
        </Text>
      </View>

      <View className="flex-row flex-wrap justify-between gap-y-3">
        {entries.map(({ key, title, description, icon: Icon, route }) => (
          <Pressable
            key={key}
            onPress={() => go(route, title)}
            className="w-[48%] rounded-2xl border border-slate-200 bg-white p-4 active:opacity-80 dark:border-slate-800 dark:bg-slate-800/40"
          >
            <View className="mb-2 h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Icon size={20} color="#d4a853" />
            </View>
            <Text className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">
              {title}
            </Text>
            <Text className={cn("mt-0.5 text-xs text-slate-500 dark:text-slate-400")}>
              {description}
            </Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}