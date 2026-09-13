import { useEffect, useState } from "react";
import { Alert, Image, Pressable, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ChevronRight,
  Download as DownloadIcon,
  HardDrive,
  Heart,
  LogOut,
  Monitor,
  Moon,
  RefreshCw,
  Sliders,
  Sparkles,
  Sun,
  Timer,
  Trash2,
  UserCircle,
  Wifi,
  Zap,
} from "lucide-react-native";
import { OAuthProvider } from "appwrite";

import { Screen } from "@/components/Screen";
import { useSettings, type ThemeMode } from "@/context/SettingsContext";
import { usePlayer } from "@/context/PlayerContext";
import { useUser } from "@/context/UserContext";
import { useTranslation } from "@/hooks/useTranslation";
import { getSettings, updateSettings } from "@/lib/db";
import { deleteDownloaded, listDownloads } from "@/lib/downloads";
import { PLAYBACK_SPEEDS, cn, getPlaybackSpeedLabel } from "@/lib/utils";

const LAST_SYNC_KEY = "arewa-last-sync";

const THEME_OPTIONS: { value: ThemeMode; icon: typeof Sun; labelKey: "light" | "dark" | "system" }[] = [
  { value: "light", icon: Sun, labelKey: "light" },
  { value: "dark", icon: Moon, labelKey: "dark" },
  { value: "system", icon: Monitor, labelKey: "system" },
];

const SLEEP_TIMER_OPTIONS = [5, 10, 15, 30, 45, 60];

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { themeMode, setThemeMode, language, setLanguage } = useSettings();
  const { user, login, logout, updateLanguage } = useUser();
  const { rate: playbackSpeed, setSpeed, sleepTimerMinutes, sleepRemaining, setSleepTimer, cancelSleepTimer } =
    usePlayer();
  const [wifiOnly, setWifiOnly] = useState(true);
  const [autoDownload, setAutoDownload] = useState(false);
  const [storageBytes, setStorageBytes] = useState(0);
  const [storageCount, setStorageCount] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const loadStorage = async () => {
    try {
      const dls = await listDownloads();
      setStorageCount(dls.length);
      setStorageBytes(dls.reduce((sum, d) => sum + (d.fileSize ?? 0), 0));
    } catch {
      // best-effort: offline or FS unavailable
    }
    try {
      const ts = await AsyncStorage.getItem(LAST_SYNC_KEY);
      setLastSync(ts);
    } catch {
      // best-effort: ignore
    }
  };

  useEffect(() => {
    getSettings().then((s) => {
      if (s) {
        setWifiOnly(s.downloadWifiOnly);
        setAutoDownload(s.autoDownload);
      }
    });
    loadStorage();
  }, []);

  const toggleWifiOnly = async (value: boolean) => {
    setWifiOnly(value);
    await updateSettings({ downloadWifiOnly: value });
  };

  const toggleAutoDownload = async (value: boolean) => {
    setAutoDownload(value);
    await updateSettings({ autoDownload: value });
  };

  const storageMb = (storageBytes / (1024 * 1024)).toFixed(1);

  const doClearCache = async () => {
    setClearing(true);
    try {
      const dls = await listDownloads();
      for (const d of dls) {
        await deleteDownloaded(d.episodeId);
      }
      await loadStorage();
    } catch {
      // best-effort: keep fire-and-forget
    } finally {
      setClearing(false);
    }
  };

  const handleClearCache = () => {
    Alert.alert(t("clearCache"), `${storageCount} · ${storageMb} MB`, [
      { text: t("cancel"), style: "cancel" },
      { text: t("clearCache"), style: "destructive", onPress: () => void doClearCache() },
    ]);
  };

  const handleLanguageChange = (lang: "en" | "ha") => {
    setLanguage(lang);
    updateLanguage(lang);
  };

  return (
    <Screen>
      {/* Header */}
      <View className="mb-7 mt-2 items-center pt-4">
        <View className="mb-4 h-16 w-16 items-center justify-center rounded-2xl border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800">
          <Sliders size={32} color="#cbd5e1" />
        </View>
        <Text className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {t("settings")}
        </Text>
        <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("customizeExperience")}
        </Text>
      </View>

      {/* Account / User Section */}
      <View className="mb-6">
        <SectionLabel>{t("account")}</SectionLabel>
        <View className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/40">
          {user ? (
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-3">
                <View className="rounded-xl bg-primary/20 p-2">
                  <UserCircle size={24} color="#d4a853" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-bold text-slate-200">{user.name}</Text>
                  <Text className="text-xs text-slate-400">{user.email}</Text>
                </View>
              </View>
              <Pressable onPress={() => logout()} className="rounded-lg bg-rose-500/10 p-2 active:bg-rose-500/20" hitSlop={6}>
                <LogOut size={18} color="#fb7185" />
              </Pressable>
            </View>
          ) : (
            <View className="items-center py-2 text-center">
              <View className="mb-3">
                <UserCircle size={48} color="#64748b" />
              </View>
              <Text className="mb-4 text-center text-sm text-slate-300">{t("syncDescription")}</Text>
              <Pressable
                onPress={() => login(OAuthProvider.Google)}
                className="w-full rounded-xl bg-primary px-6 py-2.5 active:bg-primary/90"
              >
                <Text className="text-center font-medium text-slate-900">
                  {t("continueWithGoogle")}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      {/* Language */}
      <View className="mb-6">
        <SectionLabel>{t("language")}</SectionLabel>
        <View className="flex-row gap-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/40">
          {[
            { id: "en" as const, label: "English" },
            { id: "ha" as const, label: "Hausa" },
          ].map(({ id, label }) => (
            <Pressable
              key={id}
              onPress={() => handleLanguageChange(id)}
              className={cn(
                "flex-1 rounded-xl py-3",
                language === id
                  ? "bg-primary"
                  : "bg-slate-800/50 dark:bg-slate-800",
              )}
            >
              <Text
                className={cn(
                  "text-center text-sm font-medium",
                  language === id ? "text-slate-900" : "text-slate-300 dark:text-slate-300",
                )}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Appearance */}
      <View className="mb-6">
        <SectionLabel>{t("appearance")}</SectionLabel>
        <View className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/40">
          <Text className="mb-4 text-sm font-medium text-slate-300 dark:text-slate-300">
            {t("theme")}
          </Text>
          <View className="flex-row gap-2">
            {THEME_OPTIONS.map(({ value, icon: Icon, labelKey }) => {
              const active = themeMode === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => setThemeMode(value as ThemeMode)}
                  className={cn(
                    "flex-1 flex-col items-center gap-2 py-4",
                    active
                      ? "bg-primary"
                      : "bg-slate-800/50 dark:bg-slate-800",
                  )}
                  style={{ borderRadius: 12 }}
                >
                  <Icon
                    size={20}
                    color={active ? "#0f172a" : "#94a3b8"}
                  />
                  <Text
                    className={cn(
                      "text-xs font-medium",
                      active ? "text-slate-900" : "text-slate-400",
                    )}
                  >
                    {t(labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {/* Playback */}
      <View className="mb-6">
        <SectionLabel>{t("playback")}</SectionLabel>

        <View className="mb-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/40">
          <View className="mb-4 flex-row items-center justify-between">
            <View className="flex-row items-center gap-3">
              <View className="rounded-xl bg-primary/20 p-2">
                <Zap size={20} color="#d4a853" />
              </View>
              <View>
                <Text className="text-sm font-medium text-slate-200 dark:text-slate-100">
                  {t("playbackSpeed")}
                </Text>
                <Text className="text-xs text-slate-500">
                  {t("current")}: {getPlaybackSpeedLabel(playbackSpeed)}
                </Text>
              </View>
            </View>
          </View>

          <View className="flex-row gap-1.5">
            {PLAYBACK_SPEEDS.map((speed) => {
              const active = playbackSpeed === speed;
              return (
                <Pressable
                  key={speed}
                  onPress={() => setSpeed(speed)}
                  className={cn(
                    "flex-1 rounded-xl py-2.5",
                    active ? "bg-primary" : "bg-slate-800/50 dark:bg-slate-800",
                  )}
                >
                  <Text
                    className={cn(
                      "text-center text-xs font-semibold",
                      active ? "text-slate-900" : "text-slate-400",
                    )}
                  >
                    {getPlaybackSpeedLabel(speed)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-800/40">
          <View className="mb-4 flex-row items-center gap-3">
            <View className={cn("rounded-xl p-2", sleepTimerMinutes ? "bg-violet-500/20" : "bg-slate-800")}>
              <Timer size={20} color={sleepTimerMinutes ? "#a78bfa" : "#94a3b8"} />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-medium text-slate-200 dark:text-slate-100">
                {t("sleepTimer")}
              </Text>
              {sleepTimerMinutes !== null && sleepRemaining !== null && (
                <Text className="text-xs font-medium text-violet-400">
                  {Math.ceil(sleepRemaining / 60)} {t("minRemaining")}
                </Text>
              )}
            </View>
          </View>

          <View className="flex-row flex-wrap gap-2">
            {SLEEP_TIMER_OPTIONS.map((minutes) => (
              <Pressable
                key={minutes}
                onPress={() => setSleepTimer(minutes)}
                className={cn(
                  "rounded-xl px-4 py-2",
                  sleepTimerMinutes === minutes
                    ? "bg-violet-500/20"
                    : "bg-slate-800/50 dark:bg-slate-800",
                )}
              >
                <Text
                  className={cn(
                    "text-xs font-medium",
                    sleepTimerMinutes === minutes ? "text-violet-400" : "text-slate-400",
                  )}
                >
                  {minutes} {t("min")}
                </Text>
              </Pressable>
            ))}
            {sleepTimerMinutes !== null && (
              <Pressable
                onPress={() => cancelSleepTimer()}
                className="rounded-xl bg-rose-500/20 px-4 py-2 active:bg-rose-500/30"
              >
                <Text className="text-xs font-medium text-rose-400">{t("cancelTimer")}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {/* Downloads */}
      <View className="mb-6">
        <SectionLabel>{t("downloads")}</SectionLabel>
        <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-800/40">
          <SettingRow
            icon={Wifi}
            iconBg="bg-slate-800"
            iconColor="#94a3b8"
            label={t("wifiOnly")}
            hint={t("saveMobileData")}
            value={wifiOnly}
            onToggle={toggleWifiOnly}
          />
          <View className="h-px bg-slate-100 dark:bg-slate-800" />
          <SettingRow
            icon={DownloadIcon}
            iconBg="bg-slate-800"
            iconColor="#94a3b8"
            label={t("autoDownload")}
            hint={t("newEpisodesFromSubs")}
            value={autoDownload}
            onToggle={toggleAutoDownload}
          />
          <View className="h-px bg-slate-100 dark:bg-slate-800" />
          {/* Storage used meter */}
          <View className="px-4 py-3">
            <View className="flex-row items-center gap-3">
              <View className="rounded-xl bg-slate-800 p-2">
                <HardDrive size={20} color="#94a3b8" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-medium text-slate-200 dark:text-slate-100">
                  {t("storage")}
                </Text>
                <Text className="mt-0.5 text-xs text-slate-500">
                  {storageMb} MB {t("totalUsed")} · {storageCount}
                </Text>
              </View>
              <Pressable
                onPress={handleClearCache}
                disabled={clearing || storageCount === 0}
                className="flex-row items-center gap-1.5 rounded-xl bg-rose-500/10 px-3 py-2 active:bg-rose-500/20"
              >
                <Trash2 size={16} color="#fb7185" />
                <Text className="text-xs font-medium text-rose-400">
                  {t("clearCache")}
                </Text>
              </Pressable>
            </View>
            <View className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <View
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(100, (storageBytes / (200 * 1024 * 1024)) * 100)}%` }}
              />
            </View>
          </View>
          <View className="h-px bg-slate-100 dark:bg-slate-800" />
          {/* Sync status row (best-effort) */}
          <View className="flex-row items-center gap-3 px-4 py-3">
            <View className="rounded-xl bg-slate-800 p-2">
              <RefreshCw size={20} color="#94a3b8" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-medium text-slate-200 dark:text-slate-100">
                Last sync
              </Text>
              <Text className="mt-0.5 text-xs text-slate-500">
                {(() => {
                  if (!lastSync) return "—";
                  const d = new Date(lastSync);
                  return Number.isNaN(d.getTime()) ? lastSync : d.toLocaleString();
                })()}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Support */}
      <View className="mb-6">
        <SectionLabel>{t("support")}</SectionLabel>
        <Pressable
          onPress={() => router.push("/donate")}
          className="flex-row items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 active:opacity-80 dark:border-slate-800 dark:bg-slate-800/40"
        >
          <View className="flex-row items-center gap-3">
            <View className="rounded-xl bg-rose-500/20 p-2">
              <Heart size={20} color="#f43f5e" />
            </View>
            <View>
              <Text className="text-sm font-medium text-slate-200 dark:text-slate-100">
                {t("donate")}
              </Text>
              <Text className="text-xs text-slate-500">{t("supportDevelopment")}</Text>
            </View>
          </View>
          <ChevronRight size={20} color="#64748b" />
        </Pressable>
      </View>

      {/* About */}
      <View className="mb-6">
        <SectionLabel>{t("about")}</SectionLabel>
        <View className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-800/40">
          <View className="mb-4 flex-row items-center gap-4">
            <Image
              source={require("../../assets/images/logo.png")}
              className="h-14 w-14 rounded-2xl"
              accessibilityLabel="Arewa Central"
            />
            <View>
              <Text className="text-lg font-bold text-slate-100 dark:text-slate-100">
                Arewa Central
              </Text>
              <Text className="text-xs text-slate-500">
                {t("version")} 1.0.0
              </Text>
            </View>
          </View>

          <View className="rounded-xl bg-slate-100 p-4 dark:bg-slate-800/50">
            <View className="mb-2 flex-row items-center gap-2">
              <Sparkles size={16} color="#d4a853" />
              <Text className="text-sm font-medium text-primary">{t("freeNoAds")}</Text>
            </View>
            <Text className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {t("aboutDescription")}
            </Text>
          </View>
        </View>
      </View>
    </Screen>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
      {children}
    </Text>
  );
}

function SettingRow({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  hint,
  value,
  onToggle,
}: {
  icon: typeof Wifi;
  iconBg: string;
  iconColor: string;
  label: string;
  hint: string;
  value: boolean;
  onToggle: (value: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between px-4 py-3">
      <View className="flex-row flex-1 items-center gap-3">
        <View className={cn("rounded-xl p-2", iconBg)}>
          <Icon size={20} color={iconColor} />
        </View>
        <View className="flex-1 pr-3">
          <Text className="text-sm font-medium text-slate-200 dark:text-slate-100">{label}</Text>
          <Text className="mt-0.5 text-xs text-slate-500">{hint}</Text>
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        thumbColor="#0f172a"
        trackColor={{ false: "#334155", true: "#d4a853" }}
      />
    </View>
  );
}