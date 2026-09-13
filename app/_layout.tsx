import "../src/global.css";

import { useEffect } from "react";
import { View } from "react-native";
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
import { UserProvider } from "@/context/UserContext";
import { OfflineBanner } from "@/components/OfflineBanner";

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