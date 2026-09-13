import { Tabs } from "expo-router";
import {
  Download,
  Home,
  Library,
  Search,
  Settings,
} from "lucide-react-native";
import { View } from "react-native";

import { MiniPlayer } from "@/components/MiniPlayer";
import { useSettings } from "@/context/SettingsContext";
import { useTranslation } from "@/hooks/useTranslation";
import { palette } from "@/theme/palette";

export default function TabsLayout() {
  const { t } = useTranslation();
  const { isDark } = useSettings();

  const active = palette.primary;
  const inactive = isDark ? palette.slate[400] : palette.slate[500];
  const barBg = isDark ? palette.slate[900] : "#ffffff";
  const barBorder = isDark ? palette.slate[800] : palette.slate[200];

  return (
    <View className="flex-1">
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: active,
          tabBarInactiveTintColor: inactive,
          tabBarStyle: {
            backgroundColor: barBg,
            borderTopColor: barBorder,
            borderTopWidth: 1,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: "500" },
        }}
      >
      <Tabs.Screen
        name="index"
        options={{
          title: t("home"),
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t("search"),
          tabBarIcon: ({ color, size }) => <Search size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: t("library"),
          tabBarIcon: ({ color, size }) => <Library size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="downloads"
        options={{
          title: t("downloads"),
          tabBarIcon: ({ color, size }) => <Download size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("settings"),
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
        }}
      />
      </Tabs>
      <MiniPlayer />
    </View>
  );
}