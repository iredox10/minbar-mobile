import "../src/global.css";

import { useCallback, useEffect } from "react";
import { AppState, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { Amiri_400Regular, Amiri_700Bold } from "@expo-google-fonts/amiri";

import { SettingsProvider, useSettings } from "@/context/SettingsContext";
import { PlayerProvider } from "@/context/PlayerContext";
import { UserProvider, useUser } from "@/context/UserContext";
import { OfflineBanner } from "@/components/OfflineBanner";
import { runAutoDownload } from "@/lib/downloads";

SplashScreen.preventAutoHideAsync().catch(() => {});

/** Maps `arewa://<resource>/<id>` deep links to expo-router routes. */
function resolveDeepLink(url: string): { pathname: string; params: Record<string, string> } | null {
  let path = Linking.parse(url).path ?? "";
  // Handle Expo dev URLs shaped like `exp://…/--/episodes/<id>`.
  path = path.replace(/^--\//, "").replace(/^\//, "");
  const [resource, rawId] = path.split("/");
  if (!resource || !rawId) return null;
  const id = decodeURIComponent(rawId);
  switch (resource) {
    case "episodes":
      return { pathname: "/episodes/[id]", params: { id } };
    case "series":
      return { pathname: "/series/[id]", params: { id } };
    case "speakers":
      return { pathname: "/speakers/[slug]", params: { slug: id } };
    case "playlists":
      return { pathname: "/playlists/[id]", params: { id } };
    default:
      // Auth URLs (`auth`, `auth-callback`) are handled by UserProvider /
      // the auth-callback route — ignore them here.
      return null;
  }
}

/**
 * AutoDownloadOnForeground — drives the "Auto download / new episodes from subs"
 * setting. Runs once the followed-speaker list is loaded and again every time the
 * app comes back to the foreground. `runAutoDownload` is a no-op when the setting
 * is off / nothing is followed / the device is offline or off wifi, and it never
 * throws, so this can be fired without any extra guarding.
 */
function AutoDownloadOnForeground() {
  const { following, loading } = useUser();

  const trigger = useCallback(() => {
    runAutoDownload(following).catch(() => {});
  }, [following]);

  useEffect(() => {
    // Wait for UserProvider to hydrate `following` from cache/session so a cold
    // start does not run with an empty list.
    if (loading || following.length === 0) return;
    trigger();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") trigger();
    });
    return () => subscription.remove();
  }, [loading, following.length, trigger]);

  return null;
}

function RootNavigator() {
  const { isDark } = useSettings();
  const router = useRouter();

  useEffect(() => {
    const handleUrl = (url: string) => {
      const target = resolveDeepLink(url);
      if (target) router.push(target as never);
    };
    // Cold start: app launched from a deep link.
    Linking.getInitialURL()
      .then((url) => {
        if (url) handleUrl(url);
      })
      .catch(() => {});
    // Warm: app already running when the link arrives.
    const subscription = Linking.addEventListener("url", (event) => {
      handleUrl(event.url);
    });
    return () => {
      subscription.remove();
    };
  }, [router]);

  return (
    <View className={isDark ? "dark flex-1 bg-slate-900" : "flex-1 bg-slate-100"}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <AutoDownloadOnForeground />
      <OfflineBanner />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth-callback" />
        <Stack.Screen name="player" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Amiri_400Regular,
    Amiri_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SettingsProvider>
      <SafeAreaProvider>
        <UserProvider>
          <PlayerProvider>
            <RootNavigator />
          </PlayerProvider>
        </UserProvider>
      </SafeAreaProvider>
    </SettingsProvider>
  );
}