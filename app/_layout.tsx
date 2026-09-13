import "../src/global.css";

import { useEffect } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
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

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const { isDark } = useSettings();

  return (
    <View className={isDark ? "dark flex-1 bg-slate-900" : "flex-1 bg-slate-100"}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
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